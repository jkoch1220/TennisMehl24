/**
 * Import-Script für K.S.D Sportplatzbau Kunden
 * Führe aus mit: npx tsx scripts/import-ksd-kunden.ts
 */

import { Client, Databases, ID, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';
const SAISON_DATEN_COLLECTION_ID = 'saison_daten';
const SAISON_BEZIEHUNGEN_COLLECTION_ID = 'saison_beziehungen';
const PROJEKTE_COLLECTION_ID = 'projekte';
const PLATZBAUER_PROJEKTE_COLLECTION_ID = 'platzbauer_projekte';
const PROJEKT_ZUORDNUNGEN_COLLECTION_ID = 'projekt_zuordnungen';

// ===================== DATEN =====================

interface VereinDaten {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  bundesland: string;
  menge: number; // in Tonnen
  lieferfensterFrueh: string; // ISO Date
  lieferfensterSpaet: string; // ISO Date
  notizen?: string;
  belieferungsart?: 'nur_motorwagen' | 'mit_haenger' | 'abholung_ab_werk' | 'palette_mit_ladekran' | 'bigbag';
  bezugsweg: 'ueber_platzbauer' | 'direkt';
}

// Kalenderwoche zu Datum-Range (2026)
const KW_DATEN: Record<string, { frueh: string; spaet: string }> = {
  'KW10': { frueh: '2026-03-02', spaet: '2026-03-08' },
  'KW11': { frueh: '2026-03-09', spaet: '2026-03-15' },
  'KW12': { frueh: '2026-03-16', spaet: '2026-03-22' },
};

const VEREINE: VereinDaten[] = [
  // KW10
  {
    name: 'TC Rot-Weiß Miltenberg',
    strasse: 'Ob. Walldürner Str. 84',
    plz: '63897',
    ort: 'Miltenberg',
    bundesland: 'Bayern',
    menge: 12,
    lieferfensterFrueh: KW_DATEN['KW10'].frueh,
    lieferfensterSpaet: KW_DATEN['KW10'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Grün-Weiß Freudenberg',
    strasse: 'In d. Gambach 24',
    plz: '57258',
    ort: 'Freudenberg',
    bundesland: 'Nordrhein-Westfalen',
    menge: 12.5,
    lieferfensterFrueh: KW_DATEN['KW10'].frueh,
    lieferfensterSpaet: KW_DATEN['KW10'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Weiß-Blau Wörth am Main',
    strasse: 'Presentstraße',
    plz: '63939',
    ort: 'Wörth am Main',
    bundesland: 'Bayern',
    menge: 12.5,
    lieferfensterFrueh: KW_DATEN['KW10'].frueh,
    lieferfensterSpaet: KW_DATEN['KW10'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Großheubach',
    strasse: 'Beim Trieb 83',
    plz: '63920',
    ort: 'Großheubach',
    bundesland: 'Bayern',
    menge: 19,
    lieferfensterFrueh: KW_DATEN['KW10'].frueh,
    lieferfensterSpaet: KW_DATEN['KW10'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TV Kleinheubach Tennis',
    strasse: 'Am Sportplatz 6',
    plz: '63924',
    ort: 'Kleinheubach',
    bundesland: 'Bayern',
    menge: 5,
    lieferfensterFrueh: KW_DATEN['KW10'].frueh,
    lieferfensterSpaet: KW_DATEN['KW10'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  // KW11
  {
    name: 'SV Wachbach Tennis',
    strasse: 'Erpfentalstr.',
    plz: '97980',
    ort: 'Bad Mergentheim-Wachbach',
    bundesland: 'Baden-Württemberg',
    menge: 7.5,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: '1.FC Taubertal Tennis',
    strasse: 'Sportplatz',
    plz: '97285',
    ort: 'Tauberrettersheim',
    bundesland: 'Bayern',
    menge: 5,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TSG Waldbüttelbrunn Tennis',
    strasse: 'Am Sumpfler 1',
    plz: '97297',
    ort: 'Waldbüttelbrunn',
    bundesland: 'Bayern',
    menge: 8,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Bürgstadt',
    strasse: 'Fleckenweg 2',
    plz: '63927',
    ort: 'Bürgstadt',
    bundesland: 'Bayern',
    menge: 18,
    lieferfensterFrueh: '2026-03-09',
    lieferfensterSpaet: '2026-03-09', // fix 09.03.2026
    notizen: 'fix 09.03.2026 vormittags - dreiachser Motor 8to, 10to Hänger',
    belieferungsart: 'mit_haenger',
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TSV Rottenbauer Tennis',
    strasse: 'Lindflurer Str. 10',
    plz: '97084',
    ort: 'Würzburg',
    bundesland: 'Bayern',
    menge: 7.5,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TSC Heuchelhof',
    strasse: 'Berner Str. 7',
    plz: '97084',
    ort: 'Würzburg',
    bundesland: 'Bayern',
    menge: 15,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'DJK Würzburg Tennis',
    strasse: 'Mainaustr. 46b',
    plz: '97082',
    ort: 'Würzburg',
    bundesland: 'Bayern',
    menge: 15,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  // HTC Würzburg - SONDERFALL: Direkt (bestellt selbst)
  {
    name: 'HTC Würzburg',
    strasse: 'Zeppelinstr. 116',
    plz: '97074',
    ort: 'Würzburg',
    bundesland: 'Bayern',
    menge: 5,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    notizen: 'bestellt selbst',
    bezugsweg: 'direkt', // Direkt Platzbauer!
  },
  // KW12 - Fulda Region
  {
    name: 'TCB Johannisau Fulda',
    strasse: 'Johannisstr. 47',
    plz: '36041',
    ort: 'Fulda',
    bundesland: 'Hessen',
    menge: 0,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Blau-Weiß Petersberg',
    strasse: 'Am Pfaffenpfad 9',
    plz: '36100',
    ort: 'Petersberg',
    bundesland: 'Hessen',
    menge: 0,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Schwarz-Weiß Niesig',
    strasse: 'Am Sandberg 21',
    plz: '36039',
    ort: 'Fulda',
    bundesland: 'Hessen',
    menge: 0,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC SW Großenlüder',
    strasse: 'St. Georg Str. 23a',
    plz: '36137',
    ort: 'Großenlüder',
    bundesland: 'Hessen',
    menge: 0,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Grün-Weiß Fulda',
    strasse: 'Olympiastr. 10',
    plz: '36041',
    ort: 'Fulda',
    bundesland: 'Hessen',
    menge: 25,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    notizen: 'Sattel',
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Rot-Weiß Fulda',
    strasse: 'Marienstr. 18',
    plz: '36039',
    ort: 'Fulda',
    bundesland: 'Hessen',
    menge: 15,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    notizen: 'vorher KSD anrufen',
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TuSpo Frielendorf Tennis',
    strasse: 'Am Sportplatz 25',
    plz: '34621',
    ort: 'Frielendorf',
    bundesland: 'Hessen',
    menge: 0,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TV Maar Tennis',
    strasse: 'Am Sportfeld 5',
    plz: '36341',
    ort: 'Lauterbach',
    bundesland: 'Hessen',
    menge: 0,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    bezugsweg: 'ueber_platzbauer',
  },
  // Fix 19/20.03.2026
  {
    name: 'TC Bad Zwesten',
    strasse: 'Kasseler Str.',
    plz: '34596',
    ort: 'Bad Zwesten',
    bundesland: 'Hessen',
    menge: 6,
    lieferfensterFrueh: '2026-03-19',
    lieferfensterSpaet: '2026-03-20',
    notizen: 'mit Klein Englis',
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TSV Eintracht Naumburg Tennis',
    strasse: 'Am Sportplatz',
    plz: '34311',
    ort: 'Naumburg',
    bundesland: 'Hessen',
    menge: 10,
    lieferfensterFrueh: '2026-03-19',
    lieferfensterSpaet: '2026-03-20',
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'SV S-W Kleinenglis',
    strasse: 'Bergmannstr. / Sportplatz',
    plz: '34582',
    ort: 'Borken/Kleinenglis',
    bundesland: 'Hessen',
    menge: 7,
    lieferfensterFrueh: '2026-03-19',
    lieferfensterSpaet: '2026-03-20',
    notizen: 'mit Bad Zwesten',
    bezugsweg: 'ueber_platzbauer',
  },
];

// Platzbauer Daten
const PLATZBAUER = {
  name: 'K.S.D Sportplatzbau',
  strasse: '', // Adresse falls bekannt
  plz: '',
  ort: '',
  bundesland: '',
};

// ===================== HELPER FUNKTIONEN =====================

function parseDocument<T>(doc: any): T {
  if (doc?.data && typeof doc.data === 'string') {
    try {
      const parsed = JSON.parse(doc.data) as T;
      return {
        ...parsed,
        id: (parsed as any).id || doc.$id,
      };
    } catch (error) {
      console.warn('⚠️ Konnte Dokument nicht parsen:', error);
    }
  }
  return { id: doc.$id } as T;
}

function toPayload<T extends Record<string, any>>(
  obj: T,
  allowedKeys: string[] = []
): Record<string, any> {
  const payload: Record<string, any> = { data: JSON.stringify(obj) };
  for (const key of allowedKeys) {
    if (key in obj) payload[key] = (obj as any)[key];
  }
  return payload;
}

async function generiereNaechsteKundennummer(): Promise<string> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    let hoechsteNummer = 10000;

    for (const doc of response.documents) {
      const kunde = parseDocument<any>(doc);
      if (kunde.kundennummer) {
        const match = kunde.kundennummer.match(/K?(\d+)/i);
        if (match) {
          const nummer = parseInt(match[1], 10);
          if (nummer > hoechsteNummer) {
            hoechsteNummer = nummer;
          }
        }
      }
    }

    return `K${hoechsteNummer + 1}`;
  } catch (error) {
    console.error('Fehler bei Kundennummer-Generierung:', error);
    return `K${Date.now().toString().slice(-6)}`;
  }
}

async function findeKundeByName(name: string): Promise<any | null> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    for (const doc of response.documents) {
      const kunde = parseDocument<any>(doc);
      if (kunde.name?.toLowerCase() === name.toLowerCase()) {
        return kunde;
      }
    }
    return null;
  } catch (error) {
    console.error('Fehler beim Suchen:', error);
    return null;
  }
}

// ===================== MAIN =====================

async function main() {
  console.log('🚀 Starte K.S.D Import...\n');

  const jetzt = new Date().toISOString();
  const saisonjahr = 2026;
  let platzbauerId: string;

  try {
    // ========== 1. PLATZBAUER ANLEGEN/FINDEN ==========
    console.log('📦 Suche/Erstelle Platzbauer K.S.D Sportplatzbau...');

    const existierenderPlatzbauer = await findeKundeByName(PLATZBAUER.name);

    if (existierenderPlatzbauer) {
      platzbauerId = existierenderPlatzbauer.id;
      console.log(`✅ Platzbauer existiert bereits: ${platzbauerId}`);
    } else {
      const kundennummer = await generiereNaechsteKundennummer();
      const neuerPlatzbauerId = ID.unique();

      const platzbauer = {
        id: neuerPlatzbauerId,
        typ: 'platzbauer',
        name: PLATZBAUER.name,
        kundennummer,
        rechnungsadresse: {
          strasse: PLATZBAUER.strasse,
          plz: PLATZBAUER.plz,
          ort: PLATZBAUER.ort,
          bundesland: PLATZBAUER.bundesland,
        },
        lieferadresse: {
          strasse: PLATZBAUER.strasse,
          plz: PLATZBAUER.plz,
          ort: PLATZBAUER.ort,
          bundesland: PLATZBAUER.bundesland,
        },
        aktiv: true,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      };

      await databases.createDocument(
        DATABASE_ID,
        SAISON_KUNDEN_COLLECTION_ID,
        neuerPlatzbauerId,
        toPayload(platzbauer)
      );

      platzbauerId = neuerPlatzbauerId;
      console.log(`✅ Platzbauer erstellt: ${PLATZBAUER.name} (${kundennummer})`);
    }

    // ========== 2. PLATZBAUERPROJEKT ERSTELLEN ==========
    console.log('\n📦 Suche/Erstelle Platzbauerprojekt für 2026...');

    let platzbauerprojektId: string;
    const existierendeProjekte = await databases.listDocuments(
      DATABASE_ID,
      PLATZBAUER_PROJEKTE_COLLECTION_ID,
      [Query.equal('platzbauerId', platzbauerId), Query.equal('saisonjahr', saisonjahr), Query.limit(10)]
    );

    if (existierendeProjekte.documents.length > 0) {
      const existierend = parseDocument<any>(existierendeProjekte.documents[0]);
      platzbauerprojektId = existierend.id;
      console.log(`✅ Platzbauerprojekt existiert bereits: ${platzbauerprojektId}`);
    } else {
      platzbauerprojektId = ID.unique();
      const platzbauerprojekt = {
        id: platzbauerprojektId,
        platzbauerId,
        platzbauerName: PLATZBAUER.name,
        projektName: `${PLATZBAUER.name} ${saisonjahr}`,
        saisonjahr,
        typ: 'saisonprojekt',
        status: 'angebot',
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      };

      // Erstelle Payload wie im Service
      const payload: Record<string, any> = {
        platzbauerId,
        platzbauerName: PLATZBAUER.name,
        saisonjahr,
        status: 'angebot',
        typ: 'saisonprojekt',
        erstelltAm: jetzt,
        geaendertAm: jetzt,
        data: JSON.stringify({}), // Leeres JSON als Startwert
      };

      await databases.createDocument(
        DATABASE_ID,
        PLATZBAUER_PROJEKTE_COLLECTION_ID,
        platzbauerprojektId,
        payload
      );
      console.log(`✅ Platzbauerprojekt erstellt: ${platzbauerprojektId}`);
    }

    // ========== 3. VEREINE ANLEGEN ==========
    console.log('\n📦 Verarbeite Vereine...\n');

    let erstellteVereine = 0;
    let uebersprungeneVereine = 0;

    for (const verein of VEREINE) {
      console.log(`\n--- ${verein.name} ---`);

      // Prüfe ob Verein existiert
      const existierenderVerein = await findeKundeByName(verein.name);

      let vereinId: string;
      let kundennummer: string;

      if (existierenderVerein) {
        vereinId = existierenderVerein.id;
        kundennummer = existierenderVerein.kundennummer || '';
        console.log(`  ℹ️ Verein existiert bereits: ${vereinId}`);

        // Update Bezugsweg falls nötig
        const updateData: any = {
          standardBezugsweg: verein.bezugsweg,
          geaendertAm: jetzt,
        };

        if (verein.bezugsweg === 'ueber_platzbauer') {
          updateData.standardPlatzbauerId = platzbauerId;
        }

        // Lade aktuellen Kunden und merge
        const aktuellerKunde = existierenderVerein;
        const aktualisierterKunde = {
          ...aktuellerKunde,
          ...updateData,
        };

        await databases.updateDocument(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          vereinId,
          toPayload(aktualisierterKunde)
        );
        console.log(`  ✅ Bezugsweg aktualisiert auf: ${verein.bezugsweg}`);
        uebersprungeneVereine++;
      } else {
        // Neuen Verein erstellen
        kundennummer = await generiereNaechsteKundennummer();
        vereinId = ID.unique();

        const neuerVerein = {
          id: vereinId,
          typ: 'verein',
          name: verein.name,
          kundennummer,
          rechnungsadresse: {
            strasse: verein.strasse,
            plz: verein.plz,
            ort: verein.ort,
            bundesland: verein.bundesland,
          },
          lieferadresse: {
            strasse: verein.strasse,
            plz: verein.plz,
            ort: verein.ort,
            bundesland: verein.bundesland,
          },
          standardBezugsweg: verein.bezugsweg,
          standardPlatzbauerId: verein.bezugsweg === 'ueber_platzbauer' ? platzbauerId : undefined,
          belieferungsart: verein.belieferungsart,
          notizen: verein.notizen,
          aktiv: true,
          erstelltAm: jetzt,
          geaendertAm: jetzt,
        };

        await databases.createDocument(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          vereinId,
          toPayload(neuerVerein)
        );
        console.log(`  ✅ Verein erstellt: ${kundennummer}`);
        erstellteVereine++;
      }

      // ========== 4. SAISONDATEN 2026 ERSTELLEN ==========
      const existierendeSaison = await databases.listDocuments(
        DATABASE_ID,
        SAISON_DATEN_COLLECTION_ID,
        [Query.equal('kundeId', vereinId), Query.equal('saisonjahr', saisonjahr), Query.limit(1)]
      );

      if (existierendeSaison.documents.length > 0) {
        const existierend = parseDocument<any>(existierendeSaison.documents[0]);
        // Update Lieferfenster und Menge
        const aktualisiert = {
          ...existierend,
          angefragteMenge: verein.menge || existierend.angefragteMenge,
          lieferfensterFrueh: verein.lieferfensterFrueh,
          lieferfensterSpaet: verein.lieferfensterSpaet,
          bezugsweg: verein.bezugsweg,
          platzbauerId: verein.bezugsweg === 'ueber_platzbauer' ? platzbauerId : undefined,
          gespraechsnotizen: verein.notizen || existierend.gespraechsnotizen,
          geaendertAm: jetzt,
        };

        await databases.updateDocument(
          DATABASE_ID,
          SAISON_DATEN_COLLECTION_ID,
          existierend.id,
          toPayload(aktualisiert, ['kundeId', 'saisonjahr'])
        );
        console.log(`  ✅ SaisonDaten 2026 aktualisiert`);
      } else {
        const saisonDatenId = ID.unique();
        const saisonDaten = {
          id: saisonDatenId,
          kundeId: vereinId,
          saisonjahr,
          angefragteMenge: verein.menge,
          lieferfensterFrueh: verein.lieferfensterFrueh,
          lieferfensterSpaet: verein.lieferfensterSpaet,
          bezugsweg: verein.bezugsweg,
          platzbauerId: verein.bezugsweg === 'ueber_platzbauer' ? platzbauerId : undefined,
          gespraechsstatus: 'erledigt', // Bereits über KSD bestellt
          bestellabsicht: 'bestellt',
          gespraechsnotizen: verein.notizen,
          erstelltAm: jetzt,
          geaendertAm: jetzt,
        };

        await databases.createDocument(
          DATABASE_ID,
          SAISON_DATEN_COLLECTION_ID,
          saisonDatenId,
          toPayload(saisonDaten, ['kundeId', 'saisonjahr'])
        );
        console.log(`  ✅ SaisonDaten 2026 erstellt: ${verein.menge}t`);
      }

      // ========== 5. BEZIEHUNG ERSTELLEN (nur für ueber_platzbauer) ==========
      if (verein.bezugsweg === 'ueber_platzbauer') {
        const existierendeBeziehung = await databases.listDocuments(
          DATABASE_ID,
          SAISON_BEZIEHUNGEN_COLLECTION_ID,
          [Query.equal('vereinId', vereinId), Query.equal('platzbauerId', platzbauerId), Query.limit(1)]
        );

        if (existierendeBeziehung.documents.length === 0) {
          const beziehungId = ID.unique();
          const beziehung = {
            id: beziehungId,
            vereinId,
            platzbauerId,
            status: 'aktiv',
            erstelltAm: jetzt,
            geaendertAm: jetzt,
          };

          await databases.createDocument(
            DATABASE_ID,
            SAISON_BEZIEHUNGEN_COLLECTION_ID,
            beziehungId,
            toPayload(beziehung, ['vereinId', 'platzbauerId'])
          );
          console.log(`  ✅ Beziehung zu K.S.D erstellt`);
        } else {
          console.log(`  ℹ️ Beziehung existiert bereits`);
        }
      }

      // ========== 6. PROJEKT ERSTELLEN ==========
      // Prüfe ob bereits ein Projekt für diesen Kunden/Jahr existiert
      const existierendeProjekteKunde = await databases.listDocuments(
        DATABASE_ID,
        PROJEKTE_COLLECTION_ID,
        [Query.equal('kundeId', vereinId), Query.limit(100)]
      );

      let projektExistiert = false;
      for (const doc of existierendeProjekteKunde.documents) {
        const projekt = parseDocument<any>(doc);
        if (projekt.saisonjahr === saisonjahr) {
          projektExistiert = true;
          console.log(`  ℹ️ Projekt ${saisonjahr} existiert bereits`);
          break;
        }
      }

      if (!projektExistiert && verein.menge > 0) {
        const projektId = ID.unique();
        const projektDaten = {
          id: projektId,
          projektName: `${verein.name} ${saisonjahr}`,
          kundeId: vereinId,
          kundenname: verein.name,
          kundennummer,
          kundenstrasse: verein.strasse,
          kundenPlzOrt: `${verein.plz} ${verein.ort}`,
          saisonjahr,
          status: 'angebot',
          angefragteMenge: verein.menge,
          bezugsweg: verein.bezugsweg,
          platzbauerId: verein.bezugsweg === 'ueber_platzbauer' ? platzbauerId : undefined,
          istPlatzbauerprojekt: verein.bezugsweg === 'ueber_platzbauer',
          zugeordnetesPlatzbauerprojektId: verein.bezugsweg === 'ueber_platzbauer' ? platzbauerprojektId : undefined,
          lieferadresse: {
            strasse: verein.strasse,
            plz: verein.plz,
            ort: verein.ort,
          },
          notizen: verein.notizen,
          erstelltAm: jetzt,
          geaendertAm: jetzt,
        };

        // Erstelle Dokument wie im projektService
        const projektPayload = {
          projektName: projektDaten.projektName,
          kundeId: projektDaten.kundeId,
          kundenname: projektDaten.kundenname,
          saisonjahr: projektDaten.saisonjahr,
          status: projektDaten.status,
          erstelltAm: jetzt,
          geaendertAm: jetzt,
          data: JSON.stringify(projektDaten),
        };

        await databases.createDocument(
          DATABASE_ID,
          PROJEKTE_COLLECTION_ID,
          projektId,
          projektPayload
        );
        console.log(`  ✅ Projekt erstellt: ${verein.name} ${saisonjahr}`);

        // ========== 7. PROJEKT-ZUORDNUNG ERSTELLEN ==========
        if (verein.bezugsweg === 'ueber_platzbauer') {
          const zuordnungId = ID.unique();
          const zuordnungDaten = {
            id: zuordnungId,
            vereinsProjektId: projektId,
            platzbauerprojektId: platzbauerprojektId,
            position: erstellteVereine + 1,
            erstelltAm: jetzt,
          };

          // Erstelle Payload wie im Service
          const zuordnungPayload = {
            vereinsProjektId: zuordnungDaten.vereinsProjektId,
            platzbauerprojektId: zuordnungDaten.platzbauerprojektId,
            position: zuordnungDaten.position,
            erstelltAm: zuordnungDaten.erstelltAm,
            data: JSON.stringify(zuordnungDaten),
          };

          await databases.createDocument(
            DATABASE_ID,
            PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
            zuordnungId,
            zuordnungPayload
          );
          console.log(`  ✅ Projekt-Zuordnung zu Platzbauerprojekt erstellt`);
        }
      }

      // Kleine Pause um Rate-Limiting zu vermeiden
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(50));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(50));
    console.log(`✅ Platzbauer: K.S.D Sportplatzbau (${platzbauerId})`);
    console.log(`✅ Platzbauerprojekt 2026: ${platzbauerprojektId}`);
    console.log(`✅ Neue Vereine erstellt: ${erstellteVereine}`);
    console.log(`✅ Bestehende Vereine aktualisiert: ${uebersprungeneVereine}`);
    console.log(`✅ Gesamt verarbeitet: ${VEREINE.length}`);
    console.log('\n🎉 Import abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler beim Import:', error);
    process.exit(1);
  }
}

main();
