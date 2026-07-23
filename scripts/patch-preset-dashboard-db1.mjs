/**
 * Einmaliger Patch: versteckt die Dashboard-DB1-Kennzahlen (hiddenFields: ['db1'])
 * in den Preset-Rollen Produktionsleitung und Mitarbeiter — idempotent.
 *
 * Aufruf:  node scripts/patch-preset-dashboard-db1.mjs [--dry-run]
 */
import { readFileSync } from 'fs';
import { Client, Databases } from 'node-appwrite';

const DRY_RUN = process.argv.includes('--dry-run');

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const db = new Databases(client);

for (const roleId of ['role-produktionsleitung', 'role-mitarbeiter']) {
  const doc = await db.getDocument('tennismehl24_db', 'roles', roleId);
  const perms = JSON.parse(doc.permissions || '{}');
  if (!perms.dashboard) {
    console.log(`SKIP ${roleId}: kein dashboard-Eintrag`);
    continue;
  }
  const hidden = perms.dashboard.hiddenFields ?? [];
  if (hidden.includes('db1')) {
    console.log(`OK  ${roleId}: dashboard.db1 bereits versteckt`);
    continue;
  }
  perms.dashboard.hiddenFields = [...hidden, 'db1'];
  if (DRY_RUN) {
    console.log(`DRY ${roleId}: würde dashboard.hiddenFields=['db1'] setzen`);
    continue;
  }
  await db.updateDocument('tennismehl24_db', 'roles', roleId, {
    permissions: JSON.stringify(perms),
    bearbeitetVon: 'patch-script',
    bearbeitetAm: new Date().toISOString(),
  });
  console.log(`NEW ${roleId}: dashboard.db1 versteckt`);
}
console.log('✅ Fertig');
