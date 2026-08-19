import { describe, it, expect } from 'vitest';
import {
  getBasisPreisConfig,
  getEntfernungsStufe,
  getZuschlagProStufe,
  berechneZuschlagProTonne,
  berechneGesamtZuschlag,
  erstelleDieselZuschlagPosition,
  getDieselKlauselText,
  istStandardDieselKlauselText,
  formatEntfernungsStaffel,
  ENTFERNUNGS_STAFFEL_2027,
  DIESEL_ZUSCHLAG_ARTIKELNUMMER,
} from '../dieselZuschlag';
import { DEFAULT_AGB_ABSCHNITTE } from '../../constants/vertragsklauseln';
import { Position } from '../../types/projektabwicklung';

/**
 * Der Dieselzuschlag landet unmittelbar auf Kundenrechnungen. Geprüft wird deshalb vor allem
 * das, was still falsch werden kann: die Stufengrenzen, das Verhalten ohne Entfernung und
 * die Deckungsgleichheit von Berechnung und AGB-Text.
 */

const tonnen = (menge: number, artikelnummer = 'TM-ZM-02'): Position => ({
  id: `p-${artikelnummer}-${menge}`,
  artikelnummer,
  bezeichnung: 'Ziegelmehl',
  menge,
  einheit: 't',
  einzelpreis: 100,
  gesamtpreis: menge * 100,
});

// Leistungsdaten in den jeweiligen Staffeljahren
const IN_2026 = '2026-06-15';
const IN_2027 = '2027-06-15';

describe('Staffelauswahl nach Leistungsdatum', () => {
  it('nutzt bis 31.12.2026 die Pauschale ohne Entfernungsstaffel', () => {
    const config = getBasisPreisConfig('2026-12-31');
    expect(config.basisPreis).toBe(1.749);
    expect(config.zuschlagProStufe).toBe(0.45);
    expect(config.entfernungsStaffel).toBeUndefined();
  });

  it('schaltet am 01.01.2027 auf die Entfernungsstaffel um', () => {
    const config = getBasisPreisConfig('2027-01-01');
    expect(config.entfernungsStaffel).toBe(ENTFERNUNGS_STAFFEL_2027);
  });

  it('fällt nach der letzten definierten Staffel nicht auf die alte Pauschale zurück', () => {
    // Vergisst jemand die Staffel für 2028, darf daraus kein stiller Preisrückfall werden
    const config = getBasisPreisConfig('2030-05-01');
    expect(config.entfernungsStaffel).toBeDefined();
  });
});

describe('Entfernungsstufen — Grenzen', () => {
  const config = getBasisPreisConfig(IN_2027);

  it.each([
    [0, 0.45],
    [49.9, 0.45],
    [50, 0.45],      // Obergrenze gehört noch zur unteren Stufe
    [50.1, 0.65],
    [75, 0.65],
    [75.1, 0.85],
    [100, 0.85],
    [125, 1.05],
    [150, 1.25],
    [150.1, 1.45],
    [400, 1.45],     // offene Stufe, gedeckelt
  ])('%s km → %s €/t je Preisstufe', (km, erwartet) => {
    expect(getZuschlagProStufe(config, km)).toBe(erwartet);
  });

  it('nimmt ohne Entfernung die günstigste Stufe', () => {
    expect(getZuschlagProStufe(config, undefined)).toBe(0.45);
  });

  it('behandelt unsinnige Werte wie eine fehlende Angabe', () => {
    expect(getZuschlagProStufe(config, -5)).toBe(0.45);
    expect(getZuschlagProStufe(config, NaN)).toBe(0.45);
  });

  it('liefert für Konfigurationen ohne Staffel keine Stufe', () => {
    expect(getEntfernungsStufe(getBasisPreisConfig(IN_2026), 200)).toBeNull();
  });
});

describe('Zuschlag pro Tonne', () => {
  it('bleibt bis einschließlich Basispreis bei null', () => {
    const config = getBasisPreisConfig(IN_2027);
    expect(berechneZuschlagProTonne(1.749, config, 200)).toBe(0);
    expect(berechneZuschlagProTonne(1.70, config, 200)).toBe(0);
  });

  it('rechnet 2026 unabhängig von der Entfernung', () => {
    const config = getBasisPreisConfig(IN_2026);
    // 1,899 - 1,749 = 0,15 → 3 Stufen × 0,45
    expect(berechneZuschlagProTonne(1.899, config, 20)).toBeCloseTo(1.35, 3);
    expect(berechneZuschlagProTonne(1.899, config, 300)).toBeCloseTo(1.35, 3);
  });

  it('rechnet 2027 entfernungsabhängig', () => {
    const config = getBasisPreisConfig(IN_2027);
    expect(berechneZuschlagProTonne(1.899, config, 20)).toBeCloseTo(1.35, 3);   // 3 × 0,45
    expect(berechneZuschlagProTonne(1.899, config, 80)).toBeCloseTo(2.55, 3);   // 3 × 0,85
    expect(berechneZuschlagProTonne(1.899, config, 200)).toBeCloseTo(4.35, 3);  // 3 × 1,45
  });

  it('schneidet angefangene Stufen ab', () => {
    const config = getBasisPreisConfig(IN_2027);
    // 0,049 € über Basis = noch keine volle Stufe
    expect(berechneZuschlagProTonne(1.798, config, 60)).toBe(0);
  });
});

