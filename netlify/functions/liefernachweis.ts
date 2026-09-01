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
 *   POST { projektId, token, fotoBase64, wiegescheinBase64, ... }
 *        → Bestätigung: archiviert Liefernachweis-PDF (GoBD) in
 *          bestellabwicklung_dokumente, legt Fotos/Unterschrift im Bucket
 *          liefernachweis-dateien ab und setzt dispoStatus='geliefert' +
 *          liefernachweisAm am Projekt (im data-JSON).
 *
 * Sicherheit:
 *   - Token-Gleichheit (timing-safe) + Ablauf nach 30 Tagen
 *   - Idempotenz: bereits bestätigte Lieferungen werden NICHT erneut
 *     verarbeitet (200 mit bereitsBestaetigt: true)
 *   - Best-Effort-Rate-Limit pro IP (In-Memory)
 *   - Testmodus (testModus: true): kein Statuswechsel, keine Archivierung
 *
 * ===========================================================================
 * WIEGESCHEIN
 * ===========================================================================
 * Der Fahrer fotografiert zusätzlich den Wiegeschein. Auf ihm steht die
 * tatsächlich verwogene Menge — die Zahl, nach der abgerechnet wird.
 *
 * Die Function liest den Schein per Bilderkennung vor, das Ergebnis ist aber
 * ausdrücklich nur ein VORSCHLAG (`wiegeschein.ocr`) und wird nirgends
 * automatisch übernommen. Verbindlich wird eine Menge erst, wenn ein Mensch
 * sie im Portal bestätigt (`wiegeschein.gepruefteMengeTonnen`, gesetzt von
 * src/services/wiegescheinService.ts). Bis dahin steht der Prüfstatus auf
 * 'offen' und die Lieferung erscheint in der Prüfliste.
 *
 * Die Bilderkennung läuft als LETZTER Schritt und rein Best-Effort: schlägt
 * sie fehl oder dauert zu lange, ist die Lieferung trotzdem vollständig
 * bestätigt und archiviert — der Prüfer liest die Menge dann selbst vom Foto
 * ab. Sie darf niemals einen Fahrer an der Bestätigung hindern.
 */

import { Handler, HandlerEvent } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { jsPDF } from 'jspdf';

// === Konfiguration (identisch zu src/config/appwrite.ts) ===
const PRODUKTIONS_DATABASE_ID = 'tennismehl24_db';
const MOCK_DATABASE_ID = 'tennismehl24_db_mock';
const PROJEKTE_COLLECTION_ID = 'projekte';
const DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';
const DOKUMENTE_BUCKET_BASIS = 'bestellabwicklung_dateien';
const LIEFERNACHWEIS_BUCKET_BASIS = 'liefernachweis-dateien';

/**
 * ===========================================================================
 * SANDBOX-DURCHSTICH
 * ===========================================================================
 *
 * Der QR-Code auf einem Lieferschein zeigt auf eine öffentliche URL, die diese
 * Function aufruft. Weil sie serverseitig läuft, kennt sie den Browser-Schalter
 * des Portals nicht — ein aus der Sandbox gedruckter Lieferschein hätte deshalb
 * in der Produktionsdatenbank nachgeschlagen und das Projekt nicht gefunden.
 *
 * Lösung: Ein QR-Code aus der Sandbox trägt `&mock=1`. Diese Function schaltet
 * dann Datenbank UND Buckets auf die Sandbox um, sodass der komplette Durchlauf
 * — Lieferschein drucken, QR scannen, unterschreiben, Liefernachweis-PDF
 * erzeugen — dort geprobt werden kann.
 *
 * Warum das keinen neuen Angriffsweg öffnet:
 *  - Der Zugriff hängt weiterhin ausschließlich am Token des Projekts, das mit
 *    timingSafeEqual geprüft wird. `mock=1` ohne gültiges Token bringt nichts.
 *  - Ein Aufruf MIT `mock=1` kann die Produktionsdatenbank nicht mehr erreichen,
 *    und einer OHNE nicht die Sandbox. Beide Richtungen sind dicht.
 *  - Die Sandbox-Tokens sind Kopien der echten. Wer eines besitzt, hat ohnehin
 *    Zugriff auf sein eigenes Projekt — es entsteht kein zusätzlicher Einblick.
 *
 * Die Umschaltung gilt pro Aufruf: Netlify Functions (AWS Lambda) bearbeiten je
 * Instanz immer nur einen Request, ein Nebeneinander verschiedener Ziele kann
 * es also nicht geben. `setzeDatenziel()` läuft als Erstes im Handler.
 */
