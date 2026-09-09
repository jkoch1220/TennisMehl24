import { describe, it, expect } from 'vitest';
import { LIEFERUNG } from '../../constants/artikelPreise';
import {
  SCHUETTSTELLE_ARTIKEL,
  SCHUETTSTELLE_BESCHREIBUNG,
  berechneSchuettstellenAufpreis,
} from '../schuettstellen';
import { DEFAULT_AGB_ABSCHNITTE, DEFAULT_KLAUSEL_VORLAGEN } from '../../constants/vertragsklauseln';

/**
 * Vorschlag 1 („Anfragentool: Frachtkostenberechnung — Be- und Entladen in Summe
 * mehr als 60 min").
 *
 * Entscheidungen Julian (09.09.2026):
 *  - Stundensatz einheitlich 105 € (vorher 108 € im Anfragetool und in der
 *    Klausel, 105 € im Angebot-Tab und im Massenangebot).
 *  - Dem Kunden werden 25 Minuten fürs Abkippen freigestellt (vorher 20).
 *  - Mehrere Schüttstellen werden über das Produkt TM-STS (15,90 €/Stück)
 *    abgerechnet, nicht über die Standzeit-Klausel: Der LKW fährt auf dem Platz
 *    nur ein Stück weiter. Die Position steht sichtbar im Angebot, statt im
 *    Preis pro Tonne zu verschwinden.
 */
describe('Stundensatz und Freigrenze', () => {
  it('kennt genau einen Stundensatz — 105 €', () => {
    expect(LIEFERUNG.FREMDLIEFERUNG_STUNDENSATZ).toBe(105);
  });

  it('stellt 25 Minuten frei', () => {
    expect(LIEFERUNG.FREIE_ABLADEZEIT_MINUTEN).toBe(25);
  });

  it('nennt beide Werte im Klauseltext', () => {
    const klausel = DEFAULT_KLAUSEL_VORLAGEN.find((k) => k.id === 'erschwerte-zufahrt');
    expect(klausel).toBeDefined();
    expect(klausel!.text).toContain('25 Minuten');
    expect(klausel!.text).toContain('105,00 €');
    expect(klausel!.text).not.toContain('108,00 €');
    expect(klausel!.text).not.toContain('20 Minuten');
  });

  it('verweist in der Klausel auf die Schüttstellen-Pauschale', () => {
    // Sonst läse sich „auch bei mehreren Schüttstellen" so, als sei der Wunsch
    // von der Freigrenze abgedeckt — er wird aber gesondert berechnet.
    const klausel = DEFAULT_KLAUSEL_VORLAGEN.find((k) => k.id === 'erschwerte-zufahrt')!;
    expect(klausel.text).toContain('je zusätzlicher Schüttstelle');
    expect(klausel.text).toContain('im Angebot gesondert ausgewiesen');
  });

  it('lässt die AGB auf dem veröffentlichten Stand (20 Minuten)', () => {
    // Der AGB-Anhang muss der Fassung auf tennismehl.com entsprechen — sonst
    // hängt an jedem Angebot eine AGB, die es öffentlich nicht gibt.
    // Dass die Klausel 25 Minuten freistellt, ist kein Widerspruch: Die
    // Individualvereinbarung geht den AGB vor und darf günstiger sein.
    const agbText = DEFAULT_AGB_ABSCHNITTE.flatMap((a) => a.absaetze).join(' ');
    expect(agbText).toContain('Wartezeit von mehr als 20 Minuten');
  });
});

describe('Abrechnung zusätzlicher Schüttstellen', () => {
  // Die echte Funktion, die auch erstelleAnfragePositionen aufruft — kein Nachbau.
  const PREIS = 15.9;

  it('berechnet je zusätzlicher Stelle 15,90 €', () => {
    expect(berechneSchuettstellenAufpreis(1, 24)).toEqual({ menge: 1, einzelpreis: 15.9, gesamtpreis: 15.9 });
    expect(berechneSchuettstellenAufpreis(2, 24)).toEqual({ menge: 2, einzelpreis: 15.9, gesamtpreis: 31.8 });
    expect(berechneSchuettstellenAufpreis(3, 24)?.gesamtpreis).toBe(47.7);
  });

  it('legt bei einer einzigen Schüttstelle keine Position an', () => {
    // Die erste Stelle ist im Preis enthalten — sonst zahlte jeder Kunde 15,90 € extra.
    expect(berechneSchuettstellenAufpreis(0, 24)).toBeNull();
    expect(berechneSchuettstellenAufpreis(undefined, 24)).toBeNull();
  });

  it('greift nicht bei reiner Sackware', () => {
    // Sackware und BigBag werden abgesetzt, nicht geschüttet.
    expect(berechneSchuettstellenAufpreis(2, 0)).toBeNull();
  });

  it('ignoriert unsinnige Eingaben', () => {
    expect(berechneSchuettstellenAufpreis(-1, 24)).toBeNull();
    expect(berechneSchuettstellenAufpreis(0.4, 24)).toBeNull();
    expect(berechneSchuettstellenAufpreis(2.7, 24)?.menge).toBe(2);
  });

  it('nimmt den Preis aus dem Artikelstamm, wenn einer übergeben wird', () => {
    expect(berechneSchuettstellenAufpreis(2, 24, 19.9)?.gesamtpreis).toBe(39.8);
  });

  it('rundet auf Cent', () => {
    expect(berechneSchuettstellenAufpreis(3, 24, 15.93)?.gesamtpreis).toBe(47.79);
  });

  it('bleibt deutlich unter dem Stundensatz — der LKW fährt nur ein Stück weiter', () => {
    // 15,90 € entsprechen bei 105 €/h gut 9 Minuten. Wäre eine zusätzliche
    // Stelle eine zweite Anfahrt, müsste der Preis das Vielfache betragen.
    const minuten = (PREIS / LIEFERUNG.FREMDLIEFERUNG_STUNDENSATZ) * 60;
    expect(minuten).toBeGreaterThan(8);
    expect(minuten).toBeLessThan(11);
  });

  it('beschreibt die Position ohne feste Stellenzahl', () => {
    // Sonst widerspräche ein eingefrorener Text („an 3 Stellen") einer später
    // im Angebot korrigierten Menge — bis in die Rechnung hinein.
    expect(SCHUETTSTELLE_BESCHREIBUNG).not.toMatch(/\d/);
    expect(SCHUETTSTELLE_ARTIKEL).toBe('TM-STS');
  });
});
