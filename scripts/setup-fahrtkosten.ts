/**
 * Setup-Script für Fahrtkosten Collections
 * Führe aus mit: npx tsx scripts/setup-fahrtkosten.ts
 */

import { Client, Databases } from 'node-appwrite';
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

async function main() {
  console.log('🚀 Starte Fahrtkosten Setup...\n');

  try {
    // Collections erstellen
    await ensureCollection(FAHRTEN_COLLECTION_ID, 'Fahrten');
    await ensureCollection(DEFAULT_STRECKEN_COLLECTION_ID, 'Default Strecken');

    // Fahrten Attribute
    console.log('\n📝 Fahrten Attribute:');
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'datum', 20, true);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'fahrer', 100, true);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'fahrerName', 200, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'startort', 200, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'startAdresse', 500, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'zielort', 200, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'zielAdresse', 500, false);
    await ensureFloatAttribute(FAHRTEN_COLLECTION_ID, 'kilometer', false);
    await ensureFloatAttribute(FAHRTEN_COLLECTION_ID, 'kilometerPauschale', false);
    await ensureFloatAttribute(FAHRTEN_COLLECTION_ID, 'betrag', false);
    await ensureBooleanAttribute(FAHRTEN_COLLECTION_ID, 'hinpirsUndZurueck', false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'zweck', 500, false);
    await ensureStringAttribute(FAHRTEN_COLLECTION_ID, 'notizen', 2000, false);
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

    console.log('\n✅ Fahrtkosten Setup abgeschlossen!');
    console.log('Die Collections sind jetzt bereit.');
  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
