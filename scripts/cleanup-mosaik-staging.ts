/**
 * Cleanup-Script für die Mosaik-Migration Staging-Collection.
 * Leert `migration_kandidaten` komplett — `saison_kunden` und alle anderen
 * Collections werden NICHT angefasst.
 *
 * Idempotent: kann beliebig oft ausgeführt werden.
 *
 * Führe aus mit: npx tsx scripts/cleanup-mosaik-staging.ts
 *   --dry-run    zeigt nur, was gelöscht würde
 *   --yes        ohne Rückfrage durchlaufen
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'migration_kandidaten';

const DRY_RUN = process.argv.includes('--dry-run');
const YES = process.argv.includes('--yes');
const BATCH = 25;
const PAUSE_MS = 200;

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirm(frage: string): Promise<boolean> {
  if (YES) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${frage} [y/N] `, (a) => {
      rl.close();
      resolve(a.trim().toLowerCase() === 'y' || a.trim().toLowerCase() === 'yes');
    });
  });
}

async function main() {
  console.log('🧹 Cleanup migration_kandidaten');
  console.log('='.repeat(50));
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Database: ${DATABASE_ID}`);
  console.log(`Collection: ${COLLECTION_ID}`);
  console.log(`Modus: ${DRY_RUN ? 'TROCKENDURCHLAUF (nichts wird gelöscht)' : 'ECHT'}`);
  console.log('='.repeat(50));

  // Erst zählen, was drin ist
  let gesamt = 0;
  let offset = 0;
  const ids: string[] = [];
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Query.limit(100),
      Query.offset(offset),
    ]);
    for (const d of res.documents) ids.push(d.$id);
    gesamt += res.documents.length;
    if (res.documents.length < 100) break;
    offset += 100;
  }

  console.log(`\n📊 ${gesamt} Dokumente gefunden.`);
  if (gesamt === 0) {
    console.log('✨ Nichts zu tun — Collection ist bereits leer.');
    return;
  }

  if (DRY_RUN) {
    console.log('🔍 Trockendurchlauf — keine Schreibvorgänge.');
    console.log(`Würde ${gesamt} Dokumente löschen.`);
    return;
  }

  const ok = await confirm(`\n⚠ Wirklich ${gesamt} Dokumente unwiderruflich löschen?`);
  if (!ok) {
    console.log('Abgebrochen.');
    return;
  }

  console.log(`\n🗑 Lösche in Batches von ${BATCH}, mit ${PAUSE_MS}ms Pause …`);
  let geloescht = 0;
  let fehler = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const ergebnisse = await Promise.allSettled(
      batch.map((id) => databases.deleteDocument(DATABASE_ID, COLLECTION_ID, id))
    );
    for (const r of ergebnisse) {
      if (r.status === 'fulfilled') geloescht++;
      else fehler++;
    }
    process.stdout.write(`\r   ${geloescht}/${ids.length} gelöscht, ${fehler} Fehler …`);
    if (i + BATCH < ids.length) await pause(PAUSE_MS);
  }
  console.log('');
  console.log(`\n✅ Fertig: ${geloescht} gelöscht, ${fehler} Fehler.`);
}

main().catch((e) => {
  console.error('\n❌ Cleanup fehlgeschlagen:', e);
  process.exit(1);
});