let DATABASE_ID: string = PRODUKTIONS_DATABASE_ID;
let DOKUMENTE_BUCKET_ID: string = DOKUMENTE_BUCKET_BASIS;
let LIEFERNACHWEIS_BUCKET_ID: string = LIEFERNACHWEIS_BUCKET_BASIS;

const setzeDatenziel = (mock: boolean): void => {
  DATABASE_ID = mock ? MOCK_DATABASE_ID : PRODUKTIONS_DATABASE_ID;
  DOKUMENTE_BUCKET_ID = mock ? `mock_${DOKUMENTE_BUCKET_BASIS}` : DOKUMENTE_BUCKET_BASIS;
  LIEFERNACHWEIS_BUCKET_ID = mock ? `mock_${LIEFERNACHWEIS_BUCKET_BASIS}` : LIEFERNACHWEIS_BUCKET_BASIS;
  if (mock) console.log('🧪 Liefernachweis läuft gegen die Sandbox:', DATABASE_ID);
};

/** Liest das Sandbox-Kennzeichen aus Query-String oder JSON-Body. */
const istMockAufruf = (event: HandlerEvent): boolean => {
  if (event.queryStringParameters?.mock === '1') return true;
  if (event.body) {
    try {
      return (JSON.parse(event.body) as { mock?: unknown }).mock === true;
    } catch {
      return false;
    }
  }
  return false;
};

const TOKEN_GUELTIGKEIT_TAGE = 30;
const MAX_FOTO_BASE64_LAENGE = 4_500_000; // ~3,3 MB binär
const MAX_UNTERSCHRIFT_BASE64_LAENGE = 600_000; // ~450 KB binär

/**
 * Ist das Wiegeschein-Foto Pflicht? (Stand 08/2026: ja, Entscheidung der GF)
 *
 * Bewusst als eine benannte Konstante und nicht verstreut in if-Bedingungen:
 * Wenn Fahrer in der Praxis hängenbleiben, weil es zu einer Lieferung real
 * keinen Wiegeschein gibt (Palettenware ab Werk, Selbstabholer), ist das hier
 * der EINE Schalter. Auf `false` wird der Schritt optional — die Fahrer-Seite
 * liest den Wert über den GET-Endpunkt mit und passt sich an.
 */
const WIEGESCHEIN_PFLICHT = true;

/** Zeitbudget für die Bilderkennung. Danach gilt der Wiegeschein als ungelesen. */
const OCR_TIMEOUT_MS = 7000;

/**
 * Modell für die Wiegeschein-Erkennung. Bewusst nicht das kleinste Modell:
 * gelesen werden verschmutzte, schräg fotografierte Belege, und eine falsch
 * erkannte Ziffer verschiebt die Abrechnung um Tonnen.
 */
const OCR_MODEL = 'claude-sonnet-5';

/** Plausibilitätsfenster für eine LKW-Nettomenge in Tonnen (Motorwagen bis Sattelzug) */
const PLAUSIBEL_MIN_TONNEN = 0.2;
const PLAUSIBEL_MAX_TONNEN = 45;

const APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || '';
const APPWRITE_PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || '';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

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
  /** Plan-Menge aus AB/Dispo (Stufe 3) — liefergewicht ist nur noch das gewogene Ist. */
  beauftragteTonnen?: number;
  anzahlPaletten?: number;
  dispoAnsprechpartner?: { name?: string; telefon?: string };
  liefernachweisToken?: string;
  liefernachweisTokenErstelltAm?: string;
  liefernachweisAm?: string;
  liefernachweis?: Record<string, unknown>;
  wiegeschein?: Record<string, unknown>;
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
  fotoBase64?: string; // JPEG der abgeladenen Ware, Pflicht (Data-URL oder roher Base64-String)
  wiegescheinBase64?: string; // JPEG des Wiegescheins, Pflicht solange WIEGESCHEIN_PFLICHT
  fahrerName?: string; // Name des Fahrers (von der Seite als Pflichtfeld erhoben)
  unterschriftBase64?: string; // PNG, optional
  unterzeichnerName?: string; // optional
  geo?: { lat?: number; lng?: number; genauigkeitM?: number };
  testModus?: boolean;
}

