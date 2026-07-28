/**
 * Setup für Admin Changelog Collection (privat für Julian)
 * Legt an: Collection `admin_changelog` mit Feldern für Arbeitsnachweis
 *
 * Aufruf: node scripts/setup-admin-changelog.mjs [--dry-run]
 */
import { readFileSync } from 'fs';
import { Client, Databases, Permission, Role } from 'node-appwrite';

const DRY_RUN = process.argv.includes('--dry-run');

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

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen in .env gesetzt sein');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new Databases(client);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLLECTION_ID = 'admin_changelog';

async function run() {
  try {
    // 1. Collection prüfen/erstellen (nur für Admin lesbar/schreibbar)
    let exists = false;
    try {
      await db.getCollection(DB, COLLECTION_ID);
      exists = true;
      console.log(`✅ Collection ${COLLECTION_ID} existiert bereits`);
    } catch (e) {
      if (e.code === 404) {
        console.log(`📦 Erstelle Collection ${COLLECTION_ID}...`);
        if (!DRY_RUN) {
          // Nur Admin darf diese Collection nutzen
          await db.createCollection(
            DB,
            COLLECTION_ID,
            'Admin Changelog - Arbeitsnachweis für Julian (privat)',
            [
              Permission.create(Role.label('admin')),
              Permission.read(Role.label('admin')),
              Permission.update(Role.label('admin')),
              Permission.delete(Role.label('admin')),
            ]
          );
          console.log(`✅ Collection ${COLLECTION_ID} erstellt (nur Admin-Zugriff)`);
          await sleep(2000);
        }
      } else {
        throw e;
      }
    }

    // 2. Attribute erstellen (falls neu)
    if (!exists && !DRY_RUN) {
      console.log('📝 Erstelle Attribute...');

      const attrs = [
        { name: 'type', label: 'type (enum)', size: 50 }, // 'auto' | 'manual'
        { name: 'title', label: 'title', size: 100 },
        { name: 'description', label: 'description', size: 2000 },
        { name: 'category', label: 'category', size: 50 }, // feature|bugfix|infra|config|other
        { name: 'commitHash', label: 'commitHash', size: 40 },
        { name: 'createdBy', label: 'createdBy (User ID)', size: 128 },
        { name: 'timestamp', label: 'timestamp (ISO string)', size: 50 },
      ];

      for (const attr of attrs) {
        try {
          await db.getAttribute(DB, COLLECTION_ID, attr.name);
          console.log(`✅ Attribut ${attr.name} existiert bereits`);
        } catch (e) {
          if (e.code === 404) {
            console.log(`  Erstelle ${attr.name}...`);
            await db.createStringAttribute(
              DB,
              COLLECTION_ID,
              attr.name,
              attr.size,
              false // required=false (kein default value)
            );
            console.log(`  ✅ ${attr.name} erstellt`);
            await sleep(500);
          } else {
            console.error(`  ❌ Fehler bei ${attr.name}:`, e.message);
          }
        }
      }

      console.log('✅ Alle Attribute erstellt');
    }

    console.log('\n✅ Setup abgeschlossen!');
    console.log('Admin Changelog Collection ist bereit unter /admin/mein-fortschritt');
  } catch (error) {
    console.error('❌ Setup fehler:', error);
    process.exit(1);
  }
}

console.log(`🚀 Admin Changelog Setup${DRY_RUN ? ' (DRY RUN)' : ''}...`);
run();
