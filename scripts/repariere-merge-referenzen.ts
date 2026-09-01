/**
 * Repariert Kind-Referenzen, die nach einem Merge ins Leere zeigen.
 *
 * Hintergrund: `duplikate-zusammenfuehren.ts` hat das gefilterte Feld in der
 * Appwrite-Abfrage als ersten Wert in `values` übergeben statt in `attribute`.
 * Die API antwortete mit HTTP 400, das Skript wertete das als „keine Kinder"
 * und löschte den Verlierer trotzdem. Ergebnis: Ansprechpartner, Saisondaten,
 * Projekte und Beziehungen der aufgelösten Kunden hängen ohne Elternteil.
 *
 * Es ist nichts verloren gegangen — nur die Verknüpfung fehlt. Dieses Skript
 * liest `kunden_merge_archiv`, bildet loserId → survivorId (Merge-Ketten werden
 * aufgelöst) und hängt alle gefundenen Kinder um. Es ist mehrfach ausführbar.
 *
 *   npx tsx scripts/repariere-merge-referenzen.ts              # Dry-Run, Sandbox
 *   npx tsx scripts/repariere-merge-referenzen.ts --apply
 *   npx tsx scripts/repariere-merge-referenzen.ts --apply --produktion
 */
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT!;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID!;
const apiKey = process.env.APPWRITE_API_KEY!;
if (!endpoint || !projectId || !apiKey) { console.error('❌ Appwrite-Env fehlt'); process.exit(1); }

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DB = args.includes('--produktion') ? 'tennismehl24_db' : 'tennismehl24_db_mock';

const KINDER: Array<[string, string]> = [
  ['saison_ansprechpartner', 'kundeId'],
  ['saison_daten', 'kundeId'],
  ['saison_aktivitaeten', 'kundeId'],
  ['kunden_aktivitaeten', 'kundeId'],
  ['siebanalysen', 'kundeId'],
  ['saison_beziehungen', 'vereinId'],
  ['saison_beziehungen', 'platzbauerId'],
  ['platzbauer_projekte', 'platzbauerId'],
  ['instandsetzungsauftraege', 'platzbauerId'],
  ['projekte', 'kundeId'],
];

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