/** Ergebnis der Wiegeschein-Erkennung — reiner Vorschlag, siehe Kopfkommentar */
interface WiegescheinOcr {
  gelesen: boolean;
  menge?: number;
  einheit?: 't' | 'kg';
  mengeTonnen?: number;
  belegnummer?: string;
  kennzeichen?: string;
  datum?: string;
  konfidenz?: number;
  hinweis?: string;
  fehler?: string;
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

// ===========================================================================
// WIEGESCHEIN-ERKENNUNG (Best Effort, Ergebnis ist nur ein Vorschlag)
// ===========================================================================

const OCR_SYSTEM_PROMPT = `Du liest deutsche Wiegescheine (Waagescheine) von LKW-Fuhren mit Schüttgut.
Deine einzige Aufgabe: die Werte ablesen, die WIRKLICH auf dem Beleg stehen.

WELCHE ZAHL GESUCHT IST:
Ein Wiegeschein zeigt meist drei Gewichte: Brutto (voller LKW), Tara (leerer LKW)
und Netto (die Ware). Gesucht ist ausschliesslich das NETTOGEWICHT — die gelieferte
Ware. Steht kein Netto da, aber Brutto und Tara, rechne Brutto minus Tara und schreibe
das in den Hinweis. Gibt es weder Netto noch beides, ist menge null.

DEUTSCHES ZAHLENFORMAT — die haeufigste Fehlerquelle:
Der Punkt ist Tausendertrenner, das Komma ist Dezimaltrenner.
  "24.320 kg"  = 24320 Kilogramm  (NICHT 24,32)
  "24,32 t"    = 24.32 Tonnen
  "1.250 kg"   = 1250 Kilogramm
Gib "menge" IMMER als reine Zahl mit Punkt als Dezimaltrenner aus, ohne Tausendertrenner.
Aus "24.320 kg" wird also menge=24320, einheit="kg".
Schreibe zusaetzlich in "nettoRohtext" die Zeichenfolge exakt so, wie sie gedruckt ist.

WENN DU UNSICHER BIST:
Rate niemals. Eine falsch gelesene Ziffer verursacht eine falsche Rechnung.
Ist eine Ziffer unscharf, verdeckt, abgeschnitten oder mehrdeutig, setze
konfidenz niedrig (unter 0.5) und beschreibe im Hinweis genau, was unklar ist.
Ist der Beleg gar kein Wiegeschein oder unlesbar, setze menge auf null.

Antworte AUSSCHLIESSLICH mit gueltigem JSON in genau diesem Format:
{"menge":number|null,"einheit":"kg"|"t"|null,"nettoRohtext":string|null,"belegnummer":string|null,"kennzeichen":string|null,"datum":string|null,"konfidenz":number,"hinweis":string}

Keine Codebloecke, kein Markdown, kein Text ausserhalb des JSON.`;

/** Zieht das JSON aus der Modellantwort (toleriert Codeblöcke und Beitext) */
const parseOcrAntwort = (text: string): Record<string, unknown> => {
  let kandidat = text.trim();
  const codeMatch = kandidat.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeMatch) kandidat = codeMatch[1].trim();
  const auf = kandidat.indexOf('{');
  const zu = kandidat.lastIndexOf('}');
  if (auf < 0 || zu < 0) throw new Error('Keine JSON-Antwort im Modell-Output');
  return JSON.parse(kandidat.slice(auf, zu + 1)) as Record<string, unknown>;
};

/**
 * Rechnet die abgelesene Menge auf Tonnen um und prüft sie gegen ein
 * Plausibilitätsfenster. Ein Wert ausserhalb (0,2 t bis 45 t) deutet fast immer
 * auf einen Lesefehler hin — typisch: Tausendertrenner als Komma gelesen. Der
 * Wert wird dann verworfen statt weitergereicht.
 */
const normalisiereAufTonnen = (
  menge: number,
  einheit: 't' | 'kg'
): { tonnen: number; plausibel: boolean } => {
  const tonnen = einheit === 'kg' ? menge / 1000 : menge;
  const gerundet = Math.round(tonnen * 1000) / 1000;
  return {
    tonnen: gerundet,
    plausibel: gerundet >= PLAUSIBEL_MIN_TONNEN && gerundet <= PLAUSIBEL_MAX_TONNEN,
  };
};

/**
 * Liest den Wiegeschein per Bilderkennung vor.
 *
 * Wirft NIE — jeder Fehler (kein Key, Timeout, Netzproblem, unparsbare Antwort)
 * kommt als `{ gelesen: false, fehler }` zurück. Der Prüfer im Portal sieht dann
 * das Foto ohne Vorschlag und tippt die Menge selbst ab.
 */
