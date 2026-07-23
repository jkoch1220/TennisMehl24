/**
 * Setup-Script für Chat-Nachrichten Collection
 * Führe aus mit: npx tsx scripts/setup-chat.ts
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
const CHAT_NACHRICHTEN_COLLECTION_ID = 'chat_nachrichten';

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
    console.log(`✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`📝 Erstelle String-Attribut ${key}...`);
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        key,
        size,
        required
      );
      console.log(`✅ Attribut ${key} erstellt`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureStringArrayAttribute(collectionId: string, key: string, size: number) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`📝 Erstelle Array-Attribut ${key}...`);
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        key,
        size,
        false, // required
        undefined, // default
        true // array
      );
      console.log(`✅ Array-Attribut ${key} erstellt`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureIndex(collectionId: string, key: string, attributes: string[]) {
  try {
    await databases.getIndex(DATABASE_ID, collectionId, key);
    console.log(`✅ Index ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`📇 Erstelle Index ${key}...`);
      await databases.createIndex(
        DATABASE_ID,
        collectionId,
        key,
        'key',
        attributes
      );
      console.log(`✅ Index ${key} erstellt`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log('🚀 Starte Chat-Nachrichten Setup...\n');

  try {
    // Collection erstellen
    await ensureCollection(CHAT_NACHRICHTEN_COLLECTION_ID, 'Chat Nachrichten');

    // Attribute erstellen
    console.log('\n📝 Erstelle Attribute...');
    await ensureStringAttribute(CHAT_NACHRICHTEN_COLLECTION_ID, 'projektId', 100, true);
    await ensureStringAttribute(CHAT_NACHRICHTEN_COLLECTION_ID, 'text', 5000, true);
    await ensureStringArrayAttribute(CHAT_NACHRICHTEN_COLLECTION_ID, 'mentions', 100);
    await ensureStringAttribute(CHAT_NACHRICHTEN_COLLECTION_ID, 'erstelltAm', 50, true);
    await ensureStringAttribute(CHAT_NACHRICHTEN_COLLECTION_ID, 'erstelltVon', 100, true);
    await ensureStringAttribute(CHAT_NACHRICHTEN_COLLECTION_ID, 'erstelltVonName', 200, true);
    await ensureStringAttribute(CHAT_NACHRICHTEN_COLLECTION_ID, 'data', 10000, false);

    // Warten bis alle Attribute bereit sind
    console.log('\n⏳ Warte auf Attribut-Erstellung...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Indizes erstellen
    console.log('\n📇 Erstelle Indizes...');
    await ensureIndex(CHAT_NACHRICHTEN_COLLECTION_ID, 'projektId_index', ['projektId']);
    await ensureIndex(CHAT_NACHRICHTEN_COLLECTION_ID, 'erstelltVon_index', ['erstelltVon']);

    console.log('\n✅ Chat-Nachrichten Setup abgeschlossen!');
    console.log('Die Collection ist jetzt bereit für den Projekt-Chat.');
  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
