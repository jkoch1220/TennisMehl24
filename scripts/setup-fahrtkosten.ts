/**
 * Setup-Script für Fahrtkosten Collections
 * Führe aus mit: npx tsx scripts/setup-fahrtkosten.ts
 */

import { Client, Databases, ID, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const FAHRTEN_COLLECTION_ID = 'fahrten';
const DEFAULT_STRECKEN_COLLECTION_ID = 'default_strecken';
const PERSONEN_COLLECTION_ID = 'fahrtkosten_personen';
const AUTOS_COLLECTION_ID = 'fahrtkosten_autos';
const FIRMEN_COLLECTION_ID = 'fahrtkosten_firmen';

async function ensureCollection(collectionId: string, name: string) {
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
    console.log(`✅ Collection ${collectionId} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`📦 Erstelle Collection ${collectionId}...`);
      await databases.createCollection(
        DATABASE_ID,
        collectionId,
        name,
        ['read("users")', 'create("users")', 'update("users")', 'delete("users")']
      );
      console.log(`✅ Collection ${collectionId} erstellt`);
    } else {
      throw error;
    }
  }
}

async function ensureStringAttribute(collectionId: string, key: string, size: number, required: boolean = false) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`  ✅ ${key} (string) existiert`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`  📝 Erstelle ${key} (string)...`);
      await databases.createStringAttribute(DATABASE_ID, collectionId, key, size, required);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureFloatAttribute(collectionId: string, key: string, required: boolean = false) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`  ✅ ${key} (float) existiert`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`  📝 Erstelle ${key} (float)...`);
      await databases.createFloatAttribute(DATABASE_ID, collectionId, key, required);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureBooleanAttribute(collectionId: string, key: string, required: boolean = false) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`  ✅ ${key} (boolean) existiert`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`  📝 Erstelle ${key} (boolean)...`);
      await databases.createBooleanAttribute(DATABASE_ID, collectionId, key, required);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureIntegerAttribute(collectionId: string, key: string, required: boolean = false) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`  ✅ ${key} (integer) existiert`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`  📝 Erstelle ${key} (integer)...`);
      await databases.createIntegerAttribute(DATABASE_ID, collectionId, key, required);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

/** Seedet ein Stammdaten-Dokument idempotent (anhand des name-Feldes) */
async function ensureSeedDocument(
  collectionId: string,
  data: { name: string; [key: string]: unknown }
) {
  try {
    const existing = await databases.listDocuments(DATABASE_ID, collectionId, [
      Query.equal('name', data.name),
      Query.limit(1),
    ]);
    if (existing.total > 0) {
      console.log(`  ✅ "${data.name}" existiert bereits`);
      return;
    }
    await databases.createDocument(DATABASE_ID, collectionId, ID.unique(), data);
    console.log(`  🌱 "${data.name}" angelegt`);
  } catch (error) {
    console.error(`  ⚠️  Seed "${data.name}" fehlgeschlagen:`, error);
  }
}

async function main() {
  console.log('🚀 Starte Fahrtkosten Setup...\n');

  try {
    // Collections erstellen
    await ensureCollection(FAHRTEN_COLLECTION_ID, 'Fahrten');
    await ensureCollection(DEFAULT_STRECKEN_COLLECTION_ID, 'Default Strecken');
    await ensureCollection(PERSONEN_COLLECTION_ID, 'Fahrtkosten Personen');
    await ensureCollection(AUTOS_COLLECTION_ID, 'Fahrtkosten Autos');
    await ensureCollection(FIRMEN_COLLECTION_ID, 'Fahrtkosten Firmen');

    // Fahrten Attribute
    console.log('\n📝 Fahrten Attribute:');
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'datum', 20, true);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'fahrer', 100, false); // = personId
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'fahrerName', 200, false); // = personName
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'autoId', 100, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'autoName', 200, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'autoKennzeichen', 50, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'firmaId', 100, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'firmaName', 200, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'startort', 200, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'startAdresse', 500, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'zielort', 200, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'zielAdresse', 500, false);
    await ensureFloatAttribute(FAHRTEN_COLLECTION_ID, 'kilometer', false);
    await ensureFloatAttribute(FAHRTEN_COLLECTION_ID, 'startKm', false);
    await ensureFloatAttribute(FAHRTEN_COLLECTION_ID, 'endKm', false);
    await ensureFloatAttribute(FAHRTEN_COLLECTION_ID, 'kilometerPauschale', false);
    await ensureFloatAttribute(FAHRTEN_COLLECTION_ID, 'betrag', false);
    await ensureBooleanAttribute(FAHRTEN_COLLECTION_ID, 'hinpirsUndZurueck', false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'zweck', 500, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'notizen', 2000, false); // = kommentar
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'defaultStreckeId', 100, false);

    // Default Strecken Attribute
    console.log('\n📝 Default Strecken Attribute:');
    await ensureStringAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'name', 200, true);
    await ensureStringAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'startort', 200, false);
    await ensureStringAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'startAdresse', 500, false);
    await ensureStringAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'zielort', 200, false);
    await ensureStringAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'zielAdresse', 500, false);
    await ensureFloatAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'kilometer', false);
    await ensureBooleanAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'istFavorit', false);
    await ensureIntegerAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'sortierung', false);
    await ensureStringAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'standardAutoId', 100, false);
    await ensureBooleanAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'standardHinUndZurueck', false);
    await ensureStringAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'personId', 100, false);

    // Personen Attribute
    console.log('\n📝 Personen Attribute:');
    await ensureStringAttribute(PERSONEN_COLLECTION_ID, 'name', 200, true);
    await ensureBooleanAttribute(PERSONEN_COLLECTION_ID, 'aktiv', false);
    await ensureIntegerAttribute(PERSONEN_COLLECTION_ID, 'sortierung', false);

    // Autos Attribute (pro Person)
    console.log('\n📝 Autos Attribute:');
    await ensureStringAttribute(AUTOS_COLLECTION_ID, 'name', 200, true);
    await ensureStringAttribute(AUTOS_COLLECTION_ID, 'kennzeichen', 50, false);
    await ensureFloatAttribute(AUTOS_COLLECTION_ID, 'kmPauschale', false);
    await ensureBooleanAttribute(AUTOS_COLLECTION_ID, 'aktiv', false);
    await ensureIntegerAttribute(AUTOS_COLLECTION_ID, 'sortierung', false);
    await ensureStringAttribute(AUTOS_COLLECTION_ID, 'personId', 100, false);

    // Firmen Attribute (pro Person)
    console.log('\n📝 Firmen Attribute:');
    await ensureStringAttribute(FIRMEN_COLLECTION_ID, 'name', 200, true);
    await ensureBooleanAttribute(FIRMEN_COLLECTION_ID, 'aktiv', false);
    await ensureIntegerAttribute(FIRMEN_COLLECTION_ID, 'sortierung', false);
    await ensureStringAttribute(FIRMEN_COLLECTION_ID, 'personId', 100, false);

    // Seed: Standard-Personen
    console.log('\n🌱 Seed Personen:');
    await ensureSeedDocument(PERSONEN_COLLECTION_ID, { name: 'Luca', aktiv: true, sortierung: 0 });
    await ensureSeedDocument(PERSONEN_COLLECTION_ID, { name: 'Julian', aktiv: true, sortierung: 1 });
    await ensureSeedDocument(PERSONEN_COLLECTION_ID, { name: 'Ronald', aktiv: true, sortierung: 2 });

    // Autos werden pro Person in der App angelegt (kein globaler Seed).

    console.log('\n✅ Fahrtkosten Setup abgeschlossen!');
    console.log('Die Collections sind jetzt bereit.');
  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
