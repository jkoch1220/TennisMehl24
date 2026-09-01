import { describe, it, expect } from 'vitest';
import { berechneTourennummern, tourennummer } from '../tourennummer';

const tour = (id: string, datum: string, erstellt: string) => ({
  id, datum, $createdAt: erstellt,
});

describe('berechneTourennummern', () => {
  it('nummeriert innerhalb eines Tages nach Anlagezeitpunkt', () => {
    const touren = [
      tour('b', '2026-09-01', '2026-08-30T12:00:00.000Z'),
      tour('a', '2026-09-01', '2026-08-30T09:00:00.000Z'),
      tour('c', '2026-09-01', '2026-08-30T15:00:00.000Z'),
    ];
    const n = berechneTourennummern(touren);
    expect(n.get('a')).toBe('TO-20260901-1');
    expect(n.get('b')).toBe('TO-20260901-2');
    expect(n.get('c')).toBe('TO-20260901-3');
  });

  it('zählt je Tag neu', () => {
    const n = berechneTourennummern([
      tour('a', '2026-09-01', '2026-08-30T09:00:00.000Z'),
      tour('b', '2026-09-02', '2026-08-30T10:00:00.000Z'),
    ]);
    expect(n.get('a')).toBe('TO-20260901-1');
    expect(n.get('b')).toBe('TO-20260902-1');
  });

  it('liefert bei gleicher Eingabe immer dasselbe Ergebnis', () => {
    const touren = [
      tour('a', '2026-09-01', '2026-08-30T09:00:00.000Z'),
      tour('b', '2026-09-01', '2026-08-30T09:00:00.000Z'), // gleiche Zeit
    ];
    const erst = berechneTourennummern(touren);
    const nochmal = berechneTourennummern([...touren].reverse());
    expect(nochmal.get('a')).toBe(erst.get('a'));
    expect(nochmal.get('b')).toBe(erst.get('b'));
  });

  it('kommt mit Touren ohne Datum zurecht', () => {
    const n = berechneTourennummern([{ id: 'x', $createdAt: '2026-08-30T09:00:00.000Z' }]);
    expect(n.get('x')).toBe('TO-ohne-Datum-1');
  });

  it('verträgt fehlende Anlagezeitpunkte', () => {
    const n = berechneTourennummern([
      { id: 'b', datum: '2026-09-01' },
      { id: 'a', datum: '2026-09-01' },
    ]);
    expect(n.get('a')).toBe('TO-20260901-1');
    expect(n.get('b')).toBe('TO-20260901-2');
  });
});

describe('tourennummer', () => {
  it('gibt die Nummer einer einzelnen Tour', () => {
    const touren = [
      tour('a', '2026-09-01', '2026-08-30T09:00:00.000Z'),
      tour('b', '2026-09-01', '2026-08-30T12:00:00.000Z'),
    ];
    expect(tourennummer(touren[1], touren)).toBe('TO-20260901-2');
  });
});
