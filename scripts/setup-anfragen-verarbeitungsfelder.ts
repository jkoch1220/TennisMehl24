/**
 * Ergänzt die fehlenden Verarbeitungs-Attribute der Collection `anfragen`.
 *
 * Hintergrund: `anfragenService` schreibt beim Bearbeiten einer Anfrage Felder wie
 * `aktualisiertAm`, `angebotId` oder `notizen`. Diese Attribute fehlten in der
 * Collection — Appwrite lehnt das gesamte Update dann mit
 * "Unknown attribute" ab. Folge: Eine bearbeitete Anfrage blieb für immer auf
 * `status: 'neu'`, und das Anfragen-Tool musste den Bearbeitungsstand aus dem
 * E-Mail-Protokoll erraten (was fehlschlägt, sobald das Angebot an eine andere
 * Adresse geht als die des Anfragenden).
 *
 * Rein additiv: legt nur fehlende, optionale Attribute an. Bestehende Daten
 * bleiben unberührt. Mehrfaches Ausführen ist unschädlich.
 *
 * Ausführen mit:  npx tsx scripts/setup-anfragen-verarbeitungsfelder.ts
 * Vorschau mit:   npx tsx scripts/setup-anfragen-verarbeitungsfelder.ts --dry-run
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

const dryRun = process.argv.includes('--dry-run');

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'anfragen';

// Alle Felder optional — Altbestand hat sie nicht.
const FELDER: { key: string; size: number; zweck: string }[] = [
  { key: 'aktualisiertAm', size: 50, zweck: 'Zeitstempel der letzten Änderung (blockiert sonst JEDES Update)' },
  { key: 'zugeordneterKundeId', size: 100, zweck: 'Verknüpfter Kunde' },
  { key: 'zugeordneterKundeTyp', size: 50, zweck: 'Kundentyp (kunde/saisonkunde)' },
  { key: 'zugeordnetAm', size: 50, zweck: 'Zeitpunkt der Kundenzuordnung' },
  { key: 'zugeordnetVon', size: 100, zweck: 'Wer den Kunden zugeordnet hat' },
  { key: 'angebotId', size: 100, zweck: 'Verknüpftes Angebot/Projekt' },
  { key: 'angebotErstelltAm', size: 50, zweck: 'Zeitpunkt der Angebotserstellung' },
  { key: 'bearbeitetAm', size: 50, zweck: 'Zeitpunkt der Bearbeitung' },
  { key: 'notizen', size: 2000, zweck: 'Interne Notizen / Wichtig-Markierung' },
  { key: 'n8nWorkflowId', size: 100, zweck: 'Herkunft aus n8n-Workflow' },
  { key: 'n8nExecutionId', size: 100, zweck: 'n8n-Ausführungs-ID' },
];

const warte = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`\n📦 Collection: ${DATABASE_ID}/${COLLECTION_ID}${dryRun ? '  (DRY-RUN)' : ''}\n`);

  const collection = await databases.getCollection(DATABASE_ID, COLLECTION_ID);
  const vorhanden = new Set(collection.attributes.map((a: { key: string }) => a.key));

  let angelegt = 0;
  for (const feld of FELDER) {
    if (vorhanden.has(feld.key)) {
      console.log(`  ✅ ${feld.key} existiert bereits`);
      continue;
    }

    if (dryRun) {
      console.log(`  ➕ ${feld.key} (string/${feld.size}) würde angelegt — ${feld.zweck}`);
      angelegt++;
      continue;
    }

    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, feld.key, feld.size, false);
    console.log(`  ➕ ${feld.key} (string/${feld.size}) angelegt — ${feld.zweck}`);
    angelegt++;
    // Appwrite verarbeitet Attribut-Anlagen asynchron; kurze Pause verhindert Rate-Limits.
    await warte(600);
  }

  console.log(
    `\n${dryRun ? 'Vorschau' : 'Fertig'}: ${angelegt} Attribut(e) ${dryRun ? 'offen' : 'angelegt'}, ` +
      `${FELDER.length - angelegt} bereits vorhanden.\n`
  );

  if (!dryRun && angelegt > 0) {
    console.log('ℹ️  Appwrite legt Attribute asynchron an. Vor dem ersten Schreibzugriff');
    console.log('    kurz warten, bis alle den Status "available" haben.\n');
  }
}

main().catch((error) => {
  console.error('❌ Fehler:', error instanceof Error ? error.message : error);
  process.exit(1);
});
