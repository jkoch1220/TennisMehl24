/**
 * Saisonvereinbarungen 2027 der sechs wichtigsten Platzbauer anlegen.
 *
 *   npx vite-node scripts/platzbauer-angebote-2027-erstellen.ts -- --pdf ./out
 *   npx vite-node scripts/platzbauer-angebote-2027-erstellen.ts -- --schreiben [--mock]
 *
 * `--pdf <ordner>`  rendert die Angebote als PDF zur Durchsicht (schreibt nichts
 *                   in die Datenbank).
 * `--schreiben`     legt je Platzbauer das Saisonprojekt 2027 an (falls es
 *                   fehlt) und hinterlegt den ANGEBOTSENTWURF. Bewusst kein
 *                   fertiges Angebot: Die Nummer vergibt das Portal beim
 *                   Erstellen, und Preise gehören vor dem Versand geprüft.
 * `--ueberschreiben` ersetzt einen bereits vorhandenen Entwurf.
 * `--mock`          arbeitet auf der Sandbox-Datenbank.
 *
 * Datenquelle: `scripts/daten/platzbauer-angebote-2027.ts` (aus den 2026er
 * PDFs übernommen). Preise werden NICHT verändert.
 */
import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';
import { Client, Databases, ID, Query } from 'node-appwrite';
import {
  PLATZBAUER_ANGEBOTE_2027,
  PlatzbauerAngebotDaten,
} from './daten/platzbauer-angebote-2027';
import { generierePlatzbauerAngebotPDF } from '../src/services/platzbauerdokumentService';
import { standardStaffelKonditionen } from '../src/utils/staffelpreisText';
import type { Stammdaten } from '../src/types/stammdaten';

const args = process.argv.slice(2);
const hat = (flag: string) => args.includes(flag);
const wert = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const SAISON = Number(wert('--saison') || 2027);
const MOCK = hat('--mock');
const SCHREIBEN = hat('--schreiben');
const UEBERSCHREIBEN = hat('--ueberschreiben');
const PDF_ORDNER = wert('--pdf');

const heute = new Date();
const iso = (d: Date) => d.toISOString().split('T')[0];
const in30Tagen = new Date(heute.getTime() + 30 * 24 * 60 * 60 * 1000);

/** Staffelsorten im Format der Angebotsmaske (StaffelSorte). */
const staffelSorten = (daten: PlatzbauerAngebotDaten) =>
  daten.sorten.map((sorte, index) => ({
    id: `staffel-${index + 1}`,
    artikelnummer: sorte.artikelnummer,
    artikelBezeichnung: sorte.bezeichnung,
    einheit: 't',
    lieferregion: sorte.lieferregion,
    bemerkung: sorte.bemerkung,
    staffeln: sorte.stufen.map((s) => ({
      vonMenge: s.vonMenge,
      bisMenge: s.bisMenge,
      einzelpreis: s.einzelpreis,
      ...(s.regionPreise?.length ? { regionPreise: s.regionPreise } : {}),
    })),
  }));

const preislistenPositionen = (daten: PlatzbauerAngebotDaten) =>
  daten.preisliste.map((p) => ({
    id: `preisliste-${p.artikelnummer}`,
    artikelnummer: p.artikelnummer,
    bezeichnung: p.bezeichnung,
    einheit: p.einheit,
    menge: 0,
    einzelpreis: p.preis,
    gesamtpreis: 0,
    positionsTyp: 'preisliste' as const,
    preislisteGruppe: p.gruppe,
    preislisteHinweis: p.hinweis,
  }));

const zusatzPositionen = (daten: PlatzbauerAngebotDaten) =>
  (daten.positionen || []).map((p, index) => ({
    id: `pos-${index + 1}`,
    artikelnummer: p.artikelnummer,
    bezeichnung: p.bezeichnung,
    beschreibung: p.beschreibung,
    einheit: p.einheit,
    menge: p.menge,
    einzelpreis: p.einzelpreis,
    gesamtpreis: Math.round(p.menge * p.einzelpreis * 100) / 100,
  }));

/** Der Entwurf, den der Angebotstab liest (`AngebotEntwurf` dort). */
const baueEntwurf = (daten: PlatzbauerAngebotDaten) => ({
  vereinPositionen: [],
  zusatzPositionen: zusatzPositionen(daten),
  preislistenPositionen: preislistenPositionen(daten),
  staffelpreisPositionen: staffelSorten(daten),
  bedarfsPositionen: [],
  angebotsModus: (daten.sorten.length > 0 ? 'staffelpreis' : 'standard') as
    | 'staffelpreis'
    | 'standard',
  staffelKonditionen: {
    ...standardStaffelKonditionen(SAISON),
    grenzenGekoppelt: true,
  },
  formData: {
    // Die Nummer vergibt das Portal beim Erstellen des Angebots.
    angebotsnummer: '',
    angebotsdatum: iso(heute),
    gueltigBis: iso(in30Tagen),
    zahlungsziel: daten.zahlungsziel,
    lieferzeit: daten.lieferzeit,
    bemerkung: daten.bemerkung || '',
  },
});

