import { describe, it, expect } from 'vitest';
import { istAbgeschlosseneEingabe, leseZahl } from '../numericInputUebernahme';

/**
 * Regression zu Vorschlag [20]: „Menge von Hydrocourt über die Klickfunktion auf
 * 2 gesetzt. Die Zwei erscheint zwar, aber die Summe wird nicht neu berechnet
 * und es wird auch nicht auf der AB als 2 gedruckt."
 */
describe('istAbgeschlosseneEingabe', () => {
  it('meldet Spinner-Klicks sofort — sie sind fertige Eingaben', () => {
    // Browser lassen inputType bei Spinner und Pfeiltaste leer.
    expect(istAbgeschlosseneEingabe(undefined, '2')).toBe(true);
    expect(istAbgeschlosseneEingabe(undefined, '2.5')).toBe(true);
    expect(istAbgeschlosseneEingabe(undefined, '0')).toBe(true);
  });

  it('hält getippte Eingaben zurück, bis das Feld verlassen wird', () => {
    // Sonst würde aus einer halb getippten "0," sofort eine 0 im Formular.
    expect(istAbgeschlosseneEingabe('insertText', '2')).toBe(false);
    expect(istAbgeschlosseneEingabe('deleteContentBackward', '')).toBe(false);
    expect(istAbgeschlosseneEingabe('insertFromPaste', '17')).toBe(false);
  });

  it('schreibt keine 0 ins Formular, wenn der Spinner ein leeres Feld hinterlässt', () => {
    expect(istAbgeschlosseneEingabe(undefined, '')).toBe(false);
    expect(istAbgeschlosseneEingabe(undefined, '   ')).toBe(false);
  });

  it('meldet keinen unlesbaren Inhalt', () => {
    expect(istAbgeschlosseneEingabe(undefined, 'abc')).toBe(false);
  });
});

describe('leseZahl', () => {
  it('liest englische Schreibweise', () => {
    expect(leseZahl('2')).toBe(2);
    expect(leseZahl('2.5')).toBe(2.5);
  });

  it('liest deutsche Schreibweise samt Tausenderpunkt', () => {
    expect(leseZahl('1.234,5', true)).toBe(1234.5);
    expect(leseZahl('18,75', true)).toBe(18.75);
  });

  it('nimmt ein Komma auch ohne deutsches Format an', () => {
    expect(leseZahl('2,5')).toBe(2.5);
  });

  it('macht aus Leerem und Unlesbarem eine 0 — wie handleBlur bisher', () => {
    expect(leseZahl('')).toBe(0);
    expect(leseZahl('abc')).toBe(0);
  });

  it('behandelt denselben String je nach Format unterschiedlich', () => {
    // "1.234" ist deutsch eintausendzweihundertvierunddreißig, englisch 1,234.
    expect(leseZahl('1.234', true)).toBe(1234);
    expect(leseZahl('1.234', false)).toBe(1.234);
  });
});
