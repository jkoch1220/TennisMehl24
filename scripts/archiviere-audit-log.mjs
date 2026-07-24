/**
 * Retention (D11): verschiebt Audit-Einträge, die älter als 2 Jahre sind,
 * von `audit_log` nach `audit_log_archiv` (Archiv: nur per API-Key lesbar).
 *
 * Idempotent: bereits archivierte Einträge werden anhand derselben Dokument-ID
 * erkannt (409 beim Archiv-Insert → Original trotzdem löschen).
 * Gelöscht wird IMMER erst nach erfolgreichem Archiv-Insert.
 *
 * Aufruf:  node scripts/archiviere-audit-log.mjs [--dry-run]
 * Empfehlung: 1× jährlich laufen lassen (oder als Cron).
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

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen in .env gesetzt sein');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new Databases(client);

const grenze = new Date();
grenze.setFullYear(grenze.getFullYear() - 2);
const GRENZE_ISO = grenze.toISOString();

const ATTRS = ['timestamp', 'userId', 'userName', 'action', 'entityType', 'entityId', 'summary', 'changes'];

async function main() {
  console.log(`🚀 Audit-Log-Archivierung ${DRY_RUN ? '(DRY-RUN — keine Änderungen)' : ''}`);
  console.log(`   Archiviert werden Einträge mit timestamp < ${GRENZE_ISO}\n`);

  let archiviert = 0;
  let uebersprungen = 0;

  // Immer die älteste Seite holen, bis nichts Altes mehr da ist
  for (;;) {
    const seite = await db.listDocuments(DB, 'audit_log', [
      Query.lessThan('timestamp', GRENZE_ISO),
      Query.orderAsc('timestamp'),
      Query.limit(100),
    ]);
    if (seite.documents.length === 0) break;

    for (const doc of seite.documents) {
      if (DRY_RUN) {
        console.log(`DRY  ${doc.timestamp} ${doc.userName}: ${doc.summary}`);
        archiviert++;
        continue;
      }
      const payload = Object.fromEntries(ATTRS.map((k) => [k, doc[k] ?? '']));
      try {
        // Gleiche Dokument-ID im Archiv → Wiederholungsläufe sind idempotent
        await db.createDocument(DB, 'audit_log_archiv', doc.$id, payload);
      } catch (e) {
        if (e?.code !== 409) throw e; // 409 = schon archiviert → nur noch löschen
        uebersprungen++;
      }
      await db.deleteDocument(DB, 'audit_log', doc.$id);
      archiviert++;
    }

    if (DRY_RUN) break; // im Dry-Run reicht die erste Seite als Vorschau (Rest analog)
  }

  console.log(
    `\n✅ Fertig: ${archiviert} Einträge ${DRY_RUN ? 'würden archiviert (erste 100 als Vorschau)' : 'archiviert'}` +
      (uebersprungen ? ` (${uebersprungen} waren bereits im Archiv)` : '')
  );
}

main().catch((e) => {
  console.error('❌ Archivierung fehlgeschlagen:', e);
  process.exit(1);
});
