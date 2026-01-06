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

async function ensureAttribute(collectionId: string, key: string, size: number) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`📝 Erstelle Attribut ${key}...`);
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        key,
        size,
        false // nicht required
      );
      console.log(`✅ Attribut ${key} erstellt`);
      // Warten bis Attribut bereit ist
      await new Promise(resolve => setTimeout(resolve, 2000));
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

    // Attribute erstellen
    console.log('\n📝 Erstelle Attribute...');
    await ensureAttribute(FAHRTEN_COLLECTION_ID, 'data', 50000);
    await ensureAttribute(DEFAULT_STRECKEN_COLLECTION_ID, 'data', 10000);

    console.log('\n✅ Fahrtkosten Setup abgeschlossen!');
    console.log('Die Collections sind jetzt bereit.');
  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
