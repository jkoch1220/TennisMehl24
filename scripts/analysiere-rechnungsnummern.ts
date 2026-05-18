/**
 * Read-only Analyse: findet alle Lücken in der RE-Nummerierung pro Saisonjahr und ordnet jeder
 * Lücke chronologisch das passende Storno-Dokument zu.
 *
 * Hintergrund: Der frühere Storno-Bug zählte den `rechnungZaehler` auch beim Anlegen einer
 * STORNO-Nummer hoch — dadurch entstand pro Storno ein Loch in der RE-Sequenz. Dieses Script
 * macht die Zuordnung "Lücke → Storno" sichtbar, ohne irgendetwas zu schreiben.
 *
 * Ausführen:    npx tsx scripts/analysiere-rechnungsnummern.ts
 * Saison filtern: npx tsx scripts/analysiere-rechnungsnummern.ts 2026
 * CSV-Export:   npx tsx scripts/analysiere-rechnungsnummern.ts 2026 > luecken-2026.csv
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / VITE_APPWRITE_API_KEY fehlen!');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'bestellabwicklung_dokumente';

const ARG_SAISON = process.argv[2] ? Number(process.argv[2]) : null;
const CSV_MODE = process.argv.includes('--csv');

interface Dokument {
  $id: string;
  $createdAt: string;
  dokumentTyp: string;
  dokumentNummer: string;
  projektId: string;
  rechnungsStatus?: string;
  stornoVonRechnungId?: string;
  stornoVonRechnungsnummer?: string;
}

function parseRechnungsnummer(nr: string): { prefix: string; saison: number; laufnummer: number } | null {
  const match = nr.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    saison: parseInt(match[2], 10),
    laufnummer: parseInt(match[3], 10),
  };
}

async function ladeAlleDokumente(): Promise<Dokument[]> {
  const alle: Dokument[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Query.equal('dokumentTyp', ['rechnung', 'stornorechnung']),
      Query.orderAsc('$createdAt'),
      Query.limit(limit),
      Query.offset(offset),
    ]);
    for (const doc of response.documents) {
      alle.push(doc as unknown as Dokument);
    }
    if (response.documents.length < limit) break;
    offset += limit;
    if (offset > 50000) {
      console.warn('⚠️ Mehr als 50000 Dokumente — Sicherheits-Stop');
      break;
    }
  }
  return alle;
}

interface LueckenAnalyse {
  saison: number;
  rechnungen: Dokument[];
  stornos: Dokument[];
  benutzteNummern: number[];
  luecken: number[];
  zuordnung: Array<{ luecke: number; storno: Dokument; konflikt?: string }>;
}

function analysiereSaison(saison: number, dokumente: Dokument[]): LueckenAnalyse {
  const rechnungen: Dokument[] = [];
  const stornos: Dokument[] = [];
  const benutzteNummern: number[] = [];

  for (const doc of dokumente) {
    const parsed = parseRechnungsnummer(doc.dokumentNummer);
    if (!parsed || parsed.saison !== saison) continue;

    if (doc.dokumentTyp === 'rechnung' && parsed.prefix === 'RE') {
      rechnungen.push(doc);
      benutzteNummern.push(parsed.laufnummer);
    } else if (doc.dokumentTyp === 'stornorechnung') {
      stornos.push(doc);
      // Stornos die schon im RE-Kreis sind belegen Nummern (neue Logik)
      if (parsed.prefix === 'RE') {
        benutzteNummern.push(parsed.laufnummer);
      }
    }
  }

  benutzteNummern.sort((a, b) => a - b);
  const maxNummer = benutzteNummern.length > 0 ? benutzteNummern[benutzteNummern.length - 1] : 0;

  const luecken: number[] = [];
  const benutzteSet = new Set(benutzteNummern);
  for (let n = 1; n <= maxNummer; n++) {
    if (!benutzteSet.has(n)) luecken.push(n);
  }

  // Stornos chronologisch (älteste zuerst), nur die mit STORNO-Prefix (alte Logik) bekommen Lücken zugeordnet
  const alteStornos = stornos
    .filter((s) => {
      const p = parseRechnungsnummer(s.dokumentNummer);
      return p && p.prefix !== 'RE';
    })
    .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt));

  const zuordnung: LueckenAnalyse['zuordnung'] = [];
  const lueckenKopie = [...luecken];

  for (const storno of alteStornos) {
    const luecke = lueckenKopie.shift();
    if (luecke === undefined) {
      zuordnung.push({ luecke: -1, storno, konflikt: 'Keine Lücke mehr verfügbar' });
    } else {
      zuordnung.push({ luecke, storno });
    }
  }

  return { saison, rechnungen, stornos, benutzteNummern, luecken, zuordnung };
}

async function main() {
  if (!CSV_MODE) {
    console.log('🔍 Analyse der Rechnungsnummern-Lücken');
    console.log('='.repeat(70));
  }

  const dokumente = await ladeAlleDokumente();

  const saisons = new Set<number>();
  for (const doc of dokumente) {
    const p = parseRechnungsnummer(doc.dokumentNummer);
    if (p) saisons.add(p.saison);
  }

  const zuAnalysierendeSaisons = ARG_SAISON ? [ARG_SAISON] : Array.from(saisons).sort();

  if (CSV_MODE) {
    console.log('saison,luecke_re_nummer,storno_id,storno_dokumentnummer,storno_createdAt,projektId,konflikt');
  }

  for (const saison of zuAnalysierendeSaisons) {
    const analyse = analysiereSaison(saison, dokumente);

    if (CSV_MODE) {
      for (const { luecke, storno, konflikt } of analyse.zuordnung) {
        const lueckeNr = luecke > 0 ? `RE-${saison}-${String(luecke).padStart(4, '0')}` : '(keine)';
        console.log(
          `${saison},${lueckeNr},${storno.$id},${storno.dokumentNummer},${storno.$createdAt},${storno.projektId},${konflikt ?? ''}`
        );
      }
      continue;
    }

    console.log(`\n📅 Saison ${saison}`);
    console.log('-'.repeat(70));
    console.log(`   Rechnungen mit RE-Nummer:     ${analyse.rechnungen.length}`);
    console.log(`   Stornos gesamt:               ${analyse.stornos.length}`);
    console.log(`   Davon mit STORNO-Prefix (alt): ${analyse.zuordnung.length}`);
    console.log(`   Davon schon im RE-Kreis (neu): ${analyse.stornos.length - analyse.zuordnung.length}`);
    console.log(`   Gesamt belegte Lauf-Nummern:  ${analyse.benutzteNummern.length}`);
    console.log(`   Höchste belegte Nummer:       ${analyse.benutzteNummern.length > 0 ? analyse.benutzteNummern[analyse.benutzteNummern.length - 1] : '–'}`);
    console.log(`   Lücken:                       ${analyse.luecken.length}`);

    if (analyse.zuordnung.length > 0) {
      console.log('\n   Vorgeschlagene Migrations-Zuordnung (chronologisch):');
      for (const { luecke, storno, konflikt } of analyse.zuordnung) {
        const neueLueckeNr = luecke > 0 ? `RE-${saison}-${String(luecke).padStart(4, '0')}` : '???';
        const zeile = `      ${storno.dokumentNummer.padEnd(20)} → ${neueLueckeNr}  (${storno.$createdAt.split('T')[0]})`;
        console.log(konflikt ? `${zeile}  ⚠️  ${konflikt}` : zeile);
      }
    }

    if (analyse.luecken.length > analyse.zuordnung.length) {
      const restLuecken = analyse.luecken.slice(analyse.zuordnung.length);
      console.log(`\n   ⚠️  ${restLuecken.length} Lücken ohne Storno-Zuordnung: ${restLuecken
        .slice(0, 20)
        .map((n) => `RE-${saison}-${String(n).padStart(4, '0')}`)
        .join(', ')}${restLuecken.length > 20 ? ', …' : ''}`);
    }
  }
}

main().catch((error) => {
  console.error('❌ Fataler Fehler:', error);
  process.exit(1);
});
