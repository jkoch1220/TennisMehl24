import { describe, it, expect } from 'vitest';
import { validierePositionen } from '../positionsValidierung';
import { erstelleArtikelIndex } from '../tonnage';
import { Artikel } from '../../types/artikel';
import { Position } from '../../types/projektabwicklung';

const stamm: Artikel[] = [
  { $id: 'a1', artikelnummer: 'TM-ZM-02', bezeichnung: 'Tennismehl 0/2 Schüttgut', einheit: 't', erlaubteEinheit: 't', einzelpreis: 98.7, preisTyp: 'variabel', aktiv: true },
  { $id: 'a2', artikelnummer: 'TM-PE', bezeichnung: 'PE-Folie', einheit: 'Stk', erlaubteEinheit: 'Stk', einzelpreis: 18.2, preisTyp: 'fest', aktiv: true },
  { $id: 'a3', artikelnummer: 'TM-ALT', bezeichnung: 'Ausgelaufen', einheit: 'Stk', erlaubteEinheit: 'Stk', preisTyp: 'variabel', aktiv: false },
];
const index = erstelleArtikelIndex(stamm);

const pos = (teil: Partial<Position>): Position => ({
  id: 'p1',
  bezeichnung: 'Test',
  menge: 1,
  einheit: 't',
  einzelpreis: 0,
  gesamtpreis: 0,
  ...teil,
});

describe('validierePositionen', () => {
  it('meldet unbekannte Artikelnummern', () => {
    const w = validierePositionen([pos({ artikelnummer: 'TM-GIBTS-NICHT' })], index);
    expect(w).toHaveLength(1);
    expect(w[0].typ).toBe('artikel-unbekannt');
  });

  it('meldet Positionen ganz ohne Artikelnummer', () => {
    const w = validierePositionen([pos({ bezeichnung: 'Sonderposten' })], index);
    expect(w).toHaveLength(1);
    expect(w[0].typ).toBe('artikel-unbekannt');
  });

  it('akzeptiert bewusste Freitext-Positionen ohne Warnung', () => {
    const w = validierePositionen([pos({ istFreitextPosition: true })], index);
    expect(w).toHaveLength(0);
  });

  it('meldet eine vom Stamm abweichende Einheit', () => {
    const w = validierePositionen(
      [pos({ artikelnummer: 'TM-ZM-02', einheit: 'Stk', einzelpreis: 98.7 })],
      index
    );
    expect(w.map((x) => x.typ)).toContain('einheit-abweichend');
  });

  it('meldet Fixpreis-Abweichung ohne Grund — mit streichpreisGrund nicht', () => {
    const ohneGrund = validierePositionen(
      [pos({ artikelnummer: 'TM-PE', einheit: 'Stk', einzelpreis: 12 })],
      index
    );
    expect(ohneGrund.map((x) => x.typ)).toContain('festpreis-abweichend');

    const mitGrund = validierePositionen(
      [pos({ artikelnummer: 'TM-PE', einheit: 'Stk', einzelpreis: 12, streichpreisGrund: 'Kulanz Reklamation' })],
      index
    );
    expect(mitGrund).toHaveLength(0);
  });

  it('lässt variable Preise ohne Warnung abweichen', () => {
    const w = validierePositionen(
      [pos({ artikelnummer: 'TM-ZM-02', einheit: 't', einzelpreis: 89.5 })],
      index
    );
    expect(w).toHaveLength(0);
  });

  it('meldet archivierte Artikel', () => {
    const w = validierePositionen(
      [pos({ artikelnummer: 'TM-ALT', einheit: 'Stk' })],
      index
    );
    expect(w.map((x) => x.typ)).toContain('artikel-archiviert');
  });

  it('überspringt Bedarfs- und Universal-Positionen', () => {
    const w = validierePositionen(
      [
        pos({ artikelnummer: 'TM-GIBTS-NICHT', istBedarfsposition: true }),
        pos({ artikelnummer: 'UN-123', istUniversalArtikel: true }),
      ],
      index
    );
    expect(w).toHaveLength(0);
  });

  it('löst Altnummern über die Alias-Tabelle auf, statt sie als unbekannt zu melden', () => {
    const mitBig = erstelleArtikelIndex([
      ...stamm,
      { $id: 'a4', artikelnummer: 'TM-ZM-BIG-02', bezeichnung: 'BigBag 0/2', einheit: 't', erlaubteEinheit: 't', preisTyp: 'variabel', aktiv: true },
    ]);
    const w = validierePositionen([pos({ artikelnummer: 'TM-ZM-02BB', einheit: 't' })], mitBig);
    expect(w.filter((x) => x.typ === 'artikel-unbekannt')).toHaveLength(0);
  });
});
