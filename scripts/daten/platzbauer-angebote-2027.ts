/**
 * Die Saisonvereinbarungen 2027 der sechs wichtigsten Platzbauer.
 *
 * Abgeschrieben aus den 2026er Angeboten (PB-AG-2026-029/032/034/035/036/037),
 * die als PDF vorlagen. Preise UNVERÄNDERT übernommen — eine Anpassung ist eine
 * kaufmännische Entscheidung und gehört nicht in eine Datenübernahme.
 *
 * Zwei Dinge sind gegenüber den Altbelegen anders abgebildet:
 *  1. Die Lieferregionen standen dort als eigene Staffelblöcke mit Freitext
 *     („Lieferregion: PLZ-Gebiet 61, 63, 64, 97"). Sie sind jetzt Regionpreise
 *     INNERHALB der Mengenstufen — dieselben Zahlen, aber maschinell
 *     auswertbar: Die Rechnung eines Vereins zieht ihren Preis über dessen PLZ.
 *  2. Fracht, Folie, Palette, Sackware, BigBag und Hydrocourt standen als
 *     Positionen mit Menge 1 in der Angebotssumme. Sie sind jetzt
 *     Preislistenzeilen: Preis je Einheit, ohne Menge, ohne Summe.
 *
 * Der Stufenpreis OHNE Region ist jeweils der teuerste Regionpreis: Für ein
 * nicht gepflegtes Gebiet gilt damit der ungünstigste vereinbarte Satz, nicht
 * versehentlich der günstigste.
 */

export interface RegionPreisDaten { plzGebiete: string; einzelpreis: number }
export interface StufeDaten {
  vonMenge: number;
  bisMenge: number | null;
  /** Preis für Gebiete ohne eigene Zeile. */
  einzelpreis: number;
  regionPreise?: RegionPreisDaten[];
}
export interface PreislisteDaten {
  artikelnummer: string;
  bezeichnung: string;
  gruppe: string;
  einheit: string;
  preis: number;
  hinweis?: string;
}
export interface PositionDaten {
  artikelnummer: string;
  bezeichnung: string;
  beschreibung?: string;
  einheit: string;
  menge: number;
  einzelpreis: number;
}
export interface PlatzbauerAngebotDaten {
  /** Name wie im Kundenstamm — danach wird in Appwrite gesucht. */
  name: string;
  /** Kurzform für Dateinamen. */
  kurz: string;
  strasse: string;
  plzOrt: string;
  /** Nummer des Vorjahresangebots, zur Nachvollziehbarkeit. */
  vorlage: string;
  sorten: Array<{
    artikelnummer: string;
    bezeichnung: string;
    lieferregion?: string;
    bemerkung?: string;
    stufen: StufeDaten[];
  }>;
  preisliste: PreislisteDaten[];
  /** Vereinbarte Einzelpreise je Verein (nur K.S.D. führt so ein Angebot). */
  positionen?: PositionDaten[];
  zahlungsziel: string;
  lieferzeit: string;
  lieferbedingungen: string;
  bemerkung?: string;
}

const FRACHT_HINWEIS =
  'Staffel je Anlieferung: unter 5,4 t 59,90 € · 5,4–7,4 t 49,90 € · 7,5–11,4 t 39,90 € · ' +
  '11,5–15,4 t 31,90 € · 15,5–19,9 t 24,90 €';

const zeile = (
  artikelnummer: string,
  bezeichnung: string,
  gruppe: string,
  einheit: string,
  preis: number,
  hinweis?: string
): PreislisteDaten => ({ artikelnummer, bezeichnung, gruppe, einheit, preis, hinweis });

const FRACHT = (preis: number, hinweis = FRACHT_HINWEIS, nummer = 'TM-FP') =>
  zeile(nummer, nummer === 'TM-FK' ? 'Frachtkosten' : 'Frachtkostenpauschale', 'Fracht & Verpackung', 'Pkt', preis, hinweis);
const FOLIE = (preis: number) =>
  zeile('TM-PE', 'PE-Folie zum Abdecken und Unterlegen', 'Fracht & Verpackung', 'Stk', preis);
const PALETTE = (preis: number) =>
  zeile('TM-PAL', 'Einwegpalette', 'Fracht & Verpackung', 'Stk', preis);
