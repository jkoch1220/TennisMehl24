/**
 * Setup-Script für Logistikpartner Collection
 * Führe aus mit: npx tsx scripts/setup-logistikpartner.ts
 */

import { Client, Databases } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const LOGISTIKPARTNER_COLLECTION_ID = 'logistikpartner';

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
  console.log('🚀 Starte Logistikpartner Setup...\n');

  try {
    // Collection erstellen
    await ensureCollection(LOGISTIKPARTNER_COLLECTION_ID, 'Logistikpartner');

    // Attribut erstellen (JSON-Daten als String)
    console.log('\n📝 Erstelle Attribute...');
    await ensureAttribute(LOGISTIKPARTNER_COLLECTION_ID, 'data', 100000);

    console.log('\n✅ Logistikpartner Setup abgeschlossen!');
    console.log('Die Collection ist jetzt bereit.');
    console.log('\nFüge diesen Befehl in package.json hinzu:');
    console.log('"setup:logistikpartner": "npx tsx scripts/setup-logistikpartner.ts"');
  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
