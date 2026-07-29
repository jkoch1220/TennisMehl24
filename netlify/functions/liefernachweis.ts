/**
 * liefernachweis.ts — Netlify Function für den digitalen QR-Liefernachweis
 *
 * Der Speditionsfahrer scannt den QR-Code auf dem Lieferschein und bestätigt
 * die Lieferung über die öffentliche Seite /liefernachweis/:projektId?token=...
 * OHNE Login. Der anonyme Client greift NIE direkt auf Appwrite zu — alle
 * Lese-/Schreiboperationen laufen über diese Function (Appwrite REST-API mit
 * Server-API-Key aus der Umgebung, Muster wie die übrigen Functions).
 *
 * Endpunkte:
 *   GET  ?projektId=...&token=...   → kompakte Auftragsdaten (ohne Preise)
 *   POST { projektId, token, fotoBase64, ... }
 *        → Bestätigung: archiviert Liefernachweis-PDF (GoBD) in
 *          bestellabwicklung_dokumente, legt Foto/Unterschrift im Bucket
 *          liefernachweis-dateien ab und setzt dispoStatus='geliefert' +
 *          liefernachweisAm am Projekt (im data-JSON).
 *
 * Sicherheit:
 *   - Token-Gleichheit (timing-safe) + Ablauf nach 30 Tagen
 *   - Idempotenz: bereits bestätigte Lieferungen werden NICHT erneut
 *     verarbeitet (200 mit bereitsBestaetigt: true)
 *   - Best-Effort-Rate-Limit pro IP (In-Memory)
 *   - Testmodus (testModus: true): kein Statuswechsel, keine Archivierung
 */

import { Handler, HandlerEvent } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { jsPDF } from 'jspdf';

// === Konfiguration (identisch zu src/config/appwrite.ts) ===
const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE_COLLECTION_ID = 'projekte';
const DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';
const DOKUMENTE_BUCKET_ID = 'bestellabwicklung_dateien';
const LIEFERNACHWEIS_BUCKET_ID = 'liefernachweis-dateien';

const TOKEN_GUELTIGKEIT_TAGE = 30;
const MAX_FOTO_BASE64_LAENGE = 4_500_000; // ~3,3 MB binär
const MAX_UNTERSCHRIFT_BASE64_LAENGE = 600_000; // ~450 KB binär

const APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || '';
const APPWRITE_PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || '';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';

// === Typen ===
interface ProjektDaten {
  projektName?: string;
  kundenname?: string;
  kundenstrasse?: string;
  kundenPlzOrt?: string;
  kundennummer?: string;
  lieferadresse?: { strasse?: string; plz?: string; ort?: string };
  lieferscheinnummer?: string;
  dispoStatus?: string;
  geplantesDatum?: string;
  kommuniziertesDatum?: string;
  liefergewicht?: number;
  anzahlPaletten?: number;
  dispoAnsprechpartner?: { name?: string; telefon?: string };
  liefernachweisToken?: string;
  liefernachweisTokenErstelltAm?: string;
  liefernachweisAm?: string;
  liefernachweis?: Record<string, unknown>;
  lieferscheinDaten?: string;
  auftragsbestaetigungsDaten?: string;
  [key: string]: unknown;
}

interface ProjektDokument {
  $id: string;
  data?: string;
  [key: string]: unknown;
}

interface PositionOhnePreis {
  bezeichnung: string;
  menge: number;
  einheit: string;
}

interface BestaetigungsRequest {
  projektId?: string;
  token?: string;
  fotoBase64?: string; // JPEG, Pflicht (Data-URL oder roher Base64-String)
  fahrerName?: string; // Name des Fahrers (von der Seite als Pflichtfeld erhoben)
  unterschriftBase64?: string; // PNG, optional
  unterzeichnerName?: string; // optional
  geo?: { lat?: number; lng?: number; genauigkeitM?: number };
  testModus?: boolean;
}

// === Best-Effort-Rate-Limiter (In-Memory pro Function-Instanz) ===
const RATE_FENSTER_MS = 5 * 60 * 1000;
const RATE_MAX_GESAMT = 40; // GET + POST pro IP und Fenster
const RATE_MAX_POST = 8; // POST pro IP und Fenster
const rateMap = new Map<string, { gesamt: number; post: number; reset: number }>();