/** Positionen für die PDF-Vorschau (dieselben Daten wie im Entwurf). */
const pdfPositionen = (daten: PlatzbauerAngebotDaten) => [
  ...zusatzPositionen(daten),
  ...preislistenPositionen(daten),
  ...staffelSorten(daten).map((sorte) => ({
    id: sorte.id,
    artikelnummer: sorte.artikelnummer,
    bezeichnung: sorte.artikelBezeichnung,
    beschreibung: [
      sorte.lieferregion ? `Lieferregion: ${sorte.lieferregion}` : '',
      sorte.bemerkung || '',
    ]
      .filter(Boolean)
      .join('\n'),
    einheit: 't',
    menge: 0,
    einzelpreis: 0,
    gesamtpreis: 0,
    positionsTyp: 'staffelpreis' as const,
    staffelpreise: {
      staffeln: sorte.staffeln,
      basisArtikel: sorte.artikelnummer,
      basisBezeichnung: sorte.artikelBezeichnung,
      lieferregion: sorte.lieferregion,
      bemerkung: sorte.bemerkung,
    },
  })),
];

const stammdatenFuerVorschau = (): Stammdaten =>
  ({
    firmenname: 'Tennismehl GmbH',
    firmenstrasse: 'Raiffeisenweg 1',
    firmenPlz: '97232',
    firmenOrt: 'Giebelstadt',
    firmenLand: 'DE',
    firmenTelefon: '09391 98700',
    firmenEmail: 'info@tennismehl.com',
    firmenWebsite: 'www.tennismehl.com',
    geschaeftsfuehrer: ['Luca Ramos de la Rosa', 'Julian Tim Koch'],
    sitzGesellschaft: 'Giebelstadt',
    handelsregister: 'Würzburg HRB 18235',
    ustIdNr: 'DE459375853',
    werkName: 'Tennismehl GmbH',
    werkStrasse: 'Wertheimer Str. 30a',
    werkPlz: '97828',
    werkOrt: 'Marktheidenfeld',
    bankname: 'VR-Bank Würzburg',
    iban: 'DE67 7909 0000 0000 8638 66',
    bic: 'GENODEF1WU1',
  }) as unknown as Stammdaten;

const erzeugePdf = async (daten: PlatzbauerAngebotDaten, ordner: string) => {
  const doc = await generierePlatzbauerAngebotPDF(
    {
      projekt: {
        id: 'vorschau',
        projektName: `${daten.name} ${SAISON}`,
        saisonjahr: SAISON,
      },
      angebotsnummer: `Entwurf (Vorlage ${daten.vorlage})`,
      angebotsdatum: iso(heute),
      gueltigBis: iso(in30Tagen),
      platzbauerId: 'vorschau',
      platzbauername: daten.name,
      platzbauerstrasse: daten.strasse,
      platzbauerPlzOrt: daten.plzOrt,
      positionen: [],
      angebotPositionen: pdfPositionen(daten),
      staffelKonditionen: standardStaffelKonditionen(SAISON),
      zahlungsziel: daten.zahlungsziel,
      zahlungsart: 'Überweisung',
      lieferzeit: daten.lieferzeit,
      lieferbedingungenAktiviert: true,
      lieferbedingungen: daten.lieferbedingungen,
      bemerkung: daten.bemerkung,
    } as any,
    stammdatenFuerVorschau()
  );
  const datei = path.join(ordner, `Angebot ${daten.kurz} ${SAISON}.pdf`);
  fs.writeFileSync(datei, Buffer.from(doc.output('arraybuffer')));
  return datei;
};

// ==================== APPWRITE ====================

const appwrite = () => {
  const env: Record<string, string> = {};
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const client = new Client()
    .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
    .setProject(env.VITE_APPWRITE_PROJECT_ID)
    .setKey(env.APPWRITE_API_KEY);
  return {
    db: new Databases(client),
    DB: MOCK ? 'tennismehl24_db_mock' : 'tennismehl24_db',
  };
};

/**
 * Platzbauer im Kundenstamm suchen.
 *
 * `saison_kunden` führt NUR das Feld `data` — Typ und Name stehen im JSON.
 * Eine Query auf `typ` scheitert deshalb („Attribute not found in schema");
 * gefiltert wird nach dem Parsen.
 */
