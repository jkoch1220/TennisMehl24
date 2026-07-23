/**
 * Backfill der Kunden-E-Mails aus dem Mosaik-Export in die saison_kunden.
 *
 * Quelle der E-Mail je Kunde (Join über mosaikKurzname):
 *   1. Kundenstamm  kunden.json        -> Feld `Kommunikation`
 *   2. Fallback     ansprechpartner.json -> erste Kontakt-`Kommunikation` mit E-Mail
 *
 * Schreibt NUR `data.email`, und nur wenn aktuell KEINE E-Mail (email/rechnungsEmail) gesetzt ist.
 * Alles andere am Kunden bleibt unverändert.
 *
 * Aufruf:
 *   node scripts/migriere-kunden-emails.mjs            # Dry-Run (zählt nur, schreibt nichts)
 *   node scripts/migriere-kunden-emails.mjs --apply    # schreibt die Updates
 */
import { readFileSync } from 'fs';
import { Client, Databases, Query } from 'node-appwrite';

const APPLY = process.argv.includes('--apply');

// .env laden
const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = env.APPWRITE_API_KEY;
const DB = 'tennismehl24_db';
const COLLECTION = 'saison_kunden';
const DATA_DIR = '../migration/data';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new Databases(client);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
function extractEmail(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

// ---- Mosaik-E-Mail-Map aufbauen: Kurzname -> { email, quelle } ----
function baueEmailMap() {
  const map = new Map();
  const kunden = JSON.parse(readFileSync(`${DATA_DIR}/kunden.json`, 'utf8'));
  for (const k of kunden) {
    const email = extractEmail(k.Kommunikation) || extractEmail(k.Info);
    if (email && k.Kurzname) map.set(k.Kurzname, { email, quelle: 'kundenstamm' });
  }
  // Ansprechpartner nur als Fallback (Kundenstamm hat Vorrang)
  const ap = JSON.parse(readFileSync(`${DATA_DIR}/ansprechpartner.json`, 'utf8'));
  let apCount = 0;
  for (const [kurzname, kontakte] of Object.entries(ap)) {
    if (map.has(kurzname)) continue;
    const liste = Array.isArray(kontakte) ? kontakte : [kontakte];
    for (const kontakt of liste) {
      const email = extractEmail(kontakt?.Kommunikation);
      if (email) {
        map.set(kurzname, { email, quelle: 'ansprechpartner' });
        apCount++;
        break;
      }
    }
  }
  return { map, apCount };
}

// ---- alle saison_kunden laden (paginiert) ----
async function ladeAlleKunden() {
  const docs = [];
  let offset = 0;
  const LIMIT = 100;
  for (;;) {
    const res = await db.listDocuments(DB, COLLECTION, [Query.limit(LIMIT), Query.offset(offset)]);
    docs.push(...res.documents);
    if (res.documents.length < LIMIT) break;
    offset += LIMIT;
  }
  return docs;
}

function parse(doc) {
  try {
    return JSON.parse(doc.data);
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Modus: ${APPLY ? 'APPLY (schreibt)' : 'DRY-RUN (schreibt nichts)'}\n`);

  const { map, apCount } = baueEmailMap();
  console.log(`Mosaik-E-Mail-Map: ${map.size} Kurznamen (davon ${apCount} aus Ansprechpartnern)\n`);

  const docs = await ladeAlleKunden();
  console.log(`saison_kunden geladen: ${docs.length}\n`);

  let mitEmail = 0,
    ohneEmail = 0,
    ohneEmailMitKurzname = 0,
    befuellbar = 0,
    keinMatch = 0,
    ohneKurzname = 0;
  const beispiele = [];
  const updates = [];

  for (const doc of docs) {
    const k = parse(doc);
    if (!k) continue;
    const hatEmail = !!(k.email || k.rechnungsEmail);
    if (hatEmail) {
      mitEmail++;
      continue;
    }
    ohneEmail++;
    if (!k.mosaikKurzname) {
      ohneKurzname++;
      continue;
    }
    ohneEmailMitKurzname++;
    const treffer = map.get(k.mosaikKurzname);
    if (treffer) {
      befuellbar++;
      if (beispiele.length < 15) beispiele.push(`${k.name} [${k.mosaikKurzname}] -> ${treffer.email} (${treffer.quelle})`);
      updates.push({ doc, k, email: treffer.email });
    } else {
      keinMatch++;
    }
  }

  console.log('=== Bestand ===');
  console.log(`  mit E-Mail:                 ${mitEmail}`);
  console.log(`  ohne E-Mail:                ${ohneEmail}`);
  console.log(`    davon ohne mosaikKurzname: ${ohneKurzname}`);
  console.log(`    davon mit mosaikKurzname:  ${ohneEmailMitKurzname}`);
  console.log(`      -> befüllbar aus Export: ${befuellbar}`);
  console.log(`      -> kein Export-Treffer:  ${keinMatch}\n`);

  console.log('=== Beispiele (befüllbar) ===');
  beispiele.forEach((b) => console.log('  ' + b));
  console.log('');

  if (!APPLY) {
    console.log(`DRY-RUN: ${befuellbar} Kunden würden eine E-Mail erhalten. Mit --apply ausführen.`);
    return;
  }

  console.log(`APPLY: aktualisiere ${updates.length} Kunden...`);
  let ok = 0,
    fehler = 0;
  for (const { doc, k, email } of updates) {
    try {
      const neu = { ...k, email, geaendertAm: new Date().toISOString() };
      await db.updateDocument(DB, COLLECTION, doc.$id, { data: JSON.stringify(neu) });
      ok++;
      if (ok % 50 === 0) console.log(`  ${ok}/${updates.length}...`);
    } catch (e) {
      fehler++;
      console.error(`  Fehler bei ${k.name}: ${e.message}`);
    }
  }
  console.log(`\nFertig: ${ok} aktualisiert, ${fehler} Fehler.`);
}

main().catch((e) => {
  console.error('Fehler:', e.message);
  process.exit(1);
});
