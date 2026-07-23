/**
 * Diagnose: zeigt für eine bestimmte Saison alle echten Rechnungen + Stornos im Bereich
 * eines bestimmten Nummern-Fensters. Hilft beim Verstehen einzelner Konflikte.
 *
 * Ausführen: npx tsx scripts/zeige-luecke.ts <saison> <von> <bis>
 * Beispiel:  npx tsx scripts/zeige-luecke.ts 2026 145 155
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  process.exit(1);
}

const SAISON = Number(process.argv[2] ?? 2026);
const VON = Number(process.argv[3] ?? 1);
const BIS = Number(process.argv[4] ?? 9999);

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'bestellabwicklung_dokumente';

interface Doc {
  $id: string;
  $createdAt: string;
  dokumentTyp: string;
  dokumentNummer: string;
  projektId: string;
  rechnungsStatus?: string;
  stornoVonRechnungsnummer?: string;
}

function parseNr(s: string) {
  const m = s.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  return m ? { prefix: m[1], saison: parseInt(m[2], 10), lauf: parseInt(m[3], 10) } : null;
}

async function main() {
  const docs: Doc[] = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Query.equal('dokumentTyp', ['rechnung', 'stornorechnung']),
      Query.limit(100),
      Query.offset(offset),
    ]);
    for (const d of res.documents) {
      docs.push(d as unknown as Doc);
    }
    if (res.documents.length < 100) break;
    offset += 100;
    if (offset > 50000) break;
  }

  const inFenster = docs
    .map((d) => ({ ...d, parsed: parseNr(d.dokumentNummer) }))
    .filter((d) => d.parsed && d.parsed.saison === SAISON && d.parsed.lauf >= VON && d.parsed.lauf <= BIS)
    .sort((a, b) => (a.parsed?.lauf ?? 0) - (b.parsed?.lauf ?? 0));

  console.log(`📋 RE-${SAISON}-${String(VON).padStart(4, '0')} bis RE-${SAISON}-${String(BIS).padStart(4, '0')}\n`);
  console.log('Nr             Typ              Erstellt am       Storno zu      Projekt');
  console.log('─'.repeat(95));

  let letzte = VON - 1;
  for (const d of inFenster) {
    const lauf = d.parsed!.lauf;
    // Fehlende Nummern markieren
    for (let n = letzte + 1; n < lauf; n++) {
      console.log(`RE-${SAISON}-${String(n).padStart(4, '0')}   (Lücke — nie verwendet)`);
    }
    const typ = d.dokumentTyp === 'rechnung' ? 'Rechnung      ' : 'Stornorechnung';
    const datum = (d.$createdAt || '').slice(0, 16).replace('T', ' ');
    const stornoZu = d.stornoVonRechnungsnummer ?? '–';
    console.log(`${d.dokumentNummer}   ${typ}   ${datum}   ${stornoZu.padEnd(14)}  ${d.projektId.slice(0, 12)}…`);
    letzte = lauf;
  }
}

main().catch((e) => {
  console.error('❌ Fehler:', e);
  process.exit(1);
});
