/**
 * Die Mengen- und Preislogik des Bestellportals.
 *
 * Hier bestellt ein Kunde ohne Aufsicht. Zwei Dinge dürfen deshalb nie
 * passieren: dass jemand eine Menge außerhalb der vereinbarten Toleranz
 * bestellt, und dass die Frachtpauschale nicht mitwandert, wenn die Tonnage
 * die Staffelgrenze überschreitet.
 */
import { describe, it, expect } from 'vitest';

const FRACHTSTAFFEL: Array<{ bisTonnen: number; preis: number }> = [
  { bisTonnen: 5.4, preis: 59.9 },
  { bisTonnen: 7.4, preis: 49.9 },
  { bisTonnen: 11.4, preis: 39.9 },
  { bisTonnen: 15.4, preis: 31.9 },
  { bisTonnen: 19.9, preis: 24.9 },
];
const frachtpauschale = (t: number): number => FRACHTSTAFFEL.find((s) => t < s.bisTonnen)?.preis ?? 0;

const MENGEN_TOLERANZ = 0.10;
const imRahmen = (alt: number, neu: number) =>
  neu >= alt * (1 - MENGEN_TOLERANZ) && neu <= alt * (1 + MENGEN_TOLERANZ);

describe('Frachtpauschale nach Tonnage', () => {
  it('folgt der Staffel aus dem Artikelstamm', () => {
    expect(frachtpauschale(3)).toBe(59.9);
    expect(frachtpauschale(5.39)).toBe(59.9);
    expect(frachtpauschale(5.4)).toBe(49.9);
    expect(frachtpauschale(7.4)).toBe(39.9);
    expect(frachtpauschale(12)).toBe(31.9);
    expect(frachtpauschale(16)).toBe(24.9);
  });

  it('entfällt bei großen Mengen — ab 19,9 t ist die Fracht eingepreist', () => {
    expect(frachtpauschale(20)).toBe(0);
    expect(frachtpauschale(25)).toBe(0);
  });

  it('wechselt die Stufe, wenn der Kunde die Menge erhöht', () => {
    // Genau der Fall, der ohne Neuberechnung falsch abgerechnet würde:
    // 5 t kosten 59,90 € Pauschale, 5,5 t nur noch 49,90 €.
    expect(frachtpauschale(5)).toBe(59.9);
    expect(frachtpauschale(5.5)).toBe(49.9);
  });
});

describe('Mengentoleranz ±10 %', () => {
  it('lässt Anpassungen im vereinbarten Rahmen zu', () => {
    expect(imRahmen(10, 9)).toBe(true);
    expect(imRahmen(10, 11)).toBe(true);
    expect(imRahmen(10, 10)).toBe(true);
  });

  it('weist alles außerhalb ab — dafür ruft der Kunde an', () => {
    expect(imRahmen(10, 8.9)).toBe(false);
    expect(imRahmen(10, 11.1)).toBe(false);
    // Der Klassiker: aus 2 t sollen 20 t werden.
    expect(imRahmen(2, 20)).toBe(false);
  });
});
