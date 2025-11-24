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

const endpoint = process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.VITE_APPWRITE_PROJECT_ID || 'tennismehl24';
const apiKey = process.env.VITE_APPWRITE_API_KEY;

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

// Felder für fixkosten Collection
const fixkostenFields = [
  // Grundstück
  { key: 'grundstueck_pacht', type: 'double', required: false },
  { key: 'grundstueck_steuer', type: 'double', required: false },
  { key: 'grundstueck_pflege', type: 'double', required: false },
  { key: 'grundstueck_buerocontainer', type: 'double', required: false },
  // Maschinen
  { key: 'maschinen_wartungRadlader', type: 'double', required: false },
  { key: 'maschinen_wartungStapler', type: 'double', required: false },
  { key: 'maschinen_wartungMuehle', type: 'double', required: false },
  { key: 'maschinen_wartungSiebanlage', type: 'double', required: false },
  { key: 'maschinen_wartungAbsackanlage', type: 'double', required: false },
  { key: 'maschinen_sonstigeWartung', type: 'double', required: false },
  { key: 'maschinen_grundkostenMaschinen', type: 'double', required: false },
  // Sonstige
  { key: 'ruecklagenErsatzkauf', type: 'double', required: false },
  { key: 'sonstiges', type: 'double', required: false },
  // Verwaltung
  { key: 'verwaltung_sigleKuhn', type: 'double', required: false },
  { key: 'verwaltung_brzSteuerberater', type: 'double', required: false },
  { key: 'verwaltung_kostenVorndran', type: 'double', required: false },
  { key: 'verwaltung_telefonCloudServer', type: 'double', required: false },
  { key: 'verwaltung_gewerbesteuer', type: 'double', required: false },
];

// Felder für variable_kosten Collection
const variableKostenFields = [
  // Lohnkosten
  { key: 'lohnkosten_stundenlohn', type: 'double', required: false },
  { key: 'lohnkosten_tonnenProArbeitsstunde', type: 'double', required: false },
  // Einkauf
  { key: 'einkauf_dieselKostenProTonne', type: 'double', required: false },
  { key: 'einkauf_ziegelbruchKostenProTonne', type: 'double', required: false },
  { key: 'einkauf_stromKostenProTonne', type: 'double', required: false },
  { key: 'einkauf_entsorgungContainerKostenProTonne', type: 'double', required: false },
  { key: 'einkauf_gasflaschenKostenProTonne', type: 'double', required: false },
  // Verschleißteile
  { key: 'verschleissteile_preisProHammer', type: 'double', required: false },
  { key: 'verschleissteile_verbrauchHaemmerProTonne', type: 'double', required: false },
  { key: 'verschleissteile_siebkoerbeKostenProTonne', type: 'double', required: false },
  { key: 'verschleissteile_verschleissblecheKostenProTonne', type: 'double', required: false },
  { key: 'verschleissteile_wellenlagerKostenProTonne', type: 'double', required: false },
  // Sackware
  { key: 'sackware_palettenKostenProPalette', type: 'double', required: false },
  { key: 'sackware_saeckeKostenProPalette', type: 'double', required: false },
  { key: 'sackware_schrumpfhaubenKostenProPalette', type: 'double', required: false },
  { key: 'sackware_palettenProTonne', type: 'double', required: false },
  // Verkaufspreise
  { key: 'verkaufspreis1_tonnen', type: 'double', required: false },
  { key: 'verkaufspreis1_preisProTonne', type: 'double', required: false },
  { key: 'verkaufspreis2_tonnen', type: 'double', required: false },
  { key: 'verkaufspreis2_preisProTonne', type: 'double', required: false },
  { key: 'verkaufspreis3_tonnen', type: 'double', required: false },
  { key: 'verkaufspreis3_preisProTonne', type: 'double', required: false },
  // Sonstiges
  { key: 'geplanterUmsatz', type: 'double', required: false },
];

async function createField(collectionId, field) {
  try {
    // Verwende die spezifische Methode für Double-Attribute
    if (field.type === 'double') {
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

