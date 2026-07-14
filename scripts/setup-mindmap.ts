/**
 * Setup-Script für die Mindmap-Collection (geteilte Planungsdaten)
 * Führe aus mit: npx tsx scripts/setup-mindmap.ts
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
const MINDMAP_NODES_COLLECTION_ID = 'mindmap_nodes';

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

async function ensureStringAttribute(
  collectionId: string,
  key: string,
  size: number,
  required: boolean = false
) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`📝 Erstelle String-Attribut ${key}...`);
      await databases.createStringAttribute(DATABASE_ID, collectionId, key, size, required);
      console.log(`✅ Attribut ${key} erstellt`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureBooleanAttribute(collectionId: string, key: string) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`📝 Erstelle Boolean-Attribut ${key}...`);
      await databases.createBooleanAttribute(DATABASE_ID, collectionId, key, false);
      console.log(`✅ Attribut ${key} erstellt`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureIntegerAttribute(collectionId: string, key: string) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`📝 Erstelle Integer-Attribut ${key}...`);
      await databases.createIntegerAttribute(DATABASE_ID, collectionId, key, false);
      console.log(`✅ Attribut ${key} erstellt`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log('🚀 Setup Mindmap-Collection...\n');

  await ensureCollection(MINDMAP_NODES_COLLECTION_ID, 'Mindmap Knoten & Tasks');

  // Dokument-ID = Node-ID (Root = "root"), daher keine eigene id-Spalte nötig
  await ensureStringAttribute(MINDMAP_NODES_COLLECTION_ID, 'parentId', 64, false);
  await ensureStringAttribute(MINDMAP_NODES_COLLECTION_ID, 'type', 16, true);
  await ensureStringAttribute(MINDMAP_NODES_COLLECTION_ID, 'titel', 512, true);
  await ensureBooleanAttribute(MINDMAP_NODES_COLLECTION_ID, 'collapsed');
  await ensureStringAttribute(MINDMAP_NODES_COLLECTION_ID, 'beschreibung', 10000, false);
  await ensureStringAttribute(MINDMAP_NODES_COLLECTION_ID, 'faelligAm', 10, false);
  await ensureStringAttribute(MINDMAP_NODES_COLLECTION_ID, 'zustaendig', 128, false);
  await ensureBooleanAttribute(MINDMAP_NODES_COLLECTION_ID, 'erledigt');
  await ensureIntegerAttribute(MINDMAP_NODES_COLLECTION_ID, 'sortOrder');

  console.log('\n✅ Mindmap-Setup abgeschlossen');
}

main().catch((error) => {
  console.error('❌ Setup fehlgeschlagen:', error);
  process.exit(1);
});
