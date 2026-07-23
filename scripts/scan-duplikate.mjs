/**
 * READ-ONLY Scan: findet Duplikat-Kandidaten unter den saison_kunden.
 * Schreibt nichts. Dient nur dazu, die Größenordnung zu zeigen.
 *
 * Aufruf: node scripts/scan-duplikate.mjs
 */
import { readFileSync } from 'fs';
import { Client, Databases, Query } from 'node-appwrite';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = 'tennismehl24_db';
const COLLECTION = 'saison_kunden';

const STOPWORDS = new Set([
  'ev', 'e', 'v', 'gmbh', 'co', 'kg', 'tc', 'tv', 'tsv', 'sv', 'sg', 'spvgg', 'fc',
  'tennis', 'tennisclub', 'tennisverein', 'verein', 'abteilung', 'abt', 'der', 'die',
  'das', 'und', '1', 'club', 'und',
]);
function norm(name) {
  return (name || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(' ')
    .trim();
}
function bigrams(s) {
  const t = s.replace(/\s/g, '');
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}
function dice(a, b) {
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

async function ladeAlle() {
  const docs = [];
  let offset = 0;
  for (;;) {
    const res = await db.listDocuments(DB, COLLECTION, [Query.limit(100), Query.offset(offset)]);
    docs.push(...res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }
  return docs;
}

const kunden = (await ladeAlle())
  .map((d) => {
    try {
      const k = JSON.parse(d.data);
      return {
        id: k.id || d.$id,
        name: k.name || '',
        nname: norm(k.name),
        plz: k.lieferadresse?.plz || k.rechnungsadresse?.plz || '',
        ort: k.lieferadresse?.ort || k.rechnungsadresse?.ort || '',
        kundennummer: k.kundennummer || '',
        mosaikKurzname: k.mosaikKurzname || '',
        email: k.email || k.rechnungsEmail || '',
        aktiv: k.aktiv,
      };
    } catch {
      return null;
    }
  })
  .filter(Boolean);

console.log(`saison_kunden: ${kunden.length}\n`);

// Blocking: nach normalisiertem Namen UND nach PLZ, um O(n^2) zu vermeiden.
const byName = new Map();
const byPlz = new Map();
for (const k of kunden) {
  if (k.nname) (byName.get(k.nname) || byName.set(k.nname, []).get(k.nname)).push(k);
  if (k.plz) (byPlz.get(k.plz) || byPlz.set(k.plz, []).get(k.plz)).push(k);
}

const paare = new Map(); // key "idA|idB" -> {a,b,score,signale}
function addPaar(a, b, score, signale) {
  if (a.id === b.id) return;
  const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
  const ex = paare.get(key);
  if (!ex || score > ex.score) paare.set(key, { a, b, score, signale });
}

// 1) Exakt gleicher normalisierter Name
for (const [, gruppe] of byName) {
  if (gruppe.length < 2) continue;
  for (let i = 0; i < gruppe.length; i++)
    for (let j = i + 1; j < gruppe.length; j++) {
      const a = gruppe[i], b = gruppe[j];
      const sig = ['gleicher Name'];
      let score = 0.8;
      if (a.plz && a.plz === b.plz) { score += 0.15; sig.push('gleiche PLZ'); }
      if (a.mosaikKurzname && a.mosaikKurzname === b.mosaikKurzname) { score = 1; sig.push('gleicher Kurzname'); }
      addPaar(a, b, Math.min(score, 1), sig);
    }
}
// 2) Innerhalb gleicher PLZ: hohe Namensähnlichkeit
for (const [, gruppe] of byPlz) {
  if (gruppe.length < 2 || gruppe.length > 400) continue;
  for (let i = 0; i < gruppe.length; i++)
    for (let j = i + 1; j < gruppe.length; j++) {
      const a = gruppe[i], b = gruppe[j];
      if (!a.nname || !b.nname) continue;
      const sim = dice(a.nname, b.nname);
      if (sim >= 0.7) addPaar(a, b, Math.min(0.6 + sim * 0.35, 0.99), [`Name ${(sim * 100) | 0}% ähnlich`, 'gleiche PLZ']);
    }
}

const liste = [...paare.values()].sort((x, y) => y.score - x.score);
const sicher = liste.filter((p) => p.score >= 0.9);
const wahrscheinlich = liste.filter((p) => p.score >= 0.75 && p.score < 0.9);
const moeglich = liste.filter((p) => p.score < 0.75);

console.log('=== Duplikat-Kandidaten (Paare) ===');
console.log(`  sehr sicher (>=90%):   ${sicher.length}`);
console.log(`  wahrscheinlich (75-90%): ${wahrscheinlich.length}`);
console.log(`  möglich (<75%):        ${moeglich.length}`);
console.log(`  gesamt:                ${liste.length}\n`);

console.log('=== Top 25 Beispiele ===');
for (const p of liste.slice(0, 25)) {
  console.log(
    `  ${(p.score * 100) | 0}%  "${p.a.name}" [${p.a.kundennummer}] <-> "${p.b.name}" [${p.b.kundennummer}]  | ${p.a.plz} ${p.a.ort} | ${p.signale.join(', ')}`
  );
}
