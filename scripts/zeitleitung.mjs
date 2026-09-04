/**
 * Vergibt und entzieht das Appwrite-Label `zeitleitung`.
 *
 * Warum ein Label und keine Rolle: die Zeiterfassung wird serverseitig in
 * netlify/functions/zeiterfassung.ts durchgesetzt, und dort ist das Rollensystem
 * des Portals (Collection `roles` + `user_permissions` + Auflösungslogik) nicht
 * verfügbar. Labels stehen dagegen direkt am Account, den die Function ohnehin
 * per JWT lädt — sie sind damit die einzige Berechtigung, die der Server ohne
 * Nachbau der Rechte-Engine zuverlässig prüfen kann.
 *
 * Wer `zeitleitung` hat, darf: für andere Mitarbeiter stempeln, Zeiten nachtragen,
 * Stempel stornieren und die Zeiten aller Mitarbeiter einsehen. Das Label `admin`
 * schließt diese Rechte mit ein.
 *
 * Verwendung:
 *   node scripts/zeitleitung.mjs                      Übersicht aller Benutzer
 *   node scripts/zeitleitung.mjs --add <userId>       Label vergeben
 *   node scripts/zeitleitung.mjs --remove <userId>    Label entziehen
 *   ... zusätzlich --dry-run für eine Vorschau ohne Schreiben
 */

import { Client, Users } from 'node-appwrite';
import 'dotenv/config';

const LABEL = 'zeitleitung';

const DRY_RUN = process.argv.includes('--dry-run');
const addIdx = process.argv.indexOf('--add');
const removeIdx = process.argv.indexOf('--remove');
const addId = addIdx > -1 ? process.argv[addIdx + 1] : null;
const removeId = removeIdx > -1 ? process.argv[removeIdx + 1] : null;

const endpoint = process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ .env unvollständig: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY nötig.');
  process.exit(1);
}

const users = new Users(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

/** Zeigt alle Benutzer mit ihren Labels — die Vorlage zum Kopieren der User-ID. */
async function uebersicht() {
  const result = await users.list();
  console.log(`\n👥 ${result.total} Benutzerkonten:\n`);
  for (const u of result.users) {
    const labels = u.labels || [];
    const marker = labels.includes(LABEL) ? '⏱  ' : labels.includes('admin') ? '👑 ' : '   ';
    console.log(`${marker}${(u.name || '(ohne Namen)').padEnd(28)} ${u.$id}`);
    console.log(`   ${u.email}${labels.length ? `  ·  Labels: ${labels.join(', ')}` : ''}`);
  }
  console.log('\n👑 = Admin (hat die Rechte der Zeitleitung automatisch)');
  console.log('⏱  = Zeitleitung\n');
  console.log('Label vergeben:  node scripts/zeitleitung.mjs --add <userId>\n');
}

/** Setzt die Labels neu — updateLabels ersetzt die Liste, deshalb erst lesen. */
async function setzeLabel(userId, sollHaben) {
  let user;
  try {
    user = await users.get(userId);
  } catch {
    console.error(`❌ Kein Benutzer mit der ID ${userId} gefunden.`);
    process.exit(1);
  }

  const labels = user.labels || [];
  const hatBereits = labels.includes(LABEL);

  if (sollHaben && hatBereits) {
    console.log(`✓ ${user.name || user.email} hat "${LABEL}" bereits — nichts zu tun.`);
    return;
  }
  if (!sollHaben && !hatBereits) {
    console.log(`✓ ${user.name || user.email} hat "${LABEL}" nicht — nichts zu tun.`);
    return;
  }

  const neu = sollHaben ? [...labels, LABEL] : labels.filter((l) => l !== LABEL);

  if (DRY_RUN) {
    console.log(`🔍 DRY-RUN — würde Labels von ${user.name || user.email} setzen:`);
    console.log(`   vorher:  ${labels.join(', ') || '(keine)'}`);
    console.log(`   nachher: ${neu.join(', ') || '(keine)'}`);
    return;
  }

  await users.updateLabels(userId, neu);
  console.log(`✅ ${user.name || user.email}: Labels jetzt ${neu.join(', ') || '(keine)'}`);
  console.log('   Hinweis: der Benutzer muss sich neu anmelden, damit das Label in seiner Session ankommt.');
}

const modus = DRY_RUN ? '🔍 DRY-RUN — es wird nichts geschrieben' : '✏️  SCHREIBMODUS';

if (addId) {
  console.log(`${modus}  ·  Label "${LABEL}" vergeben\n`);
  await setzeLabel(addId, true);
} else if (removeId) {
  console.log(`${modus}  ·  Label "${LABEL}" entziehen\n`);
  await setzeLabel(removeId, false);
} else {
  await uebersicht();
}
