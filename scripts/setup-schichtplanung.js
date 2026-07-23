/**
 * Script zum Anlegen der Appwrite Collections für die Schichtplanung
 *
 * Führe dieses Script aus mit:
 * npm run setup:schichtplanung
 *
 * Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY
 */

import dotenv from 'dotenv';

// Lade Umgebungsvariablen aus .env (für lokale Entwicklung)
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId) {
  console.error('❌ VITE_APPWRITE_ENDPOINT und VITE_APPWRITE_PROJECT_ID müssen gesetzt sein!');
  process.exit(1);
}

if (!apiKey) {
  console.error('❌ APPWRITE_API_KEY ist nicht gesetzt!');
  console.log('Bitte erstelle einen API Key in Appwrite mit folgenden Berechtigungen:');
  console.log('- databases.read');
  console.log('- databases.write');
  console.log('- collections.read');
  console.log('- collections.write');
  console.log('- attributes.read');
  console.log('- attributes.write');
  console.log('- indexes.read');
  console.log('- indexes.write');
  process.exit(1);
}

const DATABASE_ID = 'tennismehl24_db';

// Collection IDs für Schichtplanung
const SCHICHT_MITARBEITER_COLLECTION_ID = 'schicht_mitarbeiter';
const SCHICHT_ZUWEISUNGEN_COLLECTION_ID = 'schicht_zuweisungen';

// ==================== FELD-DEFINITIONEN ====================

// Mitarbeiter Collection
// Speichert alle Mitarbeiter-Daten als JSON im "data" Feld
// istAktiv als separates Feld für Filter-Queries
const schichtMitarbeiterFields = [
  { key: 'istAktiv', type: 'boolean', default: true },
  { key: 'data', type: 'string', size: 50000, required: true },
];

// Zuweisungen Collection
// Speichert Schicht-Zuweisungen mit Query-Feldern für effiziente Abfragen
const schichtZuweisungenFields = [
  { key: 'datum', type: 'string', size: 20, required: true },         // ISO-Datum (YYYY-MM-DD)
  { key: 'mitarbeiterId', type: 'string', size: 100, required: true }, // Für Filter nach MA
  { key: 'schichtTyp', type: 'string', size: 50, required: true },    // fruehschicht | spaetschicht | nachtschicht
  { key: 'data', type: 'string', size: 10000, required: true },       // JSON mit Details
];

// ==================== HELPER FUNCTIONS ====================

async function createField(collectionId, field) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
    };

    let body = {
      key: field.key,
      required: field.required || false,
      default: field.default ?? null,
      array: field.array || false,
    };

    if (field.type === 'string') {
      body.size = field.size || 500;
    }

    // Appwrite verwendet 'float' statt 'double' in der API
    const apiType = field.type === 'double' ? 'float' : field.type;

    const response = await fetch(
      `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/attributes/${apiType}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );

    if (response.ok) {
      console.log(`   ✅ Feld erstellt: ${field.key}`);
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } else if (response.status === 409) {
      console.log(`   ⏭️  Feld existiert bereits: ${field.key}`);
      return false;
    } else {
      const error = await response.json();
      console.error(`   ❌ Fehler beim Erstellen von ${field.key}:`, error.message || error);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Fehler beim Erstellen von ${field.key}:`, error.message || error);
    return false;
  }
}

async function setupCollection(collectionId, collectionName, fields) {
  console.log(`\n📦 Setup für Collection: ${collectionName}`);
  console.log(`   Collection ID: ${collectionId}`);
  console.log(`   Erstelle ${fields.length} Felder...\n`);

  for (const field of fields) {
    await createField(collectionId, field);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function ensureCollection(collectionId, name, permissions = []) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  // Prüfe ob Collection existiert
  const checkRes = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}`,
    { method: 'GET', headers }
  );

  if (checkRes.ok) {
    console.log(`✓ Collection existiert bereits: ${collectionId}`);
    return true;
  }

  if (checkRes.status !== 404) {
    console.warn(`⚠️ Konnte Collection ${collectionId} nicht prüfen (${checkRes.status}).`);
    return false;
  }

  // Collection erstellen
  console.log(`📦 Erstelle Collection: ${name} (${collectionId})`);

  const createRes = await fetch(`${endpoint}/databases/${DATABASE_ID}/collections`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      collectionId,
      name,
      documentSecurity: false, // Keine Dokumenten-Level Sicherheit
      permissions: permissions.length > 0 ? permissions : [
        'read("users")',
        'create("users")',
        'update("users")',
        'delete("users")',
      ],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    console.error(`❌ Collection ${collectionId} konnte nicht erstellt werden:`, err.message || createRes.status);
    return false;
  }

  console.log(`✅ Collection erstellt: ${collectionId}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  return true;
}

