import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  GEBINDE_ARTEN,
  gebindeInTonnen,
  getGebinde,
  getKoernung,
  type ProduktionsBuchung,
} from '../../../types/produktion';
import {
  alsDatum,
  ausDatum,
  formatDatumKurz,
  kalenderwoche,
  kennzahlen,
  koernungsVerteilung,
  monatsPrognose,
  montagDerWoche,
  summe,
  tagesReihe,
  verschiebeTage,
  wochentagsProfil,
} from '../statistik';

/**
 * Tests der Rechenkerne der Produktionserfassung.
 *
 * Absichtlich nur reine Funktionen: Gebinde-Umrechnung, Datumsarithmetik und
 * Aggregation. Genau dort sitzen die Fehler, die niemandem auffallen — eine
 * um einen Tag verschobene Kennzahl sieht plausibel aus, und eine falsche
 * Gebinde-Umrechnung landet unbemerkt im Lagerbestand.
 */

const buchung = (teil: Partial<ProduktionsBuchung>): ProduktionsBuchung => ({
  $id: Math.random().toString(36).slice(2),
  bereich: 'mahlen',
  datum: '2026-09-07',
  zeitpunkt: '2026-09-07T10:00:00.000Z',
  tonnen: 10,
  storniert: false,
  ...teil,
});

// ---------------------------------------------------------------------------
// Gebinde
// ---------------------------------------------------------------------------

