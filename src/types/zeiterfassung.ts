/**
 * Zeiterfassung — Arbeitszeitnachweis nach ArbZG/MiLoG.
 *
 * Grundsatz: die Event-Kette ist APPEND-ONLY. Ein Stempel wird nie geändert und
 * nie gelöscht; eine Korrektur ist ein neues Event. Das ist kein Selbstzweck —
 * der Nachweis muss einer Prüfung durch Zoll oder Arbeitsschutzbehörde standhalten,
 * und ein überschreibbarer Datensatz beweist nichts.
 *
 * Zwei Zeiten pro Event, die man nicht verwechseln darf:
 *  - `zeitpunkt` = wann das Ereignis fachlich stattfand (bei einem Nachtrag also
 *    in der Vergangenheit)
 *  - `erfasstAm` = wann der Datensatz entstand (immer Serverzeit, immer jetzt)
 *
 * Beide sind volle ISO-Strings in UTC. Für Tages- und Monatsgruppierung gibt es
 * zusätzlich `datum` als LOKALES Datum (Europe/Berlin) — ohne dieses Feld läge
 * ein Feierabend um 00:30 MESZ im Vortag, sobald man über UTC gruppiert.
 */

/** Collection-IDs — gespiegelt in scripts/setup-zeiterfassung.mjs. */
export const ZEIT_EVENTS_COLLECTION = 'zeit_events';
export const ZEIT_ABSCHLUESSE_COLLECTION = 'zeit_abschluesse';

/** Zeitzone des Betriebs. Alle lokalen Datumsgrenzen beziehen sich hierauf. */
export const BETRIEBS_ZEITZONE = 'Europe/Berlin';

/**
 * Ereignisarten.
 *
 * `storno` hebt ein früheres Event auf (per `bezugEventId`), statt es zu löschen.
 */
export type ZeitEventTyp = 'kommen' | 'pause_start' | 'pause_ende' | 'gehen' | 'storno';

/** Woher der Stempel kam. `kiosk` ist für die spätere Tablet-/QR-Stufe reserviert. */
export type ZeitQuelle = 'web' | 'kiosk' | 'nachtrag';

export interface ZeitEvent {
  id: string;
  /** Dokument-ID aus `schicht_mitarbeiter` — NICHT die Appwrite-User-ID. */
  mitarbeiterId: string;
  typ: ZeitEventTyp;
  /** Fachlicher Zeitpunkt, volles ISO in UTC. */
  zeitpunkt: string;
  /**
   * SCHICHTTAG (YYYY-MM-DD, lokal) — der Tag, an dem die Schicht begonnen hat,
   * NICHT zwingend der Kalendertag des Zeitpunkts.
   *
   * Ein Feierabend um 00:30 trägt das Datum des Vortags, weil er zu der Schicht
   * gehört, die um 22:00 begann. Ohne diese Zuordnung zerfiele jede über
   * Mitternacht laufende Schicht in zwei halbe Vorgänge, und die Auswertung
   * (die nach `datum` filtert) fände an beiden Tagen nur einen einzelnen
   * Stempel — Ergebnis wären null bezahlte Minuten.
   *
   * Vergeben wird das Feld ausschließlich serverseitig in
   * netlify/functions/zeiterfassung.ts (`ermittleSchichttag`).
   */
  datum: string;
  quelle: ZeitQuelle;
  /** Appwrite-User-ID dessen, der gestempelt hat (bei Fremderfassung ≠ Mitarbeiter). */
  erfasstVonUserId: string;
  erfasstVonName: string;
  /** Serverzeitpunkt des Schreibens, volles ISO in UTC. */
  erfasstAm: string;
  /** Bei `storno`: das aufgehobene Event. */
  bezugEventId?: string;
  /** Pflicht bei Nachtrag und Storno — der Grund gehört zum Nachweis. */
  begruendung?: string;
  notiz?: string;
}

