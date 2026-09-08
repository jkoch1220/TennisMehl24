import { describe, it, expect } from 'vitest';
import { erwartetAbholungsNachweis, istAbholungsNachweis } from '../liefernachweisArt';

describe('erwartetAbholungsNachweis', () => {
  it('nur Abholung ab Werk führt zur Unterschrift im Werk', () => {
    expect(erwartetAbholungsNachweis({ belieferungsart: 'abholung_ab_werk' })).toBe(true);
    expect(erwartetAbholungsNachweis({ belieferungsart: 'mit_haenger' })).toBe(false);
    expect(erwartetAbholungsNachweis({ belieferungsart: undefined })).toBe(false);
  });
});

describe('istAbholungsNachweis', () => {
  it('erkennt einen im Werk erfassten Nachweis am art-Feld', () => {
    expect(
      istAbholungsNachweis({
        liefernachweisAm: '2026-09-08T09:00:00.000Z',
        liefernachweis: { art: 'abholung', unterzeichnerName: 'Max Muster' },
      })
    ).toBe(true);
  });

  it('Altbestand ohne art-Feld ist ein Fahrer-Nachweis', () => {
    expect(
      istAbholungsNachweis({
        liefernachweisAm: '2026-07-01T09:00:00.000Z',
        liefernachweis: { fahrerName: 'Fahrer' },
      })
    ).toBe(false);
  });

  it('ohne Bestätigung nie wahr — auch wenn die Belieferungsart Abholung sagt', () => {
    expect(istAbholungsNachweis({ liefernachweisAm: undefined, liefernachweis: undefined })).toBe(false);
  });
});
