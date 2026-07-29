/**
 * REPARATUR: `stammdaten.saisonPreisanpassungProzent` haengt in Appwrite seit dem
 * 2026-07-27 im Status "processing" und ist deshalb nicht beschreibbar — die globale
 * Saison-Preisanpassung (Default +4 %) laesst sich aktuell NICHT speichern.
 *
 * Das Attribut wird geloescht und identisch neu angelegt (double, optional, Default 4).
 *
 * DATENVERLUST: keiner. Geprueft am 2026-07-29: die Collection `stammdaten` enthaelt
 * genau 1 Dokument (stammdaten_data), und dort ist das Feld gar nicht vorhanden
 * (undefined) — ein haengendes Attribut nimmt keine Werte an. Es geht also nichts
 * verloren, was nicht ohnehin schon unerreichbar waere.
 *
 * Ausfuehren mit: node scripts/fix-stammdaten-preisanpassung-attribut.js
 */

import dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'stammdaten';
const KEY = 'saisonPreisanpassungProzent';
const DEFAULT_WERT = 4;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT / _PROJECT_ID / APPWRITE_API_KEY)!');
  process.exit(1);
}

const base = `${endpoint}/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/attributes`;
const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));

async function ladeAttribut() {
  const res = await fetch(`${base}/${KEY}`, { headers });
  return res.ok ? res.json() : null;
}

async function main() {
  console.log('🔧 Reparatur: stammdaten.saisonPreisanpassungProzent\n');

  const vorher = await ladeAttribut();
  if (!vorher) {
    console.log('ℹ️  Attribut existiert nicht — lege es neu an.');
  } else if (vorher.status === 'available') {
    console.log('✅ Attribut ist bereits "available" — nichts zu tun.');
    return;
  } else {
    console.log(`⚠️  Attribut haengt im Status "${vorher.status}" (erstellt ${vorher.$createdAt}).`);

    // Sicherheitsnetz: nur loeschen, wenn wirklich kein Dokument einen Wert traegt.
    const docsRes = await fetch(
      `${endpoint}/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/documents`,
      { headers }
    );
    const docs = await docsRes.json();
    const mitWert = (docs.documents || []).filter(
      (d) => d[KEY] !== undefined && d[KEY] !== null
    );
    if (mitWert.length > 0) {
      console.error(
        `❌ ABBRUCH: ${mitWert.length} Dokument(e) tragen einen Wert in "${KEY}". Nicht loeschen!`
      );
      process.exit(1);
    }
    console.log(`✅ Kein Dokument traegt einen Wert (${docs.total} Dokument(e) geprueft) — Loeschen ist verlustfrei.`);

    const del = await fetch(`${base}/${KEY}`, { method: 'DELETE', headers });
    if (!del.ok) {
      console.error('❌ Loeschen fehlgeschlagen:', del.status, await del.text());
      process.exit(1);
    }
    console.log('🗑️  Attribut geloescht.');
    await schlafe(5000);
  }

  const cre = await fetch(`${base}/float`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ key: KEY, required: false, default: DEFAULT_WERT, array: false }),
  });
  if (!cre.ok) {
    console.error('❌ Neuanlage fehlgeschlagen:', cre.status, await cre.text());
    process.exit(1);
  }
  console.log(`📝 Attribut neu angelegt (double, Default ${DEFAULT_WERT}). Warte auf "available"...`);

  for (let i = 1; i <= 15; i++) {
    await schlafe(2000);
    const a = await ladeAttribut();
    console.log(`   Versuch ${i}: status = ${a?.status ?? 'unbekannt'}`);
    if (a?.status === 'available') {
      console.log('\n✨ Fertig! Die Saison-Preisanpassung ist jetzt in den Stammdaten speicherbar.');
      return;
    }
  }

  console.error(
    '\n⚠️  Attribut ist nach 30 s noch nicht "available". Nochmal pruefen mit demselben Skript — es ist idempotent.'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('❌ Unerwarteter Fehler:', err);
  process.exit(1);
});