/** Status eines Monatsabschlusses. */
export type AbschlussStatus = 'offen' | 'freigegeben' | 'bestaetigt';

export interface ZeitAbschluss {
  id: string;
  mitarbeiterId: string;
  /** YYYY-MM */
  monat: string;
  status: AbschlussStatus;
  istMinuten: number;
  sollMinuten: number;
  freigegebenVonUserId?: string;
  freigegebenVonName?: string;
  freigegebenAm?: string;
  bestaetigtAm?: string;
  notiz?: string;
}

/** Ein zusammenhängender Arbeitsabschnitt zwischen Kommen und Gehen. */
export interface Arbeitsabschnitt {
  von: string;
  bis: string | null;
  minuten: number;
  /** true, solange kein `gehen` vorliegt — der Abschnitt läuft noch. */
  laeuft: boolean;
}

export interface Pausenabschnitt {
  von: string;
  bis: string | null;
  minuten: number;
  laeuft: boolean;
}

/** Was am Ende eines Tages zählt. */
export interface TagesAuswertung {
  datum: string;
  mitarbeiterId: string;
  events: ZeitEvent[];
  abschnitte: Arbeitsabschnitt[];
  pausen: Pausenabschnitt[];
  /** Anwesenheit brutto, ohne Pausenabzug. */
  bruttoMinuten: number;
  /** Tatsächlich gestempelte Pause. */
  pausenMinuten: number;
  /**
   * Zusätzlich abgezogene Minuten, wenn die gestempelte Pause die gesetzliche
   * Mindestpause nach § 4 ArbZG unterschreitet. Sichtbar, nie heimlich.
   */
  gesetzlicherPausenabzug: number;
  /** brutto − Pause − gesetzlicher Abzug. Das ist die Arbeitszeit. */
  nettoMinuten: number;
  /** Erster Stempel des Tages (lokal), für die Tabellenanzeige. */
  beginn: string | null;
  ende: string | null;
  /** true, wenn der Tag noch offen ist (kommen ohne gehen). */
  laeuft: boolean;
  /** true, wenn die Event-Kette nicht aufgeht — braucht eine Korrektur. */
  unvollstaendig: boolean;
  hinweise: ZeitHinweis[];
}

export type HinweisSchwere = 'info' | 'warnung' | 'verstoss';

export interface ZeitHinweis {
  schwere: HinweisSchwere;
  /** Kurztext für die Anzeige. */
  text: string;
  /** Rechtsgrundlage, falls es eine gibt — macht den Hinweis nachvollziehbar. */
  grundlage?: string;
}

/** Was der aktuelle Stempelzustand eines Mitarbeiters ist. */
export type StempelStatus = 'abwesend' | 'arbeitet' | 'pause';

export interface ZeitMitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
  name: string;
  position?: string;
  farbe: string;
  istAktiv: boolean;
  maxStundenProWoche: number;
  /** Appwrite-User-ID, falls dem Mitarbeiter ein Portal-Konto zugeordnet ist. */
  userId?: string;
}

/* ------------------------------------------------------------------ *
 * Gesetzliche Grenzwerte
 * ------------------------------------------------------------------ */

/**
 * Mindestpausen nach § 4 ArbZG: ab mehr als 6 Stunden 30 Minuten, ab mehr als
 * 9 Stunden 45 Minuten. Maßgeblich ist die Arbeitszeit ohne Pause; da die Pause
 * selbst das Ergebnis beeinflusst, wird gegen die Bruttozeit geprüft und danach
 * einmal nachkorrigiert (siehe `berechneGesetzlichePause`).
 */
export const PAUSE_AB_6H = 30;
export const PAUSE_AB_9H = 45;

/** § 3 ArbZG: werktäglich 8 Stunden, ausnahmsweise 10. */
export const HOECHSTARBEITSZEIT_MINUTEN = 10 * 60;
export const REGELARBEITSZEIT_MINUTEN = 8 * 60;

