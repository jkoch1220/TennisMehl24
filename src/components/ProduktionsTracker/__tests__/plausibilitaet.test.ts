import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BuchungsEingabe, ProduktionsBuchung } from '../../../types/produktion';

/**
 * Tests der Plausibilitätsprüfung — mit Schwerpunkt auf der Rechteschranke.
 *
 * Der wichtigste Fall hier ist nicht, DASS gewarnt wird, sondern WOMIT. Die
 * Warnung „Tagessumme läge damit bei 640 t" nennt genau die Betriebszahl, die
 * einem Mitarbeiter ohne `auswertung`-Recht verborgen bleiben soll — die
 * Rechteschranke würde an ihrer eigenen Warnung lecken.
 *
 * Appwrite wird ausgehängt: geprüft wird reine Rechenlogik, kein Datenzugriff.
 */

vi.mock('../../../config/appwrite', () => ({
  databases: {},
  DATABASE_ID: 'test',
  PRODUKTION_BUCHUNGEN_COLLECTION_ID: 'produktion_buchungen',
}));
vi.mock('../../../services/dashboardService', () => ({ dashboardService: {} }));

const { pruefePlausibilitaet, berechneMaterialbilanz, kumuliertAusBuchungen, berechneTonnen } =
  await import('../../../services/produktionService');

const HEUTE = '2026-09-07';

const buchung = (teil: Partial<ProduktionsBuchung>): ProduktionsBuchung => ({
  $id: Math.random().toString(36).slice(2),
  bereich: 'mahlen',
  datum: HEUTE,
  zeitpunkt: `${HEUTE}T10:00:00.000Z`,
  tonnen: 10,
  storniert: false,
  ...teil,
});

const eingabe = (teil: Partial<BuchungsEingabe>): BuchungsEingabe => ({
  bereich: 'mahlen',
  datum: HEUTE,
  koernung: '0-2',
  ...teil,
});

const pruefe = (
  e: Partial<BuchungsEingabe>,
  tonnen: number,
  kontext: Partial<Parameters<typeof pruefePlausibilitaet>[2]> = {}
) =>
  pruefePlausibilitaet(eingabe(e), tonnen, {
    bisherigeAmTag: [],
    eigeneLetzte: [],
    zeigeZahlen: true,
    ...kontext,
  });

const texte = (hinweise: { text: string }[]) => hinweise.map((h) => h.text).join(' | ');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 7, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// Rechteschranke
// ---------------------------------------------------------------------------

describe('Warntexte respektieren die Rechteschranke', () => {
  const vieleAmTag = [buchung({ tonnen: 480 })];

  it('nennt der Leitung die konkrete Tagessumme', () => {
    const h = pruefe({}, 60, { bisherigeAmTag: vieleAmTag, zeigeZahlen: true });
    expect(texte(h)).toContain('540');
  });

  it('nennt dem Mitarbeiter KEINE Betriebszahl', () => {
    const h = pruefe({}, 60, { bisherigeAmTag: vieleAmTag, zeigeZahlen: false });
    expect(h.some((x) => x.stufe === 'warnung')).toBe(true);
    expect(texte(h)).toContain('Ungewöhnlich viel für einen Tag');
    // Keine Ziffernfolge, die eine Betriebssumme sein könnte.
    expect(texte(h)).not.toMatch(/\d{3}/);
  });

  it('verschweigt dem Mitarbeiter auch den negativen Mehlvorrat', () => {
    const leitung = pruefe({ bereich: 'abfuellung' }, 30, {
      losesMehlVorrat: 10,
      zeigeZahlen: true,
    });
    expect(texte(leitung)).toContain('-20');

    const mitarbeiter = pruefe({ bereich: 'abfuellung' }, 30, {
      losesMehlVorrat: 10,
      zeigeZahlen: false,
    });
    expect(texte(mitarbeiter)).toContain('Mehr abgefüllt als zuletzt gemahlen');
    expect(texte(mitarbeiter)).not.toContain('-20');
  });

  it('nennt die EIGENE Eingabe auch dem Mitarbeiter — sie ist keine fremde Zahl', () => {
    const h = pruefe({}, 240, { zeigeZahlen: false });
    expect(texte(h)).toContain('240');
  });
});

// ---------------------------------------------------------------------------
// Doppelbuchungen
// ---------------------------------------------------------------------------

