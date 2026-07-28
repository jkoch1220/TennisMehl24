/**
 * Stelle sicher dass alle Attribute in admin_changelog Collection existieren
 * Aufruf: node scripts/ensure-changelog-attributes.mjs
 */
import { readFileSync } from 'fs';
import { Client, Databases } from 'node-appwrite';

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
const COLLECTION = 'admin_changelog';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new Databases(client);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const attrs = [
  { name: 'type', size: 50 }, // 'auto' | 'manual'
  { name: 'title', size: 100 },
  { name: 'description', size: 2000 },
  { name: 'category', size: 50 }, // feature|bugfix|infra|config|other
  { name: 'commitHash', size: 40 },
  { name: 'createdBy', size: 128 },
  { name: 'timestamp', size: 50 },
];

async function run() {
  console.log('📝 Stelle Attribute sicher...\n');

  for (const attr of attrs) {
    try {
      await db.getAttribute(DB, COLLECTION, attr.name);
      console.log(`✅ ${attr.name} existiert`);
    } catch (e) {
      if (e.code === 404) {
        console.log(`📝 Erstelle ${attr.name}...`);
        try {
          await db.createStringAttribute(DB, COLLECTION, attr.name, attr.size, false);
          console.log(`✅ ${attr.name} erstellt`);
          await sleep(1000);
        } catch (createErr) {
          console.error(`❌ ${attr.name}: ${createErr.message}`);
        }
      } else {
        console.error(`❌ ${attr.name}: ${e.message}`);
      }
    }
  }

  console.log('\n✅ Done!');
}

run().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
