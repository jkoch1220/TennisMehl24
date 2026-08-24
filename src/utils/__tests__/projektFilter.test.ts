/**
 * Die Verknüpfungsregel ist der Kern dieser Filter:
 *
 *   Innerhalb einer Gruppe ODER.   „0/2 oder 0/3"
 *   Zwischen den Gruppen UND.      „Shop UND Universal"
 *
 * Wer das verwechselt, baut ein Board, das entweder immer alles zeigt oder nie
 * etwas. Diese Tests halten beide Richtungen fest.
 */
import { describe, it, expect } from 'vitest';
import {
  trifftFilter,
  wendeFilterAn,
  zaehleFuerWert,
  istFilterAktiv,
  anzahlAktiverFilter,
  filterZuUrlParams,
  filterAusUrlParams,
  LEERER_FILTER,
  ProjektFilter,
} from '../projektFilter';
import { Projekt } from '../../types/projekt';

const filter = (teil: Partial<ProjektFilter>): ProjektFilter => ({ ...LEERER_FILTER, ...teil });

const projekt = (teil: Partial<Projekt>): Projekt =>
  ({ id: 'p1', status: 'angebot', saisonjahr: 2026, kundenname: 'TC Musterstadt', ...teil } as Projekt);

const mitPositionen = (positionen: unknown[], teil: Partial<Projekt> = {}) =>
  projekt({ ...teil, auftragsbestaetigungsDaten: JSON.stringify({ positionen }) } as Partial<Projekt>);

const LOSE_02 = [{ artikelnummer: 'TM-ZM-02', menge: 20, einheit: 't' }];
const LOSE_03 = [{ artikelnummer: 'TM-ZM-03', menge: 15, einheit: 't' }];
const PALETTE_02 = [{ artikelnummer: 'TM-ZM-02St', menge: 2, einheit: 't' }];

describe('Verknüpfung', () => {
  it('verknüpft innerhalb einer Gruppe mit ODER', () => {
    // Julians Beispiel: „nur Schüttgut 0/2 oder 0/3".
    const f = filter({ koernung: ['02', '03'] });
    expect(trifftFilter(mitPositionen(LOSE_02), f)).toBe(true);
    expect(trifftFilter(mitPositionen(LOSE_03), f)).toBe(true);
  });

  it('verknüpft zwischen Gruppen mit UND', () => {
    // Julians Beispiel: „nur Onlineshop-Bestellung, nur Universal-Produkte".
    const f = filter({ kanal: ['shop'], produkt: ['universal'] });

    const shopMitUniversal = mitPositionen([{ istUniversalArtikel: true, bezeichnung: 'Netz' }], {
      herkunft: 'shop',
    });
    const shopOhneUniversal = mitPositionen(LOSE_02, { herkunft: 'shop' });
    const universalOhneShop = mitPositionen([{ istUniversalArtikel: true, bezeichnung: 'Netz' }]);

    expect(trifftFilter(shopMitUniversal, f)).toBe(true);
    expect(trifftFilter(shopOhneUniversal, f)).toBe(false);
    expect(trifftFilter(universalOhneShop, f)).toBe(false);
  });

  it('lässt eine leere Gruppe ALLES durch, nicht nichts', () => {
    // Sonst wäre ein frisch geöffnetes Board leer.
    expect(trifftFilter(projekt({}), LEERER_FILTER)).toBe(true);
    expect(wendeFilterAn([projekt({}), projekt({ id: 'p2' })], LEERER_FILTER)).toHaveLength(2);
  });
});

