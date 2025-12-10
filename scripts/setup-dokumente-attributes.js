/**
 * Script zum Anlegen der neuen Attribute für die BESTELLABWICKLUNG_DOKUMENTE Collection
 * 
 * Ausführen mit: node scripts/setup-dokumente-attributes.js
 * 
 * WICHTIG: Stelle sicher, dass die Umgebungsvariablen gesetzt sind:
 * - VITE_APPWRITE_ENDPOINT
 * - VITE_APPWRITE_PROJECT_ID
 * - APPWRITE_API_KEY (Server-Key mit Schreibrechten)
 */

import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';

// Lade .env Datei
config();

// Konfiguration - Werte aus src/config/appwrite.ts
const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || 'tennismehl24';
const API_KEY = process.env.APPWRITE_API_KEY || process.env.VITE_APPWRITE_API_KEY;
const DATABASE_ID = 'tennismehl24_db';  // Hardcoded aus appwrite.ts
const COLLECTION_ID = 'bestellabwicklung_dokumente';  // Hardcoded aus appwrite.ts

console.log('🔧 Konfiguration:');
console.log(`   Endpoint: ${ENDPOINT}`);
console.log(`   Project: ${PROJECT_ID}`);
console.log(`   Database: ${DATABASE_ID}`);
console.log(`   Collection: ${COLLECTION_ID}`);
console.log(`   API Key: ${API_KEY ? '***' + API_KEY.slice(-8) : 'FEHLT!'}\n`);

if (!API_KEY) {
  console.error('❌ API Key fehlt!');
  console.log('Setze APPWRITE_API_KEY oder VITE_APPWRITE_API_KEY in der .env');
  process.exit(1);
}

const client = new Client();
client
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

const neueAttribute = [
  {
    typ: 'integer',
    key: 'version',
    required: false,
    min: 1,
    max: 9999,
    description: 'Versionsnummer für Angebote/AB/LS (1, 2, 3...)'
  },
  {
    typ: 'string',
    key: 'stornoVonRechnungId',
    size: 255,
    required: false,
    description: 'Bei Stornorechnung: ID der stornierten Original-Rechnung'
  },
  {
    typ: 'string',
    key: 'stornoRechnungId',
    size: 255,
    required: false,
    description: 'Bei Rechnung: ID der zugehörigen Stornorechnung (wenn storniert)'
  },
  {
    typ: 'string',
    key: 'rechnungsStatus',
    size: 50,
    required: false,
    description: 'Status der Rechnung: aktiv oder storniert'
  },
  {
    typ: 'string',
    key: 'stornoGrund',
    size: 500,
    required: false,
    description: 'Begründung für die Stornierung (Pflichtfeld bei Storno)'
  }
];

async function createAttributes() {
  console.log('🚀 Starte Anlegen der neuen Attribute...\n');
  console.log(`Database: ${DATABASE_ID}`);
  console.log(`Collection: ${COLLECTION_ID}\n`);

  for (const attr of neueAttribute) {
    try {
      console.log(`📝 Lege an: ${attr.key} (${attr.typ})...`);
      
      if (attr.typ === 'integer') {
        await databases.createIntegerAttribute(
          DATABASE_ID,
          COLLECTION_ID,
          attr.key,
          attr.required,
          attr.min,
          attr.max,
          null // default
        );
      } else if (attr.typ === 'string') {
        await databases.createStringAttribute(
          DATABASE_ID,
          COLLECTION_ID,
          attr.key,
          attr.size,
          attr.required,
          null, // default
          false // array
        );
      }
      
      console.log(`   ✅ ${attr.key} erfolgreich angelegt!`);
      
      // Kurz warten, da Appwrite Zeit braucht um Attribute zu verarbeiten
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error) {
      if (error.code === 409) {
        console.log(`   ⏭️  ${attr.key} existiert bereits - übersprungen`);
      } else {
        console.error(`   ❌ Fehler bei ${attr.key}:`, error.message);
      }
    }
  }

  console.log('\n✨ Fertig! Alle Attribute wurden verarbeitet.');
  console.log('\n⚠️  WICHTIG: Warte 1-2 Minuten, bis Appwrite die Attribute aktiviert hat!');
}

createAttributes().catch(console.error);
