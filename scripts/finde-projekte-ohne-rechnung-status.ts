/**
 * READ-ONLY: findet alle Projekte für die eine aktive Rechnung in bestellabwicklung_dokumente
 * existiert, deren projekt.status aber NICHT 'rechnung' oder 'bezahlt' ist — oder deren
 * rechnungsnummer/rechnungsdatum am Projekt fehlt.
 *
 * Hintergrund: vor dem Schema-Fix (Top-Level-Felder, commit 5d4b0dd) konnte das
 * updateProjekt() beim Status-Wechsel am 10.000-Zeichen-data-Limit scheitern. Folge:
 * Status blieb auf 'lieferschein', rechnungsnummer wurde nicht gesetzt — obwohl die
 * Rechnung in bestellabwicklung_dokumente sauber gespeichert wurde.
 *
 * Ausführen: npx tsx scripts/finde-projekte-ohne-rechnung-status.ts
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

interface RechnungsDok {
  $id: string;
  $createdAt: string;
  projektId: string;
  dokumentTyp: string;
  dokumentNummer: string;
  rechnungsStatus?: string;
  bruttobetrag?: number;
}

interface ProjektDoc {
  $id: string;
  status?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  data?: string;
}

async function ladeAlleRechnungen(): Promise<RechnungsDok[]> {
  const alle: RechnungsDok[] = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DB, COL_DOKUMENTE, [
      Query.equal('dokumentTyp', 'rechnung'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
      Query.offset(offset),
    ]);
    for (const d of res.documents) alle.push(d as unknown as RechnungsDok);
    if (res.documents.length < 100) break;
    offset += 100;
    if (offset > 50000) break;
  }
  return alle;
}

async function ladeProjekte(projektIds: string[]): Promise<Map<string, ProjektDoc>> {
  const map = new Map<string, ProjektDoc>();
  for (let i = 0; i < projektIds.length; i += 100) {
    const chunk = projektIds.slice(i, i + 100);
    const res = await databases.listDocuments(DB, COL_PROJEKTE, [
      Query.equal('$id', chunk),
      Query.limit(100),
    ]);
    for (const p of res.documents) {
      map.set(p.$id, p as unknown as ProjektDoc);
    }
  }
  return map;
}

async function main() {
  console.log('🔍 Suche Projekte mit aktiver Rechnung aber inkonsistentem Projekt-Status\n');

  const rechnungen = await ladeAlleRechnungen();

  // Pro projektId nur die neueste AKTIVE Rechnung (sortiert: neueste zuerst)
  const aktiveProProjekt = new Map<string, RechnungsDok>();
  for (const r of rechnungen) {
    if (r.rechnungsStatus === 'storniert') continue;
    if (!aktiveProProjekt.has(r.projektId)) {
      aktiveProProjekt.set(r.projektId, r);
    }
  }
  console.log(`   Aktive Rechnungs-Dokumente:        ${aktiveProProjekt.size} (für ${aktiveProProjekt.size} Projekte)`);

  const projektMap = await ladeProjekte(Array.from(aktiveProProjekt.keys()));
  console.log(`   Projekte geladen:                  ${projektMap.size}\n`);

  const inkonsistent: Array<{
    projektId: string;
    aktuellerStatus: string;
    aktuelleRechnungsnummer: string;
    sollRechnungsnummer: string;
    sollRechnungsdatum: string;
    bruttobetrag?: number;
    dataLaenge: number;
    fehlendeFelder: string[];
  }> = [];

  for (const [projektId, rechnung] of aktiveProProjekt) {
    const projekt = projektMap.get(projektId);
    if (!projekt) {
      // Projekt existiert nicht mehr — gelöscht?
      inkonsistent.push({
        projektId,
        aktuellerStatus: '(Projekt nicht gefunden)',
        aktuelleRechnungsnummer: '',
        sollRechnungsnummer: rechnung.dokumentNummer,
        sollRechnungsdatum: rechnung.$createdAt.split('T')[0],
        bruttobetrag: rechnung.bruttobetrag,
        dataLaenge: 0,
        fehlendeFelder: ['(Projekt fehlt)'],
      });
      continue;
    }

    // data-JSON parsen für inhaltlichen Status
    let dataStatus: string | undefined;
    let dataRechnungsnummer: string | undefined;
    if (typeof projekt.data === 'string') {
      try {
        const parsed = JSON.parse(projekt.data);
        dataStatus = parsed.status;
        dataRechnungsnummer = parsed.rechnungsnummer;
      } catch { /* ignore */ }
    }

    const effektiverStatus = projekt.status || dataStatus || '(leer)';
    const effektiveRechnungsnummer = projekt.rechnungsnummer || dataRechnungsnummer || '';

    const fehlt: string[] = [];
    if (effektiverStatus !== 'rechnung' && effektiverStatus !== 'bezahlt') {
      fehlt.push('status');
    }
    if (!effektiveRechnungsnummer) {
      fehlt.push('rechnungsnummer');
    }

    if (fehlt.length > 0) {
      inkonsistent.push({
        projektId,
        aktuellerStatus: effektiverStatus,
        aktuelleRechnungsnummer: effektiveRechnungsnummer,
        sollRechnungsnummer: rechnung.dokumentNummer,
        sollRechnungsdatum: rechnung.$createdAt.split('T')[0],
        bruttobetrag: rechnung.bruttobetrag,
        dataLaenge: typeof projekt.data === 'string' ? projekt.data.length : 0,
        fehlendeFelder: fehlt,
      });
    }
  }

  console.log(`📊 Inkonsistenzen: ${inkonsistent.length} Projekte\n`);
  console.log('─'.repeat(110));
  console.log('Projekt-ID                       Status (jetzt)   → soll         Soll-Rechnung   Datum        data-Länge  Fehlt');
  console.log('─'.repeat(110));

  for (const e of inkonsistent) {
    console.log(
      `${e.projektId}  ${e.aktuellerStatus.padEnd(16)} → rechnung    ${e.sollRechnungsnummer.padEnd(15)} ${e.sollRechnungsdatum}   ${String(e.dataLaenge).padStart(5)}      ${e.fehlendeFelder.join(', ')}`
    );
  }
  console.log('─'.repeat(110));

  // Statistik
  const dataKritisch = inkonsistent.filter((e) => e.dataLaenge >= 9000).length;
  if (dataKritisch > 0) {
    console.log(`\n⚠️  ${dataKritisch} Projekte mit data-Länge ≥ 9000 Zeichen — wahrscheinliche Ursache: 10000-Zeichen-Limit beim Speichern.`);
  }
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