/** § 5 ArbZG: 11 Stunden ununterbrochene Ruhezeit nach Arbeitsende. */
export const RUHEZEIT_MINUTEN = 11 * 60;

/**
 * Ein Tag, an dem um Mitternacht noch nicht ausgestempelt wurde, wird beim
 * Auswerten hier gekappt und als unvollständig markiert. Ohne diese Grenze
 * liefe ein vergessener Stempel als 40-Stunden-Schicht weiter.
 */
export const MAX_TAGESDAUER_MINUTEN = 24 * 60;

/* ------------------------------------------------------------------ *
 * Zeit-Helfer (zeitzonenfest)
 * ------------------------------------------------------------------ */

/**
 * Lokales Datum (YYYY-MM-DD) eines Zeitpunkts in der Betriebszeitzone.
 *
 * Bewusst über Intl statt über `toISOString().split('T')[0]`: Letzteres liefert
 * das UTC-Datum und verschiebt jeden Stempel zwischen Mitternacht und 02:00 MESZ
 * auf den Vortag. Das schwedische Locale liefert als einziges ISO-Reihenfolge.
 */
export function lokalesDatum(zeitpunkt: string | Date, zeitzone = BETRIEBS_ZEITZONE): string {
  const d = typeof zeitpunkt === 'string' ? new Date(zeitpunkt) : zeitpunkt;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone }).format(d);
}

/** Lokale Uhrzeit (HH:MM) eines Zeitpunkts in der Betriebszeitzone. */
export function lokaleUhrzeit(zeitpunkt: string | Date, zeitzone = BETRIEBS_ZEITZONE): string {
  const d = typeof zeitpunkt === 'string' ? new Date(zeitpunkt) : zeitpunkt;
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: zeitzone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Dauer zwischen zwei ISO-Zeitpunkten in Minuten.
 *
 * Immer aus den UTC-Zeitstempeln gerechnet, nie aus HH:MM-Differenzen: in der
 * Nacht der Zeitumstellung dauert eine Schicht von 22:00 bis 06:00 einmal 9 und
 * einmal 7 Stunden, und genau das ist die bezahlte Zeit.
 */
export function minutenZwischen(von: string, bis: string): number {
  return Math.max(0, Math.round((new Date(bis).getTime() - new Date(von).getTime()) / 60000));
}

/** Minuten als "7:30 h" — die Schreibweise für Stundensummen. */
export function formatiereStunden(minuten: number): string {
  const negativ = minuten < 0;
  const abs = Math.abs(Math.round(minuten));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${negativ ? '−' : ''}${h}:${String(m).padStart(2, '0')} h`;
}

/**
 * Gesetzliche Mindestpause für eine gegebene Arbeitszeit (§ 4 ArbZG).
 *
 * Übergeben wird die tatsächlich geleistete Arbeitszeit, also Anwesenheit minus
 * gestempelter Pause. Wer 6:20 anwesend ist und 30 Minuten Pause gemacht hat,
 * arbeitet 5:50 und schuldet nichts; wer 6:20 ohne Pause durcharbeitet, liegt
 * über sechs Stunden und schuldet 30 Minuten.
 *
 * An der 9-Stunden-Schwelle ist das Ergebnis bewusst nicht monoton: bei 9:30 h
 * Anwesenheit führen 29 Minuten Pause zu 45 Minuten Pflicht (netto 8:45 h),
 * 30 Minuten Pause dagegen nur zu 30 Minuten Pflicht (netto 9:00 h). Das folgt
 * unmittelbar aus dem Gesetzeswortlaut und ist kein Rundungsfehler.
 */
export function berechneGesetzlichePause(arbeitsMinutenOhnePause: number): number {
  if (arbeitsMinutenOhnePause > 9 * 60) return PAUSE_AB_9H;
  if (arbeitsMinutenOhnePause > 6 * 60) return PAUSE_AB_6H;
  return 0;
}
