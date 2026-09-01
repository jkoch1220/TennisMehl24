/**
 * Ein Testversand darf die Zeile nicht als erledigt markieren.
 *
 * Beim Testversand kommt beim Verein nichts an — die Mail geht an die
 * Testadresse. Springt die Zeile trotzdem auf „versendet/geprüft", verschwindet
 * sie aus dem Arbeitsvorrat: Die Liste behauptet, der Verein habe sein Angebot,
 * und niemand schickt es je wirklich los.
 */
import { describe, it, expect } from 'vitest';

interface Zeile {
  markierung: string;
  versendetAm?: string;
  projektId?: string;
  angebotsnummer?: string;
}

/** Bildet die Fortschreibung aus erzeugeUndVersendeZeile nach. */
const nachVersand = (zeile: Zeile, testModus: boolean, projektId: string, nummer: string): Zeile =>
  testModus
    ? { ...zeile, projektId, angebotsnummer: nummer }
    : { ...zeile, projektId, angebotsnummer: nummer, versendetAm: '2026-08-27T10:00:00Z', markierung: 'geprueft' };

const offen = (): Zeile => ({ markierung: 'offen' });

describe('Testversand', () => {
  it('lässt die Zeile offen — sie muss noch echt raus', () => {
    const z = nachVersand(offen(), true, 'p1', 'ANG-2027-0001');
    expect(z.versendetAm).toBeUndefined();
    expect(z.markierung).toBe('offen');
  });

  it('hält die Angebotsnummer trotzdem fest', () => {
    // Das Projekt IST erzeugt. Ohne diese Notiz legte ein zweiter Lauf es
    // ein zweites Mal an — mit einer zweiten Belegnummer.
    const z = nachVersand(offen(), true, 'p1', 'ANG-2027-0001');
    expect(z.projektId).toBe('p1');
    expect(z.angebotsnummer).toBe('ANG-2027-0001');
  });

  it('überschreibt eine bestehende Markierung nicht', () => {
    const z = nachVersand({ markierung: 'kompliziert' }, true, 'p1', 'ANG-2027-0002');
    expect(z.markierung).toBe('kompliziert');
  });
});

describe('Scharfer Versand', () => {
  it('markiert die Zeile als versendet und geprüft', () => {
    const z = nachVersand(offen(), false, 'p1', 'ANG-2027-0003');
    expect(z.versendetAm).toBeTruthy();
    expect(z.markierung).toBe('geprueft');
  });

  it('zählt danach nicht mehr als versandbereit', () => {
    const z = nachVersand(offen(), false, 'p1', 'ANG-2027-0004');
    const versandbereit = (x: Zeile) => !!x.projektId && !x.versendetAm;
    expect(versandbereit(z)).toBe(false);
    // Nach einem Testversand dagegen schon.
    expect(versandbereit(nachVersand(offen(), true, 'p1', 'ANG-2027-0005'))).toBe(true);
  });
});
