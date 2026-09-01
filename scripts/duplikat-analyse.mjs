/**
 * READ-ONLY Duplikat-Analyse über den gesamten Kundenstamm (saison_kunden).
 *
 * Schreibt NICHTS in die Datenbank. Erzeugt eine Prüf-CSV, in der die
 * Kandidaten zu Clustern gruppiert und nach Sicherheit gestaffelt sind.
 *
 *   node scripts/duplikat-analyse.mjs                 # Sandbox (Standard)
 *   node scripts/duplikat-analyse.mjs --produktion    # Produktion, weiterhin read-only
 *   node scripts/duplikat-analyse.mjs --min=0.55      # Schwelle senken (mehr Kandidaten)
 *   node scripts/duplikat-analyse.mjs --out=pfad.csv
 *
 * Warum ein zweites Werkzeug neben duplikatService.findeDuplikate():
 * Der Service blockt nur über exakt gleichen Namen und über gleiche PLZ. Beides
 * greift nicht, wenn die PLZ fehlt oder falsch ist, wenn ein Datensatz „TC
 * Musterstadt" und der andere „Tennisclub Musterstadt e.V." heißt, oder wenn nur
 * Adresse/E-Mail/Telefon übereinstimmen. Dieses Skript prüft ALLE Paare und
 * bewertet mehrere unabhängige Signale.
 */
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Umgebung
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const PRODUKTION = args.includes('--produktion');
const DB = PRODUKTION ? 'tennismehl24_db' : 'tennismehl24_db_mock';
const MIN_SCORE = Number((args.find((a) => a.startsWith('--min=')) || '--min=0.60').split('=')[1]);
const OUT = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1]
  || path.resolve(process.cwd(), `duplikat-kandidaten-${PRODUKTION ? 'prod' : 'mock'}-${new Date().toISOString().slice(0, 10)}.csv`);

