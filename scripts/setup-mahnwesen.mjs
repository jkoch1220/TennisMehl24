/**
 * Setup-Script für Mahnwesen-Collections und -Felder
 * Erstellt fehlende Felder direkt in Appwrite
 *
 * Ausführen: node scripts/setup-mahnwesen.mjs
 */

import 'dotenv/config';

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;
const databaseId = process.env.VITE_APPWRITE_DATABASE_ID || 'tennismehl24_db';

const STAMMDATEN_COLLECTION_ID = 'stammdaten';
const MAHNWESEN_DOKUMENTE_COLLECTION_ID = 'mahnwesen_dokumente';

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Fehler: Umgebungsvariablen nicht gesetzt!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

async function createField(collectionId, fieldKey, fieldType, options = {}) {
  const body = {
    key: fieldKey,
    required: options.required ?? false,
    default: options.default ?? null,
  };

  if (fieldType === 'string') {
    body.size = options.size ?? 500;
  }

  if (options.array) {
    body.array = true;
  }

  try {
    const response = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${collectionId}/attributes/${fieldType}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );

    if (response.ok) {
      console.log(`✅ Feld erstellt: ${collectionId}.${fieldKey}`);
      return true;
    } else if (response.status === 409) {
      console.log(`ℹ️  Feld existiert bereits: ${collectionId}.${fieldKey}`);
      return false;
    } else {
      const error = await response.json();
      console.error(`❌ Fehler bei ${collectionId}.${fieldKey}:`, error.message);
      return false;
    }
  } catch (error) {
    console.error(`❌ Netzwerkfehler bei ${collectionId}.${fieldKey}:`, error.message);
    return false;
  }
}

async function createIndex(collectionId, indexKey, attributes, type = 'key') {
  try {
    // Prüfen ob Index existiert
    const checkRes = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${collectionId}/indexes`,
      { method: 'GET', headers }
    );

    if (checkRes.ok) {
      const data = await checkRes.json();
      const existing = data.indexes?.find(idx => idx.key === indexKey);
      if (existing) {
        console.log(`ℹ️  Index existiert bereits: ${collectionId}.${indexKey}`);
        return false;
      }
    }

    const response = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${collectionId}/indexes`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          key: indexKey,
          type,
          attributes,
          orders: attributes.map(() => 'ASC'),
        }),
      }
    );

    if (response.ok) {
      console.log(`✅ Index erstellt: ${collectionId}.${indexKey}`);
      return true;
    } else {
      const error = await response.json();
      console.error(`❌ Index-Fehler bei ${collectionId}.${indexKey}:`, error.message);
      return false;
    }
  } catch (error) {
    console.error(`❌ Netzwerkfehler bei Index ${indexKey}:`, error.message);
    return false;
  }
}

async function ensureCollection(collectionId, name) {
  try {
    const checkRes = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${collectionId}`,
      { method: 'GET', headers }
    );

    if (checkRes.ok) {
      console.log(`ℹ️  Collection existiert: ${collectionId}`);
      return true;
    }

    if (checkRes.status === 404) {
      console.log(`📦 Erstelle Collection: ${collectionId} (${name})...`);
      const createRes = await fetch(
        `${endpoint}/databases/${databaseId}/collections`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            collectionId,
            name,
            documentSecurity: false,
            permissions: ['read("users")', 'create("users")', 'update("users")', 'delete("users")'],
          }),
        }
      );

      if (createRes.ok) {
        console.log(`✅ Collection erstellt: ${collectionId}`);
        return true;
      } else {
        const error = await createRes.json();
        console.error(`❌ Collection-Fehler:`, error.message);
        return false;
      }
    }
  } catch (error) {
    console.error(`❌ Netzwerkfehler bei Collection ${collectionId}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starte Mahnwesen Setup...\n');
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Database: ${databaseId}\n`);

  // 1. typ-Feld in Stammdaten anlegen
  console.log('--- STAMMDATEN Collection ---');
  await createField(STAMMDATEN_COLLECTION_ID, 'typ', 'string', { size: 100 });

  // Warte kurz auf Feld-Erstellung
  await new Promise(r => setTimeout(r, 1000));

  await createIndex(STAMMDATEN_COLLECTION_ID, 'typ_index', ['typ']);

  console.log('\n--- MAHNWESEN_DOKUMENTE Collection ---');

  // 2. Mahnwesen Collection sicherstellen
  await ensureCollection(MAHNWESEN_DOKUMENTE_COLLECTION_ID, 'Mahnwesen Dokumente');

  // Warte auf Collection
  await new Promise(r => setTimeout(r, 1000));

  // 3. Alle Felder für Mahnwesen anlegen
  const mahnwesenFelder = [
    { key: 'projektId', type: 'string', options: { size: 100, required: true } },
    { key: 'dokumentTyp', type: 'string', options: { size: 50, required: true } },
    { key: 'dokumentNummer', type: 'string', options: { size: 50, required: true } },
    { key: 'dateiId', type: 'string', options: { size: 100, required: true } },
    { key: 'dateiname', type: 'string', options: { size: 255, required: true } },
    { key: 'betrag', type: 'double', options: { required: true } },
    { key: 'daten', type: 'string', options: { size: 100000, required: true } },
  ];

  for (const feld of mahnwesenFelder) {
    await createField(MAHNWESEN_DOKUMENTE_COLLECTION_ID, feld.key, feld.type, feld.options);
    await new Promise(r => setTimeout(r, 300)); // Kurze Pause zwischen Feldern
  }

  // Warte auf Felder
  await new Promise(r => setTimeout(r, 2000));

  // 4. Indizes für Mahnwesen
  console.log('\n--- Indizes ---');
  await createIndex(MAHNWESEN_DOKUMENTE_COLLECTION_ID, 'projektId_index', ['projektId']);
  await createIndex(MAHNWESEN_DOKUMENTE_COLLECTION_ID, 'dokumentTyp_index', ['dokumentTyp']);
  await createIndex(MAHNWESEN_DOKUMENTE_COLLECTION_ID, 'dokumentNummer_index', ['dokumentNummer']);

  console.log('\n✅ Mahnwesen Setup abgeschlossen!');
  console.log('\nBitte lade die App neu und versuche die Zahlungserinnerung erneut.');
}

main().catch(console.error);
