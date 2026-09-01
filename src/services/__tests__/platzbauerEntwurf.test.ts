import { describe, it, expect } from 'vitest';
import {
  waehleEntwurf,
  entwurfsDaten,
  istUmschlag,
  standAlter,
} from '../platzbauerprojektabwicklungDokumentService';

/**
 * Regression zu Vorschlag [35]: „Preise bei Platzbauer Projektabwicklung werden
 * nicht neu gerechnet, wenn man das Angebot bzw. die AB bearbeitet."
 *
 * Ursache war nicht die Rechnung, sondern das Laden: `ladeEntwurf` gab den
 * localStorage-Stand zurück und fragte Appwrite gar nicht erst. Ein einmal
 * lokal abgelegter Entwurf überlagerte damit dauerhaft jede spätere Änderung.
 */
const umschlag = (zeit: string, wert: unknown) => ({ gespeichertAm: zeit, daten: wert });

describe('waehleEntwurf', () => {
  it('nimmt den jüngeren der beiden Stände', () => {
    const alt = umschlag('2026-01-01T10:00:00.000Z', { preis: 100 });
    const neu = umschlag('2026-08-31T10:00:00.000Z', { preis: 120 });

    expect(waehleEntwurf(neu, alt)).toBe(neu);
    expect(waehleEntwurf(alt, neu)).toBe(neu);
  });

  it('lässt bei gleichem Zeitstempel Appwrite gewinnen', () => {
    // Der Normalfall: speichereEntwurf schreibt beide mit derselben Zeit.
    // Appwrite ist die geteilte Quelle, der localStorage nur das Netz.
    const zeit = '2026-08-31T10:00:00.000Z';
    const ausAppwrite = umschlag(zeit, { quelle: 'appwrite' });
    const lokal = umschlag(zeit, { quelle: 'lokal' });

    expect(waehleEntwurf(ausAppwrite, lokal)).toBe(ausAppwrite);
  });

  it('lässt einen alten, undatierten Stand gegen jeden datierten verlieren', () => {
    // Genau der Fall aus dem Bestand: flacher Entwurf ohne Umschlag im
    // localStorage, daneben ein frisch in Appwrite gespeicherter Stand.
    const altesFormat = { preis: 100 };
    const ausAppwrite = umschlag('2026-08-31T10:00:00.000Z', { preis: 120 });

    expect(waehleEntwurf(ausAppwrite, altesFormat)).toBe(ausAppwrite);
  });

  it('nutzt den lokalen Stand, wenn Appwrite nichts hat', () => {
    // Der Fall, für den der localStorage gedacht war: Speichern in Appwrite
    // ist fehlgeschlagen, die Arbeit darf trotzdem nicht verloren gehen.
    const lokal = umschlag('2026-08-31T10:00:00.000Z', { preis: 120 });
    expect(waehleEntwurf(null, lokal)).toBe(lokal);
  });

  it('gibt null zurück, wenn es nichts gibt', () => {
    expect(waehleEntwurf(null, null)).toBeNull();
  });
});

describe('entwurfsDaten', () => {
  it('packt den Umschlag aus', () => {
    expect(entwurfsDaten(umschlag('2026-08-31T10:00:00.000Z', { preis: 120 }))).toEqual({ preis: 120 });
  });

  it('reicht das alte, flache Format unverändert durch', () => {
    const alt = { preis: 100, positionen: [] };
    expect(entwurfsDaten(alt)).toBe(alt);
  });

  it('verträgt null', () => {
    expect(entwurfsDaten(null)).toBeNull();
  });
});

describe('istUmschlag / standAlter', () => {
  it('unterscheidet die Formate', () => {
    expect(istUmschlag(umschlag('2026-08-31T10:00:00.000Z', {}))).toBe(true);
    expect(istUmschlag({ preis: 100 })).toBe(false);
    expect(istUmschlag(null)).toBe(false);
  });

  it('gibt undatierten Ständen das Alter 0', () => {
    expect(standAlter({ preis: 100 })).toBe(0);
    expect(standAlter(umschlag('kein datum', {}))).toBe(0);
    expect(standAlter(umschlag('2026-08-31T10:00:00.000Z', {}))).toBeGreaterThan(0);
  });
});
