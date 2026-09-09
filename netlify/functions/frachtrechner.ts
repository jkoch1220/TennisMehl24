/**
 * frachtrechner.ts — Netlify Function des Kunden-Frachtkostenrechners
 *
 * Der Kunde öffnet den Link aus seiner E-Mail und rechnet sich auf
 * /frachtrechner/:kundeId?token=… ohne Login durch, was eine Lieferung
 * Sackware frei Haus kostet.
 *
 *   GET  ?kundeId=…&token=…            → Kundenname, Kundennummer, Rahmendaten
 *   POST { kundeId, token, paletten, koernung, zielPLZ }
 *                                      → { ok: true, ergebnis } | { ok: false, fehler, fehlertext }
 *
 * DIE VIER REGELN, DIE HIER ALLES TRAGEN:
 *
 * 1. Der Client spricht NIE mit Appwrite. Jeder Zugriff läuft über diese
 *    Function mit dem Server-Key; der Kunde sieht ausschließlich den einen
 *    Datensatz, zu dem sein Token passt — nie eine Liste, nie einen anderen
 *    Kunden (Muster wie bestellung.ts und datenpruefung.ts).
 * 2. Der Tarif bleibt auf dem Server. Der Raben-Haustarif steckt in
 *    lib/frachtrechnerLogik.ts und landet nur im Function-Bundle. Die Antwort
 *    enthält deshalb NIE Basispreis, Frachtzone, Gewichtsstufe, Aufschlagshöhe
 *    oder den Namen der Spedition — `oeffentlichesErgebnis` ist die Whitelist,
 *    die das auch bei künftigen Feldern durchhält.
 * 3. Preise werden serverseitig ermittelt. Was der Client schickt, ist Menge,
 *    Körnung und Ziel-PLZ — kein Preis. Die €/t kommen aus dem Artikelstamm.
 * 4. Es wird NICHTS über die Eingabe protokolliert. Weder Ziel-PLZ noch Menge
 *    tauchen in Logs auf; das ist in der Datenschutzerklärung so zugesagt.
 *    Fehler-Logs tragen daher nur Meldungstexte aus Appwrite/fetch, und der
 *    Request-Body wird ohne jede Ausgabe verworfen, wenn er unlesbar ist
 *    (JSON.parse zitiert in seiner Fehlermeldung sonst Teile der Eingabe).
 *
 * Kein CORS-Wildcard: Seite und Function liegen auf derselben Domain. Ein
 * `Access-Control-Allow-Origin: *` würde den Rechner für fremde Seiten öffnen,
 * ohne dass es hier je gebraucht würde.
 */
import { Handler, HandlerEvent } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';

import {
  berechneKundenFracht,
  DIESEL_STAND_CENT_DEFAULT,
  DIESEL_STAND_DATUM_DEFAULT,
  FRACHT_AUFSCHLAG_PROZENT_DEFAULT,
  MAX_PALETTEN,
  FrachtrechnerErgebnis,
  FrachtrechnerFehler,
  FrachtrechnerPreisbasis,
} from './lib/frachtrechnerLogik';

/**
 * Ziel-Datenbank.
 *
 * Wie im Bestellportal trägt ein aus der Sandbox erzeugter Link `&sandbox=1`.
 * Der Parameter wählt nur, WO gesucht wird — er ist unbedenklich manipulierbar:
 * Ohne passenden Token findet man in keiner der beiden Datenbanken etwas, und
 * ein Sandbox-Token existiert in der Produktion schlicht nicht.
 */
const PRODUKTIONS_DB = 'tennismehl24_db';
const SANDBOX_DB = 'tennismehl24_db_mock';
const datenbank = (sandbox: boolean): string => (sandbox ? SANDBOX_DB : PRODUKTIONS_DB);

const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';
const ARTIKEL_COLLECTION_ID = 'artikel';

const APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || '';
const APPWRITE_PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || '';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';

