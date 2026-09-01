/**
 * Übernimmt die Zahlungskonditionen aus dem Mosaik-Altsystem in den Kundenstamm.
 *
 * Hintergrund: Bei der Migration kam das Feld `Zahlungsart` nicht mit. Seitdem
 * rechnet das Portal für jeden Kunden mit 14 Tagen — auch bei denen, die
 * nachweislich 30 Tage, 10 Tage oder Vorkasse vereinbart hatten. Die Fälligkeit
 * in der Debitorenverwaltung war damit für einen Teil des Bestands falsch.
 *
 *   npx tsx scripts/mosaik-zahlungsziele-uebernehmen.ts                 # Dry-Run
 *   npx tsx scripts/mosaik-zahlungsziele-uebernehmen.ts --scharf
 *   npx tsx scripts/mosaik-zahlungsziele-uebernehmen.ts --scharf --mock # Sandbox
 *   npx tsx scripts/mosaik-zahlungsziele-uebernehmen.ts --ueberschreiben
 *
 * Zuordnung läuft über `mosaikKurzname` am Kunden — das Feld, das die Migration
 * gesetzt hat. Kunden ohne dieses Feld (im Portal neu angelegt) bleiben außen vor.
 *
 * VORSICHTIG PER VOREINSTELLUNG: Ein im Portal bereits gepflegtes Zahlungsziel
 * wird NICHT angefasst. Denn 14 ist zugleich der Default des Kundenformulars —
 * eine 14 lässt sich nicht davon unterscheiden, ob sie jemand bewusst gesetzt
 * oder nur stehengelassen hat. Übernommen wird deshalb nur dort, wo gar kein
 * Wert steht. Mit --ueberschreiben werden auch 14er überschrieben, wenn Mosaik
 * etwas anderes sagt.
 */
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { parseMosaikZahlungsart } from '../src/utils/zahlungskonditionen';

const args = process.argv.slice(2);
const SCHARF = args.includes('--scharf');
const MOCK = args.includes('--mock');
const UEBERSCHREIBEN = args.includes('--ueberschreiben');
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

const mitWiederholung = async (fn: () => Promise<Response>): Promise<Response> => {
  for (let versuch = 0; ; versuch++) {
    const r = await fn();
    if (r.status !== 429 || versuch >= 8) return r;
    await new Promise((w) => setTimeout(w, 3000 * (versuch + 1)));
  }
};

