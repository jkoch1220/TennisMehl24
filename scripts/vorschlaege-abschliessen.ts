/**
 * Setzt Vorschläge (Collection `tickets`) auf „erledigt".
 *
 * Gedacht für den Saisonschnitt: die Liste wird einmal komplett abgearbeitet und
 * danach auf null gestellt, damit in der neuen Saison nur noch Neues auftaucht.
 *
 *   npx tsx scripts/vorschlaege-abschliessen.ts                  # Dry-Run (Standard)
 *   npx tsx scripts/vorschlaege-abschliessen.ts --scharf         # schreibt wirklich
 *   npx tsx scripts/vorschlaege-abschliessen.ts --scharf --mock  # in der Sandbox
 *   npx tsx scripts/vorschlaege-abschliessen.ts --nur-offene     # erledigte nicht anfassen
 *
 * GELÖSCHT WIRD NICHTS. Der Status wandert auf 'erledigt', `erledigtAm` wird
 * gesetzt, falls es fehlt. Damit bleibt die Historie im Tool sichtbar und lässt
 * sich jederzeit wieder aufmachen — anders als beim Löschen, das die
 * Begründungen für getroffene Entscheidungen mitnehmen würde.
 *
 * Vor dem scharfen Lauf wird eine Sicherung als JSON geschrieben.
 */
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const SCHARF = args.includes('--scharf');
const MOCK = args.includes('--mock');
const NUR_OFFENE = args.includes('--nur-offene');
const DB = MOCK ? 'tennismehl24_db_mock' : 'tennismehl24_db';

const env: Record<string, string> = {};
for (const line of readFileSync(path.resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
const KEY = env.APPWRITE_API_KEY;
if (!ENDPOINT || !PROJECT || !KEY) {
  console.error('❌ Appwrite-Zugangsdaten fehlen in .env');
  process.exit(1);
}

const kopf = { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY, 'Content-Type': 'application/json' };

interface TicketDaten {
  id: string;
  titel: string;
  status: string;
  erledigtAm?: string;
  [k: string]: unknown;
}

/** Appwrite drosselt bei zu vielen Schreibzugriffen — 429 wird abgewartet. */
const mitWiederholung = async (fn: () => Promise<Response>): Promise<Response> => {
  for (let versuch = 0; ; versuch++) {
    const r = await fn();
    if (r.status !== 429 || versuch >= 8) return r;
    await new Promise((w) => setTimeout(w, 3000 * (versuch + 1)));
  }
};

const ladeAlle = async () => {
  const alle: Array<{ $id: string; data: string }> = [];
  let cursor: string | null = null;
  for (;;) {
    const queries = [JSON.stringify({ method: 'limit', values: [100] })];
    if (cursor) queries.push(JSON.stringify({ method: 'cursorAfter', values: [cursor] }));
    const q = queries.map((x) => `queries[]=${encodeURIComponent(x)}`).join('&');
    const r = await mitWiederholung(() =>
      fetch(`${ENDPOINT}/databases/${DB}/collections/tickets/documents?${q}`, { headers: kopf })
    );
    if (!r.ok) throw new Error(`Laden fehlgeschlagen: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const res = (await r.json()) as { documents: Array<{ $id: string; data: string }> };
    alle.push(...res.documents);
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return alle;
};

const main = async () => {
  console.log(`Datenbank: ${DB}${SCHARF ? '  — SCHARFER LAUF' : '  (Dry-Run)'}`);

  const dokumente = await ladeAlle();
  const jetzt = new Date().toISOString();

  const sicherung = path.resolve(process.cwd(), `vorschlaege-sicherung-${jetzt.slice(0, 10)}.json`);
  writeFileSync(sicherung, JSON.stringify(dokumente, null, 2));
  console.log(`Sicherung: ${sicherung} (${dokumente.length} Dokumente)`);

  let geaendert = 0;
  let uebersprungen = 0;
  let fehler = 0;

  for (const doc of dokumente) {
    let daten: TicketDaten;
    try {
      daten = JSON.parse(doc.data) as TicketDaten;
    } catch {
      console.warn(`  ⚠️  ${doc.$id}: data nicht lesbar, übersprungen`);
      uebersprungen++;
      continue;
    }

    if (daten.status === 'erledigt' && (daten.erledigtAm || NUR_OFFENE)) {
      uebersprungen++;
      continue;
    }
    if (NUR_OFFENE && daten.status !== 'offen') {
      uebersprungen++;
      continue;
    }

    const neu: TicketDaten = {
      ...daten,
      status: 'erledigt',
      erledigtAm: daten.erledigtAm || jetzt,
      geaendertAm: jetzt,
    };

    if (!SCHARF) {
      console.log(`  [Dry-Run] ${daten.status.padEnd(15)} → erledigt   ${daten.titel?.slice(0, 70)}`);
      geaendert++;
      continue;
    }

    const r = await mitWiederholung(() =>
      fetch(`${ENDPOINT}/databases/${DB}/collections/tickets/documents/${doc.$id}`, {
        method: 'PATCH',
        headers: kopf,
        // Doppelt verschachtelt, und das ist kein Versehen: Die REST-API
        // erwartet die Feldliste unter `data`. Unser Nutzfeld heißt hier
        // ebenfalls `data`, weil die Collection alles als JSON-String hält.
        // Ohne den äußeren Wrapper liest Appwrite die Schlüssel des JSON als
        // Attributnamen und antwortet mit „Unknown attribute: titel".
        body: JSON.stringify({ data: { data: JSON.stringify(neu) } }),
      })
    );
    if (!r.ok) {
      console.error(`  ❌ ${doc.$id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      fehler++;
      continue;
    }
    geaendert++;
    if (geaendert % 25 === 0) console.log(`  … ${geaendert} geschrieben`);
  }

  console.log(`\nFertig: ${geaendert} auf erledigt, ${uebersprungen} unverändert, ${fehler} Fehler`);
  if (!SCHARF) console.log('Das war ein Dry-Run. Mit --scharf wird geschrieben.');
  if (fehler > 0) process.exit(1);
};

main().catch((e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
