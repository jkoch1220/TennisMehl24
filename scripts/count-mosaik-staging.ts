/**
 * Zählt die Dokumente in `migration_kandidaten` — Diagnose-Hilfe.
 * Führe aus mit: npx tsx scripts/count-mosaik-staging.ts
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'migration_kandidaten';

async function main() {
  // Erste Seite reicht — wenn 0, dann 0
  const erste = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
    Query.limit(1),
  ]);
  if (erste.total !== undefined) {
    console.log(`📊 ${erste.total} Dokumente in migration_kandidaten`);
    return;
  }
  // Fallback: durchpaginieren
  let gesamt = 0;
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Query.limit(100),
      Query.offset(offset),
    ]);
    gesamt += res.documents.length;
    if (res.documents.length < 100) break;
    offset += 100;
  }
  console.log(`📊 ${gesamt} Dokumente in migration_kandidaten (paginiert)`);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