describe('Herkunft', () => {
  it('erkennt „direkt" als Abwesenheit der anderen Kanäle', () => {
    const f = filter({ kanal: ['direkt'] });
    expect(trifftFilter(projekt({}), f)).toBe(true);
    expect(trifftFilter(projekt({ herkunft: 'shop' }), f)).toBe(false);
    expect(trifftFilter(projekt({ istPlatzbauerprojekt: true }), f)).toBe(false);
  });

  it('sammelt mehrere Kanäle ein', () => {
    const f = filter({ kanal: ['shop', 'anfrage'] });
    expect(trifftFilter(projekt({ herkunft: 'shop' }), f)).toBe(true);
    expect(trifftFilter(projekt({ herkunft: 'anfrage' }), f)).toBe(true);
    expect(trifftFilter(projekt({ istPlatzbauerprojekt: true }), f)).toBe(false);
  });
});

describe('Körnung', () => {
  it('trennt 0/2 von 0/3', () => {
    expect(trifftFilter(mitPositionen(LOSE_02), filter({ koernung: ['02'] }))).toBe(true);
    expect(trifftFilter(mitPositionen(LOSE_02), filter({ koernung: ['03'] }))).toBe(false);
    expect(trifftFilter(mitPositionen(LOSE_03), filter({ koernung: ['03'] }))).toBe(true);
  });

  it('greift unabhängig von der Gebindeform', () => {
    // 0/2 gibt es lose, gesackt, auf Paletten und im BigBag — die Körnung ist
    // eine eigene Achse, keine Unterabteilung der Form.
    expect(trifftFilter(mitPositionen(PALETTE_02), filter({ koernung: ['02'] }))).toBe(true);
  });
});

describe('Gebindeform', () => {
  it('trennt Schüttgut von Sackware', () => {
    expect(trifftFilter(mitPositionen(LOSE_02), filter({ form: ['lose'] }))).toBe(true);
    expect(trifftFilter(mitPositionen(LOSE_02), filter({ form: ['sackware'] }))).toBe(false);
    expect(trifftFilter(mitPositionen(PALETTE_02), filter({ form: ['sackware'] }))).toBe(true);
  });

  it('führt einen gemischten Auftrag unter BEIDEN Formen', () => {
    const p = mitPositionen([...LOSE_02, ...PALETTE_02]);
    expect(trifftFilter(p, filter({ form: ['lose'] }))).toBe(true);
    expect(trifftFilter(p, filter({ form: ['sackware'] }))).toBe(true);
  });
});

describe('Transport', () => {
  it('zählt einen Auftrag nicht gleichzeitig als eigener LKW und Spedition', () => {
    // Sackware auf dem eigenen Hängerzug ist kein Speditionsauftrag.
    const p = mitPositionen(PALETTE_02, { belieferungsart: 'mit_haenger' });
    expect(trifftFilter(p, filter({ transport: ['eigener_lkw'] }))).toBe(true);
    expect(trifftFilter(p, filter({ transport: ['spedition'] }))).toBe(false);
  });

  it('erkennt Abholung ab Werk', () => {
    const p = projekt({ belieferungsart: 'abholung_ab_werk' });
    expect(trifftFilter(p, filter({ transport: ['abholung'] }))).toBe(true);
    expect(trifftFilter(p, filter({ transport: ['eigener_lkw'] }))).toBe(false);
  });
});

describe('Termin', () => {
  const heute = new Date('2026-03-18T10:00:00'); // Mittwoch, KW 12

  it('findet Projekte dieser und nächster Woche', () => {
    const dieseWoche = projekt({ kommuniziertesDatum: '2026-03-20' });
    const naechsteWoche = projekt({ kommuniziertesDatum: '2026-03-25' });
    expect(trifftFilter(dieseWoche, filter({ termin: ['diese_woche'] }), { heute })).toBe(true);
    expect(trifftFilter(naechsteWoche, filter({ termin: ['naechste_woche'] }), { heute })).toBe(true);
    expect(trifftFilter(naechsteWoche, filter({ termin: ['diese_woche'] }), { heute })).toBe(false);
  });

  it('findet Projekte ohne jeden Termin', () => {
    expect(trifftFilter(projekt({}), filter({ termin: ['ohne'] }), { heute })).toBe(true);
    expect(
      trifftFilter(projekt({ kommuniziertesDatum: '2026-03-20' }), filter({ termin: ['ohne'] }), { heute })
    ).toBe(false);
  });
});

