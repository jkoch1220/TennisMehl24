/**
 * Schreibt „getrennt"-Entscheidungen aus der Duplikat-Prüfliste dauerhaft an
 * die Kunden.
 *
 * Ohne das wirft die Erkennung dieselben Paare bei jedem Lauf neu auf, und man
 * entscheidet immer wieder dasselbe. Der Vermerk landet in `notizen`; die
 * Analyse liest ihn (`GEPRUEFT_NEIN`) und stuft das Paar künftig als geprüft
 * ein, statt es erneut vorzuschlagen.
 *
 *   npx tsx scripts/nicht-zusammenfuehren-merken.ts --liste=<csv>
 *   npx tsx scripts/nicht-zusammenfuehren-merken.ts --liste=<csv> --apply
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
const DB = args.includes('--produktion') ? 'tennismehl24_db' : 'tennismehl24_db_mock';
const listeArg = args.find((a) => a.startsWith('--liste='));
if (!listeArg) { console.error('--liste=<csv> fehlt'); process.exit(1); }

interface Zeile { $id: string; data?: string; [f: string]: unknown }

async function api<T = any>(m: 'GET' | 'PATCH', pfad: string, body?: unknown) {
  for (let versuch = 0; ; versuch++) {
    const a = await fetch(`${endpoint}${pfad}`, {
      method: m,
      headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (a.status === 429 && versuch < 6) { await new Promise((r) => setTimeout(r, 2500 * (versuch + 1))); continue; }
    const t = await a.text();
    return { ok: a.ok, status: a.status, daten: (t ? JSON.parse(t) : {}) as T & { message?: string } };
  }
}
async function ladeAlle(tabelle: string): Promise<Zeile[]> {
  const raus: Zeile[] = [];
  let cursor: string | null = null;
  for (;;) {
    const q: Array<Record<string, unknown>> = [{ method: 'limit', values: [100] }];
    if (cursor) q.push({ method: 'cursorAfter', values: [cursor] });
    const qs = q.map((e) => `queries[]=${encodeURIComponent(JSON.stringify(e))}`).join('&');
    const res = await api<{ rows: Zeile[] }>('GET', `/tablesdb/${DB}/tables/${tabelle}/rows?${qs}`);
    if (!res.ok) throw new Error(`${tabelle}: HTTP ${res.status}`);
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
  console.log('  GEPRÜFTE NICHT-DUPLIKATE FESTSCHREIBEN');
  console.log(`  Ziel:  ${DB === 'tennismehl24_db' ? '⚠️  PRODUKTION' : '🧪 SANDBOX'}  (${DB})`);
  console.log(`  Modus: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('═'.repeat(72));

  const zeilen = fs.readFileSync(listeArg.split('=')[1], 'utf8').replace(/^﻿/, '').trim().split('\n');
  const kopf = zerlege(zeilen[0]);
  const idx = (n: string) => kopf.indexOf(n);

  // Je Cluster die beteiligten Kunden sammeln — der Vermerk nennt den Partner.
  const cluster = new Map<string, Array<{ id: string; name: string }>>();
  for (const z of zeilen.slice(1)) {
    if (!z.trim()) continue;
    const f = zerlege(z);
    if (f[idx('einstufung')] !== 'getrennt') continue;
    const c = f[idx('cluster')];
    const liste = cluster.get(c) ?? [];
    liste.push({ id: f[idx('kundeId')], name: f[idx('name')] });
    cluster.set(c, liste);
  }
  console.log(`Prüfliste: ${cluster.size} als „getrennt" entschiedene Cluster.\n`);
  if (!cluster.size) return;

  const kunden = await ladeAlle('saison_kunden');
  const byId = new Map<string, Zeile>();
  for (const z of kunden) { byId.set(z.$id, z); byId.set(String(obj(z.data).id || z.$id), z); }

  const heute = new Date().toISOString().slice(0, 10);
  let geschrieben = 0, schonDa = 0;
  for (const [nr, mitglieder] of cluster) {
    console.log(`[${nr}] ${mitglieder.map((m) => m.name).join('  ≠  ')}`);
    for (const m of mitglieder) {
      const z = byId.get(m.id);
      if (!z) { console.warn(`   ⚠ nicht gefunden: ${m.name}`); continue; }
      const k = obj(z.data);
      const partner = mitglieder.filter((x) => x.id !== m.id).map((x) => x.name).join(', ');
      const vermerk = `[NICHT zusammenführen, geprüft ${heute}] eigenständiger Kunde, nicht identisch mit: ${partner}`;
      if (/nicht zusammen/i.test(String(k.notizen ?? ''))) { schonDa++; continue; }
      k.notizen = [k.notizen, vermerk].filter(Boolean).join('\n');
      if (!APPLY) { geschrieben++; continue; }
      const r = await api('PATCH', `/tablesdb/${DB}/tables/saison_kunden/rows/${z.$id}`, { data: { data: JSON.stringify(k) } });
      if (r.ok) geschrieben++;
      else console.error(`   ✗ ${m.name}: ${r.daten.message}`);
      await new Promise((w) => setTimeout(w, 120));
    }
  }
  console.log('\n' + '═'.repeat(72));
  console.log(`${APPLY ? 'Vermerkt' : 'Zu vermerken'}: ${geschrieben} Kunden.`);
  if (schonDa) console.log(`Schon vermerkt: ${schonDa}`);
  if (!APPLY) console.log('DRY-RUN — nichts geschrieben. Zum Ausführen: --apply');
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
