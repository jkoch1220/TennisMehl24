/**
 * Wann meldet ein Zahlenfeld seinen Wert an das Formular weiter?
 *
 * Hintergrund: `NumericInput` hielt den Wert bis 08/2026 ausschließlich lokal
 * und reichte ihn erst bei `onBlur` nach oben. Für getippte Eingaben ist das
 * gewollt — sonst wird aus einer halb getippten „0," sofort eine 0, und das
 * Feld springt einem beim Schreiben unter den Fingern weg.
 *
 * Für die Pfeilchen am Feld (Spinner) und die Pfeiltasten war es dagegen ein
 * Fehler mit Außenwirkung: Der Klick erhöhte nur die Anzeige, das Formular
 * behielt den alten Wert. Wer die Menge von 1 auf 2 klickte und speicherte,
 * bekam eine Auftragsbestätigung über 1 Tonne. Gemeldet als Vorschlag [20]
 * („Menge hochklicken funktioniert nicht richtig").
 *
 * Ein Spinner-Klick ist — anders als ein Tastendruck — eine ABGESCHLOSSENE
 * Eingabe: Der Wert ist nach dem Klick immer eine vollständige Zahl. Er darf
 * darum sofort durchgereicht werden.
 *
 * Erkannt wird das an `InputEvent.inputType`: Browser setzen das Feld bei
 * getippten Änderungen ('insertText', 'deleteContentBackward', …), lassen es
 * bei Spinner-Klicks und Pfeiltasten an `<input type="number">` aber leer.
 */

/**
 * Soll der Wert sofort ans Formular gemeldet werden, oder erst beim Verlassen
 * des Feldes?
 *
 * @param inputType `nativeEvent.inputType` des Change-Events; undefined bei
 *                  Spinner-Klick und Pfeiltaste.
 * @param rohwert   Der neue Feldinhalt.
 */
export const istAbgeschlosseneEingabe = (
  inputType: string | undefined,
  rohwert: string
): boolean => {
  // Getippt: erst bei Blur übernehmen, damit Zwischenstände nicht stören.
  if (inputType) return false;

  // Spinner/Pfeiltaste, aber Feld leer (z.B. Pfeil-runter auf leerem Feld):
  // nichts melden, sonst schreiben wir eine 0 ins Formular, die niemand wollte.
  const wert = rohwert.trim();
  if (wert === '') return false;

  return Number.isFinite(Number(wert.replace(',', '.')));
};

/**
 * Liest den Feldinhalt als Zahl.
 *
 * `formatGerman` steuert, ob Tausenderpunkte entfernt werden: „1.234,5" ist im
 * deutschen Format 1234,5 — ohne das Flag wäre derselbe String die englische
 * Schreibweise und müsste anders gelesen werden.
 *
 * Nicht lesbare Eingaben ergeben 0, wie bisher in `handleBlur`.
 */
export const leseZahl = (rohwert: string, formatGerman = false): number => {
  const vorbereitet = formatGerman
    ? rohwert.replace(/\./g, '').replace(',', '.')
    : rohwert.replace(',', '.');
  return parseFloat(vorbereitet) || 0;
};