describe('Suche', () => {
  it('findet über Belegnummern, nicht nur über den Namen', () => {
    // „Wo steckt ANG-2026-0523?" soll man nicht am Board absuchen müssen.
    const p = projekt({ angebotsnummer: 'ANG-2026-0523' });
    expect(trifftFilter(p, filter({ suche: 'ANG-2026-0523' }))).toBe(true);
    expect(trifftFilter(p, filter({ suche: '0523' }))).toBe(true);
  });

  it('ignoriert Gross- und Kleinschreibung', () => {
    expect(trifftFilter(projekt({ kundenname: 'TC Musterstadt' }), filter({ suche: 'musterSTADT' }))).toBe(true);
  });
});

describe('zaehleFuerWert', () => {
  const projekte = [
    mitPositionen(LOSE_02, { id: 'a', herkunft: 'shop' }),
    mitPositionen(LOSE_03, { id: 'b', herkunft: 'shop' }),
    mitPositionen(LOSE_02, { id: 'c' }),
  ];

  it('rechnet die anderen Gruppen mit ein', () => {
    // Bei aktivem Shop-Filter zählt „0/2" nur noch die Shop-Projekte.
    expect(zaehleFuerWert(projekte, filter({ kanal: ['shop'] }), 'koernung', '02')).toBe(1);
    expect(zaehleFuerWert(projekte, LEERER_FILTER, 'koernung', '02')).toBe(2);
  });

  it('ignoriert die EIGENE Gruppe', () => {
    // Sonst zeigte „0/3" eine 0, sobald „0/2" gewählt ist — und man schlösse
    // daraus, es gäbe keine 0/3-Aufträge. Innerhalb der Gruppe gilt ODER, ein
    // weiterer Wert kann die Menge nur vergrössern.
    const mitO2 = filter({ koernung: ['02'] });
    expect(zaehleFuerWert(projekte, mitO2, 'koernung', '03')).toBe(1);
  });
});

describe('URL', () => {
  it('überträgt einen Filter verlustfrei', () => {
    const f = filter({ kanal: ['shop', 'anfrage'], koernung: ['03'], suche: 'Musterstadt' });
    expect(filterAusUrlParams(filterZuUrlParams(f))).toEqual(f);
  });

  it('verwirft unbekannte Werte aus veralteten Lesezeichen', () => {
    // Ein altes Lesezeichen soll ein harmloses Ergebnis liefern, keine leere Tafel.
    const params = new URLSearchParams('f_kanal=shop,quatsch&f_koernung=99');
    const f = filterAusUrlParams(params);
    expect(f.kanal).toEqual(['shop']);
    expect(f.koernung).toEqual([]);
  });

  it('räumt Parameter weg, wenn eine Gruppe geleert wird', () => {
    const params = filterZuUrlParams(filter({ kanal: ['shop'] }));
    const danach = filterZuUrlParams(LEERER_FILTER, params);
    expect(danach.get('f_kanal')).toBeNull();
  });
});

describe('istFilterAktiv', () => {
  it('meldet einen leeren Filter als inaktiv', () => {
    expect(istFilterAktiv(LEERER_FILTER)).toBe(false);
    expect(anzahlAktiverFilter(LEERER_FILTER)).toBe(0);
  });

  it('zählt jeden gewählten Wert einzeln', () => {
    const f = filter({ kanal: ['shop', 'anfrage'], koernung: ['02'], suche: 'x' });
    expect(istFilterAktiv(f)).toBe(true);
    expect(anzahlAktiverFilter(f)).toBe(4);
  });

  it('wertet reine Leerzeichen in der Suche nicht als Filter', () => {
    expect(istFilterAktiv(filter({ suche: '   ' }))).toBe(false);
  });
});
