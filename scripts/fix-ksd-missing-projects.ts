/**
 * Erstelle fehlende Projekte und Zuordnungen für K.S.D Vereine
 * Führe aus mit: npx tsx scripts/fix-ksd-missing-projects.ts
 */

import { Client, Databases, Query, ID } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.VITE_APPWRITE_API_KEY!);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';
const SAISON_DATEN_COLLECTION_ID = 'saison_daten';
const PROJEKTE_COLLECTION_ID = 'projekte';
const PROJEKT_ZUORDNUNGEN_COLLECTION_ID = 'projekt_zuordnungen';

const KSD_PLATZBAUER_ID = '6938564f002e3348542c';
const KSD_PLATZBAUERPROJEKT_ID = '696f4ccd0001faedce54';

// Vereine ohne Projekt
const VEREINE_OHNE_PROJEKT = [
  { id: '699340820038e8892ce7', name: 'TCB Johannisau Fulda' },
  { id: '69934085002b67a8c3f2', name: 'TC Blau-Weiß Petersberg' },
  { id: '699340880026a79972ea', name: 'TC Schwarz-Weiß Niesig' },
  { id: '6993408b0022ede7f54f', name: 'TC SW Großenlüder' },
  { id: '699340940020caa59505', name: 'TuSpo Frielendorf Tennis' },
  { id: '6993409700153870367c', name: 'TV Maar Tennis' },
];

function parseDocument<T>(doc: any): T {
  if (doc?.data && typeof doc.data === 'string') {
    try {
      return { ...JSON.parse(doc.data), id: doc.$id, $id: doc.$id };
    } catch {
      return { id: doc.$id, $id: doc.$id } as T;
    }
  }
  return { id: doc.$id, $id: doc.$id } as T;
}

async function main() {
  console.log('🔧 Erstelle fehlende Projekte und Zuordnungen...\n');
  const jetzt = new Date().toISOString();

  try {
    // Hole bestehende Zuordnungen für Position
    const bestehendeZuordnungen = await databases.listDocuments(
      DATABASE_ID,
      PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
      [Query.equal('platzbauerprojektId', KSD_PLATZBAUERPROJEKT_ID), Query.limit(100)]
    );
    let naechstePosition = bestehendeZuordnungen.documents.length + 1;

    for (const verein of VEREINE_OHNE_PROJEKT) {
      console.log(`\n📌 ${verein.name}`);

      // 1. Projekt erstellen
      const projektId = ID.unique();
      const projektDaten = {
        projektName: `${verein.name} 2026`,
        kundeId: verein.id,
        kundenname: verein.name,
        saisonjahr: 2026,
        status: 'angebot',
        platzbauerId: KSD_PLATZBAUER_ID,
        zugeordnetesPlatzbauerprojektId: KSD_PLATZBAUERPROJEKT_ID,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
        positionen: [],
        angefragteMenge: 0,
        lieferfensterFrueh: null,
        lieferfensterSpaet: null,
      };

      await databases.createDocument(
        DATABASE_ID,
        PROJEKTE_COLLECTION_ID,
        projektId,
        {
          projektName: projektDaten.projektName,
          kundeId: projektDaten.kundeId,
          kundenname: projektDaten.kundenname,
          saisonjahr: projektDaten.saisonjahr,
          status: projektDaten.status,
          erstelltAm: jetzt,
          geaendertAm: jetzt,
          data: JSON.stringify(projektDaten),
        }
      );
      console.log(`   ✅ Projekt erstellt: ${projektId}`);

      // 2. Zuordnung erstellen
      const zuordnungId = ID.unique();
      const zuordnungDaten = {
        vereinsProjektId: projektId,
        platzbauerprojektId: KSD_PLATZBAUERPROJEKT_ID,
        position: naechstePosition,
        erstelltAm: jetzt,
      };

      await databases.createDocument(
        DATABASE_ID,
        PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
        zuordnungId,
        {
          vereinsProjektId: projektId,
          platzbauerprojektId: KSD_PLATZBAUERPROJEKT_ID,
          position: naechstePosition,
          erstelltAm: jetzt,
          data: JSON.stringify(zuordnungDaten),
        }
      );
      console.log(`   ✅ Zuordnung erstellt: Position ${naechstePosition}`);

      naechstePosition++;
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(50));
    console.log(`✅ ${VEREINE_OHNE_PROJEKT.length} Projekte erstellt`);
    console.log(`✅ ${VEREINE_OHNE_PROJEKT.length} Zuordnungen erstellt`);
    console.log('\n🎉 Fertig!');

  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
