/**
 * Der Hinweistext ist Vertragstext. Diese Tests halten die Aussagen fest, auf
 * die sich Vertrieb und Buchhaltung verlassen — vor allem die drei, die im
 * September 2026 vom gelebten Ablauf abwichen: Geltung außerhalb der
 * Hauptsaison, Gutschrift zum Monatsende und Auszahlung per Überweisung.
 */
import { describe, expect, it } from 'vitest';
import { erzeugeStaffelHinweistext } from '../staffelpreisText';
import type { StaffelKonditionen } from '../../types/platzbauer';

const artikel = [
  {
    artikelnummer: 'TM-ZM-02',
    bezeichnung: 'Tennismehl 0/2 mm lose',
    staffeln: [
      { vonMenge: 0, bisMenge: 150, einzelpreis: 118.5 },
      { vonMenge: 150, bisMenge: 300, einzelpreis: 113.5 },
      { vonMenge: 300, bisMenge: null, einzelpreis: 108.5 },
    ],
  },
] as any;

const konditionen = (modell: StaffelKonditionen['abrechnungsmodell']): StaffelKonditionen => ({
  abrechnungsmodell: modell,
  mengenbasis: 'gesamt',
  zeitraumVon: '2027-01-01',
  zeitraumBis: '2027-04-30',
  gutschriftNurBeiZahlung: true,
});

describe('erzeugeStaffelHinweistext', () => {
  it('nennt den vereinbarten Abnahmezeitraum', () => {
    const text = erzeugeStaffelHinweistext(konditionen('sofortumstellung'), artikel);
    expect(text).toContain('01.01.2027');
    expect(text).toContain('30.04.2027');
  });

  it('erklärt die Grenzregel und die rückwirkende Geltung', () => {
    const text = erzeugeStaffelHinweistext(konditionen('sofortumstellung'), artikel);
    expect(text).toContain('rückwirkend für die gesamte');
    expect(text).toContain('Stufengrenze zählt bereits zur höheren Stufe');
  });

  it('stellt Lieferungen außerhalb der Hauptsaison unter die Staffel', () => {
    const text = erzeugeStaffelHinweistext(konditionen('sofortumstellung'), artikel);
    expect(text).toContain('außerhalb der Hauptsaison unterliegen ebenfalls der Preisstaffel');
    expect(text).toContain('zum Ende des Monats');
    // Der alte, gegenteilige Satz darf nicht zurückkommen.
    expect(text).not.toContain('nicht erfasst');
  });

  it('sagt beim Stufenpreis keine Gutschrift zu', () => {
    const text = erzeugeStaffelHinweistext(konditionen('stufenpreis'), artikel);
    expect(text).toContain('außerhalb der Hauptsaison unterliegen ebenfalls der Preisstaffel');
    expect(text).not.toContain('zum Ende des Monats');
    expect(text).toContain('Eine nachträgliche Gutschrift erfolgt nicht.');
  });

  it('kündigt die Gutschrift als Überweisung an, nicht als Verrechnung', () => {
    for (const modell of ['saisonbonus', 'sofortumstellung'] as const) {
      const text = erzeugeStaffelHinweistext(konditionen(modell), artikel);
      expect(text).toContain('wird überwiesen');
      expect(text).not.toContain('offenen Forderungen verrechnet');
    }
  });

  it('berechnet die Grenzlieferung schon zum neuen Preis (Sofortumstellung)', () => {
    const text = erzeugeStaffelHinweistext(konditionen('sofortumstellung'), artikel);
    expect(text).toContain('zum Preis der aktuellen Stufe, die mit der Bestellung erreicht ist');
    expect(text).toContain('bereits vollständig zum Preis der neuen Stufe');
  });

  it('macht die Gutschrift von bezahlten Rechnungen und Wiegeschein abhängig', () => {
    const text = erzeugeStaffelHinweistext(konditionen('sofortumstellung'), artikel);
    expect(text).toContain('laut Wiegeschein');
    expect(text).toContain('vollständig bezahlt sind');
    expect(text).toContain('netto zuzüglich der gesetzlichen Umsatzsteuer');
  });
});
