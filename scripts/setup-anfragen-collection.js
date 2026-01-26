/**
 * Script zum Anlegen der Anfragen Collection in Appwrite
 *
 * Führe aus mit: node scripts/setup-anfragen-collection.js
 */

import dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  process.exit(1);
}

const DATABASE_ID = 'tennismehl24_db';
const ANFRAGEN_COLLECTION_ID = 'anfragen';

// Helper für API Calls
async function apiCall(path, method = 'GET', body = null) {
  const url = `${endpoint}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API Error: ${response.status} - ${JSON.stringify(error)}`);
  }

  return response.json();
}

// Collection erstellen
async function createCollection() {
  try {
    console.log('📦 Erstelle anfragen Collection...');

    await apiCall(`/databases/${DATABASE_ID}/collections`, 'POST', {
      collectionId: ANFRAGEN_COLLECTION_ID,
      name: 'Anfragen',
      permissions: [
        'read("users")',
        'create("users")',
        'update("users")',
        'delete("users")'
      ],
      documentSecurity: false,
    });

    console.log('✅ Collection erstellt!');
    return true;
  } catch (error) {
    if (error.message.includes('409') || error.message.includes('already exists')) {
      console.log('⏭️  Collection existiert bereits');
      return true;
    }
    console.error('❌ Fehler:', error.message);
    return false;
  }
}

// Feld erstellen
async function createField(key, type, required = false, defaultValue = null, size = null) {
  try {
    const body = {
      key,
      required,
    };

    let endpoint_suffix;

    switch (type) {
      case 'string':
        endpoint_suffix = 'string';
        body.size = size || 255;
        if (defaultValue !== null) body.default = defaultValue;
        break;
      case 'boolean':
        endpoint_suffix = 'boolean';
        if (defaultValue !== null) body.default = defaultValue;
        break;
      case 'integer':
        endpoint_suffix = 'integer';
        if (defaultValue !== null) body.default = defaultValue;
        break;
      default:
        endpoint_suffix = 'string';
        body.size = size || 255;
    }

    await apiCall(
      `/databases/${DATABASE_ID}/collections/${ANFRAGEN_COLLECTION_ID}/attributes/${endpoint_suffix}`,
      'POST',
      body
    );

    console.log(`   ✅ Feld erstellt: ${key}`);
    return true;
  } catch (error) {
    if (error.message.includes('409') || error.message.includes('already exists')) {
      console.log(`   ⏭️  Feld existiert: ${key}`);
      return true;
    }
    console.error(`   ❌ Fehler bei ${key}:`, error.message);
    return false;
  }
}

// Index erstellen
async function createIndex(key, attributes) {
  try {
    await apiCall(
      `/databases/${DATABASE_ID}/collections/${ANFRAGEN_COLLECTION_ID}/indexes`,
      'POST',
      {
        key,
        type: 'key',
        attributes,
      }
    );

    console.log(`   ✅ Index erstellt: ${key}`);
    return true;
  } catch (error) {
    if (error.message.includes('409') || error.message.includes('already exists')) {
      console.log(`   ⏭️  Index existiert: ${key}`);
      return true;
    }
    console.error(`   ❌ Fehler bei Index ${key}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starte Anfragen Collection Setup...\n');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Database: ${DATABASE_ID}\n`);

  // 1. Collection erstellen
  const collectionCreated = await createCollection();
  if (!collectionCreated) {
    process.exit(1);
  }

  // 2. Felder erstellen
  console.log('\n📝 Erstelle Felder...\n');

  const fields = [
    { key: 'emailBetreff', type: 'string', required: true, size: 500 },
    { key: 'emailAbsender', type: 'string', required: true, size: 255 },
    { key: 'emailDatum', type: 'string', required: true, size: 50 },
    { key: 'emailText', type: 'string', required: true, size: 10000 },
    { key: 'emailHtml', type: 'string', required: false, size: 50000 },
    { key: 'extrahierteDaten', type: 'string', required: false, size: 50000 },
    { key: 'status', type: 'string', required: true, size: 50 },
    { key: 'kundeId', type: 'string', required: false, size: 100 },
    { key: 'projektId', type: 'string', required: false, size: 100 },
    { key: 'angebotVersendetAm', type: 'string', required: false, size: 50 },
    { key: 'bearbeitetVon', type: 'string', required: false, size: 100 },
    { key: 'erstelltAm', type: 'string', required: true, size: 50 },
  ];

  for (const field of fields) {
    await createField(field.key, field.type, field.required, null, field.size);
    // Kurze Pause zwischen Feldererstellungen
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 3. Warte auf Feld-Erstellung
  console.log('\n⏳ Warte auf Feld-Aktivierung (10 Sekunden)...\n');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // 4. Indizes erstellen
  console.log('📇 Erstelle Indizes...\n');

  await createIndex('status_index', ['status']);
  await new Promise(resolve => setTimeout(resolve, 1000));

  await createIndex('emailAbsender_index', ['emailAbsender']);
  await new Promise(resolve => setTimeout(resolve, 1000));

  await createIndex('emailDatum_index', ['emailDatum']);

  console.log('\n✨ Setup abgeschlossen!\n');
}

main().catch(console.error);
