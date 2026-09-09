/**
 * frachtrechner.ts — Netlify Function für den öffentlichen Frachtkostenrechner
 *
 * Die Seite /frachtrechner ist ÖFFENTLICH: kein Login, kein Token, kein Kunde.
 * Der Link lässt sich an jeden Platzbauer schicken und ohne Rückfrage öffnen.
 *
 * Endpunkt:
 *   GET  ?paletten=3&plz=90402   → Frachtpreis inkl. Dieselzuschlag und USt.
 *   GET  (ohne Parameter)        → nur Rahmendaten (maxPaletten, Dieselstand)
 *
 * WAS HIER NICHT HERAUSGEHT:
 * Speditions-Basispreis, Frachtzone, DE-Zone, Gewichtsstufe, Aufschlagshöhe,
 * Tarifart, Name der Spedition. Die Antwort ist eine Whitelist — wer sie
 * erweitert, veröffentlicht das Feld für jeden Aufrufer.
 *
 * SCHUTZ AUF EINER ÖFFENTLICHEN SEITE:
 * Ohne Token gibt es keine Zugangskontrolle, nur ein Rate-Limit. Wer den Tarif
 * systematisch abfragen will (95 PLZ-Präfixe x 24 Palettenstufen), braucht dafür
 * bei 60 Anfragen je 5 Minuten rund drei Stunden. Das verhindert Scraping nicht,
 * macht es aber unbequem — und der ausgewiesene Preis ist ohnehin der
 * Verkaufspreis inkl. Aufschlag, nicht unsere Einkaufskondition.
 */

import { Handler, HandlerEvent } from '@netlify/functions';

import {
  berechneKundenFracht,
  pruefeDieselCent,
  DIESEL_FALLBACK_CENT,
  FRACHT_AUFSCHLAG_PROZENT_DEFAULT,
  MAX_PALETTEN,
  FrachtrechnerErgebnis,
} from './lib/frachtrechnerLogik';

const DATABASE_ID = 'tennismehl24_db';
const DIESELPREISE_COLLECTION_ID = 'dieselpreise';

const APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || '';
const APPWRITE_PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || '';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';

// === Rate-Limit (In-Memory je Function-Instanz, Best Effort) ===
const RATE_FENSTER_MS = 5 * 60 * 1000;
const RATE_MAX = 60;
const rateMap = new Map<string, { treffer: number; reset: number }>();

const pruefeRateLimit = (ip: string): boolean => {
  const jetzt = Date.now();
  let eintrag = rateMap.get(ip);
  if (!eintrag || jetzt > eintrag.reset) {
    eintrag = { treffer: 0, reset: jetzt + RATE_FENSTER_MS };
    rateMap.set(ip, eintrag);
  }
  eintrag.treffer += 1;
  if (rateMap.size > 5000) rateMap.clear();
  return eintrag.treffer <= RATE_MAX;
};

// === Dieselpreis ===
interface DieselStand {
  cent: number;
  stand: string;
  plausibel: boolean;
}

/**
 * Cache über die Lebensdauer der Function-Instanz. Der Dieselpreis ändert sich
 * einmal täglich — ohne Cache löste jeder Tastendruck auf der Kundenseite eine
 * Appwrite-Abfrage aus.
 */
let dieselCache: { wert: DieselStand; gueltigBis: number } | null = null;
const DIESEL_CACHE_MS = 60 * 60 * 1000;

const formatiereDatum = (iso: string): string => {
  const [j, m, t] = iso.split('-');
  return t && m && j ? `${t}.${m}.${j}` : iso;
};

/**
 * Holt den jüngsten Dieselpreis aus der Historie.
 *
 * Die Werte dort sind NICHT blind vertrauenswürdig: Am 09.09.2026 lagen sie
 * durchgehend zwischen 210 und 248 ct/L, während deutscher Diesel real bei rund
 * 165 ct/L stand — der Floater wäre damit auf 27,5 % statt ~11 % gesprungen.
 * pruefeDieselCent() verwirft solche Werte und fällt auf einen festen Satz
 * zurück; `plausibel: false` sagt dem Aufrufer, dass das passiert ist.
 */
