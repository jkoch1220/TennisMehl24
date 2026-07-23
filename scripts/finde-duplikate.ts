/**
 * READ-ONLY: findet doppelt vergebene Rechnungsnummern und zeigt für jedes Duplikat alle
 * relevanten Felder zum Vergleich. KEINE Schreibvorgänge.
 *
 * Ausführen: npx tsx scripts/finde-duplikate.ts 2026
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Env fehlt');
  process.exit(1);
}

const SAISON = Number(process.argv[2] ?? 2026);

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);
const DB = 'tennismehl24_db';
const COL = 'bestellabwicklung_dokumente';

interface Doc {
  $id: string;
  $createdAt: string;
  $updatedAt?: string;
  dokumentTyp: string;
  dokumentNummer: string;
  projektId: string;
  dateiId: string;
  dateiname: string;
  bruttobetrag?: number;
  rechnungsStatus?: string;
  stornoVonRechnungId?: string;
  stornoVonRechnungsnummer?: string;
  istFinal?: boolean;
  version?: number;
}

function parseNr(s: string) {
  const m = s.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  return m ? { prefix: m[1], saison: parseInt(m[2], 10), lauf: parseInt(m[3], 10) } : null;
}

async function main() {
  console.log(`🔍 Suche Duplikate in Saison ${SAISON}`);
  console.log('='.repeat(80));

  const alle: Doc[] = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DB, COL, [Query.limit(100), Query.offset(offset)]);
    for (const d of res.documents) alle.push(d as unknown as Doc);
    if (res.documents.length < 100) break;
    offset += 100;
    if (offset > 100000) break;
  }
  console.log(`📊 ${alle.length} Dokumente gesamt in der Collection geladen\n`);

  // Gruppieren nach dokumentNummer — NUR finale Dokumente (Rechnung + Storno) sind kritisch.
  // AB/Angebot/Lieferschein haben legitime Versionen (gleiche Nummer, neuer Inhalt nach Korrektur).
  const NUR_FINAL = process.argv.includes('--alle') ? false : true;
  const gruppen = new Map<string, Doc[]>();
  for (const d of alle) {
    const p = parseNr(d.dokumentNummer);
    if (!p || p.saison !== SAISON) continue;
    if (NUR_FINAL && d.dokumentTyp !== 'rechnung' && d.dokumentTyp !== 'stornorechnung') continue;
    const liste = gruppen.get(d.dokumentNummer) ?? [];
    liste.push(d);
    gruppen.set(d.dokumentNummer, liste);
  }
  console.log(NUR_FINAL ? `🔒 Filter: NUR finale Dokumente (Rechnungen + Stornos)\n` : `🔓 Filter: ALLE Dokumente inkl. AB/Angebot/LS\n`);

  const duplikate = Array.from(gruppen.entries()).filter(([, liste]) => liste.length > 1);
  duplikate.sort((a, b) => a[0].localeCompare(b[0]));

  console.log(`📋 Saison ${SAISON}: ${gruppen.size} eindeutige Nummern, ${duplikate.length} davon mehrfach vergeben.\n`);

  if (duplikate.length === 0) {
    console.log('✅ Keine Duplikate gefunden.');
    return;
  }

  // Statistik nach Pattern
  const proPattern: Record<string, number> = {};

  for (const [nummer, liste] of duplikate) {
    const sortiert = [...liste].sort((a, b) => (a.$createdAt || '').localeCompare(b.$createdAt || ''));
    const typen = sortiert.map((d) => d.dokumentTyp).join('+');
    proPattern[typen] = (proPattern[typen] ?? 0) + 1;

    console.log(`▶ ${nummer}  (${sortiert.length}× vergeben)`);
    console.log('  ─'.repeat(40));
    for (const d of sortiert) {
      const datum = (d.$createdAt || '').slice(0, 19).replace('T', ' ');
      const upd = d.$updatedAt && d.$updatedAt !== d.$createdAt
        ? `   ✏️ aktualisiert ${(d.$updatedAt || '').slice(0, 19).replace('T', ' ')}`
        : '';
      const status = d.rechnungsStatus ?? '(kein Status)';
      const brutto = typeof d.bruttobetrag === 'number' ? `${d.bruttobetrag.toFixed(2)} €` : '–';
      console.log(`  ${datum}  ${d.dokumentTyp.padEnd(15)}  ${status.padEnd(11)}  ${brutto.padStart(10)}  dateiId ${d.dateiId.slice(0, 14)}…${upd}`);
      console.log(`     projekt ${d.projektId}   docId ${d.$id}`);
      if (d.stornoVonRechnungsnummer) console.log(`     → Storno zu ${d.stornoVonRechnungsnummer}`);
    }
    console.log('');
  }

  console.log('\n📊 Duplikat-Muster:');
  for (const [pattern, anzahl] of Object.entries(proPattern).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${pattern.padEnd(50)} ${anzahl}× `);
  }
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