const pruefeRateLimit = (ip: string, istPost: boolean): boolean => {
  const jetzt = Date.now();
  let eintrag = rateMap.get(ip);
  if (!eintrag || jetzt > eintrag.reset) {
    eintrag = { gesamt: 0, post: 0, reset: jetzt + RATE_FENSTER_MS };
    rateMap.set(ip, eintrag);
  }
  eintrag.gesamt += 1;
  if (istPost) eintrag.post += 1;
  // Map nicht unbegrenzt wachsen lassen
  if (rateMap.size > 5000) rateMap.clear();
  return eintrag.gesamt <= RATE_MAX_GESAMT && (!istPost || eintrag.post <= RATE_MAX_POST);
};

// === Appwrite REST-Helpers (Server-Key, kein SDK nötig) ===
const appwriteHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  'X-Appwrite-Project': APPWRITE_PROJECT_ID,
  'X-Appwrite-Key': APPWRITE_API_KEY,
});

const ladeProjekt = async (projektId: string): Promise<ProjektDokument | null> => {
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${DATABASE_ID}/collections/${PROJEKTE_COLLECTION_ID}/documents/${encodeURIComponent(projektId)}`,
    { headers: appwriteHeaders() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Projekt konnte nicht geladen werden (HTTP ${res.status})`);
  return (await res.json()) as ProjektDokument;
};

const aktualisiereProjekt = async (
  projektId: string,
  felder: Record<string, unknown>
): Promise<void> => {
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${DATABASE_ID}/collections/${PROJEKTE_COLLECTION_ID}/documents/${encodeURIComponent(projektId)}`,
    {
      method: 'PATCH',
      headers: appwriteHeaders(),
      body: JSON.stringify({ data: felder }),
    }
  );
  if (!res.ok) {
    const fehler = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(fehler.message || `Projekt-Update fehlgeschlagen (HTTP ${res.status})`);
  }
};

const existiertLiefernachweisDokument = async (projektId: string): Promise<boolean> => {
  const queries = [
    JSON.stringify({ method: 'equal', attribute: 'projektId', values: [projektId] }),
    JSON.stringify({ method: 'equal', attribute: 'dokumentTyp', values: ['liefernachweis'] }),
    JSON.stringify({ method: 'limit', values: [1] }),
  ];
  const params = queries.map((q) => `queries[]=${encodeURIComponent(q)}`).join('&');
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${DATABASE_ID}/collections/${DOKUMENTE_COLLECTION_ID}/documents?${params}`,
    { headers: appwriteHeaders() }
  );
  if (!res.ok) return false; // Best effort — Hauptguard ist liefernachweisAm
  const json = (await res.json()) as { total?: number; documents?: unknown[] };
  return (json.total ?? json.documents?.length ?? 0) > 0;
};

