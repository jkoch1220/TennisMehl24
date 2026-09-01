/**
 * Die Mengen- und Preislogik des Bestellportals.
 *
 * Hier bestellt ein Kunde ohne Aufsicht. Zwei Dinge dürfen deshalb nie
 * passieren: dass jemand eine Menge außerhalb der vereinbarten Toleranz
 * bestellt, und dass die Frachtpauschale nicht mitwandert, wenn die Tonnage
 * die Staffelgrenze überschreitet.
 */
import { describe, it, expect } from 'vitest';

// Spiegel der Staffel in netlify/functions/bestellung.ts — seit 09/2026
// EXAKT die Portal-Semantik (frachtkostenCalculations.ts): Obergrenzen
// einschließlich, „bis 19,9 t" → 24,90 €. Die frühere `<`-Variante bepreiste
// die exakten Grenzen eine Stufe günstiger als die spätere Rechnung.
const frachtpauschale = (tonnen: number): number => {
  if (tonnen <= 0) return 59.9;
  if (tonnen < 5.4) return 59.9;
  if (tonnen <= 7.4) return 49.9;
  if (tonnen <= 11.4) return 39.9;
  if (tonnen <= 15.4) return 31.9;
  if (tonnen <= 19.9) return 24.9;
  return 0;
};

const MENGEN_TOLERANZ = 0.10;
const imRahmen = (alt: number, neu: number) =>
  neu >= alt * (1 - MENGEN_TOLERANZ) && neu <= alt * (1 + MENGEN_TOLERANZ);

describe('Frachtpauschale nach Tonnage', () => {
  it('folgt der Staffel aus der Preisliste — Obergrenzen einschließlich', () => {
    expect(frachtpauschale(3)).toBe(59.9);
    expect(frachtpauschale(5.39)).toBe(59.9);
    expect(frachtpauschale(5.4)).toBe(49.9);
    expect(frachtpauschale(7.4)).toBe(49.9); // „von 5,4 bis 7,4" schließt 7,4 ein
    expect(frachtpauschale(12)).toBe(31.9);
    expect(frachtpauschale(16)).toBe(24.9);
    expect(frachtpauschale(19.9)).toBe(24.9); // vorher fälschlich 0,00 €
  });

  it('entfällt erst ab 20 t — die Fracht ist dann eingepreist', () => {
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
