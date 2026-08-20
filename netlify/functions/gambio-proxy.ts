/**
 * Durchleitung zur Gambio-REST-API (Notbetrieb)
 *
 * Warum es das gibt:
 * Der Shop-Server 185.194.237.152 verwirft sämtliche Pakete unseres Backend-VPS
 * (76.13.5.157) — nachgemessen: 100 % Paketverlust zum Shop, 0 % zur Nachbar-IP im
 * selben Netz, während der Shop von überall sonst antwortet. Solange die Sperre
 * besteht, kommt das Backend nicht an die Bestellungen. Netlify hat andere
 * Ausgangs-IPs und ist nicht betroffen.
 *
 * Diese Function reicht Anfragen an die Gambio-API durch und hängt die Zugangsdaten
 * an. Sie ist bewusst KEIN allgemeiner Proxy:
 *   - Ziel ist fest auf GAMBIO_SHOP_URL + /api.php/v2 verdrahtet, es gibt keinen
 *     Parameter für eine freie Ziel-URL. Sonst wäre das ein offener Proxy, über den
 *     Fremde beliebige Server über unsere Domain ansprechen könnten.
 *   - Ohne gültiges Token gibt es 401. Die übrigen Functions in diesem Verzeichnis
 *     sind ungeschützt — hier geht das nicht, dahinter hängen Kundendaten.
 *   - Die Gambio-Zugangsdaten stehen nur in den Netlify-Variablen. Sie werden nie
 *     vom Aufrufer entgegengenommen und nie zurückgegeben.
 *
 * Aktivierung im Backend: GAMBIO_PROXY_URL und GAMBIO_PROXY_TOKEN setzen.
 * Nach Aufhebung der Sperre beide Variablen entfernen — dann läuft wieder alles direkt.
 *
 * Erforderliche Netlify-Variablen:
 *   GAMBIO_SHOP_URL, GAMBIO_API_USER, GAMBIO_API_PASS, GAMBIO_PROXY_TOKEN
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';

/** Methoden, die der Gambio-Client tatsächlich verwendet. Alles andere wird abgelehnt. */
const ERLAUBTE_METHODEN = new Set(['GET', 'POST', 'PATCH', 'PUT']);

/** Obergrenze für den durchgereichten Body — die API bekommt nur kleine JSON-Payloads. */
const MAX_BODY_BYTES = 256 * 1024;

interface ProxyAnfrage {
  /** Pfad unterhalb von /api.php/v2, z. B. "/orders?per_page=100" */
  pfad?: unknown;
  methode?: unknown;
  body?: unknown;
}

/** Vergleich ohne Laufzeit-Seitenkanal — ein naiver === verrät das Token zeichenweise. */
function tokenStimmt(uebergeben: string | undefined, erwartet: string): boolean {
  if (!uebergeben) return false;
  const a = Buffer.from(uebergeben);
  const b = Buffer.from(erwartet);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Prüft den angefragten Pfad.
 *
 * Erlaubt ist ausschließlich ein relativer Pfad unterhalb der API-Wurzel. Alles, was
 * das Ziel verschieben könnte — absolute URLs, protokollrelative Adressen (`//host`),
 * Verzeichniswechsel oder eingebettete Zugangsdaten — wird abgewiesen.
 */
function pfadIstZulaessig(pfad: string): boolean {
  if (!pfad.startsWith('/')) return false;
  if (pfad.startsWith('//')) return false;
  if (pfad.includes('..')) return false;
  if (pfad.includes('@')) return false;
  if (/[\x00-\x1f\s\\]/.test(pfad)) return false;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(pfad)) return false;
  return true;
}

function antwort(status: number, daten: Record<string, unknown>) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(daten),
  };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return antwort(405, { error: 'Nur POST' });
  }

  const token = process.env.GAMBIO_PROXY_TOKEN;
  const shopUrl = process.env.GAMBIO_SHOP_URL;
  const user = process.env.GAMBIO_API_USER;
  const pass = process.env.GAMBIO_API_PASS;

  if (!token || !shopUrl || !user || !pass) {
    // Ohne Token wäre die Function offen — dann lieber gar nicht arbeiten.
    console.error('gambio-proxy: Konfiguration unvollständig');
    return antwort(500, { error: 'Proxy nicht konfiguriert' });
  }

  const uebergebenesToken =
    event.headers['x-proxy-token'] || event.headers['X-Proxy-Token'];
  if (!tokenStimmt(uebergebenesToken, token)) {
    return antwort(401, { error: 'Nicht autorisiert' });
  }

  let anfrage: ProxyAnfrage;
  try {
    anfrage = JSON.parse(event.body || '{}');
  } catch {
    return antwort(400, { error: 'Ungültiges JSON' });
  }

  const pfad = typeof anfrage.pfad === 'string' ? anfrage.pfad : '';
  if (!pfadIstZulaessig(pfad)) {
    return antwort(400, { error: 'Unzulässiger Pfad' });
  }

  const methode = typeof anfrage.methode === 'string' ? anfrage.methode.toUpperCase() : 'GET';
  if (!ERLAUBTE_METHODEN.has(methode)) {
    return antwort(405, { error: `Methode ${methode} nicht erlaubt` });
  }

  const körper = anfrage.body === undefined ? undefined : JSON.stringify(anfrage.body);
  if (körper && Buffer.byteLength(körper) > MAX_BODY_BYTES) {
    return antwort(413, { error: 'Body zu groß' });
  }

  const zielUrl = `${shopUrl.replace(/\/$/, '')}/api.php/v2${pfad}`;
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');

  try {
    const antwortVomShop = await fetch(zielUrl, {
      method: methode,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: körper,
    });

    const text = await antwortVomShop.text();

    // Bei abgelehnten Zugangsdaten einen Hinweis mitgeben. Bewusst nur Benutzername
    // und Passwortlaenge - damit laesst sich ein verstuemmelter Wert erkennen
    // (Shell-Expansion bei `netlify env:set` frisst $, ! und &), ohne ihn zu zeigen.
    if (antwortVomShop.status === 401) {
      console.error(
        `gambio-proxy: Shop lehnt Zugangsdaten ab. Benutzer="${user}", Passwortlaenge=${pass.length}`
      );
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 401,
          body: `Shop lehnt die Zugangsdaten ab. Netlify-Variablen pruefen: GAMBIO_API_USER="${user}", GAMBIO_API_PASS hat ${pass.length} Zeichen (erwartet: 15). Werte in der Weboberflaeche eintragen, nicht per CLI - die Shell frisst $, ! und &.`,
        }),
      };
    }

    // Statuscode und Rohtext unverändert weiterreichen, damit der Gambio-Client
    // im Backend seine eigene Fehlerbehandlung unverändert anwenden kann.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: antwortVomShop.status,
        body: text,
      }),
    };
  } catch (fehler) {
    // Absichtlich ohne Ziel-URL im Text — sie enthält zwar keine Zugangsdaten,
    // aber die Fehlermeldung geht an den Aufrufer zurück.
    console.error('gambio-proxy: Shop nicht erreichbar', fehler);
    return antwort(502, {
      error: `Shop von Netlify aus nicht erreichbar: ${
        fehler instanceof Error ? fehler.message : 'unbekannter Fehler'
      }`,
    });
  }
};
