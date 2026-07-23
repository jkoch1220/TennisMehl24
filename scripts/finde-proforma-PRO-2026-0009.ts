/**
 * READ-ONLY: Sucht die Proforma-Rechnung PRO-2026-0009 und zeigt das zugehörige Projekt.
 * Hintergrund: ASC Dudweiler hat 1.390,00 € unter Verwendungszweck "PRO-2026-0009 TC Dudweiler" überwiesen.
 * Ausführen: npx tsx scripts/finde-proforma-PRO-2026-0009.ts
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);
const databases = new Databases(client);

const DB = 'tennismehl24_db';
const COL_DOKUMENTE = 'bestellabwicklung_dokumente';
const COL_PROJEKTE = 'projekte';
const COL_KUNDEN = 'kunden';
const COL_SAISONKUNDEN = 'saisonkunden';

const GESUCHTE_NUMMER = 'PRO-2026-0009';

async function main() {
  console.log(`\n🔍 Suche nach Proforma-Rechnung: ${GESUCHTE_NUMMER}\n`);

  // 1) Direkte Suche im Dokumente-Collection nach dokumentNummer
  const dokRes = await databases.listDocuments(DB, COL_DOKUMENTE, [
    Query.equal('dokumentNummer', GESUCHTE_NUMMER),
    Query.limit(25),
  ]);

  if (dokRes.documents.length === 0) {
    console.log(`❌ Keine Dokumente mit Nummer ${GESUCHTE_NUMMER} in '${COL_DOKUMENTE}' gefunden.`);
    console.log(`\nVersuche Fallback: alle proformarechnungen 2026 listen...\n`);
    const fallback = await databases.listDocuments(DB, COL_DOKUMENTE, [
      Query.equal('dokumentTyp', 'proformarechnung'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]);
    console.log(`Gefunden: ${fallback.documents.length} Proforma-Dokumente`);
    for (const d of fallback.documents) {
      const data: any = d;
      console.log(`  ${data.dokumentNummer}  projekt=${data.projektId}  brutto=${data.bruttobetrag}  created=${data.$createdAt}`);
    }
    return;
  }

  for (const dok of dokRes.documents) {
    const d: any = dok;
    console.log(`✅ Dokument gefunden:`);
    console.log(`   $id            : ${d.$id}`);
    console.log(`   dokumentNummer : ${d.dokumentNummer}`);
    console.log(`   dokumentTyp    : ${d.dokumentTyp}`);
    console.log(`   projektId      : ${d.projektId}`);
    console.log(`   bruttobetrag   : ${d.bruttobetrag}`);
    console.log(`   created        : ${d.$createdAt}`);
    console.log(`   dateiname      : ${d.dateiname}`);

    // 2) Projekt laden
    if (d.projektId) {
      try {
        const projekt: any = await databases.getDocument(DB, COL_PROJEKTE, d.projektId);
        console.log(`\n📁 Zugehöriges Projekt:`);
        console.log(`   $id            : ${projekt.$id}`);
        console.log(`   projektNummer  : ${projekt.projektNummer ?? projekt.projektnummer ?? '-'}`);
        console.log(`   status         : ${projekt.status}`);
        console.log(`   kundenId       : ${projekt.kundenId ?? projekt.saisonkundeId ?? '-'}`);
        console.log(`   rechnungsnr.   : ${projekt.rechnungsnummer ?? '-'}`);
        console.log(`   rechnungsdatum : ${projekt.rechnungsdatum ?? '-'}`);
        console.log(`   created        : ${projekt.$createdAt}`);

        // Kunde laden (versuche beide Collections)
        const kundenId = projekt.kundenId ?? projekt.saisonkundeId;
        if (kundenId) {
          for (const coll of [COL_KUNDEN, COL_SAISONKUNDEN]) {
            try {
              const k: any = await databases.getDocument(DB, coll, kundenId);
              console.log(`\n👤 Kunde (${coll}):`);
              console.log(`   name           : ${k.name ?? k.vereinsname ?? '-'}`);
              console.log(`   kundennummer   : ${k.kundennummer ?? '-'}`);
              console.log(`   ort            : ${k.ort ?? '-'}`);
              break;
            } catch { /* nicht in dieser collection */ }
          }
        }

        console.log(`\n🔗 Portal-URL (Projektabwicklung):`);
        console.log(`   /projektabwicklung/${projekt.$id}`);
      } catch (e: any) {
        console.log(`⚠️  Projekt ${d.projektId} konnte nicht geladen werden: ${e.message}`);
      }
    }
  }
}

main().catch((e) => {
  console.error('FEHLER:', e);
  process.exit(1);
});
