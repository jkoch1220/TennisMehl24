/**
 * Wendet die im Swiper getroffenen Archiv-Entscheidungen an.
 *
 * Verarbeitet ausschließlich Zeilen, in denen Spalte `entscheidung` auf
 * `archivieren` steht. `behalten` und leer bleiben unangetastet.
 *
 *   npx tsx scripts/archiv-anwenden.ts --liste=<csv>              # Dry-Run
 *   npx tsx scripts/archiv-anwenden.ts --liste=<csv> --apply
 *   npx tsx scripts/archiv-anwenden.ts --liste=<csv> --apply --produktion
 *   npx tsx scripts/archiv-anwenden.ts --liste=<csv> --apply --zurueck   # Archivierung aufheben
 *
 * Archivieren löscht nichts: es setzt `archiviert`, `archivGrund` und
 * `archiviertAm`. `saisonplanungService.loadAlleKunden()` blendet solche Kunden
 * standardmäßig aus, Projekte, Rechnungen und Bestellhistorie bleiben erhalten
 * und über `{ mitArchivierten: true }` erreichbar. Rückgängig: --zurueck.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT!;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID!;
const apiKey = process.env.APPWRITE_API_KEY!;
if (!endpoint || !projectId || !apiKey) { console.error('❌ Appwrite-Env fehlt'); process.exit(1); }

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ZURUECK = args.includes('--zurueck');
const DB = args.includes('--produktion') ? 'tennismehl24_db' : 'tennismehl24_db_mock';
const listeArg = args.find((a) => a.startsWith('--liste='));
if (!listeArg) { console.error('--liste=<pfad zur csv> fehlt'); process.exit(1); }
const LISTE = listeArg.split('=')[1];

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

function zerlege(z: string): string[] {
  const raus: string[] = []; let cur = '', inQ = false;
  for (let i = 0; i < z.length; i++) {
    const c = z[i];
    if (inQ) { if (c === '"') { if (z[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === ';') { raus.push(cur); cur = ''; }
    else cur += c;
  }
  raus.push(cur);
  return raus;
}

async function main() {
  console.log('═'.repeat(72));
  console.log(`  ${ZURUECK ? 'ARCHIVIERUNG AUFHEBEN' : 'KUNDEN ARCHIVIEREN'}`);
  console.log(`  Ziel:  ${DB === 'tennismehl24_db' ? '⚠️  PRODUKTION' : '🧪 SANDBOX'}  (${DB})`);
  console.log(`  Modus: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('═'.repeat(72));

  const zeilen = fs.readFileSync(LISTE, 'utf8').replace(/^﻿/, '').trim().split('\n');
  const kopf = zerlege(zeilen[0]);
  const idx = (n: string) => kopf.indexOf(n);
  if (idx('entscheidung') < 0 || idx('kundeId') < 0) {
    console.error('❌ Die Liste braucht die Spalten `entscheidung` und `kundeId`.');
    process.exit(1);
  }

  const gewaehlt = new Map<string, { name: string; grund: string }>();
  let behalten = 0, offen = 0;
  for (const z of zeilen.slice(1)) {
    if (!z.trim()) continue;
    const f = zerlege(z);
    const e = (f[idx('entscheidung')] || '').trim();
    if (e === 'archivieren') {
      gewaehlt.set(f[idx('kundeId')], {
        name: f[idx('name')] || '',
        grund: (f[idx('gruende')] || '').split('|')[0].trim(),
      });
    } else if (e === 'behalten') behalten++;
    else offen++;
  }
  console.log(`Prüfliste: ${gewaehlt.size} × archivieren · ${behalten} × behalten · ${offen} ohne Entscheidung.\n`);
  if (!gewaehlt.size && !ZURUECK) { console.log('Nichts zu tun.'); return; }

  const kunden = await ladeAlle('saison_kunden');
  let geaendert = 0, uebersprungen = 0, nichtGefunden = 0;
  const treffer = new Set<string>();

  for (const z of kunden) {
    const k = obj(z.data);
    const id = String(k.id || z.$id);
    const ziel = gewaehlt.get(id) ?? gewaehlt.get(z.$id);
    if (!ziel) continue;
    treffer.add(id); treffer.add(z.$id);

    if (ZURUECK) {
      if (k.archiviert !== true) { uebersprungen++; continue; }
      delete k.archiviert; delete k.archivGrund; delete k.archiviertAm;
    } else {
      if (k.archiviert === true) { uebersprungen++; continue; }
      k.archiviert = true;
      k.archivGrund = ziel.grund || 'Datenpflege';
      k.archiviertAm = new Date().toISOString();
    }
    console.log(`   ${ZURUECK ? 'zurück' : 'Archiv'}  ${String(k.kundennummer || '—').padEnd(8)} ${String(k.name).slice(0, 40).padEnd(40)} ${ZURUECK ? '' : ziel.grund.slice(0, 40)}`);
    if (!APPLY) { geaendert++; continue; }
    const r = await api('PATCH', `/tablesdb/${DB}/tables/saison_kunden/rows/${z.$id}`, { data: { data: JSON.stringify(k) } });
    if (r.ok) geaendert++;
    else console.error(`     ✗ ${r.daten.message}`);
    await pause();
  }
  for (const [id, v] of gewaehlt) if (!treffer.has(id)) { nichtGefunden++; console.warn(`   ⚠ nicht gefunden: ${v.name} (${id})`); }

  console.log('\n' + '═'.repeat(72));
  console.log(`${APPLY ? 'Geändert' : 'Zu ändern'}: ${geaendert} Kunden.`);
  if (uebersprungen) console.log(`Übersprungen (Zustand passte schon): ${uebersprungen}`);
  if (nichtGefunden) console.log(`⚠️  Nicht gefunden: ${nichtGefunden} — evtl. zwischenzeitlich zusammengeführt.`);
  if (!APPLY) console.log('DRY-RUN — nichts geschrieben. Zum Ausführen: --apply');
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
