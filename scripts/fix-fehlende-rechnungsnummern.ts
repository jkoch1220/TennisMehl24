/**
 * Fix-Script für fehlende Rechnungsnummern auf Projekten
 *
 * Invariante: Ein Projekt mit status === 'rechnung' MUSS rechnungsnummer haben.
 * Findet Projekte mit Status 'rechnung' aber ohne rechnungsnummer/rechnungsdatum,
 * sucht das zugehörige aktive Rechnungsdokument in bestellabwicklung_dokumente und
 * schreibt rechnungsnummer + rechnungsdatum (top-level) zurück.
 *
 * Führe aus mit: npx tsx scripts/fix-fehlende-rechnungsnummern.ts
 * Für Vorschau:  npx tsx scripts/fix-fehlende-rechnungsnummern.ts --dry-run
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY fehlen!');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE_COLLECTION_ID = 'projekte';
const BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';

const DRY_RUN = process.argv.includes('--dry-run');

interface ProjektDoc {
  $id: string;
  status?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  data?: string;
}

interface ParsedProjekt {
  $id: string;
  status?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  kundenname?: string;
}

interface RechnungsDokument {
  $id: string;
  $createdAt: string;
  projektId: string;
  dokumentTyp: string;
  rechnungsStatus?: string;
  dokumentNummer: string;
  bruttobetrag?: number;
}

function parseProjekt(doc: ProjektDoc): ParsedProjekt {
  let base: Record<string, unknown> = {};
  if (doc.data && typeof doc.data === 'string') {
    try {
      base = JSON.parse(doc.data);
    } catch {
      /* ignore */
    }
  }
  // Top-Level-Felder gewinnen (siehe parseProjektDocument in projektService)
  return {
    $id: doc.$id,
    status: doc.status || (base.status as string | undefined),
    rechnungsnummer: doc.rechnungsnummer || (base.rechnungsnummer as string | undefined),
    rechnungsdatum: doc.rechnungsdatum || (base.rechnungsdatum as string | undefined),
    kundenname: base.kundenname as string | undefined,
  };
}

async function ladeAlleProjekteMitStatusRechnung(): Promise<ParsedProjekt[]> {
  const projekte: ParsedProjekt[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await databases.listDocuments(DATABASE_ID, PROJEKTE_COLLECTION_ID, [
      Query.equal('status', 'rechnung'),
      Query.limit(limit),
      Query.offset(offset),
    ]);

    for (const doc of response.documents) {
      projekte.push(parseProjekt(doc as unknown as ProjektDoc));
    }

    if (response.documents.length < limit) break;
    offset += limit;
    if (offset > 10000) {
      console.warn('⚠️ Mehr als 10000 Projekte — Abbruch um Endlosschleifen zu vermeiden.');
      break;
    }
  }

  return projekte;
}

async function ladeAktiveRechnung(projektId: string): Promise<RechnungsDokument | null> {
  const response = await databases.listDocuments(
    DATABASE_ID,
    BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
    [
      Query.equal('projektId', projektId),
      Query.equal('dokumentTyp', 'rechnung'),
      Query.orderDesc('$createdAt'),
      Query.limit(10),
    ]
  );

  const dokumente = response.documents as unknown as RechnungsDokument[];
  return dokumente.find((d) => d.rechnungsStatus !== 'storniert') || null;
}

