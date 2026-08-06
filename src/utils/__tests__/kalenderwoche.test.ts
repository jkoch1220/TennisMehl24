import { describe, it, expect } from 'vitest';
import {
  formatISODatum,
  parseISODatum,
  getISOWoche,
  getISOWochenJahr,
  getMontag,
  getMontagDerKW,
  getAnzahlKWImJahr,
  getWochentage,
  verschiebeKW,
  istInKW,
  getKWZeitraum,
  formatKWMitZeitraum,
} from '../kalenderwoche';

describe('formatISODatum', () => {
  it('formatiert lokal und verschiebt nicht in die Vergangenheit', () => {
    // Regression: toISOString() hätte hier den Vortag geliefert, weil lokale
    // Mitternacht in Europe/Berlin dem UTC-Vorabend entspricht.
    expect(formatISODatum(new Date(2026, 7, 3))).toBe('2026-08-03');
    expect(formatISODatum(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('füllt Monat und Tag auf zwei Stellen auf', () => {
    expect(formatISODatum(new Date(2026, 2, 9))).toBe('2026-03-09');
  });
});

describe('parseISODatum', () => {
  it('liest als lokale Mitternacht, nicht als UTC', () => {
    const d = parseISODatum('2026-03-16');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(0);
  });

  it('ist die Umkehrung von formatISODatum', () => {
    for (const s of ['2026-01-01', '2026-06-30', '2026-12-31']) {
      expect(formatISODatum(parseISODatum(s))).toBe(s);
    }
  });
});

describe('getISOWoche', () => {
  it('rechnet die Saisonwochen 2026 korrekt', () => {
    expect(getISOWoche(new Date(2026, 2, 16))).toBe(12); // Mo 16.03.2026
    expect(getISOWoche(new Date(2026, 2, 21))).toBe(12); // Sa 21.03.2026
    expect(getISOWoche(new Date(2026, 2, 22))).toBe(12); // So 22.03.2026 — noch KW 12
    expect(getISOWoche(new Date(2026, 2, 23))).toBe(13); // Mo 23.03.2026
  });

  it('behandelt Jahresränder nach ISO, nicht naiv', () => {
    // Der naive Ansatz (Tag des Jahres / 7) liefert hier 53 statt 1.
    expect(getISOWoche(new Date(2025, 11, 29))).toBe(1);
    expect(getISOWoche(new Date(2026, 0, 1))).toBe(1);
    // 2026 ist ein Jahr mit 53 Kalenderwochen.
    expect(getISOWoche(new Date(2026, 11, 31))).toBe(53);
    expect(getISOWoche(new Date(2027, 0, 1))).toBe(53);
  });

  it('liefert für den 4. Januar immer KW 1', () => {
    for (let jahr = 2020; jahr <= 2035; jahr++) {
      expect(getISOWoche(new Date(jahr, 0, 4))).toBe(1);
    }
  });
});

describe('getISOWochenJahr', () => {
  it('weicht am Jahresrand vom Kalenderjahr ab', () => {
    expect(getISOWochenJahr(new Date(2025, 11, 29))).toBe(2026);
    expect(getISOWochenJahr(new Date(2027, 0, 1))).toBe(2026);
  });

  it('entspricht sonst dem Kalenderjahr', () => {
    expect(getISOWochenJahr(new Date(2026, 5, 15))).toBe(2026);
  });
});

describe('getMontag', () => {
  it('liefert den Montag der laufenden Woche', () => {
    expect(formatISODatum(getMontag(new Date(2026, 7, 6)))).toBe('2026-08-03'); // Do -> Mo
    expect(formatISODatum(getMontag(new Date(2026, 7, 3)))).toBe('2026-08-03'); // Mo -> Mo
  });

  it('ordnet den Sonntag der ablaufenden Woche zu', () => {
    expect(formatISODatum(getMontag(new Date(2026, 7, 9)))).toBe('2026-08-03');
  });

  it('rechnet über Monats- und Jahresgrenzen', () => {
    expect(formatISODatum(getMontag(new Date(2026, 0, 1)))).toBe('2025-12-29');
  });
});

describe('getMontagDerKW', () => {
  it('trifft die Saisonwochen', () => {
    expect(formatISODatum(getMontagDerKW(12, 2026))).toBe('2026-03-16');
    expect(formatISODatum(getMontagDerKW(9, 2026))).toBe('2026-02-23');
  });

  it('ist die Umkehrung von getISOWoche', () => {
    for (let kw = 1; kw <= getAnzahlKWImJahr(2026); kw++) {
      const montag = getMontagDerKW(kw, 2026);
      expect(getISOWoche(montag)).toBe(kw);
      expect(getISOWochenJahr(montag)).toBe(2026);
    }
  });

  it('reicht bei KW 1 gegebenenfalls ins Vorjahr', () => {
    expect(formatISODatum(getMontagDerKW(1, 2026))).toBe('2025-12-29');
  });
});

describe('getAnzahlKWImJahr', () => {
  it('erkennt Jahre mit 53 Wochen', () => {
    expect(getAnzahlKWImJahr(2026)).toBe(53);
    expect(getAnzahlKWImJahr(2020)).toBe(53);
  });

  it('erkennt Jahre mit 52 Wochen', () => {
    expect(getAnzahlKWImJahr(2025)).toBe(52);
    expect(getAnzahlKWImJahr(2027)).toBe(52);
  });
});

describe('getWochentage', () => {
  it('liefert standardmäßig sieben aufeinanderfolgende Tage', () => {
    const tage = getWochentage(getMontagDerKW(12, 2026));
    expect(tage).toHaveLength(7);
    expect(formatISODatum(tage[0])).toBe('2026-03-16');
    expect(formatISODatum(tage[6])).toBe('2026-03-22');
  });

  it('liefert für die Dispo Montag bis Samstag', () => {
    const tage = getWochentage(getMontagDerKW(12, 2026), 6);
    expect(tage).toHaveLength(6);
    expect(formatISODatum(tage[5])).toBe('2026-03-21');
  });

  it('rechnet über den Monatswechsel', () => {
    const tage = getWochentage(getMontagDerKW(14, 2026));
    expect(formatISODatum(tage[0])).toBe('2026-03-30');
    expect(formatISODatum(tage[6])).toBe('2026-04-05');
  });
});

describe('verschiebeKW', () => {
  it('geht vorwärts und rückwärts', () => {
    expect(verschiebeKW(12, 2026, 1)).toEqual({ kw: 13, jahr: 2026 });
    expect(verschiebeKW(12, 2026, -1)).toEqual({ kw: 11, jahr: 2026 });
  });

  it('rollt über die Jahresgrenze', () => {
    expect(verschiebeKW(53, 2026, 1)).toEqual({ kw: 1, jahr: 2027 });
    expect(verschiebeKW(1, 2026, -1)).toEqual({ kw: 52, jahr: 2025 });
  });
});

describe('istInKW', () => {
  it('erkennt Daten der Woche', () => {
    expect(istInKW('2026-03-16', 12)).toBe(true);
    expect(istInKW('2026-03-21', 12)).toBe(true);
    expect(istInKW('2026-03-23', 12)).toBe(false);
  });

  it('toleriert ISO-Zeitstempel', () => {
    expect(istInKW('2026-03-16T09:30:00.000Z', 12)).toBe(true);
  });

  it('ist ohne Jahr über Jahresgrenzen mehrdeutig, mit Jahr eindeutig', () => {
    expect(istInKW('2025-12-29', 1)).toBe(true);
    expect(istInKW('2025-12-29', 1, 2026)).toBe(true);
    expect(istInKW('2025-12-29', 1, 2025)).toBe(false);
  });

  it('liefert für leere und ungültige Werte false', () => {
    expect(istInKW(undefined, 12)).toBe(false);
    expect(istInKW('', 12)).toBe(false);
    expect(istInKW('keindatum', 12)).toBe(false);
  });
});

describe('getKWZeitraum', () => {
  it('liefert Montag bis Sonntag', () => {
    expect(getKWZeitraum(12, 2026)).toEqual({ von: '2026-03-16', bis: '2026-03-22' });
  });

  it('liefert auf Wunsch Montag bis Samstag', () => {
    expect(getKWZeitraum(12, 2026, 6)).toEqual({ von: '2026-03-16', bis: '2026-03-21' });
  });

  it('bildet den Zeitraum über den Jahreswechsel korrekt ab', () => {
    expect(getKWZeitraum(1, 2026)).toEqual({ von: '2025-12-29', bis: '2026-01-04' });
  });
});

describe('formatKWMitZeitraum', () => {
  it('formatiert für die Kopfzeile', () => {
    expect(formatKWMitZeitraum(12, 2026)).toBe('KW 12 · 16.03.–21.03.2026');
  });
});
