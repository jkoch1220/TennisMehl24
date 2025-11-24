/**
 * Script zum automatischen Anlegen der Appwrite Collection-Felder
 * 
 * Führe dieses Script einmalig aus mit:
 * npm run setup:appwrite
 * 
 * Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY
 * 
 * Für Netlify: Setze diese als Umgebungsvariablen im Dashboard
 */

import { Client, Databases } from 'appwrite';
import dotenv from 'dotenv';

// Lade Umgebungsvariablen aus .env (für lokale Entwicklung)
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId) {
  console.error('❌ VITE_APPWRITE_ENDPOINT und VITE_APPWRITE_PROJECT_ID müssen gesetzt sein!');
  process.exit(1);
}

if (!apiKey) {
  console.error('❌ VITE_APPWRITE_API_KEY ist nicht gesetzt!');
  console.log('Bitte erstelle einen API Key in Appwrite mit folgenden Berechtigungen:');
  console.log('- databases.read');
  console.log('- databases.write');
  console.log('- databases.update');
  console.log('- databases.delete');
  process.exit(1);
}

const client = new Client();
client.setEndpoint(endpoint).setProject(projectId).setKey(apiKey);

const databases = new Databases(client);
const DATABASE_ID = 'tennismehl24_db';
const FIXKOSTEN_COLLECTION_ID = 'fixkosten';
const VARIABLE_KOSTEN_COLLECTION_ID = 'variable_kosten';

// NEUES SCHEMA: Nur noch 2 Felder pro Collection!
// - data (String/JSON): Enthält alle Werte als JSON
// - updatedAt (DateTime): Automatisch von Appwrite verwaltet

const fixkostenFields = [
  { key: 'data', type: 'string', required: false, size: 10000 }, // JSON-String mit allen Daten
];

const variableKostenFields = [
  { key: 'data', type: 'string', required: false, size: 10000 }, // JSON-String mit allen Daten
];

async function createField(collectionId, field) {
  try {
    // Verwende die spezifische Methode für String-Attribute (JSON)
    if (field.type === 'string') {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        field.key,
        field.size || 255, // Größe für JSON-String
        field.required || false
      );
    } else if (field.type === 'double') {
      await databases.createFloatAttribute(
        DATABASE_ID,
        collectionId,
        field.key,
        field.required || false,
        null, // default
        false // array
      );
    } else {
      // Fallback für andere Typen
      await databases.createAttribute(
        DATABASE_ID,
        collectionId,
        field.key,
        field.type,
        field.required || false
      );
    }
    console.log(`✅ Feld erstellt: ${field.key}`);
    // Warte auf die Verarbeitung durch Appwrite
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  } catch (error) {
    if (error.code === 409 || error.message?.includes('already exists')) {
      console.log(`⏭️  Feld existiert bereits: ${field.key}`);
      return false;
    } else {
      console.error(`❌ Fehler beim Erstellen von ${field.key}:`, error.message || error);
      return false;
    }
  }
}

async function setupCollection(collectionId, collectionName, fields) {
  console.log(`\n📦 Setup für Collection: ${collectionName} (${collectionId})`);
  console.log(`   Erstelle ${fields.length} Felder...\n`);

  for (const field of fields) {
    await createField(collectionId, field);
    // Kurze Pause zwischen den Requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function main() {
  console.log('🚀 Starte Appwrite Field Setup...\n');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project ID: ${projectId}\n`);

  try {
    await setupCollection(FIXKOSTEN_COLLECTION_ID, 'Fixkosten', fixkostenFields);
    await setupCollection(VARIABLE_KOSTEN_COLLECTION_ID, 'Variable Kosten', variableKostenFields);

    console.log('\n✨ Setup abgeschlossen!');
    console.log('\n⚠️  WICHTIG: Warte einige Sekunden, bis Appwrite die Felder vollständig erstellt hat.');
    console.log('   Danach kannst du die App verwenden.\n');
  } catch (error) {
    console.error('\n❌ Fehler beim Setup:', error);
    process.exit(1);
  }
}

main();

