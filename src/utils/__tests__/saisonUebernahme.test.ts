import { describe, expect, it } from 'vitest';
import { baueUebernahmeEntwurf } from '../saisonUebernahme';
import type { AngebotsStand } from '../staffelUebernahme';

const stand = {
  hatStaffel: true,
  hatInhalt: true,
  angebotsModus: 'staffelpreis',
  staffelPositionen: [],
  preislistenPositionen: [{ id: 'pl-TM-FP', artikelnummer: 'TM-FP' }],
  staffelSorten: [{ id: 's1', artikelnummer: 'TM-ZM-02', staffeln: [] }],
  vereinsPositionen: [{ vereinId: 'v1', vereinsname: 'TC A', menge: 40, einzelpreis: 118.5 }],
  zusatzPositionen: [{ id: 'z1', artikelnummer: 'TM-PE' }],
  bedarfsPositionen: [],
  konditionen: {
    abrechnungsmodell: 'saisonbonus',
    mengenbasis: 'gesamt',
    zeitraumVon: '2026-01-01',
    zeitraumBis: '2026-10-31',
    hinweistext: 'Text aus 2026',
  },
  formData: {
    angebotsnummer: 'AN-2026-0042',
    zahlungsziel: '30 Tage netto',
    lieferzeit: 'nach Abruf',
    bemerkung: 'Abruf über Dispo',
  },
} as unknown as AngebotsStand;

const heute = new Date('2026-09-09T10:00:00Z');

describe('baueUebernahmeEntwurf', () => {
  it('verschiebt den Staffelzeitraum ins Zieljahr', () => {
    const e = baueUebernahmeEntwurf(stand, 2026, 2027, heute);
    expect(e.staffelKonditionen.zeitraumVon).toBe('2027-01-01');
    expect(e.staffelKonditionen.zeitraumBis).toBe('2027-10-31');
  });

  it('wirft den eingefrorenen Hinweistext des Vorjahres weg', () => {
    expect(baueUebernahmeEntwurf(stand, 2026, 2027, heute).staffelKonditionen.hinweistext)
      .toBeUndefined();
  });

  it('übernimmt Staffeln, Preisliste und Zusatzpositionen, aber keine Vereine', () => {
    const e = baueUebernahmeEntwurf(stand, 2026, 2027, heute);
    expect(e.staffelpreisPositionen).toHaveLength(1);
    expect(e.preislistenPositionen).toHaveLength(1);
    expect(e.zusatzPositionen).toHaveLength(1);
    expect(e.vereinPositionen).toHaveLength(0);
  });

  it('vergibt keine Angebotsnummer und setzt das Datum auf heute', () => {
    const e = baueUebernahmeEntwurf(stand, 2026, 2027, heute);
    expect(e.formData.angebotsnummer).toBe('');
    expect(e.formData.angebotsdatum).toBe('2026-09-09');
    expect(e.formData.gueltigBis).toBe('2026-10-09');
    expect(e.formData.zahlungsziel).toBe('30 Tage netto');
  });

  it('lässt den 29.02. auf den 28.02. fallen, statt in den März zu rutschen', () => {
    const schaltjahr = {
      ...stand,
      konditionen: { ...stand.konditionen, zeitraumVon: '2028-02-29', zeitraumBis: '2028-10-31' },
    } as unknown as AngebotsStand;
    expect(baueUebernahmeEntwurf(schaltjahr, 2028, 2029, heute).staffelKonditionen.zeitraumVon)
      .toBe('2029-02-28');
  });
});
