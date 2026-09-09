/**
 * Was ist eine echte Notiz zu einer Anfrage — und was nur Technik?
 *
 * Vorschlag „Anfragen: Kundennotiz ist Schrott, wenn nichts drinsteht" (09/2026).
 * Befund im Bestand am 04.09.2026: Von 99 gefüllten `notizen`-Feldern trugen
 * **98** den Satz „Status nachgetragen aus E-Mail-Protokoll" — einen Vermerk aus
 * einem einmaligen Bereinigungslauf (scripts/bereinige-anfragen-altbestand.ts).
 * Genau eine Anfrage hatte eine echte Notiz. Der Dialog zeigte trotzdem bei fast
 * jeder Anfrage einen auffälligen Kasten „Wichtige Kundennotiz" — der Kasten war
 * also fast immer da und fast immer ohne Inhalt, der jemanden interessiert.
 *
 * Dazu kommt der Wichtig-Marker: `markiereAlsWichtig` legte den Text `⭐ WICHTIG`
 * in dasselbe Feld. Eine als wichtig markierte Anfrage zeigte damit einen
 * Notizkasten, in dem nichts als der Marker stand.
 *
 * Diese Datei trennt beides sauber: Der Marker ist ein Flag, technische Vermerke
 * werden ausgeblendet, und übrig bleibt der Text, den ein Mensch geschrieben hat.
 */

export const WICHTIG_MARKER = '⭐ WICHTIG';

/**
 * Sätze, die eine Maschine hinterlassen hat. Sie sind keine Notiz und gehören
 * nicht in einen Kasten, der Aufmerksamkeit verlangt.
 */
const TECHNISCHE_VERMERKE = [/^Status nachgetragen aus E-Mail-Protokoll\.?$/i];

const istTechnisch = (zeile: string): boolean => TECHNISCHE_VERMERKE.some((r) => r.test(zeile.trim()));

/** Trägt die Anfrage die Wichtig-Markierung? */
export const istWichtig = (notizen?: string | null): boolean =>
  !!notizen && notizen.includes('WICHTIG');

/**
 * Der lesbare Teil der Notiz: ohne Wichtig-Marker, ohne technische Vermerke,
 * ohne leere Zeilen am Rand. Leerer String heißt „es gibt nichts zu zeigen".
 */
export const notizText = (notizen?: string | null): string => {
  if (!notizen) return '';
  return notizen
    .split('\n')
    .map((z) => z.replace(WICHTIG_MARKER, '').replace(/^⭐\s*WICHTIG/i, '').trim())
    .filter((z) => z !== '' && !istTechnisch(z))
    .join('\n')
    .trim();
};

/** Gibt es überhaupt etwas anzuzeigen? */
export const hatNotiz = (notizen?: string | null): boolean => notizText(notizen) !== '';

/**
 * Setzt oder entfernt die Wichtig-Markierung, OHNE den vorhandenen Text zu
 * verlieren. Vorher überschrieb das Markieren die ganze Notiz — eine echte
 * Kundennotiz war nach einem Klick auf „Als wichtig markieren" weg.
 */
export const setzeWichtig = (notizen: string | undefined | null, wichtig: boolean): string => {
  const text = notizText(notizen);
  if (!wichtig) return text;
  return text ? `${WICHTIG_MARKER}\n${text}` : WICHTIG_MARKER;
};
