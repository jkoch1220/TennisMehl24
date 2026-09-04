/**
 * Setup Zeiterfassung — Arbeitszeitnachweis nach ArbZG/MiLoG (idempotent).
 *
 * Legt an:
 *   zeit_events            append-only Stempelkette (kommen/pause/gehen/storno)
 *   zeit_abschluesse       Monatsabschluss je Mitarbeiter (Freigabe/Bestätigung)
 *   schicht_mitarbeiter.userId  Verknüpfung Mitarbeiter ↔ Portal-Konto
 *
 * Die beiden Collection-IDs sind in src/types/zeiterfassung.ts als
 * ZEIT_EVENTS_COLLECTION / ZEIT_ABSCHLUESSE_COLLECTION gespiegelt — wer hier
 * umbenennt, muss dort mit umbenennen.
 *
 * Warum `zeit_events` KEINE Client-Permissions bekommt:
 * Arbeitszeiten sind besonders sensible Personendaten. Appwrite kennt bei
 * documentSecurity=false nur Collection-weite Rechte — ein `read(users)` hieße
 * also, dass jeder eingeloggte Portal-Nutzer die Stempel aller Kollegen lesen
 * kann. Deshalb ein LEERES Permissions-Array: der Zugriff läuft ausschließlich
 * über die Netlify-Function `zeiterfassung`, die mit dem Server-API-Key
 * arbeitet und pro Anfrage entscheidet, wer was sehen darf.
 *
 * Warum `schicht_mitarbeiter.userId` ein ECHTES Attribut sein muss:
 * Die Collection legt alles im `data`-JSON-Blob ab und ist darüber nicht
 * filterbar. Die Zuordnung Konto→Mitarbeiter muss aber bei jedem Stempel per
 * Query auffindbar sein (Query.equal('userId', …)). Ein Feld im Blob ginge
 * nur mit „alle laden und in JS suchen".
 * Unkritisch für den Bestand: `schichtplanungService` schreibt beim Update nur
 * { istAktiv, data } — `userId` bleibt dabei unangetastet stehen.
 *
 * Aufruf:  node scripts/setup-zeiterfassung.mjs [--dry-run] [--mock]
 *
 * `--mock` arbeitet auf der Sandbox-Datenbank. Das Skript muss ZWEIMAL laufen —
 * einmal ohne und einmal mit `--mock` —, sonst fehlt der Sandbox das Schema und
 * die Zeiterfassung läuft dort in „Unknown attribute"-Fehler.
 */
import { readFileSync } from 'fs';
import { Client, Databases, Query } from 'node-appwrite';

const DRY_RUN = process.argv.includes('--dry-run');
const MOCK = process.argv.includes('--mock');

// .env laden (Handparser — dotenv ist keine Laufzeit-Abhängigkeit des Repos)
const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
// Bewusst OHNE VITE_-Prefix: Vite inlined jede VITE_*-Variable zur Build-Zeit
// ins Browser-Bundle. Ein Server-API-Key darf dort nie landen.
const API_KEY = env.APPWRITE_API_KEY;
// Muss zu MOCK_DATABASE_ID / PRODUKTIONS_DATABASE_ID aus src/config/appwriteEnv.ts
// passen. Als Node-Skript kann diese Datei den TS-Proxy nicht nutzen.
const DB = MOCK ? 'tennismehl24_db_mock' : 'tennismehl24_db';

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen in .env gesetzt sein');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new Databases(client);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EVENTS = 'zeit_events';
const ABSCHLUESSE = 'zeit_abschluesse';
const MITARBEITER = 'schicht_mitarbeiter';

/** Was am Ende in der Zusammenfassung steht. */
const bilanz = { neu: [], vorhanden: [], fehler: [] };

/* ------------------------------------------------------------------ *
 * Helfer — idempotent, mit Dry-Run
 * ------------------------------------------------------------------ */

async function collectionExists(id) {
  try {
    await db.getCollection(DB, id);
    return true;
  } catch (e) {
    if (e.code === 404) return false;
    throw e;
  }
}

/**
 * Legt eine Collection an, falls sie fehlt.
 * `permissions` bewusst als Pflichtargument: bei dieser Collection ist das
 * leere Array eine fachliche Entscheidung und kein vergessener Parameter.
 */
