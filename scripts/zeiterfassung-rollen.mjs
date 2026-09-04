/**
 * Schaltet das Tool `zeiterfassung` in bestehenden Rollen frei.
 *
 * Warum es dieses Skript braucht: Rollen sind Momentaufnahmen. `setup-roles-audit.mjs`
 * leitet die Tool-Liste zwar aus tools.ts ab, überschreibt vorhandene Rollen aber
 * bewusst NIE (dort Zeile 296-299). Ein neu angelegtes Tool taucht deshalb in keiner
 * bestehenden Rolle auf.
 *
 * Praktische Folge ohne diesen Schritt: Benutzer mit zugewiesenen Rollen sehen die
 * Zeiterfassung nicht — ausgerechnet die Produktionsleitung, für die sie gebaut ist.
 * (Benutzer ganz OHNE Rolle sehen dagegen alles, weil `legacyAllowedTools === null`
 * auf Vollzugriff auflöst — siehe src/services/permissionResolution.ts:92-94.)
 *
 * Verwendung:
 *   node scripts/zeiterfassung-rollen.mjs --dry-run     Vorschau
 *   node scripts/zeiterfassung-rollen.mjs               Schreiben
 *   ... zusätzlich --mock für die Sandbox-Datenbank
 */

import { Client, Databases, Query } from 'node-appwrite';
import { readFileSync } from 'fs';

const TOOL_ID = 'zeiterfassung';
const ROLES_COLLECTION = 'roles';

const DRY_RUN = process.argv.includes('--dry-run');
const MOCK = process.argv.includes('--mock');

// Muss zu MOCK_DATABASE_ID / PRODUKTIONS_DATABASE_ID aus src/config/appwriteEnv.ts passen.
// Als Node-Skript kann diese Datei den TS-Proxy nicht nutzen.
const DB = MOCK ? 'tennismehl24_db_mock' : 'tennismehl24_db';

/**
 * Welche Rolle welche Rechte auf die Zeiterfassung bekommt.
 *
 * Wichtig: `edit` ist hier NICHT das Recht, fremde Zeiten zu ändern. Das entscheidet
 * allein die Netlify-Function anhand der Appwrite-Labels `admin`/`zeitleitung`
 * (siehe scripts/zeitleitung.mjs). Die Rolle steuert nur, ob das Tool im Portal
 * überhaupt erscheint und ob die Bedienelemente sichtbar sind.
 */
const ZUWEISUNGEN = {
  'role-admin': ['view', 'create', 'edit', 'delete', 'export'],
  'role-geschaeftsfuehrung': ['view', 'create', 'edit', 'export'],
  'role-produktionsleitung': ['view', 'create', 'edit', 'export'],
  // Mitarbeiter dürfen sich selbst stempeln und ihren Monat ansehen — mehr nicht.
  'role-mitarbeiter': ['view', 'create'],
};

const env = {};
try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  console.error('❌ .env nicht lesbar. Skript im Projektverzeichnis ausführen.');
  process.exit(1);
}

const endpoint = env.VITE_APPWRITE_ENDPOINT || env.APPWRITE_ENDPOINT;
const projectId = env.VITE_APPWRITE_PROJECT_ID || env.APPWRITE_PROJECT_ID;
const apiKey = env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ .env unvollständig: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY nötig.');
  process.exit(1);
}

const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

console.log(`\n${DRY_RUN ? '🔍 DRY-RUN — es wird nichts geschrieben' : '✏️  SCHREIBMODUS'}  ·  Datenbank: ${DB}`);
console.log(`   Tool: ${TOOL_ID}\n`);

const rollen = await db.listDocuments(DB, ROLES_COLLECTION, [Query.limit(100)]);

if (rollen.total === 0) {
  console.error('❌ Keine Rollen gefunden. Zuerst "node scripts/setup-roles-audit.mjs" ausführen.');
  process.exit(1);
}

let geaendert = 0;
let uebersprungen = 0;

for (const rolle of rollen.documents) {
  const gewuenscht = ZUWEISUNGEN[rolle.$id];
  if (!gewuenscht) {
    console.log(`⏭️  ${rolle.name} (${rolle.$id}) — nicht in der Zuweisungsliste, bleibt unverändert`);
    uebersprungen++;
    continue;
  }

  let permissions;
  try {
    permissions = JSON.parse(rolle.permissions || '{}');
  } catch {
    console.error(`❌ ${rolle.name}: permissions ist kein gültiges JSON — übersprungen, bitte manuell prüfen.`);
    uebersprungen++;
    continue;
  }

  const vorhanden = permissions[TOOL_ID];
  if (vorhanden && vorhanden.enabled && gewuenscht.every((a) => (vorhanden.actions || []).includes(a))) {
    console.log(`✓  ${rolle.name} — hat "${TOOL_ID}" bereits (${(vorhanden.actions || []).join(', ')})`);
    uebersprungen++;
    continue;
  }

  permissions[TOOL_ID] = { enabled: true, actions: [...gewuenscht] };

  if (DRY_RUN) {
    console.log(`🔍 ${rolle.name} — würde "${TOOL_ID}" ergänzen: ${gewuenscht.join(', ')}`);
    geaendert++;
    continue;
  }

  await db.updateDocument(DB, ROLES_COLLECTION, rolle.$id, {
    permissions: JSON.stringify(permissions),
  });
  console.log(`✅ ${rolle.name} — "${TOOL_ID}" ergänzt: ${gewuenscht.join(', ')}`);
  geaendert++;
}

console.log(`\n${geaendert} Rolle(n) ${DRY_RUN ? 'zu ändern' : 'geändert'}, ${uebersprungen} unverändert.`);
if (!DRY_RUN && geaendert > 0) {
  console.log('Hinweis: Betroffene Benutzer sehen das Tool erst nach einem Neuladen des Portals.');
}
if (!MOCK) {
  console.log('Für die Sandbox zusätzlich mit --mock ausführen.\n');
}
