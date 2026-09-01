import { describe, it, expect } from 'vitest';
import { formatNumberForInput, cleanNumberInput, parseNumberValue } from '../numberInput';

/**
 * Regression: Bis 08/2026 lief die Anzeige durch `.replace(/\.?0+$/, '')`.
 * Der Ausdruck sollte überflüssige Nachkommanullen entfernen, war aber nicht
 * auf den Nachkommateil begrenzt — er fraß jede Null am Zahlenende.
 *
 * In der Dispo hieß das: 1000 kg eintragen, Feld verlassen, „1" steht da.
 * Betroffen waren auch alle Kostenrechner.
 */
describe('formatNumberForInput', () => {
  it('lässt Zahlen mit Nullen am Ende unversehrt', () => {
    expect(formatNumberForInput(10)).toBe('10');
    expect(formatNumberForInput(20)).toBe('20');
    expect(formatNumberForInput(50)).toBe('50');
    expect(formatNumberForInput(100)).toBe('100');
    expect(formatNumberForInput(1000)).toBe('1000');
    expect(formatNumberForInput(24000)).toBe('24000');
  });

  it('gibt Nachkommastellen korrekt aus', () => {
    expect(formatNumberForInput(25.5)).toBe('25.5');
    expect(formatNumberForInput(20.5)).toBe('20.5');
    expect(formatNumberForInput(98.7)).toBe('98.7');
    // toString() kürzt die schreibbare Null von sich aus
    expect(formatNumberForInput(20.50)).toBe('20.5');
  });

  it('zeigt 0 als "0"', () => {
    expect(formatNumberForInput(0)).toBe('0');
  });

  it('behält einstellige Zahlen', () => {
    expect(formatNumberForInput(1)).toBe('1');
    expect(formatNumberForInput(9)).toBe('9');
  });
});

describe('cleanNumberInput', () => {
  it('entfernt führende Nullen, aber nicht die Zahl selbst', () => {
    expect(cleanNumberInput('080')).toBe('80');
    expect(cleanNumberInput('0.5')).toBe('0.5');
    expect(cleanNumberInput('0,5')).toBe('0.5');
  });

  it('lässt nur einen Dezimaltrenner zu', () => {
    expect(cleanNumberInput('1.2.3')).toBe('1.23');
  });

  it('wirft ungültige Zeichen weg', () => {
    expect(cleanNumberInput('12abc')).toBe('12');
  });
});

describe('parseNumberValue', () => {
  it('macht aus Leerem eine 0', () => {
    expect(parseNumberValue('')).toBe(0);
    expect(parseNumberValue('-')).toBe(0);
  });

  it('liest gültige Zahlen', () => {
    expect(parseNumberValue('1000')).toBe(1000);
    expect(parseNumberValue('25.5')).toBe(25.5);
  });
});