async function ensureCollection(id, name, permissions) {
  if (await collectionExists(id)) {
    console.log(`OK   Collection ${id} existiert bereits`);
    bilanz.vorhanden.push(`Collection ${id}`);
    return false;
  }
  if (DRY_RUN) {
    console.log(`DRY  Collection ${id} würde angelegt ("${name}", Permissions: ${permissions.length ? permissions.join(' | ') : 'KEINE — nur API-Key'})`);
    return true;
  }
  try {
    // documentSecurity=false: es gibt keine Rechte je Dokument, nur die der
    // Collection — und die sind hier leer.
    await db.createCollection(DB, id, name, permissions, false);
    console.log(`NEU  Collection ${id} angelegt`);
    bilanz.neu.push(`Collection ${id}`);
    return true;
  } catch (e) {
    if (e.code === 409) {
      console.log(`OK   Collection ${id} existiert bereits (parallel angelegt)`);
      bilanz.vorhanden.push(`Collection ${id}`);
      return false;
    }
    throw e;
  }
}

/**
 * `listAttributes` paginiert (Default 25!). Ohne das Limit übersieht der
 * Idempotenz-Check vorhandene Attribute und legt sie ein zweites Mal an —
 * was Appwrite mit 409 quittiert und den Lauf abbricht.
 */
async function vorhandeneAttribute(coll) {
  try {
    const { attributes } = await db.listAttributes(DB, coll, [Query.limit(500)]);
    return attributes;
  } catch (e) {
    // Noch nicht angelegt (oder Dry-Run vor dem Anlegen): nichts vorhanden.
    if (e.code === 404) return [];
    throw e;
  }
}

/**
 * Ein String-Attribut sicherstellen.
 *
 * Zu `required`: Appwrite akzeptiert ein Pflichtfeld nur auf einer LEEREN
 * Collection — für vorhandene Zeilen gäbe es keinen Wert. Deshalb entstehen
 * die Pflichtfelder von `zeit_events` direkt beim Erstanlegen. `default` ist
 * bei required verboten und wird hier nie mitgegeben.
 */
async function ensureStringAttr(coll, key, size, required = false, vorhanden = null) {
  const attrs = vorhanden ?? (await vorhandeneAttribute(coll));
  if (attrs.some((a) => a.key === key)) {
    console.log(`OK   ${coll}.${key} existiert`);
    bilanz.vorhanden.push(`${coll}.${key}`);
    return;
  }
  if (DRY_RUN) {
    console.log(`DRY  ${coll}.${key} würde angelegt (string ${size}${required ? ', PFLICHT' : ', optional'})`);
    return;
  }
  try {
    await db.createStringAttribute(DB, coll, key, size, required);
    console.log(`NEU  ${coll}.${key} (string ${size}${required ? ', PFLICHT' : ', optional'})`);
    bilanz.neu.push(`${coll}.${key}`);
    // Appwrite legt Attribute asynchron an; ohne Pause läuft der nächste
    // Aufruf gegen eine Collection, die noch im Umbau ist.
    await sleep(800);
  } catch (e) {
    if (e.code === 409) {
      console.log(`OK   ${coll}.${key} existiert (parallel angelegt)`);
      bilanz.vorhanden.push(`${coll}.${key}`);
      return;
    }
    console.warn(`⚠️   ${coll}.${key} nicht angelegt: ${e.message}`);
    if (required) {
      console.warn('     Hinweis: Pflichtfelder lassen sich nur auf einer leeren Collection ergänzen.');
    }
    bilanz.fehler.push(`${coll}.${key}: ${e.message}`);
  }
}

/** Wie ensureStringAttr, nur als Ganzzahl (Minutenwerte im Abschluss). */
async function ensureIntegerAttr(coll, key, required = false, vorhanden = null) {
  const attrs = vorhanden ?? (await vorhandeneAttribute(coll));
  if (attrs.some((a) => a.key === key)) {
    console.log(`OK   ${coll}.${key} existiert`);
    bilanz.vorhanden.push(`${coll}.${key}`);
    return;
  }
  if (DRY_RUN) {
    console.log(`DRY  ${coll}.${key} würde angelegt (integer${required ? ', PFLICHT' : ', optional'})`);
    return;
  }
  try {
    await db.createIntegerAttribute(DB, coll, key, required);
    console.log(`NEU  ${coll}.${key} (integer${required ? ', PFLICHT' : ', optional'})`);
    bilanz.neu.push(`${coll}.${key}`);
    await sleep(800);
  } catch (e) {
    if (e.code === 409) {
      console.log(`OK   ${coll}.${key} existiert (parallel angelegt)`);
      bilanz.vorhanden.push(`${coll}.${key}`);
      return;
    }
    console.warn(`⚠️   ${coll}.${key} nicht angelegt: ${e.message}`);
    bilanz.fehler.push(`${coll}.${key}: ${e.message}`);
  }
}

