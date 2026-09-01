/**
 * Die PE-Folie gehört zu jeder losen Schüttgut-Lieferung.
 *
 * Ohne sie kann nicht gekippt werden — das Material käme direkt auf den Belag.
 * Bisher stand sie nur im Angebot, wenn sie schon im Vorjahresbeleg stand; bei
 * Kunden ohne Beleg (Mosaik-Historie, PLZ-Kalkulation) fehlte sie immer.
 *
 * Die Abgrenzung ist der heikle Teil: Sackware auf Palette und BigBags werden
 * abgesetzt, nicht gekippt — und sie werden EBENFALLS in Tonnen geführt. Die
 * Einheit allein taugt deshalb nicht zur Unterscheidung.
 */
import { describe, it, expect } from 'vitest';
import { _massenAngebotInternals as internals } from '../massenAngebotService';
import { Position } from '../../types/projektabwicklung';

let idZaehler = 0;
const pos = (teil: Partial<Position>): Position => ({
  id: `test-${++idZaehler}`,
  bezeichnung: 'Test',
  menge: 10,
  einheit: 't',
  einzelpreis: 130,
  gesamtpreis: 1300,
  ...teil,
});

const FOLIENPREIS = 18.2;
const nummern = (p: Position[]) => p.map((x) => x.artikelnummer);

describe('hatLoseWare', () => {
  it('erkennt Schüttgut in Tonnen', () => {
    expect(internals.hatLoseWare([pos({ artikelnummer: 'TM-ZM-02' })])).toBe(true);
    expect(internals.hatLoseWare([pos({ artikelnummer: 'TM-ZM-03' })])).toBe(true);
  });

  it('zählt Palettenware NICHT als lose — trotz Einheit „t"', () => {
    // Der Kern der Abgrenzung: Diese Zeilen werden abgesetzt, nicht gekippt.
    expect(internals.hatLoseWare([pos({ artikelnummer: 'TM-ZM-02St' })])).toBe(false);
    expect(internals.hatLoseWare([pos({ artikelnummer: 'TM-ZM-02BB' })])).toBe(false);
    expect(internals.hatLoseWare([pos({ artikelnummer: 'TM-ZM-BIG-03' })])).toBe(false);
  });

  it('zählt Beiladungs-Säcke nicht als lose Ware', () => {
    expect(internals.hatLoseWare([pos({ artikelnummer: 'TM-ZM-02S', einheit: 'Stk', menge: 20 })])).toBe(false);
  });

  it('ignoriert eine Schüttgut-Zeile mit Menge 0', () => {
    // Keine Lieferung, also auch nichts zu kippen.
    expect(internals.hatLoseWare([pos({ artikelnummer: 'TM-ZM-02', menge: 0 })])).toBe(false);
  });

  it('ignoriert Schüttgut als Bedarfsposition', () => {
    expect(internals.hatLoseWare([pos({ artikelnummer: 'TM-ZM-02', istBedarfsposition: true })])).toBe(false);
  });
});

describe('ergaenzePflichtFolie', () => {
  it('hängt die Folie an ein Schüttgut-Angebot', () => {
    const neu = internals.ergaenzePflichtFolie([pos({ artikelnummer: 'TM-ZM-02' })], FOLIENPREIS);
    expect(nummern(neu)).toEqual(['TM-ZM-02', 'TM-PE']);
    expect(neu[1]).toMatchObject({ menge: 1, einheit: 'Stk', einzelpreis: 18.2, gesamtpreis: 18.2 });
  });

  it('legt keine zweite Folie an', () => {
    const mitFolie = [
      pos({ artikelnummer: 'TM-ZM-02' }),
      pos({ artikelnummer: 'TM-PE', menge: 1, einheit: 'Stk', einzelpreis: 18.2, gesamtpreis: 18.2 }),
    ];
    expect(internals.ergaenzePflichtFolie(mitFolie, FOLIENPREIS)).toEqual(mitFolie);
  });

  it('erkennt eine vorhandene Folie unabhängig von der Schreibweise', () => {
    const mitFolie = [pos({ artikelnummer: 'TM-ZM-02' }), pos({ artikelnummer: 'tm-pe', einheit: 'Stk' })];
    expect(internals.ergaenzePflichtFolie(mitFolie, FOLIENPREIS)).toHaveLength(2);
  });

  it('lässt ein reines Paletten-Angebot unangetastet', () => {
    const paletten = [pos({ artikelnummer: 'TM-ZM-02St' }), pos({ artikelnummer: 'TM-PAL', einheit: 'Stk' })];
    expect(internals.ergaenzePflichtFolie(paletten, FOLIENPREIS)).toEqual(paletten);
  });

  it('ergänzt bei gemischtem Angebot, sobald lose Ware dabei ist', () => {
    const gemischt = [pos({ artikelnummer: 'TM-ZM-02St' }), pos({ artikelnummer: 'TM-ZM-02' })];
    expect(nummern(internals.ergaenzePflichtFolie(gemischt, FOLIENPREIS))).toContain('TM-PE');
  });

  it('legt ohne Preis lieber gar nichts an', () => {
    // Eine Position zu 0,00 € im Angebot wäre schlimmer als die fehlende Zeile.
    const nur = [pos({ artikelnummer: 'TM-ZM-02' })];
    expect(internals.ergaenzePflichtFolie(nur, 0)).toEqual(nur);
  });
});

describe('fehltPflichtFolie', () => {
  it('meldet nur lose Ware ohne Folie', () => {
    const { fehltPflichtFolie } = internals;
    expect(fehltPflichtFolie([pos({ artikelnummer: 'TM-ZM-02' })])).toBe(true);
    expect(fehltPflichtFolie([
      pos({ artikelnummer: 'TM-ZM-02' }),
      pos({ artikelnummer: 'TM-PE', einheit: 'Stk' }),
    ])).toBe(false);
    expect(fehltPflichtFolie([pos({ artikelnummer: 'TM-ZM-02St' })])).toBe(false);
  });
});
