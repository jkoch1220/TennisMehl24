/**
 * Populate Admin Changelog mit bisherigen Commits + neuen Einträgen
 * Aufruf: node scripts/populate-changelog.mjs
 */
import { readFileSync } from 'fs';
import { Client, Databases, ID } from 'node-appwrite';
import { execSync } from 'child_process';

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

// Git Commits der letzten 3 Tage abrufen
function getRecentCommits() {
  const output = execSync(`git log --since="3 days ago" --format="%H|%ai|%s"`, {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, timestamp, message] = line.split('|');
      return { hash, timestamp, message };
    });
}

function inferCategory(message) {
  const lower = message.toLowerCase();
  if (lower.startsWith('fix')) return 'bugfix';
  if (lower.startsWith('feat')) return 'feature';
  if (lower.includes('infra') || lower.includes('docker') || lower.includes('deploy'))
    return 'infra';
  if (lower.includes('config') || lower.includes('env')) return 'config';
  return 'other';
}

async function addEntry(type, title, description, category = 'other', commitHash = null) {
  try {
    const now = new Date().toISOString();
    const payload = {
      type: type || 'manual',
      title: title || '',
      description: description || '',
      category: category || 'other',
      commitHash: commitHash ? commitHash.substring(0, 7) : '',
      timestamp: now,
      createdBy: '',
    };
    console.log(`  📝 ${JSON.stringify(payload).substring(0, 80)}...`);
    const doc = await db.createDocument(DB, COLLECTION, ID.unique(), payload);
    console.log(`  ✅ ${title}`);
    return doc;
  } catch (error) {
    console.error(`  ❌ Fehler: ${title}`);
    console.error(`     ${error.message}`);
  }
}

async function run() {
  console.log('📝 Populate Admin Changelog...\n');

  // 1. Git Commits hinzufügen
  console.log('📦 Importiere Git-Commits (letzte 3 Tage)...');
  const commits = getRecentCommits();
  console.log(`   Gefunden: ${commits.length} Commits\n`);

  for (const commit of commits) {
    const category = inferCategory(commit.message);
    const lines = commit.message.split('\n');
    const title = lines[0].substring(0, 100);
    const description = lines.join('\n');

    await addEntry('auto', title, description, category, commit.hash.substring(0, 7));
  }

  // 2. Manuelle Einträge hinzufügen
  console.log('\n📌 Manuelle Einträge...');

  await addEntry(
    'manual',
    '🌐 Neue Domain: tennismehl-portal.online',
    `Portal ist nun auch über tennismehl-portal.online erreichbar.
Konfiguriert bei Netlify als zusätzliche Domain.
Portal bleibt aber hauptsächlich über seine ursprüngliche Route erreichbar.`,
    'infra'
  );

  await addEntry(
    'manual',
    '☎️ Sipgat Telefonanlage Portierung in Progress',
    `Portierung der Telefonanlage zu Sipgat läuft weiterhin.
Status: In Bearbeitung / In Progress.
Nächster Schritt: Finalisierung der Konfiguration und Testing.`,
    'config'
  );

  console.log('\n✅ Changelog erfolgreich gefüllt!');
}

run().catch((error) => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});