/**
 * Wartet, bis alle Attribute einer Collection `available` sind.
 *
 * MUSS vor jeder Index-Erzeugung laufen: ein Index auf ein Attribut im Zustand
 * `processing` wird von Appwrite abgelehnt.
 */
async function waitForAttributes(coll) {
  if (DRY_RUN) return;
  for (let i = 0; i < 30; i++) {
    const attrs = await vorhandeneAttribute(coll);
    if (attrs.length === 0 || attrs.every((a) => a.status === 'available')) return;
    await sleep(1000);
  }
  console.warn(`⚠️   ${coll}: Attribute nach 30 s noch nicht alle verfügbar — Indizes können scheitern`);
}

async function ensureIndex(coll, key, attributes, type = 'key') {
  if (DRY_RUN) {
    console.log(`DRY  Index ${coll}.${key} würde angelegt (${type}) [${attributes.join(', ')}]`);
    return;
  }
  try {
    await db.createIndex(DB, coll, key, type, attributes, attributes.map(() => 'ASC'));
    console.log(`NEU  Index ${coll}.${key} [${attributes.join(', ')}]`);
    bilanz.neu.push(`Index ${coll}.${key}`);
    await sleep(500);
  } catch (e) {
    if (e.code === 409) {
      console.log(`OK   Index ${coll}.${key} existiert`);
      bilanz.vorhanden.push(`Index ${coll}.${key}`);
    } else {
      console.warn(`⚠️   Index ${coll}.${key}: ${e.message}`);
      bilanz.fehler.push(`Index ${coll}.${key}: ${e.message}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Ablauf
 * ------------------------------------------------------------------ */

async function main() {
  console.log(
    `${DRY_RUN ? '🔍 DRY-RUN — es wird nichts geschrieben' : '✏️  SCHREIBMODUS'}` +
      `  ·  Ziel-Datenbank: ${DB}${MOCK ? ' (Sandbox)' : ' (Produktion)'}\n`
  );

  // ---------------------------------------------------------------- 1
  console.log(`— Collection ${EVENTS} (append-only Stempelkette) —`);
  // LEERES Permissions-Array: kein Client kommt an diese Collection heran,
  // weder lesend noch schreibend. Alles läuft über die Server-Fassade
  // netlify/functions/zeiterfassung.ts mit dem API-Key.
  await ensureCollection(EVENTS, 'Zeiterfassung Events', []);

  {
    const vorhanden = await vorhandeneAttribute(EVENTS);
    // Pflichtfelder zuerst — sie gehen nur, solange die Collection leer ist.
    await ensureStringAttr(EVENTS, 'mitarbeiterId', 64, true, vorhanden);
    await ensureStringAttr(EVENTS, 'typ', 20, true, vorhanden);
    await ensureStringAttr(EVENTS, 'zeitpunkt', 30, true, vorhanden);
    await ensureStringAttr(EVENTS, 'datum', 10, true, vorhanden);
    await ensureStringAttr(EVENTS, 'quelle', 20, true, vorhanden);
    await ensureStringAttr(EVENTS, 'erfasstVonUserId', 64, true, vorhanden);
    await ensureStringAttr(EVENTS, 'erfasstVonName', 120, true, vorhanden);
    await ensureStringAttr(EVENTS, 'erfasstAm', 30, true, vorhanden);
    // Optional: nur bei Storno bzw. Nachtrag gefüllt.
    await ensureStringAttr(EVENTS, 'bezugEventId', 64, false, vorhanden);
    await ensureStringAttr(EVENTS, 'begruendung', 500, false, vorhanden);
    await ensureStringAttr(EVENTS, 'notiz', 500, false, vorhanden);
  }

  await waitForAttributes(EVENTS);
  // idx_ma_datum trägt die Tages-/Monatsabfrage eines Mitarbeiters,
  // idx_datum die Leitungsansicht „alle Mitarbeiter an diesem Tag".
  await ensureIndex(EVENTS, 'idx_ma_datum', ['mitarbeiterId', 'datum']);
  await ensureIndex(EVENTS, 'idx_datum', ['datum']);

  // ---------------------------------------------------------------- 2
  console.log(`\n— Collection ${ABSCHLUESSE} (Monatsabschluss) —`);
  // Gleiche Begründung wie oben: Personendaten, kein Client-Zugriff.
  await ensureCollection(ABSCHLUESSE, 'Zeiterfassung Monatsabschlüsse', []);

  {
    const vorhanden = await vorhandeneAttribute(ABSCHLUESSE);
    await ensureStringAttr(ABSCHLUESSE, 'mitarbeiterId', 64, true, vorhanden);
    await ensureStringAttr(ABSCHLUESSE, 'monat', 7, true, vorhanden); // YYYY-MM
    await ensureStringAttr(ABSCHLUESSE, 'status', 20, true, vorhanden); // offen|freigegeben|bestaetigt
    await ensureIntegerAttr(ABSCHLUESSE, 'istMinuten', true, vorhanden);
    await ensureIntegerAttr(ABSCHLUESSE, 'sollMinuten', true, vorhanden);
    await ensureStringAttr(ABSCHLUESSE, 'freigegebenVonUserId', 64, false, vorhanden);
    await ensureStringAttr(ABSCHLUESSE, 'freigegebenVonName', 120, false, vorhanden);
    await ensureStringAttr(ABSCHLUESSE, 'freigegebenAm', 30, false, vorhanden);
    await ensureStringAttr(ABSCHLUESSE, 'bestaetigtAm', 30, false, vorhanden);
    await ensureStringAttr(ABSCHLUESSE, 'notiz', 500, false, vorhanden);
  }

  await waitForAttributes(ABSCHLUESSE);
  // Unique: ein Mitarbeiter hat je Monat genau einen Abschluss. Zwei Zeilen
  // mit verschiedenen Stundensummen wären ein unauflösbarer Widerspruch im
  // Nachweis — die Datenbank verhindert das, nicht erst die Anwendung.
  await ensureIndex(ABSCHLUESSE, 'idx_ma_monat', ['mitarbeiterId', 'monat'], 'unique');

  // ---------------------------------------------------------------- 3
  console.log(`\n— Erweiterung ${MITARBEITER}.userId —`);
  // Nur dieses eine Attribut plus Index. Die Collection selbst (Permissions,
  // `data`-Blob, `istAktiv`) wird bewusst nicht angefasst.
  if (!(await collectionExists(MITARBEITER))) {
    console.warn(`⚠️   Collection ${MITARBEITER} fehlt in ${DB} — bitte zuerst \`npm run setup:schichtplanung\` ausführen`);
    bilanz.fehler.push(`${MITARBEITER} fehlt in ${DB}`);
  } else {
    // Optional, nicht required: die Collection enthält bereits Mitarbeiter
    // ohne Portal-Konto, und die sollen es auch bleiben dürfen.
    await ensureStringAttr(MITARBEITER, 'userId', 64, false);
    await waitForAttributes(MITARBEITER);
    await ensureIndex(MITARBEITER, 'idx_userid', ['userId']);
  }

  // ---------------------------------------------------------------- Bilanz
  console.log('\n— Zusammenfassung —');
  if (DRY_RUN) {
    console.log('  DRY-RUN: nichts geändert. Oben steht, was ein echter Lauf anlegen würde.');
  } else {
    console.log(`  Neu angelegt (${bilanz.neu.length}): ${bilanz.neu.join(', ') || '—'}`);
    console.log(`  Übersprungen, weil vorhanden (${bilanz.vorhanden.length}): ${bilanz.vorhanden.join(', ') || '—'}`);
    if (bilanz.fehler.length) {
      console.log(`  ⚠️  Fehler (${bilanz.fehler.length}):`);
      for (const f of bilanz.fehler) console.log(`     - ${f}`);
    }
  }

  console.log(
    `\n${DRY_RUN ? '🔍 DRY-RUN beendet.' : '✅ Fertig.'}\n` +
      (MOCK
        ? 'Das war die Sandbox. Für den Echtbetrieb dasselbe Skript ohne --mock ausführen.'
        : 'Das war die Produktion. Jetzt zusätzlich mit --mock ausführen, damit die\n' +
          'Sandbox dasselbe Schema hat — sonst läuft die Zeiterfassung im Mock-Modus\n' +
          'in "Unknown attribute"-Fehler:  node scripts/setup-zeiterfassung.mjs --mock')
  );
}

main().catch((e) => {
  console.error('❌ Setup fehlgeschlagen:', e);
  process.exit(1);
});
