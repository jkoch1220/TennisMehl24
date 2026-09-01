import { describe, it, expect } from 'vitest';
import {
  parseMosaikZahlungsart,
  formatiereZahlungsziel,
  zahlungszielOptionen,
  STANDARD_NETTOZIEL_TAGE,
} from '../zahlungskonditionen';

/**
 * Die Testfälle sind keine erfundenen Beispiele: es sind alle 25 Schreibweisen,
 * die im Mosaik-Export (migration/data/kunden.json, 2187 Kunden) tatsächlich
 * vorkommen — mit ihrer Häufigkeit als Kommentar. Wenn hier etwas durchfällt,
 * betrifft es echte Kunden.
 */
describe('parseMosaikZahlungsart', () => {
  it('liest Nettoziele', () => {
    expect(parseMosaikZahlungsart('NETTO14')).toMatchObject({ tage: 14 }); // 580x
    expect(parseMosaikZahlungsart('NETTO30')).toMatchObject({ tage: 30 }); // 4x
    expect(parseMosaikZahlungsart('NETTO7')).toMatchObject({ tage: 7 }); // 2x
    expect(parseMosaikZahlungsart('netto14')).toMatchObject({ tage: 14 }); // 1x, klein
  });

  it('liest Tage-Schreibweisen inklusive Leerzeichen-Variante', () => {
    expect(parseMosaikZahlungsart('TAGE10')).toMatchObject({ tage: 10 }); // 76x
    expect(parseMosaikZahlungsart('TAGE20')).toMatchObject({ tage: 20 }); // 9x
    expect(parseMosaikZahlungsart('WERKTAGE10')).toMatchObject({ tage: 10 }); // 1x
    expect(parseMosaikZahlungsart('30 Tage')).toMatchObject({ tage: 30 }); // 18x
  });

  it('zerlegt Skonto-Kürzel in Prozent und Frist', () => {
    // 521x — die zweithäufigste Kondition überhaupt: 2 % bei 9 Tagen.
    expect(parseMosaikZahlungsart('SKTO209')).toMatchObject({
      skontoProzent: 2,
      skontoTage: 9,
      tage: STANDARD_NETTOZIEL_TAGE,
    });
    expect(parseMosaikZahlungsart('SKTO210')).toMatchObject({ skontoProzent: 2, skontoTage: 10 }); // 11x
    expect(parseMosaikZahlungsart('SKTO309')).toMatchObject({ skontoProzent: 3, skontoTage: 9 }); // 5x
    expect(parseMosaikZahlungsart('SKTO208')).toMatchObject({ skontoProzent: 2, skontoTage: 8 }); // 2x
    expect(parseMosaikZahlungsart('SKTO310')).toMatchObject({ skontoProzent: 3, skontoTage: 10 }); // 2x
    expect(parseMosaikZahlungsart('SKTO410')).toMatchObject({ skontoProzent: 4, skontoTage: 10 }); // 1x
    expect(parseMosaikZahlungsart('SKTO314')).toMatchObject({ skontoProzent: 3, skontoTage: 14 }); // 1x
    expect(parseMosaikZahlungsart('skto209')).toMatchObject({ skontoProzent: 2, skontoTage: 9 }); // 3x
  });

  it('lässt die Skontofrist offen, wenn das Kürzel keine nennt', () => {
    const k = parseMosaikZahlungsart('SKONTO2'); // 1x
    expect(k).toMatchObject({ skontoProzent: 2, tage: STANDARD_NETTOZIEL_TAGE });
    expect(k?.skontoTage).toBeUndefined();
  });

  it('behandelt Sofort und Bar als null Tage', () => {
    expect(parseMosaikZahlungsart('Sofort')).toMatchObject({ tage: 0 }); // 29x
    expect(parseMosaikZahlungsart('SOFORT')).toMatchObject({ tage: 0 }); // 11x
    expect(parseMosaikZahlungsart('SOFORTVOB')).toMatchObject({ tage: 0 }); // 3x
    expect(parseMosaikZahlungsart('BAR')).toMatchObject({ tage: 0 }); // 2x
  });

  it('markiert Vorkasse gesondert, damit keine Forderung fällig gestellt wird', () => {
    for (const wert of ['VORKASSE2', 'Vorkasse', 'Vorkasse2', 'vorkasse2']) {
      expect(parseMosaikZahlungsart(wert)).toMatchObject({ vorkasse: true, tage: 0 });
    }
  });

  it('gibt null zurück, wenn nichts gepflegt ist — kein stiller Standard', () => {
    expect(parseMosaikZahlungsart(null)).toBeNull();
    expect(parseMosaikZahlungsart(undefined)).toBeNull();
    expect(parseMosaikZahlungsart('')).toBeNull();
    expect(parseMosaikZahlungsart('   ')).toBeNull();
  });

  it('verwirft Unsinn statt ihn zu raten', () => {
    expect(parseMosaikZahlungsart('IRGENDWAS')).toBeNull();
    // Kundennummer im falschen Feld: kein Zahlungsziel von 9245 Tagen erfinden.
    expect(parseMosaikZahlungsart('9245')).toBeNull();
  });
});

describe('formatiereZahlungsziel', () => {
  it('trifft die Schreibweise der Dokumentfelder', () => {
    expect(formatiereZahlungsziel(14)).toBe('14 Tage');
    expect(formatiereZahlungsziel(30)).toBe('30 Tage');
  });

  it('macht aus 0 Tagen "Sofort", nicht "Vorkasse"', () => {
    expect(formatiereZahlungsziel(0)).toBe('Sofort');
    expect(formatiereZahlungsziel(-5)).toBe('Sofort');
  });

  it('gibt undefined zurück, wenn nichts hinterlegt ist', () => {
    expect(formatiereZahlungsziel(undefined)).toBeUndefined();
    expect(formatiereZahlungsziel(null)).toBeUndefined();
    expect(formatiereZahlungsziel(NaN)).toBeUndefined();
  });

  it('liefert Werte, die parseZahlungszielTage wieder korrekt liest', () => {
    // Gegenprobe zur Regel in projektabwicklungDokumentService.ts:110 —
    // dort wird die erste Zahl aus dem String gezogen.
    for (const tage of [7, 10, 14, 20, 30, 60]) {
      const text = formatiereZahlungsziel(tage)!;
      expect(Number(text.match(/(\d+)/)![1])).toBe(tage);
    }
    expect(formatiereZahlungsziel(0)!.toLowerCase()).toBe('sofort');
  });
});

describe('zahlungszielOptionen', () => {
  it('enthält die Mosaik-Ziele 10 und 20 Tage', () => {
    const o = zahlungszielOptionen();
    expect(o).toContain('10 Tage');
    expect(o).toContain('20 Tage');
  });

  it('ergänzt einen abweichenden Bestandswert, damit er nicht verlorengeht', () => {
    expect(zahlungszielOptionen('45 Tage')).toContain('45 Tage');
  });

  it('dupliziert bekannte Werte nicht', () => {
    const o = zahlungszielOptionen('14 Tage');
    expect(o.filter((x) => x === '14 Tage')).toHaveLength(1);
  });
});
