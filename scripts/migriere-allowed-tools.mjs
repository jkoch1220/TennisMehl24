/**
 * Migriert bestehende per-User-Tool-Whitelists (user_permissions.allowedTools)
 * in das neue Override-Format (allowOverride) — §7.2 der Rollen-Spezifikation.
 *
 * Regeln (idempotent):
 *  - allowedTools = null           → nichts zu tun (Legacy-Fallback: alles erlaubt, bis Rollen zugewiesen sind)
 *  - allowedTools = [...]          → allowOverride = { toolId: { enabled, actions: alle 5 } }
 *  - allowOverride bereits gesetzt → übersprungen (kein Überschreiben)
 *  - roleIds bereits zugewiesen    → übersprungen (Rollen haben Vorrang, Migration unnötig)
 *  - allowedTools bleibt als Legacy-Feld erhalten (D2, Rückwärtskompatibilität)
 *
 * Aufruf:  node scripts/migriere-allowed-tools.mjs [--dry-run]
 */
import { readFileSync } from 'fs';
import { Client, Databases, Query } from 'node-appwrite';

const DRY_RUN = process.argv.includes('--dry-run');

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = env.APPWRITE_API_KEY;
const DB = 'tennismehl24_db';
const COLLECTION = 'user_permissions';

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen in .env gesetzt sein');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new Databases(client);

const ALL_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];

async function main() {
  console.log(`🚀 Migration allowedTools → allowOverride ${DRY_RUN ? '(DRY-RUN — keine Änderungen)' : ''}\n`);

  const { documents } = await db.listDocuments(DB, COLLECTION, [Query.limit(500)]);
  console.log(`ℹ️  ${documents.length} user_permissions-Dokumente gefunden\n`);

  let migrated = 0;
  for (const doc of documents) {
    const label = `${doc.userId} (${doc.$id})`;

    if (Array.isArray(doc.roleIds) && doc.roleIds.length > 0) {
      console.log(`SKIP ${label}: hat bereits Rollen [${doc.roleIds.join(', ')}]`);
      continue;
    }
    if (doc.allowOverride) {
      console.log(`SKIP ${label}: allowOverride bereits gesetzt`);
      continue;
    }
    if (!Array.isArray(doc.allowedTools)) {
      console.log(`SKIP ${label}: allowedTools = null (alle Tools, Legacy-Fallback greift)`);
      continue;
    }

    const override = Object.fromEntries(
      doc.allowedTools.map((toolId) => [toolId, { enabled: true, actions: [...ALL_ACTIONS] }])
    );

    if (DRY_RUN) {
      console.log(`DRY  ${label}: würde allowOverride mit ${doc.allowedTools.length} Tools setzen [${doc.allowedTools.join(', ')}]`);
      migrated++;
      continue;
    }

    await db.updateDocument(DB, COLLECTION, doc.$id, {
      allowOverride: JSON.stringify(override),
      updatedBy: 'migriere-allowed-tools',
      updatedAt: new Date().toISOString(),
    });
    console.log(`NEW  ${label}: allowOverride gesetzt (${doc.allowedTools.length} Tools)`);
    migrated++;
  }

  console.log(`\n✅ Fertig: ${migrated} Dokument(e) ${DRY_RUN ? 'würden migriert' : 'migriert'}`);
}

main().catch((e) => {
  console.error('❌ Migration fehlgeschlagen:', e);
  process.exit(1);
});
