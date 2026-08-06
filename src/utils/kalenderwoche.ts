/**
 * Kalenderwochen-Utilities nach ISO 8601 — die einzige KW-Quelle der Anwendung.
 *
 * Hintergrund: Vor dieser Datei existierten acht KW-Berechnungen im Repo, zwei davon
 * naiv (Tag-des-Jahres / 7). Die weichen an Jahresrändern ab: der 29.12.2025 liegt
 * nach ISO in KW 1/2026, naiv gerechnet in KW 53.
 *
 * Alle Datums-Strings sind lokale ISO-Daten (YYYY-MM-DD) ohne Zeitanteil.
 * Bewusst NICHT über toISOString(): ein lokal auf Mitternacht gesetztes Datum liegt
 * in UTC am Vortag, wodurch aus Montag der Sonntag würde.
 */

/** Wochentagskürzel ab Montag. */
export const WOCHENTAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

/** Wochentagsnamen ab Montag — die Schreibweise der Excel-Dispoplanung. */
export const WOCHENTAGE_LANG = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const;

/**
 * Formatiert ein Datum als lokales ISO-Datum (YYYY-MM-DD).
 */
export function formatISODatum(datum: Date): string {
  const monat = String(datum.getMonth() + 1).padStart(2, '0');
  const tag = String(datum.getDate()).padStart(2, '0');
  return `${datum.getFullYear()}-${monat}-${tag}`;
}

/**
 * Liest ein ISO-Datum (YYYY-MM-DD) als lokale Mitternacht ein.
 *
 * `new Date('2026-03-16')` würde als UTC-Mitternacht interpretiert und in Zeitzonen
 * westlich von Greenwich auf den Vortag fallen.
 */
export function parseISODatum(datumStr: string): Date {
  const [jahr, monat, tag] = datumStr.split('-').map(Number);
  return new Date(jahr, monat - 1, tag);
}

/**
 * Kalenderwoche nach ISO 8601 (1–53).
 *
 * Die Woche mit dem ersten Donnerstag des Jahres ist KW 1.
 */
export function getISOWoche(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const wochentag = d.getUTCDay() || 7; // Sonntag (0) -> 7
  d.setUTCDate(d.getUTCDate() + 4 - wochentag); // auf den Donnerstag der Woche
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jahresStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Das Jahr, zu dem die ISO-Kalenderwoche eines Datums gehört.
 *
 * Weicht am Jahresrand vom Kalenderjahr ab: der 29.12.2025 gehört zu KW 1 / 2026,
 * der 01.01.2027 zu KW 53 / 2026.
 */
export function getISOWochenJahr(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const wochentag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wochentag);
  return d.getUTCFullYear();
}

/**
 * Montag der Woche, in der das Datum liegt (lokale Mitternacht).
 */
export function getMontag(datum: Date): Date {
  const d = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate());
  const wochentag = d.getDay() || 7; // Sonntag (0) -> 7
  d.setDate(d.getDate() - (wochentag - 1));
  return d;
}

/**
 * Montag einer bestimmten ISO-Kalenderwoche.
 *
 * Anker ist der 4. Januar — er liegt nach ISO-Definition immer in KW 1.
 */
export function getMontagDerKW(kw: number, jahr: number): Date {
  const vierterJanuar = new Date(jahr, 0, 4);
  const montagKW1 = getMontag(vierterJanuar);
  montagKW1.setDate(montagKW1.getDate() + (kw - 1) * 7);
  return montagKW1;
}

/**
 * Anzahl der ISO-Kalenderwochen eines Jahres (52 oder 53).
 */
export function getAnzahlKWImJahr(jahr: number): number {
  // Der 28. Dezember liegt immer in der letzten KW des Jahres.
  return getISOWoche(new Date(jahr, 11, 28));
}

/**
 * Die Tage einer Woche ab dem übergebenen Montag.
 *
 * @param anzahl Anzahl der Tage; die Dispo plant Montag bis Samstag (6).
 */
export function getWochentage(montag: Date, anzahl = 7): Date[] {
  return Array.from({ length: anzahl }, (_, i) => {
    const d = new Date(montag.getFullYear(), montag.getMonth(), montag.getDate());
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * Verschiebt eine Kalenderwoche um n Wochen und rollt dabei über Jahresgrenzen.
 */
export function verschiebeKW(
  kw: number,
  jahr: number,
  wochen: number
): { kw: number; jahr: number } {
  const montag = getMontagDerKW(kw, jahr);
  montag.setDate(montag.getDate() + wochen * 7);
  return { kw: getISOWoche(montag), jahr: getISOWochenJahr(montag) };
}

/**
 * Die aktuelle Kalenderwoche.
 */
export function getAktuelleKW(): { kw: number; jahr: number } {
  const heute = new Date();
  return { kw: getISOWoche(heute), jahr: getISOWochenJahr(heute) };
}

/**
 * Prüft, ob ein ISO-Datum in einer bestimmten Kalenderwoche liegt.
 *
 * Ohne `jahr` wird nur die Wochennummer verglichen — das entspricht dem bisherigen
 * Verhalten des Dispo-Filters und ist über Jahresgrenzen hinweg mehrdeutig.
 */
export function istInKW(datumStr: string | undefined, kw: number, jahr?: number): boolean {
  if (!datumStr) return false;
  const datum = parseISODatum(datumStr.slice(0, 10));
  if (Number.isNaN(datum.getTime())) return false;
  if (getISOWoche(datum) !== kw) return false;
  return jahr === undefined || getISOWochenJahr(datum) === jahr;
}

/**
 * Zeitraum einer Kalenderwoche als ISO-Daten — für Appwrite-Bereichsabfragen.
 *
 * @param anzahlTage 6 liefert Montag bis Samstag, 7 bis Sonntag.
 */
export function getKWZeitraum(
  kw: number,
  jahr: number,
  anzahlTage = 7
): { von: string; bis: string } {
  const montag = getMontagDerKW(kw, jahr);
  const letzterTag = new Date(montag);
  letzterTag.setDate(letzterTag.getDate() + (anzahlTage - 1));
  return { von: formatISODatum(montag), bis: formatISODatum(letzterTag) };
}

/**
 * Formatiert eine Kalenderwoche mit Zeitraum, z. B. "KW 12 · 16.03.–21.03.2026".
 */
export function formatKWMitZeitraum(kw: number, jahr: number, anzahlTage = 6): string {
  const montag = getMontagDerKW(kw, jahr);
  const letzterTag = new Date(montag);
  letzterTag.setDate(letzterTag.getDate() + (anzahlTage - 1));
  const tagMonat = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
  return `KW ${kw} · ${tagMonat(montag)}–${tagMonat(letzterTag)}${letzterTag.getFullYear()}`;
}

/**
 * Kurzformat für Rasterköpfe, z. B. "16.03.".
 */
export function formatTagKurz(datum: Date): string {
  return `${String(datum.getDate()).padStart(2, '0')}.${String(datum.getMonth() + 1).padStart(2, '0')}.`;
}

/**
 * Prüft, ob ein Datum der heutige Tag ist.
 */
export function istHeute(datum: Date): boolean {
  const heute = new Date();
  return (
    datum.getDate() === heute.getDate() &&
    datum.getMonth() === heute.getMonth() &&
    datum.getFullYear() === heute.getFullYear()
  );
}
