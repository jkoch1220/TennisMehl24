/**
 * Die Tonnage eines Projekts hat drei mögliche Quellen, die zu verschiedenen
 * Zeitpunkten entstehen. Bis 08/2026 fragte das Wochenbrett nur nach dem
 * Ist-Gewicht — das entsteht erst mit der Lieferung. Für die Planungsphase,
 * also genau den Zweck des Bretts, stand deshalb fast überall „0 t".
 */
import { describe, it, expect } from 'vitest';
import { projektTonnage, summiereTonnage } from '../projektTonnage';
import { Projekt } from '../../types/projekt';

const projekt = (teil: Partial<Projekt>): Projekt =>
  ({ id: 'p1', status: 'auftragsbestaetigung', saisonjahr: 2026, ...teil } as Projekt);

const mitPositionen = (positionen: unknown[], teil: Partial<Projekt> = {}) =>
  projekt({
    ...teil,
    auftragsbestaetigungsDaten: JSON.stringify({ positionen }),
  } as Partial<Projekt>);

describe('projektTonnage', () => {
  it('nimmt das gewogene Liefergewicht, wenn es vorliegt', () => {
    const p = mitPositionen([{ artikelnummer: 'TM-ZM-02', menge: 10, einheit: 't' }], {
      liefergewicht: 9.8,
    });
    expect(projektTonnage(p)).toEqual({ tonnen: 9.8, quelle: 'gewogen' });
  });

  it('nimmt vor der Lieferung die beauftragte Menge aus den Positionen', () => {
    // Der Fall, der bisher als „0 t" im Wochenbrett stand: auftragsbestätigt,
    // Menge bekannt, aber noch nichts gewogen.
    const p = mitPositionen([{ artikelnummer: 'TM-ZM-02', menge: 10, einheit: 't' }]);
    expect(projektTonnage(p)).toEqual({ tonnen: 10, quelle: 'beauftragt' });
  });

  it('rechnet Palettenware in Tonnen mit', () => {
    const p = mitPositionen([{ artikelnummer: 'TM-ZM-02St', menge: 2, einheit: 't' }]);
    expect(projektTonnage(p)?.tonnen).toBe(2);
    expect(projektTonnage(p)?.quelle).toBe('beauftragt');
  });

  it('zählt Pauschalen nicht als Ware', () => {
    // TM-LKW-KR wird in Tonnen fakturiert, ist aber eine Dienstleistung.
    const p = mitPositionen([
      { artikelnummer: 'TM-ZM-02St', menge: 2, einheit: 't' },
      { artikelnummer: 'TM-LKW-KR', menge: 2, einheit: 't' },
    ]);
    expect(projektTonnage(p)?.tonnen).toBe(2);
  });

  it('fällt auf die angefragte Menge zurück, wenn es noch keine Positionen gibt', () => {
    expect(projektTonnage(projekt({ angefragteMenge: 15 }))).toEqual({
      tonnen: 15,
      quelle: 'angefragt',
    });
  });

  it('gibt null zurück, wenn keine Quelle etwas hergibt — NICHT null Tonnen', () => {
    // Der Unterschied entscheidet, ob eine Wochensumme vollständig aussieht
    // oder sich als lückenhaft zu erkennen gibt.
    expect(projektTonnage(projekt({}))).toBeNull();
  });

  it('behandelt eine Null-Menge wie eine fehlende Angabe', () => {
    expect(projektTonnage(projekt({ liefergewicht: 0, angefragteMenge: 0 }))).toBeNull();
  });
});

describe('summiereTonnage', () => {
  it('summiert bekannte Mengen und zählt die unbekannten getrennt', () => {
    const summe = summiereTonnage([
      projekt({ liefergewicht: 10 }),
      mitPositionen([{ artikelnummer: 'TM-ZM-02', menge: 5, einheit: 't' }]),
      projekt({}),
      projekt({}),
    ]);
    expect(summe.tonnen).toBe(15);
    expect(summe.unbekannt).toBe(2);
  });

  it('markiert eine Summe als Prognose, sobald ein Wert nicht gewogen ist', () => {
    const gemischt = summiereTonnage([
      projekt({ liefergewicht: 10 }),
      mitPositionen([{ artikelnummer: 'TM-ZM-02', menge: 5, einheit: 't' }]),
    ]);
    expect(gemischt.enthaeltPrognose).toBe(true);

    const nurGewogen = summiereTonnage([projekt({ liefergewicht: 10 })]);
    expect(nurGewogen.enthaeltPrognose).toBe(false);
  });

  it('meldet eine leere Gruppe als vollständig, nicht als lückenhaft', () => {
    expect(summiereTonnage([])).toEqual({ tonnen: 0, unbekannt: 0, enthaeltPrognose: false });
  });
});
