/**
 * Importiert die Mosaik-Bestellhistorie (2001–2025) in `saison_kunden.bestellhistorie`.
 *
 * Quelle: ../migration/data/bestellhistorie.json — nach Mosaik-Kurzname
 * indiziert, je Jahr { anzahl, summe, vorgaenge }. Die `summe` steht dort in
 * Zehntausendstel-Euro (Mosaik-Format), wird hier auf Euro gebracht.
 *
 * Warum das nötig ist: Bis jetzt lag die Historie nur als Datei im
 * Migrationsordner. Im Portal sah man von einem Kunden, der 20 Jahre bestellt
 * hat, nur die Projekte ab 2024 — und nach einem Duplikat-Merge war nicht mehr
 * erkennbar, welche Mosaik-Konten in ihm zusammengeflossen sind.
 *
 * Zusammengeführte Duplikate: deren Kurznamen stehen nicht mehr am Kunden. Sie
 * werden aus `kunden_merge_archiv` (Feld loserKunde) nachgezogen, damit die
 * Historie der aufgelösten Datensätze nicht verlorengeht.
 *
 *   npx tsx scripts/import-bestellhistorie.ts             # Dry-Run, Sandbox
 *   npx tsx scripts/import-bestellhistorie.ts --apply
 *   npx tsx scripts/import-bestellhistorie.ts --apply --produktion
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT!;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID!;
const apiKey = process.env.APPWRITE_API_KEY!;
if (!endpoint || !projectId || !apiKey) { console.error('❌ Appwrite-Env fehlt'); process.exit(1); }

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DB = args.includes('--produktion') ? 'tennismehl24_db' : 'tennismehl24_db_mock';
const QUELLE = path.resolve(process.cwd(), '../migration/data/bestellhistorie.json');

/** Mosaik speichert Beträge mit vier Nachkommastellen. */
const MOSAIK_TEILER = 10000;

/**
 * Lieferungen ÜBER einen Platzbauer stehen in Mosaik unter einem eigenen Konto
 * mit Platzbauer-Präfix: „Mei-Nieder-Roden" ist der 1. Tennisclub Niederroden,
 * beliefert über Meinecke. Ohne diese Konten sieht ein Verein, der seit Jahren
 * über seinen Platzbauer bestellt, im Portal wie eine Karteileiche aus — genau
 * dieser Fehler hat die erste Archiv-Liste unbrauchbar gemacht.
 *
 * Nur diese Präfixe stehen für einen Platzbauer. „Ober-", „Klein-", „Nieder-"
 * sehen genauso aus, sind aber Teil des Ortsnamens.
 */
