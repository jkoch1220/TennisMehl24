#!/usr/bin/env node
/**
 * scan-shop-zahlarten.mjs — Liest NUR LESEND, welche Zahlungsmethoden in den
 * Shop-Bestellungen tatsaechlich vorkommen und wie das abgeleitete `bezahlt`-Flag
 * dazu steht.
 *
 * Hintergrund: Die Ableitung im Backend (gambio-api.ts) ist eine Namens-Heuristik
 * ueber paymentType.module/title. Bestellungen ueber den Gambio Hub sind bereits
 * bezahlt, koennen aber je nach Modul-String durchs Raster fallen.
 *
 * Aufruf: node scripts/scan-shop-zahlarten.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases, Query } from 'node-appwrite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'shop_bestellungen';

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);

const db = new Databases(client);

const alle = [];
let cursor = null;
while (true) {
  const queries = [Query.limit(100)];
  if (cursor) queries.push(Query.cursorAfter(cursor));
  const res = await db.listDocuments(DATABASE_ID, COLLECTION_ID, queries);
  alle.push(...res.documents);
  if (res.documents.length < 100) break;
  cursor = res.documents[res.documents.length - 1].$id;
}

console.log(`Shop-Bestellungen geladen: ${alle.length}\n`);

const gruppen = new Map();
for (const d of alle) {
  const key = JSON.stringify({
    zahlungsmethode: d.zahlungsmethode ?? null,
    zahlungsart: d.zahlungsart ?? null,
    bezahlt: d.bezahlt ?? null,
  });
  const g = gruppen.get(key) || { anzahl: 0, beispiele: [] };
  g.anzahl++;
  if (g.beispiele.length < 3) g.beispiele.push(`#${d.bestellnummer} [${d.status}]`);
  gruppen.set(key, g);
}

console.log('=== Zahlungsmethode | zahlungsart | bezahlt ===');
for (const [k, v] of [...gruppen.entries()].sort((a, b) => b[1].anzahl - a[1].anzahl)) {
  const o = JSON.parse(k);
  console.log(
    `${String(v.anzahl).padStart(4)}x  "${o.zahlungsmethode}"  ->  zahlungsart=${o.zahlungsart}  bezahlt=${o.bezahlt}`
  );
  console.log(`        ${v.beispiele.join(', ')}`);
}

// Verdachtsfaelle: Zahlungsmethode deutet auf Vorabzahlung, bezahlt sagt nein
const verdacht = alle.filter((d) => {
  const m = (d.zahlungsmethode || '').toLowerCase();
  const wirktBezahlt =
    m.includes('hub') || m.includes('kreditkarte') || m.includes('kredit-') ||
    m.includes('debit') || m.includes('sofort') || m.includes('klarna') ||
    m.includes('apple') || m.includes('google') || m.includes('lastschrift');
  return wirktBezahlt && d.bezahlt !== true;
});

console.log(`\n=== Verdacht: vorab bezahlt, aber bezahlt!=true: ${verdacht.length} ===`);
for (const d of verdacht.slice(0, 20)) {
  console.log(`  #${d.bestellnummer}  "${d.zahlungsmethode}"  zahlungsart=${d.zahlungsart} bezahlt=${d.bezahlt} status=${d.status} ${d.summeBrutto}€`);
}
