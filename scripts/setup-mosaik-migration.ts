/**
 * Setup-Script für die Mosaik-Migration Staging-Collection
 * Legt `migration_kandidaten` in Appwrite an.
 *
 * Führe aus mit: npx tsx scripts/setup-mosaik-migration.ts
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
const MIGRATION_KANDIDATEN_COLLECTION_ID = 'migration_kandidaten';

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
  required = false
) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`   ✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`   📝 Erstelle String-Attribut ${key}...`);
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        key,
        size,
        required
      );
      console.log(`   ✅ Attribut ${key} erstellt`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureFloatAttribute(
  collectionId: string,
  key: string,
  required = false
) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`   ✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`   📝 Erstelle Float-Attribut ${key}...`);
      await databases.createFloatAttribute(
        DATABASE_ID,
        collectionId,
        key,
        required
      );
      console.log(`   ✅ Attribut ${key} erstellt`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureBooleanAttribute(
  collectionId: string,
  key: string,
  required = false
) {
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, key);
    console.log(`   ✅ Attribut ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`   📝 Erstelle Boolean-Attribut ${key}...`);
      await databases.createBooleanAttribute(
        DATABASE_ID,
        collectionId,
        key,
        required
      );
      console.log(`   ✅ Attribut ${key} erstellt`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function ensureIndex(
  collectionId: string,
  key: string,
  attributes: string[],
  type: 'key' | 'unique' = 'key'
) {
  try {
    await databases.getIndex(DATABASE_ID, collectionId, key);
    console.log(`   ✅ Index ${key} existiert bereits`);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 404) {
      console.log(`   📇 Erstelle Index ${key} (${type})...`);
      await databases.createIndex(
        DATABASE_ID,
        collectionId,
        key,
        type,
        attributes
      );
      console.log(`   ✅ Index ${key} erstellt`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } else {
      throw error;
    }
  }
}

async function setupMigrationKandidaten() {
  console.log('\n📦 Setup: migration_kandidaten Collection');
  console.log('='.repeat(50));

  await ensureCollection(MIGRATION_KANDIDATEN_COLLECTION_ID, 'Mosaik-Migrationskandidaten');

  console.log('\n📝 Erstelle Attribute...');
  // Natürlicher Schlüssel aus Mosaik (z.B. "AbenbergTC")
  await ensureStringAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'mosaikKurzname', 100, true);
  // Status: neu, auto_match, review, bestaetigt, angelegt, uebersprungen, fehler
  await ensureStringAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'status', 30, true);
  // Mosaik-Gruppe (Tennisclub, Tennisplatzbau, ...)
  await ensureStringAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'gruppe', 100, false);
  // Aus PLZ abgeleitet, für Filter
  await ensureStringAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'bundesland', 50, false);
  // Vorgeschlagener CRM-Kunde
  await ensureStringAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'matchKundeId', 100, false);
  await ensureFloatAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'matchScore', false);
  // Inaktiv in Mosaik (Löschdatum oder Ausgeblendet)
  await ensureBooleanAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'mosaikInaktiv', false);
  // Wer hat zuletzt bearbeitet
  await ensureStringAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'bearbeitetAm', 50, false);
  await ensureStringAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'bearbeitetVon', 100, false);
  // Nutzdaten: { rohdaten, ansprechpartner, subAdressen, bestellhistorie, zahlungsverhalten, feldDiff, matchBegruendung, notiz }
  await ensureStringAttribute(MIGRATION_KANDIDATEN_COLLECTION_ID, 'data', 200000, true);

  console.log('\n⏳ Warte auf Attribut-Aktivierung...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('\n📇 Erstelle Indizes...');
  await ensureIndex(
    MIGRATION_KANDIDATEN_COLLECTION_ID,
    'mosaikKurzname_unique',
    ['mosaikKurzname'],
    'unique'
  );
  await ensureIndex(MIGRATION_KANDIDATEN_COLLECTION_ID, 'status_index', ['status']);
  await ensureIndex(MIGRATION_KANDIDATEN_COLLECTION_ID, 'gruppe_index', ['gruppe']);
  await ensureIndex(MIGRATION_KANDIDATEN_COLLECTION_ID, 'bundesland_index', ['bundesland']);
}

async function main() {
  console.log('🚀 Starte Mosaik-Migration Setup...');
  console.log('='.repeat(50));
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project: ${projectId}`);
  console.log(`Database: ${DATABASE_ID}`);
  console.log('='.repeat(50));

  try {
    await setupMigrationKandidaten();

    console.log('\n' + '='.repeat(50));
    console.log('✅ Mosaik-Migration Setup abgeschlossen!');
    console.log('='.repeat(50));
    console.log(`\nCollection erstellt: ${MIGRATION_KANDIDATEN_COLLECTION_ID}`);
    console.log('\nDie Staging-Collection ist bereit für den JSON-Import.');
  } catch (error) {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  }
}

main();
