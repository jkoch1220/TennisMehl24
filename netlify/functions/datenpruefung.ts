/**
 * datenpruefung.ts — Netlify Function für das Datenprüfungs-/Änderungsformular
 *
 * Der Kunde öffnet den Link aus der AB-E-Mail und prüft/ändert seine Daten
 * über die öffentliche Seite /daten-pruefung/:projektId?token=... OHNE Login.
 * Der anonyme Client greift NIE direkt auf Appwrite zu — alle Lese-/Schreib-
 * operationen laufen über diese Function (Appwrite REST-API mit Server-API-Key
 * aus der Umgebung, Muster identisch zu liefernachweis.ts).
 *
 * Endpunkte:
 *   GET  ?projektId=...&token=...   → im System hinterlegte Daten (ohne Preise)
 *   POST { projektId, token, allesKorrekt, dispoKontakt, ... }
 *        → Rückmeldung speichern: Dispo-Kontakt + Rechnungs-E-Mail werden
 *          direkt am Projekt übernommen, Adress-/Mengen-Änderungswünsche
 *          landen als datenpruefungRueckmeldung + wichtige Dispo-Notiz
 *          (KEINE automatische Übernahme — AB = Verbindlichkeit).
 *
 * Sicherheit:
 *   - Token-Gleichheit (timing-safe) + Ablauf nach 90 Tagen
 *   - Mehrfach-Einreichung erlaubt (Kunde darf korrigieren) — jede Einreichung
 *     überschreibt die Rückmeldung und hängt eine neue Dispo-Notiz an
 *   - Best-Effort-Rate-Limit pro IP (In-Memory)
 *   - Testmodus (testModus: true): validieren, aber nichts speichern
 */

import { Handler, HandlerEvent } from '@netlify/functions';
import { randomUUID, timingSafeEqual } from 'node:crypto';

// === Konfiguration (identisch zu src/config/appwrite.ts) ===
const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE_COLLECTION_ID = 'projekte';

const TOKEN_GUELTIGKEIT_TAGE = 90;
const MAX_KURZFELD_LAENGE = 200;
const MAX_HINWEIS_LAENGE = 1000;

const APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || '';
const APPWRITE_PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || '';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';

// === Typen ===
interface DispoNotiz {
  id: string;
  text: string;
  erstelltAm: string;
  erstelltVon?: string;
  wichtig?: boolean;
}

interface DatenpruefungRueckmeldung {
  eingereichtAm: string;
  allesKorrekt: boolean;
  dispoKontakt?: { name?: string; telefon?: string; email?: string };
  befahrbarkeitBestaetigt?: boolean;
  befahrbarkeitHinweis?: string;
  mengeLieferanschriftHinweis?: string;
  rechnungsadresseHinweis?: string;
  rechnungsEmail?: string;
}

