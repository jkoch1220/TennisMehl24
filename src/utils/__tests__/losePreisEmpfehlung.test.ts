import { describe, it, expect } from 'vitest';
import {
  berechneLosePreisEmpfehlung,
  weichtVonEmpfehlungAb,
  aufCent,
} from '../losePreisEmpfehlung';

describe('berechneLosePreisEmpfehlung', () => {
  it('legt die Lieferkosten auf die lose Tonnage um', () => {
    const e = berechneLosePreisEmpfehlung({
      werkspreis: 98.7,
      lieferkostenGesamt: 450,
      loseTonnage: 25,
    });

    expect(e).not.toBeNull();
    expect(e!.lieferkostenProTonne).toBeCloseTo(18, 10);
    expect(e!.empfohlenerPreis).toBe(116.7);
  });

  it('ignoriert Sackware/BigBag in der Umlage — sonst wich die Vorbefuellung von der Anzeige ab', () => {
    // 20 t lose + 10 t gesackt: bis 08/2026 teilte die Vorbefuellung durch 30 t,
    // die angezeigte Empfehlung durch 20 t. Beide muessen jetzt 20 t nehmen.
    const e = berechneLosePreisEmpfehlung({
      werkspreis: 98.7,
      lieferkostenGesamt: 600,
      loseTonnage: 20,
    });

    expect(e!.empfohlenerPreis).toBe(128.7); // 98.70 + 30.00, nicht 98.70 + 20.00
  });

  it('rundet den Endpreis auf Cent', () => {
    const e = berechneLosePreisEmpfehlung({
      werkspreis: 98.7,
      lieferkostenGesamt: 100,
      loseTonnage: 3,
    });

    // 98.70 + 33.3333... = 132.0333... -> 132.03
    expect(e!.empfohlenerPreis).toBe(132.03);
  });

  it('gibt null ohne lose Tonnage zurueck — bei reiner Sackware gilt kein Lose-Preis', () => {
    expect(
      berechneLosePreisEmpfehlung({ werkspreis: 98.7, lieferkostenGesamt: 400, loseTonnage: 0 })
    ).toBeNull();
  });

  it('gibt null zurueck, solange die Lieferkosten nicht berechnet sind', () => {
    expect(
      berechneLosePreisEmpfehlung({ werkspreis: 98.7, lieferkostenGesamt: null, loseTonnage: 10 })
    ).toBeNull();
  });

  it('gibt null ohne gueltigen Werkspreis zurueck', () => {
    expect(
      berechneLosePreisEmpfehlung({ werkspreis: 0, lieferkostenGesamt: 400, loseTonnage: 10 })
    ).toBeNull();
  });

  it('liefert Zwischenwerte fuer die Anzeige mit', () => {
    const e = berechneLosePreisEmpfehlung({
      werkspreis: 98.7,
      lieferkostenGesamt: 450,
      loseTonnage: 25,
    })!;

    expect(e.werkspreis).toBe(98.7);
    expect(e.lieferkostenGesamt).toBe(450);
    expect(e.loseTonnage).toBe(25);
  });
});

describe('weichtVonEmpfehlungAb', () => {
  it('toleriert Rundungsdifferenzen von einem Cent', () => {
    expect(weichtVonEmpfehlungAb(116.7, 116.7)).toBe(false);
    expect(weichtVonEmpfehlungAb(116.71, 116.7)).toBe(false);
  });

  it('erkennt eine bewusste manuelle Abweichung', () => {
    expect(weichtVonEmpfehlungAb(125, 116.7)).toBe(true);
    expect(weichtVonEmpfehlungAb(110, 116.7)).toBe(true);
  });
});

describe('aufCent', () => {
  it('rundet kaufmaennisch auf zwei Nachkommastellen', () => {
    expect(aufCent(132.0333)).toBe(132.03);
    expect(aufCent(132.035)).toBe(132.04);
    expect(aufCent(98.7)).toBe(98.7);
  });
});
