/**
 * Migration-Script: Projektstatus basierend auf vorhandenen Dokumenten korrigieren
 *
 * Problem:
 * - Projekte mit Status 'auftragsbestaetigung' haben bereits Lieferscheine oder Rechnungen
 * - Projekte mit Status 'lieferschein' haben bereits Rechnungen
 * - Der Status wurde bei der Dokumenterstellung nicht korrekt aktualisiert
 *
 * Dieses Script:
 * 1. Findet Projekte im Status 'auftragsbestaetigung' mit Rechnung-Dokumenten → setzt auf 'rechnung'
 * 2. Findet Projekte im Status 'auftragsbestaetigung' mit Lieferschein-Dokumenten → setzt auf 'lieferschein'
 * 3. Findet Projekte im Status 'lieferschein' mit Rechnung-Dokumenten → setzt auf 'rechnung'
 *
 * Führe aus mit: npx tsx scripts/migriere-projekt-status.ts [--dry-run]
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE_COLLECTION_ID = 'projekte';
const DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';

const DRY_RUN = process.argv.includes('--dry-run');

interface Projekt {
  $id: string;
  projektName: string;
  kundenname: string;
  saisonjahr: number;
  status: string;
  lieferscheinnummer?: string;
  rechnungsnummer?: string;
}

interface Dokument {
  $id: string;
  projektId: string;
  dokumentTyp: string;
  dokumentNummer: string;
  $createdAt: string;
}

async function ladeProjekteMitStatus(status: string): Promise<Projekt[]> {
  let alle: Projekt[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await databases.listDocuments(DATABASE_ID, PROJEKTE_COLLECTION_ID, [
      Query.equal('status', status),
      Query.limit(limit),
      Query.offset(offset)
    ]);

    alle = alle.concat(response.documents as unknown as Projekt[]);

    if (response.documents.length < limit) break;
    offset += limit;
  }

  return alle;
}

async function hatDokumentVomTyp(projektId: string, dokumentTyp: string): Promise<Dokument | null> {
  const dokumente = await databases.listDocuments(DATABASE_ID, DOKUMENTE_COLLECTION_ID, [
    Query.equal('projektId', projektId),
    Query.equal('dokumentTyp', dokumentTyp),
    Query.orderDesc('$createdAt'),
    Query.limit(1)
  ]);

  if (dokumente.documents.length > 0) {
    return dokumente.documents[0] as unknown as Dokument;
  }
  return null;
}

async function migriere() {
  console.log('🚀 Starte Migration: Projektstatus basierend auf Dokumenten korrigieren');
  if (DRY_RUN) {
    console.log('🔍 DRY-RUN Modus - keine Änderungen werden durchgeführt\n');
  } else {
    console.log('⚡ LIVE Modus - Änderungen werden durchgeführt\n');
  }

  let zuRechnung = 0;
  let zuLieferschein = 0;
  let bereitsKorrekt = 0;
  let fehler = 0;

  // === PHASE 1: Projekte im Status 'auftragsbestaetigung' prüfen ===
  console.log('═'.repeat(60));
  console.log('📋 PHASE 1: Projekte im Status "auftragsbestaetigung" prüfen');
  console.log('═'.repeat(60));

  const abProjekte = await ladeProjekteMitStatus('auftragsbestaetigung');
  console.log(`📂 ${abProjekte.length} Projekte mit Status "auftragsbestaetigung" gefunden\n`);

  for (const projekt of abProjekte) {
    try {
      // Zuerst auf Rechnung prüfen (höhere Priorität)
      const rechnung = await hatDokumentVomTyp(projekt.$id, 'rechnung');
      if (rechnung) {
        console.log(`📄→💰 ${projekt.kundenname} (${projekt.$id}): Hat Rechnung ${rechnung.dokumentNummer} → Status auf "rechnung"`);
        if (!DRY_RUN) {
          await databases.updateDocument(DATABASE_ID, PROJEKTE_COLLECTION_ID, projekt.$id, {
            status: 'rechnung',
            rechnungsnummer: rechnung.dokumentNummer || projekt.rechnungsnummer,
          });
        }
        zuRechnung++;
        continue;
      }

      // Dann auf Lieferschein prüfen
      const lieferschein = await hatDokumentVomTyp(projekt.$id, 'lieferschein');
      if (lieferschein) {
        console.log(`📄→🚚 ${projekt.kundenname} (${projekt.$id}): Hat Lieferschein ${lieferschein.dokumentNummer} → Status auf "lieferschein"`);
        if (!DRY_RUN) {
          await databases.updateDocument(DATABASE_ID, PROJEKTE_COLLECTION_ID, projekt.$id, {
            status: 'lieferschein',
            lieferscheinnummer: lieferschein.dokumentNummer || projekt.lieferscheinnummer,
          });
        }
        zuLieferschein++;
        continue;
      }

      // Kein Dokument gefunden - Status korrekt
      bereitsKorrekt++;
    } catch (error) {
      console.error(`❌ ${projekt.kundenname}: Fehler - ${(error as Error).message}`);
      fehler++;
    }
  }

  // === PHASE 2: Projekte im Status 'lieferschein' prüfen ===
  console.log('\n' + '═'.repeat(60));
  console.log('📋 PHASE 2: Projekte im Status "lieferschein" mit Rechnung prüfen');
  console.log('═'.repeat(60));

  const lsProjekte = await ladeProjekteMitStatus('lieferschein');
  console.log(`📂 ${lsProjekte.length} Projekte mit Status "lieferschein" gefunden\n`);

  let lsBereitsKorrekt = 0;

  for (const projekt of lsProjekte) {
    try {
      const rechnung = await hatDokumentVomTyp(projekt.$id, 'rechnung');
      if (rechnung) {
        console.log(`🚚→💰 ${projekt.kundenname} (${projekt.$id}): Hat Rechnung ${rechnung.dokumentNummer} → Status auf "rechnung"`);
        if (!DRY_RUN) {
          await databases.updateDocument(DATABASE_ID, PROJEKTE_COLLECTION_ID, projekt.$id, {
            status: 'rechnung',
            rechnungsnummer: rechnung.dokumentNummer || projekt.rechnungsnummer,
          });
        }
        zuRechnung++;
        continue;
      }

      lsBereitsKorrekt++;
    } catch (error) {
      console.error(`❌ ${projekt.kundenname}: Fehler - ${(error as Error).message}`);
      fehler++;
    }
  }

  // === ZUSAMMENFASSUNG ===
  console.log('\n' + '═'.repeat(60));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('═'.repeat(60));
  console.log(`💰 Zu "rechnung" migriert:     ${zuRechnung}`);
  console.log(`🚚 Zu "lieferschein" migriert:  ${zuLieferschein}`);
  console.log(`✅ Bereits korrekt (AB):        ${bereitsKorrekt}`);
  console.log(`✅ Bereits korrekt (LS):        ${lsBereitsKorrekt}`);
  console.log(`❌ Fehler:                      ${fehler}`);
  console.log(`📁 Geprüft gesamt:              ${abProjekte.length + lsProjekte.length}`);
  console.log('═'.repeat(60));

  if (DRY_RUN && (zuRechnung > 0 || zuLieferschein > 0)) {
    console.log('\n⚠️  DRY-RUN: Keine Änderungen durchgeführt!');
    console.log('   Führe ohne --dry-run aus um die Änderungen zu übernehmen.');
  }
}

migriere().catch(console.error);
