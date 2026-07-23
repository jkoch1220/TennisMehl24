/**
 * Setup für rollenbasierte Benutzerverwaltung + zentrales Audit-Log (idempotent).
 *
 * Legt an:
 *  - Collection `roles`            (lesen: alle User, schreiben: nur Label admin)
 *  - Collection `audit_log`        (erstellen: alle User, lesen: nur admin, ändern/löschen: niemand)
 *  - Collection `audit_log_archiv` (kein Client-Zugriff, nur API-Key — für Retention-Skript)
 *  - Erweiterung `user_permissions`: roleIds, allowOverride, denyOverride
 *  - 4 Preset-Rollen (Admin, Geschäftsführung, Produktionsleitung, Mitarbeiter)
 *    → nur wenn sie fehlen; bestehende (vom Admin angepasste) Rollen werden NIE überschrieben.
 *
 * Tool-IDs werden aus src/constants/tools.ts abgeleitet (kein hartkodiertes Enum).
 *
 * Aufruf:  node scripts/setup-roles-audit.mjs [--dry-run]
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

// ---------------------------------------------------------------------------
// Tool-IDs aus der kanonischen Registry ableiten
// ---------------------------------------------------------------------------
const toolsSource = readFileSync('src/constants/tools.ts', 'utf8');
const ALL_TOOL_IDS = [...toolsSource.matchAll(/^\s*id:\s*'([a-z0-9-]+)'/gm)].map((m) => m[1]);
if (ALL_TOOL_IDS.length < 30) {
  console.error(`❌ Nur ${ALL_TOOL_IDS.length} Tool-IDs in src/constants/tools.ts gefunden — Abbruch (Parsing-Problem?)`);
  process.exit(1);
}
console.log(`ℹ️  ${ALL_TOOL_IDS.length} Tools aus src/constants/tools.ts abgeleitet`);

const ALL_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];
// Wird in Phase 5 als eigenes Tool ergänzt (D13); Presets referenzieren es schon jetzt.
const AUDIT_TOOL_ID = 'audit-log';

const fullAccess = (toolIds) =>
  Object.fromEntries(toolIds.map((id) => [id, { enabled: true, actions: [...ALL_ACTIONS] }]));

// Sensible Felder Projekt-/Universal-Ansichten (D9)
const PROJEKT_HIDDEN_FIELDS = ['einkaufspreis', 'grosshaendlerPreisNetto', 'db1'];

const produktionsleitungPermissions = () => {
  const voll = ['produktion', 'schichtplanung', 'instandhaltung', 'dispo-planung', 'qualitaetssicherung', 'kalender', 'wiki', 'task-verwaltung'];
  const perms = fullAccess(voll.filter((id) => ALL_TOOL_IDS.includes(id)));
  perms['dashboard'] = { enabled: true, actions: ['view'] };
  perms['projekt-verwaltung'] = { enabled: true, actions: ['view'], hiddenFields: [...PROJEKT_HIDDEN_FIELDS] };
  return perms;
};

const mitarbeiterPermissions = () => ({
  dashboard: { enabled: true, actions: ['view'] },
  wiki: { enabled: true, actions: ['view', 'create', 'edit'] },
  kalender: { enabled: true, actions: ['view', 'create', 'edit'] },
  'task-verwaltung': { enabled: true, actions: ['view', 'create', 'edit'] },
  qualitaetssicherung: { enabled: true, actions: ['view'] },
  produktion: { enabled: true, actions: ['view', 'create'] },
});

const PRESET_ROLES = [
  {
    id: 'role-admin',
    name: 'Admin',
    description: 'Voller Zugriff auf alles inkl. Benutzer-/Rollenverwaltung und Audit-Log. Nicht löschbar.',
    isSystem: true,
    color: 'from-red-600 to-orange-600',
    icon: 'ShieldCheck',
    permissions: fullAccess([...ALL_TOOL_IDS, AUDIT_TOOL_ID]),
  },
  {
    id: 'role-geschaeftsfuehrung',
    name: 'Geschäftsführung',
    description: 'Alle fachlichen Tools inkl. Preise, Marge und Finanzen. Keine Rollen-/Benutzerverwaltung, kein Audit-Log.',
    isSystem: false,
    color: 'from-blue-600 to-indigo-600',
    icon: 'Briefcase',
    permissions: fullAccess(ALL_TOOL_IDS),
  },
  {
    id: 'role-produktionsleitung',
    name: 'Produktionsleitung',
    description: 'Produktion, Schichtplanung, Instandhaltung, Dispo, QS, Kalender, Wiki, Tasks. Projekte nur ansehen ohne Einkaufspreise/DB1.',
    isSystem: false,
    color: 'from-orange-500 to-amber-600',
    icon: 'Factory',
    permissions: produktionsleitungPermissions(),
  },
  {
    id: 'role-mitarbeiter',
    name: 'Mitarbeiter',
    description: 'Dashboard, Wiki, Kalender, Tasks, QS (ansehen), Produktion erfassen. Keine Preise, Marge oder Finanz-Tools.',
    isSystem: false,
    color: 'from-green-600 to-emerald-600',
    icon: 'Users',
    permissions: mitarbeiterPermissions(),
  },
];

// ---------------------------------------------------------------------------
// Helfer (idempotent, mit Dry-Run)
// ---------------------------------------------------------------------------
async function collectionExists(id) {
  try {
    await db.getCollection(DB, id);
    return true;
  } catch (e) {
    if (e.code === 404) return false;
    throw e;
  }
}

async function ensureCollection(id, name, permissions) {
  if (await collectionExists(id)) {
    console.log(`OK  Collection ${id} existiert bereits`);
    return false;
  }
  if (DRY_RUN) {
    console.log(`DRY Collection ${id} würde angelegt (${name})`);
    return true;
  }
  await db.createCollection(DB, id, name, permissions, false);
  console.log(`NEW Collection ${id} angelegt`);
  return true;
}

async function attributeExists(collectionId, key) {
  try {
    await db.getAttribute(DB, collectionId, key);
    return true;
  } catch (e) {
    if (e.code === 404) return false;
    throw e;
  }
}

async function ensureStringAttr(collectionId, key, size, required = false, array = false) {
  if (await attributeExists(collectionId, key)) {
    console.log(`OK  ${collectionId}.${key} existiert`);
    return;
  }
  if (DRY_RUN) {
    console.log(`DRY ${collectionId}.${key} würde angelegt (string ${size}${array ? '[]' : ''}${required ? ', required' : ''})`);
    return;
  }
  await db.createStringAttribute(DB, collectionId, key, size, required, undefined, array);
  console.log(`NEW ${collectionId}.${key}`);
  await sleep(400);
}

async function ensureBooleanAttr(collectionId, key, required = false, def = undefined) {
  if (await attributeExists(collectionId, key)) {
    console.log(`OK  ${collectionId}.${key} existiert`);
    return;
  }
  if (DRY_RUN) {
    console.log(`DRY ${collectionId}.${key} würde angelegt (boolean)`);
    return;
  }
  await db.createBooleanAttribute(DB, collectionId, key, required, def);
  console.log(`NEW ${collectionId}.${key}`);
  await sleep(400);
}

async function ensureIndex(collectionId, key, attributes) {
  try {
    if (DRY_RUN) {
      console.log(`DRY Index ${collectionId}.${key} würde angelegt [${attributes.join(', ')}]`);
      return;
    }
    await db.createIndex(DB, collectionId, key, 'key', attributes, attributes.map(() => 'ASC'));
    console.log(`NEW Index ${collectionId}.${key}`);
  } catch (e) {
    if (e.code === 409) console.log(`OK  Index ${collectionId}.${key} existiert`);
    else console.log(`ERR Index ${collectionId}.${key}: ${e.message}`);
  }
}

// Attribute einer Collection, bis alle 'available' sind (Appwrite legt asynchron an)
async function waitForAttributes(collectionId) {
  if (DRY_RUN) return;
  for (let i = 0; i < 30; i++) {
    const { attributes } = await db.listAttributes(DB, collectionId);
    if (attributes.every((a) => a.status === 'available')) return;
    await sleep(1000);
  }
  console.warn(`⚠️ ${collectionId}: Attribute nach 30s noch nicht alle verfügbar`);
}

async function documentExists(collectionId, id) {
  try {
    await db.getDocument(DB, collectionId, id);
    return true;
  } catch (e) {
    if (e.code === 404) return false;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------
async function main() {
  console.log(`🚀 Setup Rollen + Audit-Log ${DRY_RUN ? '(DRY-RUN — keine Änderungen)' : ''}\n`);

  // 1) roles
  console.log('— Collection roles —');
  const rolesCreated = await ensureCollection('roles', 'Rollen', [
    Permission.read(Role.users()),
    Permission.create(Role.label('admin')),
    Permission.update(Role.label('admin')),
    Permission.delete(Role.label('admin')),
  ]);
  if (!DRY_RUN || !rolesCreated) {
    await ensureStringAttr('roles', 'name', 200, true);
    await ensureStringAttr('roles', 'description', 1000);
    await ensureBooleanAttr('roles', 'isSystem', false, false);
    await ensureStringAttr('roles', 'color', 100);
    await ensureStringAttr('roles', 'icon', 50);
    await ensureStringAttr('roles', 'permissions', 100000);
    await ensureStringAttr('roles', 'erstelltVon', 255);
    await ensureStringAttr('roles', 'bearbeitetVon', 255);
    await ensureStringAttr('roles', 'bearbeitetVonName', 255);
    await ensureStringAttr('roles', 'bearbeitetAm', 50);
    await waitForAttributes('roles');
  } else {
    console.log('DRY Attribute für roles würden angelegt (name, description, isSystem, color, icon, permissions, erstellt-/bearbeitetVon/-Name/-Am)');
  }

  // 2) audit_log — create-only für User, lesen nur Admin, ändern/löschen niemand (nur API-Key)
  console.log('\n— Collection audit_log —');
  const AUDIT_ATTRS = async (coll, dryCreated) => {
    if (DRY_RUN && dryCreated) {
      console.log(`DRY Attribute für ${coll} würden angelegt (timestamp, userId, userName, action, entityType, entityId, summary, changes)`);
      return;
    }
    await ensureStringAttr(coll, 'timestamp', 50, true);
    await ensureStringAttr(coll, 'userId', 255, true);
    await ensureStringAttr(coll, 'userName', 255, true);
    await ensureStringAttr(coll, 'action', 50, true);
    await ensureStringAttr(coll, 'entityType', 100, true);
    await ensureStringAttr(coll, 'entityId', 255);
    await ensureStringAttr(coll, 'summary', 1000, true);
    await ensureStringAttr(coll, 'changes', 20000);
    await waitForAttributes(coll);
  };

  const auditCreated = await ensureCollection('audit_log', 'Audit-Log', [
    Permission.create(Role.users()),
    Permission.read(Role.label('admin')),
    // KEIN update/delete — Einträge sind aus Client-Sicht unveränderlich
  ]);
  await AUDIT_ATTRS('audit_log', auditCreated);
  if (!DRY_RUN) {
    await ensureIndex('audit_log', 'idx_timestamp', ['timestamp']);
    await ensureIndex('audit_log', 'idx_userId', ['userId']);
    await ensureIndex('audit_log', 'idx_entityType', ['entityType']);
    await ensureIndex('audit_log', 'idx_action', ['action']);
    await ensureIndex('audit_log', 'idx_entityId', ['entityId']);
  } else {
    console.log('DRY Indizes für audit_log würden angelegt (timestamp, userId, entityType, action, entityId)');
  }

  // 3) audit_log_archiv — kein Client-Zugriff (leere Permissions = nur API-Key)
  console.log('\n— Collection audit_log_archiv —');
  const archivCreated = await ensureCollection('audit_log_archiv', 'Audit-Log Archiv', []);
  await AUDIT_ATTRS('audit_log_archiv', archivCreated);

  // 4) user_permissions erweitern
  console.log('\n— Erweiterung user_permissions —');
  await ensureStringAttr('user_permissions', 'roleIds', 255, false, true);
  await ensureStringAttr('user_permissions', 'allowOverride', 100000);
  await ensureStringAttr('user_permissions', 'denyOverride', 100000);
  await waitForAttributes('user_permissions');

  // 5) Preset-Rollen (nur wenn fehlend — Admin-Anpassungen werden nie überschrieben)
  console.log('\n— Preset-Rollen —');
  for (const preset of PRESET_ROLES) {
    if (await documentExists('roles', preset.id)) {
      console.log(`OK  Rolle "${preset.name}" (${preset.id}) existiert — wird NICHT überschrieben`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`DRY Rolle "${preset.name}" (${preset.id}) würde angelegt: ${Object.keys(preset.permissions).length} Tools`);
      continue;
    }
    await db.createDocument(DB, 'roles', preset.id, {
      name: preset.name,
      description: preset.description,
      isSystem: preset.isSystem,
      color: preset.color,
      icon: preset.icon,
      permissions: JSON.stringify(preset.permissions),
      erstelltVon: 'setup-script',
      bearbeitetAm: new Date().toISOString(),
    });
    console.log(`NEW Rolle "${preset.name}" (${preset.id}) angelegt`);
  }

  console.log(`\n✅ Setup abgeschlossen ${DRY_RUN ? '(Dry-Run — nichts geändert)' : ''}`);
}

main().catch((e) => {
  console.error('❌ Setup fehlgeschlagen:', e);
  process.exit(1);
});
