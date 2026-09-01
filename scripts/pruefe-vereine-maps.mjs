/**
 * Prüft Duplikat-Kandidaten gegen Google Places: Gibt es die beiden Vereine
 * wirklich getrennt, oder ist es derselbe Ort?
 *
 *   node scripts/pruefe-vereine-maps.mjs --liste=<csv>            # nur offene Zeilen
 *   node scripts/pruefe-vereine-maps.mjs --liste=<csv> --alle
 *
 * Das Ergebnis ist erstaunlich trennscharf. An sieben bekannten Fällen geprüft:
 * jedes bestätigte Duplikat lieferte für BEIDE Namen dieselbe place_id (0 m
 * Abstand), jedes bestätigte Nicht-Duplikat zwei verschiedene Orte — von 966 m
 * (TVK 81 / TSG Kaiserslautern) bis 319 km (zwei Orte namens Neunkirchen).
 *
 * Geschrieben werden zwei neue Spalten, `maps_befund` und `maps_abstand`. Die
 * Einstufung bleibt unangetastet: das Werkzeug liefert einen Beleg, die
 * Entscheidung trifft weiter der Mensch.
 *
 * Kosten: eine Text-Search-Anfrage je Name (~0,03 €). Antworten landen in
 * `scripts/.maps-cache.json`, wiederholte Läufe kosten deshalb nichts.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const listeArg = args.find((a) => a.startsWith('--liste='));
if (!listeArg) { console.error('--liste=<csv> fehlt'); process.exit(1); }
const LISTE = listeArg.split('=')[1];
const ALLE = args.includes('--alle');
// Belegte Trennungen gleich eintragen. Bewusst nur diese Richtung: „zwei
// getrennte Vereine" heißt nur, dass nichts zusammengeführt wird — da kann
// nichts kaputtgehen. Ein Merge bleibt Handarbeit.
const UEBERNEHMEN = args.includes('--uebernehmen');
const CACHE_PFAD = path.resolve(process.cwd(), 'scripts/.maps-cache.json');

const env = {};
for (const line of readFileSync(path.resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const KEY = env.VITE_GOOGLE_MAPS_API_KEY;
if (!KEY) { console.error('❌ VITE_GOOGLE_MAPS_API_KEY fehlt'); process.exit(1); }

const cache = existsSync(CACHE_PFAD) ? JSON.parse(readFileSync(CACHE_PFAD, 'utf8')) : {};
let neueAnfragen = 0;

async function suche(text) {
  if (Object.prototype.hasOwnProperty.call(cache, text)) return cache[text];
  const r = await fetch('https://maps.googleapis.com/maps/api/place/textsearch/json?query='
    + encodeURIComponent(text) + '&language=de&region=de&key=' + KEY);
  const j = await r.json();
  neueAnfragen++;
  const p = (j.results || [])[0];
  const treffer = p ? {
    name: p.name, adresse: p.formatted_address, id: p.place_id,
    lat: p.geometry?.location?.lat, lng: p.geometry?.location?.lng,
  } : null;
  cache[text] = treffer;
  writeFileSync(CACHE_PFAD, JSON.stringify(cache, null, 1));
  await new Promise((w) => setTimeout(w, 120));
  return treffer;
}

/**
 * Passt der Google-Treffer überhaupt zum gesuchten Verein?
 *
 * Text Search liefert IMMER etwas — für „TC Frankenwinheim" kam eine
 * Raiffeisenbank, für „Baumpflege Bechstein" ein Blumencenter. Ungeprüft läse
 * sich das als „zwei verschiedene Orte" und damit als Beleg gegen ein Duplikat,
 * obwohl Google den Verein schlicht nicht kennt.
 */
