/**
 * Setup-Script für Platzbauer-Verwaltung Collections
 * Führe aus mit: npx tsx scripts/setup-platzbauer.ts
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
const PLATZBAUER_PROJEKTE_COLLECTION_ID = 'platzbauer_projekte';
const PROJEKT_ZUORDNUNGEN_COLLECTION_ID = 'projekt_zuordnungen';

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

async function ensureIntegerAttribute(collectionId: string, key: string, required: boolean = false) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`📝 Erstelle Integer-Attribut ${key}...`);
      await databases.createIntegerAttribute(
        DATABASE_ID,
        collectionId,
        key,
        required
      );
      console.log(`✅ Attribut ${key} erstellt`);
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

async function setupPlatzbauerProjekte() {
  console.log('\n📦 Setup: Platzbauer Projekte Collection');
  console.log('='.repeat(50));

  await ensureCollection(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'Platzbauer Projekte');

  // Attribute erstellen
  console.log('\n📝 Erstelle Attribute für Platzbauer Projekte...');
  await ensureStringAttribute(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'platzbauerId', 100, true);
  await ensureStringAttribute(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'platzbauerName', 255, true);
  await ensureIntegerAttribute(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'saisonjahr', true);
  await ensureStringAttribute(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'status', 50, true);
  await ensureStringAttribute(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'typ', 50, true);
  await ensureStringAttribute(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'hauptprojektId', 100, false);
  await ensureStringAttribute(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'erstelltAm', 50, true);
  await ensureStringAttribute(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'geaendertAm', 50, true);
  await ensureStringAttribute(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'data', 100000, true);

  // Warten bis alle Attribute bereit sind
  console.log('\n⏳ Warte auf Attribut-Erstellung...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Indizes erstellen
  console.log('\n📇 Erstelle Indizes für Platzbauer Projekte...');
  await ensureIndex(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'platzbauerId_index', ['platzbauerId']);
  await ensureIndex(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'saisonjahr_index', ['saisonjahr']);
  await ensureIndex(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'status_index', ['status']);
  await ensureIndex(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'typ_index', ['typ']);
}

async function setupProjektZuordnungen() {
  console.log('\n📦 Setup: Projekt Zuordnungen Collection');
  console.log('='.repeat(50));

  await ensureCollection(PROJEKT_ZUORDNUNGEN_COLLECTION_ID, 'Projekt Zuordnungen');

  // Attribute erstellen
  console.log('\n📝 Erstelle Attribute für Projekt Zuordnungen...');
  await ensureStringAttribute(PROJEKT_ZUORDNUNGEN_COLLECTION_ID, 'vereinsProjektId', 100, true);
  await ensureStringAttribute(PROJEKT_ZUORDNUNGEN_COLLECTION_ID, 'platzbauerprojektId', 100, true);
  await ensureIntegerAttribute(PROJEKT_ZUORDNUNGEN_COLLECTION_ID, 'position', true);
  await ensureStringAttribute(PROJEKT_ZUORDNUNGEN_COLLECTION_ID, 'erstelltAm', 50, true);
  await ensureStringAttribute(PROJEKT_ZUORDNUNGEN_COLLECTION_ID, 'data', 10000, false);

  // Warten bis alle Attribute bereit sind
  console.log('\n⏳ Warte auf Attribut-Erstellung...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Indizes erstellen
  console.log('\n📇 Erstelle Indizes für Projekt Zuordnungen...');
  await ensureIndex(PROJEKT_ZUORDNUNGEN_COLLECTION_ID, 'vereinsProjektId_index', ['vereinsProjektId']);
  await ensureIndex(PROJEKT_ZUORDNUNGEN_COLLECTION_ID, 'platzbauerprojektId_index', ['platzbauerprojektId']);
}

async function main() {
  console.log('🚀 Starte Platzbauer-Verwaltung Setup...');
  console.log('='.repeat(50));
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project: ${projectId}`);
  console.log(`Database: ${DATABASE_ID}`);
  console.log('='.repeat(50));

  try {
    await setupPlatzbauerProjekte();
    await setupProjektZuordnungen();

    console.log('\n' + '='.repeat(50));
    console.log('✅ Platzbauer-Verwaltung Setup abgeschlossen!');
    console.log('='.repeat(50));
    console.log('\nFolgende Collections wurden erstellt/aktualisiert:');
    console.log(`  - ${PLATZBAUER_PROJEKTE_COLLECTION_ID}`);
    console.log(`  - ${PROJEKT_ZUORDNUNGEN_COLLECTION_ID}`);
    console.log('\nDie Platzbauer-Verwaltung ist jetzt bereit.');
  } catch (error) {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  }
}

main();
