import { describe, it, expect } from 'vitest';
import { istTonnagePosition, summiereTonnage } from '../angebotsTonnage';
import { berechneFrachtkostenpauschale } from '../frachtkostenCalculations';

const pos = (p: Partial<Parameters<typeof istTonnagePosition>[0]>) => ({
  einheit: 't',
  menge: 1,
  ...p,
});

describe('istTonnagePosition', () => {
  it('zählt Ware in Tonnen', () => {
    expect(istTonnagePosition(pos({ artikelnummer: 'TM-ZM-02', menge: 8 }))).toBe(true);
    expect(istTonnagePosition(pos({ einheit: 'to', artikelnummer: 'TM-ZM-02' }))).toBe(true);
  });

  it('zählt andere Einheiten nicht', () => {
    expect(istTonnagePosition(pos({ einheit: 'Stk' }))).toBe(false);
    expect(istTonnagePosition(pos({ einheit: 'Std' }))).toBe(false);
    expect(istTonnagePosition(pos({ einheit: 'Pkt' }))).toBe(false);
  });

  it('schließt Pauschalen aus, die in Tonnen abgerechnet werden', () => {
    // Der Kern des Fehlers: TM-HYC-V trägt die Einheit 't', ist aber Fracht.
    expect(istTonnagePosition(pos({ artikelnummer: 'TM-HYC-V' }))).toBe(false);
    expect(istTonnagePosition(pos({ artikelnummer: 'TM-FP' }))).toBe(false);
    expect(istTonnagePosition(pos({ artikelnummer: 'TM-PE' }))).toBe(false);
    // auch in abweichender Schreibweise
    expect(istTonnagePosition(pos({ artikelnummer: ' tm-hyc-v ' }))).toBe(false);
  });

  it('schließt Bedarfspositionen aus — sie sind nicht bestellt', () => {
    expect(istTonnagePosition(pos({ artikelnummer: 'TM-ZM-02', istBedarfsposition: true }))).toBe(false);
  });
});

describe('summiereTonnage', () => {
  it('summiert über mehrere Listen', () => {
    expect(
      summiereTonnage(
        [pos({ artikelnummer: 'TM-ZM-02', menge: 8 })],
        [pos({ artikelnummer: 'TM-ZM-02', menge: 3 })]
      )
    ).toBe(11);
  });

  it('lässt die Frachtstaffel nicht durch eine Hydrocourt-Zeile kippen', () => {
    // Regression zum gemeldeten Risiko: 11,0 t echte Ware liegen unter der
    // Stufengrenze 11,4 t. Eine Hydrocourt-Versandzeile (Einheit 't') hätte
    // früher 12,0 t ergeben und damit die nächstteurere Stufe gezogen.
    const positionen = [
      pos({ artikelnummer: 'TM-ZM-02', menge: 11 }),
      pos({ artikelnummer: 'TM-HYC-V', menge: 1, istBedarfsposition: true }),
    ];
    expect(summiereTonnage(positionen)).toBe(11);
    expect(berechneFrachtkostenpauschale(summiereTonnage(positionen)))
      .toBe(berechneFrachtkostenpauschale(11));
    // Gegenprobe: die alte, naive Zählweise ergäbe 12 t und einen anderen Preis.
    expect(berechneFrachtkostenpauschale(12)).not.toBe(berechneFrachtkostenpauschale(11));
  });

  it('ergibt 0 bei leeren Listen', () => {
    expect(summiereTonnage([], [])).toBe(0);
  });
});
