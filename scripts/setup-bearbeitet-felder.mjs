/**
 * Setup: "Zuletzt bearbeitet von"-Felder an High-Value-Collections (idempotent)
 * + Fulltext-Index auf audit_log.summary (für die Volltextsuche im Audit-Log-Tool).
 *
 * Felder (String, wie in `roles`): erstelltVon (User-ID), bearbeitetVon (User-ID),
 * bearbeitetVonName (Anzeigename), bearbeitetAm (ISO-Zeitstempel).
 *
 * Collections:
 *  - projekte                    (erstelltVon existiert bereits)
 *  - bestellabwicklung_dokumente
 *  - stammdaten
 * NICHT: kreditoren/offene_rechnungen/debitoren_metadaten (JSON-Blob-Muster —
 * die Stempel liegen dort im data-JSON), chat_nachrichten (hat erstelltVon).
 *
 * Aufruf:  node scripts/setup-bearbeitet-felder.mjs [--dry-run]
 */
import { readFileSync } from 'fs';
import { Client, Databases } from 'node-appwrite';

const DRY_RUN = process.argv.includes('--dry-run');

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = env.APPWRITE_API_KEY;
const DB = 'tennismehl24_db';

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen in .env gesetzt sein');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new Databases(client);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLLECTIONS = ['projekte', 'bestellabwicklung_dokumente', 'stammdaten'];
const FELDER = [
  ['erstelltVon', 255],
  ['bearbeitetVon', 255],
  ['bearbeitetVonName', 255],
  ['bearbeitetAm', 50],
];

async function ensureStringAttr(coll, key, size) {
  const attrs = await db.listAttributes(DB, coll);
  if (attrs.attributes.some((a) => a.key === key)) {
    console.log(`OK  ${coll}.${key} existiert`);
    return false;
  }
  if (DRY_RUN) {
    console.log(`DRY ${coll}.${key} würde angelegt (string, ${size})`);
    return false;
  }
  await db.createStringAttribute(DB, coll, key, size, false);
  console.log(`NEW ${coll}.${key} angelegt`);
  return true;
}

async function ensureFulltextIndex(coll, key, attribute) {
  const indexes = await db.listIndexes(DB, coll);
  if (indexes.indexes.some((i) => i.key === key)) {
    console.log(`OK  Index ${coll}.${key} existiert`);
    return;
  }
  if (DRY_RUN) {
    console.log(`DRY Fulltext-Index ${coll}.${key} auf [${attribute}] würde angelegt`);
    return;
  }
  await db.createIndex(DB, coll, key, 'fulltext', [attribute]);
  console.log(`NEW Fulltext-Index ${coll}.${key} angelegt`);
}

async function main() {
  console.log(`🚀 Setup bearbeitetVon-Felder ${DRY_RUN ? '(DRY-RUN — keine Änderungen)' : ''}\n`);

  let neuAngelegt = false;
  for (const coll of COLLECTIONS) {
    console.log(`— ${coll} —`);
    for (const [key, size] of FELDER) {
      neuAngelegt = (await ensureStringAttr(coll, key, size)) || neuAngelegt;
    }
  }

  if (neuAngelegt) {
    // Appwrite legt Attribute asynchron an — kurz warten, bis alle 'available' sind
    console.log('\n⏳ Warte auf Attribut-Verfügbarkeit…');
    await sleep(3000);
  }

  console.log('\n— audit_log Volltextsuche —');
  await ensureFulltextIndex('audit_log', 'idx_summary_fulltext', 'summary');

  console.log(`\n✅ Fertig ${DRY_RUN ? '(Dry-Run — nichts geändert)' : ''}`);
}

main().catch((e) => {
  console.error('❌ Setup fehlgeschlagen:', e);
  process.exit(1);
});