const SCHUETTSTELLE = zeile(
  'TM-STS', 'Zusätzliche Schüttstelle', 'Abladung', 'Stk', 15.9,
  'Die erste Schüttstelle ist im Preis enthalten.'
);
const SACKWARE = (preis: number): PreislisteDaten[] => [
  zeile('TM-ZM-02St', 'Tennismehl 0/2 Sackware 25 × 40 kg', 'Sackware & BigBag', 't', preis,
    'Eingeschweißt auf Einwegpalette, frei Bordsteinkante.'),
  zeile('TM-ZM-03St', 'Tennismehl 0/3 Sackware 25 × 40 kg', 'Sackware & BigBag', 't', preis,
    'Eingeschweißt auf Einwegpalette, frei Bordsteinkante.'),
];
const BIGBAG = (preis: number): PreislisteDaten[] => [
  zeile('TM-ZM-BIG-02', 'Tennismehl 0/2 im BigBag', 'Sackware & BigBag', 't', preis,
    'Gemäß DIN 18035, auf Einwegpalette.'),
  zeile('TM-ZM-BIG-03', 'Tennismehl 0/3 im BigBag', 'Sackware & BigBag', 't', preis,
    'Gemäß DIN 18035, auf Einwegpalette.'),
];
const HYDROCOURT = (preis: number, versand: number): PreislisteDaten[] => [
  zeile('TM-HYC', 'HYDROcourt© 25 Ltr', 'HYDROcourt©', 'Stk', preis,
    'Nachhaltige Tennisplatzpflege, bis zu 80 % weniger Wasserbedarf.'),
  zeile('TM-HYC-V', 'HYDROcourt© Versandpauschale', 'HYDROcourt©', 'Stk', versand, 'Je Sendung.'),
];

/** Eine Sorte „Tennismehl 0/2 Schüttgut" mit den üblichen Angaben. */
const schuettgut = (stufen: StufeDaten[]) => ({
  artikelnummer: 'TM-ZM-02',
  bezeichnung: 'Tennismehl 0/2 Schüttgut',
  bemerkung: 'gemäß DIN 18035, frei Baustelle abgeladen',
  stufen,
});

/** Stufe mit Regionpreisen; der teuerste Satz gilt für übrige Gebiete. */
const stufe = (
  vonMenge: number,
  bisMenge: number | null,
  regionen: Array<[string, number]>
): StufeDaten => ({
  vonMenge,
  bisMenge,
  einzelpreis: Math.max(...regionen.map(([, preis]) => preis)),
  regionPreise: regionen.map(([plzGebiete, einzelpreis]) => ({ plzGebiete, einzelpreis })),
});