const erstelleDokumentEintrag = async (
  daten: Record<string, unknown>
): Promise<{ $id: string }> => {
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${DATABASE_ID}/collections/${DOKUMENTE_COLLECTION_ID}/documents`,
    {
      method: 'POST',
      headers: appwriteHeaders(),
      body: JSON.stringify({ documentId: 'unique()', data: daten }),
    }
  );
  if (!res.ok) {
    const fehler = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(fehler.message || `Dokument-Eintrag fehlgeschlagen (HTTP ${res.status})`);
  }
  return (await res.json()) as { $id: string };
};

const ladeDateiHoch = async (
  bucketId: string,
  dateiname: string,
  inhalt: Uint8Array,
  mimeType: string
): Promise<{ $id: string } | null> => {
  const form = new FormData();
  form.append('fileId', 'unique()');
  form.append('file', new Blob([inhalt as BlobPart], { type: mimeType }), dateiname);
  const res = await fetch(`${APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files`, {
    method: 'POST',
    headers: {
      'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      'X-Appwrite-Key': APPWRITE_API_KEY,
    },
    body: form,
  });
  if (!res.ok) {
    const fehler = (await res.json().catch(() => ({}))) as { message?: string };
    console.warn(`Upload in Bucket ${bucketId} fehlgeschlagen:`, fehler.message || res.status);
    return null;
  }
  return (await res.json()) as { $id: string };
};

// === Token-Validierung ===
const tokenGleich = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

const validiereToken = (
  daten: ProjektDaten,
  token: string
): { ok: true } | { ok: false; grund: string } => {
  if (!daten.liefernachweisToken) {
    return { ok: false, grund: 'Für diesen Lieferschein ist keine digitale Bestätigung hinterlegt.' };
  }
  if (!tokenGleich(daten.liefernachweisToken, token)) {
    return { ok: false, grund: 'Der Link ist ungültig.' };
  }
  const erstellt = daten.liefernachweisTokenErstelltAm
    ? new Date(daten.liefernachweisTokenErstelltAm).getTime()
    : NaN;
  if (
    Number.isNaN(erstellt) ||
    Date.now() > erstellt + TOKEN_GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000
  ) {
    return { ok: false, grund: 'Der Link ist abgelaufen. Bitte den Lieferschein-Aussteller kontaktieren.' };
  }
  return { ok: true };
};

// === Hilfsfunktionen ===
const parseProjektDaten = (dokument: ProjektDokument): ProjektDaten => {
  if (dokument.data && typeof dokument.data === 'string') {
    try {
      return JSON.parse(dokument.data) as ProjektDaten;
    } catch {
      // fällt durch auf das rohe Dokument
    }
  }
  return dokument as unknown as ProjektDaten;
};

/** Positionsliste OHNE Preise: bevorzugt Lieferschein-, sonst AB-Daten */
const extrahierePositionen = (daten: ProjektDaten): PositionOhnePreis[] => {
  try {
    if (daten.lieferscheinDaten) {
      const ls = JSON.parse(daten.lieferscheinDaten) as {
        positionen?: { artikel?: string; menge?: number; einheit?: string }[];
      };
      if (ls.positionen?.length) {
        return ls.positionen.map((p) => ({
          bezeichnung: p.artikel || '',
          menge: p.menge ?? 0,
          einheit: p.einheit || '',
        }));
      }
    }
  } catch {
    // ignorieren, Fallback auf AB
  }
  try {
    if (daten.auftragsbestaetigungsDaten) {
      const ab = JSON.parse(daten.auftragsbestaetigungsDaten) as {
        positionen?: { bezeichnung?: string; menge?: number; einheit?: string; istBedarfsposition?: boolean }[];
      };
      if (ab.positionen?.length) {
        return ab.positionen
          .filter((p) => !p.istBedarfsposition)
          .map((p) => ({
            bezeichnung: p.bezeichnung || '',
            menge: p.menge ?? 0,
            einheit: p.einheit || '',
          }));
      }
    }
  } catch {
    // keine Positionen verfügbar
  }
  return [];
};

const bereinigeBase64 = (input: string): string =>
  input.replace(/^data:[a-zA-Z0-9/+.-]+;base64,/, '').replace(/\s/g, '');

const lieferadresseText = (daten: ProjektDaten): string => {
  if (daten.lieferadresse?.strasse || daten.lieferadresse?.ort) {
    const teile = [
      daten.lieferadresse.strasse,
      [daten.lieferadresse.plz, daten.lieferadresse.ort].filter(Boolean).join(' '),
    ].filter(Boolean);
    return teile.join(', ');
  }
  return [daten.kundenstrasse, daten.kundenPlzOrt].filter(Boolean).join(', ');
};

const formatDatumZeit = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });
};

/**
 * Bild ins PDF einbetten. WICHTIG: Im Node-Build von jsPDF müssen Bilddaten als
 * Uint8Array übergeben werden (Strings werden als Dateipfade interpretiert!).
 * Höhe wird aus dem Seitenverhältnis berechnet (getImageProperties).
 */
const bettePdfBildEin = (
  doc: jsPDF,
  bytes: Uint8Array,
  format: 'JPEG' | 'PNG',
  x: number,
  y: number,
  maxBreite: number,
  maxHoehe: number
): void => {
  const props = doc.getImageProperties(bytes);
  const skalierung = Math.min(maxBreite / props.width, maxHoehe / props.height);
  const breite = props.width * skalierung;
  const hoehe = props.height * skalierung;
  doc.addImage(bytes, format, x, y, breite, hoehe);
};

// === Liefernachweis-PDF (serverseitig mit jsPDF in Node) ===
const generiereLiefernachweisPdf = (options: {
  daten: ProjektDaten;
  positionen: PositionOhnePreis[];
  zeitstempel: string;
  fahrerName?: string;
  unterzeichnerName?: string;
  geo?: { lat?: number; lng?: number; genauigkeitM?: number };
  fotoJpegBytes: Uint8Array;
  unterschriftPngBytes?: Uint8Array;
}): Uint8Array => {
  const { daten, positionen, zeitstempel, fahrerName, unterzeichnerName, geo } = options;
  const doc = new jsPDF();
  const links = 20;
  let y = 20;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Digitaler Liefernachweis', links, y);
  doc.setFont('helvetica', 'normal');
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Bestätigt per QR-Scan durch den Fahrer beim Abladen', links, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  const zeile = (label: string, wert: string) => {
    if (!wert) return;
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, links, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(wert, 120) as string[];
    doc.text(wrapped, links + 55, y);
    y += wrapped.length * 5 + 1;
  };

  zeile('Kunde', daten.kundenname || '');
  zeile('Kundennummer', daten.kundennummer || '');
  zeile('Lieferadresse', lieferadresseText(daten));
  zeile('Lieferschein-Nr.', daten.lieferscheinnummer || '');
  zeile('Bestätigt am', formatDatumZeit(zeitstempel));
  zeile('Fahrer', fahrerName || '');
  zeile('Unterzeichner', unterzeichnerName || '');
  if (typeof geo?.lat === 'number' && typeof geo?.lng === 'number') {
    const genauigkeit =
      typeof geo.genauigkeitM === 'number' ? ` (±${Math.round(geo.genauigkeitM)} m)` : '';
    zeile('GPS-Position', `${geo.lat.toFixed(6)}, ${geo.lng.toFixed(6)}${genauigkeit}`);
  }

  // Positionsliste OHNE Preise
  if (positionen.length > 0) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Gelieferte Positionen (ohne Preise):', links, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    for (const pos of positionen) {
      const text = `• ${pos.bezeichnung} — ${pos.menge} ${pos.einheit}`;
      const wrapped = doc.splitTextToSize(text, 170) as string[];
      if (y + wrapped.length * 5 > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(wrapped, links, y);
      y += wrapped.length * 5;
    }
  }

  // Foto (Pflicht) — eigene Seite, damit es groß und prüfbar bleibt
  doc.addPage();
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Foto der abgeladenen Ware', links, 20);
  doc.setFont('helvetica', 'normal');
  try {
    bettePdfBildEin(doc, options.fotoJpegBytes, 'JPEG', links, 28, 170, 240);
  } catch {
    doc.setFontSize(10);
    doc.text('Foto konnte nicht eingebettet werden (liegt separat im Storage vor).', links, 32);
  }

  // Unterschrift (optional)
  if (options.unterschriftPngBytes) {
    doc.addPage();
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Unterschrift', links, 20);
    doc.setFont('helvetica', 'normal');
    if (unterzeichnerName) {
      doc.setFontSize(10);
      doc.text(`Name: ${unterzeichnerName}`, links, 27);
    }
    try {
      bettePdfBildEin(doc, options.unterschriftPngBytes, 'PNG', links, 34, 100, 60);
    } catch {
      doc.setFontSize(10);
      doc.text('Unterschrift konnte nicht eingebettet werden (liegt separat im Storage vor).', links, 34);
    }
  }

  return new Uint8Array(doc.output('arraybuffer'));
};

// === Handler ===
const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server nicht konfiguriert (Appwrite-Umgebungsvariablen fehlen).' }),
    };
  }

  const ip =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    'unbekannt';

  if (!pruefeRateLimit(ip, event.httpMethod === 'POST')) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Zu viele Anfragen. Bitte in ein paar Minuten erneut versuchen.' }),
    };
  }

  try {
    // ============ GET: Auftragsdaten (validiert Token) ============
    if (event.httpMethod === 'GET') {
      const projektId = event.queryStringParameters?.projektId || '';
      const token = event.queryStringParameters?.token || '';
      if (!projektId || !token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'projektId und token sind erforderlich.' }),
        };
      }

      const dokument = await ladeProjekt(projektId);
      if (!dokument) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Auftrag nicht gefunden.' }),
        };
      }
      const daten = parseProjektDaten(dokument);
      const validierung = validiereToken(daten, token);
      if (!validierung.ok) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: validierung.grund }) };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          auftrag: {
            kundenname: daten.kundenname || '',
            lieferadresse: lieferadresseText(daten),
            lieferscheinnummer: daten.lieferscheinnummer || '',
            geplantesDatum: daten.kommuniziertesDatum || daten.geplantesDatum || null,
            liefergewicht: daten.liefergewicht ?? null,
            anzahlPaletten: daten.anzahlPaletten ?? null,
            positionen: extrahierePositionen(daten),
            bereitsBestaetigt: Boolean(daten.liefernachweisAm),
            liefernachweisAm: daten.liefernachweisAm || null,
          },
        }),
      };
    }

    // ============ POST: Lieferung bestätigen ============
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Methode nicht erlaubt.' }),
      };
    }

    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Request-Body fehlt.' }) };
    }

    const request = JSON.parse(event.body) as BestaetigungsRequest;
    const { projektId, token } = request;
    if (!projektId || !token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'projektId und token sind erforderlich.' }),
      };
    }

    const fotoBase64 = request.fotoBase64 ? bereinigeBase64(request.fotoBase64) : '';
    if (!fotoBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Ein Foto der abgeladenen Ware ist erforderlich.' }),
      };
    }
    if (fotoBase64.length > MAX_FOTO_BASE64_LAENGE) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Das Foto ist zu groß. Bitte erneut aufnehmen.' }),
      };
    }
    const unterschriftBase64 = request.unterschriftBase64
      ? bereinigeBase64(request.unterschriftBase64)
      : undefined;
    if (unterschriftBase64 && unterschriftBase64.length > MAX_UNTERSCHRIFT_BASE64_LAENGE) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Die Unterschrift ist zu groß.' }),
      };
    }

    const dokument = await ladeProjekt(projektId);
    if (!dokument) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Auftrag nicht gefunden.' }) };
    }
    const daten = parseProjektDaten(dokument);
    const validierung = validiereToken(daten, token);
    if (!validierung.ok) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: validierung.grund }) };
    }

    // Idempotenz: bereits bestätigt → 200, KEINE Änderungen
    if (daten.liefernachweisAm || (await existiertLiefernachweisDokument(projektId))) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          bereitsBestaetigt: true,
          liefernachweisAm: daten.liefernachweisAm || null,
        }),
      };
    }

    const zeitstempel = new Date().toISOString();
    const geo =
      typeof request.geo?.lat === 'number' && typeof request.geo?.lng === 'number'
        ? {
            lat: request.geo.lat,
            lng: request.geo.lng,
            ...(typeof request.geo.genauigkeitM === 'number'
              ? { genauigkeitM: request.geo.genauigkeitM }
              : {}),
          }
        : undefined;
    const fahrerName = request.fahrerName?.trim() || undefined;
    const unterzeichnerName = request.unterzeichnerName?.trim() || undefined;
    const fotoBytes = Uint8Array.from(Buffer.from(fotoBase64, 'base64'));
    const unterschriftBytes = unterschriftBase64
      ? Uint8Array.from(Buffer.from(unterschriftBase64, 'base64'))
      : undefined;

    // ---- TESTMODUS: alles durchlaufen, aber KEIN Statuswechsel, KEINE Archivierung ----
    if (request.testModus === true) {
      // PDF probeweise erzeugen (validiert die Bilddaten), aber nichts speichern
      generiereLiefernachweisPdf({
        daten,
        positionen: extrahierePositionen(daten),
        zeitstempel,
        fahrerName,
        unterzeichnerName,
        geo,
        fotoJpegBytes: fotoBytes,
        unterschriftPngBytes: unterschriftBytes,
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          testModus: true,
          hinweis:
            '[TEST] Bestätigung erfolgreich durchlaufen — es wurde NICHTS gespeichert und kein Status geändert.',
        }),
      };
    }

    // ---- 1. Foto + Unterschrift im Storage-Bucket ablegen (Best Effort) ----
    const jahr = new Date().getFullYear();
    const basisname = `Liefernachweis ${daten.kundenname || projektId} ${jahr}`.replace(
      /[<>:"/\\|?*]/g,
      ''
    );
    const fotoDatei = await ladeDateiHoch(
      LIEFERNACHWEIS_BUCKET_ID,
      `${basisname} Foto.jpg`,
      fotoBytes,
      'image/jpeg'
    );
    let unterschriftDatei: { $id: string } | null = null;
    if (unterschriftBytes) {
      unterschriftDatei = await ladeDateiHoch(
        LIEFERNACHWEIS_BUCKET_ID,
        `${basisname} Unterschrift.png`,
        unterschriftBytes,
        'image/png'
      );
    }

    // ---- 2. Liefernachweis-PDF erzeugen und GoBD-konform archivieren ----
    const positionen = extrahierePositionen(daten);
    const pdfBytes = generiereLiefernachweisPdf({
      daten,
      positionen,
      zeitstempel,
      fahrerName,
      unterzeichnerName,
      geo,
      fotoJpegBytes: fotoBytes,
      unterschriftPngBytes: unterschriftBytes,
    });
    const pdfDatei = await ladeDateiHoch(
      DOKUMENTE_BUCKET_ID,
      `${basisname}.pdf`,
      pdfBytes,
      'application/pdf'
    );
    if (!pdfDatei) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'Der Liefernachweis konnte nicht archiviert werden. Bitte erneut versuchen.',
        }),
      };
    }

    const archivDaten = {
      art: 'liefernachweis',
      kundenname: daten.kundenname || '',
      lieferadresse: lieferadresseText(daten),
      lieferscheinnummer: daten.lieferscheinnummer || '',
      bestaetigtAm: zeitstempel,
      fahrerName: fahrerName || null,
      unterzeichnerName: unterzeichnerName || null,
      geo: geo || null,
      positionen, // ohne Preise
      fotoDateiId: fotoDatei?.$id || null,
      unterschriftDateiId: unterschriftDatei?.$id || null,
      quelle: 'qr-scan-fahrer',
    };

    const archivEintrag = await erstelleDokumentEintrag({
      projektId,
      dokumentTyp: 'liefernachweis',
      dokumentNummer: `LN-${daten.lieferscheinnummer || projektId.slice(0, 8)}`,
      dateiId: pdfDatei.$id,
      dateiname: `${basisname}.pdf`,
      istFinal: true, // Nachweis ist unveränderbar (GoBD)
      daten: JSON.stringify(archivDaten),
    });

    // ---- 3. Projekt aktualisieren: Status 'geliefert' + dispoStatus + liefernachweisAm ----
    let statusGesetzt = true;
    try {
      // Der Projektstatus rückt auf 'geliefert' vor — die Ware ist raus, die Rechnung steht aus.
      // Guard gegen Rückschritt: ist bereits eine Rechnung gestellt oder bezahlt (oder das Projekt
      // verloren), bleibt der Status stehen. Ein spät gescannter QR darf keine Rechnung entwerten.
      const bisherigerStatus =
        typeof dokument.status === 'string' ? dokument.status : daten.status;
      const statusBleibtStehen =
        bisherigerStatus === 'rechnung' ||
        bisherigerStatus === 'bezahlt' ||
        bisherigerStatus === 'verloren';
      const neuerStatus = statusBleibtStehen ? bisherigerStatus : 'geliefert';

      const neueDaten: ProjektDaten = {
        ...daten,
        status: neuerStatus,
        dispoStatus: 'geliefert',
        liefernachweisAm: zeitstempel,
        liefernachweis: {
          fotoDateiId: fotoDatei?.$id,
          unterschriftDateiId: unterschriftDatei?.$id,
          fahrerName,
          unterzeichnerName,
          geo,
          dokumentId: archivEintrag.$id,
        },
        geaendertAm: zeitstempel,
      };
      await aktualisiereProjekt(projektId, {
        data: JSON.stringify(neueDaten),
        // `status` ist zusätzlich eine echte Appwrite-Spalte (PROJEKT_TOP_LEVEL_FELDER in
        // projektService.ts) und wird beim Lesen bevorzugt — beide Orte müssen gesetzt werden.
        status: neuerStatus,
        geaendertAm: zeitstempel,
      });
    } catch (updateFehler) {
      // Nachweis ist archiviert — Statuswechsel ist dann manuell nachzuholen.
      console.error('Projekt-Update nach Liefernachweis fehlgeschlagen:', updateFehler);
      statusGesetzt = false;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        liefernachweisAm: zeitstempel,
        statusGesetzt,
        ...(statusGesetzt
          ? {}
          : {
              hinweis:
                'Der Nachweis wurde archiviert, der Auftragsstatus konnte aber nicht automatisch aktualisiert werden.',
            }),
      }),
    };
  } catch (error) {
    console.error('Liefernachweis-Fehler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Unerwarteter Fehler. Bitte erneut versuchen oder den Lieferschein-Aussteller kontaktieren.',
      }),
    };
  }
};

export { handler };
