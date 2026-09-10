import { describe, expect, it } from 'vitest';
import {
  BELEGTEXTE_DEFAULT,
  alsNachschlage,
  belegtext,
  fuelleBelegtext,
  leseBelegtexte,
} from '../platzbauerBelegtexte';

describe('leseBelegtexte', () => {
  it('liefert ohne gepflegte Texte die Vorlage', () => {
    expect(leseBelegtexte(undefined)).toEqual(BELEGTEXTE_DEFAULT);
    expect(leseBelegtexte('')).toEqual(BELEGTEXTE_DEFAULT);
  });

  it('übernimmt gepflegte Texte und behält die übrigen aus der Vorlage', () => {
    const texte = leseBelegtexte(
      JSON.stringify([{ schluessel: 'anrede', text: 'Guten Tag,' }])
    );
    expect(alsNachschlage(texte).anrede).toBe('Guten Tag,');
    expect(alsNachschlage(texte).grussformel).toBe(
      alsNachschlage(BELEGTEXTE_DEFAULT).grussformel
    );
  });

  it('ignoriert leere Texte und unlesbares JSON, statt den Beleg zu leeren', () => {
    expect(alsNachschlage(leseBelegtexte(JSON.stringify([{ schluessel: 'anrede', text: '  ' }]))).anrede)
      .toBe(alsNachschlage(BELEGTEXTE_DEFAULT).anrede);
    expect(leseBelegtexte('{kaputt')).toEqual(BELEGTEXTE_DEFAULT);
    expect(leseBelegtexte('"kein array"')).toEqual(BELEGTEXTE_DEFAULT);
  });

  it('nimmt keine unbekannten Schlüssel auf', () => {
    const texte = leseBelegtexte(JSON.stringify([{ schluessel: 'erfunden', text: 'x' }]));
    expect(texte.map((t) => t.schluessel)).toEqual(BELEGTEXTE_DEFAULT.map((t) => t.schluessel));
  });
});

describe('Platzhalter', () => {
  it('ersetzt bekannte Platzhalter', () => {
    expect(fuelleBelegtext('Saison {saison} für {platzbauer}', { saison: 2027, platzbauer: 'Averbeck' }))
      .toBe('Saison 2027 für Averbeck');
  });

  it('lässt unbekannte und unbelegte Platzhalter stehen, damit sie auffallen', () => {
    expect(fuelleBelegtext('{unbekannt} {saison}', {})).toBe('{unbekannt} {saison}');
  });

  it('füllt {frachtrechner} in der Lieferbedingungen-Vorbelegung', () => {
    const texte = alsNachschlage(leseBelegtexte(undefined));
    const text = belegtext(texte, 'lieferbedingungen', { frachtrechner: 'Rechner: https://x/frachtrechner' });
    expect(text).toBe('Frei Baustelle, abgeladen\n\nRechner: https://x/frachtrechner');
  });

  it('die Bemerkung hat eine leere Vorlage und übernimmt einen gepflegten Text', () => {
    expect(alsNachschlage(leseBelegtexte(undefined)).bemerkung).toBe('');
    const texte = alsNachschlage(
      leseBelegtexte(JSON.stringify([{ schluessel: 'bemerkung', text: 'Preise gelten für Saison {saison}.' }]))
    );
    expect(belegtext(texte, 'bemerkung', { saison: 2027 })).toBe('Preise gelten für Saison 2027.');
  });

  it('belegtext() holt und füllt in einem Schritt', () => {
    const texte = alsNachschlage(
      leseBelegtexte(JSON.stringify([{ schluessel: 'anrede', text: 'Hallo {platzbauer},' }]))
    );
    expect(belegtext(texte, 'anrede', { platzbauer: 'PTS' })).toBe('Hallo PTS,');
  });
});