describe('Wiederholungserkennung', () => {
  it('warnt bei gleicher Menge im selben Bereich binnen 10 Minuten', () => {
    // Der häufigste Fehler an der Anlage ist nicht die falsche Zahl, sondern
    // die zweite Buchung aus Unsicherheit, ob die erste angekommen ist.
    const vorhin = buchung({ tonnen: 24, zeitpunkt: new Date(Date.now() - 3 * 60_000).toISOString() });
    const h = pruefe({}, 24, { eigeneLetzte: [vorhin] });
    expect(texte(h)).toMatch(/Vor 3 Minuten/);
  });

  it('schweigt nach mehr als 10 Minuten', () => {
    const laengerHer = buchung({
      tonnen: 24,
      zeitpunkt: new Date(Date.now() - 20 * 60_000).toISOString(),
    });
    expect(texte(pruefe({}, 24, { eigeneLetzte: [laengerHer] }))).not.toMatch(/Nochmal/);
  });

  it('schweigt bei anderer Menge', () => {
    const vorhin = buchung({ tonnen: 24, zeitpunkt: new Date(Date.now() - 60_000).toISOString() });
    expect(texte(pruefe({}, 30, { eigeneLetzte: [vorhin] }))).not.toMatch(/Nochmal/);
  });

  it('schweigt bei anderem Bereich', () => {
    const vorhin = buchung({
      bereich: 'rohmaterial',
      tonnen: 24,
      zeitpunkt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(texte(pruefe({}, 24, { eigeneLetzte: [vorhin] }))).not.toMatch(/Nochmal/);
  });

  it('zählt eine stornierte Buchung nicht als Wiederholung', () => {
    const storniert = buchung({
      tonnen: 24,
      storniert: true,
      zeitpunkt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(texte(pruefe({}, 24, { eigeneLetzte: [storniert] }))).not.toMatch(/Nochmal/);
  });
});

// ---------------------------------------------------------------------------
// Fachliche Grenzen
// ---------------------------------------------------------------------------

describe('Rohmaterial-Grenzen', () => {
  it('lässt eine normale LKW-Lieferung ohne Warnung durch', () => {
    const h = pruefe({ bereich: 'rohmaterial', lieferant: 'Wienerberger', koernung: null }, 24.32);
    expect(h.filter((x) => x.stufe === 'warnung')).toHaveLength(0);
  });

  it('warnt oberhalb eines Sattelzugs', () => {
    const h = pruefe({ bereich: 'rohmaterial', lieferant: 'X', koernung: null }, 44);
    expect(texte(h)).toContain('Sattelzug');
  });

  it('warnt bei ungewöhnlich kleiner Lieferung', () => {
    const h = pruefe({ bereich: 'rohmaterial', lieferant: 'X', koernung: null }, 3);
    expect(texte(h)).toContain('LKW-Lieferung');
  });

  it('merkt einen fehlenden Lieferanten an, ohne zu blockieren', () => {
    const h = pruefe({ bereich: 'rohmaterial', lieferant: null, koernung: null }, 24);
    const hinweis = h.find((x) => x.text.includes('Lieferant'));
    expect(hinweis?.stufe).toBe('hinweis');
  });
});

describe('Datum', () => {
  it('warnt vor Zukunftsdaten', () => {
    expect(texte(pruefe({ datum: '2026-09-20' }, 10))).toContain('Zukunft');
  });

  it('weist auf weit zurückliegende Nacherfassung hin', () => {
    const h = pruefe({ datum: '2026-08-01' }, 10);
    expect(texte(h)).toMatch(/Nacherfassung/);
    expect(h.find((x) => x.text.includes('Nacherfassung'))?.stufe).toBe('hinweis');
  });
});

// ---------------------------------------------------------------------------
// Tonnage und Bilanz
// ---------------------------------------------------------------------------

describe('berechneTonnen', () => {
  it('nimmt bei Gebinden die Stückzahl mal Gebindegewicht', () => {
    expect(berechneTonnen(eingabe({ bereich: 'abfuellung', gebinde: 'palette', gebindeAnzahl: 12 }))).toBe(12);
    expect(berechneTonnen(eingabe({ bereich: 'abfuellung', gebinde: 'sack', gebindeAnzahl: 25 }))).toBe(1);
  });

  it('ergibt 0 ohne Gebindeart — es gibt dann nichts umzurechnen', () => {
    expect(berechneTonnen(eingabe({ bereich: 'abfuellung', gebinde: null, gebindeAnzahl: 12 }))).toBe(0);
  });

  it('nimmt sonst die eingegebene Tonnage', () => {
    expect(berechneTonnen(eingabe({ bereich: 'rohmaterial', tonnen: 24.324 }))).toBe(24.324);
  });
});

describe('berechneMaterialbilanz', () => {
  const bestand = [
    buchung({ bereich: 'rohmaterial', tonnen: 100 }),
    buchung({ bereich: 'mahlen', tonnen: 90 }),
    buchung({ bereich: 'abfuellung', tonnen: 45 }),
  ];

  it('rechnet Ausbeute und Abfüllquote', () => {
    const b = berechneMaterialbilanz(bestand);
    expect(b.ausbeute).toBeCloseTo(0.9);
    expect(b.abfuellQuote).toBeCloseTo(0.5);
  });

  it('liefert null statt einer Division durch null', () => {
    const b = berechneMaterialbilanz([buchung({ bereich: 'mahlen', tonnen: 10 })]);
    expect(b.ausbeute).toBeNull();
    expect(b.abfuellQuote).toBe(0);
  });
});

describe('kumuliertAusBuchungen', () => {
  it('bildet den Materialfluss ab: Abfüllen nimmt lose weg und legt Gebinde hin', () => {
    const k = kumuliertAusBuchungen([
      buchung({ bereich: 'rohmaterial', tonnen: 100 }),
      buchung({ bereich: 'mahlen', tonnen: 80 }),
      buchung({ bereich: 'abfuellung', tonnen: 30 }),
    ]);
    expect(k).toEqual({
      ziegelschutt: 100,
      ziegelmehlSchuettware: 50,
      ziegelmehlSackware: 30,
    });
  });

  it('lässt stornierte Buchungen vollständig außen vor', () => {
    const k = kumuliertAusBuchungen([
      buchung({ bereich: 'mahlen', tonnen: 80 }),
      buchung({ bereich: 'mahlen', tonnen: 999, storniert: true }),
    ]);
    expect(k.ziegelmehlSchuettware).toBe(80);
  });
});
