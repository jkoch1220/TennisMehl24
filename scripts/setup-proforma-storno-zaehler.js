/**
 * Script zum Hinzufügen der fehlenden Zähler-Attribute zur Stammdaten-Collection
 *
 * Fügt hinzu:
 * - stornoZaehler (Integer) - für Stornorechnung-Nummerierung
 * - proformaZaehler (Integer) - für Proforma-Rechnung-Nummerierung
 *
 * Ausführen mit:
 * node scripts/setup-proforma-storno-zaehler.js
 */

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
  process.exit(1);
}

const DATABASE_ID = 'tennismehl24_db';
const STAMMDATEN_COLLECTION_ID = 'stammdaten';

// Neue Felder die hinzugefügt werden sollen
const neueFelder = [
  { key: 'stornoZaehler', type: 'integer', default: 0 },
  { key: 'proformaZaehler', type: 'integer', default: 0 },
];

async function createField(field) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
    };

    const body = {
      key: field.key,
      required: false,
      default: field.default ?? null,
      array: false,
    };

    const response = await fetch(
      `${endpoint}/databases/${DATABASE_ID}/collections/${STAMMDATEN_COLLECTION_ID}/attributes/${field.type}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );

    if (response.ok) {
      console.log(`✅ Feld erstellt: ${field.key}`);
      // Warte auf die Verarbeitung durch Appwrite
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } else if (response.status === 409) {
      console.log(`⏭️  Feld existiert bereits: ${field.key}`);
      return false;
    } else {
      const error = await response.json();
      console.error(`❌ Fehler beim Erstellen von ${field.key}:`, error.message || error);
      return false;
    }
  } catch (error) {
    console.error(`❌ Fehler beim Erstellen von ${field.key}:`, error.message || error);
    return false;
  }
}

async function main() {
  console.log('🚀 Füge fehlende Zähler-Attribute zur Stammdaten-Collection hinzu...\n');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Collection: ${STAMMDATEN_COLLECTION_ID}\n`);

  try {
    for (const field of neueFelder) {
      await createField(field);
      // Kurze Pause zwischen den Requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n✨ Setup abgeschlossen!');
    console.log('\n⚠️  WICHTIG: Warte einige Sekunden, bis Appwrite die Felder vollständig erstellt hat.');
    console.log('   Danach kannst du die App neu laden.\n');
  } catch (error) {
    console.error('\n❌ Fehler beim Setup:', error);
    process.exit(1);
  }
}

main();