const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const ladePlatzbauer = async (db: Databases, DB: string) => {
  const alle: Array<{ id: string; name: string }> = [];
  let cursor: string | undefined;
  for (;;) {
    const seite = await db.listDocuments(DB, 'saison_kunden', [
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    for (const doc of seite.documents as any[]) {
      try {
        const daten = JSON.parse(doc.data || '{}');
        if (daten.typ === 'platzbauer') alle.push({ id: doc.$id, name: daten.name || '' });
      } catch {
        /* unlesbares Dokument überspringen */
      }
    }
    if (seite.documents.length < 100) break;
    cursor = seite.documents[seite.documents.length - 1].$id;
  }
  return alle;
};

const findePlatzbauer = (
  platzbauer: Array<{ id: string; name: string }>,
  name: string
) => {
  const gesucht = normal(name);
  return (
    platzbauer.find((p) => normal(p.name) === gesucht) ||
    platzbauer.find((p) => normal(p.name).startsWith(gesucht.slice(0, 12))) ||
    platzbauer.find((p) => gesucht.startsWith(normal(p.name).slice(0, 12))) ||
    null
  );
};

const schreibeEntwurf = async (
  db: Databases,
  DB: string,
  alle: Array<{ id: string; name: string }>,
  daten: PlatzbauerAngebotDaten
) => {
  const platzbauer = findePlatzbauer(alle, daten.name);
  if (!platzbauer) return `❌ ${daten.kurz}: Platzbauer nicht im Kundenstamm gefunden`;

  const projekte = await db.listDocuments(DB, 'platzbauer_projekte', [
    Query.equal('platzbauerId', platzbauer.id),
    Query.equal('saisonjahr', SAISON),
    Query.limit(50),
  ]);
  let projekt: any = projekte.documents.find((p: any) => p.typ === 'saisonprojekt');
  const projektName = `${platzbauer.name} ${SAISON}`;

  if (!projekt) {
    // Genau wie `createPlatzbauerprojekt`: Spalten für die Abfragen, der Rest
    // im data-JSON. `data` ist Pflichtfeld.
    const jetzt = new Date().toISOString();
    const id = ID.unique();
    projekt = await db.createDocument(DB, 'platzbauer_projekte', id, {
      platzbauerId: platzbauer.id,
      platzbauerName: platzbauer.name,
      saisonjahr: SAISON,
      status: 'angebot',
      typ: 'saisonprojekt',
      erstelltAm: jetzt,
      geaendertAm: jetzt,
      data: JSON.stringify({ id, projektName }),
    });
  }

  let dataObj: Record<string, unknown> = {};
  if (typeof projekt.data === 'string' && projekt.data.length > 0) {
    try {
      dataObj = JSON.parse(projekt.data);
    } catch {
      dataObj = {};
    }
  }
  if (dataObj.angebotsDaten && !UEBERSCHREIBEN) {
    return `⏭️  ${daten.kurz}: Entwurf existiert bereits (mit --ueberschreiben ersetzen)`;
  }

  dataObj.angebotsDaten = {
    gespeichertAm: new Date().toISOString(),
    daten: baueEntwurf(daten),
  };

  if (!dataObj.projektName) dataObj.projektName = projektName;

  await db.updateDocument(DB, 'platzbauer_projekte', projekt.$id, {
    data: JSON.stringify(dataObj),
    geaendertAm: new Date().toISOString(),
  });
  return `✅ ${daten.kurz}: Entwurf in „${projektName}" hinterlegt (${projekt.$id})`;
};

const main = async () => {
  if (!SCHREIBEN && !PDF_ORDNER) {
    console.log('Nichts zu tun. Aufruf mit --pdf <ordner> und/oder --schreiben.');
    return;
  }

  if (PDF_ORDNER) {
    fs.mkdirSync(PDF_ORDNER, { recursive: true });
    for (const daten of PLATZBAUER_ANGEBOTE_2027) {
      const datei = await erzeugePdf(daten, PDF_ORDNER);
      console.log('📄', datei);
    }
  }

  if (SCHREIBEN) {
    console.log(`\nSchreibe Entwürfe für Saison ${SAISON} (${MOCK ? 'SANDBOX' : 'PRODUKTION'}):`);
    const { db, DB } = appwrite();
    const alle = await ladePlatzbauer(db, DB);
    console.log(`   ${alle.length} Platzbauer im Kundenstamm gefunden.`);
    for (const daten of PLATZBAUER_ANGEBOTE_2027) {
      try {
        console.log(await schreibeEntwurf(db, DB, alle, daten));
      } catch (e: any) {
        console.log(`❌ ${daten.kurz}: ${e?.message || e}`);
      }
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
