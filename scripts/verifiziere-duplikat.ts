/**
 * Verifizierungs-Script: fragt Appwrite GANZ direkt nach allen Dokumenten mit einer
 * bestimmten dokumentNummer. KEINE Aggregation, keine Pagination-Tricks — purer Query.
 *
 * Ausführen: npx tsx scripts/verifiziere-duplikat.ts RE-2026-0144
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);
const databases = new Databases(client);

const NUMMER = process.argv[2];
if (!NUMMER) {
  console.error('Bitte Nummer angeben: npx tsx scripts/verifiziere-duplikat.ts RE-2026-0144');
  process.exit(1);
}

async function main() {
  const res = await databases.listDocuments(
    'tennismehl24_db',
    'bestellabwicklung_dokumente',
    [Query.equal('dokumentNummer', NUMMER), Query.limit(50)]
  );

  console.log(`\n🔍 Appwrite-Query: dokumentNummer = "${NUMMER}"`);
  console.log(`📋 Treffer: ${res.documents.length} Dokumente\n`);

  for (let i = 0; i < res.documents.length; i++) {
    const d = res.documents[i] as Record<string, unknown>;
    console.log(`── Treffer ${i + 1} ─────────────────────────────────`);
    console.log(`   docId:           ${d.$id}`);
    console.log(`   createdAt:       ${d.$createdAt}`);
    console.log(`   updatedAt:       ${d.$updatedAt}`);
    console.log(`   dokumentTyp:     ${d.dokumentTyp}`);
    console.log(`   dokumentNummer:  ${d.dokumentNummer}`);
    console.log(`   projektId:       ${d.projektId}`);
    console.log(`   dateiId:         ${d.dateiId}`);
    console.log(`   dateiname:       ${d.dateiname}`);
    console.log(`   rechnungsStatus: ${d.rechnungsStatus ?? '(nicht gesetzt)'}`);
    console.log(`   bruttobetrag:    ${d.bruttobetrag}`);
    console.log(`   istFinal:        ${d.istFinal}`);
    console.log('');
  }
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
