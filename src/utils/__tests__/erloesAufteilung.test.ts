import { describe, it, expect } from 'vitest';
import { berechneErloesAufteilung, abWerkReferenzpreis } from '../erloesAufteilung';
import { erstelleArtikelIndex } from '../tonnage';
import { Artikel } from '../../types/artikel';

const stamm: Artikel[] = [
  { $id: 'a1', artikelnummer: 'TM-ZM-02', bezeichnung: '0/2 lose', einheit: 't', einzelpreis: 98.7, warengruppe: 'tennismehl', istTonnageRelevant: true, aktiv: true },
  { $id: 'a2', artikelnummer: 'TM-ZM-02St', bezeichnung: '0/2 Palette', einheit: 't', einzelpreis: 155, warengruppe: 'tennismehl', istTonnageRelevant: true, gewichtProStueckKg: 1000, aktiv: true },
  { $id: 'a3', artikelnummer: 'TM-ZM-02S', bezeichnung: '0/2 Sack 40kg', einheit: 'Stk', einzelpreis: 8.5, warengruppe: 'tennismehl', istTonnageRelevant: true, gewichtProStueckKg: 40, aktiv: true },
  { $id: 'a4', artikelnummer: 'TM-FP', bezeichnung: 'Frachtpauschale', einheit: 'Pkt', einzelpreis: 0, warengruppe: 'fracht', istTonnageRelevant: false, aktiv: true },
  { $id: 'a5', artikelnummer: 'TM-PE', bezeichnung: 'PE-Folie', einheit: 'Stk', einzelpreis: 18.2, warengruppe: 'zubehoer', istTonnageRelevant: false, aktiv: true },
];
const index = erstelleArtikelIndex(stamm);

describe('berechneErloesAufteilung (Werkspreis-Regel)', () => {
  it('teilt den Tonnenpreis in Ab-Werk-Anteil und Frachtaufschlag', () => {
    // Kunde zahlt 113,75 €/t inkl. Lieferung, Werk = 98,70 €/t
    const e = berechneErloesAufteilung(
      [{ artikelnummer: 'TM-ZM-02', einheit: 't', menge: 10, einzelpreis: 113.75, gesamtpreis: 1137.5 }],
      index
    );
    expect(e.warenerloes).toBeCloseTo(987);
    expect(e.frachterloes).toBeCloseTo(150.5);
    expect(e.sonstigerErloes).toBe(0);
  });

  it('behandelt Preise unter Werk als Warenrabatt, nicht als negative Fracht', () => {
    const e = berechneErloesAufteilung(
      [{ artikelnummer: 'TM-ZM-02', einheit: 't', menge: 10, einzelpreis: 89, gesamtpreis: 890 }],
      index
    );
    expect(e.warenerloes).toBeCloseTo(890);
    expect(e.frachterloes).toBe(0);
  });

  it('zählt separate Frachtpositionen voll als Frachterlös', () => {
    const e = berechneErloesAufteilung(
      [
        { artikelnummer: 'TM-ZM-02', einheit: 't', menge: 10, einzelpreis: 98.7, gesamtpreis: 987 },
        { artikelnummer: 'TM-FP', einheit: 'Pkt', menge: 1, einzelpreis: 39.9, gesamtpreis: 39.9 },
      ],
      index
    );
    expect(e.warenerloes).toBeCloseTo(987);
    expect(e.frachterloes).toBeCloseTo(39.9);
  });

  it('rechnet eine Palettenposition unter der Sack-Nummer gegen den Paletten-Werkspreis', () => {
    // 3 Paletten à 364,25 € unter TM-ZM-03S fakturiert (real existierender Altfall,
    // hier mit 0/2 nachgestellt): Referenz muss 155 €/Palette sein, nicht 8,50 €/Sack.
    const e = berechneErloesAufteilung(
      [{ artikelnummer: 'TM-ZM-02S', einheit: 'Stk', menge: 3, einzelpreis: 364.25, gesamtpreis: 1092.75 }],
      index
    );
    expect(e.warenerloes).toBeCloseTo(3 * 155);
    expect(e.frachterloes).toBeCloseTo(1092.75 - 465);
  });

  it('rechnet echte Säcke gegen den Sackpreis — auch unter der Paletten-Nummer', () => {
    expect(
      abWerkReferenzpreis({ artikelnummer: 'TM-ZM-02St', einheit: 'Stk', menge: 50, einzelpreis: 8.5 }, index)
    ).toBe(8.5);
  });

  it('weist Ware ohne Ab-Werk-Referenz ehrlich als nicht aufteilbar aus', () => {
    const ohneWerkspreis = erstelleArtikelIndex([
      { $id: 'x', artikelnummer: 'TM-ZM-02', bezeichnung: '0/2', einheit: 't', warengruppe: 'tennismehl', istTonnageRelevant: true, aktiv: true },
    ]);
    const e = berechneErloesAufteilung(
      [{ artikelnummer: 'TM-ZM-02', einheit: 't', menge: 5, einzelpreis: 110, gesamtpreis: 550 }],
      ohneWerkspreis
    );
    expect(e.nichtAufteilbar).toBe(550);
    expect(e.warenerloes).toBe(0);
  });

  it('bucht Zubehör als sonstigen Erlös und überspringt Bedarfspositionen', () => {
    const e = berechneErloesAufteilung(
      [
        { artikelnummer: 'TM-PE', einheit: 'Stk', menge: 2, einzelpreis: 18.2, gesamtpreis: 36.4 },
        { artikelnummer: 'TM-ZM-02', einheit: 't', menge: 5, einzelpreis: 110, gesamtpreis: 550, istBedarfsposition: true },
      ],
      index
    );
    expect(e.sonstigerErloes).toBeCloseTo(36.4);
    expect(e.warenerloes).toBe(0);
  });
});
