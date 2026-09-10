/**
 * Layout-Vorschau für das Platzbauer-Angebot (ohne Appwrite, ohne Browser).
 *
 *   npx vite-node scripts/preview-platzbauerangebot.ts -- /tmp/angebot.pdf
 *
 * Rendert ein Beispielangebot mit Staffelmatrix, Standard-Preisliste und
 * Vereinspositionen. Gedacht für Änderungen an `platzbauerdokumentService.ts`:
 * Das PDF lässt sich so prüfen, ohne im Portal ein Projekt anzulegen.
 * Das Firmenlogo fehlt in Node (es wird im Browser aus einem SVG gerendert) –
 * die Meldung „Logo konnte nicht geladen werden" ist hier normal.
 *
 * vite-node statt tsx, weil die Services `import.meta.env` verwenden.
 */
import fs from 'fs';
import { setLogoBase64 } from '../src/services/logoLoader';
import { readFileSync } from 'fs';
import {
  generierePlatzbauerAngebotPDF,
  generierePlatzbauerRechnungPDF,
} from '../src/services/platzbauerdokumentService';
import type { Stammdaten } from '../src/types/stammdaten';


/**
 * Das Logo rendert das Portal aus einem SVG über Canvas — in Node gibt es
 * beides nicht. Für die Vorschau wird deshalb das PNG aus `public/` gesetzt,
 * damit der Beleg aussieht wie der echte.
 */
const setzeLogo = () => {
  try {
    const png = readFileSync('public/Briefkopf.png');
    setLogoBase64(`data:image/png;base64,${png.toString('base64')}`);
  } catch (e) {
    console.warn('Logo für die Vorschau nicht gefunden — Beleg wird ohne gerendert.');
  }
};
const stammdaten = {
  $id: 'x', firmenname: 'Tennismehl GmbH', firmenstrasse: 'Raiffeisenweg 1', firmenPlz: '97232',
  firmenOrt: 'Giebelstadt', firmenLand: 'DE',
  firmenTelefon: '09334 123456', firmenEmail: 'info@tennismehl.com', firmenWebsite: 'www.tennismehl.com',
  geschaeftsfuehrer: ['Julian Koch'], sitzGesellschaft: 'Giebelstadt',
  handelsregister: 'Würzburg HRB 18235', ustIdNr: 'DE459375853',
  bankName: 'VR Bank', bankname: 'VR Bank', iban: 'DE00 0000 0000 0000 0000 00',
  bic: 'GENODEF1XXX', steuernummer: '123/456/789',
} as unknown as Stammdaten;

const staffeln = [
  { id: '1', vonMenge: 0, bisMenge: 150, einzelpreis: 118.5 },
  {
    id: '2',
    vonMenge: 150,
    bisMenge: 300,
    einzelpreis: 113.5,
    regionPreise: [
      { plzGebiete: '97;92', einzelpreis: 116.5 },
      { plzGebiete: '47;42', einzelpreis: 121.5 },
    ],
  },
  {
    id: '3',
    vonMenge: 300,
    bisMenge: null,
    einzelpreis: 108.5,
    regionPreise: [
      { plzGebiete: '97;92', einzelpreis: 111.5 },
      { plzGebiete: '47;42', einzelpreis: 116.5 },
    ],
  },
];

const staffelPos = (nr: string, bez: string, delta: number) => ({
  id: nr, artikelnummer: nr, bezeichnung: bez, einheit: 't', menge: 0, einzelpreis: 0, gesamtpreis: 0,
  positionsTyp: 'staffelpreis' as const,
  beschreibung: 'Lieferregion: PLZ 6, 7, 8, 9 · frei Verwendungsstelle',
  staffelpreise: { staffeln: staffeln.map(s => ({ ...s, einzelpreis: s.einzelpreis + delta })) },
});

const preisliste = [
  ['TM-FP', 'Frachtkostenpauschale', 'Fracht & Verpackung', 'Stk', 89, 'Je Anlieferung; entfällt ab 20 t Schüttgut.'],
  ['TM-PE', 'PE-Folie für Abdeckung', 'Fracht & Verpackung', 'Stk', 24.5, 'Je Lieferung mit losem Material.'],
  ['TM-PAL', 'Einwegpalette', 'Fracht & Verpackung', 'Stk', 14.9, 'Je Palette Sackware oder BigBag.'],
  ['TM-STS', 'Zusätzliche Schüttstelle', 'Abladung', 'Stk', 15.9, 'Die erste Schüttstelle ist im Preis enthalten.'],
  ['TM-HYC', 'HYDROcourt©', 'HYDROcourt©', 'Stk', 220, ''],
  ['TM-HYC-V', 'HYDROcourt© Versandpauschale', 'HYDROcourt©', 'Stk', 13.5, 'Je Sendung.'],
].map(([nr, bez, gruppe, einheit, preis, hinweis]: any) => ({
  id: `pl-${nr}`, artikelnummer: nr, bezeichnung: bez, einheit, menge: 0,
  einzelpreis: preis, gesamtpreis: 0, positionsTyp: 'preisliste' as const,
  preislisteGruppe: gruppe, preislisteHinweis: hinweis || undefined,
}));

