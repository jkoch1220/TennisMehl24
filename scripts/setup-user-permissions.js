/**
 * Setup Script für User Permissions Collection
 * Erstellt die Collection in Appwrite für User-Tool-Berechtigungen
 * 
 * Ausführen: node scripts/setup-user-permissions.js
 */

import { Client, Databases, Permission, Role } from 'node-appwrite';
import * as dotenv from 'dotenv';

// .env laden
dotenv.config();

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || process.env.APPWRITE_API_KEY;
const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'user_permissions';

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client();
client
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

async function setupCollection() {
  console.log('🚀 Starte Setup für User Permissions Collection...\n');

  try {
    // Prüfen ob Collection existiert
    try {
      await databases.getCollection(DATABASE_ID, COLLECTION_ID);
      console.log('ℹ️  Collection existiert bereits, lösche sie für Neuanlage...');
      await databases.deleteCollection(DATABASE_ID, COLLECTION_ID);
      console.log('✅ Alte Collection gelöscht\n');
    } catch (error) {
      // Collection existiert nicht, das ist OK
      console.log('ℹ️  Collection existiert noch nicht, wird neu erstellt...\n');
    }

    // Collection erstellen
    // Permissions: Alle eingeloggten User können lesen, aber nur Admins dürfen schreiben
    console.log('📦 Erstelle Collection...');
    await databases.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      'User Permissions',
      [
        Permission.read(Role.users()),    // Alle eingeloggten User dürfen lesen
        Permission.create(Role.label('admin')),  // Nur Admins dürfen erstellen
        Permission.update(Role.label('admin')),  // Nur Admins dürfen ändern
        Permission.delete(Role.label('admin')),  // Nur Admins dürfen löschen
      ]
    );
    console.log('✅ Collection erstellt\n');

    // Attribute erstellen
    console.log('📝 Erstelle Attribute...');

    // userId - Die ID des Users dessen Berechtigungen gespeichert werden
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'userId',
      255,
      true  // required
    );
    console.log('  ✓ userId');

    // allowedTools - Array mit Tool-IDs die der User sehen darf
    // null/nicht vorhanden = alle Tools erlaubt
    // leeres Array = keine Tools
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'allowedTools',
      255,
      false,  // not required (null = alle erlaubt)
      null,   // default
      true    // array
    );
    console.log('  ✓ allowedTools (array)');

    // updatedBy - Wer hat zuletzt geändert
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'updatedBy',
      255,
      false
    );
    console.log('  ✓ updatedBy');

    // updatedAt - Wann zuletzt geändert
    await databases.createDatetimeAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'updatedAt',
      false
    );
    console.log('  ✓ updatedAt');

    // Warten bis Attribute verfügbar sind
    console.log('\n⏳ Warte auf Attribute-Verfügbarkeit...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Index für userId erstellen (für schnelle Suche)
    console.log('\n📇 Erstelle Index...');
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      'idx_userId',
      'unique',  // Unique Index - jeder User hat nur einen Eintrag
      ['userId']
    );
    console.log('  ✓ idx_userId (unique)');

    console.log('\n✅ Setup erfolgreich abgeschlossen!');
    console.log('\nCollection Details:');
    console.log(`  - Database ID: ${DATABASE_ID}`);
    console.log(`  - Collection ID: ${COLLECTION_ID}`);
    console.log('  - Attribute: userId (string, required)');
    console.log('  - Attribute: allowedTools (string[], optional)');
    console.log('  - Attribute: updatedBy (string, optional)');
    console.log('  - Attribute: updatedAt (datetime, optional)');
    console.log('  - Index: idx_userId (unique)');

  } catch (error) {
    console.error('\n❌ Fehler beim Setup:', error.message);
    console.error(error);
    process.exit(1);
  }
}

setupCollection();