async function main() {
  console.log('🔧 Fix fehlende Rechnungsnummern auf Projekten');
  console.log('='.repeat(65));
  console.log(DRY_RUN ? '📋 DRY-RUN Modus (keine Änderungen)\n' : '🚀 LIVE Modus\n');

  console.log('📥 Lade alle Projekte mit Status "rechnung" ...');
  const projekte = await ladeAlleProjekteMitStatusRechnung();
  console.log(`   → ${projekte.length} Projekte gefunden\n`);

  const reparaturen: Array<{
    projektId: string;
    kundenname: string;
    altRechnungsnummer?: string;
    neuRechnungsnummer: string;
    altRechnungsdatum?: string;
    neuRechnungsdatum: string;
  }> = [];
  const ohneDokument: ParsedProjekt[] = [];
  const okay: ParsedProjekt[] = [];

  for (const projekt of projekte) {
    if (projekt.rechnungsnummer && projekt.rechnungsdatum) {
      okay.push(projekt);
      continue;
    }

    const aktiveRechnung = await ladeAktiveRechnung(projekt.$id);
    if (!aktiveRechnung) {
      ohneDokument.push(projekt);
      continue;
    }

    const neuRechnungsnummer = aktiveRechnung.dokumentNummer;
    const neuRechnungsdatum = aktiveRechnung.$createdAt.split('T')[0];

    reparaturen.push({
      projektId: projekt.$id,
      kundenname: projekt.kundenname || '(unbekannt)',
      altRechnungsnummer: projekt.rechnungsnummer,
      neuRechnungsnummer,
      altRechnungsdatum: projekt.rechnungsdatum,
      neuRechnungsdatum,
    });
  }

  console.log('📊 Analyse-Ergebnis:');
  console.log(`   ✅ Bereits konsistent:                ${okay.length}`);
  console.log(`   🔧 Zu reparieren:                     ${reparaturen.length}`);
  console.log(`   ⚠️  Status 'rechnung' aber kein Dokument: ${ohneDokument.length}\n`);

  if (reparaturen.length > 0) {
    console.log('🔧 Zu reparierende Projekte:');
    console.log('-'.repeat(65));
    for (const r of reparaturen) {
      console.log(`   • ${r.kundenname} (${r.projektId})`);
      console.log(
        `     Rechnungsnummer: ${r.altRechnungsnummer || '(leer)'} → ${r.neuRechnungsnummer}`
      );
      console.log(
        `     Rechnungsdatum:  ${r.altRechnungsdatum || '(leer)'} → ${r.neuRechnungsdatum}`
      );
    }
    console.log('');
  }

  if (ohneDokument.length > 0) {
    console.log('⚠️  Projekte mit Status "rechnung" aber OHNE aktives Rechnungsdokument:');
    console.log('-'.repeat(65));
    for (const p of ohneDokument) {
      console.log(`   • ${p.kundenname || '(unbekannt)'} (${p.$id})`);
    }
    console.log('   → Hier muss manuell entschieden werden: Storno-Zustand? Echter Datenfehler?\n');
  }

  if (DRY_RUN) {
    console.log('📋 DRY-RUN: Keine Änderungen geschrieben. Mit `npx tsx scripts/fix-fehlende-rechnungsnummern.ts` ausführen.');
    return;
  }

  if (reparaturen.length === 0) {
    console.log('✅ Nichts zu tun.');
    return;
  }

  console.log(`🚀 Schreibe ${reparaturen.length} Reparaturen ...`);
  let erfolg = 0;
  let fehler = 0;

  for (const r of reparaturen) {
    try {
      await databases.updateDocument(DATABASE_ID, PROJEKTE_COLLECTION_ID, r.projektId, {
        rechnungsnummer: r.neuRechnungsnummer,
        rechnungsdatum: r.neuRechnungsdatum,
        geaendertAm: new Date().toISOString(),
      });
      console.log(`   ✅ ${r.kundenname}: ${r.neuRechnungsnummer}`);
      erfolg++;
    } catch (error) {
      console.error(`   ❌ ${r.kundenname} (${r.projektId}):`, error);
      fehler++;
    }
  }

  console.log('');
  console.log('📊 Ergebnis:');
  console.log(`   ✅ Erfolgreich: ${erfolg}`);
  console.log(`   ❌ Fehler:      ${fehler}`);
}

main().catch((error) => {
  console.error('❌ Fataler Fehler:', error);
  process.exit(1);
});
