/**
 * Diagnose-Script: Inspiziert ein einzelnes Projekt + zugehörige Rechnungsdokumente
 *
 * Hilft bei Datenproblemen wie Großheubach (Storno + Neuerstellung):
 * - Zeigt Projekt-Status, rechnungsnummer, rechnungsdatum
 * - Listet ALLE bestellabwicklung_dokumente (auch storniert + stornorechnungen)
 * - Zeigt rechnungsStatus jedes Dokuments
 *
 * Ausführen: npx tsx scripts/inspect-debitor-projekt.ts <projektId>
 * Beispiel:  npx tsx scripts/inspect-debitor-projekt.ts 699ec92c000a855cfb24
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

const argProjektId = process.argv[2];
if (!argProjektId) {
  console.error('❌ Bitte projektId angeben: npx tsx scripts/inspect-debitor-projekt.ts <projektId>');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE_COLLECTION_ID = 'projekte';
const BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';
const DEBITOREN_METADATEN_COLLECTION_ID = 'debitoren_metadaten';

async function main() {
  console.log('🔍 Inspektion Projekt + Rechnungsdokumente');
  console.log('='.repeat(70));
  console.log(`Projekt-ID: ${argProjektId}\n`);

  // 1. Projekt laden
  try {
    const projekt = await databases.getDocument(
      DATABASE_ID,
      PROJEKTE_COLLECTION_ID,
      argProjektId
    );

    const projektDoc = projekt as Record<string, unknown>;
    let parsed: Record<string, unknown> = {};
    if (typeof projektDoc.data === 'string') {
      try {
        parsed = JSON.parse(projektDoc.data);
      } catch {
        /* ignore */
      }
    }

    console.log('📁 Projekt:');
    console.log(`   $id:              ${projektDoc.$id}`);
    console.log(`   status (top):     ${projektDoc.status}`);
    console.log(`   status (data):    ${parsed.status}`);
    console.log(`   kundenname:       ${parsed.kundenname}`);
    console.log(`   rechnungsnummer (top):  ${projektDoc.rechnungsnummer || '(leer)'}`);
    console.log(`   rechnungsnummer (data): ${parsed.rechnungsnummer || '(leer)'}`);
    console.log(`   rechnungsdatum (top):   ${projektDoc.rechnungsdatum || '(leer)'}`);
    console.log(`   rechnungsdatum (data):  ${parsed.rechnungsdatum || '(leer)'}`);
    console.log(`   bezahltAm (top):  ${projektDoc.bezahltAm || '(leer)'}`);
    console.log(`   bezahltAm (data): ${parsed.bezahltAm || '(leer)'}`);
    console.log(`   data-Größe:       ${(projektDoc.data as string)?.length || 0} Zeichen`);
    if (parsed.rechnungsDaten) {
      console.log(`   rechnungsDaten:   ${(parsed.rechnungsDaten as string).length} Zeichen`);
    }
    console.log('');
  } catch (error) {
    console.error('❌ Projekt nicht gefunden:', error);
  }

  // 2. Alle Rechnungsdokumente (rechnung + stornorechnung)
  const dokResponse = await databases.listDocuments(
    DATABASE_ID,
    BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
    [Query.equal('projektId', argProjektId), Query.orderDesc('$createdAt'), Query.limit(100)]
  );

  console.log(`📄 Bestellabwicklung-Dokumente (${dokResponse.documents.length}):`);
  console.log('-'.repeat(70));

  for (const doc of dokResponse.documents) {
    const d = doc as Record<string, unknown>;
    console.log(`   $id:             ${d.$id}`);
    console.log(`   $createdAt:      ${d.$createdAt}`);
    console.log(`   dokumentTyp:     ${d.dokumentTyp}`);
    console.log(`   dokumentNummer:  ${d.dokumentNummer}`);
    console.log(`   rechnungsStatus: ${d.rechnungsStatus || '(nicht gesetzt)'}`);
    console.log(`   bruttobetrag:    ${d.bruttobetrag} €`);
    if (d.stornoVonRechnungId) console.log(`   stornoVonRechnungId: ${d.stornoVonRechnungId}`);
    if (d.stornoRechnungId) console.log(`   stornoRechnungId:    ${d.stornoRechnungId}`);
    console.log('');
  }

  // 3. Debitoren-Metadaten
  const metaResponse = await databases.listDocuments(
    DATABASE_ID,
    DEBITOREN_METADATEN_COLLECTION_ID,
    [Query.equal('projektId', argProjektId), Query.limit(5)]
  );

  console.log(`💰 Debitoren-Metadaten (${metaResponse.documents.length}):`);
  console.log('-'.repeat(70));

  for (const doc of metaResponse.documents) {
    const d = doc as Record<string, unknown>;
    console.log(`   $id:        ${d.$id}`);
    console.log(`   status:     ${d.status}`);
    console.log(`   mahnstufe:  ${d.mahnstufe}`);
    if (typeof d.data === 'string') {
      try {
        const parsed = JSON.parse(d.data);
        console.log(`   zahlungen:  ${(parsed.zahlungen || []).length}`);
        console.log(`   aktivitaeten: ${(parsed.aktivitaeten || []).length}`);
        console.log(`   zahlungszielTage: ${parsed.zahlungszielTage}`);
      } catch {
        console.log(`   (data konnte nicht geparst werden)`);
      }
    }
    console.log('');
  }

  // 4. Diagnose
  console.log('🔍 Diagnose:');
  console.log('-'.repeat(70));
  const rechnungen = dokResponse.documents.filter(
    (d) => (d as unknown as Record<string, unknown>).dokumentTyp === 'rechnung'
  );
  const aktive = rechnungen.filter(
    (d) => (d as unknown as Record<string, unknown>).rechnungsStatus !== 'storniert'
  );

  console.log(`   Rechnungen total:  ${rechnungen.length}`);
  console.log(`   Davon aktiv:       ${aktive.length}`);
  console.log(`   Davon storniert:   ${rechnungen.length - aktive.length}`);

  if (aktive.length === 0 && rechnungen.length > 0) {
    console.log('   ⚠️  Alle Rechnungen storniert — keine aktive Rechnung im Debitorentool sichtbar!');
  }
  if (aktive.length > 1) {
    console.log('   ⚠️  Mehrere aktive Rechnungen — sollte nicht vorkommen, prüfen!');
  }
}

main().catch((error) => {
  console.error('❌ Fataler Fehler:', error);
  process.exit(1);
});