describe('gebindeInTonnen', () => {
  it('rechnet eine Palette Sackware als volle Tonne (25 × 40 kg)', () => {
    const palette = getGebinde('palette')!;
    expect(palette.saeckeProEinheit! * 40).toBe(palette.kiloProEinheit);
    expect(gebindeInTonnen('palette', 12)).toBe(12);
  });

  it('rechnet BigBags mit rund einer Tonne', () => {
    expect(gebindeInTonnen('bigbag', 7)).toBe(7);
  });

  it('rechnet Einzelsäcke mit 40 kg', () => {
    expect(gebindeInTonnen('sack', 1)).toBe(0.04);
    expect(gebindeInTonnen('sack', 25)).toBe(1);
  });

  it('erzeugt keinen Fließkomma-Schrott', () => {
    // 3 × 40/1000 ergibt roh 0.12000000000000001 — das landete sonst so im
    // Lagerbestand und in jeder Summe darüber.
    expect(gebindeInTonnen('sack', 3)).toBe(0.12);
    expect(String(gebindeInTonnen('sack', 3))).not.toContain('0000');
  });

  it('liefert 0 statt NaN bei unbrauchbarer Anzahl', () => {
    expect(gebindeInTonnen('palette', Number.NaN)).toBe(0);
    expect(gebindeInTonnen('palette', Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('hat für jede Gebindeart eine gepflegte Mehrzahl', () => {
    // Eine Regel („+n" / „+s") lieferte für „Einzelsack" ein „Einzelsacks".
    for (const def of GEBINDE_ARTEN) {
      expect(def.mehrzahl.length).toBeGreaterThan(0);
      expect(def.mehrzahl).not.toBe(def.label);
    }
    expect(getGebinde('sack')!.mehrzahl).toBe('Einzelsäcke');
  });
});

// ---------------------------------------------------------------------------
// Körnung
// ---------------------------------------------------------------------------

describe('Körnung', () => {
  it('kennt die verkauften Körnungen', () => {
    expect(getKoernung('0-2')?.label).toBe('0/2 mm');
    expect(getKoernung('0-3')?.label).toBe('0/3 mm');
  });

  it('zeigt Altwerte als solche, statt sie umzudeuten', () => {
    // „mittel" auf 0/2 abzubilden wäre geraten — und in der Auswertung
    // schlimmer als ein ehrliches „unbekannt".
    const alt = getKoernung('mittel');
    expect(alt?.legacy).toBe(true);
    expect(alt?.label).toMatch(/^Alt:/);
  });

  it('verträgt fehlende Körnung', () => {
    expect(getKoernung(null)).toBeNull();
    expect(getKoernung(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Datumsarithmetik
// ---------------------------------------------------------------------------

describe('Datumsarithmetik', () => {
  it('bildet Datum in LOKALER Zeit ab, nicht in UTC', () => {
    // Der Vorgänger benutzte toISOString().split('T')[0]. In deutscher
    // Sommerzeit landete eine Buchung um 01:30 damit auf dem Vortag — die
    // Kachel „Heute" stand auf 0, während gerade gebucht wurde.
    const nachts = new Date(2026, 6, 15, 1, 30, 0);
    expect(alsDatum(nachts)).toBe('2026-07-15');
    expect(nachts.toISOString().split('T')[0]).not.toBe('2026-07-15');
  });

  it('verschiebt über Monats- und Jahresgrenzen', () => {
    expect(verschiebeTage('2026-09-30', 1)).toBe('2026-10-01');
    expect(verschiebeTage('2026-01-01', -1)).toBe('2025-12-31');
    expect(verschiebeTage('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('findet den Montag der Woche, auch am Sonntag', () => {
    // 2026-09-07 ist ein Montag, 2026-09-13 der folgende Sonntag.
    expect(montagDerWoche('2026-09-07')).toBe('2026-09-07');
    expect(montagDerWoche('2026-09-13')).toBe('2026-09-07');
    expect(ausDatum('2026-09-13').getDay()).toBe(0);
  });

  it('zählt ISO-Kalenderwochen', () => {
    expect(kalenderwoche(new Date(2026, 0, 1))).toBe(1);
    expect(kalenderwoche(new Date(2026, 8, 7))).toBe(37);
  });
});

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

describe('Aggregation', () => {
  it('summiert ohne Fließkomma-Rest', () => {
    const b = [buchung({ tonnen: 0.04 }), buchung({ tonnen: 0.04 }), buchung({ tonnen: 0.04 })];
    expect(summe(b)).toBe(0.12);
  });

  it('liefert eine LÜCKENLOSE Tagesreihe', () => {
    // Ein Diagramm, das produktionsfreie Tage überspringt, täuscht eine
    // gleichmäßige Auslastung vor.
    const reihe = tagesReihe([buchung({ datum: '2026-09-03', tonnen: 30 })], '2026-09-01', '2026-09-05');
    expect(reihe).toHaveLength(5);
    expect(reihe.map((t) => t.datum)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
    expect(reihe[2].mahlen).toBe(30);
    expect(reihe[0].mahlen).toBe(0);
  });

  it('trennt die Bereiche in der Tagesreihe', () => {
    const reihe = tagesReihe(
      [
        buchung({ datum: '2026-09-02', bereich: 'rohmaterial', tonnen: 24 }),
        buchung({ datum: '2026-09-02', bereich: 'mahlen', tonnen: 20 }),
        buchung({ datum: '2026-09-02', bereich: 'abfuellung', tonnen: 12 }),
      ],
      '2026-09-02',
      '2026-09-02'
    );
    expect(reihe[0]).toMatchObject({ rohmaterial: 24, mahlen: 20, abfuellung: 12 });
  });

  it('mittelt über PRODUKTIVE Tage, nicht über Kalendertage', () => {
    // An einer Anlage, die vier Tage die Woche läuft, wäre der Kalenderschnitt
    // eine Zahl, die niemandem etwas sagt.
    const b = [
      buchung({ datum: '2026-09-01', tonnen: 30 }),
      buchung({ datum: '2026-09-05', tonnen: 50 }),
    ];
    const k = kennzahlen(b, 'mahlen');
    expect(k.produktiveTage).toBe(2);
    expect(k.durchschnittProTag).toBe(40);
    expect(k.besterTag).toEqual({ datum: '2026-09-05', tonnen: 50 });
  });

  it('rechnet Kennzahlen nur für den eigenen Bereich', () => {
    const b = [
      buchung({ bereich: 'mahlen', tonnen: 20 }),
      buchung({ bereich: 'rohmaterial', tonnen: 100 }),
    ];
    expect(kennzahlen(b, 'mahlen').gesamt).toBe(20);
    expect(kennzahlen(b, 'rohmaterial').gesamt).toBe(100);
    expect(kennzahlen(b, 'abfuellung').gesamt).toBe(0);
  });

  it('beginnt das Wochentagsprofil am Montag', () => {
    // getDay() liefert 0 für Sonntag — ohne Umrechnung landet der Sonntag
    // vorne und jede Spalte ist um einen Tag verschoben.
    const profil = wochentagsProfil([buchung({ datum: '2026-09-13', tonnen: 5 })]);
    expect(profil[0].name).toBe('Mo');
    expect(profil[6].name).toBe('So');
    expect(profil[6].durchschnitt).toBe(5);
    expect(profil[0].durchschnitt).toBe(0);
  });

  it('gewichtet die Körnungsverteilung nach Tonnage', () => {
    const v = koernungsVerteilung([
      buchung({ koernung: '0-2', tonnen: 75 }),
      buchung({ koernung: '0-3', tonnen: 25 }),
    ]);
    expect(v[0]).toMatchObject({ schluessel: '0-2', tonnen: 75, anteil: 75 });
    expect(v[1]).toMatchObject({ schluessel: '0-3', anteil: 25 });
  });

  it('lässt Buchungen ohne Körnung aus der Verteilung heraus', () => {
    const v = koernungsVerteilung([
      buchung({ koernung: '0-2', tonnen: 10 }),
      buchung({ koernung: null, tonnen: 90 }),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].anteil).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Prognose
// ---------------------------------------------------------------------------

describe('monatsPrognose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rechnet nur auf verbleibende WERKTAGE hoch', () => {
    // Mittwoch, 2026-09-09. Bis Monatsende (30.09.) bleiben nach heute
    // 15 Werktage. Bisher: zwei Produktionstage à 20 t.
    vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));
    const b = [
      buchung({ datum: '2026-09-07', tonnen: 20 }),
      buchung({ datum: '2026-09-08', tonnen: 20 }),
    ];
    const prognose = monatsPrognose(b, 'mahlen');
    expect(prognose).toBe(40 + 20 * 15);
    // Gegenprobe: mit Kalendertagen wäre die Zahl deutlich höher.
    expect(prognose).toBeLessThan(40 + 20 * 21);
  });

  it('liefert 0 ohne Datenlage, statt zu raten', () => {
    vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));
    expect(monatsPrognose([], 'mahlen')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------------

describe('formatDatumKurz', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('benennt die letzten drei Tage im Klartext', () => {
    vi.setSystemTime(new Date(2026, 8, 7, 12, 0, 0));
    expect(formatDatumKurz('2026-09-07')).toBe('Heute');
    expect(formatDatumKurz('2026-09-06')).toBe('Gestern');
    expect(formatDatumKurz('2026-09-05')).toBe('Vorgestern');
    expect(formatDatumKurz('2026-09-04')).toMatch(/^Fr/);
  });

  it('verträgt ein leeres Datum', () => {
    expect(formatDatumKurz('')).toBe('–');
  });
});
