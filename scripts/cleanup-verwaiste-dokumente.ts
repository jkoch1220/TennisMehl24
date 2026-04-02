/**
 * Cleanup: Verwaiste Dokumente löschen
 *
 * Löscht Dokumente aus bestellabwicklung_dokumente, deren zugehöriges Projekt
 * nicht mehr existiert.
 *
 * Ausführen mit: npx tsx scripts/cleanup-verwaiste-dokumente.ts
 * Dry-Run:       npx tsx scripts/cleanup-verwaiste-dokumente.ts --dry-run
 */

import { Client, Databases, Query, Storage } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE_COLLECTION_ID = 'projekte';
const DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';
const DOKUMENTE_BUCKET_ID = 'bestellabwicklung_dateien';

interface Dokument {
  $id: string;
  projektId: string;
  dokumentTyp: string;
  dokumentNummer?: string;
  dateiId?: string;
  $createdAt: string;
}

let client: Client;
let databases: Databases;
let storage: Storage;

function initClient() {
  client = new Client();
  client
    .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.VITE_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.VITE_APPWRITE_API_KEY || '');
  databases = new Databases(client);
  storage = new Storage(client);
}

/**
 * Lädt alle Dokumente aus der Datenbank
 */
async function ladeAlleDokumente(): Promise<Dokument[]> {
  const alleDokumente: Dokument[] = [];
  let offset = 0;
  const limit = 100;

  console.log('📄 Lade alle Dokumente...');

  while (true) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      DOKUMENTE_COLLECTION_ID,
      [
        Query.limit(limit),
        Query.offset(offset),
      ]
    );

    alleDokumente.push(...(response.documents as unknown as Dokument[]));

    if (response.documents.length < limit) {
      break;
    }
    offset += limit;
  }

  console.log(`   ${alleDokumente.length} Dokumente geladen`);
  return alleDokumente;
}

/**
 * Lädt alle Projekt-IDs
 */
async function ladeProjektIds(): Promise<Set<string>> {
  const projektIds = new Set<string>();
  let offset = 0;
  const limit = 100;

  console.log('📁 Lade alle Projekt-IDs...');

  while (true) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      PROJEKTE_COLLECTION_ID,
      [
        Query.limit(limit),
        Query.offset(offset),
        Query.select(['$id']), // Nur ID laden für Performance
      ]
    );

    for (const doc of response.documents) {
      projektIds.add(doc.$id);
    }

    if (response.documents.length < limit) {
      break;
    }
    offset += limit;
  }

  console.log(`   ${projektIds.size} Projekte gefunden`);
  return projektIds;
}

/**
 * Hauptbereinigung
 */
async function cleanup(dryRun: boolean) {
  console.log('\n🧹 Verwaiste Dokumente Cleanup');
  console.log('================================\n');

  if (dryRun) {
    console.log('⚠️  DRY-RUN MODUS - Keine Löschungen werden durchgeführt\n');
  }

  initClient();

  // Lade alle Daten
  const dokumente = await ladeAlleDokumente();
  const projektIds = await ladeProjektIds();

  // Finde verwaiste Dokumente
  const verwaist: Dokument[] = [];
  for (const dok of dokumente) {
    if (!dok.projektId || !projektIds.has(dok.projektId)) {
      verwaist.push(dok);
    }
  }

  console.log(`\n🔍 ${verwaist.length} verwaiste Dokumente gefunden\n`);

  if (verwaist.length === 0) {
    console.log('✅ Keine verwaisten Dokumente vorhanden!\n');
    return;
  }

  // Gruppiere nach Projekt-ID für Übersicht
  const nachProjekt = new Map<string, Dokument[]>();
  for (const dok of verwaist) {
    const key = dok.projektId || 'KEINE_PROJEKT_ID';
    const existing = nachProjekt.get(key) || [];
    existing.push(dok);
    nachProjekt.set(key, existing);
  }

  console.log('📋 Verwaiste Dokumente nach Projekt:\n');
  for (const [projektId, docs] of nachProjekt) {
    console.log(`   Projekt ${projektId}: ${docs.length} Dokumente`);
    for (const dok of docs.slice(0, 3)) {
      console.log(`      - ${dok.dokumentTyp} ${dok.dokumentNummer || ''} (${dok.$createdAt.split('T')[0]})`);
    }
    if (docs.length > 3) {
      console.log(`      ... und ${docs.length - 3} weitere`);
    }
  }

  // Statistik
  const statistik = {
    dokumenteGeloescht: 0,
    dateienGeloescht: 0,
    fehler: 0,
  };

  if (!dryRun) {
    console.log('\n🗑️  Lösche verwaiste Dokumente...\n');

    for (const dok of verwaist) {
      try {
        // Erst Datei aus Storage löschen (wenn vorhanden)
        if (dok.dateiId) {
          try {
            await storage.deleteFile(DOKUMENTE_BUCKET_ID, dok.dateiId);
            statistik.dateienGeloescht++;
          } catch (fileError: any) {
            // Datei existiert vielleicht nicht mehr - ignorieren
            if (fileError.code !== 404) {
              console.warn(`   ⚠️ Datei ${dok.dateiId} konnte nicht gelöscht werden`);
            }
          }
        }

        // Dann Dokument-Eintrag löschen
        await databases.deleteDocument(
          DATABASE_ID,
          DOKUMENTE_COLLECTION_ID,
          dok.$id
        );
        statistik.dokumenteGeloescht++;

        if (statistik.dokumenteGeloescht % 10 === 0) {
          console.log(`   ${statistik.dokumenteGeloescht} / ${verwaist.length} gelöscht...`);
        }

        // Rate limiting
        if (statistik.dokumenteGeloescht % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Fehler bei Dokument ${dok.$id}:`, error);
        statistik.fehler++;
      }
    }
  }

  // Zusammenfassung
  console.log('\n================================');
  console.log('📊 ZUSAMMENFASSUNG\n');
  console.log(`   Verwaiste Dokumente:  ${verwaist.length}`);
  console.log(`   Gelöschte Dokumente:  ${dryRun ? '(Dry-Run)' : statistik.dokumenteGeloescht}`);
  console.log(`   Gelöschte Dateien:    ${dryRun ? '(Dry-Run)' : statistik.dateienGeloescht}`);
  console.log(`   Fehler:               ${statistik.fehler}`);

  if (dryRun) {
    console.log('\n💡 Führe ohne --dry-run aus um die Dokumente tatsächlich zu löschen.');
  }

  console.log('\n✅ Cleanup abgeschlossen!\n');
}

// Hauptprogramm
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

cleanup(dryRun).catch(console.error);
