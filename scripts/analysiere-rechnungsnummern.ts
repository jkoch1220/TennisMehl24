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
  zuordnung: Array<{
    luecke: number;
    storno: Dokument;
    originalRechnung?: string;
    konflikt?: string;
    schonKorrekt?: boolean;
  }>;
}

function ermittleOriginalNummer(storno: Dokument, alle: Dokument[]): string | null {
  if (storno.stornoVonRechnungId) {
    const original = alle.find((d) => d.$id === storno.stornoVonRechnungId);
    if (original) return original.dokumentNummer;
  }
  if (storno.stornoVonRechnungsnummer) {
    return storno.stornoVonRechnungsnummer;
  }
  return null;
}

function analysiereSaison(saison: number, dokumente: Dokument[]): LueckenAnalyse {
  const rechnungen: Dokument[] = [];
  const stornos: Dokument[] = [];
  const echteRechnungsNummern = new Set<number>();

  for (const doc of dokumente) {
    const parsed = parseRechnungsnummer(doc.dokumentNummer);
    if (!parsed || parsed.saison !== saison) continue;

    if (doc.dokumentTyp === 'rechnung') {
      rechnungen.push(doc);
      echteRechnungsNummern.add(parsed.laufnummer);
    } else if (doc.dokumentTyp === 'stornorechnung') {
      stornos.push(doc);
    }
  }

  // Stornos chronologisch sortieren (älteste zuerst — Konflikt-Tie-Break)
  const stornosSortiert = [...stornos].sort((a, b) =>
    (a.$createdAt || '').localeCompare(b.$createdAt || '')
  );

  // Für jeden Storno die ideale Lücke direkt nach der Original-Rechnung bestimmen
  const zugewiesen = new Set<number>();
  const zuordnung: LueckenAnalyse['zuordnung'] = [];

  for (const storno of stornosSortiert) {
    const originalNummer = ermittleOriginalNummer(storno, dokumente);
    const aktuell = parseRechnungsnummer(storno.dokumentNummer);
    if (!originalNummer) {
      zuordnung.push({
        luecke: -1,
        storno,
        konflikt: 'Original-Rechnung kann nicht ermittelt werden',
      });
      continue;
    }
    const originalParsed = parseRechnungsnummer(originalNummer);
    if (!originalParsed) {
      zuordnung.push({
        luecke: -1,
        storno,
        originalRechnung: originalNummer,
        konflikt: 'Original-Nummer nicht parsbar',
      });
      continue;
    }

    let kandidat = originalParsed.laufnummer + 1;
    while (echteRechnungsNummern.has(kandidat) || zugewiesen.has(kandidat)) {
      kandidat++;
    }
    zugewiesen.add(kandidat);

    const schonKorrekt = aktuell?.prefix === 'RE' && aktuell.laufnummer === kandidat;
    zuordnung.push({
      luecke: kandidat,
      storno,
      originalRechnung: originalNummer,
      schonKorrekt,
    });
  }

  // Benutzte und Lücken für Info-Ausgabe
  const alleBelegt = new Set<number>(echteRechnungsNummern);
  for (const z of zuordnung) {
    if (z.luecke > 0) alleBelegt.add(z.luecke);
  }
  const benutzteNummern = Array.from(alleBelegt).sort((a, b) => a - b);
  const maxNummer = benutzteNummern.length > 0 ? benutzteNummern[benutzteNummern.length - 1] : 0;
  const luecken: number[] = [];
  for (let n = 1; n <= maxNummer; n++) {
    if (!alleBelegt.has(n)) luecken.push(n);
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
    console.log('saison,aktuell,neue_nummer,original_rechnung,storno_id,storno_createdAt,projektId,status');
  }

  for (const saison of zuAnalysierendeSaisons) {
    const analyse = analysiereSaison(saison, dokumente);

    if (CSV_MODE) {
      for (const eintrag of analyse.zuordnung) {
        const neueNr = eintrag.luecke > 0 ? `RE-${saison}-${String(eintrag.luecke).padStart(4, '0')}` : '???';
        const status = eintrag.konflikt
          ? `KONFLIKT: ${eintrag.konflikt}`
          : eintrag.schonKorrekt
            ? 'korrekt'
            : 'zu_migrieren';
        console.log(
          `${saison},${eintrag.storno.dokumentNummer},${neueNr},${eintrag.originalRechnung ?? ''},${eintrag.storno.$id},${eintrag.storno.$createdAt},${eintrag.storno.projektId},${status}`
        );
      }
      continue;
    }

    const zuMigrieren = analyse.zuordnung.filter((e) => !e.schonKorrekt && !e.konflikt);
    const schonKorrekt = analyse.zuordnung.filter((e) => e.schonKorrekt).length;
    const konflikte = analyse.zuordnung.filter((e) => e.konflikt).length;

    console.log(`\n📅 Saison ${saison}`);
    console.log('-'.repeat(70));
    console.log(`   Echte Rechnungen (RE-*):      ${analyse.rechnungen.length}`);
    console.log(`   Stornos gesamt:               ${analyse.stornos.length}`);
    console.log(`   Davon schon korrekt:          ${schonKorrekt}`);
    console.log(`   Davon zu migrieren:           ${zuMigrieren.length}`);
    console.log(`   Davon Konflikte:              ${konflikte}`);

    if (zuMigrieren.length > 0) {
      console.log('\n   Vorgeschlagene Migration (Storno → Original-Rechnung + 1):');
      for (const e of zuMigrieren) {
        const neueNr = `RE-${saison}-${String(e.luecke).padStart(4, '0')}`;
        console.log(
          `      ${e.storno.dokumentNummer.padEnd(20)} → ${neueNr}   (Storno zu ${e.originalRechnung ?? '???'}, erstellt ${e.storno.$createdAt.split('T')[0]})`
        );
      }
    }

    if (konflikte > 0) {
      console.log('\n   ⚠️  Konflikte:');
      for (const e of analyse.zuordnung.filter((x) => x.konflikt)) {
        console.log(`      ${e.storno.dokumentNummer.padEnd(20)} — ${e.konflikt}`);
      }
    }
  }
}

main().catch((error) => {
  console.error('❌ Fataler Fehler:', error);
  process.exit(1);
});
