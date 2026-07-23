/**
 * Setup Script für Private Kreditoren Collections
 * Erstellt die notwendigen Appwrite Collections für Julian und Luca
 *
 * Ausführung: node scripts/setup-privat-kreditoren.js
 */

import dotenv from 'dotenv';
import { Client, Databases, ID } from 'node-appwrite';

// .env laden
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = 'tennismehl24_db';

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Fehlende Umgebungsvariablen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

// Client initialisieren
const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

// Collection IDs
const collections = [
  // Julian
  { id: 'privat_rechnungen_julian', name: 'Private Rechnungen Julian' },
  { id: 'privat_kreditoren_julian', name: 'Private Kreditoren Julian' },
  { id: 'privat_aktivitaeten_julian', name: 'Private Aktivitäten Julian' },
  // Luca
  { id: 'privat_rechnungen_luca', name: 'Private Rechnungen Luca' },
  { id: 'privat_kreditoren_luca', name: 'Private Kreditoren Luca' },
  { id: 'privat_aktivitaeten_luca', name: 'Private Aktivitäten Luca' },
];

async function createCollection(collectionId, name) {
  try {
    // Prüfen ob Collection existiert
    try {
      await databases.getCollection(databaseId, collectionId);
      console.log(`✅ Collection "${name}" existiert bereits`);
      return true;
    } catch (e) {
      if (e.code !== 404) throw e;
    }

    // Collection erstellen
    console.log(`📦 Erstelle Collection "${name}"...`);
    await databases.createCollection(
      databaseId,
      collectionId,
      name,
      [
        // Berechtigungen: Alle eingeloggten User können lesen/schreiben
        'read("users")',
        'create("users")',
        'update("users")',
        'delete("users")',
      ]
    );
    console.log(`✅ Collection "${name}" erstellt`);
    return true;
  } catch (error) {
    console.error(`❌ Fehler beim Erstellen von "${name}":`, error.message);
    return false;
  }
}

async function createDataAttribute(collectionId) {
  try {
    // Prüfen ob Attribut existiert
    try {
      const attrs = await databases.listAttributes(databaseId, collectionId);
      const hasData = attrs.attributes.some(a => a.key === 'data');
      if (hasData) {
        console.log(`  ✅ Attribut "data" existiert bereits`);
        return true;
      }
    } catch (e) {
      // Ignorieren
    }

    console.log(`  📝 Erstelle Attribut "data"...`);
    await databases.createStringAttribute(
      databaseId,
      collectionId,
      'data',
      50000, // 50KB für JSON-Daten
      false  // nicht required
    );
    console.log(`  ✅ Attribut "data" erstellt`);

    // Kurz warten damit das Attribut verfügbar ist
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  } catch (error) {
    if (error.code === 409) {
      console.log(`  ✅ Attribut "data" existiert bereits`);
      return true;
    }
    console.error(`  ❌ Fehler beim Erstellen von "data":`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Setup Private Kreditoren Collections\n');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project: ${projectId}`);
  console.log(`Database: ${databaseId}\n`);

  let success = true;

  for (const { id, name } of collections) {
    const created = await createCollection(id, name);
    if (created) {
      await createDataAttribute(id);
    } else {
      success = false;
    }
    console.log(''); // Leerzeile
  }

  if (success) {
    console.log('✅ Alle Collections erfolgreich erstellt!\n');
    console.log('Nächste Schritte:');
    console.log('1. Benutzer-Berechtigungen in Appwrite aktualisieren');
    console.log('   - Julian braucht: "kreditoren-julian" in allowedTools');
    console.log('   - Luca braucht: "kreditoren-luca" in allowedTools');
    console.log('2. App neu starten: npm run dev');
  } else {
    console.log('⚠️ Einige Collections konnten nicht erstellt werden.');
  }
}

main().catch(console.error);
