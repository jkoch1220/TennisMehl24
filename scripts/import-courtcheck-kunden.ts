/**
 * Import-Script für Court Check Kunden
 * Führe aus mit: npx tsx scripts/import-courtcheck-kunden.ts
 */

import { Client, Databases, ID, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY');
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
  abdeckplane?: boolean;
  bezugsweg: 'ueber_platzbauer' | 'direkt';
}

// Kalenderwoche zu Datum-Range (2026)
const KW_DATEN: Record<string, { frueh: string; spaet: string }> = {
  'KW11': { frueh: '2026-03-09', spaet: '2026-03-15' },
  'KW12': { frueh: '2026-03-16', spaet: '2026-03-22' },
  'KW13': { frueh: '2026-03-23', spaet: '2026-03-29' },
};

const VEREINE: VereinDaten[] = [
  // KW 13
  {
    name: 'TC Bischberg',
    strasse: 'Dorfseestraße',
    plz: '96120',
    ort: 'Bischberg',
    bundesland: 'Bayern',
    menge: 4,
    lieferfensterFrueh: KW_DATEN['KW13'].frueh,
    lieferfensterSpaet: KW_DATEN['KW13'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Utting',
    strasse: 'Im Freizeitgelände 1',
    plz: '86919',
    ort: 'Utting am Ammersee',
    bundesland: 'Bayern',
    menge: 10,
    lieferfensterFrueh: KW_DATEN['KW13'].frueh,
    lieferfensterSpaet: KW_DATEN['KW13'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
  // KW 12
  {
    name: 'TSV Oberpframmern',
    strasse: 'Kreuzer Weg 2',
    plz: '85667',
    ort: 'Oberpframmern',
    bundesland: 'Bayern',
    menge: 12,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'ATSV Kirchseeon',
    strasse: 'Falkenberg 24',
    plz: '85665',
    ort: 'Moosach',
    bundesland: 'Bayern',
    menge: 10,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'Cosima Indoor Tennis',
    strasse: 'Cosimastraße 284',
    plz: '81927',
    ort: 'München',
    bundesland: 'Bayern',
    menge: 8,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'SV Odelzhausen eV',
    strasse: 'Am Sportpl. 1',
    plz: '85235',
    ort: 'Odelzhausen',
    bundesland: 'Bayern',
    menge: 8,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TSV Offingen',
    strasse: 'Am Sportpl. 11',
    plz: '89362',
    ort: 'Offingen',
    bundesland: 'Bayern',
    menge: 12,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Mertingen',
    strasse: 'Hagenmühlenweg 2',
    plz: '86690',
    ort: 'Mertingen',
    bundesland: 'Bayern',
    menge: 8,
    lieferfensterFrueh: KW_DATEN['KW12'].frueh,
    lieferfensterSpaet: KW_DATEN['KW12'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
  // KW 11
  {
    name: 'TC Röthenbach/Altdorf',
    strasse: 'Am Ziegelholz',
    plz: '90518',
    ort: 'Altdorf bei Nürnberg',
    bundesland: 'Bayern',
    menge: 8,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    abdeckplane: false,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'SV Schwaig/Nürnberg',
    strasse: 'Mittelbügweg 11',
    plz: '90571',
    ort: 'Schwaig bei Nürnberg',
    bundesland: 'Bayern',
    menge: 10,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
  {
    name: 'TC Froschhausen',
    strasse: 'An der Lache 42',
    plz: '63500',
    ort: 'Seligenstadt',
    bundesland: 'Hessen',
    menge: 11,
    lieferfensterFrueh: KW_DATEN['KW11'].frueh,
    lieferfensterSpaet: KW_DATEN['KW11'].spaet,
    abdeckplane: true,
    bezugsweg: 'ueber_platzbauer',
  },
];

// Platzbauer Daten
const PLATZBAUER = {
  name: 'Court Check',
  strasse: '',
  plz: '',
  ort: '',
  bundesland: '',
  email: 'info@court-check.de',
  telefon: '0176 80859932',
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
  console.log('🚀 Starte Court Check Import...\n');

  const jetzt = new Date().toISOString();
  const saisonjahr = 2026;
  let platzbauerId: string;

  try {
    // ========== 1. PLATZBAUER SUCHEN/ANLEGEN ==========
    console.log('📦 Suche/Erstelle Platzbauer Court Check...');

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
        email: PLATZBAUER.email,
        telefon: PLATZBAUER.telefon,
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

      const payload: Record<string, any> = {
        platzbauerId,
        platzbauerName: PLATZBAUER.name,
        saisonjahr,
        status: 'angebot',
        typ: 'saisonprojekt',
        erstelltAm: jetzt,
        geaendertAm: jetzt,
        data: JSON.stringify({}),
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

        // Update Bezugsweg und Platzbauer
        const aktuellerKunde = existierenderVerein;
        const aktualisierterKunde = {
          ...aktuellerKunde,
          standardBezugsweg: verein.bezugsweg,
          standardPlatzbauerId: platzbauerId,
          geaendertAm: jetzt,
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
          standardPlatzbauerId: platzbauerId,
          notizen: verein.abdeckplane ? 'Abdeckplane inkl.' : undefined,
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
        const aktualisiert = {
          ...existierend,
          angefragteMenge: verein.menge || existierend.angefragteMenge,
          lieferfensterFrueh: verein.lieferfensterFrueh,
          lieferfensterSpaet: verein.lieferfensterSpaet,
          bezugsweg: verein.bezugsweg,
          platzbauerId: platzbauerId,
          gespraechsnotizen: verein.abdeckplane ? 'Abdeckplane inkl.' : existierend.gespraechsnotizen,
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
          platzbauerId: platzbauerId,
          gespraechsstatus: 'erledigt',
          bestellabsicht: 'bestellt',
          gespraechsnotizen: verein.abdeckplane ? 'Abdeckplane inkl.' : undefined,
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

      // ========== 5. BEZIEHUNG ERSTELLEN ==========
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
        console.log(`  ✅ Beziehung zu Court Check erstellt`);
      } else {
        console.log(`  ℹ️ Beziehung existiert bereits`);
      }

      // ========== 6. PROJEKT ERSTELLEN ==========
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
          status: 'auftragsbestaetigung', // Direkt als bestätigt
          angefragteMenge: verein.menge,
          bezugsweg: verein.bezugsweg,
          platzbauerId: platzbauerId,
          istPlatzbauerprojekt: true,
          zugeordnetesPlatzbauerprojektId: platzbauerprojektId,
          lieferadresse: {
            strasse: verein.strasse,
            plz: verein.plz,
            ort: verein.ort,
          },
          lieferfensterFrueh: verein.lieferfensterFrueh,
          lieferfensterSpaet: verein.lieferfensterSpaet,
          notizen: verein.abdeckplane ? 'Abdeckplane inkl.' : undefined,
          erstelltAm: jetzt,
          geaendertAm: jetzt,
        };

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
        const zuordnungId = ID.unique();
        const zuordnungPayload = {
          vereinsProjektId: projektId,
          platzbauerprojektId: platzbauerprojektId,
          position: erstellteVereine + 1,
          erstelltAm: jetzt,
          data: JSON.stringify({
            id: zuordnungId,
            vereinsProjektId: projektId,
            platzbauerprojektId: platzbauerprojektId,
            position: erstellteVereine + 1,
            erstelltAm: jetzt,
          }),
        };

        await databases.createDocument(
          DATABASE_ID,
          PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
          zuordnungId,
          zuordnungPayload
        );
        console.log(`  ✅ Projekt-Zuordnung zu Platzbauerprojekt erstellt`);
      }

      // Kleine Pause um Rate-Limiting zu vermeiden
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(50));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(50));
    console.log(`✅ Platzbauer: Court Check (${platzbauerId})`);
    console.log(`✅ Platzbauerprojekt 2026: ${platzbauerprojektId}`);
    console.log(`✅ Neue Vereine erstellt: ${erstellteVereine}`);
    console.log(`✅ Bestehende Vereine aktualisiert: ${uebersprungeneVereine}`);
    console.log(`✅ Gesamt verarbeitet: ${VEREINE.length}`);
    console.log(`\n📦 Vereine mit Abdeckplane: ${VEREINE.filter(v => v.abdeckplane).length}`);
    console.log(`📦 Gesamtmenge: ${VEREINE.reduce((sum, v) => sum + v.menge, 0)} Tonnen`);
    console.log('\n🎉 Import abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler beim Import:', error);
    process.exit(1);
  }
}

main();
