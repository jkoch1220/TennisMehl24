/**
 * Migration: interne Fake-E-Mails (@tennismehl.local) → echte Account-E-Mails.
 * Voraussetzung für Passwort-Recovery (Appwrite mailt an die Account-E-Mail).
 *
 * Mapping (per User-ID, nicht per Name — verifiziert am 24.07.2026):
 *  - Julian (admin@tennismehl.local)  → jtatwcook@gmail.com
 *  - Ronald (ronald@tennismehl.local) → roniriedl@gmail.com
 *    + frischer Onboarding-Reset (Einmalpasswort 1220 + mustChangePassword),
 *      da Ronald sich noch nie angemeldet hat.
 *  - Luca hat bereits l.ca@me.com → wird übersprungen.
 *
 * Idempotent: Accounts, deren E-Mail schon dem Ziel entspricht, werden übersprungen.
 * Der deaktivierte Account "egner" wird nicht angefasst.
 *
 * Aufruf:  node scripts/migriere-echte-emails.mjs [--dry-run]
 */
import { readFileSync } from 'fs';
import { Client, Users } from 'node-appwrite';

const DRY_RUN = process.argv.includes('--dry-run');

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = env.APPWRITE_API_KEY;

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen in .env gesetzt sein');
  process.exit(1);
}

// Einmalpasswort aus der einen Quelle lesen (für Ronalds frischen Reset)
const onboardingSource = readFileSync('src/constants/onboarding.ts', 'utf8');
const actualMatch = onboardingSource.match(/ONBOARDING_PASSWORD_ACTUAL\s*=\s*'([^']+)'/);
if (!actualMatch) {
  console.error('❌ ONBOARDING_PASSWORD_ACTUAL nicht in src/constants/onboarding.ts gefunden');
  process.exit(1);
}
const ONBOARDING_PASSWORD_ACTUAL = actualMatch[1];

/** userId → { zielEmail, frischerReset } */
const MAPPING = {
  '6939c858000060084be3': { name: 'Julian', zielEmail: 'jtatwcook@gmail.com', frischerReset: false },
  '6a621c99002e260efbaf': { name: 'Ronald', zielEmail: 'roniriedl@gmail.com', frischerReset: true },
};

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const users = new Users(client);

async function main() {
  console.log(`🚀 E-Mail-Migration ${DRY_RUN ? '(DRY-RUN — keine Änderungen)' : ''}\n`);

  const result = await users.list();
  console.log(`ℹ️  ${result.users.length} User im System:\n`);
  for (const u of result.users) {
    console.log(`   • ${u.name} (${u.email}) [${u.status ? 'aktiv' : 'DEAKTIVIERT'}${u.labels?.includes('admin') ? ', admin' : ''}]`);
  }
  console.log('');

  for (const u of result.users) {
    const plan = MAPPING[u.$id];
    const label = `${u.name} (${u.email})`;

    if (!plan) {
      console.log(`SKIP ${label}: nicht im Mapping${u.email.endsWith('@tennismehl.local') && u.status ? ' ⚠️ hat aber noch .local-Adresse!' : ''}`);
      continue;
    }
    if (u.email === plan.zielEmail) {
      console.log(`SKIP ${label}: E-Mail bereits ${plan.zielEmail}`);
      continue;
    }
    if (u.name !== plan.name) {
      console.log(`STOP ${label}: Name passt nicht zum Mapping (erwartet "${plan.name}") — bitte prüfen!`);
      process.exitCode = 1;
      continue;
    }

    if (DRY_RUN) {
      console.log(`DRY  ${label}: würde auf ${plan.zielEmail} umgestellt${plan.frischerReset ? ' + frischer Onboarding-Reset (1220 + mustChangePassword)' : ''}`);
      continue;
    }

    await users.updateEmail(u.$id, plan.zielEmail);
    console.log(`NEW  ${label}: E-Mail → ${plan.zielEmail}`);

    if (plan.frischerReset) {
      await users.updatePassword(u.$id, ONBOARDING_PASSWORD_ACTUAL);
      const aktuell = await users.get(u.$id);
      await users.updatePrefs(u.$id, { ...(aktuell.prefs ?? {}), mustChangePassword: true });
      console.log(`NEW  ${u.name}: frischer Onboarding-Reset (Login mit 1220, Wechsel erzwungen)`);
    }
  }

  console.log(`\n✅ Fertig ${DRY_RUN ? '(Dry-Run — nichts geändert)' : ''}`);
  if (!DRY_RUN) {
    console.log('   Nachkontrolle: node scripts/migriere-echte-emails.mjs --dry-run (alles muss SKIP sein)');
  }
}

main().catch((e) => {
  console.error('❌ Migration fehlgeschlagen:', e);
  process.exit(1);
});