const PLATZBAUER_PRAEFIX: Record<string, string> = {
  Fr: 'Fröhner', Vogl: 'Vogl', Schö: 'Schönfeld', Ca: 'Catalkaya',
  Av: 'Averbeck', Mei: 'Meinecke', No: 'No', Kr: 'Kr', Me: 'Me',
  St: 'St', Ko: 'Ko', To: 'Top Comerce', Kuhnt: 'Kuhnt', Koh: 'Koh',
};
const normName = (s: unknown) => String(s ?? '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]/g, '');

interface Zeile { $id: string; data?: string; [f: string]: unknown }

async function api<T = any>(m: 'GET' | 'PATCH', pfad: string, body?: unknown) {
  const a = await fetch(`${endpoint}${pfad}`, {
    method: m,
    headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await a.text();
  return { ok: a.ok, status: a.status, daten: (t ? JSON.parse(t) : {}) as T & { message?: string } };
}

async function ladeAlle(tabelle: string): Promise<Zeile[]> {
  const raus: Zeile[] = [];
  let cursor: string | null = null;
  for (;;) {
    const q: Array<Record<string, unknown>> = [{ method: 'limit', values: [100] }];
    if (cursor) q.push({ method: 'cursorAfter', values: [cursor] });
    const qs = q.map((e) => `queries[]=${encodeURIComponent(JSON.stringify(e))}`).join('&');
    const res = await api<{ rows: Zeile[] }>('GET', `/tablesdb/${DB}/tables/${tabelle}/rows?${qs}`);
    if (!res.ok) throw new Error(`${tabelle}: HTTP ${res.status} ${res.daten?.message ?? ''}`);
    const z = res.daten.rows ?? [];
    if (!z.length) break;
    raus.push(...z);
    if (z.length < 100) break;
    cursor = z[z.length - 1].$id;
  }
  return raus;
}

const obj = (roh: unknown): Record<string, any> => {
  if (roh && typeof roh === 'object' && !Array.isArray(roh)) return roh as Record<string, any>;
  if (typeof roh !== 'string') return {};
  try { const g = JSON.parse(roh); return g && typeof g === 'object' ? g : {}; } catch { return {}; }
};
const pause = () => new Promise((r) => setTimeout(r, 90));

async function main() {
  console.log('═'.repeat(72));
  console.log('  BESTELLHISTORIE AUS MOSAIK IMPORTIEREN');
  console.log(`  Ziel:  ${DB === 'tennismehl24_db' ? '⚠️  PRODUKTION' : '🧪 SANDBOX'}  (${DB})`);
  console.log(`  Modus: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('═'.repeat(72));

  if (!fs.existsSync(QUELLE)) { console.error(`❌ ${QUELLE} fehlt`); process.exit(1); }
  const roh: Record<string, Record<string, { anzahl?: number; summe?: number }>> =
    JSON.parse(fs.readFileSync(QUELLE, 'utf8'));
  console.log(`Quelle: ${Object.keys(roh).length} Mosaik-Konten mit Historie.`);

  // Kurznamen aufgelöster Duplikate nachziehen — sonst fehlt deren Historie.
  const zusatzKurznamen = new Map<string, string[]>();
  for (const a of await ladeAlle('kunden_merge_archiv')) {
    const verlierer = obj(a.loserKunde);
    const kurz = String(verlierer.mosaikKurzname ?? '').trim();
    const sid = String(a.survivorId ?? '');
    if (!kurz || !sid) continue;
    zusatzKurznamen.set(sid, [...(zusatzKurznamen.get(sid) ?? []), kurz]);
  }
  console.log(`Merge-Archiv: ${zusatzKurznamen.size} Kunden mit zusätzlichen Alt-Konten.`);

  const kunden = await ladeAlle('saison_kunden');

  // Platzbauer-Konten den Vereinen zuordnen — aber nur, wenn genau ein Kunde
  // passt. Bei mehreren Treffern wäre die Historie beim falschen Verein, und
  // das fiele niemandem auf.
  const zusatzKonten = new Map<string, Array<{ konto: string; ueber: string }>>();
  const kandidatenIndex = kunden.map((z) => {
    const k = obj(z.data);
    return { id: z.$id, kurz: normName(k.mosaikKurzname), name: normName(k.name) };
  });
  let eindeutig = 0, mehrdeutig = 0, ohneTreffer = 0;
  for (const konto of Object.keys(roh)) {
    const m = konto.match(/^([A-ZÄÖÜ][a-zäöü]{1,4})-(.+)$/);
    if (!m || !PLATZBAUER_PRAEFIX[m[1]]) continue;
    const rest = normName(m[2]);
    if (rest.length < 5) { ohneTreffer++; continue; }
    let treffer = kandidatenIndex.filter((k) => k.kurz === rest || k.name === rest);
    if (!treffer.length) {
      treffer = kandidatenIndex.filter((k) =>
        (k.kurz.length >= 5 && (k.kurz.includes(rest) || rest.includes(k.kurz)))
        || (k.name.length >= 5 && k.name.includes(rest)));
    }
    if (treffer.length === 1) {
      eindeutig++;
      const liste = zusatzKonten.get(treffer[0].id) ?? [];
      liste.push({ konto, ueber: PLATZBAUER_PRAEFIX[m[1]] });
      zusatzKonten.set(treffer[0].id, liste);
    } else if (treffer.length > 1) mehrdeutig++;
    else ohneTreffer++;
  }
  console.log(`Platzbauer-Konten: ${eindeutig} eindeutig zugeordnet, ${mehrdeutig} mehrdeutig, ${ohneTreffer} ohne Treffer (bleiben außen vor).`);

  let getroffen = 0, geschrieben = 0, ausMerge = 0, jahreGesamt = 0, summeGesamt = 0, mitPlatzbauer = 0;

  for (const z of kunden) {
    const k = obj(z.data);
    const ueberPlatzbauer = zusatzKonten.get(z.$id) ?? [];
    const kurznamen = [
      String(k.mosaikKurzname ?? '').trim(),
      ...(zusatzKurznamen.get(z.$id) ?? []),
      ...ueberPlatzbauer.map((e) => e.konto),
    ].filter(Boolean);
    if (!kurznamen.length) continue;
    if (ueberPlatzbauer.length) mitPlatzbauer++;

    // Mehrere Alt-Konten in einem Kunden: je Jahr aufaddieren.
    const proJahr = new Map<number, { anzahl: number; summeEuro: number; quellen: Set<string> }>();
    let trefferKonten = 0;
    for (const kurz of [...new Set(kurznamen)]) {
      const eintrag = roh[kurz];
      if (!eintrag) continue;
      trefferKonten++;
      for (const [jahrStr, werte] of Object.entries(eintrag)) {
        const jahr = Number(jahrStr);
        if (!Number.isFinite(jahr)) continue;
        const bisher = proJahr.get(jahr) ?? { anzahl: 0, summeEuro: 0, quellen: new Set<string>() };
        bisher.anzahl += Number(werte?.anzahl) || 0;
        bisher.summeEuro += (Number(werte?.summe) || 0) / MOSAIK_TEILER;
        bisher.quellen.add(kurz);
        proJahr.set(jahr, bisher);
      }
    }
    if (!proJahr.size) continue;
    getroffen++;
    if (trefferKonten > 1) ausMerge++;

    const historie = [...proJahr.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([jahr, w]) => ({
        jahr,
        anzahl: w.anzahl,
        summeEuro: Math.round(w.summeEuro * 100) / 100,
        quellen: [...w.quellen],
      }));
    jahreGesamt += historie.length;
    summeGesamt += historie.reduce((s, h) => s + h.summeEuro, 0);

    // Unverändert? Dann nicht schreiben — das Skript ist mehrfach ausführbar.
    if (JSON.stringify(k.bestellhistorie ?? null) === JSON.stringify(historie)) continue;

    if (!APPLY) { geschrieben++; continue; }
    k.bestellhistorie = historie;
    const r = await api('PATCH', `/tablesdb/${DB}/tables/saison_kunden/rows/${z.$id}`, {
      data: { data: JSON.stringify(k) },
    });
    if (r.ok) geschrieben++;
    else console.error(`   ✗ ${k.name}: ${r.daten.message}`);
    await pause();
  }

  console.log('\n' + '═'.repeat(72));
  console.log(`Kunden mit Historie          ${getroffen}`);
  console.log(`  davon über Platzbauer        ${mitPlatzbauer}`);
  console.log(`  davon aus mehreren Konten  ${ausMerge}  (zusammengeführte Duplikate)`);
  console.log(`Jahreszeilen gesamt          ${jahreGesamt}`);
  console.log(`Umsatzvolumen gesamt         ${summeGesamt.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`);
  console.log(`${APPLY ? 'Geschrieben' : 'Zu schreiben'}: ${geschrieben} Kunden.`);
  if (!APPLY) console.log('DRY-RUN — nichts geschrieben. Zum Ausführen: --apply');
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