async function ladeAlle(tabelle: string, filter?: { feld: string; wert: string }): Promise<Zeile[]> {
  const raus: Zeile[] = [];
  let cursor: string | null = null;
  for (;;) {
    const q: Array<Record<string, unknown>> = [{ method: 'limit', values: [100] }];
    if (filter) q.unshift({ method: 'equal', attribute: filter.feld, values: [filter.wert] });
    if (cursor) q.push({ method: 'cursorAfter', values: [cursor] });
    const qs = q.map((e) => `queries[]=${encodeURIComponent(JSON.stringify(e))}`).join('&');
    const res = await api<{ rows: Zeile[] }>('GET', `/tablesdb/${DB}/tables/${tabelle}/rows?${qs}`);
    if (!res.ok) {
      if (res.status === 404) return raus;
      throw new Error(`${tabelle}: HTTP ${res.status} ${res.daten?.message ?? ''}`);
    }
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
const pause = () => new Promise((r) => setTimeout(r, 220));

async function main() {
  console.log('═'.repeat(72));
  console.log('  MERGE-REFERENZEN REPARIEREN');
  console.log(`  Ziel:  ${DB === 'tennismehl24_db' ? '⚠️  PRODUKTION' : '🧪 SANDBOX'}  (${DB})`);
  console.log(`  Modus: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('═'.repeat(72));

  const archiv = await ladeAlle('kunden_merge_archiv');
  console.log(`Archiv: ${archiv.length} Merge-Vorgänge.`);

  // loserId → survivorId. Wurde ein Survivor später selbst aufgelöst, muss das
  // Kind am Ende beim letzten Überlebenden landen.
  const direkt = new Map<string, string>();
  const namen = new Map<string, string>();
  for (const a of archiv) {
    const lid = String(a.loserId ?? ''), sid = String(a.survivorId ?? '');
    if (!lid || !sid) continue;
    direkt.set(lid, sid);
    namen.set(sid, String(a.survivorName ?? ''));
  }
  const endziel = (id: string) => {
    let cur = id;
    for (let i = 0; i < 20 && direkt.has(cur); i++) cur = direkt.get(cur)!;
    return cur;
  };

  // Existiert der Survivor überhaupt noch?
  const kunden = await ladeAlle('saison_kunden');
  const lebend = new Map<string, Record<string, any>>();
  for (const z of kunden) lebend.set(z.$id, obj(z.data));

  let gefunden = 0, umgehaengt = 0, ohneZiel = 0;
  const proCollection: Record<string, number> = {};

  // Jede Kind-Collection genau EINMAL laden und clientseitig zuordnen. Das ist
  // nicht nur schneller als eine Abfrage je aufgelöstem Kunden — es erwischt
  // auch `siebanalysen`, wo die kundeId nur im data-JSON steht und gar nicht
  // als Spalte abfragbar ist.
  const gesehen = new Map<string, Zeile[]>();
  for (const [coll] of KINDER) {
    if (gesehen.has(coll)) continue;
    try { gesehen.set(coll, await ladeAlle(coll)); }
    catch (e) { console.error(`   ✗ ${coll} nicht lesbar: ${(e as Error).message}`); gesehen.set(coll, []); }
  }

  for (const [coll, feld] of KINDER) {
    const alle = gesehen.get(coll) ?? [];
    for (const kind of alle) {
      const kd = obj(kind.data);
      const roh = String((kind as Record<string, unknown>)[feld] ?? kd[feld] ?? '');
      if (!roh || !direkt.has(roh)) continue;
      const ziel = endziel(roh);
      if (ziel === roh) continue;
      const survivor = lebend.get(ziel);
      if (!survivor) {
        console.warn(`   ⚠ ${coll}.${feld}/${kind.$id}: Survivor ${ziel} existiert nicht mehr`);
        ohneZiel++;
        continue;
      }
      gefunden++;
      proCollection[`${coll}.${feld}`] = (proCollection[`${coll}.${feld}`] ?? 0) + 1;
      console.log(`   ${coll}.${feld}  ${kind.$id}  → „${survivor.name ?? ziel}"`);
      if (!APPLY) continue;

      kd[feld] = ziel;
      const top: Record<string, unknown> = {};
      // Nur Spalten schreiben, die es in dieser Collection wirklich gibt —
      // siebanalysen kennt z. B. ausschließlich `data`.
      if ((kind as Record<string, unknown>)[feld] !== undefined) top[feld] = ziel;
      if (coll === 'projekte') {
        kd.kundenname = survivor.name; kd.kundennummer = survivor.kundennummer;
        if ((kind as Record<string, unknown>).kundenname !== undefined) top.kundenname = survivor.name;
        if ((kind as Record<string, unknown>).kundennummer !== undefined) top.kundennummer = survivor.kundennummer;
      }
      if (coll === 'platzbauer_projekte') {
        kd.platzbauerName = survivor.name;
        if ((kind as Record<string, unknown>).platzbauerName !== undefined) top.platzbauerName = survivor.name;
      }
      const r = await api('PATCH', `/tablesdb/${DB}/tables/${coll}/rows/${kind.$id}`, {
        data: { ...top, ...(kind.data !== undefined ? { data: JSON.stringify(kd) } : {}) },
      });
      if (r.ok) umgehaengt++;
      else console.error(`     ✗ ${coll}/${kind.$id}: ${r.daten.message}`);
      await pause();
    }
  }

  console.log('\n' + '═'.repeat(72));
  for (const [k, v] of Object.entries(proCollection)) console.log(`   ${String(v).padStart(4)}  ${k}`);
  console.log(`${APPLY ? 'Umgehängt' : 'Zu reparieren'}: ${APPLY ? umgehaengt : gefunden} Kind-Datensätze.`);
  if (ohneZiel) console.log(`⚠️  ${ohneZiel} ohne existierenden Survivor — bitte einzeln ansehen.`);
  if (!APPLY) console.log('DRY-RUN — nichts geschrieben. Zum Ausführen: --apply');
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