export const PLATZBAUER_ANGEBOTE_2027: PlatzbauerAngebotDaten[] = [
  {
    name: 'Averbeck GmbH Tennisplatzbau und Beregnungsanlagen',
    kurz: 'Averbeck',
    strasse: 'Hilbuskamp 40',
    plzOrt: '48629 Metelen',
    vorlage: 'PB-AG-2026-029',
    sorten: [
      schuettgut([
        stufe(0, 500, [['61;63;64;97', 114.45], ['74;90;91', 119.45], ['34;36', 122.45]]),
        stufe(500, 750, [['61;63;64;97', 108.95], ['74;90;91', 113.95], ['34;36', 116.95]]),
        stufe(750, null, [['61;63;64;97', 105.95], ['74;90;91', 109.95], ['34;36', 112.95]]),
      ]),
    ],
    preisliste: [
      FRACHT(4.95), FOLIE(19.2), PALETTE(12.9), SCHUETTSTELLE,
      zeile('TM-LKW-KR', 'Entladung Sackware mit LKW-Ladekran', 'Abladung', 't', 6.9),
      ...SACKWARE(155), ...BIGBAG(125.9),
    ],
    zahlungsziel: '14 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    lieferbedingungen: 'Frei Baustelle, abgeladen',
    bemerkung: 'Fracht für Palettenware nach aktuellen Speditionsraten, je nach PLZ und Menge.',
  },
  {
    name: 'Andreas Meinecke Tennisservice',
    kurz: 'Meinecke',
    strasse: 'Bahnhofstraße 2',
    plzOrt: '06536 Rottleberode',
    vorlage: 'PB-AG-2026-036',
    sorten: [
      schuettgut([
        // Im Altbeleg lief Stufe 2 „75–149" und Stufe 3 „ab 149" – 149 t stand
        // damit in zwei Stufen. Hier gilt die portalweite Grenzregel: bis
        // unter 150 t die zweite, ab 150 t die dritte Stufe.
        stufe(0, 75, [['60;61;62;63;64;65', 114.95]]),
        stufe(75, 150, [['60;61;62;63;64;65', 111.69]]),
        stufe(150, null, [['60;61;62;63;64;65', 108.64]]),
      ]),
    ],
    preisliste: [
      FRACHT(4.95), FOLIE(18.2), PALETTE(12.5), SCHUETTSTELLE,
      ...SACKWARE(155), ...BIGBAG(125.9),
    ],
    zahlungsziel: '14 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    lieferbedingungen: 'Frei Baustelle, abgeladen',
  },
  {
    name: 'Garten- und Landschaftsbau Catalkaya',
    kurz: 'Catalkaya',
    strasse: 'Sulzbacherstr. 2c',
    plzOrt: '90552 Röthenbach an der Pegnitz',
    vorlage: 'PB-AG-2026-034',
    sorten: [
      schuettgut([
        stufe(0, 150, [['63;97', 122.15], ['90;91', 123.95], ['96', 125.95]]),
        stufe(150, 350, [['63;97', 117.2], ['90;91', 119.2], ['96', 120.22]]),
        stufe(350, null, [['63;97', 112.95], ['90;91', 115.75], ['96', 117.98]]),
      ]),
    ],
    preisliste: [
      FRACHT(0, 'Im Tonnenpreis enthalten (Vereinbarung 2026).'),
      FOLIE(18.2),
    ],
    zahlungsziel: '14 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    lieferbedingungen: 'Frei Baustelle, abgeladen',
  },
  {
    name: 'PTS Tennisplatz- und Sportanlagenbau GmbH',
    kurz: 'PTS',
    strasse: 'Wiesbadener Straße 56',
    plzOrt: '65510 Idstein',
    vorlage: 'PB-AG-2026-035',
    sorten: [
      // Ohne Regionen: PTS hat eine einheitliche Staffel vereinbart.
      schuettgut([
        { vonMenge: 0, bisMenge: 450, einzelpreis: 118.6 },
        { vonMenge: 450, bisMenge: 700, einzelpreis: 113.95 },
        { vonMenge: 700, bisMenge: null, einzelpreis: 109.95 },
      ]),
    ],
    preisliste: [FRACHT(24.9), FOLIE(18.2), ...SACKWARE(155), ...HYDROCOURT(220, 13.5)],
    zahlungsziel: '14 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    lieferbedingungen: 'Frei Baustelle, abgeladen',
  },
  {
    name: 'Thomas Vogl',
    kurz: 'Vogl',
    strasse: 'Hof Schwarzenbach 1',
    plzOrt: '34302 Guxhagen',
    vorlage: 'PB-AG-2026-037',
    sorten: [
      schuettgut([
        stufe(0, 150, [['35;60;61;62;63;64;70;71;73;74;90;91;96;97', 121.95]]),
        stufe(150, 275, [['35;60;61;62;63;64;70;71;73;74;90;91;96;97', 117.45]]),
        stufe(275, null, [['35;60;61;62;63;64;70;71;73;74;90;91;96;97', 113.95]]),
      ]),
    ],
    preisliste: [
      FRACHT(4.95, undefined, 'TM-FK'), FOLIE(18.2), PALETTE(12.5), SCHUETTSTELLE,
      ...SACKWARE(155), ...HYDROCOURT(220, 13.5),
    ],
    zahlungsziel: '14 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    lieferbedingungen: 'Frei Baustelle, abgeladen',
  },
  {
    // Sonderfall: K.S.D. hat keine Mengenstaffel, sondern je Verein einen
    // vereinbarten Preis. Das bleibt so — eine Staffel daraus zu erfinden wäre
    // eine Preisänderung, keine Übernahme.
    name: 'K.S.D Tennisplatzbau Garten- und Sportplatzbau GmbH',
    kurz: 'KSD',
    strasse: 'Auf der Höhe 18',
    plzOrt: '34130 Kassel',
    vorlage: 'PB-AG-2026-032',
    sorten: [],
    positionen: (
      [
        ['SV S-W Kleinenglis', 116.9],
        ['TSV Eintracht Naumburg Tennis', 124.9],
        ['TC Bad Zwesten', 116.9],
        ['TV Maar Tennis', 116.9],
        ['TuSpo Frielendorf Tennis', 124.9],
        ['TC Rot-Weiß Fulda', 116.9],
        ['TC Grün-Weiß Fulda', 116.9],
        ['TC SW Großenlüder', 116.9],
        ['TC Schwarz-Weiß Niesig', 116.9],
        ['TC Blau-Weiß Petersberg', 116.9],
        ['TCB Johannisau Fulda', 116.9],
        ['DJK Würzburg Tennis', 108.95],
        ['TSC Heuchelhof', 108.95],
        ['TSV Rottenbauer Tennis', 108.95],
        ['TC Bürgstadt', 108.95],
        ['TSG Waldbüttelbrunn Tennis', 108.95],
        ['1. FC Taubertal Tennis', 108.95],
        ['SV Wachbach Tennis', 108.95],
        ['TV Kleinheubach Tennis', 108.95],
        ['TC Großheubach', 108.95],
        ['TC Weiß-Blau Wörth am Main', 108.95],
        ['TC Grün-Weiß Freudenberg', 108.95],
        ['TC Rot-Weiß Miltenberg', 108.95],
      ] as Array<[string, number]>
    ).map(([verein, preis]) => ({
      artikelnummer: 'TM-ZM-02',
      bezeichnung: verein,
      beschreibung: 'Tennismehl 0/2 Schüttgut gemäß DIN 18035',
      einheit: 't',
      menge: 0,
      einzelpreis: preis,
    })),
    preisliste: [FRACHT(4.95), FOLIE(18.2), SCHUETTSTELLE, ...HYDROCOURT(165, 20)],
    zahlungsziel: '14 Tage netto',
    lieferzeit: 'Nach Vereinbarung',
    lieferbedingungen: 'Frei Baustelle, abgeladen',
  },
];
