/**
 * Script zum Beheben des Wiki Content Feld-Größenlimits
 *
 * Das content-Feld wurde ursprünglich mit 1000 Zeichen erstellt,
 * muss aber 100000 Zeichen sein.
 *
 * ACHTUNG: Bestehende Wiki-Seiten mit Inhalt werden gelöscht!
 * Führe vorher ein Backup durch falls nötig.
 *
 * Ausführen mit: node scripts/fix-wiki-content-size.js
 */

import dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const DATABASE_ID = 'tennismehl24_db';
const WIKI_PAGES_COLLECTION_ID = 'wiki_pages';

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

async function deleteAttribute(key) {
  console.log(`🗑️  Lösche Attribut: ${key}...`);

  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${WIKI_PAGES_COLLECTION_ID}/attributes/${key}`,
    { method: 'DELETE', headers }
  );

  if (res.ok || res.status === 404) {
    console.log(`✅ Attribut gelöscht: ${key}`);
    return true;
  }

  const error = await res.json().catch(() => ({}));
  console.error(`❌ Fehler beim Löschen von ${key}:`, error.message || res.status);
  return false;
}

async function waitForDeletion(key, maxAttempts = 20) {
  console.log(`⏳ Warte auf vollständige Löschung von ${key}...`);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const res = await fetch(
      `${endpoint}/databases/${DATABASE_ID}/collections/${WIKI_PAGES_COLLECTION_ID}/attributes/${key}`,
      { method: 'GET', headers }
    );

    if (res.status === 404) {
      console.log(`✅ Attribut ${key} wurde vollständig gelöscht`);
      return true;
    }

    const data = await res.json().catch(() => ({}));
    console.log(`   Status: ${data.status || 'unbekannt'} (Versuch ${i + 1}/${maxAttempts})`);
  }

  console.error(`❌ Timeout beim Warten auf Löschung von ${key}`);
  return false;
}

async function createAttribute(key, size) {
  console.log(`📝 Erstelle Attribut: ${key} (${size} Zeichen)...`);

  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${WIKI_PAGES_COLLECTION_ID}/attributes/string`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key,
        size,
        required: false,
        default: null,
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
  console.log('🔧 Wiki Content-Feld Migration\n');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Collection: ${WIKI_PAGES_COLLECTION_ID}\n`);

  // 1. content-Attribut löschen
  const deleted = await deleteAttribute('content');
  if (!deleted) {
    console.log('⚠️  Attribut konnte nicht gelöscht werden oder existiert nicht.');
  }

  // 2. Warte auf vollständige Löschung
  const ready = await waitForDeletion('content');
  if (!ready) {
    console.error('❌ Migration abgebrochen - Attribut wurde nicht rechtzeitig gelöscht.');
    process.exit(1);
  }

  // 3. content-Attribut mit korrekter Größe neu erstellen
  const created = await createAttribute('content', 100000);
  if (!created) {
    console.error('❌ Migration fehlgeschlagen - Attribut konnte nicht erstellt werden.');
    process.exit(1);
  }

  console.log('\n✨ Migration erfolgreich abgeschlossen!');
  console.log('   Das content-Feld akzeptiert jetzt bis zu 100.000 Zeichen.');
}

main().catch(err => {
  console.error('❌ Unerwarteter Fehler:', err);
  process.exit(1);
});
