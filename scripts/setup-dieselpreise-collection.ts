/**
 * Setup-Script für die Dieselpreise Collection in Appwrite
 *
 * Ausführen mit: npx tsx scripts/setup-dieselpreise-collection.ts
 */

import { Client, Databases, ID, Permission, Role } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'dieselpreise';

async function setupCollection() {
  const client = new Client();

  client
    .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.VITE_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.VITE_APPWRITE_API_KEY || '');

  const databases = new Databases(client);

  console.log('🔧 Erstelle Dieselpreise Collection...\n');

  try {
    // Collection erstellen
    await databases.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      'Dieselpreise Historie',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
    console.log('✅ Collection erstellt');
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err.code === 409) {
      console.log('ℹ️ Collection existiert bereits');
    } else {
      throw error;
    }
  }

  // Attribute erstellen
  const attributes = [
    { name: 'datum', type: 'string', size: 10, required: true },
    { name: 'preis', type: 'double', required: true },
    { name: 'minimum', type: 'double', required: false },
    { name: 'maximum', type: 'double', required: false },
    { name: 'anzahlTankstellen', type: 'integer', required: false },
    { name: 'quelle', type: 'string', size: 50, required: true },
    { name: 'region', type: 'string', size: 50, required: false },
  ];

  for (const attr of attributes) {
    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(
          DATABASE_ID,
          COLLECTION_ID,
          attr.name,
          attr.size || 255,
          attr.required
        );
      } else if (attr.type === 'double') {
        await databases.createFloatAttribute(
          DATABASE_ID,
          COLLECTION_ID,
          attr.name,
          attr.required
        );
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(
          DATABASE_ID,
          COLLECTION_ID,
          attr.name,
          attr.required
        );
      }
      console.log(`✅ Attribut '${attr.name}' erstellt`);
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (err.code === 409) {
        console.log(`ℹ️ Attribut '${attr.name}' existiert bereits`);
      } else {
        console.error(`❌ Fehler bei '${attr.name}':`, error);
      }
    }
  }

  // Warten bis Attribute bereit sind
  console.log('\n⏳ Warte auf Attribut-Indexierung (10 Sekunden)...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Index für Datum erstellen
  try {
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      'datum_index',
      'key',
      ['datum'],
      ['asc']
    );
    console.log('✅ Index für Datum erstellt');
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err.code === 409) {
      console.log('ℹ️ Index existiert bereits');
    } else {
      console.error('❌ Fehler beim Index:', error);
    }
  }

  console.log('\n🎉 Setup abgeschlossen!\n');
  console.log('Nächste Schritte:');
  console.log('1. Führe das Import-Script aus: npx tsx scripts/import-dieselpreise.ts');
  console.log('2. Oder importiere manuell CSV-Daten von Tankerkönig');
}

setupCollection().catch(console.error);
