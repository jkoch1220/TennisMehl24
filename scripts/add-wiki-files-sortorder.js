/**
 * Fügt der Collection `wiki_files` ein Integer-Attribut `sortOrder` hinzu,
 * damit Dateianhänge pro Wiki-Seite per Drag & Drop sortiert werden können.
 *
 * Idempotent: existiert das Attribut bereits, passiert nichts.
 *
 * Ausführen mit: node scripts/add-wiki-files-sortorder.js
 */

import dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const DATABASE_ID = 'tennismehl24_db';
const WIKI_FILES_COLLECTION_ID = 'wiki_files';
const ATTRIBUTE_KEY = 'sortOrder';

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT / _PROJECT_ID / _API_KEY)!');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

async function attributeExists(key) {
  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${WIKI_FILES_COLLECTION_ID}/attributes/${key}`,
    { method: 'GET', headers }
  );
  return res.ok;
}

async function createIntegerAttribute(key) {
  console.log(`📝 Erstelle Integer-Attribut: ${key}...`);

  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${WIKI_FILES_COLLECTION_ID}/attributes/integer`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key,
        required: false,
        min: 0,
        max: 1000000,
        default: 0,
        array: false,
      }),
    }
  );

  if (res.ok) {
    console.log(`✅ Attribut erstellt: ${key}`);
    return true;
  }

  const error = await res.json().catch(() => ({}));
  console.error(`❌ Fehler beim Erstellen von ${key}:`, error.message || res.status);
  return false;
}

async function main() {
  console.log('🔧 wiki_files: sortOrder-Attribut\n');
  console.log(`Endpoint:   ${endpoint}`);
  console.log(`Collection: ${WIKI_FILES_COLLECTION_ID}\n`);

  if (await attributeExists(ATTRIBUTE_KEY)) {
    console.log(`✅ Attribut "${ATTRIBUTE_KEY}" existiert bereits – nichts zu tun.`);
    return;
  }

  const created = await createIntegerAttribute(ATTRIBUTE_KEY);
  if (!created) {
    console.error('❌ Migration fehlgeschlagen.');
    process.exit(1);
  }

  console.log('\n✨ Fertig! Dateien können jetzt eine Sortierreihenfolge speichern.');
}

main().catch((err) => {
  console.error('❌ Unerwarteter Fehler:', err);
  process.exit(1);
});
