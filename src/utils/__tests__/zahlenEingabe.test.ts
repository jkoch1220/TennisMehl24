import { describe, it, expect } from 'vitest';
import {
  bereinigeEingefuegtenText,
  bereinigeZahlText,
  formatZahlAnzeige,
  gleicherWert,
  parseZahlText,
  rundeAuf,
  schliesseEingabeAb,
  schrittWert,
  zahlAusProp,
} from '../zahlenEingabe';

/**
 * Vorschlag „Komma in Platzbauer-Staffelpreisangeboten" (09/2026), ausgeweitet
 * auf alle Zahlenfelder: Punkt UND Komma müssen funktionieren, ein geleertes
 * Feld darf nicht auf „0" zurückspringen, Zwischenstände wie „0," bleiben stehen.
 */
describe('bereinigeZahlText', () => {
  it('nimmt Punkt und Komma als Dezimaltrenner und zeigt Komma', () => {
    expect(bereinigeZahlText('50,5')).toBe('50,5');
    expect(bereinigeZahlText('50.5')).toBe('50,5');
  });

  it('lässt Zwischenstände beim Tippen stehen', () => {
    expect(bereinigeZahlText('')).toBe('');
    expect(bereinigeZahlText('0,')).toBe('0,');
    expect(bereinigeZahlText('05')).toBe('05');
    expect(bereinigeZahlText(',')).toBe(',');
  });

  it('wirft Fremdzeichen und Leerzeichen weg', () => {
    expect(bereinigeZahlText('50,5 t')).toBe('50,5');
    expect(bereinigeZahlText('abc')).toBe('');
    expect(bereinigeZahlText('1 234')).toBe('1234');
  });

  it('liest Zwischenablage mit Tausenderpunkten richtig', () => {
    expect(bereinigeZahlText('1.234,56')).toBe('1234,56');
    expect(bereinigeZahlText('1,234.56')).toBe('1234,56');
    expect(bereinigeZahlText('1.234.567')).toBe('1234567');
  });

  it('erlaubt nur einen Dezimaltrenner und behält dabei die Größenordnung', () => {
    // Bis 09/2026 stand hier '123': alle Trenner wurden entfernt, sobald zwei
    // auftauchten. Das machte aus dem Vertipper „1,2,3" das Hundertfache.
    // Jetzt zählt der erste Trenner als Dezimaltrenner, der Rest fällt weg.
    expect(bereinigeZahlText('1,2,3')).toBe('1,23');
  });

  it('begrenzt Nachkommastellen', () => {
    expect(bereinigeZahlText('12,3456', { dezimalstellen: 2 })).toBe('12,34');
  });

  it('hält im Ganzzahlfeld beim Tippen genau einen Trenner', () => {
    // Der Trenner bleibt stehen, damit die Ziffern dahinter überhaupt ankommen
    // („1.234" Paletten). Aufgelöst wird er erst beim Verlassen des Feldes –
    // siehe „Ganzzahlfeld (dezimalstellen = 0)" weiter unten. Ihn hier zu
    // entfernen statt aufzulösen machte aus „7,9" einmal die Zahl 79.
    expect(bereinigeZahlText('7,9', { dezimalstellen: 0 })).toBe('7,9');
    expect(bereinigeZahlText('12.5', { dezimalstellen: 0 })).toBe('12,5');
    expect(bereinigeZahlText('12,,5', { dezimalstellen: 0 })).toBe('12,5');
    expect(schliesseEingabeAb('12,5', { dezimalstellen: 0 }).wert).toBe(13);
    expect(schliesseEingabeAb('7,9', { dezimalstellen: 0 }).wert).not.toBe(79);
  });

  it('erlaubt Minus nur, wenn negative Werte zugelassen sind', () => {
    expect(bereinigeZahlText('-5')).toBe('-5');
    expect(bereinigeZahlText('-5', { min: 0 })).toBe('5');
    expect(bereinigeZahlText('-5', { min: -10 })).toBe('-5');
    expect(bereinigeZahlText('-', { negativ: true })).toBe('-');
    expect(bereinigeZahlText('5-3')).toBe('53');
  });
});

describe('parseZahlText', () => {
  it('liest deutsche Schreibweise', () => {
    expect(parseZahlText('50,5')).toBe(50.5);
    expect(parseZahlText('-3,25')).toBe(-3.25);
    expect(parseZahlText('05')).toBe(5);
  });

  it('liefert null für leer und halbe Eingaben', () => {
    expect(parseZahlText('')).toBeNull();
    expect(parseZahlText('-')).toBeNull();
    expect(parseZahlText(',')).toBeNull();
    expect(parseZahlText('abc')).toBeNull();
  });

  it('liest „0," als 0, damit Summen live mitrechnen', () => {
    expect(parseZahlText('0,')).toBe(0);
  });
});

