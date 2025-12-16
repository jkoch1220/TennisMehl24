/**
 * Script zum Erstellen der Kalender-Collection
 * 
 * Führe dieses Script aus mit:
 * node scripts/setup-calendar-collection.js
 */

import dotenv from 'dotenv';

// Lade Umgebungsvariablen aus .env
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und VITE_APPWRITE_API_KEY müssen gesetzt sein!');
  process.exit(1);
}

const DATABASE_ID = 'tennismehl24_db';
const KALENDER_COLLECTION_ID = 'kalender_termine';

const kalenderFields = [
  { key: 'titel', type: 'string', size: 500, required: true },
  { key: 'beschreibung', type: 'string', size: 2000, required: false },
  { key: 'startDatum', type: 'string', size: 50, required: true },
  { key: 'endDatum', type: 'string', size: 50, required: true },
  { key: 'ganztaegig', type: 'boolean', required: false, default: false },
  { key: 'farbe', type: 'string', size: 50, required: false },
  { key: 'ort', type: 'string', size: 500, required: false },
  { key: 'wiederholung', type: 'string', size: 50, required: false },
  { key: 'wiederholungEnde', type: 'string', size: 50, required: false },
  { key: 'erinnerung', type: 'integer', required: false, default: 0 },
  { key: 'erstelltAm', type: 'string', size: 50, required: true },
  { key: 'geaendertAm', type: 'string', size: 50, required: true },
  { key: 'erstelltVon', type: 'string', size: 100, required: false },
  { key: 'data', type: 'string', size: 10000, required: false },
];

async function makeApiRequest(url, method, body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Response-Format': '1.6.0',
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey
  };

  const config = {
    method,
    headers
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
}

async function createAttribute(collectionId, field) {
  const typeMapping = {
    'string': async () => {
      const body = {
        key: field.key,
        size: field.size || 255,
        required: field.required || false
      };
      if (field.default !== undefined) {
        body.default = field.default;
      }
      return makeApiRequest(
        `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/attributes/string`,
        'POST',
        body
      );
    },
    'integer': async () => {
      const body = {
        key: field.key,
        required: field.required || false
      };
      if (field.min !== undefined) body.min = field.min;
      if (field.max !== undefined) body.max = field.max;
      if (field.default !== undefined) body.default = field.default;
      return makeApiRequest(
        `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/attributes/integer`,
        'POST',
        body
      );
    },
    'boolean': async () => {
      const body = {
        key: field.key,
        required: field.required || false
      };
      if (field.default !== undefined) {
        body.default = field.default;
      }
      return makeApiRequest(
        `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/attributes/boolean`,
        'POST',
        body
      );
    }
  };

  return typeMapping[field.type]();
}

async function ensureCollection(id, name) {
  try {
    await makeApiRequest(`${endpoint}/databases/${DATABASE_ID}/collections/${id}`, 'GET');
    console.log(`✓ Collection existiert bereits: ${id}`);
    return false;
  } catch (error) {
    if (error.message.includes('not be found')) {
      try {
        await makeApiRequest(
          `${endpoint}/databases/${DATABASE_ID}/collections`,
          'POST',
          {
            collectionId: id,
            name: name,
            permissions: [
              'read("any")',
              'create("users")',
              'update("users")',
              'delete("users")'
            ]
          }
        );
        console.log(`✓ Collection erstellt: ${id}`);
        return true;
      } catch (createError) {
        console.log(`❌ Fehler beim Erstellen der Collection ${id}:`, createError.message);
        return false;
      }
    } else {
      console.log(`❌ Fehler beim Prüfen der Collection ${id}:`, error.message);
      return false;
    }
  }
}

async function setupKalender() {
  console.log('🚀 Starte Kalender-Collection Setup...');
  console.log('');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project ID: ${projectId}`);
  console.log('');

  try {
    // Collection erstellen oder prüfen
    const isNewCollection = await ensureCollection(KALENDER_COLLECTION_ID, 'Kalender Termine');
    
    if (!isNewCollection) {
      console.log('📝 Collection bereits vorhanden - prüfe Felder...');
    }
    
    console.log('');
    console.log(`📦 Setup für Collection: Kalender Termine (${KALENDER_COLLECTION_ID})`);
    console.log(`   Erstelle ${kalenderFields.length} Felder...`);
    console.log('');

    for (const field of kalenderFields) {
      try {
        await createAttribute(KALENDER_COLLECTION_ID, field);
        console.log(`✓ Feld erstellt: ${field.key}`);
        
        // Kurze Pause zwischen Feldern
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⏭️  Feld existiert bereits: ${field.key}`);
        } else {
          console.log(`❌ Fehler beim Erstellen von ${field.key}:`, error.message);
        }
      }
    }

    console.log('');
    console.log('✨ Kalender-Setup abgeschlossen!');
    console.log('');
    console.log('⚠️  WICHTIG: Warte einige Sekunden, bis Appwrite die Felder vollständig erstellt hat.');
    console.log('   Danach kannst du die Kalender-App verwenden.');
    
  } catch (error) {
    console.error('❌ Setup fehlgeschlagen:', error);
    process.exit(1);
  }
}

setupKalender();