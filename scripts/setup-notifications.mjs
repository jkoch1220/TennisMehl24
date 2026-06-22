/**
 * Legt die Appwrite-Collection `notifications` an (idempotent).
 *
 * Server-seitiges Setup, damit der Notification-Service nicht vom
 * Browser-seitigen appwriteSetup abhängt (email-sync & Reconciliation
 * schreiben server-seitig und brauchen die Collection garantiert).
 *
 * Aufruf:  node scripts/setup-notifications.mjs
 */
import { readFileSync } from 'fs';
import { Client, Databases, IndexType, Permission, Role } from 'node-appwrite';

// .env laden
const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = env.VITE_APPWRITE_API_KEY;
const DB = 'tennismehl24_db';
const COLLECTION = 'notifications';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new Databases(client);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureCollection() {
  try {
    await db.getCollection(DB, COLLECTION);
    console.log('OK  Collection existiert bereits');
    return;
  } catch (e) {
    if (e.code !== 404) throw e;
  }
  await db.createCollection(
    DB,
    COLLECTION,
    'Benachrichtigungen',
    [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ],
    false // documentSecurity aus -> Collection-Permissions gelten
  );
  console.log('NEW Collection angelegt');
}

async function ensureStringAttr(key, size, required, array = false) {
  try {
    await db.createStringAttribute(DB, COLLECTION, key, size, required, undefined, array);
    console.log(`NEW Attribut ${key}`);
  } catch (e) {
    if (e.code === 409) console.log(`OK  Attribut ${key} existiert`);
    else throw e;
  }
}

async function ensureIndex(key, type, attributes) {
  try {
    await db.createIndex(DB, COLLECTION, key, type, attributes, attributes.map(() => 'ASC'));
    console.log(`NEW Index ${key}`);
  } catch (e) {
    if (e.code === 409) console.log(`OK  Index ${key} existiert`);
    else console.log(`ERR Index ${key}: ${e.message}`);
  }
}

async function main() {
  await ensureCollection();

  await ensureStringAttr('typ', 50, true);
  await ensureStringAttr('titel', 500, true);
  await ensureStringAttr('nachricht', 2000, true);
  await ensureStringAttr('refTyp', 100, true);
  await ensureStringAttr('refId', 100, true);
  await ensureStringAttr('link', 500, true);
  await ensureStringAttr('prioritaet', 20, false);
  await ensureStringAttr('gelesenVon', 100, false, true);
  await ensureStringAttr('erledigtVon', 100, false, true);
  await ensureStringAttr('erstelltAm', 50, true);

  // Attribute müssen 'available' sein, bevor Indizes erstellt werden können
  console.log('... warte auf Attribut-Verfügbarkeit');
  await sleep(4000);

  await ensureIndex('ref_unique_index', IndexType.Unique, ['refTyp', 'refId']);
  await ensureIndex('erstelltAm_index', IndexType.Key, ['erstelltAm']);
  await ensureIndex('typ_index', IndexType.Key, ['typ']);

  console.log('\nFertig: notifications-Collection eingerichtet.');
}

main().catch((e) => {
  console.error('Fehler:', e.message);
  process.exit(1);
});