describe('formatZahlAnzeige', () => {
  it('schreibt deutsch ohne Tausenderpunkte', () => {
    expect(formatZahlAnzeige(50.5)).toBe('50,5');
    expect(formatZahlAnzeige(1234)).toBe('1234');
    expect(formatZahlAnzeige(1234.5)).toBe('1234,5');
    expect(formatZahlAnzeige(0)).toBe('0');
  });

  it('rundet auf die gewünschten Stellen', () => {
    expect(formatZahlAnzeige(12.345, 2)).toBe('12,35');
    expect(formatZahlAnzeige(12, 2)).toBe('12');
  });

  it('zeigt leer für leer', () => {
    expect(formatZahlAnzeige(null)).toBe('');
    expect(formatZahlAnzeige(undefined)).toBe('');
    expect(formatZahlAnzeige(NaN)).toBe('');
  });

  it('frisst keine echten Nullen (Regression: aus 1000 wurde 1)', () => {
    expect(formatZahlAnzeige(1000)).toBe('1000');
    expect(formatZahlAnzeige(20)).toBe('20');
  });
});

describe('schliesseEingabeAb', () => {
  it('macht die Anzeige kanonisch und behält den Wert', () => {
    expect(schliesseEingabeAb('05')).toEqual({ wert: 5, anzeige: '5' });
    expect(schliesseEingabeAb('50.50')).toEqual({ wert: 50.5, anzeige: '50,5' });
    expect(schliesseEingabeAb('0,')).toEqual({ wert: 0, anzeige: '0' });
  });

  it('lässt ein leeres Feld leer', () => {
    expect(schliesseEingabeAb('')).toEqual({ wert: null, anzeige: '' });
    expect(schliesseEingabeAb('-')).toEqual({ wert: null, anzeige: '' });
  });

  it('rundet und begrenzt', () => {
    expect(schliesseEingabeAb('12,345', { dezimalstellen: 2 })).toEqual({ wert: 12.35, anzeige: '12,35' });
    expect(schliesseEingabeAb('-3', { min: 0 })).toEqual({ wert: 0, anzeige: '0' });
    expect(schliesseEingabeAb('150', { max: 100 })).toEqual({ wert: 100, anzeige: '100' });
  });

  it('gibt keine -0 zurück', () => {
    const { wert } = schliesseEingabeAb('-0', { negativ: true });
    expect(Object.is(wert, -0)).toBe(false);
    expect(wert).toBe(0);
  });
});

describe('schrittWert', () => {
  it('geht ohne Gleitkomma-Müll weiter', () => {
    expect(schrittWert(0.1, 1, 0.2)).toBe(0.3);
    expect(schrittWert(1.15, 1, 0.01)).toBe(1.16);
    expect(schrittWert(5, -1, 1)).toBe(4);
  });

  it('startet auf leerem Feld bei 0 bzw. min', () => {
    expect(schrittWert(null, 1, 1)).toBe(1);
    expect(schrittWert(null, -1, 1, { min: 0 })).toBe(0);
    expect(schrittWert(null, 1, 1, { min: 10 })).toBe(11);
  });

  it('bleibt in min/max', () => {
    expect(schrittWert(100, 1, 1, { max: 100 })).toBe(100);
    expect(schrittWert(0, -1, 1, { min: 0 })).toBe(0);
  });
});

describe('rundeAuf', () => {
  it('rundet kaufmännisch inklusive der klassischen Fälle', () => {
    expect(rundeAuf(1.005, 2)).toBe(1.01);
    expect(rundeAuf(2.675, 2)).toBe(2.68);
    expect(rundeAuf(12.3456, 1)).toBe(12.3);
  });
});

describe('zahlAusProp', () => {
  it('liest Zahl, String und leere Angaben', () => {
    expect(zahlAusProp(0.01)).toBe(0.01);
    expect(zahlAusProp('0.01')).toBe(0.01);
    expect(zahlAusProp('0,5')).toBe(0.5);
    expect(zahlAusProp('any')).toBeUndefined();
    expect(zahlAusProp('')).toBeUndefined();
    expect(zahlAusProp(undefined)).toBeUndefined();
  });
});