/**
 * Gültigkeit des Rechner-Links: 365 Tage.
 *
 * Saisonwerkzeug, kein Belegbezug: Der Link hängt an keinem Angebot und an
 * keiner Auftragsbestätigung, sondern begleitet den Kunden durch die Saison und
 * darf im Frühjahr wie im Herbst funktionieren. Die 90 Tage der Datenprüfung
 * (datenpruefung.ts) wären hier falsch — sie sind an einen einzelnen Beleg
 * gebunden und sollen kurz nach ihm ablaufen.
 */
const TOKEN_GUELTIGKEIT_TAGE = 365;

/** Appwrite-IDs sind höchstens 36 Zeichen — alles darüber ist kein echter Link. */
const MAX_ID_LAENGE = 64;
const MAX_TOKEN_LAENGE = 200;
/** PLZ-Feld nur grob deckeln; die eigentliche Prüfung macht istDeutschePLZ in der Logik. */
const MAX_PLZ_LAENGE = 10;

/** Sackware je Körnung im Artikelstamm — Preis steht dort in €/TONNE, nicht je Sack. */
const ARTIKELNUMMER_SACKWARE: Record<'0-2' | '0-3', string> = {
  '0-2': 'TM-ZM-02St',
  '0-3': 'TM-ZM-03St',
};
const ARTIKELNUMMER_PALETTE = 'TM-PAL';

/**
 * Fallbacks, wenn der Artikelstamm den Preis nicht hergibt.
 *
 * 155,00 €/t ist der Stand der Sackware; 0 € für die Palette bedeutet: keine
 * Palettenzeile ausweisen. Lieber eine Zeile weniger als eine erfundene Zahl —
 * die Logik lässt `palettenSumme` bei 0 dann einfach aus der Anzeige fallen.
 */
const PREIS_SACKWARE_FALLBACK = 155.0;
const PREIS_PALETTE_FALLBACK = 0;

/**
 * Wie lange ein gelesener Artikelpreis wiederverwendet wird.
 *
 * Ein Kunde rechnet typischerweise fünf bis zehn Varianten durch. Ohne diesen
 * Puffer löste jede davon zwei Appwrite-Abfragen aus, obwohl sich der
 * Stammpreis in dieser Zeit nicht ändert. Gecacht wird NUR ein echt gelesener
 * Preis (siehe ladePreisbasis) — ein Ausfall soll sich nicht zehn Minuten lang
 * als Fallback-Preis festsetzen.
 */
const PREIS_CACHE_MS = 10 * 60 * 1000;

// === Typen ===

/** Kundendaten, soweit dieser Rechner sie braucht (saison_kunden → data-JSON). */
interface KundenDaten {
  /** Feldname im Kundenstamm ist `name` (types/saisonplanung.ts, SaisonKunde). */
  name?: string;
  /** Altbestand/abweichende Importe tragen den Namen gelegentlich hier. */
  kundenname?: string;
  kundennummer?: string;
  frachtrechnerToken?: string;
  frachtrechnerTokenErstelltAm?: string;
  [schluessel: string]: unknown;
}

interface KundenDokument {
  $id?: string;
  data?: string;
  [schluessel: string]: unknown;
}

/** Artikel liegen als flache Attribute in Appwrite (artikelService.ts). */
interface ArtikelDokument {
  $id?: string;
  artikelnummer?: string;
  einzelpreis?: unknown;
  /** Nur für Altsätze aus dem Import, die den Preis noch im data-JSON tragen. */
  data?: string;
}

/** Alles, was der Client schicken kann — bewusst `unknown`, geprüft wird unten. */
interface FrachtrechnerRequest {
  kundeId?: unknown;
  token?: unknown;
  paletten?: unknown;
  koernung?: unknown;
  zielPLZ?: unknown;
  sandbox?: unknown;
}

/**
 * Fehlercodes der Antwort: die fachlichen aus der Preislogik plus die
 * Transport-/Zugangsfehler dieser Function.
 */
type AntwortFehler =
  | FrachtrechnerFehler
  | 'PARAMETER_FEHLT'
  | 'TOKEN_UNGUELTIG'
  | 'TOKEN_ABGELAUFEN'
  | 'KUNDE_UNBEKANNT'
  | 'ZU_VIELE_ANFRAGEN'
  | 'METHODE_NICHT_ERLAUBT'
  | 'SERVERFEHLER';

