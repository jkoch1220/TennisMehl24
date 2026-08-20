/**
 * Der Liefertermin steht in drei Feldern mit unterschiedlicher Verbindlichkeit.
 * Wer sie verwechselt, zeigt dem Disponenten eine Schätzung als Zusage an — oder
 * verschiebt eine Zusage per Wischgeste.
 */
import { describe, it, expect } from 'vitest';
import {
  lieferterminEffektiv,
  formatiereTermin,
  wochenSchluessel,
  istUeberfaellig,
} from '../liefertermin';
import { Projekt } from '../../types/projekt';

const projekt = (teil: Partial<Projekt>): Projekt =>
  ({ id: 'p1', status: 'auftragsbestaetigung', saisonjahr: 2027, ...teil } as Projekt);

describe('lieferterminEffektiv', () => {
  it('gibt null zurück, wenn kein Termin hinterlegt ist', () => {
    // Kein Fehler: Ein offenes Angebot braucht keinen Termin.
    expect(lieferterminEffektiv(projekt({}))).toBeNull();
  });

  it('nimmt die Lieferwoche, wenn sonst nichts da ist — als Schätzung', () => {
    const t = lieferterminEffektiv(projekt({ lieferKW: 15, lieferKWJahr: 2027 }));
    expect(t).toMatchObject({ kw: 15, kwJahr: 2027, quelle: 'geschaetzt', verbindlich: false });
    // Der Montag steht stellvertretend für die Woche.
    expect(t?.datum).toBe('2027-04-12');
  });

  it('fällt ohne KW-Jahr auf das Saisonjahr zurück', () => {
    const t = lieferterminEffektiv(projekt({ lieferKW: 15, saisonjahr: 2026 }));
    expect(t?.kwJahr).toBe(2026);
  });

  it('bevorzugt das geplante Datum vor der groben Woche', () => {
    const t = lieferterminEffektiv(
      projekt({ lieferKW: 15, lieferKWJahr: 2027, geplantesDatum: '2027-04-14' })
    );
    expect(t).toMatchObject({ datum: '2027-04-14', quelle: 'geplant' });
  });

  it('bevorzugt den mit dem Kunden abgestimmten Tag vor allem anderen', () => {
    const t = lieferterminEffektiv(
      projekt({
        lieferKW: 15,
        lieferKWJahr: 2027,
        geplantesDatum: '2027-04-14',
        kommuniziertesDatum: '2027-04-16',
      })
    );
    expect(t).toMatchObject({ datum: '2027-04-16', quelle: 'abgestimmt', verbindlich: true });
  });

  it('macht ein abgestimmtes Datum immer verbindlich, egal welcher Terminart', () => {
    // Was dem Kunden gesagt wurde, ist eine Zusage — auch wenn intern nur „spätestens" steht.
    const t = lieferterminEffektiv(
      projekt({ kommuniziertesDatum: '2027-04-16', lieferdatumTyp: 'spaetestens' })
    );
    expect(t?.verbindlich).toBe(true);
  });

  it('macht ein geplantes Datum nur bei Terminart „fix" verbindlich', () => {
    expect(
      lieferterminEffektiv(projekt({ geplantesDatum: '2027-04-14', lieferdatumTyp: 'fix' }))?.verbindlich
    ).toBe(true);
    expect(
      lieferterminEffektiv(projekt({ geplantesDatum: '2027-04-14', lieferdatumTyp: 'spaetestens' }))?.verbindlich
    ).toBe(false);
  });

  it('ignoriert unlesbare Datumsangaben und weicht auf die Woche aus', () => {
    const t = lieferterminEffektiv(
      projekt({ kommuniziertesDatum: 'kein Datum', lieferKW: 12, lieferKWJahr: 2027 })
    );
    expect(t).toMatchObject({ kw: 12, quelle: 'geschaetzt' });
  });
});

describe('formatiereTermin', () => {
  it('zeigt bei einer reinen Wochenangabe die KW, nicht den Montag', () => {
    const t = lieferterminEffektiv(projekt({ lieferKW: 15, lieferKWJahr: 2027 }))!;
    expect(formatiereTermin(t)).toBe('KW 15');
  });

  it('zeigt bei einem Tagestermin Wochentag und Datum', () => {
    const t = lieferterminEffektiv(projekt({ geplantesDatum: '2027-04-14' }))!;
    expect(formatiereTermin(t)).toBe('Mi 14.04.');
  });
});

describe('wochenSchluessel', () => {
  it('ist über Jahresgrenzen hinweg sortierbar', () => {
    const kw52 = lieferterminEffektiv(projekt({ lieferKW: 52, lieferKWJahr: 2026 }))!;
    const kw2 = lieferterminEffektiv(projekt({ lieferKW: 2, lieferKWJahr: 2027 }))!;
    expect(wochenSchluessel(kw52)).toBe('2026-52');
    expect(wochenSchluessel(kw2)).toBe('2027-02');
    expect(wochenSchluessel(kw52) < wochenSchluessel(kw2)).toBe(true);
  });
});

describe('istUeberfaellig', () => {
  const heute = new Date('2027-04-20T10:00:00');

  it('meldet einen verstrichenen Tagestermin', () => {
    expect(istUeberfaellig(projekt({ geplantesDatum: '2027-04-14' }), heute)).toBe(true);
  });

  it('meldet eine laufende Woche NICHT als überfällig', () => {
    // KW 16 beginnt am 19.04. — am Dienstag ist die Woche noch nicht vorbei.
    expect(istUeberfaellig(projekt({ lieferKW: 16, lieferKWJahr: 2027 }), heute)).toBe(false);
  });

  it('meldet eine abgelaufene Woche als überfällig', () => {
    expect(istUeberfaellig(projekt({ lieferKW: 14, lieferKWJahr: 2027 }), heute)).toBe(true);
  });

  it('meldet gelieferte und abgerechnete Projekte nie als überfällig', () => {
    for (const status of ['geliefert', 'rechnung', 'bezahlt', 'verloren'] as const) {
      expect(istUeberfaellig(projekt({ geplantesDatum: '2027-04-14', status }), heute)).toBe(false);
    }
  });

  it('meldet ein Projekt ohne Termin nicht als überfällig', () => {
    expect(istUeberfaellig(projekt({}), heute)).toBe(false);
  });
});
