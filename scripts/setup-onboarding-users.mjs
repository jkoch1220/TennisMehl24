/**
 * Onboarding-Reset (D5/D12): setzt bestehende User auf das Einmalpasswort
 * und markiert sie mit mustChangePassword — beim nächsten Login wird sofort
 * ein eigenes Passwort erzwungen.
 *
 *  - Einmalpasswort-Eingabe im Login: "1220" (wird clientseitig auf den
 *    internen Startwert abgebildet, da Appwrite min. 8 Zeichen verlangt).
 *    Der Startwert wird aus src/constants/onboarding.ts gelesen (eine Quelle).
 *  - D12: Ein User mit Anzeigename "Roni" wird in "Ronald" umbenannt.
 *  - Idempotent: Bereits markierte User (mustChangePassword=true) werden übersprungen.
 *
 * Aufruf:  node scripts/setup-onboarding-users.mjs [--dry-run] [--only <name>]
 */
import { readFileSync } from 'fs';
import { Client, Users } from 'node-appwrite';

const DRY_RUN = process.argv.includes('--dry-run');
const onlyIndex = process.argv.indexOf('--only');
const ONLY_NAME = onlyIndex > -1 ? process.argv[onlyIndex + 1]?.toLowerCase() : null;

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

// Startwert aus der einen Quelle lesen (kein Duplikat im Skript)
const onboardingSource = readFileSync('src/constants/onboarding.ts', 'utf8');
const actualMatch = onboardingSource.match(/ONBOARDING_PASSWORD_ACTUAL\s*=\s*'([^']+)'/);
if (!actualMatch) {
  console.error('❌ ONBOARDING_PASSWORD_ACTUAL nicht in src/constants/onboarding.ts gefunden');
  process.exit(1);
}
const ONBOARDING_PASSWORD_ACTUAL = actualMatch[1];

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const users = new Users(client);

async function main() {
  console.log(`🚀 Onboarding-Reset ${DRY_RUN ? '(DRY-RUN — keine Änderungen)' : ''}${ONLY_NAME ? ` (nur "${ONLY_NAME}")` : ''}\n`);

  const result = await users.list();
  console.log(`ℹ️  ${result.users.length} User gefunden:\n`);
  for (const u of result.users) {
    const flags = [
      u.status ? 'aktiv' : 'DEAKTIVIERT',
      Array.isArray(u.labels) && u.labels.includes('admin') ? 'admin' : null,
      u.prefs?.mustChangePassword === true ? 'mustChangePassword' : null,
    ].filter(Boolean);
    console.log(`   • ${u.name} (${u.email}) [${flags.join(', ')}]`);
  }
  console.log('');

  for (const u of result.users) {
    const label = `${u.name} (${u.email})`;

    if (ONLY_NAME && u.name.toLowerCase() !== ONLY_NAME) {
      console.log(`SKIP ${label}: nicht in --only-Auswahl`);
      continue;
    }
    if (!u.status) {
      console.log(`SKIP ${label}: deaktiviert`);
      continue;
    }
    if (u.prefs?.mustChangePassword === true) {
      console.log(`SKIP ${label}: bereits auf Einmalpasswort (mustChangePassword gesetzt)`);
      continue;
    }

    // D12: Anzeigename "Roni" → "Ronald"
    if (u.name === 'Roni') {
      if (DRY_RUN) {
        console.log(`DRY  ${label}: würde in "Ronald" umbenannt`);
      } else {
        await users.updateName(u.$id, 'Ronald');
        console.log(`NEW  ${label}: umbenannt in "Ronald"`);
      }
    }

    if (DRY_RUN) {
      console.log(`DRY  ${label}: würde auf Einmalpasswort gesetzt + mustChangePassword`);
      continue;
    }

    await users.updatePassword(u.$id, ONBOARDING_PASSWORD_ACTUAL);
    await users.updatePrefs(u.$id, { ...(u.prefs ?? {}), mustChangePassword: true });
    console.log(`NEW  ${label}: Einmalpasswort gesetzt, Wechsel wird beim Login erzwungen`);
  }

  console.log(`\n✅ Fertig ${DRY_RUN ? '(Dry-Run — nichts geändert)' : '— Login ab jetzt mit 1220'}`);
}

main().catch((e) => {
  console.error('❌ Onboarding-Reset fehlgeschlagen:', e);
  process.exit(1);
});
