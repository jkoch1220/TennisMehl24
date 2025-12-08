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
const KUNDEN_COLLECTION_ID = 'kunden';
const KUNDEN_AKTIVITAETEN_COLLECTION_ID = 'kunden_aktivitaeten';

const fixkostenFields = [
  { key: 'grundstueck_pacht', type: 'double' },
  { key: 'grundstueck_steuer', type: 'double' },
  { key: 'grundstueck_pflege', type: 'double' },
  { key: 'grundstueck_buerocontainer', type: 'double' },
  { key: 'maschinen_wartungRadlader', type: 'double' },
  { key: 'maschinen_wartungStapler', type: 'double' },
  { key: 'maschinen_wartungMuehle', type: 'double' },
  { key: 'maschinen_wartungSiebanlage', type: 'double' },
  { key: 'maschinen_wartungAbsackanlage', type: 'double' },
  { key: 'maschinen_sonstigeWartung', type: 'double' },
  { key: 'maschinen_grundkostenMaschinen', type: 'double' },
  { key: 'ruecklagenErsatzkauf', type: 'double' },
  { key: 'sonstiges', type: 'double' },
  { key: 'verwaltung_sigleKuhn', type: 'double' },
  { key: 'verwaltung_brzSteuerberater', type: 'double' },
  { key: 'verwaltung_kostenVorndran', type: 'double' },
  { key: 'verwaltung_telefonCloudServer', type: 'double' },
  { key: 'verwaltung_gewerbesteuer', type: 'double' },
  { key: 'data', type: 'string', size: 10000 },
];

const variableKostenFields = [
  { key: 'lohnkosten_stundenlohn', type: 'double' },
  { key: 'lohnkosten_tonnenProArbeitsstunde', type: 'double' },
  { key: 'einkauf_dieselKostenProTonne', type: 'double' },
  { key: 'einkauf_ziegelbruchKostenProTonne', type: 'double' },
  { key: 'einkauf_stromKostenProTonne', type: 'double' },
  { key: 'einkauf_entsorgungContainerKostenProTonne', type: 'double' },
  { key: 'einkauf_gasflaschenKostenProTonne', type: 'double' },
  { key: 'verschleissteile_preisProHammer', type: 'double' },
  { key: 'verschleissteile_verbrauchHaemmerProTonne', type: 'double' },
  { key: 'verschleissteile_siebkoerbeKostenProTonne', type: 'double' },
  { key: 'verschleissteile_verschleissblecheKostenProTonne', type: 'double' },
  { key: 'verschleissteile_wellenlagerKostenProTonne', type: 'double' },
  { key: 'sackware_palettenKostenProPalette', type: 'double' },
  { key: 'sackware_saeckeKostenProPalette', type: 'double' },
  { key: 'sackware_schrumpfhaubenKostenProPalette', type: 'double' },
  { key: 'sackware_palettenProTonne', type: 'double' },
  { key: 'verkaufspreis1_tonnen', type: 'double' },
  { key: 'verkaufspreis1_preisProTonne', type: 'double' },
  { key: 'verkaufspreis2_tonnen', type: 'double' },
  { key: 'verkaufspreis2_preisProTonne', type: 'double' },
  { key: 'verkaufspreis3_tonnen', type: 'double' },
  { key: 'verkaufspreis3_preisProTonne', type: 'double' },
  { key: 'geplanterUmsatz', type: 'double' },
  { key: 'data', type: 'string', size: 10000 },
];

const kundenFields = [
  { key: 'name', type: 'string', size: 500, required: true },
  { key: 'kundenTyp', type: 'string', size: 50, required: true },
  { key: 'bestelltDirekt', type: 'boolean', default: false },
  { key: 'adresse_strasse', type: 'string', size: 500 },
  { key: 'adresse_plz', type: 'string', size: 20 },
  { key: 'adresse_ort', type: 'string', size: 200 },
  { key: 'lieferadresse_strasse', type: 'string', size: 500 },
  { key: 'lieferadresse_plz', type: 'string', size: 20 },
  { key: 'lieferadresse_ort', type: 'string', size: 200 },
  { key: 'bestelltUeberIds', type: 'string', size: 100, array: true },
  { key: 'tennisplatzAnzahl', type: 'integer', default: 0 },
  { key: 'tonnenProJahr', type: 'double', default: 0 },
  { key: 'telefonnummer', type: 'string', size: 100 },
  { key: 'ansprechpartner', type: 'string', size: 200 },
  { key: 'email', type: 'string', size: 320 },
  { key: 'zahlungsbedingungen', type: 'string', size: 500 },
  { key: 'zahlungsverhalten', type: 'string', size: 500 },
  { key: 'zahlungszielTage', type: 'integer', default: 0 },
  { key: 'bemerkungen', type: 'string', size: 1000 },
  { key: 'erstelltAm', type: 'string', size: 50 },
  { key: 'aktualisiertAm', type: 'string', size: 50 },
  { key: 'data', type: 'string', size: 10000 },
];

const kundenAktivitaetenFields = [
  { key: 'kundeId', type: 'string', size: 100, required: true },
  { key: 'typ', type: 'string', size: 50, required: true },
  { key: 'titel', type: 'string', size: 500, required: true },
  { key: 'beschreibung', type: 'string', size: 2000 },
  { key: 'dateiId', type: 'string', size: 100 },
  { key: 'dateiName', type: 'string', size: 500 },
  { key: 'dateiTyp', type: 'string', size: 200 },
  { key: 'dateiGroesse', type: 'integer' },
  { key: 'erstelltAm', type: 'string', size: 50 },
  { key: 'erstelltVon', type: 'string', size: 100 },
  { key: 'data', type: 'string', size: 10000 },
];

async function createField(collectionId, field) {
  try {
    if (field.type === 'string') {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        field.key,
        field.size || 500,
        field.required || false,
        field.default ?? null,
        field.array || false
      );
    } else if (field.type === 'double') {
      await databases.createFloatAttribute(
        DATABASE_ID,
        collectionId,
        field.key,
        field.required || false,
        field.default ?? null,
        field.array || false
      );
    } else if (field.type === 'integer') {
      await databases.createIntegerAttribute(
        DATABASE_ID,
        collectionId,
        field.key,
        field.required || false,
        field.default ?? null,
        field.array || false
      );
    } else if (field.type === 'boolean') {
      await databases.createBooleanAttribute(
        DATABASE_ID,
        collectionId,
        field.key,
        field.required || false,
        field.default ?? null,
        field.array || false
      );
    } else {
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
    await setupCollection(KUNDEN_COLLECTION_ID, 'Kunden', kundenFields);
    await setupCollection(KUNDEN_AKTIVITAETEN_COLLECTION_ID, 'Kunden Aktivitäten', kundenAktivitaetenFields);

    console.log('\n✨ Setup abgeschlossen!');
    console.log('\n⚠️  WICHTIG: Warte einige Sekunden, bis Appwrite die Felder vollständig erstellt hat.');
    console.log('   Danach kannst du die App verwenden.\n');
  } catch (error) {
    console.error('\n❌ Fehler beim Setup:', error);
    process.exit(1);
  }
}

main();

