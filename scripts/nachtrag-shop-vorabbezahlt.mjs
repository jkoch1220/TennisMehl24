#!/usr/bin/env node
/**
 * nachtrag-shop-vorabbezahlt.mjs
 *
 * Traegt `vorabBezahlt` in Projekte nach, die aus bereits bezahlten Shop-Bestellungen
 * entstanden sind (Gambio Hub: PayPal, Kreditkarte, Lastschrift …).
 *
 * Hintergrund: Bis 08/2026 wertete die Projekt-Anlage das Feld `bestellung.bezahlt`
 * aus, das als Appwrite-Attribut nie existierte und deshalb immer undefined war.
 * Bezahlte Bestellungen landeten dadurch mit „(noch offen)" in den Projektnotizen,
 * ohne strukturierte Zahlungsinformation. Neue Projekte bekommen sie jetzt beim
 * Anlegen — dieses Skript holt den Bestand nach.
 *
 * Aufruf:
 *   node scripts/nachtrag-shop-vorabbezahlt.mjs            # Vorschau (aendert nichts)
 *   node scripts/nachtrag-shop-vorabbezahlt.mjs --apply    # schreibt
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases, Query } from 'node-appwrite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE = 'projekte';
const BESTELLUNGEN = 'shop_bestellungen';

const APPLY = process.argv.includes('--apply');

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

/** Spiegelt istVorabBezahlt() aus src/services/shopBestellungService.ts */
function istVorabBezahlt(bestellung) {
  if (bestellung.zahlungsStatus === 'bezahlt') return true;
  if (bestellung.zahlungsStatus === 'offen') return false;
  const m = (bestellung.zahlungsmethode || '').toLowerCase();
  if (!m) return false;
  if (m.includes('rechnung') || m.includes('vorkasse') || m.includes('überweisung')) return false;
  return ['paypal', 'kredit', 'debit', 'lastschrift', 'sofort', 'klarna', 'apple', 'google', 'hub'].some(
    (k) => m.includes(k)
  );
}

async function ladeAlle(db, collection) {
  const alle = [];
  let cursor = null;
  while (true) {
    const q = [Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await db.listDocuments(DATABASE_ID, collection, q);
    alle.push(...res.documents);
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return alle;
}

const env = loadEnv();
const db = new Databases(
  new Client()
    .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
    .setProject(env.VITE_APPWRITE_PROJECT_ID)
    .setKey(env.APPWRITE_API_KEY)
);

console.log(APPLY ? '=== SCHREIBMODUS ===' : '=== VORSCHAU (--apply zum Schreiben) ===\n');

const bestellungen = await ladeAlle(db, BESTELLUNGEN);
const perNummer = new Map(bestellungen.map((b) => [String(b.bestellnummer), b]));
console.log(`Shop-Bestellungen: ${bestellungen.length}`);

const projekte = await ladeAlle(db, PROJEKTE);
console.log(`Projekte gesamt:   ${projekte.length}\n`);

let geprueft = 0, zuAendern = 0, geschrieben = 0, fehler = 0;

for (const doc of projekte) {
  let projekt;
  try {
    projekt = JSON.parse(doc.data || '{}');
  } catch {
    continue;
  }

  // Match ueber den Projektnamen ("Shop #202 (Universal)"), NICHT ueber `herkunft`:
  // das Feld ist bei allen 27 Shop-Projekten im Bestand leer, weil sie vor seiner
  // Einfuehrung angelegt wurden.
  const treffer = /Shop #(\d+)/.exec(projekt.projektName || '');
  if (!treffer) continue;
  geprueft++;

  const bestellung = perNummer.get(treffer[1]);
  if (!bestellung) {
    console.log(`  ?  ${projekt.projektName}: Bestellung #${treffer[1]} nicht gefunden`);
    continue;
  }

  const bezahlt = istVorabBezahlt(bestellung);
  if (projekt.vorabBezahlt === bezahlt && projekt.vorabBezahltMethode) continue;

  zuAendern++;
  console.log(
    `  ${bezahlt ? '✓' : '·'}  ${projekt.projektName.padEnd(28)} ${String(bestellung.zahlungsmethode).padEnd(24)} ` +
    `zahlungsStatus=${bestellung.zahlungsStatus ?? '-'} -> vorabBezahlt=${bezahlt}  [Projektstatus: ${projekt.status}]`
  );

  if (!APPLY) continue;

  const aktualisiert = {
    ...projekt,
    vorabBezahlt: bezahlt,
    vorabBezahltMethode: bestellung.zahlungsmethode,
    vorabBezahltAm: bezahlt ? bestellung.bezahltAm || bestellung.bestelldatum : undefined,
    vorabBezahltReferenz: bezahlt
      ? bestellung.molliePaymentId || `Shop #${bestellung.bestellnummer}`
      : undefined,
    geaendertAm: new Date().toISOString(),
  };

  try {
    await db.updateDocument(DATABASE_ID, PROJEKTE, doc.$id, {
      data: JSON.stringify(aktualisiert),
      geaendertAm: aktualisiert.geaendertAm,
    });
    geschrieben++;
  } catch (error) {
    fehler++;
    console.error(`  ✗  ${projekt.projektName}: ${error.message}`);
  }
}

console.log(
  `\nShop-Projekte geprueft: ${geprueft} | zu aendern: ${zuAendern}` +
  (APPLY ? ` | geschrieben: ${geschrieben} | Fehler: ${fehler}` : ' | nichts geschrieben (Vorschau)')
);