const daten: any = {
  projekt: { id: 'p1', projektName: 'Saisonvereinbarung 2027', saisonjahr: 2027 },
  angebotsnummer: 'AN-2027-0042', angebotsdatum: '2026-09-09', gueltigBis: '2026-12-31',
  platzbauerId: 'pb1', platzbauername: 'Muster Sportplatzbau GmbH',
  platzbauerstrasse: 'Industriestraße 12', platzbauerPlzOrt: '90402 Nürnberg',
  platzbauerAnsprechpartner: 'Herrn Meier',
  positionen: [],
  frachtkosten: 0,
  angebotPositionen: [
    staffelPos('TM-ZM-02', 'Tennismehl 0/2 mm lose', 0),
    staffelPos('TM-ZM-03', 'Tennismehl 0/3 mm lose', 0),
    ...preisliste,
    { id: 'v1', artikelnummer: 'TM-ZM-02', bezeichnung: 'TC Musterstadt e. V.', beschreibung: 'Tennismehl 0/2 mm lose', einheit: 't', menge: 45, einzelpreis: 118.5, gesamtpreis: 5332.5, positionsTyp: 'normal' as const, lieferadresse: { plz: '97070', ort: 'Würzburg' } },
    { id: 'v2', artikelnummer: 'TM-ZM-02', bezeichnung: 'TSV Beispielheim', beschreibung: 'Tennismehl 0/2 mm lose', einheit: 't', menge: 30, einzelpreis: 118.5, gesamtpreis: 3555, positionsTyp: 'normal' as const, lieferadresse: { plz: '91052', ort: 'Erlangen' } },
  ],
  zahlungsziel: '14 Tage netto', zahlungsart: 'Überweisung',
  lieferzeit: 'nach Abruf, 5–10 Werktage', ihreAnsprechpartner: 'Julian Koch',
  lieferbedingungenAktiviert: false,
};

/** Rechnung mit Preisherkunft je Vereinszeile (Staffel vs. Direktpreis). */
const rechnungsDaten: any = {
  projekt: daten.projekt,
  rechnungsnummer: 'RE-2027-0107',
  rechnungsdatum: '2027-05-14',
  leistungsdatum: '2027-05-02',
  platzbauerId: daten.platzbauerId,
  platzbauername: daten.platzbauername,
  platzbauerstrasse: daten.platzbauerstrasse,
  platzbauerPlzOrt: daten.platzbauerPlzOrt,
  platzbauerAnsprechpartner: daten.platzbauerAnsprechpartner,
  positionen: [
    {
      vereinId: 'v1', vereinsname: 'TC Musterstadt e. V.', vereinsprojektId: 'p1',
      menge: 45, einzelpreis: 113.5, gesamtpreis: 5107.5,
      lieferadresse: { strasse: 'Am Sportplatz 1', plz: '97070', ort: 'Würzburg' },
      preisHerkunft: 'Staffel Stufe 2 (ab 150 t)',
    },
    {
      vereinId: 'v2', vereinsname: 'TSV Beispielheim', vereinsprojektId: 'p2',
      menge: 30, einzelpreis: 105, gesamtpreis: 3150,
      lieferadresse: { strasse: 'Waldweg 8', plz: '91052', ort: 'Erlangen' },
      preisHerkunft: 'Direktpreis lt. Vereinbarung (abweichend von der Staffel)',
    },
  ],
  zahlungsziel: '14 Tage netto',
  ihreAnsprechpartner: 'Julian Koch',
};

const main = async () => {
  setzeLogo();
  const out = process.argv[2] || 'angebot.pdf';
  const doc = await generierePlatzbauerAngebotPDF(daten, stammdaten);
  fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
  console.log('geschrieben:', out, 'Seiten:', doc.getNumberOfPages());

  const rechnung = await generierePlatzbauerRechnungPDF(rechnungsDaten, stammdaten);
  const outRechnung = out.replace(/\.pdf$/, '') + '-rechnung.pdf';
  fs.writeFileSync(outRechnung, Buffer.from(rechnung.output('arraybuffer')));
  console.log('geschrieben:', outRechnung, 'Seiten:', rechnung.getNumberOfPages());
};
main().catch(e => { console.error(e); process.exit(1); });
