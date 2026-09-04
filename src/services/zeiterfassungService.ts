/**
 * zeiterfassungService.ts
 *
 * Die EINZIGE Brücke der Oberfläche zur Zeiterfassung. Es gibt hier bewusst
 * keinen einzigen Appwrite-Aufruf: alles läuft über die Netlify Function
 * `/.netlify/functions/zeiterfassung`, die mit dem Server-API-Key arbeitet.
 *
 * Warum dieser Umweg — drei Gründe, die jeder für sich reichen würde:
 *
 * 1. Die Serverzeit ist die Wahrheit.
 *    Ein Stempel, dessen Zeitpunkt der Browser mitschickt, ist wertlos: die
 *    Systemuhr des Nutzers lässt sich in zehn Sekunden umstellen. Die Function
 *    setzt `zeitpunkt` ausschließlich selbst (`new Date().toISOString()`) und
 *    ignoriert alles, was von hier käme. Deshalb kennt `stempeln()` unten auch
 *    gar keinen Zeit-Parameter.
 *
 * 2. Arbeitszeiten anderer Personen sind nicht mitlesbar.
 *    `zeit_events` hat ein LEERES Permissions-Array — kein Client-Zugriff.
 *    Mit `read(users)` könnte jeder eingeloggte Kollege die Kommen- und
 *    Gehen-Zeiten aller anderen abfragen; das sind sensible Personendaten.
 *    Wer wessen Daten sehen darf, entscheidet die Function anhand des
 *    JWT-Kontos (eigene Events immer, alle nur mit Label `admin`/`zeitleitung`).
 *
 * 3. Events sind nicht löschbar.
 *    Der Nachweis nach ArbZG/MiLoG muss einer Prüfung standhalten. Die Kette
 *    ist append-only; eine Korrektur ist ein neues Event (`nachtragen`) und
 *    eine Rücknahme ein Storno-Vermerk (`stornieren`). Ein Client mit
 *    Schreibrecht auf die Collection könnte diese Eigenschaft aushebeln —
 *    also bekommt er keins.
 *
 * Fehler kommen von der Function als `{ error: '<deutscher Klartext>' }` und
 * werden hier zu einer Exception mit genau diesem Text. Die Aufrufer dürfen
 * `error.message` also direkt anzeigen.
 */

import { account } from '../config/appwrite';
import { istMockModusAktiv } from '../config/mockModus';
import type {
  StempelStatus,
  ZeitEvent,
  ZeitEventTyp,
  ZeitMitarbeiter,
} from '../types/zeiterfassung';

const FUNCTION_URL = '/.netlify/functions/zeiterfassung';

/**
 * Die vier Typen, die ein Mensch selbst stempeln kann. `storno` fehlt bewusst:
 * es entsteht nur über `stornieren()` und nie durch einen Knopfdruck am Terminal.
 */
export type StempelbarerTyp = Exclude<ZeitEventTyp, 'storno'>;

export interface StatusAntwort {
  /** Der über `userId` zugeordnete Datensatz — `null`, wenn keiner zugeordnet ist. */
  mitarbeiter: ZeitMitarbeiter | null;
  /** Label `admin` oder `zeitleitung` — serverseitig aus dem JWT gelesen. */
  istLeitung: boolean;
  status: StempelStatus;
  /** Alle Events des heutigen lokalen Tages (inkl. Stornos, für die Anzeige). */
  heute: ZeitEvent[];
  /** Lokales Datum (YYYY-MM-DD) laut Server. */
  datum: string;
  /** Serverzeit als ISO-String — Grundlage für laufende Tagesberechnungen. */
  serverZeit: string;
}

export interface StempelAntwort {
  event: ZeitEvent;
  status: StempelStatus;
}

export interface ZeitraumAntwort {
  events: ZeitEvent[];
  /** Die Mitarbeiter, auf die sich die Events beziehen — für die Namensanzeige. */
  mitarbeiter: ZeitMitarbeiter[];
}

/**
 * Zentraler Aufruf: JWT besorgen, POSTen, Fehler übersetzen.
 *
 * Das JWT ist kurzlebig und wird pro Aufruf frisch geholt — genauso wie im
 * userDirectoryService. Ein zwischengespeichertes Token wäre nach 15 Minuten
 * abgelaufen und würde ausgerechnet den Gehen-Stempel am Feierabend abweisen.
 */
