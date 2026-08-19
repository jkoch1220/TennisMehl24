#!/usr/bin/env node
/**
 * anfragen-abgleich.mjs — Gleicht die Angebotsanfragen im Postfach gegen die
 * Anfragen-Collection im Portal ab.
 *
 * Beantwortet die Frage, die ein reiner Postfach-Scan nicht beantworten kann:
 * Ist eine ungelesene Anfrage tatsächlich unbearbeitet, oder liegt sie im Portal
 * längst als erledigt vor und ist nur im Postfach nie gelesen worden?
 *
 * Aufruf:  node scripts/anfragen-abgleich.mjs <scan-report.json>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases, Query } from 'node-appwrite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'anfragen';
const OFFENE_STATUS = ['neu', 'zugeordnet'];   // alles andere gilt als angefasst

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    env[m[1].trim()] = v;
  }
  return env;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

/** Vereinsname und Kontakt aus dem Text des Webformulars ziehen. */
function extractFormular(preview) {
  const g = (label) => {
    const m = preview.match(new RegExp(label + '\\s*\\*?\\s*:\\s*(.*)'));
    return m ? m[1].trim() : '';
  };
  return {
    verein: g('Vereins-Name'),
    vorname: g('Vorname'),
    nachname: g('Nachname'),
    email: g('E-Mail'),
    ort: g('Ort'),
  };
}

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Aufruf: node scripts/anfragen-abgleich.mjs <scan-report.json>');
  process.exit(1);
}

const env = loadEnv();
const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const databases = new Databases(client);

// Alle Anfragen aus dem Portal laden
const portal = [];
let cursor = null;
while (true) {
  const queries = [Query.limit(100), Query.orderDesc('$createdAt')];
  if (cursor) queries.push(Query.cursorAfter(cursor));
  const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, queries);
  portal.push(...res.documents);
  if (res.documents.length < 100) break;
  cursor = res.documents[res.documents.length - 1].$id;
}

console.log(`Portal: ${portal.length} Anfragen in der Collection "anfragen"`);
const statusVerteilung = {};
portal.forEach((d) => { statusVerteilung[d.status] = (statusVerteilung[d.status] || 0) + 1; });
console.log('Status:', Object.entries(statusVerteilung).map(([k, v]) => `${k}=${v}`).join(', '));
console.log('');

// Postfach-Anfragen aus dem Scan-Report
const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const mailbox = [];
for (const acc of report.accounts) {
  for (const m of [...acc.mails, ...acc.unanswered]) {
    if (!/anfrage@tennismehl\.com/i.test(acc.email)) continue;
    if (!/Neue Nachricht von Tennismehl/i.test(m.subject)) continue;
    mailbox.push({ ...m, konto: acc.email, form: extractFormular(m.preview) });
  }
}

// Index über UID und über Datum+Verein
const byUid = new Map();
const byKey = new Map();
for (const d of portal) {
  if (d.emailUid != null) byUid.set(String(d.emailUid), d);
  const tag = String(d.emailDatum || d.erstelltAm || '').slice(0, 10);
  const k = norm(d.vereinsname) + '|' + tag;
  if (k.length > 1) byKey.set(k, d);
}

const zeilen = [];
for (const m of mailbox) {
  const tag = String(m.date || '').slice(0, 10);
  let treffer = byUid.get(String(m.uid)) || byKey.get(norm(m.form.verein) + '|' + tag) || null;

  // Fallback: gleicher Verein, Datum ±2 Tage
  if (!treffer && m.form.verein) {
    treffer = portal.find((d) => {
      if (norm(d.vereinsname) !== norm(m.form.verein)) return false;
      const dt = new Date(d.emailDatum || d.erstelltAm || 0).getTime();
      return Math.abs(dt - new Date(m.date).getTime()) < 2 * 86400000;
    }) || null;
  }

  zeilen.push({
    datum: tag,
    alter: m.ageDays,
    verein: m.form.verein || `${m.form.vorname} ${m.form.nachname}`.trim() || '(unbekannt)',
    ort: m.form.ort,
    imPortal: !!treffer,
    status: treffer ? treffer.status : '—',
    offen: !treffer || OFFENE_STATUS.includes(treffer.status),
  });
}

zeilen.sort((a, b) => b.alter - a.alter);

console.log(`Postfach: ${zeilen.length} Formular-Anfragen im Scan-Zeitfenster`);
console.log('');
console.log('Alter | Datum      | Verein                                 | im Portal | Status            | offen?');
console.log('------+------------+----------------------------------------+-----------+-------------------+-------');
for (const z of zeilen) {
  console.log(
    String(z.alter).padStart(4) + 'd | ' + z.datum + ' | ' +
    z.verein.slice(0, 38).padEnd(38) + ' | ' +
    (z.imPortal ? 'ja       ' : 'NEIN     ') + ' | ' +
    z.status.padEnd(17) + ' | ' +
    (z.offen ? 'JA' : 'nein')
  );
}

const fehlend = zeilen.filter((z) => !z.imPortal);
const offen = zeilen.filter((z) => z.offen);
console.log('');
console.log(`Ergebnis: ${offen.length} von ${zeilen.length} Anfragen sind tatsächlich unbearbeitet`);
console.log(`          davon ${fehlend.length} gar nicht im Portal angekommen`);
