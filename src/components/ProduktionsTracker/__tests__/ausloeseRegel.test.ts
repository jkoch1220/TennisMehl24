import { describe, expect, it } from 'vitest';
import { brauchtHalten, darfSofortBuchen } from '../BuchenTaste';
import type { TastenZustand } from '../BuchenTaste';

/**
 * Regressionsschutz für einen Fehler, der die Kernsicherung des Trackers
 * aushebelte.
 *
 * Die Buchen-Taste verlangt bei einer unplausiblen Menge 800 ms Halten. Der
 * globale Tastatur-Handler prüfte aber `!fehlt` — also nur, ob Pflichtangaben
 * da sind. Der Warnzustand fiel durch dieses Raster: Wer am Desktop 250 t statt
 * 25 t eintippte und Enter drückte, buchte die Fehlmenge ohne jede Reibung in
 * den Lagerbestand.
 *
 * Die Regel lebt jetzt an EINER Stelle. Diese Tests halten fest, dass 'warnung'
 * niemals sofort auslöst und niemals ohne Halte-Pfad dasteht.
 */

const ALLE: TastenZustand[] = [
  'bereit',
  'gesperrt',
  'warnung',
  'speichert',
  'erfolg',
  'vorgemerkt',
  'fehler',
];

describe('Auslöseregel der Buchen-Taste', () => {
  it('lässt genau den Zustand "bereit" sofort buchen', () => {
    expect(ALLE.filter(darfSofortBuchen)).toEqual(['bereit']);
  });

  it('bucht im Warnzustand NICHT sofort — das war der Fehler', () => {
    expect(darfSofortBuchen('warnung')).toBe(false);
  });

  it('verlangt genau im Warnzustand die Halte-Geste', () => {
    expect(ALLE.filter(brauchtHalten)).toEqual(['warnung']);
  });

  it('lässt keinen Zustand beides zugleich zu', () => {
    for (const z of ALLE) {
      expect(darfSofortBuchen(z) && brauchtHalten(z)).toBe(false);
    }
  });

  it('lässt den Warnzustand nicht unauslösbar werden', () => {
    // Sonst wäre die Buchung bei einer Warnung gar nicht mehr möglich.
    expect(darfSofortBuchen('warnung') || brauchtHalten('warnung')).toBe(true);
  });

  it('hält gesperrte und laufende Zustände von beiden Wegen fern', () => {
    for (const z of ['gesperrt', 'speichert'] as TastenZustand[]) {
      expect(darfSofortBuchen(z)).toBe(false);
      expect(brauchtHalten(z)).toBe(false);
    }
  });
});
