// Tests für die Verlade-Warnungen auf dem Lieferschein.
// Diese Warnungen sind betriebskritisch: sie sagen dem Fahrer, ob er das falsche Silo
// erwischt, Säcke vergisst oder ohne Ablademöglichkeit für einen BigBag losfährt.

import { describe, it, expect } from 'vitest';
import { erkenneSonderPositionen } from '../lieferscheinWarnings';
import { LieferscheinPosition } from '../../types/projektabwicklung';

let idZaehler = 0;
const pos = (teil: Partial<LieferscheinPosition>): LieferscheinPosition =>
  ({
    id: `p-${++idZaehler}`,
    artikel: 'Test',
    menge: 1,
    einheit: 't',
    ...teil,
  }) as LieferscheinPosition;

const typen = (positionen: LieferscheinPosition[]): string[] =>
  erkenneSonderPositionen(positionen).map((w) => w.warningType);

describe('erkenneSonderPositionen', () => {
  it('schweigt beim Standard-Schüttgut 0/2', () => {
    expect(typen([pos({ artikelnummer: 'TM-ZM-02', menge: 20 })])).toEqual([]);
  });

  it('warnt kritisch bei 0/3-Material (falsches Silo)', () => {
    expect(typen([pos({ artikelnummer: 'TM-ZM-03', menge: 20 })])).toContain('03_material');
  });

  it('warnt kritisch bei Sackware-Beiladung und nennt die Säckezahl', () => {
    const [warnung] = erkenneSonderPositionen([
      pos({ artikelnummer: 'TM-ZM-02S', menge: 0.4, einheit: 't' }),
    ]);
    expect(warnung.warningType).toBe('sackware');
    expect(warnung.details).toBe('10 Säcke'); // 0,4 t / 0,04 t
  });

  it('warnt bei BigBag mit der gültigen Stammnummer', () => {
    expect(typen([pos({ artikelnummer: 'TM-ZM-BIG-02', menge: 2 })])).toContain('bigbag');
  });

  // Regression: TM-ZM-02BB enthält kein „BIG" und löste bis 07/2026 KEINE BigBag-Warnung
  // aus — der Fahrer erfuhr nicht, dass beim Kunden eine Ablademöglichkeit nötig ist.
  it('warnt auch bei den BigBag-Altnummern ohne „BIG" im Namen', () => {
    expect(typen([pos({ artikelnummer: 'TM-ZM-02BB', menge: 2 })])).toContain('bigbag');
    expect(typen([pos({ artikelnummer: 'TM-03BB', menge: 1 })])).toContain('bigbag');
  });

  it('schweigt bei Speditionsware — die fährt nicht auf dem eigenen LKW', () => {
    expect(typen([pos({ artikelnummer: 'TM-ZM-02St', menge: 2 })])).toEqual([]);
    // auch bei abweichender Schreibweise
    expect(typen([pos({ artikelnummer: 'TM-ZM-02ST', menge: 2 })])).toEqual([]);
  });

  it('ignoriert Standardzubehör (Folie, Palette, Frachtpauschale)', () => {
    expect(
      typen([
        pos({ artikelnummer: 'TM-PE', menge: 1, einheit: 'Stk' }),
        pos({ artikelnummer: 'TM-PAL', menge: 1, einheit: 'Stk' }),
        pos({ artikelnummer: 'TM-FP', menge: 1, einheit: 'Pkt' }),
      ])
    ).toEqual([]);
  });
});