async function ruf<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let jwt: string;
  try {
    ({ jwt } = await account.createJWT());
  } catch {
    throw new Error('Nicht angemeldet — bitte neu anmelden und erneut versuchen.');
  }

  // Die Sandbox meldet sich mit, damit die Function in die Mock-Datenbank
  // schreibt statt in die Produktion. Ohne dieses Flag landeten Testtempel im
  // echten Arbeitszeitnachweis — und der ist append-only, also nicht mehr
  // sauber zu bereinigen.
  const body: Record<string, unknown> = { action, ...params };
  if (istMockModusAktiv()) body.sandbox = true;

  let response: Response;
  try {
    response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-appwrite-jwt': jwt },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Keine Verbindung zum Server. Bitte Internetverbindung prüfen.');
  }

  // Bei einem Absturz der Function (502/504) kommt HTML statt JSON zurück.
  let daten: Record<string, unknown>;
  try {
    daten = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error(`Unerwartete Antwort vom Server (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const text = typeof daten.error === 'string' ? daten.error : '';
    throw new Error(text || `Zeiterfassung fehlgeschlagen (HTTP ${response.status}).`);
  }

  return daten as T;
}

export const zeiterfassungService = {
  /**
   * Wer bin ich, was darf ich, und wo stehe ich gerade?
   * Erste Abfrage jeder Ansicht — liefert auch die Serverzeit, damit ein
   * laufender Tag nicht gegen die (möglicherweise falsche) Browseruhr rechnet.
   */
  ladeStatus(): Promise<StatusAntwort> {
    return ruf<StatusAntwort>('status');
  },

  /**
   * Einen Stempel setzen. Der Zeitpunkt kommt vom Server, nicht von hier.
   *
   * `opts.mitarbeiterId` ist die Fremderfassung durch die Leitung (jemand hat
   * das Handy nicht dabei); für alle anderen antwortet die Function mit 403.
   * Unzulässige Übergänge (z.B. zweimal „kommen") kommen als 409 mit
   * sprechendem Text zurück.
   */
  stempeln(
    typ: StempelbarerTyp,
    opts: { mitarbeiterId?: string; notiz?: string } = {}
  ): Promise<StempelAntwort> {
    return ruf<StempelAntwort>('stempeln', {
      typ,
      ...(opts.mitarbeiterId ? { mitarbeiterId: opts.mitarbeiterId } : {}),
      ...(opts.notiz ? { notiz: opts.notiz } : {}),
    });
  },

  /**
   * Events eines Zeitraums (lokale Daten, beide einschließlich).
   *
   * `mitarbeiterId` wirkt nur für die Leitung; ein normaler Nutzer bekommt
   * serverseitig immer ausschließlich seine eigenen Events — der Parameter
   * wird dort ignoriert, nicht etwa mit einem Fehler quittiert.
   */
  ladeZeitraum(von: string, bis: string, mitarbeiterId?: string): Promise<ZeitraumAntwort> {
    return ruf<ZeitraumAntwort>('zeitraum', {
      von,
      bis,
      ...(mitarbeiterId ? { mitarbeiterId } : {}),
    });
  },

  /**
   * Vergessenen Stempel nachtragen (nur Leitung).
   *
   * `begruendung` ist Pflicht und steht später im Nachweis — ein Nachtrag ohne
   * Grund ist gegenüber einer Prüfung nicht haltbar. `zeitpunkt` ist ein voller
   * ISO-String und darf nicht in der Zukunft liegen.
   */
  nachtragen(p: {
    mitarbeiterId: string;
    typ: ZeitEventTyp;
    zeitpunkt: string;
    begruendung: string;
  }): Promise<{ event: ZeitEvent }> {
    return ruf<{ event: ZeitEvent }>('nachtragen', p);
  },

  /**
   * Ein Event aufheben (nur Leitung).
   *
   * Das Original bleibt unangetastet stehen; angelegt wird ein NEUES Event vom
   * Typ `storno`, das auf das alte zeigt. Zurückgegeben wird dieser
   * Storno-Vermerk, nicht das aufgehobene Event.
   */
  stornieren(eventId: string, begruendung: string): Promise<{ event: ZeitEvent }> {
    return ruf<{ event: ZeitEvent }>('stornieren', { eventId, begruendung });
  },

  /** Alle aktiven Mitarbeiter (nur Leitung) — für Auswahl und Fremderfassung. */
  ladeMitarbeiter(): Promise<{ mitarbeiter: ZeitMitarbeiter[] }> {
    return ruf<{ mitarbeiter: ZeitMitarbeiter[] }>('mitarbeiter');
  },

  /**
   * Portal-Konto mit einem Mitarbeiter verknüpfen (nur Admin-Label).
   * Leerer `userId`-String hebt die Zuordnung auf.
   */
  async zuordnen(mitarbeiterId: string, userId: string): Promise<void> {
    await ruf<{ ok: true }>('zuordnen', { mitarbeiterId, userId });
  },
};