const leseWiegescheinAus = async (jpegBase64: string): Promise<WiegescheinOcr> => {
  if (!ANTHROPIC_API_KEY) {
    return { gelesen: false, fehler: 'Bilderkennung nicht konfiguriert (ANTHROPIC_API_KEY fehlt).' };
  }

  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), OCR_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      signal: abbruch.signal,
      body: JSON.stringify({
        model: OCR_MODEL,
        max_tokens: 400,
        system: OCR_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 },
              },
              { type: 'text', text: 'Lies diesen Wiegeschein aus.' },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { gelesen: false, fehler: `Bilderkennung nicht erreichbar (HTTP ${res.status}). ${text.slice(0, 120)}` };
    }

    const antwort = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (antwort.content ?? [])
      .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
      .join('')
      .trim();
    if (!text) return { gelesen: false, fehler: 'Leere Antwort der Bilderkennung.' };

    const roh = parseOcrAntwort(text);
    const konfidenz = typeof roh.konfidenz === 'number' ? roh.konfidenz : undefined;
    const hinweis = typeof roh.hinweis === 'string' && roh.hinweis.trim() ? roh.hinweis.trim() : undefined;
    const belegnummer = typeof roh.belegnummer === 'string' && roh.belegnummer.trim() ? roh.belegnummer.trim() : undefined;
    const kennzeichen = typeof roh.kennzeichen === 'string' && roh.kennzeichen.trim() ? roh.kennzeichen.trim() : undefined;
    const datum = typeof roh.datum === 'string' && roh.datum.trim() ? roh.datum.trim() : undefined;

    const menge = typeof roh.menge === 'number' && Number.isFinite(roh.menge) ? roh.menge : undefined;
    const einheit = roh.einheit === 'kg' || roh.einheit === 't' ? roh.einheit : undefined;

    // Keine Menge erkannt: Beleg trotzdem mit den Nebenangaben zurückgeben,
    // damit der Prüfer wenigstens Belegnummer und Hinweis sieht.
    if (menge === undefined || einheit === undefined) {
      return {
        gelesen: false,
        belegnummer,
        kennzeichen,
        datum,
        konfidenz,
        hinweis,
        fehler: 'Auf dem Foto war keine eindeutige Nettomenge lesbar.',
      };
    }

    const { tonnen, plausibel } = normalisiereAufTonnen(menge, einheit);
    if (!plausibel) {
      // Fast immer ein Lesefehler beim Tausendertrenner. Lieber gar kein
      // Vorschlag als ein Vorschlag um Faktor 1000 daneben.
      return {
        gelesen: false,
        menge,
        einheit,
        belegnummer,
        kennzeichen,
        datum,
        konfidenz: 0,
        hinweis,
        fehler: `Gelesener Wert (${menge} ${einheit} = ${tonnen} t) liegt ausserhalb des plausiblen Bereichs und wurde verworfen.`,
      };
    }

    return {
      gelesen: true,
      menge,
      einheit,
      mengeTonnen: tonnen,
      belegnummer,
      kennzeichen,
      datum,
      konfidenz,
      hinweis,
    };
  } catch (fehler) {
    const abgebrochen = fehler instanceof Error && fehler.name === 'AbortError';
    return {
      gelesen: false,
      fehler: abgebrochen
        ? 'Bilderkennung hat zu lange gebraucht und wurde abgebrochen.'
        : `Bilderkennung fehlgeschlagen: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    };
  } finally {
    clearTimeout(timer);
  }
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
  wiegescheinJpegBytes?: Uint8Array;
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

  // Wiegeschein — der Beleg über die tatsächlich verwogene Menge.
  // Bewusst NUR das Foto: Dieses PDF wird als unveränderbarer Nachweis
  // archiviert (istFinal), eine zu diesem Zeitpunkt noch ungeprüfte
  // Maschinenlesung hätte darin den Anschein eines festgestellten Werts.
  // Die geprüfte Menge steht am Projekt und im Prüfprotokoll.
  if (options.wiegescheinJpegBytes) {
    doc.addPage();
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Wiegeschein', links, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(
      'Vom Fahrer beim Abladen fotografiert. Massgeblich ist der abgebildete Beleg.',
      links,
      26
    );
    doc.setTextColor(0, 0, 0);
    try {
      bettePdfBildEin(doc, options.wiegescheinJpegBytes, 'JPEG', links, 32, 170, 236);
    } catch {
      doc.setFontSize(10);
      doc.text('Wiegeschein konnte nicht eingebettet werden (liegt separat im Storage vor).', links, 36);
    }
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

  // Muss VOR jedem Datenzugriff stehen: legt Datenbank und Buckets für diesen
  // einen Aufruf fest (Produktion oder Sandbox).
  setzeDatenziel(istMockAufruf(event));

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
            liefergewicht: daten.liefergewicht ?? daten.beauftragteTonnen ?? null,
            anzahlPaletten: daten.anzahlPaletten ?? null,
            positionen: extrahierePositionen(daten),
            bereitsBestaetigt: Boolean(daten.liefernachweisAm),
            liefernachweisAm: daten.liefernachweisAm || null,
            // Steuert, ob die Fahrer-Seite das Wiegeschein-Foto erzwingt.
            // Server ist die Quelle der Wahrheit — die Prüfung unten läuft
            // ohnehin serverseitig, die Seite passt nur ihre Führung an.
            wiegescheinPflicht: WIEGESCHEIN_PFLICHT,
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
    const wiegescheinBase64 = request.wiegescheinBase64
      ? bereinigeBase64(request.wiegescheinBase64)
      : '';
    if (WIEGESCHEIN_PFLICHT && !wiegescheinBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Ein Foto des Wiegescheins ist erforderlich.' }),
      };
    }
    if (wiegescheinBase64.length > MAX_FOTO_BASE64_LAENGE) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Das Foto des Wiegescheins ist zu groß. Bitte erneut aufnehmen.' }),
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
    const wiegescheinBytes = wiegescheinBase64
      ? Uint8Array.from(Buffer.from(wiegescheinBase64, 'base64'))
      : undefined;
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
        wiegescheinJpegBytes: wiegescheinBytes,
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
    let wiegescheinDatei: { $id: string } | null = null;
    if (wiegescheinBytes) {
      wiegescheinDatei = await ladeDateiHoch(
        LIEFERNACHWEIS_BUCKET_ID,
        `${basisname} Wiegeschein.jpg`,
        wiegescheinBytes,
        'image/jpeg'
      );
    }
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
      wiegescheinJpegBytes: wiegescheinBytes,
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
      wiegescheinDateiId: wiegescheinDatei?.$id || null,
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
    // Für den nachgelagerten OCR-Schritt: der Stand, der gerade geschrieben wurde.
    let gespeicherteDaten: ProjektDaten | null = null;
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
        // Wiegeschein zunächst OHNE Maschinenlesung: Foto und offener Prüfstatus
        // reichen, damit die Lieferung sofort in der Prüfliste auftaucht. Die
        // Erkennung wird gleich nachgetragen — scheitert sie, bleibt es beim Foto.
        ...(wiegescheinDatei
          ? {
              wiegeschein: {
                fotoDateiId: wiegescheinDatei.$id,
                erfasstAm: zeitstempel,
                pruefStatus: 'offen',
              },
            }
          : {}),
        geaendertAm: zeitstempel,
      };
      await aktualisiereProjekt(projektId, {
        data: JSON.stringify(neueDaten),
        // `status` ist zusätzlich eine echte Appwrite-Spalte (PROJEKT_TOP_LEVEL_FELDER in
        // projektService.ts) und wird beim Lesen bevorzugt — beide Orte müssen gesetzt werden.
        status: neuerStatus,
        geaendertAm: zeitstempel,
      });
      gespeicherteDaten = neueDaten;
    } catch (updateFehler) {
      // Nachweis ist archiviert — Statuswechsel ist dann manuell nachzuholen.
      console.error('Projekt-Update nach Liefernachweis fehlgeschlagen:', updateFehler);
      statusGesetzt = false;
    }

    // ---- 4. Wiegeschein vorlesen — BEWUSST DER LETZTE SCHRITT ----
    // Alles Verbindliche ist zu diesem Zeitpunkt gespeichert: Fotos, Archiv-PDF,
    // Status. Die Erkennung ist reine Vorarbeit für den Menschen, der die Menge
    // prüft. Bricht sie ab oder läuft die Function hier ins Zeitlimit, ist die
    // Lieferung trotzdem vollständig bestätigt — es fehlt lediglich der
    // Vorschlag, und der Prüfer liest die Menge selbst vom Foto ab.
    let wiegescheinGelesen = false;
    if (wiegescheinDatei && wiegescheinBase64 && gespeicherteDaten) {
      try {
        const ocr = await leseWiegescheinAus(wiegescheinBase64);
        wiegescheinGelesen = ocr.gelesen;
        const mitOcr: ProjektDaten = {
          ...gespeicherteDaten,
          wiegeschein: {
            ...(gespeicherteDaten.wiegeschein as Record<string, unknown>),
            ocr,
          },
        };
        await aktualisiereProjekt(projektId, { data: JSON.stringify(mitOcr) });
      } catch (ocrFehler) {
        // Nur der Vorschlag fehlt. Der Prüfstatus steht weiterhin auf 'offen'.
        console.warn('Wiegeschein-Erkennung übersprungen:', ocrFehler);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        liefernachweisAm: zeitstempel,
        statusGesetzt,
        wiegescheinGespeichert: Boolean(wiegescheinDatei),
        wiegescheinGelesen,
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