describe('gleicherWert', () => {
  it('behandelt null, undefined und NaN als „leer"', () => {
    expect(gleicherWert(null, undefined)).toBe(true);
    expect(gleicherWert(NaN, null)).toBe(true);
    expect(gleicherWert(0, null)).toBe(false);
    expect(gleicherWert(5, 5)).toBe(true);
    expect(gleicherWert(5, 5.0001)).toBe(false);
  });
});

/**
 * Fälle aus der Prüfung 09/2026. Jeder davon hat einmal eine falsche Zahl
 * gespeichert, ohne dass irgendwo eine Meldung erschien — deshalb stehen sie
 * hier mit dem konkreten Betrag, um den es ging.
 */
describe('Größenordnung bleibt erhalten', () => {
  it('ein zweiter Trenner verzehnfacht den Preis nicht', () => {
    // „1,5," entsteht beim Doppelanschlag aufs Numpad-Komma. Vorher: „15".
    expect(bereinigeZahlText('1,5,')).toBe('1,5');
    expect(bereinigeZahlText('1,,2')).toBe('1,2');
    expect(bereinigeZahlText('1..2')).toBe('1,2');
    expect(bereinigeZahlText('1.2.3')).toBe('1,23');
  });

  it('echte Tausendergruppierung wird weiter erkannt', () => {
    expect(bereinigeZahlText('1.234.567')).toBe('1234567');
    expect(bereinigeZahlText('1.234,56')).toBe('1234,56');
  });

  it('rundet negative Beträge wie positive', () => {
    // -1,005 wurde zu -1: ein Cent verschwand aus jeder Gutschrift.
    expect(rundeAuf(-1.005, 2)).toBe(-1.01);
    expect(rundeAuf(-0.125, 2)).toBe(-0.13);
    expect(rundeAuf(-2.5, 0)).toBe(-3);
    expect(Object.is(rundeAuf(-0.4, 0), 0)).toBe(true); // kein „-0" in der Anzeige
  });
});

describe('bereinigeEingefuegtenText', () => {
  it('liest den Punkt in einem Geldfeld als Tausendertrenner', () => {
    // Aus Excel kopierte „1.234" wurden als 1,234 € gebucht.
    expect(bereinigeEingefuegtenText('1.234', { dezimalstellen: 2 })).toBe('1234');
    expect(bereinigeEingefuegtenText('1.234,56', { dezimalstellen: 2 })).toBe('1234,56');
  });

  it('lässt Mengenfelder ohne feste Stellen bei der Dezimallesart', () => {
    // Sonst würden aus 1,234 t plötzlich 1234 t – der Fehler in die andere Richtung.
    expect(bereinigeEingefuegtenText('1.234')).toBe('1,234');
  });

  it('rundet überzählige Nachkommastellen, statt sie abzuschneiden', () => {
    expect(bereinigeEingefuegtenText('0,105', { dezimalstellen: 2 })).toBe('0,11');
    expect(bereinigeEingefuegtenText('12,345', { dezimalstellen: 2 })).toBe('12,35');
  });

  it('wirft Einheiten und Leerzeichen aus der Zwischenablage weg', () => {
    expect(bereinigeEingefuegtenText('1 234,50 €', { dezimalstellen: 2 })).toBe('1234,5');
  });
});

describe('Ganzzahlfeld (dezimalstellen = 0)', () => {
  it('lässt den Trenner beim Tippen stehen, damit die Ziffern dahinter ankommen', () => {
    // Vorher wurde beim Punkt abgeschnitten: aus „1.234" Paletten wurde 1.
    expect(bereinigeZahlText('1.234', { dezimalstellen: 0 })).toBe('1,234');
    expect(bereinigeZahlText('7,9', { dezimalstellen: 0 })).toBe('7,9');
  });

  it('löst den Trenner erst beim Verlassen auf', () => {
    // Drei Ziffern dahinter = Tausendertrennung, sonst kaufmännisch runden.
    expect(schliesseEingabeAb('1,234', { dezimalstellen: 0 }).wert).toBe(1234);
    expect(schliesseEingabeAb('1.234', { dezimalstellen: 0 }).wert).toBe(1234);
    expect(schliesseEingabeAb('7,9', { dezimalstellen: 0 }).wert).toBe(8);
    expect(schliesseEingabeAb('7,4', { dezimalstellen: 0 }).wert).toBe(7);
    // Und keinesfalls 79 – der Fehler, mit dem das Ganze anfing.
    expect(schliesseEingabeAb('7,9', { dezimalstellen: 0 }).wert).not.toBe(79);
  });
});