const ladeKunden = async () => {
  const alle: Array<{ $id: string; data: string }> = [];
  let cursor: string | null = null;
  for (;;) {
    const queries = [JSON.stringify({ method: 'limit', values: [100] })];
    if (cursor) queries.push(JSON.stringify({ method: 'cursorAfter', values: [cursor] }));
    const q = queries.map((x) => `queries[]=${encodeURIComponent(x)}`).join('&');
    const r = await mitWiederholung(() =>
      fetch(`${ENDPOINT}/databases/${DB}/collections/saison_kunden/documents?${q}`, { headers: kopf })
    );
    if (!r.ok) throw new Error(`Laden fehlgeschlagen: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const res = (await r.json()) as { documents: Array<{ $id: string; data: string }> };
    alle.push(...res.documents);
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return alle;
};

interface MosaikKunde {
  Kurzname?: string;
  Zahlungsart?: string | null;
  Name1?: string;
}

const main = async () => {
  console.log(`Datenbank: ${DB}${SCHARF ? '  — SCHARFER LAUF' : '  (Dry-Run)'}`);
  console.log(`Bestehende Werte: ${UEBERSCHREIBEN ? 'werden überschrieben' : 'bleiben unangetastet'}\n`);

  const mosaikPfad = path.resolve(process.cwd(), '../migration/data/kunden.json');
  const roh = JSON.parse(readFileSync(mosaikPfad, 'utf8'));
  const mosaikListe: MosaikKunde[] = Array.isArray(roh) ? roh : Object.values(roh);

  // Kurzname → Kondition
  const nachKurzname = new Map<string, ReturnType<typeof parseMosaikZahlungsart>>();
  for (const m of mosaikListe) {
    if (!m.Kurzname) continue;
    const kond = parseMosaikZahlungsart(m.Zahlungsart);
    if (kond) nachKurzname.set(m.Kurzname, kond);
  }
  console.log(`Mosaik: ${mosaikListe.length} Kunden, davon ${nachKurzname.size} mit lesbarer Zahlungsart`);

  const dokumente = await ladeKunden();
  console.log(`Portal: ${dokumente.length} Kunden\n`);

  const jetzt = new Date().toISOString();
  writeFileSync(
    path.resolve(process.cwd(), `zahlungsziele-sicherung-${jetzt.slice(0, 10)}.json`),
    JSON.stringify(dokumente, null, 2)
  );

  let geaendert = 0;
  let ohneKurzname = 0;
  let ohneMosaikWert = 0;
  let bereitsGepflegt = 0;
  let unveraendert = 0;
  let fehler = 0;
  const verteilung: Record<string, number> = {};

  for (const doc of dokumente) {
    let kunde: Record<string, unknown>;
    try {
      kunde = JSON.parse(doc.data);
    } catch {
      fehler++;
      continue;
    }

    const kurzname = kunde.mosaikKurzname as string | undefined;
    if (!kurzname) { ohneKurzname++; continue; }

    const kond = nachKurzname.get(kurzname);
    if (!kond) { ohneMosaikWert++; continue; }

    const bisher = kunde.zahlungsziel as number | undefined;
    const hatEigenenWert = bisher !== undefined && bisher !== null;

    // Ein gepflegter Wert bleibt stehen — außer der Kunde steht auf dem
    // Formular-Default 14 und Mosaik weiß es besser (nur mit --ueberschreiben).
    if (hatEigenenWert && !(UEBERSCHREIBEN && bisher !== kond.tage)) {
      bereitsGepflegt++;
      continue;
    }
    if (bisher === kond.tage && !kond.skontoProzent) { unveraendert++; continue; }

    const neu: Record<string, unknown> = { ...kunde, zahlungsziel: kond.tage };
    // Skonto und Vorkasse gehen sonst verloren — sie stehen in keinem anderen Feld.
    if (kond.skontoProzent) {
      neu.skonto = { prozent: kond.skontoProzent, tage: kond.skontoTage };
    }
    if (kond.vorkasse) neu.vorkasse = true;
    neu.zahlungszielQuelle = `Mosaik: ${kond.quelle}`;

    verteilung[kond.text] = (verteilung[kond.text] || 0) + 1;

    if (!SCHARF) {
      if (geaendert < 15) {
        console.log(`  [Dry-Run] ${String(kunde.name).slice(0, 42).padEnd(44)} ${String(bisher ?? '–').padStart(3)} → ${String(kond.tage).padStart(3)} Tage   (${kond.quelle})`);
      }
      geaendert++;
      continue;
    }

    const r = await mitWiederholung(() =>
      fetch(`${ENDPOINT}/databases/${DB}/collections/saison_kunden/documents/${doc.$id}`, {
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
      console.error(`  ❌ ${doc.$id}: ${r.status} ${(await r.text()).slice(0, 160)}`);
      fehler++;
      continue;
    }
    geaendert++;
    if (geaendert % 50 === 0) console.log(`  … ${geaendert} geschrieben`);
  }

  if (!SCHARF && geaendert > 15) console.log(`  … und ${geaendert - 15} weitere`);

  console.log('\n──────────────────────────────────────────');
  console.log(`Zahlungsziel gesetzt:        ${geaendert}`);
  console.log(`bereits gepflegt (bleibt):   ${bereitsGepflegt}`);
  console.log(`identisch, nichts zu tun:    ${unveraendert}`);
  console.log(`kein Mosaik-Wert vorhanden:  ${ohneMosaikWert}`);
  console.log(`nicht aus Mosaik migriert:   ${ohneKurzname}`);
  console.log(`Fehler:                      ${fehler}`);
  if (Object.keys(verteilung).length) {
    console.log('\nWas übernommen würde:');
    Object.entries(verteilung).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${String(n).padStart(4)}x  ${t}`));
  }
  if (!SCHARF) console.log('\nDas war ein Dry-Run. Mit --scharf wird geschrieben.');
  if (fehler > 0) process.exit(1);
};

main().catch((e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