type ZugangsErgebnis =
  | { ok: true }
  | { ok: false; fehler: AntwortFehler; fehlertext: string };

// === Rate-Limit (In-Memory, best effort pro Function-Instanz) ===
const RATE_FENSTER_MS = 5 * 60 * 1000;
/**
 * Großzügiger als datenpruefung.ts (40/8): Der Rechner LEBT davon, dass jemand
 * mehrere Mengen und Ziele durchprobiert — 5 Paletten, 10 Paletten, zwei
 * Vereinsplätze. Gedeckelt bleibt es trotzdem, damit das Durchprobieren von
 * Tokens spürbar ausgebremst wird.
 */
const RATE_MAX_GESAMT = 60;
const RATE_MAX_POST = 40;
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

// === Antwort-Helfer ===
const antwort = (status: number, koerper: Record<string, unknown>) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    // Preise und Kundenname gehören in keinen Zwischenspeicher.
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
  },
  body: JSON.stringify(koerper),
});

/**
 * Einheitliche Fehlerantwort.
 *
 * `fehlertext` ist der Vertrag dieser Function; `error` steht zusätzlich drin,
 * weil die übrigen öffentlichen Functions (bestellung.ts, datenpruefung.ts)
 * dieses Feld benutzen und generische Fehlerbehandlung im Client sonst ins
 * Leere greift. Beide tragen denselben deutschen Satz.
 */
const fehlerAntwort = (status: number, fehler: AntwortFehler, fehlertext: string) =>
  antwort(status, { ok: false, fehler, fehlertext, error: fehlertext });

/**
 * Was von einem Ergebnis zum Kunden darf.
 *
 * Explizite Whitelist statt Durchreichen: Wer der Preislogik später ein
 * internes Feld hinzufügt (Basispreis, Zone, Gewichtsstufe, Aufschlag,
 * Speditionsname), gibt es sonst automatisch an jeden Kunden mit gültigem Link
 * weiter — sichtbar in den Entwicklerwerkzeugen. Dieselbe Vorsichtsmaßnahme wie
 * `oeffentlichePosition` in bestellung.ts.
 */
const oeffentlichesErgebnis = (e: FrachtrechnerErgebnis): Record<string, unknown> => ({
  paletten: e.paletten,
  tonnen: e.tonnen,
  koernung: e.koernung,
  bezeichnung: e.bezeichnung,
  materialProTonne: e.materialProTonne,
  materialSumme: e.materialSumme,
  palettenPreisProStueck: e.palettenPreisProStueck,
  palettenSumme: e.palettenSumme,
  frachtSumme: e.frachtSumme,
  dieselzuschlagProzent: e.dieselzuschlagProzent,
  dieselzuschlagSumme: e.dieselzuschlagSumme,
  dieselStandDatum: e.dieselStandDatum,
  nettoSumme: e.nettoSumme,
  ustSatzProzent: e.ustSatzProzent,
  ustSumme: e.ustSumme,
  bruttoSumme: e.bruttoSumme,
});

// === Appwrite REST-Helfer (Server-Key, kein SDK nötig) ===
const appwriteHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  'X-Appwrite-Project': APPWRITE_PROJECT_ID,
  'X-Appwrite-Key': APPWRITE_API_KEY,
});

const ladeKunde = async (kundeId: string, db: string): Promise<KundenDaten | null> => {
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${db}/collections/${SAISON_KUNDEN_COLLECTION_ID}/documents/${encodeURIComponent(kundeId)}`,
    { headers: appwriteHeaders() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Kunde nicht ladbar (HTTP ${res.status})`);

  const dokument = (await res.json()) as KundenDokument;
  if (typeof dokument.data === 'string') {
    try {
      return JSON.parse(dokument.data) as KundenDaten;
    } catch {
      // defektes data-Feld: unten auf das rohe Dokument zurückfallen
    }
  }
  return dokument as unknown as KundenDaten;
};

/** Preis robust einlesen — Zahl, Zahl-als-String oder gar nichts. */
const zuPreis = (wert: unknown): number | null => {
  const zahl =
    typeof wert === 'number'
      ? wert
      : typeof wert === 'string'
        ? Number(wert.trim().replace(',', '.'))
        : Number.NaN;
  return Number.isFinite(zahl) && zahl >= 0 ? zahl : null;
};