async function ensureIndex(collectionId, indexKey, attributes, type = 'key') {
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  // Prüfen ob Index existiert
  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/indexes`,
    { method: 'GET', headers }
  );

  if (res.ok) {
    const data = await res.json();
    const existingIndex = data.indexes?.find(idx => idx.key === indexKey);
    if (existingIndex) {
      console.log(`   ✓ Index existiert bereits: ${indexKey}`);
      return true;
    }
  }

  console.log(`   📇 Erstelle Index: ${indexKey}`);

  const createRes = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/indexes`,
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

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    console.warn(`   ⚠️ Index ${indexKey} konnte nicht erstellt werden:`, err.message || createRes.status);
    return false;
  }

  console.log(`   ✅ Index erstellt: ${indexKey}`);
  return true;
}

// ==================== MAIN ====================

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         SCHICHTPLANUNG - APPWRITE SETUP                        ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  Erstellt die notwendigen Collections und Felder für das       ║');
  console.log('║  Schichtplanungs-Tool (3-Schicht-System mit Drag & Drop)       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📡 Endpoint: ${endpoint}`);
  console.log(`🔑 Project:  ${projectId}`);
  console.log(`📦 Database: ${DATABASE_ID}`);
  console.log('');

  try {
    // ==================== COLLECTIONS ERSTELLEN ====================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1️⃣  COLLECTIONS ERSTELLEN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const mitarbeiterCreated = await ensureCollection(
      SCHICHT_MITARBEITER_COLLECTION_ID,
      'Schicht Mitarbeiter'
    );

    const zuweisungenCreated = await ensureCollection(
      SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
      'Schicht Zuweisungen'
    );

    if (!mitarbeiterCreated || !zuweisungenCreated) {
      console.error('\n❌ Fehler beim Erstellen der Collections. Abbruch.');
      process.exit(1);
    }

    // ==================== FELDER ERSTELLEN ====================
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('2️⃣  FELDER ERSTELLEN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await setupCollection(
      SCHICHT_MITARBEITER_COLLECTION_ID,
      'Schicht Mitarbeiter',
      schichtMitarbeiterFields
    );

    await setupCollection(
      SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
      'Schicht Zuweisungen',
      schichtZuweisungenFields
    );

    // Warte auf Feld-Erstellung
    console.log('\n⏳ Warte auf Feld-Erstellung (3 Sekunden)...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ==================== INDIZES ERSTELLEN ====================
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('3️⃣  INDIZES ERSTELLEN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    console.log('📦 Indizes für schicht_mitarbeiter:');
    await ensureIndex(SCHICHT_MITARBEITER_COLLECTION_ID, 'istAktiv_index', ['istAktiv']);

    console.log('');
    console.log('📦 Indizes für schicht_zuweisungen:');
    await ensureIndex(SCHICHT_ZUWEISUNGEN_COLLECTION_ID, 'datum_index', ['datum']);
    await ensureIndex(SCHICHT_ZUWEISUNGEN_COLLECTION_ID, 'mitarbeiterId_index', ['mitarbeiterId']);
    await ensureIndex(SCHICHT_ZUWEISUNGEN_COLLECTION_ID, 'schichtTyp_index', ['schichtTyp']);

    // ==================== FERTIG ====================
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ SETUP ERFOLGREICH ABGESCHLOSSEN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Erstellte Collections:');
    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Collection: schicht_mitarbeiter                            │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ Felder:                                                     │');
    console.log('│   • istAktiv (boolean) - Filter für aktive Mitarbeiter     │');
    console.log('│   • data (string, 50KB) - JSON mit allen MA-Daten          │');
    console.log('│ Indizes:                                                    │');
    console.log('│   • istAktiv_index                                          │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Collection: schicht_zuweisungen                            │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ Felder:                                                     │');
    console.log('│   • datum (string) - ISO-Datum für Range-Queries           │');
    console.log('│   • mitarbeiterId (string) - Filter nach Mitarbeiter       │');
    console.log('│   • schichtTyp (string) - fruehschicht/spaetschicht/nacht  │');
    console.log('│   • data (string, 10KB) - JSON mit Zuweisung-Details       │');
    console.log('│ Indizes:                                                    │');
    console.log('│   • datum_index                                             │');
    console.log('│   • mitarbeiterId_index                                     │');
    console.log('│   • schichtTyp_index                                        │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('Du kannst jetzt die App starten mit: npm run dev');
    console.log('Das Schichtplanungs-Tool findest du unter: /schichtplanung');
    console.log('');

  } catch (error) {
    console.error('\n❌ Fehler beim Setup:', error);
    process.exit(1);
  }
}

main();
