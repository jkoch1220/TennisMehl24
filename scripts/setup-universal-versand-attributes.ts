/**
 * Setup-Script für neue Universal-Artikel Attribute (Versand/Zoll)
 *
 * Dieses Script fügt die neuen Felder für Versandcodes und Zollinformationen
 * zur universa_artikel Collection in Appwrite hinzu.
 *
 * Ausführung:
 *   npx tsx scripts/setup-universal-versand-attributes.ts
 *
 * Neue Felder:
 * - zolltarifnummer (string)
 * - ursprungsland (string)
 * - ursprungsregion (string)
 * - gewichtKg (double)
 * - laengeCm (double)
 * - breiteCm (double)
 * - hoeheCm (double)
 * - ean (string)
 * - versandcodeDE (string)
 * - versandcodeAT (string)
 * - versandcodeBenelux (string)
 * - versandartDE (string)
 * - istSperrgut (boolean)
 */

import { Client, Databases, ID } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client();
client
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID || '')
  .setKey(process.env.VITE_APPWRITE_API_KEY || '');

const databases = new Databases(client);
const DATABASE_ID = 'tennismehl24_db';
const UNIVERSA_ARTIKEL_COLLECTION_ID = 'universa_artikel';

interface AttributeConfig {
  key: string;
  type: 'string' | 'double' | 'boolean';
  size?: number;
  required?: boolean;
}

const newAttributes: AttributeConfig[] = [
  // Zoll & Herkunft
  { key: 'zolltarifnummer', type: 'string', size: 20, required: false },
  { key: 'ursprungsland', type: 'string', size: 5, required: false },
  { key: 'ursprungsregion', type: 'string', size: 10, required: false },

  // Physische Eigenschaften
  { key: 'gewichtKg', type: 'double', required: false },
  { key: 'laengeCm', type: 'double', required: false },
  { key: 'breiteCm', type: 'double', required: false },
  { key: 'hoeheCm', type: 'double', required: false },
  { key: 'ean', type: 'string', size: 20, required: false },

  // Versandcodes
  { key: 'versandcodeDE', type: 'string', size: 50, required: false },
  { key: 'versandcodeAT', type: 'string', size: 50, required: false },
  { key: 'versandcodeBenelux', type: 'string', size: 50, required: false },

  // Abgeleitete Felder
  { key: 'versandartDE', type: 'string', size: 20, required: false },
  { key: 'istSperrgut', type: 'boolean', required: false },
];

async function createAttribute(attr: AttributeConfig): Promise<boolean> {
  try {
    if (attr.type === 'string') {
      await databases.createStringAttribute(
        DATABASE_ID,
        UNIVERSA_ARTIKEL_COLLECTION_ID,
        attr.key,
        attr.size || 255,
        attr.required || false
      );
    } else if (attr.type === 'double') {
      await databases.createFloatAttribute(
        DATABASE_ID,
        UNIVERSA_ARTIKEL_COLLECTION_ID,
        attr.key,
        attr.required || false
      );
    } else if (attr.type === 'boolean') {
      await databases.createBooleanAttribute(
        DATABASE_ID,
        UNIVERSA_ARTIKEL_COLLECTION_ID,
        attr.key,
        attr.required || false
      );
    }
    console.log(`  ✓ ${attr.key} (${attr.type})`);
    return true;
  } catch (error: any) {
    if (error?.code === 409) {
      console.log(`  - ${attr.key} existiert bereits`);
      return true;
    }
    console.error(`  ✗ ${attr.key}: ${error?.message || 'Unbekannter Fehler'}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Universal-Artikel Versand-Attribute Setup');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Database: ${DATABASE_ID}`);
  console.log(`Collection: ${UNIVERSA_ARTIKEL_COLLECTION_ID}`);
  console.log('');

  let success = 0;
  let failed = 0;

  console.log('Füge neue Attribute hinzu:');
  console.log('');

  for (const attr of newAttributes) {
    const result = await createAttribute(attr);
    if (result) {
      success++;
    } else {
      failed++;
    }
    // Kurze Pause zwischen API-Calls
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('');
  console.log('-'.repeat(60));
  console.log(`Ergebnis: ${success} erfolgreich, ${failed} fehlgeschlagen`);
  console.log('');

  if (failed === 0) {
    console.log('Alle Attribute wurden erfolgreich angelegt!');
    console.log('');
    console.log('Nächster Schritt:');
    console.log('  1. In Appwrite Console die neuen Attribute verifizieren');
    console.log('  2. Artikelliste 2026 Excel importieren (Stammdaten > Universal Artikel)');
    console.log('');
  } else {
    console.log('Es gab Fehler beim Anlegen einiger Attribute.');
    console.log('Bitte prüfen Sie die Appwrite Console und versuchen Sie es erneut.');
  }
}

main().catch(console.error);
