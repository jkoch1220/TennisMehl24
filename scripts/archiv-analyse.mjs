/**
 * READ-ONLY: findet Kunden, die ins Archiv gehören, und staffelt sie nach
 * Sicherheit. Schreibt nichts in die Datenbank, erzeugt nur eine Prüf-CSV
 * für den Swiper (tools/swiper.html).
 *
 *   node scripts/archiv-analyse.mjs                  # Sandbox
 *   node scripts/archiv-analyse.mjs --produktion     # weiterhin read-only
 *
 * Archiv heißt NICHT löschen: `archiviert/archivGrund/archiviertAm` blenden den
 * Kunden aus den Listen aus, Projekte, Rechnungen und Historie bleiben. Deshalb
 * ist die Hürde bewusst niedriger als beim Duplikat-Merge — rückgängig machen
 * ist ein Feld-Update.
 */
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const PRODUKTION = args.includes('--produktion');
const DB = PRODUKTION ? 'tennismehl24_db' : 'tennismehl24_db_mock';
const OUT = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1]
  || path.resolve(process.cwd(), `archiv-kandidaten-${PRODUKTION ? 'prod' : 'mock'}-${new Date().toISOString().slice(0, 10)}.csv`);

const env = {};
for (const line of readFileSync(path.resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const { VITE_APPWRITE_ENDPOINT: ENDPOINT, VITE_APPWRITE_PROJECT_ID: PROJECT, APPWRITE_API_KEY: KEY } = env;
if (!ENDPOINT || !PROJECT || !KEY) { console.error('❌ Appwrite-Env fehlt'); process.exit(1); }

async function ladeCollection(col) {
  const alle = []; let cursor = null;
  for (;;) {
    const q = [JSON.stringify({ method: 'limit', values: [100] })];
    if (cursor) q.push(JSON.stringify({ method: 'cursorAfter', values: [cursor] }));
    // Appwrite drosselt bei parallelen Abfragen (HTTP 429). Kurz warten und
    // erneut versuchen ist hier richtig — es ist eine reine Leseschleife.
    let r;
    for (let versuch = 0; ; versuch++) {
      r = await fetch(`${ENDPOINT}/databases/${DB}/collections/${col}/documents?${q.map((x) => `queries[]=${encodeURIComponent(x)}`).join('&')}`,
        { headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY } });
      if (r.status !== 429 || versuch >= 8) break;
      await new Promise((w) => setTimeout(w, 3000 * (versuch + 1)));
    }
    if (!r.ok) throw new Error(`${col}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const res = await r.json();
    alle.push(...res.documents);
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return alle;
}

console.log(`🔍 Archiv-Analyse — ${DB} (read-only)`);
// Nacheinander statt parallel: sechs gleichzeitige Leseschleifen laufen bei
// Appwrite in die Drosselung (HTTP 429).
const kundenDocs = await ladeCollection('saison_kunden');
const projekte = await ladeCollection('projekte');
const ansprechpartner = await ladeCollection('saison_ansprechpartner');
const dokumente = await ladeCollection('bestellabwicklung_dokumente').catch(() => []);
const platzbauerProjekte = await ladeCollection('platzbauer_projekte').catch(() => []);
const beziehungen = await ladeCollection('saison_beziehungen').catch(() => []);

// Vereine, die in einem Platzbauer-Angebot als Position stehen. Sie haben kein
// eigenes Projekt — die Bestellung laeuft ueber den Platzbauer.
const imAngebot = new Map();
for (const p of platzbauerProjekte) {
  let d = p.data;
  for (let i = 0; i < 4; i++) {
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { break; } }
    if (d && d.data && !d.angebotsDaten) d = d.data; else break;
  }
  const pos = d && d.angebotsDaten && d.angebotsDaten.vereinPositionen;
  if (!Array.isArray(pos)) continue;
  for (const v of pos) {
    if (!v.vereinId) continue;
    const bisher = imAngebot.get(v.vereinId);
    const eintrag = `${p.platzbauerName || 'Platzbauer'} ${p.saisonjahr}${Number(v.menge) > 0 ? ` (${v.menge} t)` : ''}`;
    if (!bisher || Number(v.menge) > 0) imAngebot.set(v.vereinId, eintrag);
  }
}
const mitBeziehung = new Set(beziehungen.map((b) => b.vereinId).filter(Boolean));

const projStat = new Map();
for (const p of projekte) {
  const id = String(p.kundeId || '');
  if (!id) continue;
  const e = projStat.get(id) || { anzahl: 0, max: 0 };
  e.anzahl++; e.max = Math.max(e.max, Number(p.saisonjahr) || 0);
  projStat.set(id, e);
}
const apStat = new Map();
for (const a of ansprechpartner) apStat.set(a.kundeId, (apStat.get(a.kundeId) || 0) + 1);
const belegStat = new Map();
for (const d of dokumente) {
  const pid = String(d.projektId || '');
  const p = projekte.find((x) => x.$id === pid);
  if (p?.kundeId) belegStat.set(String(p.kundeId), (belegStat.get(String(p.kundeId)) || 0) + 1);
}

// ---------------------------------------------------------------------------
// Lieferungen über Platzbauer
//
// Mosaik führt sie unter einem eigenen Konto mit Platzbauer-Präfix
// („Mei-Nieder-Roden" = Nieder-Roden, beliefert über Meinecke). Wo die
// Zuordnung eindeutig ist, hat `import-bestellhistorie.ts` sie bereits an den
// Verein gehängt. Der Rest ist mehrdeutig — „Ca-Altdorf" passt auf drei
// Altdorfer Vereine — und darf deshalb NICHT verschwiegen werden: ein Verein,
// für den ein solches Konto in Frage kommt, ist womöglich aktiv und gehört
// nicht ungeprüft ins Archiv.
// ---------------------------------------------------------------------------
const PLATZBAUER_PRAEFIX = {
  Fr: 'Fröhner', Vogl: 'Vogl', Schö: 'Schönfeld', Ca: 'Catalkaya',
  Av: 'Averbeck', Mei: 'Meinecke', No: 'No', Kr: 'Kr', Me: 'Me',
  St: 'St', Ko: 'Ko', To: 'Top Comerce', Kuhnt: 'Kuhnt', Koh: 'Koh',
};
const wortTeile = (s) => String(s ?? '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .split(/[^a-z0-9]+/).filter((t) => t.length >= 4);

let offeneKonten = [];
try {
  const rohHist = JSON.parse(readFileSync(path.resolve(process.cwd(), '../migration/data/bestellhistorie.json'), 'utf8'));
  for (const [konto, jahre] of Object.entries(rohHist)) {
    const m = konto.match(/^([A-ZÄÖÜ][a-zäöü]{1,4})-(.+)$/);
    if (!m || !PLATZBAUER_PRAEFIX[m[1]]) continue;
    const j = Object.keys(jahre).map(Number).filter(Number.isFinite);
    if (!j.length) continue;
    offeneKonten.push({
      konto, ueber: PLATZBAUER_PRAEFIX[m[1]],
      teile: wortTeile(m[2]),
      // „Nieder-Roden" zerfaellt am Bindestrich in zwei zu kurze Teile — der
      // zusammengezogene Name faengt genau diese Faelle.
      ganz: wortTeile(m[2]).join(''),
      letztes: Math.max(...j),
      summe: Object.values(jahre).reduce((s, e) => s + (Number(e?.summe) || 0), 0) / 10000,
    });
  }
} catch { console.warn('bestellhistorie.json nicht gelesen - Platzbauer-Pruefung entfaellt'); }

/** Konten, deren Ortsteil im Kundennamen vorkommt. Bewusst grosszuegig: hier soll
 *  lieber ein Kandidat zu viel geschuetzt werden als einer zu wenig. */
function platzbauerVerdacht(k) {
  const eigene = new Set(k.historieQuellen);
  const teile = wortTeile(k.name);
  if (!teile.length) return [];
  const ganz = teile.join('');
  return offeneKonten.filter((o) => {
    if (eigene.has(o.konto)) return false;
    if (o.teile.some((t) => teile.includes(t))) return true;
    return o.ganz.length >= 6 && (ganz.includes(o.ganz) || o.ganz.includes(ganz));
  });
}

const JETZT = new Date().getFullYear();
const MUELL_NAME = /^(privat|privatkunde|herrn?|frau|firma|kunde|test\w*|diverse|barverkauf|unbekannt|no|xxx|neu)\b|^[\s\-.]*$/i;

const kunden = kundenDocs.map((d) => {
  let k; try { k = JSON.parse(d.data); } catch { return null; }
  const id = k.id || d.$id;
  const p = projStat.get(d.$id) || projStat.get(id) || { anzahl: 0, max: 0 };
  const historie = Array.isArray(k.bestellhistorie) ? k.bestellhistorie : [];
  const histJahr = historie.length ? Math.max(...historie.map((e) => Number(e.jahr) || 0)) : 0;
  const buchungsJahr = Number(String(k.zahlungsstatistik?.letzteBuchung || '').slice(0, 4)) || 0;
  const ra = k.rechnungsadresse || k.adresse || {};
  const la = k.lieferadresse || {};
  const mails = [k.email, k.rechnungsEmail, ...(k.angebotsEmails || [])].filter((m) => String(m || '').includes('@'));
  const telefone = [k.telefon, k.mobiltelefon].filter(Boolean);
  return {
    doc: d.$id, id,
    name: (k.name || '').trim(), typ: k.typ || '', gruppe: k.gruppe || '',
    kundennummer: k.kundennummer || '', mosaikKurzname: k.mosaikKurzname || '',
    strasse: ra.strasse || la.strasse || '', plz: ra.plz || la.plz || '', ort: ra.ort || la.ort || '',
    mails, telefone,
    optIn: k.automatischesAngebot === true,
    aktiv: k.aktiv !== false,
    archiviert: k.archiviert === true,
    notizen: (k.notizen || '').replace(/\s+/g, ' ').trim(),
    erstellt: (k.erstelltAm || d.$createdAt || '').slice(0, 10),
    nProjekte: p.anzahl, letztesProjekt: p.max,
    nAP: apStat.get(d.$id) || apStat.get(id) || 0,
    nBelege: belegStat.get(d.$id) || belegStat.get(id) || 0,
    histJahre: historie.length,
    historieQuellen: historie.flatMap((e) => e.quellen ?? []),
    bezugsweg: k.standardBezugsweg || '',
    histUmsatz: historie.reduce((s, e) => s + (Number(e.summeEuro) || 0), 0),
    letzteAktivitaet: Math.max(p.max, histJahr, buchungsJahr),
    imPlatzbauerAngebot: imAngebot.get(d.$id) || imAngebot.get(id) || '',
    hatBeziehung: mitBeziehung.has(d.$id) || mitBeziehung.has(id),
    verdacht: [],
  };
}).filter(Boolean);

for (const k of kunden) k.verdacht = platzbauerVerdacht(k);
console.log(`${kunden.length} Kunden geladen`);
console.log(`   ${kunden.filter((k) => k.imPlatzbauerAngebot).length} stehen in einem Platzbauer-Angebot`);
console.log(`   ${kunden.filter((k) => k.bezugsweg === 'ueber_platzbauer').length} beziehen laut Stammdaten ueber einen Platzbauer`);
console.log(`   ${kunden.filter((k) => k.verdacht.length).length} haben ein nicht eindeutig zuordenbares Platzbauer-Konto\n`);

// ---------------------------------------------------------------------------
// Bewertung
// ---------------------------------------------------------------------------
function bewerte(k) {
  const gruende = [];
  const schutz = [];

  // --- Schutzgründe zuerst: sie stechen jeden Archivgrund ---
  if (k.letztesProjekt >= JETZT) schutz.push(`Projekt in ${k.letztesProjekt}`);
  else if (k.letztesProjekt >= JETZT - 1) schutz.push(`Projekt in ${k.letztesProjekt}`);
  if (k.optIn) schutz.push('für Massenangebote freigegeben');
  if (k.letzteAktivitaet >= JETZT - 5 && k.letzteAktivitaet > 0) schutz.push(`aktiv bis ${k.letzteAktivitaet}`);
  if (k.nBelege > 0) schutz.push(`${k.nBelege} Belege`);
  if (k.bezugsweg === 'ueber_platzbauer') schutz.push('bezieht ueber einen Platzbauer');
  if (k.hatBeziehung) schutz.push('einem Platzbauer zugeordnet');
  if (k.imPlatzbauerAngebot) schutz.push(`steht im Platzbauer-Angebot ${k.imPlatzbauerAngebot}`);
  for (const v of k.verdacht.slice(0, 2)) {
    schutz.push(`evtl. ueber ${v.ueber} beliefert (Mosaik-Konto ${v.konto}, bis ${v.letztes}) - Zuordnung nicht eindeutig`);
  }

  // --- Archivgründe ---
  const jahreStill = k.letzteAktivitaet ? JETZT - k.letzteAktivitaet : null;
  if (k.letzteAktivitaet === 0) gruende.push('nie eine Bestellung, kein Projekt, keine Zahlung');
  else if (jahreStill >= 16) gruende.push(`letzte Bestellung ${k.letzteAktivitaet} — ${jahreStill} Jahre still`);
  else if (jahreStill >= 10) gruende.push(`letzte Bestellung ${k.letzteAktivitaet} — ${jahreStill} Jahre still`);

  if (MUELL_NAME.test(k.name)) gruende.push(`Name ist ein Platzhalter („${k.name}")`);
  if (!k.strasse && !k.plz) gruende.push('keine Anschrift');
  if (!k.mails.length && !k.telefone.length) gruende.push('kein Kontaktweg (keine E-Mail, kein Telefon)');
  if (!k.mails.length) gruende.push('keine E-Mail — kann nie ein Angebot bekommen');

  // --- Einstufung ---
  let stufe = null;
  if (!gruende.length) return null;
  if (schutz.length) {
    // Nur noch interessant, wenn der Datensatz selbst kaputt ist.
    const hart = gruende.some((g) => g.startsWith('Name ist ein Platzhalter') || g === 'keine Anschrift');
    if (!hart) return null;
    stufe = 'C';
  } else if (k.letzteAktivitaet === 0 || jahreStill >= 16) {
    stufe = 'A';
  } else if (jahreStill >= 10) {
    stufe = 'B';
  } else {
    stufe = 'C';
  }
  return { stufe, gruende, schutz };
}

/**
 * Regelgruppe: fasst Kandidaten zusammen, die aus demselben Grund hier stehen.
 *
 * 965 Datensätze einzeln zu entscheiden ist keine Arbeit, die jemand zu Ende
 * bringt. In Gruppen sind es ein Dutzend Entscheidungen — und weil alle Fälle
 * einer Gruppe dieselbe Begründung teilen, ist die Sammelentscheidung auch
 * inhaltlich vertretbar.
 */
function regelgruppe(k) {
  const jahre = k.letzteAktivitaet ? JETZT - k.letzteAktivitaet : null;
  const kontakt = k.mails.length ? 'E-Mail vorhanden' : (k.telefone.length ? 'nur Telefon' : 'kein Kontaktweg');

  // Sortimentsgruppen zuerst: sie sind eine eigene fachliche Entscheidung,
  // unabhängig vom Alter des Datensatzes.
  if (/^Sichtblenden$/i.test(k.gruppe)) return 'Sichtblenden-Kunden';
  if (/^Wollny/i.test(k.gruppe)) return 'Wollny-Kunden (Altbestand)';
  if (/^Einmalkunden$/i.test(k.gruppe)) return 'Einmalkunden';
  if (/^Privatkunde$/i.test(k.gruppe)) return 'Privatkunden';

  if (MUELL_NAME.test(k.name)) return 'Platzhalter statt Name';
  if (!k.strasse && !k.plz) return 'ohne jede Anschrift';
  if (k.schutzHinweis) return 'Verdacht auf Platzbauer-Lieferung';

  // Spannen statt einzelner Jahre: sonst zerfällt „16+ Jahre still" in
  // fünfzehn Kleinstgruppen und die Blockentscheidung ist wieder Handarbeit.
  if (k.letzteAktivitaet === 0) return `nie etwas bestellt · ${kontakt}`;
  if (jahre >= 20) return `seit über 20 Jahren still · ${kontakt}`;
  if (jahre >= 16) return `seit 16–20 Jahren still · ${kontakt}`;
  if (jahre >= 10) return `seit 10–15 Jahren still · ${kontakt}`;
  return `seit unter 10 Jahren still · ${kontakt}`;
}

const kandidaten = [];
for (const k of kunden) {
  if (k.archiviert) continue;
  const b = bewerte(k);
  if (!b) continue;
  const angereichert = { ...k, ...b, schutzHinweis: b.schutz.length > 0 };
  kandidaten.push({ ...angereichert, regel: regelgruppe(angereichert) });
}
const rang = { A: 0, B: 1, C: 2 };
kandidaten.sort((a, b) => rang[a.stufe] - rang[b.stufe]
  || a.regel.localeCompare(b.regel)
  || a.letzteAktivitaet - b.letzteAktivitaet
  || a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
const q = (v) => {
  const s = (v === null || v === undefined ? '' : String(v)).replace(/[\r\n]+/g, ' / ');
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const kopf = ['nr', 'stufe', 'regel', 'gruende', 'schutz', 'entscheidung', 'notiz_pruefer',
  'name', 'kundennummer', 'mosaikKurzname', 'typ', 'gruppe',
  'strasse', 'plz', 'ort', 'email', 'telefon',
  'letzteAktivitaet', 'projekte', 'letztesProjekt', 'belege', 'ansprechpartner',
  'historieJahre', 'historieUmsatz', 'platzbauer', 'optIn', 'erstellt', 'notizen', 'kundeId'];
const zeilen = [kopf.join(';')];
kandidaten.forEach((k, i) => {
  zeilen.push([
    String(i + 1).padStart(4, '0'), k.stufe, k.regel, k.gruende.join(' | '), k.schutz.join(' | '), '', '',
    k.name, k.kundennummer, k.mosaikKurzname, k.typ, k.gruppe,
    k.strasse, k.plz, k.ort, k.mails.join(' '), k.telefone.join(' '),
    k.letzteAktivitaet || 'nie', k.nProjekte, k.letztesProjekt || '', k.nBelege, k.nAP,
    k.histJahre || '', k.histUmsatz ? k.histUmsatz.toFixed(0) : '',
    k.imPlatzbauerAngebot || (k.bezugsweg === 'ueber_platzbauer' ? 'Bezugsweg Platzbauer' : ''),
    k.optIn ? 'ja' : 'nein', k.erstellt, k.notizen.slice(0, 200), k.id,
  ].map(q).join(';'));
});
writeFileSync(OUT, '﻿' + zeilen.join('\n'), 'utf8');

const proStufe = { A: 0, B: 0, C: 0 };
for (const k of kandidaten) proStufe[k.stufe]++;
console.log('📋 Archiv-Kandidaten');
console.log(`   Stufe A (nie bestellt / 16+ Jahre still)  ${proStufe.A}`);
console.log(`   Stufe B (10–15 Jahre still)                ${proStufe.B}`);
console.log(`   Stufe C (Datensatz kaputt, sonst aktiv)    ${proStufe.C}`);
console.log(`   gesamt                                     ${kandidaten.length} von ${kunden.length}`);
console.log(`   bliebe im Bestand                          ${kunden.length - proStufe.A - proStufe.B}`);

const regelZaehler = new Map();
for (const k of kandidaten) {
  const e = regelZaehler.get(k.regel) ?? { anzahl: 0, stufe: k.stufe };
  e.anzahl++;
  regelZaehler.set(k.regel, e);
}
console.log('\n📦 Regelgruppen (so lässt sich das in Blöcken entscheiden):');
for (const [r, e] of [...regelZaehler.entries()].sort((a, b) => b[1].anzahl - a[1].anzahl)) {
  console.log(`   ${String(e.anzahl).padStart(4)}  [${e.stufe}]  ${r}`);
}

const grundZaehler = new Map();
for (const k of kandidaten) for (const g of k.gruende) {
  const key = g.replace(/\s*[—(].*$/, '').trim();
  grundZaehler.set(key, (grundZaehler.get(key) || 0) + 1);
}
console.log('\n📈 Gründe:');
for (const [g, n] of [...grundZaehler.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(5)}×  ${g}`);
}
console.log(`\n💾 ${OUT}`);
