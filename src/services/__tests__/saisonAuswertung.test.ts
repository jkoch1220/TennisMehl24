import { describe, it, expect } from 'vitest';
import { aggregiereArtikelAuswertung, NICHT_ZUORDENBAR } from '../saisonAuswertungService';
import { erstelleArtikelIndex } from '../../utils/tonnage';
import { Artikel } from '../../types/artikel';

const stamm: Artikel[] = [
  { $id: 'a1', artikelnummer: 'TM-ZM-02', bezeichnung: '0/2 lose', einheit: 't', einzelpreis: 98.7, warengruppe: 'tennismehl', istTonnageRelevant: true, aktiv: true },
  { $id: 'a2', artikelnummer: 'TM-FP', bezeichnung: 'Frachtpauschale', einheit: 'Pkt', warengruppe: 'fracht', istTonnageRelevant: false, aktiv: true },
];
const index = erstelleArtikelIndex(stamm);

const beleg = (positionen: unknown[]) => JSON.stringify({ positionen });

describe('aggregiereArtikelAuswertung', () => {
  it('trennt angeboten / beauftragt / fakturiert je Artikel und teilt Erlöse nach Werkspreis', () => {
    const belege = new Map([
      ['p1', {
        angebot: beleg([{ id: '1', artikelnummer: 'TM-ZM-02', einheit: 't', menge: 12, einzelpreis: 110, gesamtpreis: 1320 }]),
        auftragsbestaetigung: beleg([{ id: '1', artikelnummer: 'TM-ZM-02', einheit: 't', menge: 10, einzelpreis: 110, gesamtpreis: 1100 }]),
        rechnung: beleg([
          { id: '1', artikelnummer: 'TM-ZM-02', einheit: 't', menge: 10, einzelpreis: 110, gesamtpreis: 1100, einkaufspreis: 40 },
          { id: '2', artikelnummer: 'TM-FP', einheit: 'Pkt', menge: 1, einzelpreis: 39.9, gesamtpreis: 39.9 },
        ]),
      }],
    ]);

    const a = aggregiereArtikelAuswertung(2026, [{ $id: 'p1' }], belege, index);
    const zm = a.zeilen.find((z) => z.artikelnummer === 'TM-ZM-02')!;
    expect(zm.angeboteneTonnen).toBe(12);
    expect(zm.beauftragteTonnen).toBe(10);
    expect(zm.fakturierteTonnen).toBe(10);
    expect(zm.warenerloes).toBeCloseTo(987);      // 10 × 98,70 ab Werk
    expect(zm.frachterloes).toBeCloseTo(113);     // 1100 − 987 Aufschlag
    expect(zm.db1).toBeCloseTo(1100 - 400);
    expect(zm.positionenOhneEk).toBe(0);

    const fp = a.zeilen.find((z) => z.artikelnummer === 'TM-FP')!;
    expect(fp.frachterloes).toBeCloseTo(39.9);
    expect(fp.fakturierteTonnen).toBe(0);
  });

  it('weist fehlenden EK ehrlich aus, statt DB1 = Umsatz zu rechnen', () => {
    const belege = new Map([
      ['p1', { rechnung: beleg([{ id: '1', artikelnummer: 'TM-ZM-02', einheit: 't', menge: 5, einzelpreis: 100, gesamtpreis: 500 }]) }],
    ]);
    const a = aggregiereArtikelAuswertung(2026, [{ $id: 'p1' }], belege, index);
    const zm = a.zeilen.find((z) => z.artikelnummer === 'TM-ZM-02')!;
    expect(zm.db1).toBe(0);
    expect(zm.positionenOhneEk).toBe(1);
  });

  it('sammelt unbekannte Artikel und Freitext getrennt in der nicht-zuordenbar-Zeile', () => {
    const belege = new Map([
      ['p1', {
        rechnung: beleg([
          { id: '1', artikelnummer: 'XX-FANTASIE', einheit: 't', menge: 2, einzelpreis: 100, gesamtpreis: 200 },
          { id: '2', bezeichnung: 'Sonderleistung', istFreitextPosition: true, einheit: 'Pkt', menge: 1, einzelpreis: 50, gesamtpreis: 50 },
        ]),
      }],
    ]);
    const a = aggregiereArtikelAuswertung(2026, [{ $id: 'p1' }], belege, index);
    expect(a.nichtZuordenbarePositionen).toBe(1);
    expect(a.freitextPositionen).toBe(1);
    const rest = a.zeilen.find((z) => z.artikelnummer === NICHT_ZUORDENBAR)!;
    expect(rest).toBeDefined();
    // Die nicht-zuordenbar-Zeile steht immer am Ende
    expect(a.zeilen[a.zeilen.length - 1].artikelnummer).toBe(NICHT_ZUORDENBAR);
  });

  it('zählt gewogene Tonnen nur aus geprüften Wiegescheinen', () => {
    const a = aggregiereArtikelAuswertung(
      2026,
      [
        { $id: 'p1', wiegeschein: { pruefStatus: 'bestaetigt', gepruefteMengeTonnen: 9.8 } },
        { $id: 'p2', liefergewicht: 12 }, // ungeprüft — zählt nicht als gewogen
      ],
      new Map(),
      index
    );
    expect(a.gewogeneTonnenGesamt).toBeCloseTo(9.8);
    expect(a.gewogeneProjekte).toBe(1);
  });
});