const leseEinzelpreis = (dokument: ArtikelDokument): number | null => {
  const direkt = zuPreis(dokument.einzelpreis);
  if (direkt !== null) return direkt;
  if (typeof dokument.data === 'string') {
    try {
      const geparst = JSON.parse(dokument.data) as { einzelpreis?: unknown };
      return zuPreis(geparst.einzelpreis);
    } catch {
      return null;
    }
  }
  return null;
};

/** Einen Artikel über seine (eindeutige) Nummer lesen. */
const ladeArtikelPreis = async (artikelnummer: string, db: string): Promise<number | null> => {
  const abfragen = [
    { method: 'equal', attribute: 'artikelnummer', values: [artikelnummer] },
    { method: 'limit', values: [1] },
  ]
    .map((q) => `queries[]=${encodeURIComponent(JSON.stringify(q))}`)
    .join('&');

  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${db}/collections/${ARTIKEL_COLLECTION_ID}/documents?${abfragen}`,
    { headers: appwriteHeaders() }
  );
  if (!res.ok) throw new Error(`Artikel nicht ladbar (HTTP ${res.status})`);

  const json = (await res.json()) as { documents?: ArtikelDokument[] };
  const dokument = json.documents?.[0];
  return dokument ? leseEinzelpreis(dokument) : null;
};

const preisCache = new Map<string, { basis: FrachtrechnerPreisbasis; bis: number }>();

/**
 * Preisbasis serverseitig ermitteln.
 *
 * Der Client schickt bewusst KEINEN Preis mit — sonst rechnete sich jeder seine
 * eigene Tonne. Aufschlag und Dieselstand sind gepflegte Konstanten der
 * Preislogik, die €/t und der Palettenpreis kommen aus dem Artikelstamm.
 *
 * Der Cache-Schlüssel enthält die Datenbank: Sandbox-Preise dürfen sich nicht
 * in die Produktionsantwort schleichen (und umgekehrt). Er fasst höchstens vier
 * Einträge (2 Körnungen × 2 Datenbanken) und braucht deshalb keine Begrenzung.
 */
const ladePreisbasis = async (
  koernung: '0-2' | '0-3',
  db: string
): Promise<FrachtrechnerPreisbasis> => {
  const schluessel = `${db}|${koernung}`;
  const zwischengespeichert = preisCache.get(schluessel);
  if (zwischengespeichert && Date.now() < zwischengespeichert.bis) {
    return zwischengespeichert.basis;
  }

  let preisSackwareProTonne = PREIS_SACKWARE_FALLBACK;
  let preisPaletteProStueck = PREIS_PALETTE_FALLBACK;
  let ausStamm = false;

  try {
    const [sackware, palette] = await Promise.all([
      ladeArtikelPreis(ARTIKELNUMMER_SACKWARE[koernung], db),
      ladeArtikelPreis(ARTIKELNUMMER_PALETTE, db),
    ]);
    if (sackware !== null) {
      preisSackwareProTonne = sackware;
      ausStamm = true;
    }
    if (palette !== null) preisPaletteProStueck = palette;
  } catch (error) {
    // Ohne Eingabewerte loggen — weder PLZ noch Menge (Datenschutzerklärung).
    console.warn(
      'Frachtrechner: Artikelpreise nicht ladbar, Fallback greift:',
      error instanceof Error ? error.message : 'unbekannter Fehler'
    );
  }

  const basis: FrachtrechnerPreisbasis = {
    preisSackwareProTonne,
    preisPaletteProStueck,
    frachtAufschlagProzent: FRACHT_AUFSCHLAG_PROZENT_DEFAULT,
    dieselStandCent: DIESEL_STAND_CENT_DEFAULT,
    dieselStandDatum: DIESEL_STAND_DATUM_DEFAULT,
  };

  // Nur echte Stammpreise puffern: Ein kurzer Appwrite-Ausfall soll den
  // Fallback nicht zehn Minuten lang zementieren.
  if (ausStamm) preisCache.set(schluessel, { basis, bis: Date.now() + PREIS_CACHE_MS });

  return basis;
};

// === Token-Prüfung ===
/**
 * Timing-sicherer Vergleich.
 *
 * Die Längenprüfung MUSS vorher stehen: timingSafeEqual wirft bei ungleich
 * langen Puffern, statt false zu liefern — der Aufruf endete sonst als 500
 * statt als sauberes 403.
 */
const tokenGleich = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

const pruefeZugang = (kunde: KundenDaten, token: string): ZugangsErgebnis => {
  const hinterlegt = typeof kunde.frachtrechnerToken === 'string' ? kunde.frachtrechnerToken : '';

  // Bewusst dieselbe Meldung für „kein Rechner hinterlegt" und „falscher Token":
  // Sonst ließe sich von außen ablesen, für welche Kunden ein Link existiert.
  if (!hinterlegt || !tokenGleich(hinterlegt, token)) {
    return {
      ok: false,
      fehler: 'TOKEN_UNGUELTIG',
      fehlertext:
        'Dieser Link ist ungültig. Bitte fordern Sie unter info@tennismehl.com einen neuen an.',
    };
  }

  const erstellt =
    typeof kunde.frachtrechnerTokenErstelltAm === 'string'
      ? new Date(kunde.frachtrechnerTokenErstelltAm).getTime()
      : Number.NaN;

  if (
    Number.isNaN(erstellt) ||
    Date.now() > erstellt + TOKEN_GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000
  ) {
    return {
      ok: false,
      fehler: 'TOKEN_ABGELAUFEN',
      fehlertext:
        'Dieser Link ist abgelaufen. Bitte melden Sie sich unter info@tennismehl.com — wir schicken Ihnen gerne einen neuen.',
    };
  }

  return { ok: true };
};

// === Eingaben lesen ===
const alsText = (wert: unknown, maxLaenge: number): string =>
  typeof wert === 'string' ? wert.trim().slice(0, maxLaenge) : '';

/**
 * Palettenzahl aus dem Body lesen.
 *
 * Der Client schickt eine Zahl (NumberInput liefert `number`), ein von Hand
 * gebauter Aufruf kann aber auch "5" oder "5,0" senden. NaN ist hier ein
 * gültiges Zwischenergebnis: berechneKundenFracht weist es mit
 * PALETTEN_UNGUELTIG und deutschem Text ab — derselbe Satz wie bei 0 oder 99.
 */
const alsZahl = (wert: unknown): number => {
  if (typeof wert === 'number') return wert;
  if (typeof wert === 'string') {
    const bereinigt = wert.trim().replace(',', '.');
    return bereinigt ? Number(bereinigt) : Number.NaN;
  }
  return Number.NaN;
};

const alsKoernung = (wert: unknown): '0-2' | '0-3' | null =>
  wert === '0-2' || wert === '0-3' ? wert : null;

// === Handler ===
export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    // Kein Access-Control-Allow-Origin: Seite und Function teilen sich die
    // Domain, ein Preflight ist hier gar nicht nötig.
    return {
      statusCode: 204,
      headers: { Allow: 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return fehlerAntwort(405, 'METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.');
  }

  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    return fehlerAntwort(
      500,
      'SERVERFEHLER',
      'Der Frachtrechner ist gerade nicht verfügbar. Bitte rufen Sie uns an — wir rechnen die Lieferung für Sie durch.'
    );
  }

  const ip =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers['client-ip'] ||
    'unbekannt';

  if (!pruefeRateLimit(ip, event.httpMethod === 'POST')) {
    return fehlerAntwort(
      429,
      'ZU_VIELE_ANFRAGEN',
      'Zu viele Anfragen. Bitte versuchen Sie es in ein paar Minuten erneut.'
    );
  }

  try {
    // ============ GET: Rahmendaten für die Seite ============
    if (event.httpMethod === 'GET') {
      const kundeId = alsText(event.queryStringParameters?.kundeId, MAX_ID_LAENGE);
      const token = alsText(event.queryStringParameters?.token, MAX_TOKEN_LAENGE);
      const sandbox = event.queryStringParameters?.sandbox === '1';

      if (!kundeId || !token) {
        return fehlerAntwort(400, 'PARAMETER_FEHLT', 'Der Link ist unvollständig.');
      }

      const kunde = await ladeKunde(kundeId, datenbank(sandbox));
      if (!kunde) {
        return fehlerAntwort(404, 'KUNDE_UNBEKANNT', 'Zu diesem Link finden wir keinen Kunden.');
      }

      const zugang = pruefeZugang(kunde, token);
      if (!zugang.ok) return fehlerAntwort(403, zugang.fehler, zugang.fehlertext);

      return antwort(200, {
        kundenname: kunde.name || kunde.kundenname || '',
        kundennummer: kunde.kundennummer || '',
        maxPaletten: MAX_PALETTEN,
        hinweisPreisstand: `Preise Stand ${DIESEL_STAND_DATUM_DEFAULT}`,
      });
    }

    // ============ POST: Rechnen ============
    if (!event.body) {
      return fehlerAntwort(400, 'PARAMETER_FEHLT', 'Die Anfrage war leer.');
    }

    let anfrage: FrachtrechnerRequest;
    try {
      anfrage = JSON.parse(event.body) as FrachtrechnerRequest;
    } catch {
      // Bewusst OHNE Logausgabe: Die Fehlermeldung von JSON.parse zitiert Teile
      // der Eingabe — damit stünden PLZ und Menge im Log.
      return fehlerAntwort(400, 'PARAMETER_FEHLT', 'Die Anfrage konnte nicht gelesen werden.');
    }

    const kundeId = alsText(anfrage.kundeId, MAX_ID_LAENGE);
    const token = alsText(anfrage.token, MAX_TOKEN_LAENGE);
    const sandbox = anfrage.sandbox === true || anfrage.sandbox === '1';

    if (!kundeId || !token) {
      return fehlerAntwort(400, 'PARAMETER_FEHLT', 'Der Link ist unvollständig.');
    }

    const db = datenbank(sandbox);
    const kunde = await ladeKunde(kundeId, db);
    if (!kunde) {
      return fehlerAntwort(404, 'KUNDE_UNBEKANNT', 'Zu diesem Link finden wir keinen Kunden.');
    }

    const zugang = pruefeZugang(kunde, token);
    if (!zugang.ok) return fehlerAntwort(403, zugang.fehler, zugang.fehlertext);

    const koernung = alsKoernung(anfrage.koernung);
    if (!koernung) {
      return fehlerAntwort(
        400,
        'PARAMETER_FEHLT',
        'Bitte wählen Sie die Körnung 0/2 mm oder 0/3 mm.'
      );
    }

    const eingabe = {
      paletten: alsZahl(anfrage.paletten),
      koernung,
      zielPLZ: alsText(anfrage.zielPLZ, MAX_PLZ_LAENGE),
    };

    const basis = await ladePreisbasis(koernung, db);
    const ergebnis = berechneKundenFracht(eingabe, basis);

    // Fachliche Absagen (PLZ unbekannt, Menge außerhalb der Staffel) sind
    // gültige Antworten, keine Transportfehler: HTTP 200 mit ok:false, damit
    // die Seite den fertigen deutschen Satz anzeigen kann.
    if (!ergebnis.ok || !ergebnis.ergebnis) {
      return fehlerAntwort(
        200,
        ergebnis.fehler ?? 'KEIN_TARIF',
        ergebnis.fehlertext ??
          'Diese Anfrage können wir nicht automatisch rechnen. Bitte rufen Sie uns an.'
      );
    }

    return antwort(200, { ok: true, ergebnis: oeffentlichesErgebnis(ergebnis.ergebnis) });
  } catch (error) {
    // Nur die Meldung, nie die Eingabe: Was hier ankommt, stammt aus Appwrite
    // oder fetch und enthält keine Kundeneingabe.
    console.error(
      'Frachtrechner-Fehler:',
      error instanceof Error ? error.message : 'unbekannter Fehler'
    );
    return fehlerAntwort(
      500,
      'SERVERFEHLER',
      'Unerwarteter Fehler. Bitte versuchen Sie es erneut oder schreiben Sie an info@tennismehl.com.'
    );
  }
};
