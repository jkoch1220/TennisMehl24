import { describe, it, expect } from 'vitest';
import { titelAusBeschreibung } from '../vorschlagTitel';

describe('titelAusBeschreibung', () => {
  it('nimmt den ersten Satz', () => {
    expect(titelAusBeschreibung('Menge hochklicken geht nicht. Die Summe bleibt gleich.'))
      .toBe('Menge hochklicken geht nicht');
  });

  it('nimmt die erste Zeile, wenn sie vor dem Satzende endet', () => {
    expect(titelAusBeschreibung('Dispo braucht eine Touren-Nr\nAm besten fortlaufend'))
      .toBe('Dispo braucht eine Touren-Nr');
  });

  it('kürzt lange Texte an der Wortgrenze', () => {
    const lang = 'Wenn ein Kunde beim Anlegen mit direkt Instandsetzung angelegt wird sollte automatisch die Platzbau-Stückliste hinterlegt werden';
    const titel = titelAusBeschreibung(lang);

    expect(titel.length).toBeLessThanOrEqual(71);
    expect(titel.endsWith('…')).toBe(true);

    // Nicht mitten im Wort abgeschnitten: Der Text vor dem Auslassungszeichen
    // muss im Original von einem Leerzeichen gefolgt werden.
    const ohneAuslassung = titel.slice(0, -1);
    expect(lang.startsWith(ohneAuslassung)).toBe(true);
    expect(lang[ohneAuslassung.length]).toBe(' ');
  });

  it('lässt kurze Beschreibungen unverändert', () => {
    expect(titelAusBeschreibung('Google Adresse')).toBe('Google Adresse');
  });

  it('gibt bei leerer Eingabe einen leeren Titel zurück', () => {
    expect(titelAusBeschreibung('')).toBe('');
    expect(titelAusBeschreibung('   \n  ')).toBe('');
  });

  it('verträgt Ausrufe- und Fragezeichen als Satzende', () => {
    expect(titelAusBeschreibung('Geht das auch mobil? Wäre praktisch.')).toBe('Geht das auch mobil');
  });
});