const holeDieselStand = async (): Promise<DieselStand> => {
  const jetzt = Date.now();
  if (dieselCache && jetzt < dieselCache.gueltigBis) return dieselCache.wert;

  let wert: DieselStand = {
    cent: DIESEL_FALLBACK_CENT,
    stand: 'Richtwert',
    plausibel: false,
  };

  if (APPWRITE_ENDPOINT && APPWRITE_PROJECT_ID && APPWRITE_API_KEY) {
    try {
      const queries = [
        JSON.stringify({ method: 'limit', values: [1] }),
        JSON.stringify({ method: 'orderDesc', values: ['datum'] }),
      ];
      const url =
        `${APPWRITE_ENDPOINT.replace(/\/$/, '')}` +
        `/databases/${DATABASE_ID}/collections/${DIESELPREISE_COLLECTION_ID}/documents` +
        `?${queries.map((q) => `queries[]=${encodeURIComponent(q)}`).join('&')}`;

      const res = await fetch(url, {
        headers: {
          'X-Appwrite-Project': APPWRITE_PROJECT_ID,
          'X-Appwrite-Key': APPWRITE_API_KEY,
        },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          documents?: Array<{ datum?: string; preis?: number }>;
        };
        const eintrag = json.documents?.[0];
        if (eintrag && typeof eintrag.preis === 'number') {
          // In der Collection steht EUR/L, der Floater rechnet in ct/L.
          const gepruef = pruefeDieselCent(eintrag.preis * 100);
          wert = {
            cent: gepruef.cent,
            stand: gepruef.plausibel && eintrag.datum ? formatiereDatum(eintrag.datum) : 'Richtwert',
            plausibel: gepruef.plausibel,
          };
        }
      }
    } catch {
      // Bewusst still: Ohne Dieselpreis rechnet der Rechner mit dem Richtwert
      // weiter, statt dem Kunden einen Fehler zu zeigen. Kein Logging von
      // Eingabewerten — siehe Datenschutzerklärung.
    }
  }

  dieselCache = { wert, gueltigBis: jetzt + DIESEL_CACHE_MS };
  return wert;
};

// === Antwort-Helfer ===
const antwort = (status: number, body: unknown) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

/**
 * Whitelist: Nur diese Felder verlassen den Server. Explizit aufgebaut statt
 * durchgereicht, damit ein neues Feld in der Logik nicht versehentlich
 * öffentlich wird.
 */
const oeffentlichesErgebnis = (e: FrachtrechnerErgebnis) => ({
  paletten: e.paletten,
  gewichtKg: e.gewichtKg,
  zielPLZ: e.zielPLZ,
  frachtSumme: e.frachtSumme,
  dieselzuschlagProzent: e.dieselzuschlagProzent,
  dieselzuschlagSumme: e.dieselzuschlagSumme,
  dieselStand: e.dieselStand,
  nettoSumme: e.nettoSumme,
  ustSatzProzent: e.ustSatzProzent,
  ustSumme: e.ustSumme,
  bruttoSumme: e.bruttoSumme,
  nettoJePalette: e.nettoJePalette,
});

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'GET') {
    return antwort(405, { ok: false, fehlertext: 'Methode nicht erlaubt.' });
  }

  const ip =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['client-ip'] ||
    event.headers['x-forwarded-for'] ||
    'unbekannt';
  if (!pruefeRateLimit(ip)) {
    return antwort(429, {
      ok: false,
      fehlertext: 'Zu viele Berechnungen in kurzer Zeit. Bitte einen Moment warten.',
    });
  }

  const diesel = await holeDieselStand();
  const params = event.queryStringParameters || {};

  // Ohne Eingabe: nur die Rahmendaten, damit die Seite ihren Kopf füllen kann.
  if (!params.paletten && !params.plz) {
    return antwort(200, {
      ok: true,
      maxPaletten: MAX_PALETTEN,
      dieselStand: diesel.stand,
      dieselzuschlagAktuell: undefined,
    });
  }

  const paletten = Number.parseInt(params.paletten ?? '', 10);
  const plz = (params.plz ?? '').trim();

  const ergebnis = berechneKundenFracht(
    { paletten, zielPLZ: plz },
    {
      frachtAufschlagProzent: FRACHT_AUFSCHLAG_PROZENT_DEFAULT,
      dieselCent: diesel.cent,
      dieselStand: diesel.stand,
    }
  );

  if (!ergebnis.ok || !ergebnis.ergebnis) {
    return antwort(400, {
      ok: false,
      fehler: ergebnis.fehler,
      fehlertext: ergebnis.fehlertext,
    });
  }

  return antwort(200, {
    ok: true,
    maxPaletten: MAX_PALETTEN,
    ergebnis: oeffentlichesErgebnis(ergebnis.ergebnis),
  });
};
