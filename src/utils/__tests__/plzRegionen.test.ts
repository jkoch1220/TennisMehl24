import { describe, expect, it } from 'vitest';
import {
  ermittleStaffelPreis,
  findeRegionPreis,
  formatierePlzGebiete,
  zerlegePlzGebiete,
} from '../plzRegionen';
import type { Preisstaffel } from '../../types/platzbauer';

/** Geschützte Leerzeichen (aus formatTonnen) für den Vergleich normalisieren. */
const nbsp = (text: string): string => text.replace(/\u00a0/g, ' ');

describe('zerlegePlzGebiete', () => {
  it('trennt an Semikolon, Komma und Leerzeichen', () => {
    expect(zerlegePlzGebiete('47;42')).toEqual(['47', '42']);
    expect(zerlegePlzGebiete('47; 42 , 90')).toEqual(['47', '42', '90']);
  });

  it('wirft weg, was keine PLZ sein kann (Text, Leeres, mehr als fünf Ziffern)', () => {
    expect(zerlegePlzGebiete('47;NRW;;123456')).toEqual(['47']);
  });

  it('kommt mit leer und undefined zurecht', () => {
    expect(zerlegePlzGebiete('')).toEqual([]);
    expect(zerlegePlzGebiete(undefined)).toEqual([]);
    expect(formatierePlzGebiete('47;;42')).toBe('47; 42');
  });
});

describe('findeRegionPreis', () => {
  const regionen = [
    { plzGebiete: '47;42', einzelpreis: 120 },
    { plzGebiete: '97;92', einzelpreis: 110 },
    { plzGebiete: '972', einzelpreis: 99 },
  ];

  it('trifft über das PLZ-Präfix', () => {
    expect(findeRegionPreis(regionen, '47051')?.einzelpreis).toBe(120);
    expect(findeRegionPreis(regionen, '92637')?.einzelpreis).toBe(110);
  });

  it('lässt das längere Präfix gewinnen', () => {
    expect(findeRegionPreis(regionen, '97218')?.einzelpreis).toBe(99);
    expect(findeRegionPreis(regionen, '97070')?.einzelpreis).toBe(110);
  });

  it('gibt ohne Treffer oder ohne PLZ null zurück', () => {
    expect(findeRegionPreis(regionen, '10115')).toBeNull();
    expect(findeRegionPreis(regionen, '')).toBeNull();
    expect(findeRegionPreis([], '97070')).toBeNull();
  });
});

describe('ermittleStaffelPreis', () => {
  const staffeln: Preisstaffel[] = [
    { vonMenge: 0, bisMenge: 200, einzelpreis: 160 },
    {
      vonMenge: 200,
      bisMenge: 400,
      einzelpreis: 155,
      regionPreise: [{ plzGebiete: '97', einzelpreis: 158 }],
    },
    {
      vonMenge: 400,
      bisMenge: 500,
      einzelpreis: 140,
      regionPreise: [
        { plzGebiete: '97', einzelpreis: 150 },
        { plzGebiete: '90', einzelpreis: 120 },
      ],
    },
  ];

  it('nimmt die Stufe nach der Gesamtabnahme des Platzbauers und die Region nach PLZ', () => {
    const treffer = ermittleStaffelPreis(staffeln, 400, '97070')!;
    expect(treffer.stufe).toBe(3);
    expect(treffer.einzelpreis).toBe(150);
    expect(nbsp(treffer.herkunft)).toContain('400 t – unter 500 t');
    expect(nbsp(treffer.herkunft)).toContain('PLZ 97');
  });

  it('unterscheidet Regionen innerhalb derselben Stufe', () => {
    expect(ermittleStaffelPreis(staffeln, 450, '90402')!.einzelpreis).toBe(120);
    expect(ermittleStaffelPreis(staffeln, 450, '97070')!.einzelpreis).toBe(150);
  });

  it('fällt ohne passende Region auf den Stufenpreis zurück', () => {
    const treffer = ermittleStaffelPreis(staffeln, 450, '10115')!;
    expect(treffer.einzelpreis).toBe(140);
    expect(nbsp(treffer.herkunft)).toContain('keine Region hinterlegt');
  });

  it('behandelt die Stufengrenze als zur höheren Stufe gehörig', () => {
    expect(ermittleStaffelPreis(staffeln, 199.9, '97070')!.stufe).toBe(1);
    expect(ermittleStaffelPreis(staffeln, 200, '97070')!.einzelpreis).toBe(158);
  });

  it('bleibt oberhalb der letzten Grenze in der höchsten Stufe', () => {
    expect(ermittleStaffelPreis(staffeln, 900, '90402')!.einzelpreis).toBe(120);
  });

  it('gibt ohne Staffeln null zurück', () => {
    expect(ermittleStaffelPreis([], 400, '97070')).toBeNull();
    expect(ermittleStaffelPreis(undefined, 400, '97070')).toBeNull();
  });
});