const env = {};
for (const line of readFileSync(path.resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
const KEY = env.APPWRITE_API_KEY;
if (!ENDPOINT || !PROJECT || !KEY) { console.error('❌ Appwrite-Env fehlt'); process.exit(1); }

async function ladeCollection(col) {
  const alle = []; let cursor = null;
  for (;;) {
    const queries = [JSON.stringify({ method: 'limit', values: [100] })];
    if (cursor) queries.push(JSON.stringify({ method: 'cursorAfter', values: [cursor] }));
    const q = queries.map((x) => `queries[]=${encodeURIComponent(x)}`).join('&');
    let r;
    for (let versuch = 0; ; versuch++) {
      r = await fetch(`${ENDPOINT}/databases/${DB}/collections/${col}/documents?${q}`,
        { headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY } });
      if (r.status !== 429 || versuch >= 8) break;
      await new Promise((w) => setTimeout(w, 3000 * (versuch + 1)));
    }
    if (!r.ok) throw new Error(`${col}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const res = await r.json();
    alle.push(...res.documents);
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return alle;
}

// ---------------------------------------------------------------------------
// Normalisierung
// ---------------------------------------------------------------------------
function basis(s) {
  return (s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[àáâã]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõ]/g, 'o').replace(/[ùúûũ]/g, 'u').replace(/ç/g, 'c')
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Mehrwort-Begriffe zuerst auf ihr Kürzel ziehen: „Tennisclub Musterstadt" und
// „TC Musterstadt" müssen denselben Kern ergeben, sonst findet man das Paar nie.
const PHRASEN = [
  [/\bturn und sportverein\b/g, 'tsv'], [/\bturn und sport verein\b/g, 'tsv'],
  [/\bturnerschaft\b/g, 'ts'], [/\bturn und sport\b/g, 'tsv'],
  [/\bsportgemeinschaft\b/g, 'sg'], [/\bspielvereinigung\b/g, 'spvgg'],
  [/\bsportverein\b/g, 'sv'], [/\bsportclub\b/g, 'sc'], [/\bsportklub\b/g, 'sc'],
  [/\bturnverein\b/g, 'tv'], [/\bfussballclub\b/g, 'fc'], [/\bfussballverein\b/g, 'fc'],
  [/\btennisclub\b/g, 'tc'], [/\btennisklub\b/g, 'tc'], [/\btennis club\b/g, 'tc'],
  [/\btennisverein\b/g, 'tv'], [/\btennisgesellschaft\b/g, 'tg'],
  [/\btennisgemeinschaft\b/g, 'tg'], [/\btennisfreunde\b/g, 'tf'],
  [/\bturngemeinde\b/g, 'tg'], [/\bturnerbund\b/g, 'tb'],
  [/\bsportgemeinde\b/g, 'sg'], [/\bturn und sportgemeinschaft\b/g, 'tsg'],
  [/\btennisabteilung\b/g, ' '], [/\babteilung tennis\b/g, ' '],
  [/\brot weiss\b/g, 'rw'], [/\bblau weiss\b/g, 'bw'], [/\bgruen weiss\b/g, 'gw'],
  [/\bschwarz weiss\b/g, 'sw'], [/\brot gelb\b/g, 'rg'], [/\bblau gelb\b/g, 'bg'],
  [/\bsportfreunde\b/g, 'sf'], [/\bsportanlage[n]?\b/g, ' '],
  [/\btennisanlage[n]?\b/g, ' '], [/\btennisplatz\b/g, ' '], [/\btennisplaetze\b/g, ' '],
];

// Rauschen ohne Unterscheidungskraft.
const RAUSCH = new Set([
  'ev', 'e', 'v', 'eg', 'gmbh', 'mbh', 'co', 'kg', 'ag', 'ohg', 'gbr', 'ug', 'kgaa',
  'verein', 'abteilung', 'abt', 'sparte', 'sektion', 'der', 'die', 'das', 'und',
  'fuer', 'von', 'zum', 'zur', 'am', 'im', 'in', 'an', 'den', 'dem', 'des',
  'tennis', 'club', 'klub', 'ta', 'tennisabt', 'herren', 'damen',
]);

// Rechtsform-/Körperschaftsmarker. Ein Verein und „seine" Kommune oder der
// örtliche Baustoffhändler teilen sich Ort, oft auch Anschrift — sie sind aber
// zwei Kunden. In der ersten Runde der häufigste Falschtreffer.
const TYP_MARKER = [
  ['verein', /\be\s?\.?\s?v\b|\bverein\b|\bclub\b|\bklub\b|\bspvgg\b|\bdjk\b|\bta\b/],
  ['kommune', /\bstadt\b|\bgemeinde\b|\bmarkt\b|\bbauhof\b|\bsportamt\b|\bverwaltung\b|\blandkreis\b/],
  ['firma', /\bgmbh\b|\bmbh\b|\bag\b|\bkg\b|\bohg\b|\bgbr\b|\bug\b|\be\.?k\b|\bggmbh\b/],
];
function typMarker(name) {
  const b = basis(name);
  const set = new Set();
  for (const [typ, re] of TYP_MARKER) if (re.test(b)) set.add(typ);
  return set;
}
// Vereins-/Farbkürzel: bleiben im Kern (sie unterscheiden TSV von TC),
// fallen aber für den Ortsvergleich weg.
const KUERZEL = new Set([
  'tc', 'tv', 'tsv', 'sv', 'sg', 'sc', 'spvgg', 'fc', 'tg', 'djk', 'mtv', 'vfl',
  'vfb', 'tus', 'tsg', 'ts', 'tf', 'sf', 'ska', 'rw', 'bw', 'gw', 'sw', 'rg', 'bg',
  'post', 'polizei', 'bsc', 'esv', 'asv', 'fsv', 'msv', 'ssv', 'wsv', 'blsv',
  'tb', 'skg', 'ttc', 'htc', 'tgz', 'zv', 'tuspo', 'tsc', 'vfr', 'sus', 'rsv',
  'ksv', 'osc', 'psv', 'usc', 'stc', 'atv', 'mtc',
]);

// Farb-/Zusatzkürzel unterscheiden KEINE Vereine: „TC Birstein" und „TC BW
// Birstein" sind derselbe Club. Organisationskürzel dagegen schon: TC Baunach
// und 1. FC Baunach sind zwei Vereine im selben Ort — genau dieser Fall hat in
// der ersten Runde die meisten Falschtreffer erzeugt.
const FARB_KUERZEL = new Set(['rw', 'bw', 'gw', 'sw', 'rg', 'bg']);
const ORG_KUERZEL = new Set([...KUERZEL].filter((k) => !FARB_KUERZEL.has(k)));

// Platzhalter statt Name — „Tennisplatzbau", „privat", „Gemeinde X". Solche
// Datensätze treffen sich gegenseitig, sind aber nie Duplikate voneinander.
const GENERISCHE_WOERTER = new Set([
  'privat', 'privatkunde', 'tennisplatzbau', 'tennisplatzservice', 'tennisservice',
  'tennisanlage', 'sportanlagenbau', 'galabau', 'gartenbau', 'baustoffe', 'bauhof',
  'sportamt', 'sportverein', 'testverein', 'kunde', 'firma', 'herrn', 'frau',
  'gemeinde', 'stadt', 'markt', 'bauamt', 'platzbauer', 'barverkauf', 'diverse',
]);

function tokens(name) {
  let s = basis(name);
  for (const [re, rep] of PHRASEN) s = s.replace(re, rep);
  return s.split(' ').filter(Boolean);
}
/** Jahreszahlen im Vereinsnamen („TC 1959 Hainstadt" / „TC Hainstadt 1959"):
 *  raus aus dem Kern, weil sie mal vorne, mal hinten, mal gar nicht erfasst sind. */
function jahre(name) {
  return tokens(name).filter((t) => /^(1[89]\d\d|20[0-2]\d)$/.test(t));
}
function kernTokens(name) {
  return tokens(name).filter((t) =>
    !RAUSCH.has(t) && !/^\d{1,2}$/.test(t) && !/^(1[89]\d\d|20[0-2]\d)$/.test(t));
}
/** Kern: Reihenfolge egal, Kürzel behalten. */
function nKern(name) {
  return [...new Set(kernTokens(name))].sort().join(' ');
}
/** Ortsteil: Kürzel zusätzlich weg — „TSV Bamberg" und „TC Bamberg" ergeben beide „bamberg". */
function nOrt(name) {
  return [...new Set(kernTokens(name).filter((t) => !KUERZEL.has(t)))].sort().join(' ');
}

function normStrasse(s) {
  return basis(s)
    .replace(/\bstr\b/g, 'strasse').replace(/\bstrase\b/g, 'strasse')
    .replace(/\bstrasse\b/g, 'str').replace(/\bplatz\b/g, 'pl').replace(/\bweg\b/g, 'wg')
    .replace(/\s+/g, '');
}
function normTelefon(t) {
  let d = (t || '').replace(/[^\d]/g, '');
  if (d.startsWith('0049')) d = '0' + d.slice(4);
  if (d.startsWith('49') && d.length > 10) d = '0' + d.slice(2);
  if (d && !d.startsWith('0')) d = '0' + d;
  return d.length >= 7 ? d : '';
}
function normMail(m) {
  const s = (m || '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s) ? s : '';
}

// Der teuerste Irrtum der ersten Runde: gleiche E-Mail wurde als Duplikatbeweis
// gewertet. Bei Freemail-Adressen ist sie das nicht — ein Platzwart betreut zwei
// Vereine, dann steht seine gmx-Adresse bei beiden. Eine VEREINSDOMAIN
// (tc-hainstadt.de) gehört dagegen genau einem Kunden.
const FREEMAIL = new Set([
  'gmx.de', 'gmx.net', 'gmx.at', 'web.de', 't-online.de', 'gmail.com',
  'googlemail.com', 'hotmail.com', 'hotmail.de', 'outlook.com', 'outlook.de',
  'yahoo.de', 'yahoo.com', 'freenet.de', 'aol.com', 'icloud.com', 'me.com',
  'mail.de', 'online.de', 'arcor.de', 'kabelmail.de', 'vodafone.de',
  'posteo.de', 'mailbox.org', 'live.de', 'msn.com', 'unitybox.de', 'ewetel.net',
  'bluewin.ch', 'gmx.ch', 'nexgo.de', 'freundschaft.de', 'aim.com',
  'aol.de', 'gmx.com', 't-online.com', 'email.de', 'kabelbw.de', 'o2online.de',
]);
function domain(mail) { return (mail.split('@')[1] || '').toLowerCase(); }
function istFreemail(mail) { return FREEMAIL.has(domain(mail)); }

// ---------------------------------------------------------------------------
// Ähnlichkeit
// ---------------------------------------------------------------------------
function bigrams(s) {
  const t = s.replace(/\s/g, ''); const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}
function dice(A, B) {
  if (!A.size || !B.size) return 0;
  const [k, g] = A.size < B.size ? [A, B] : [B, A];
  let inter = 0; for (const x of k) if (g.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}
function jaccard(A, B) {
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function levSim(a, b) {
  const max = Math.max(a.length, b.length);
  return max ? 1 - levenshtein(a, b) / max : 0;
}

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------
console.log(`🔍 Duplikat-Analyse — Datenbank ${DB} (read-only), Schwelle ${MIN_SCORE}`);
// Nacheinander: parallele Leseschleifen laufen bei Appwrite in die Drosselung.
const kundenDocs = await ladeCollection('saison_kunden');
const projekte = await ladeCollection('projekte');
const ansprechpartner = await ladeCollection('saison_ansprechpartner');
const saisonDaten = await ladeCollection('saison_daten');
const beziehungen = await ladeCollection('saison_beziehungen');
const platzbauerProjekte = await ladeCollection('platzbauer_projekte');

const refProjekte = new Map(), refJahr = new Map(), refAP = new Map(), refSD = new Map(), refBez = new Map();
const bump = (map, k, v = 1) => { if (k) map.set(k, (map.get(k) || 0) + v); };
for (const p of projekte) {
  bump(refProjekte, p.kundeId);
  const j = Number(p.saisonjahr) || 0;
  if (p.kundeId && j > (refJahr.get(p.kundeId) || 0)) refJahr.set(p.kundeId, j);
}
for (const a of ansprechpartner) bump(refAP, a.kundeId);
for (const s of saisonDaten) bump(refSD, s.kundeId);
for (const b of beziehungen) { bump(refBez, b.vereinId); bump(refBez, b.platzbauerId); }
for (const p of platzbauerProjekte) { bump(refProjekte, p.platzbauerId); const j = Number(p.saisonjahr) || 0; if (p.platzbauerId && j > (refJahr.get(p.platzbauerId) || 0)) refJahr.set(p.platzbauerId, j); }

// Adressen von Platzbauern, Speditionen und Alt-Inhabern: stehen bei vielen
// Vereinen im Feld, gehören aber keinem davon.
let BLOCK_DOMAINS = new Set(), BLOCK_ADRESSEN = new Set();
try {
  const bl = JSON.parse(readFileSync(path.resolve(process.cwd(), 'scripts/dienstleister-blockliste.json'), 'utf8'));
  BLOCK_DOMAINS = new Set(bl.domains || []);
  BLOCK_ADRESSEN = new Set(bl.adressen || []);
} catch { console.warn('⚠️  dienstleister-blockliste.json nicht gelesen'); }

const kunden = [];
for (const d of kundenDocs) {
  let k; try { k = JSON.parse(d.data); } catch { continue; }
  const id = k.id || d.$id;
  const ra = k.rechnungsadresse || k.adresse || {};
  const la = k.lieferadresse || {};
  const mails = [...new Set([normMail(k.email), normMail(k.rechnungsEmail), ...(k.angebotsEmails || []).map(normMail)].filter(Boolean))];
  const tele = [...new Set([normTelefon(k.telefon), normTelefon(k.mobiltelefon), normTelefon(k.dispoAnsprechpartner?.telefon)].filter(Boolean))];
  const adressen = [ra, la, ...(k.lieferadressen || [])]
    .filter((a) => a && (a.strasse || a.plz))
    .map((a) => ({ str: normStrasse(a.strasse), plz: (a.plz || '').trim(), ort: basis(a.ort) }));
  const kern = nKern(k.name);
  const kurz = (k.mosaikKurzname || '').trim();
  kunden.push({
    doc: d.$id, id,
    name: k.name || '', typ: k.typ || '', gruppe: k.gruppe || '',
    kundennummer: (k.kundennummer || '').trim(),
    mosaikKurzname: kurz,
    // „Heubach" und „Heubach1": Mosaik hat die Dublette selbst durchnummeriert.
    kurzBasis: basis(kurz).replace(/(?<=[a-z])\s?[1-9]$/, '').trim(),
    nKern: kern, nOrt: nOrt(k.name),
    kernSet: new Set(kernTokens(k.name)),
    jahre: new Set(jahre(k.name)),
    orgKuerzel: new Set(kernTokens(k.name).filter((t) => ORG_KUERZEL.has(t))),
    typMarker: typMarker(k.name),
    bg: bigrams(kern),
    plz: (ra.plz || la.plz || '').trim(),
    ort: basis(ra.ort || la.ort || ''),
    strasse: ra.strasse || la.strasse || '',
    adressen,
    mails, tele,
    eigenDomains: new Set(mails.filter((m) => !istFreemail(m) && !BLOCK_DOMAINS.has(domain(m))).map(domain)),
    aktiv: k.aktiv !== false,
    optIn: k.automatischesAngebot === true,
    archiviert: k.archiviert === true,
    notizen: (k.notizen || '').replace(/\s+/g, ' ').trim(),
    letzteBuchung: k.zahlungsstatistik?.letzteBuchung || '',
    historieJahre: Array.isArray(k.bestellhistorie) ? k.bestellhistorie.length : 0,
    historieSumme: Array.isArray(k.bestellhistorie) ? k.bestellhistorie.reduce((s2, e) => s2 + (Number(e?.summeEuro) || 0), 0) : 0,
    anzahlBuchungen: k.zahlungsstatistik?.anzahlBuchungen || 0,
    erstelltAm: (k.erstelltAm || d.$createdAt || '').slice(0, 10),
    nProjekte: refProjekte.get(id) || 0,
    letztesJahr: refJahr.get(id) || 0,
    nAP: refAP.get(id) || 0,
    nSD: refSD.get(id) || 0,
    nBez: refBez.get(id) || 0,
  });
}
console.log(`📊 ${kunden.length} Kundendatensätze geladen (${kunden.filter((k) => k.archiviert).length} archiviert)\n`);

// Ein Name, der mehrfach über verschiedene PLZ-Regionen verteilt vorkommt, ist
// ein Platzhalter („Tennisplatzbau", „privat") und beweist gar nichts.
const kernRegionen = new Map();
for (const k of kunden) {
  if (!k.nKern) continue;
  const set = kernRegionen.get(k.nKern) || new Set();
  set.add((k.plz || '??').slice(0, 2));
  kernRegionen.set(k.nKern, set);
}
for (const k of kunden) {
  const nurGenerisch = k.kernSet.size > 0
    && [...k.kernSet].every((t) => GENERISCHE_WOERTER.has(t) || ORG_KUERZEL.has(t) || FARB_KUERZEL.has(t));
  const breitGestreut = (kernRegionen.get(k.nKern)?.size || 0) >= 3;
  k.generisch = nurGenerisch || breitGestreut;
}

// Generische Kontaktdaten entwerten: eine Adresse/Nummer bei vielen verschiedenen
// Kunden gehört einem Dienstleister oder einer Sammelstelle, nicht dem Kunden.
const mailZaehler = new Map(), telZaehler = new Map(), domainZaehler = new Map();
for (const k of kunden) {
  for (const m of k.mails) mailZaehler.set(m, (mailZaehler.get(m) || 0) + 1);
  for (const t of k.tele) telZaehler.set(t, (telZaehler.get(t) || 0) + 1);
  for (const d2 of k.eigenDomains) domainZaehler.set(d2, (domainZaehler.get(d2) || 0) + 1);
}
const GENERISCH_AB = 3;

// Manuell geprüfte Nicht-Duplikate stehen als Notiz am Datensatz.
const GEPRUEFT_NEIN = kunden.filter((k) => /nicht zusammen/i.test(k.notizen)).map((k) => k.id);

// ---------------------------------------------------------------------------
// Paar-Bewertung
// ---------------------------------------------------------------------------
function plzRegion(p) { return (p || '').slice(0, 2); }

function bewerte(a, b) {
  const signale = [];
  const warnungen = [];
  let score = 0;
  let deckel = 1;

  const kernGleich = a.nKern && a.nKern === b.nKern;
  const ortGleich = a.nOrt && a.nOrt === b.nOrt && a.nOrt.length >= 4;
  const plzGleich = a.plz && a.plz === b.plz;
  const ortsnameGleich = a.ort && a.ort === b.ort;

  const sim = kernGleich ? 1
    : Math.max(dice(a.bg, b.bg) * 0.5 + jaccard(a.kernSet, b.kernSet) * 0.3 + levSim(a.nKern, b.nKern) * 0.2, 0);

  // === Deckel: Konstellationen, die praktisch nie ein Duplikat sind ===========

  // Zwei verschiedene Organisationskürzel im selben Ort = zwei Vereine.
  // (TC Baunach / 1. FC Baunach, MTV Stadeln / FSV Stadeln, TB / TSV Johannis)
  const orgA = [...a.orgKuerzel], orgB = [...b.orgKuerzel];
  const orgKonflikt = orgA.length && orgB.length && !orgA.some((k) => b.orgKuerzel.has(k));
  if (orgKonflikt && !kernGleich) {
    deckel = Math.min(deckel, 0.74);
    warnungen.push(`verschiedene Vereinskürzel (${orgA.join('/')} ≠ ${orgB.join('/')})`);
  }

  // Platzhalter-Namen treffen sich gegenseitig, ohne etwas zu beweisen.
  if (a.generisch || b.generisch) {
    deckel = Math.min(deckel, 0.72);
    warnungen.push('Platzhalter-/Sammelname');
  }

  // Gründungsjahre, die beide erfasst sind und sich widersprechen.
  if (a.jahre.size && b.jahre.size && ![...a.jahre].some((j) => b.jahre.has(j))) {
    deckel = Math.min(deckel, 0.78);
    warnungen.push(`andere Jahreszahl (${[...a.jahre].join('/')} ≠ ${[...b.jahre].join('/')})`);
  }

  // Verein ≠ Kommune ≠ Firma. „TC Rot-Weiß Walldürn e.V." und „Stadt Walldürn"
  // teilen sich Ort und manchmal die Anlagen-Anschrift, sind aber zwei Kunden.
  const typA = [...a.typMarker], typB = [...b.typMarker];
  if (typA.length && typB.length && !typA.some((t) => b.typMarker.has(t))) {
    deckel = Math.min(deckel, 0.74);
    warnungen.push(`andere Körperschaft (${typA.join('/')} ≠ ${typB.join('/')})`);
  }

  // Zwei EIGENE E-Mail-Domains, die sich unterscheiden: zwei Organisationen.
  // (TSV Fichte Ansbach / TSV 1860 Ansbach — beide „TSV … Ansbach")
  if (a.eigenDomains.size && b.eigenDomains.size && ![...a.eigenDomains].some((d2) => b.eigenDomains.has(d2))) {
    deckel = Math.min(deckel, 0.82);
    warnungen.push(`eigene Domains verschieden (${[...a.eigenDomains].join(',')} ≠ ${[...b.eigenDomains].join(',')})`);
  }

  // === Harte Identitätsmerkmale ==============================================
  if (a.mosaikKurzname && a.mosaikKurzname === b.mosaikKurzname) {
    score = Math.max(score, 0.99); signale.push('gleicher Mosaik-Kurzname'); deckel = 1;
  } else if (a.kurzBasis && a.kurzBasis === b.kurzBasis && a.kurzBasis.length >= 3
             && (plzGleich || ortsnameGleich || (a.plz && plzRegion(a.plz) === plzRegion(b.plz)))) {
    // Mosaik hat Dubletten selbst durchnummeriert („Heubach" / „Heubach1").
    // Zwei Bedingungen sind nötig: räumliche Nähe (den Ortsnamen „Westheim" gibt
    // es mehrfach) UND Namensnähe — unter „Kriftel"/„Kriftel1" stehen der
    // Tennisclub und ein Baumpflegebetrieb im selben Ort.
    if (sim >= 0.5) {
      score = Math.max(score, 0.96); deckel = 1;
      signale.push(`Mosaik-Kurzname durchnummeriert (${a.mosaikKurzname}/${b.mosaikKurzname})`);
    } else {
      score = Math.max(score, 0.66);
      signale.push(`Mosaik-Kurzname durchnummeriert (${a.mosaikKurzname}/${b.mosaikKurzname})`);
      warnungen.push('gleicher Kurzname-Stamm, aber ganz anderer Kundenname');
    }
  }

  // Zwei bewusst verschiedene Mosaik-Kurznamen bei gleichem Namen: in Mosaik
  // waren das zwei Einträge mit eigener Bedeutung (zwei Vertreter derselben
  // Firma, zwei Filialen) — nicht ungeprüft zusammenführen.
  if (a.mosaikKurzname && b.mosaikKurzname && a.kurzBasis !== b.kurzBasis
      && !a.kurzBasis.includes(b.kurzBasis) && !b.kurzBasis.includes(a.kurzBasis)) {
    deckel = Math.min(deckel, 0.90);
    warnungen.push(`verschiedene Mosaik-Kurznamen (${a.mosaikKurzname} / ${b.mosaikKurzname})`);
  }
  if (a.kundennummer && a.kundennummer === b.kundennummer) {
    score = Math.max(score, 0.99); signale.push('gleiche Kundennummer'); deckel = 1;
  }

  // === Adressgleichheit ======================================================
  let adrTreffer = null;
  for (const x of a.adressen) {
    for (const y of b.adressen) {
      if (x.str && x.str === y.str && x.plz && x.plz === y.plz) { adrTreffer = 'Straße+PLZ'; break; }
      if (!adrTreffer && x.str && x.str === y.str && x.ort && x.ort === y.ort) adrTreffer = 'Straße+Ort';
    }
    if (adrTreffer === 'Straße+PLZ') break;
  }

  // === Kontaktgleichheit =====================================================
  // Eigene Domain (tc-hainstadt.de) gehört einem Kunden. Freemail gehört einer
  // Person, die auch bei zwei Vereinen aktiv sein kann.
  const domainTreffer = [...a.eigenDomains].find((d2) => b.eigenDomains.has(d2) && (domainZaehler.get(d2) || 0) < GENERISCH_AB);
  const mailTreffer = a.mails.find((m) => b.mails.includes(m)
    && !BLOCK_ADRESSEN.has(m) && !BLOCK_DOMAINS.has(domain(m))
    && (mailZaehler.get(m) || 0) < GENERISCH_AB);
  const mailFreemail = mailTreffer ? istFreemail(mailTreffer) : false;
  const telTreffer = a.tele.find((t) => b.tele.includes(t) && (telZaehler.get(t) || 0) < GENERISCH_AB);

  // === Namenssignale =========================================================
  if (kernGleich) {
    if (plzGleich) { score = Math.max(score, 0.97); signale.push('identischer Name + gleiche PLZ'); }
    else if (adrTreffer) { score = Math.max(score, 0.96); signale.push(`identischer Name + gleiche Adresse (${adrTreffer})`); }
    else if (ortsnameGleich) { score = Math.max(score, 0.93); signale.push('identischer Name + gleicher Ort'); }
    else if (!a.plz || !b.plz) { score = Math.max(score, 0.85); signale.push('identischer Name, PLZ fehlt bei einem'); }
    else if (plzRegion(a.plz) === plzRegion(b.plz)) { score = Math.max(score, 0.84); signale.push('identischer Name, PLZ-Region gleich'); }
    else { score = Math.max(score, 0.62); signale.push('identischer Name, aber andere Region'); warnungen.push('andere PLZ-Region — echte Namensgleichheit möglich'); }
  } else if (sim >= 0.70) {
    const proz = Math.round(sim * 100);
    if (plzGleich) { score = Math.max(score, 0.58 + sim * 0.35); signale.push(`Name ${proz}% ähnlich + gleiche PLZ`); }
    else if (adrTreffer) { score = Math.max(score, 0.60 + sim * 0.32); signale.push(`Name ${proz}% ähnlich + gleiche Adresse`); }
    else if (ortsnameGleich) { score = Math.max(score, 0.52 + sim * 0.33); signale.push(`Name ${proz}% ähnlich + gleicher Ort`); }
    else if (sim >= 0.88 && a.plz && plzRegion(a.plz) === plzRegion(b.plz)) { score = Math.max(score, 0.62); signale.push(`Name ${proz}% ähnlich, PLZ-Region gleich`); }
    else if (sim >= 0.92) { score = Math.max(score, 0.55); signale.push(`Name ${proz}% ähnlich, Ort abweichend`); }
  }

  // Gleicher Ortsname, verschiedene Kürzel: in jedem größeren Ort gibt es mehrere
  // Vereine — nur mit hartem Zweitbeleg (Adresse/eigene Domain) interessant.
  if (!kernGleich && ortGleich) {
    if (plzGleich && (adrTreffer || domainTreffer)) {
      score = Math.max(score, 0.86); signale.push('gleicher Ortsname + PLZ + Adresse/Domain');
    } else if (plzGleich) {
      score = Math.max(score, 0.63); signale.push('gleicher Ortsname im Vereinsnamen + gleiche PLZ');
    }
  }

  // === Namensunabhängige Belege ==============================================
  // Jeder Beleg setzt eine Untergrenze UND gibt einen Bonus, wenn der Name schon
  // passt. Nur zu addieren wäre falsch: „Frankfurt Safo 1" / „Frankfrut Safo 2"
  // (Buchstabendreher) bleibt knapp unter der Namensschwelle und hätte dann
  // trotz identischer Anschrift bei 0,05 gelegen.
  const nameNah = kernGleich || sim >= 0.6;
  const belege = [];
  if (adrTreffer) {
    belege.push({ min: 0.66, bonus: nameNah ? 0.05 : 0 });
    signale.push(`gleiche Adresse (${adrTreffer})`);
  }
  if (domainTreffer) {
    // Eigene Domain gehört einem Kunden — außer sie steht als Zweitadresse beim
    // Platzbauer, dann passt gar nichts anderes zusammen.
    const min = nameNah || plzGleich || adrTreffer ? 0.84 : 0.72;
    if (!nameNah && !plzGleich && !adrTreffer) warnungen.push('gleiche Domain, aber völlig anderer Name');
    belege.push({ min, bonus: nameNah ? 0.06 : 0 });
    signale.push(`gleiche eigene E-Mail-Domain (${domainTreffer})`);
  }
  if (mailTreffer && !domainTreffer) {
    if (mailFreemail) {
      // Hinweis, kein Beweis: derselbe Platzwart kann zwei Vereine betreuen.
      belege.push({ min: nameNah ? 0.74 : 0.62, bonus: nameNah ? 0.05 : 0 });
      signale.push(`gleiche Freemail-Adresse (${mailTreffer})`);
      if (!nameNah) warnungen.push('nur gemeinsame Privatadresse — oft derselbe Platzwart bei zwei Vereinen');
    } else {
      belege.push({ min: nameNah ? 0.84 : 0.80, bonus: nameNah ? 0.06 : 0 });
      signale.push(`gleiche E-Mail (${mailTreffer})`);
    }
  }
  if (telTreffer) {
    belege.push({ min: nameNah ? 0.72 : 0.60, bonus: nameNah ? 0.04 : 0 });
    signale.push('gleiche Telefonnummer');
    if (!nameNah) warnungen.push('nur gemeinsame Telefonnummer');
  }
  for (const b2 of belege) score = Math.max(score + b2.bonus, b2.min);

  // === Dämpfer ===============================================================
  // Filialstruktur / zwei Organisationen: beide Namen tragen je einen eigenen
  // unterscheidenden Bestandteil (BayWa AG Ansbach ≠ BayWa AG Würzburg,
  // TSG Waldbüttelbrunn ≠ Gemeinde Waldbüttelbrunn).
  if (!kernGleich) {
    const eigenA = [...a.kernSet].filter((t) => !b.kernSet.has(t) && !FARB_KUERZEL.has(t));
    const eigenB = [...b.kernSet].filter((t) => !a.kernSet.has(t) && !FARB_KUERZEL.has(t));
    const gemeinsam = [...a.kernSet].filter((t) => b.kernSet.has(t));
    if (gemeinsam.length && eigenA.length && eigenB.length && !adrTreffer && !domainTreffer) {
      score -= 0.10;
      warnungen.push(`beide tragen einen eigenen Namensbestandteil (${eigenA.join(',')} / ${eigenB.join(',')})`);
    }
  }
  if (a.archiviert !== b.archiviert) signale.push(a.archiviert ? 'einer ist archiviert' : 'einer ist archiviert');

  return { score: Math.min(Math.min(score, deckel), 1), signale, warnungen, sim };
}

// ---------------------------------------------------------------------------
// Freigegebene Ausschlussregeln
//
// Muster, die nach Durchsicht der Prüfliste als „nie dieselbe Organisation"
// bestätigt sind (Julian, 26.08.2026). Sie fliegen aus der Kandidatenliste,
// werden aber in einer eigenen Beleg-CSV ausgewiesen — kein Kandidat
// verschwindet unsichtbar.
//
// Beide Regeln greifen NUR ohne harten Gegenbeleg. Eine identische Anschrift,
// eine gemeinsame Vereinsdomain oder ein gemeinsamer Mosaik-Kurzname wiegen
// schwerer als das Muster: „Tennisclub Heuchelheim" (67259) und „Tennis-Club 74
// Heuchelheim" (35452) liegen 130 km auseinander und sind trotzdem derselbe
// Verein — beide tragen tc-heuchelheim-tennis.de.
// ---------------------------------------------------------------------------
function harterBeleg(signale) {
  return signale.some((s) =>
    s.startsWith('gleiche Adresse')
    || s.startsWith('gleiche eigene E-Mail-Domain')
    || s.startsWith('gleicher Mosaik-Kurzname')
    || s.startsWith('gleiche Kundennummer'));
}

function ausschlussgrund(a, b, ergebnis) {
  const { signale, warnungen } = ergebnis;
  if (harterBeleg(signale)) return null;

  // 1) Zwei Vereine am selben Ort. In fast jedem Ort gibt es mehr als einen
  //    Verein — TC Baunach und 1. FC Baunach, MTV und FSV Stadeln.
  if (warnungen.some((w) => w.startsWith('verschiedene Vereinskürzel'))) {
    return 'zwei Vereine im selben Ort (verschiedene Kürzel)';
  }

  // 2) Gleicher Name in einer anderen Gegend. Ortsnamen sind mehrfach vergeben
  //    (Rüdesheim, Neunkirchen, Steinbach) — Namensgleichheit allein beweist
  //    nichts über 100 km hinweg.
  if (warnungen.some((w) => w.startsWith('andere PLZ-Region'))) {
    return 'gleicher Name, andere Region';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Alle Paare prüfen (2262² / 2 ≈ 2,6 Mio — läuft in wenigen Sekunden)
// ---------------------------------------------------------------------------
const paare = [];
const ausgeschlossen = [];
const start = Date.now();
for (let i = 0; i < kunden.length; i++) {
  const a = kunden[i];
  for (let j = i + 1; j < kunden.length; j++) {
    const b = kunden[j];
    // Billiger Vorfilter: ohne ein gemeinsames Merkmal ist das Paar chancenlos.
    const kandidat =
      (a.mosaikKurzname && a.mosaikKurzname === b.mosaikKurzname) ||
      (a.kurzBasis && a.kurzBasis === b.kurzBasis) ||
      (a.kundennummer && a.kundennummer === b.kundennummer) ||
      (a.nKern && a.nKern === b.nKern) ||
      (a.nOrt && a.nOrt === b.nOrt) ||
      (a.plz && a.plz === b.plz) ||
      (a.ort && a.ort === b.ort) ||
      a.mails.some((m) => b.mails.includes(m)) ||
      [...a.eigenDomains].some((d2) => b.eigenDomains.has(d2)) ||
      a.tele.some((t) => b.tele.includes(t)) ||
      [...a.kernSet].some((t) => t.length >= 5 && b.kernSet.has(t)) ||
      dice(a.bg, b.bg) >= 0.72;
    if (!kandidat) continue;
    const r = bewerte(a, b);
    if (r.score < MIN_SCORE) continue;
    const grund = ausschlussgrund(a, b, r);
    if (grund) { ausgeschlossen.push({ a, b, ...r, grund }); continue; }
    paare.push({ a, b, ...r });
  }
}
console.log(`⏱  ${paare.length} Kandidatenpaare in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);

// ---------------------------------------------------------------------------
// Cluster — NUR über starke Kanten (>= 0.80).
//
// Sonst zieht die transitive Hülle ganze Ortschaften zusammen: „TC Neckar
// Zwingenberg" + „Tennisclub Neckar Zwingenberg" (dasselbe) hängen dann am
// 90 km entfernten „TC Zwingenberg" (etwas anderes). Schwache Paare bleiben
// eigenständige Zweier-Kandidaten.
// ---------------------------------------------------------------------------
const CLUSTER_KANTE = 0.80;
const parent = new Map();
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (x, y) => { const rx = find(x), ry = find(y); if (rx !== ry) parent.set(rx, ry); };
for (const k of kunden) parent.set(k.id, k.id);
for (const p of paare) if (p.score >= CLUSTER_KANTE) union(p.a.id, p.b.id);

const cluster = new Map();
const schwachePaare = [];
for (const p of paare) {
  if (p.score < CLUSTER_KANTE) {
    // Nur zeigen, wenn die beiden nicht ohnehin schon im selben Cluster hängen.
    if (find(p.a.id) !== find(p.b.id)) schwachePaare.push(p);
    continue;
  }
  const root = find(p.a.id);
  const c = cluster.get(root) || { mitglieder: new Map(), paare: [], maxScore: 0 };
  c.mitglieder.set(p.a.id, p.a); c.mitglieder.set(p.b.id, p.b);
  c.paare.push(p);
  c.maxScore = Math.max(c.maxScore, p.score);
  cluster.set(root, c);
}

// Stufe A = ohne Rückfrage zusammenführbar, B = sehr wahrscheinlich, C = prüfen
function stufe(s) { return s >= 0.93 ? 'A' : s >= 0.80 ? 'B' : 'C'; }

// Survivor-Vorschlag: derselbe Vorrang wie duplikatService (2026er-Projekt >
// E-Mail > Referenzmenge), zusätzlich Opt-in und Vollständigkeit der Adresse.
function survivorPunkte(k) {
  let p = 0;
  if (k.letztesJahr >= 2026) p += 1000;
  p += k.letztesJahr;
  if (k.mails.length) p += 300;
  if (k.optIn) p += 150;
  if (!k.archiviert) p += 100;
  if (k.plz && k.strasse) p += 80;
  if (k.kundennummer) p += 40;
  // Jahrzehnte Bestellhistorie sind das stärkste Substanz-Signal nach einem
  // laufenden Projekt: „TC Rot-Weiß Lohr e.V." hat 19 Jahre und 59.611 €, der
  // namensgleiche Datensatz daneben gar nichts — der Verlierer wäre der falsche.
  p += Math.min(k.historieJahre * 12, 240);
  // Im Portal gepflegter Datensatz vor reinem Mosaik-Import — aber nachrangig:
  // eine vorhandene Kundennummer und laufende Projekte wiegen schwerer, und
  // verloren geht ohnehin nichts (alles wandert in den Survivor).
  if (!k.mosaikKurzname) p += 25;
  p += k.nProjekte * 20 + k.nAP * 5 + k.nSD * 5 + k.nBez * 10 + Math.min(k.anzahlBuchungen, 60);
  return p;
}

let eintraege = [];
for (const c of cluster.values()) {
  const mitglieder = [...c.mitglieder.values()].sort((x, y) => survivorPunkte(y) - survivorPunkte(x));
  const geprueftNein = mitglieder.filter((m) => GEPRUEFT_NEIN.includes(m.id)).length >= 2;
  eintraege.push({
    mitglieder,
    signale: [...new Set(c.paare.flatMap((p) => p.signale))],
    warnungen: [...new Set(c.paare.flatMap((p) => p.warnungen))],
    maxScore: c.maxScore,
    stufe: geprueftNein ? 'X' : stufe(c.maxScore),
  });
}
for (const p of schwachePaare) {
  const mitglieder = [p.a, p.b].sort((x, y) => survivorPunkte(y) - survivorPunkte(x));
  const geprueftNein = mitglieder.filter((m) => GEPRUEFT_NEIN.includes(m.id)).length >= 2;
  eintraege.push({
    mitglieder, signale: p.signale, warnungen: p.warnungen,
    maxScore: p.score, stufe: geprueftNein ? 'X' : stufe(p.score),
  });
}
// Bereits geprüfte Paare („NICHT zusammenführen" am Kunden vermerkt) gehören
// nicht mehr in die Prüfliste — sonst entscheidet man dieselben Fälle jedes
// Mal neu. Sie werden nur noch gezählt und in der Beleg-CSV ausgewiesen.
const geprueft = eintraege.filter((e) => e.stufe === 'X');
for (const e of geprueft) {
  ausgeschlossen.push({
    a: e.mitglieder[0], b: e.mitglieder[1] ?? e.mitglieder[0],
    score: e.maxScore, signale: e.signale, warnungen: e.warnungen,
    grund: 'bereits geprüft: nicht zusammenführen',
  });
}
eintraege = eintraege.filter((e) => e.stufe !== 'X');

const rang = { A: 0, B: 1, C: 2 };
eintraege.sort((x, y) => rang[x.stufe] - rang[y.stufe] || y.maxScore - x.maxScore);

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
const q = (v) => {
  const s2 = (v === null || v === undefined ? '' : String(v)).replace(/[\r\n]+/g, ' / ');
  return /[";]/.test(s2) ? `"${s2.replace(/"/g, '""')}"` : s2;
};
const kopf = [
  'cluster', 'stufe', 'score', 'signale', 'warnung',
  // `einstufung` ist die Spalte, die duplikate-zusammenfuehren.ts liest:
  // dort zählt ausschließlich der Wert `sicher`.
  'einstufung', 'notiz_pruefer',
  'rolle', 'name', 'kundennummer', 'mosaikKurzname', 'typ', 'gruppe',
  'strasse', 'plz', 'ort', 'email', 'telefon',
  'aktiv', 'optIn', 'archiviert', 'projekte', 'letztesJahr', 'ansprechpartner',
  'saisondaten', 'beziehungen', 'historieJahre', 'historieUmsatz', 'buchungen', 'letzteBuchung', 'erstelltAm',
  'notizen', 'kundeId', 'survivor_id',
];
const zeilen = [kopf.join(';')];
eintraege.forEach((c, idx) => {
  const nr = String(idx + 1).padStart(4, '0');
  const survivor = c.mitglieder[0];
  c.mitglieder.forEach((m, i) => {
    zeilen.push([
      nr, c.stufe, c.maxScore.toFixed(2), c.signale.join(' | '), c.warnungen.join(' | '),
      '', '',
      i === 0 ? 'BEHALTEN (Vorschlag)' : 'zusammenführen?',
      m.name, m.kundennummer, m.mosaikKurzname, m.typ, m.gruppe,
      m.strasse, m.plz, m.ort, m.mails.join(' '), m.tele.join(' '),
      m.aktiv ? 'ja' : 'nein', m.optIn ? 'ja' : 'nein', m.archiviert ? 'ja' : 'nein',
      m.nProjekte, m.letztesJahr || '', m.nAP, m.nSD, m.nBez,
      m.historieJahre || '', m.historieSumme ? m.historieSumme.toFixed(0) : '',
      m.anzahlBuchungen, m.letzteBuchung, m.erstelltAm,
      m.notizen.slice(0, 200), m.id, survivor.id,
    ].map(q).join(';'));
  });
});
writeFileSync(OUT, '\ufeff' + zeilen.join('\n'), 'utf8');

// Beleg-CSV der Ausschlüsse: nachvollziehbar, welche Paare eine Regel
// aussortiert hat — und korrigierbar, falls eine Regel zu weit greift.
if (ausgeschlossen.length) {
  const zAus = ['grund;score;signale;warnung;a_name;a_plz;a_ort;a_kundeId;b_name;b_plz;b_ort;b_kundeId'];
  for (const p of ausgeschlossen.sort((x, y) => x.grund.localeCompare(y.grund) || y.score - x.score)) {
    zAus.push([p.grund, p.score.toFixed(2), p.signale.join(' | '), p.warnungen.join(' | '),
      p.a.name, p.a.plz, p.a.ort, p.a.id, p.b.name, p.b.plz, p.b.ort, p.b.id].map(q).join(';'));
  }
  const ausDatei = OUT.replace(/\.csv$/, '-ausgeschlossen.csv');
  writeFileSync(ausDatei, '\ufeff' + zAus.join('\n'), 'utf8');
  const proGrund = {};
  for (const p of ausgeschlossen) proGrund[p.grund] = (proGrund[p.grund] ?? 0) + 1;
  console.log('\n🚫 Durch freigegebene Regeln ausgeschlossen:');
  for (const [g, n] of Object.entries(proGrund).sort((x, y) => y[1] - x[1])) console.log(`   ${String(n).padStart(4)}×  ${g}`);
  console.log(`   Beleg: ${ausDatei}`);
}

// ---------------------------------------------------------------------------
// Zusammenfassung
// ---------------------------------------------------------------------------
const proStufe = { A: 0, B: 0, C: 0 };
let betroffene = 0, einsparung = 0;
for (const c of eintraege) {
  proStufe[c.stufe]++;
  betroffene += c.mitglieder.length;
  if (c.stufe === 'A' || c.stufe === 'B') einsparung += c.mitglieder.length - 1;
}
console.log('📋 Ergebnis');
console.log(`   Kandidaten gesamt              ${eintraege.length}`);
if (geprueft.length) console.log(`   (${geprueft.length} bereits geprüfte Paare nicht mehr aufgeführt)`);
console.log(`   Stufe A (sicher)               ${proStufe.A}`);
console.log(`   Stufe B (sehr wahrscheinlich)  ${proStufe.B}`);
console.log(`   Stufe C (prüfen)               ${proStufe.C}`);
console.log(`   betroffene Datensätze          ${betroffene}`);
console.log(`   Reduktion bei Merge A+B        −${einsparung} (${kunden.length} → ${kunden.length - einsparung})`);

const signalZaehler = new Map();
for (const c of eintraege) for (const sig of c.signale) {
  const key = sig.replace(/\s*\(.*?\)/, '').trim();
  signalZaehler.set(key, (signalZaehler.get(key) || 0) + 1);
}
console.log('\n📈 Häufigste Signale:');
for (const [sig, n] of [...signalZaehler.entries()].sort((x, y) => y[1] - x[1]).slice(0, 18)) {
  console.log(`   ${String(n).padStart(4)}×  ${sig}`);
}
const warnZaehler = new Map();
for (const c of eintraege) for (const w of c.warnungen) {
  const key = w.replace(/\s*\(.*?\)/, '').trim();
  warnZaehler.set(key, (warnZaehler.get(key) || 0) + 1);
}
if (warnZaehler.size) {
  console.log('\n⚠️  Häufigste Warnungen:');
  for (const [w, n] of [...warnZaehler.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)) {
    console.log(`   ${String(n).padStart(4)}×  ${w}`);
  }
}
console.log(`\n💾 ${OUT}`);