describe('Gesamtzuschlag', () => {
  it('meldet die angewandte Stufe im Ergebnis', () => {
    const ergebnis = berechneGesamtZuschlag([tonnen(10)], 1.899, IN_2027, 80);
    expect(ergebnis.entfernungKm).toBe(80);
    expect(ergebnis.zuschlagProStufe).toBe(0.85);
    expect(ergebnis.staffelBezeichnung).toBe('über 75 bis 100 km');
    expect(ergebnis.entfernungUnbekannt).toBe(false);
    expect(ergebnis.gesamtZuschlag).toBeCloseTo(25.5, 2); // 10 t × 2,55
  });

  it('markiert eine fehlende Entfernung, statt sie zu verschweigen', () => {
    const ergebnis = berechneGesamtZuschlag([tonnen(10)], 1.899, IN_2027);
    expect(ergebnis.entfernungUnbekannt).toBe(true);
    expect(ergebnis.entfernungKm).toBeUndefined();
    expect(ergebnis.zuschlagProStufe).toBe(0.45);
  });

  it('setzt entfernungUnbekannt nicht, solange keine Staffel gilt', () => {
    const ergebnis = berechneGesamtZuschlag([tonnen(10)], 1.899, IN_2026);
    expect(ergebnis.entfernungUnbekannt).toBe(false);
    expect(ergebnis.staffelBezeichnung).toBe('');
  });

  it('zählt eine bestehende Zuschlagsposition nicht als Tonnage mit', () => {
    const vorhandene: Position = {
      id: 'x',
      artikelnummer: DIESEL_ZUSCHLAG_ARTIKELNUMMER,
      bezeichnung: 'Dieselpreiszuschlag',
      menge: 1,
      einheit: 'psch',
      einzelpreis: 99,
      gesamtpreis: 99,
    };
    const ergebnis = berechneGesamtZuschlag([tonnen(10), vorhandene], 1.899, IN_2027, 80);
    expect(ergebnis.gesamtTonnen).toBe(10);
  });
});

describe('Rechnungsposition', () => {
  it('weist Entfernung und Staffel für den Kunden nachvollziehbar aus', () => {
    const ergebnis = berechneGesamtZuschlag([tonnen(10)], 1.899, IN_2027, 62);
    const position = erstelleDieselZuschlagPosition(ergebnis);
    expect(position.artikelnummer).toBe(DIESEL_ZUSCHLAG_ARTIKELNUMMER);
    expect(position.beschreibung).toContain('62 km');
    expect(position.beschreibung).toContain('über 50 bis 75 km');
    expect(position.beschreibung).toContain('0,65 €/t je Stufe');
  });

  it('macht eine fehlende Entfernung im Belegtext sichtbar', () => {
    const ergebnis = berechneGesamtZuschlag([tonnen(10)], 1.899, IN_2027);
    const position = erstelleDieselZuschlagPosition(ergebnis);
    expect(position.beschreibung).toContain('Entfernung nicht hinterlegt');
  });

  it('nennt bis 2026 keine Entfernung', () => {
    const ergebnis = berechneGesamtZuschlag([tonnen(10)], 1.899, IN_2026, 200);
    const position = erstelleDieselZuschlagPosition(ergebnis);
    expect(position.beschreibung).not.toContain('km');
  });
});

describe('Klauseltext', () => {
  it('nennt 2026 den Pauschalbetrag', () => {
    const text = getDieselKlauselText(IN_2026);
    expect(text).toContain('0,45 € je Tonne');
    expect(text).not.toContain('gestaffelt');
  });

  it('nennt ab 2027 alle Stufen', () => {
    const text = getDieselKlauselText(IN_2027);
    expect(text).toContain('gestaffelt nach der Entfernung');
    for (const stufe of ENTFERNUNGS_STAFFEL_2027) {
      expect(text).toContain(`${stufe.zuschlagProStufe.toFixed(2).replace('.', ',')} € je Tonne`);
    }
  });

  it('erkennt unveränderte Vorlagen, damit Handschriftliches nicht überschrieben wird', () => {
    expect(istStandardDieselKlauselText(getDieselKlauselText(IN_2026))).toBe(true);
    expect(istStandardDieselKlauselText(getDieselKlauselText(IN_2027))).toBe(true);
    expect(istStandardDieselKlauselText('')).toBe(true);
    expect(
      istStandardDieselKlauselText(
        'Die angebotenen Preise beinhalten einen Dieselpreis von bis zu 1,749 €. ' +
          'Bei Steigerungen je 0,05 € über unserem kalkulierten Basis-Dieselpreis erhöht sich der Preis ' +
          'des gelieferten Ziegelmehls um 0,45 € je Tonne.'
      )
    ).toBe(true);
    expect(istStandardDieselKlauselText('Sondervereinbarung: kein Dieselzuschlag.')).toBe(false);
  });
});

describe('AGB und Berechnung dürfen nicht auseinanderlaufen', () => {
  it('führt der AGB-Absatz für 2027 exakt die berechneten Sätze', () => {
    const paragraph4 = DEFAULT_AGB_ABSCHNITTE.find((a) => a.titel.startsWith('§ 4'));
    expect(paragraph4).toBeDefined();

    const absatz2027 = paragraph4!.absaetze.find((a) => a.includes('ab 01.01.2027'));
    expect(absatz2027).toBeDefined();

    // Jede Stufe muss wortgleich zur Staffel im Code stehen
    expect(absatz2027).toContain(formatEntfernungsStaffel(ENTFERNUNGS_STAFFEL_2027));

    // Und der Basispreis muss zur Konfiguration passen
    const config = getBasisPreisConfig(IN_2027);
    expect(absatz2027).toContain(config.basisPreis.toFixed(3).replace('.', ','));
  });
});
