import { describe, expect, it } from 'vitest';
import { werteAus, werteStaffelAus } from '../platzbauerAuswertung';
import type { PlatzbauerPosition } from '../../types/platzbauer';

const pos = (
  name: string,
  plz: string,
  ort: string,
  menge: number,
  preis: number,
  extra: Partial<PlatzbauerPosition> = {}
): PlatzbauerPosition =>
  ({
    vereinId: name,
    vereinsname: name,
    menge,
    einzelpreis: preis,
    gesamtpreis: menge * preis,
    lieferadresse: { strasse: '', plz, ort },
    ...extra,
  }) as PlatzbauerPosition;

describe('werteAus', () => {
  it('summiert bestellte und gelieferte Mengen getrennt', () => {
    const a = werteAus([
      pos('TC A', '90402', 'Nürnberg', 40, 118.5, { lieferscheinErstellt: true }),
      pos('TC B', '90762', 'Fürth', 20, 118.5),
    ]);
    expect(a.mengeBestellt).toBe(60);
    expect(a.mengeGeliefert).toBe(40);
    expect(a.umsatzBestellt).toBe(7110);
    expect(a.umsatzGeliefert).toBe(4740);
  });

  it('gruppiert nach PLZ-Leitregion und sortiert nach Menge', () => {
    const a = werteAus([
      pos('TC A', '90402', 'Nürnberg', 10, 100),
      pos('TC B', '90762', 'Fürth', 5, 100),
      pos('TC C', '97070', 'Würzburg', 30, 100),
    ]);
    expect(a.regionen.map((r) => r.leitregion)).toEqual(['97', '90']);
    expect(a.regionen[0].mengeBestellt).toBe(30);
    expect(a.regionen[1].anzahlVereine).toBe(2);
    expect(a.regionen[1].orte).toEqual(['Fürth', 'Nürnberg']);
    expect(a.regionen[0].anteil).toBeCloseTo(30 / 45);
  });

  it('zählt verlorene Projekte nirgends mit', () => {
    const a = werteAus([
      pos('TC A', '90402', 'Nürnberg', 10, 100),
      pos('TC X', '90402', 'Nürnberg', 999, 100, { projektStatus: 'verloren' } as any),
    ]);
    expect(a.anzahlVereine).toBe(1);
    expect(a.mengeBestellt).toBe(10);
  });

  it('fasst Positionen ohne PLZ unter ?? zusammen, statt sie zu verlieren', () => {
    const a = werteAus([pos('TC A', '', '', 12, 100)]);
    expect(a.regionen[0].leitregion).toBe('??');
    expect(a.mengeBestellt).toBe(12);
  });
});

describe('werteStaffelAus', () => {
  const staffeln = [
    { vonMenge: 0, bisMenge: 150, einzelpreis: 118.5 },
    { vonMenge: 150, bisMenge: 300, einzelpreis: 113.5 },
    { vonMenge: 300, bisMenge: null, einzelpreis: 108.5 },
  ] as any;

  it('nennt Reststrecke und Ersparnis der nächsten Stufe', () => {
    const stand = werteStaffelAus(staffeln, 120)!;
    expect(stand.aktuelleStufe?.einzelpreis).toBe(118.5);
    expect(stand.naechsteStufe?.vonMenge).toBe(150);
    expect(stand.tonnenBisNaechsteStufe).toBe(30);
    expect(stand.ersparnisJeTonne).toBe(5);
  });

  it('meldet auf der höchsten Stufe keine Reststrecke', () => {
    const stand = werteStaffelAus(staffeln, 420)!;
    expect(stand.naechsteStufe).toBeUndefined();
    expect(stand.tonnenBisNaechsteStufe).toBe(0);
  });

  it('gibt ohne Staffeln null zurück (Direktpreise)', () => {
    expect(werteStaffelAus([], 100)).toBeNull();
  });
});