interface ProjektDaten {
  kundenname?: string;
  kundennummer?: string;
  kundenstrasse?: string;
  kundenPlzOrt?: string;
  kundenEmail?: string;
  kundenTelefon?: string;
  rechnungsEmail?: string;
  ansprechpartner?: string;
  lieferadresse?: { strasse?: string; plz?: string; ort?: string };
  auftragsbestaetigungsnummer?: string;
  dispoAnsprechpartner?: { name?: string; telefon?: string; email?: string };
  dispoNotizen?: DispoNotiz[];
  datenpruefungToken?: string;
  datenpruefungTokenErstelltAm?: string;
  datenpruefungRueckmeldung?: DatenpruefungRueckmeldung;
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

interface RueckmeldungsRequest {
  projektId?: string;
  token?: string;
  allesKorrekt?: boolean;
  dispoKontakt?: { name?: string; telefon?: string; email?: string };
  befahrbarkeitBestaetigt?: boolean;
  befahrbarkeitHinweis?: string;
  mengeLieferanschriftHinweis?: string;
  rechnungsadresseHinweis?: string;
  rechnungsEmail?: string;
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
  if (!daten.datenpruefungToken) {
    return { ok: false, grund: 'Für diesen Auftrag ist kein Datenprüfungs-Formular hinterlegt.' };
  }
  if (!tokenGleich(daten.datenpruefungToken, token)) {
    return { ok: false, grund: 'Der Link ist ungültig.' };
  }
  const erstellt = daten.datenpruefungTokenErstelltAm
    ? new Date(daten.datenpruefungTokenErstelltAm).getTime()
    : NaN;
  if (
    Number.isNaN(erstellt) ||
    Date.now() > erstellt + TOKEN_GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000
  ) {
    return {
      ok: false,
      grund: 'Der Link ist abgelaufen. Bitte melden Sie sich unter info@tennismehl.com.',
    };
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

interface AbDatenAuszug {
  positionen: PositionOhnePreis[];
  lieferanschrift: string;
  rechnungsadresse: string;
}

/** Positionen (ohne Preise), Liefer- und Rechnungsadresse aus den AB-Daten */
const extrahiereAbAuszug = (daten: ProjektDaten): AbDatenAuszug => {
  let ab: {
    positionen?: {
      bezeichnung?: string;
      menge?: number;
      einheit?: string;
      istBedarfsposition?: boolean;
    }[];
    kundenname?: string;
    kundenstrasse?: string;
    kundenPlzOrt?: string;
    lieferadresseAbweichend?: boolean;
    lieferadresseName?: string;
    lieferadresseStrasse?: string;
    lieferadressePlzOrt?: string;
  } = {};
  try {
    if (daten.auftragsbestaetigungsDaten) {
      ab = JSON.parse(daten.auftragsbestaetigungsDaten) as typeof ab;
    }
  } catch {
    // AB-Daten nicht lesbar — Fallback auf Projekt-Felder
  }

  const positionen = (ab.positionen || [])
    .filter((p) => !p.istBedarfsposition)
    .map((p) => ({
      bezeichnung: p.bezeichnung || '',
      menge: p.menge ?? 0,
      einheit: p.einheit || '',
    }));

  let lieferanschrift = '';
  if (ab.lieferadresseAbweichend && (ab.lieferadresseStrasse || ab.lieferadressePlzOrt)) {
    lieferanschrift = [ab.lieferadresseName, ab.lieferadresseStrasse, ab.lieferadressePlzOrt]
      .filter((t) => t?.trim())
      .join(', ');
  } else if (daten.lieferadresse?.strasse || daten.lieferadresse?.ort) {
    lieferanschrift = [
      daten.lieferadresse.strasse,
      [daten.lieferadresse.plz, daten.lieferadresse.ort].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(', ');
  } else {
    lieferanschrift = [daten.kundenstrasse, daten.kundenPlzOrt].filter(Boolean).join(', ');
  }

  const rechnungsadresse = [
    ab.kundenname || daten.kundenname,
    ab.kundenstrasse || daten.kundenstrasse,
    ab.kundenPlzOrt || daten.kundenPlzOrt,
  ]
    .filter((t) => t?.trim())
    .join(', ');

  return { positionen, lieferanschrift, rechnungsadresse };
};

const kuerze = (text: unknown, maxLaenge: number): string | undefined => {
  if (typeof text !== 'string') return undefined;
  const getrimmt = text.trim();
  if (!getrimmt) return undefined;
  return getrimmt.slice(0, maxLaenge);
};

const istGueltigeEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

/** Zusammenfassung der Rückmeldung als Dispo-Notiz-Text */
const baueNotizText = (r: DatenpruefungRueckmeldung): string => {
  const zeilen: string[] = ['Kunde hat die AB-Daten über das Datenprüfungs-Formular geprüft:'];
  if (r.allesKorrekt) {
    zeilen.push('✓ Alle Daten ohne Änderungen bestätigt.');
  }
  if (r.dispoKontakt && (r.dispoKontakt.name || r.dispoKontakt.telefon || r.dispoKontakt.email)) {
    zeilen.push(
      `Dispo-Kontakt: ${[r.dispoKontakt.name, r.dispoKontakt.telefon, r.dispoKontakt.email]
        .filter(Boolean)
        .join(' · ')} (am Projekt übernommen)`
    );
  }
  if (r.befahrbarkeitBestaetigt === true) {
    zeilen.push('✓ Befahrbarkeit vor Ort (LKW-Zufahrt) bestätigt.');
  } else if (r.befahrbarkeitBestaetigt === false) {
    zeilen.push('⚠ Befahrbarkeit NICHT bestätigt!');
  }
  if (r.befahrbarkeitHinweis) {
    zeilen.push(`Hinweis zur Zufahrt: ${r.befahrbarkeitHinweis}`);
  }
  if (r.mengeLieferanschriftHinweis) {
    zeilen.push(`⚠ Änderungswunsch Menge/Lieferanschrift: ${r.mengeLieferanschriftHinweis}`);
  }
  if (r.rechnungsadresseHinweis) {
    zeilen.push(`⚠ Änderungswunsch Rechnungsadresse: ${r.rechnungsadresseHinweis}`);
  }
  if (r.rechnungsEmail) {
    zeilen.push(`Rechnungs-E-Mail: ${r.rechnungsEmail} (am Projekt übernommen)`);
  }
  return zeilen.join('\n');
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
    // ============ GET: Hinterlegte Daten (validiert Token) ============
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
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Auftrag nicht gefunden.' }) };
      }
      const daten = parseProjektDaten(dokument);
      const validierung = validiereToken(daten, token);
      if (!validierung.ok) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: validierung.grund }) };
      }

      const auszug = extrahiereAbAuszug(daten);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          auftrag: {
            kundenname: daten.kundenname || '',
            kundennummer: daten.kundennummer || '',
            auftragsbestaetigungsnummer: daten.auftragsbestaetigungsnummer || '',
            dispoKontakt: {
              name: daten.dispoAnsprechpartner?.name || daten.ansprechpartner || '',
              telefon: daten.dispoAnsprechpartner?.telefon || daten.kundenTelefon || '',
              email: daten.dispoAnsprechpartner?.email || daten.kundenEmail || '',
            },
            positionen: auszug.positionen,
            lieferanschrift: auszug.lieferanschrift,
            rechnungsadresse: auszug.rechnungsadresse,
            rechnungsEmail: daten.rechnungsEmail || daten.kundenEmail || '',
            bereitsEingereicht: Boolean(daten.datenpruefungRueckmeldung),
            eingereichtAm: daten.datenpruefungRueckmeldung?.eingereichtAm || null,
          },
        }),
      };
    }

    // ============ POST: Rückmeldung speichern ============
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Methode nicht erlaubt.' }) };
    }
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Request-Body fehlt.' }) };
    }

    const request = JSON.parse(event.body) as RueckmeldungsRequest;
    const { projektId, token } = request;
    if (!projektId || !token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'projektId und token sind erforderlich.' }),
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

    // Eingaben bereinigen und begrenzen
    const dispoName = kuerze(request.dispoKontakt?.name, MAX_KURZFELD_LAENGE);
    const dispoTelefon = kuerze(request.dispoKontakt?.telefon, MAX_KURZFELD_LAENGE);
    const dispoEmailRoh = kuerze(request.dispoKontakt?.email, MAX_KURZFELD_LAENGE);
    const dispoEmail = dispoEmailRoh && istGueltigeEmail(dispoEmailRoh) ? dispoEmailRoh : undefined;
    const rechnungsEmailRoh = kuerze(request.rechnungsEmail, MAX_KURZFELD_LAENGE);
    const rechnungsEmail =
      rechnungsEmailRoh && istGueltigeEmail(rechnungsEmailRoh) ? rechnungsEmailRoh : undefined;

    if (dispoEmailRoh && !dispoEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Die E-Mail-Adresse des Dispo-Ansprechpartners ist ungültig.' }),
      };
    }
    if (rechnungsEmailRoh && !rechnungsEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Die E-Mail-Adresse für den Rechnungsversand ist ungültig.' }),
      };
    }

    const zeitstempel = new Date().toISOString();
    const rueckmeldung: DatenpruefungRueckmeldung = {
      eingereichtAm: zeitstempel,
      allesKorrekt: request.allesKorrekt === true,
      ...(dispoName || dispoTelefon || dispoEmail
        ? {
            dispoKontakt: {
              ...(dispoName ? { name: dispoName } : {}),
              ...(dispoTelefon ? { telefon: dispoTelefon } : {}),
              ...(dispoEmail ? { email: dispoEmail } : {}),
            },
          }
        : {}),
      ...(typeof request.befahrbarkeitBestaetigt === 'boolean'
        ? { befahrbarkeitBestaetigt: request.befahrbarkeitBestaetigt }
        : {}),
      ...(kuerze(request.befahrbarkeitHinweis, MAX_HINWEIS_LAENGE)
        ? { befahrbarkeitHinweis: kuerze(request.befahrbarkeitHinweis, MAX_HINWEIS_LAENGE) }
        : {}),
      ...(kuerze(request.mengeLieferanschriftHinweis, MAX_HINWEIS_LAENGE)
        ? {
            mengeLieferanschriftHinweis: kuerze(
              request.mengeLieferanschriftHinweis,
              MAX_HINWEIS_LAENGE
            ),
          }
        : {}),
      ...(kuerze(request.rechnungsadresseHinweis, MAX_HINWEIS_LAENGE)
        ? { rechnungsadresseHinweis: kuerze(request.rechnungsadresseHinweis, MAX_HINWEIS_LAENGE) }
        : {}),
      ...(rechnungsEmail ? { rechnungsEmail } : {}),
    };

    // ---- TESTMODUS: validieren, aber NICHTS speichern ----
    if (request.testModus === true) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          testModus: true,
          hinweis: '[TEST] Rückmeldung erfolgreich validiert — es wurde NICHTS gespeichert.',
        }),
      };
    }

    // Änderungswünsche machen die Notiz "wichtig" (manuelle Bearbeitung nötig)
    const hatAenderungswunsch = Boolean(
      rueckmeldung.mengeLieferanschriftHinweis ||
        rueckmeldung.rechnungsadresseHinweis ||
        rueckmeldung.befahrbarkeitHinweis ||
        rueckmeldung.befahrbarkeitBestaetigt === false
    );
    const notiz: DispoNotiz = {
      id: randomUUID(),
      text: baueNotizText(rueckmeldung),
      erstelltAm: zeitstempel,
      erstelltVon: 'Datenprüfungs-Formular (Kunde)',
      wichtig: hatAenderungswunsch,
    };

    // Dispo-Kontakt + Rechnungs-E-Mail direkt übernehmen (additiv, risikoarm);
    // Mengen-/Adressänderungen bewusst NICHT — die bearbeitet der Innendienst.
    const bisherigerDispo = daten.dispoAnsprechpartner || {};
    const neueDaten: ProjektDaten = {
      ...daten,
      ...(rueckmeldung.dispoKontakt
        ? {
            dispoAnsprechpartner: {
              ...bisherigerDispo,
              ...(dispoName ? { name: dispoName } : {}),
              ...(dispoTelefon ? { telefon: dispoTelefon } : {}),
              ...(dispoEmail ? { email: dispoEmail } : {}),
            },
          }
        : {}),
      ...(rechnungsEmail ? { rechnungsEmail } : {}),
      datenpruefungRueckmeldung: rueckmeldung,
      dispoNotizen: [...(daten.dispoNotizen || []), notiz],
      geaendertAm: zeitstempel,
    };

    await aktualisiereProjekt(projektId, {
      data: JSON.stringify(neueDaten),
      geaendertAm: zeitstempel,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, eingereichtAm: zeitstempel }),
    };
  } catch (error) {
    console.error('Datenprüfung-Fehler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Unerwarteter Fehler. Bitte erneut versuchen oder info@tennismehl.com kontaktieren.',
      }),
    };
  }
};

export { handler };