function passt(suchname, plz, treffer) {
  if (!treffer) return false;
  const tokens = (s) => String(s ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const gesucht = tokens(suchname), gefunden = tokens(treffer.name);
  // Ein gemeinsames markantes Wort (meist der Ortsname) muss vorkommen …
  const gemeinsam = gesucht.some((t) => gefunden.includes(t));
  // … oder die PLZ stimmt und der Treffer ist überhaupt ein Verein/Sportplatz.
  const plzTrifft = plz && String(treffer.adresse ?? '').includes(String(plz).trim());
  return gemeinsam || (plzTrifft && /tennis|sport|verein|club|tc |tsv|sv /i.test(treffer.name));
}

function abstand(a, b) {
  if (!a?.lat || !b?.lat) return null;
  const R = 6371e3, rad = (x) => (x * Math.PI) / 180;
  const dφ = rad(b.lat - a.lat), dλ = rad(b.lng - a.lng);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dλ / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// --- CSV ---
function zerlege(z) {
  const raus = []; let cur = '', inQ = false;
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
const fuege = (f) => (/[";]/.test(f ?? '') ? '"' + String(f).replace(/"/g, '""') + '"' : (f ?? ''));

const roh = readFileSync(LISTE, 'utf8');
const bom = roh.startsWith('﻿');
const zeilen = roh.replace(/^﻿/, '').trim().split('\n');
let kopf = zerlege(zeilen[0]);
const reihen = zeilen.slice(1).filter((z) => z.trim()).map(zerlege);

for (const spalte of ['maps_befund', 'maps_abstand']) {
  if (!kopf.includes(spalte)) { kopf.push(spalte); reihen.forEach((r) => r.push('')); }
}
const idx = (n) => kopf.indexOf(n);

const cluster = new Map();
for (const r of reihen) {
  const c = r[idx('cluster')];
  if (!cluster.has(c)) cluster.set(c, []);
  cluster.get(c).push(r);
}

console.log(`🗺  Google-Places-Prüfung — ${cluster.size} Cluster in ${path.basename(LISTE)}`);

let geprueft = 0, gleicherOrt = 0, verschieden = 0, unklar = 0, uebernommen = 0;
for (const [nr, gruppe] of cluster) {
  if (!ALLE && gruppe[0][idx('einstufung')]) continue;      // schon entschieden
  if (gruppe.length !== 2) continue;                         // Vergleich nur paarweise sinnvoll
  const [a, b] = gruppe;
  const frage = (r) => [r[idx('name')], r[idx('plz')], r[idx('ort')]].filter(Boolean).join(', ');
  const A = await suche(frage(a));
  const B = await suche(frage(b));
  geprueft++;

  const passtA = passt(a[idx('name')], a[idx('plz')], A);
  const passtB = passt(b[idx('name')], b[idx('plz')], B);

  let befund, meter = '';
  if (!A || !B || !passtA || !passtB) {
    const fehlt = [!passtA ? a[idx('name')] : null, !passtB ? b[idx('name')] : null].filter(Boolean);
    befund = `bei Google nicht gefunden: ${fehlt.join(' / ')}`;
    unklar++;
  } else if (A.id === B.id) {
    befund = `derselbe Ort: ${A.name}, ${A.adresse}`;
    gleicherOrt++;
  } else {
    const d = abstand(A, B);
    meter = d === null ? '' : String(d);
    befund = `zwei getrennte Vereine: „${A.name}" (${A.adresse}) und „${B.name}" (${B.adresse})`;
    verschieden++;
  }
  for (const r of gruppe) { r[idx('maps_befund')] = befund; r[idx('maps_abstand')] = meter; }
  if (UEBERNEHMEN && befund.startsWith('zwei getrennte Vereine') && Number(meter) >= 250 && !gruppe[0][idx('einstufung')]) {
    for (const r of gruppe) {
      r[idx('einstufung')] = 'getrennt';
      if (idx('notiz_pruefer') >= 0) r[idx('notiz_pruefer')] = `laut Google zwei Vereine, ${meter} m auseinander`;
    }
    uebernommen++;
  }
  const kurz = befund.length > 96 ? befund.slice(0, 96) + '…' : befund;
  console.log(`  [${nr}] ${kurz}${meter ? `  (${meter} m)` : ''}`);
}

writeFileSync(LISTE, (bom ? '﻿' : '') + [kopf.map(fuege).join(';'), ...reihen.map((r) => r.map(fuege).join(';'))].join('\n') + '\n', 'utf8');

console.log('\n' + '═'.repeat(64));
console.log(`Geprüft:            ${geprueft} Cluster`);
console.log(`  derselbe Ort:     ${gleicherOrt}   → spricht fürs Zusammenführen`);
console.log(`  zwei Vereine:     ${verschieden}   → spricht dagegen`);
console.log(`  nicht gefunden:   ${unklar}   → kein Beleg, weiter von Hand prüfen`);
if (UEBERNEHMEN) console.log(`Auf „getrennt" gesetzt: ${uebernommen}`);
console.log(`Neue API-Anfragen:  ${neueAnfragen} (~${(neueAnfragen * 0.03).toFixed(2)} €)`);
console.log(`Ergebnis steht in den Spalten maps_befund / maps_abstand.`);
