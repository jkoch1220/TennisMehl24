/**
 * Script zum Erstellen der Universa-Artikel-Collection
 *
 * Führe dieses Script aus mit:
 * node scripts/setup-universa-collection.js
 */

import dotenv from 'dotenv';

// Lade Umgebungsvariablen aus .env
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und VITE_APPWRITE_API_KEY müssen gesetzt sein!');
  process.exit(1);
}

const DATABASE_ID = 'tennismehl24_db';
const UNIVERSA_ARTIKEL_COLLECTION_ID = 'universa_artikel';

const universaFields = [
  { key: 'artikelnummer', type: 'string', size: 100, required: true },
  { key: 'bezeichnung', type: 'string', size: 500, required: true },
  { key: 'verpackungseinheit', type: 'string', size: 100, required: false },
  { key: 'grosshaendlerPreisNetto', type: 'float', required: false, default: 0 },
  { key: 'katalogPreisNetto', type: 'float', required: false, default: 0 },
  { key: 'katalogPreisBrutto', type: 'float', required: false, default: 0 },
  { key: 'seiteKatalog', type: 'integer', required: false },
  { key: 'aenderungen', type: 'string', size: 500, required: false },
  { key: 'importDatum', type: 'string', size: 50, required: false },
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
    'float': async () => {
      const body = {
        key: field.key,
        required: field.required || false
      };
      if (field.min !== undefined) body.min = field.min;
      if (field.max !== undefined) body.max = field.max;
      if (field.default !== undefined) body.default = field.default;
      return makeApiRequest(
        `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/attributes/float`,
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
    console.log(`Collection existiert bereits: ${id}`);
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
        console.log(`Collection erstellt: ${id}`);
        return true;
      } catch (createError) {
        console.log(`Fehler beim Erstellen der Collection ${id}:`, createError.message);
        return false;
      }
    } else {
      console.log(`Fehler beim Prüfen der Collection ${id}:`, error.message);
      return false;
    }
  }
}

async function createIndex(collectionId, key, type, attributes) {
  try {
    await makeApiRequest(
      `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/indexes`,
      'POST',
      {
        key,
        type,
        attributes
      }
    );
    console.log(`Index erstellt: ${key}`);
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(`Index existiert bereits: ${key}`);
    } else {
      console.log(`Fehler beim Erstellen des Index ${key}:`, error.message);
    }
  }
}

async function setupUniversaArtikel() {
  console.log('Starte Universa-Artikel-Collection Setup...');
  console.log('');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project ID: ${projectId}`);
  console.log('');

  try {
    // Collection erstellen oder prüfen
    const isNewCollection = await ensureCollection(UNIVERSA_ARTIKEL_COLLECTION_ID, 'Universa Artikel');

    if (!isNewCollection) {
      console.log('Collection bereits vorhanden - prüfe Felder...');
    }

    console.log('');
    console.log(`Setup für Collection: Universa Artikel (${UNIVERSA_ARTIKEL_COLLECTION_ID})`);
    console.log(`   Erstelle ${universaFields.length} Felder...`);
    console.log('');

    for (const field of universaFields) {
      try {
        await createAttribute(UNIVERSA_ARTIKEL_COLLECTION_ID, field);
        console.log(`Feld erstellt: ${field.key}`);

        // Kurze Pause zwischen Feldern
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`Feld existiert bereits: ${field.key}`);
        } else {
          console.log(`Fehler beim Erstellen von ${field.key}:`, error.message);
        }
      }
    }

    // Warten bis Felder erstellt sind
    console.log('');
    console.log('Warte auf Feld-Erstellung...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Indizes erstellen
    console.log('');
    console.log('Erstelle Indizes...');

    await createIndex(UNIVERSA_ARTIKEL_COLLECTION_ID, 'artikelnummer_idx', 'key', ['artikelnummer']);
    await new Promise(resolve => setTimeout(resolve, 500));

    await createIndex(UNIVERSA_ARTIKEL_COLLECTION_ID, 'bezeichnung_idx', 'fulltext', ['bezeichnung']);
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('');
    console.log('Universa-Artikel-Setup abgeschlossen!');
    console.log('');
    console.log('WICHTIG: Warte einige Sekunden, bis Appwrite die Felder vollständig erstellt hat.');
    console.log('   Danach kannst du die Excel-Preisliste in den Stammdaten hochladen.');

  } catch (error) {
    console.error('Setup fehlgeschlagen:', error);
    process.exit(1);
  }
}

setupUniversaArtikel();
