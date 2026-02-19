/**
 * Duplikate-Finder Script
 * Führe aus mit: npx tsx scripts/find-duplicates.ts
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.VITE_APPWRITE_API_KEY!);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';

function parseDocument<T>(doc: any): T {
  if (doc?.data && typeof doc.data === 'string') {
    try {
      return { ...JSON.parse(doc.data), id: doc.$id, $id: doc.$id };
    } catch {
      return { id: doc.$id, $id: doc.$id } as T;
    }
  }
  return { id: doc.$id, $id: doc.$id } as T;
}

// Normalisiere Namen für Vergleich
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+e\.?\s*v\.?/gi, '')  // "e.V." entfernen
    .replace(/tennis[-\s]?club/gi, 'tc')
    .replace(/tennisclub/gi, 'tc')
    .replace(/sportverein/gi, 'sv')
    .replace(/turn[-\s]?und[-\s]?sport[-\s]?verein/gi, 'tsv')
    .replace(/1\.\s*/g, '1')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('🔍 Suche nach Duplikaten...\n');

  try {
    // Lade alle Kunden
    const alleKunden = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    console.log(`📊 Gefunden: ${alleKunden.documents.length} Kunden gesamt\n`);

    // Nur Vereine (keine Platzbauer)
    const vereine = alleKunden.documents
      .map(doc => parseDocument<any>(doc))
      .filter(k => k.typ === 'verein');

    console.log(`🏟️ Davon Vereine: ${vereine.length}\n`);

    // Gruppiere nach normalisiertem Namen
    const gruppen: Record<string, any[]> = {};

    for (const verein of vereine) {
      const normalized = normalizeName(verein.name || '');
      if (!gruppen[normalized]) {
        gruppen[normalized] = [];
      }
      gruppen[normalized].push(verein);
    }

    // Finde Duplikate (mehr als ein Eintrag pro Gruppe)
    const duplikate = Object.entries(gruppen)
      .filter(([_, members]) => members.length > 1)
      .sort((a, b) => b[1].length - a[1].length);

    if (duplikate.length === 0) {
      console.log('✅ Keine Duplikate gefunden!\n');
      return;
    }

    console.log('⚠️  DUPLIKATE GEFUNDEN:\n');
    console.log('='.repeat(80));

    for (const [normalizedName, members] of duplikate) {
      console.log(`\n📌 Normalisierter Name: "${normalizedName}"`);
      console.log('-'.repeat(60));

      for (const member of members) {
        const createdAt = member.$createdAt || member.erstelltAm || 'unbekannt';
        const platzbauerId = member.standardPlatzbauerId || 'keiner';
        const bezugsweg = member.standardBezugsweg || 'unbekannt';

        console.log(`  ID: ${member.$id}`);
        console.log(`  Name: "${member.name}"`);
        console.log(`  PLZ/Ort: ${member.plz || ''} ${member.ort || ''}`);
        console.log(`  Platzbauer-ID: ${platzbauerId}`);
        console.log(`  Bezugsweg: ${bezugsweg}`);
        console.log(`  Erstellt: ${createdAt}`);
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log(`\n📊 ZUSAMMENFASSUNG:`);
    console.log(`   ${duplikate.length} Duplikat-Gruppen gefunden`);
    console.log(`   ${duplikate.reduce((sum, [_, m]) => sum + m.length, 0)} betroffene Einträge\n`);

    // Liste der IDs die möglicherweise gelöscht werden könnten
    console.log('\n🔎 DETAILS ZUR ENTSCHEIDUNG:');
    console.log('   Bei Duplikaten sollte der ÄLTERE Eintrag behalten werden,');
    console.log('   da dieser möglicherweise bereits Beziehungen hat.\n');

  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
