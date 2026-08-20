/**
 * Einmalige Bereinigung der bestehenden Anfrage-Benachrichtigungen.
 *
 * Anfragen werden ausschließlich im Anfragen-Tool der Projektverwaltung
 * abgearbeitet. Das gleichnamige Duplikat unter `/anfragen` ist abgeschafft.
 * Bereits vorhandene Meldungen in der Collection `notifications` zeigen aber
 * noch auf die alte Route und stehen teils zu längst erledigten Vorgängen.
 * Dieses Skript zieht beides nach:
 *
 * 1. VERALTETE LINKS — `link: '/anfragen'` wird auf
 *    `/projekt-verwaltung?view=anfragen&anfrageId=<refId>` umgeschrieben.
 *    Ein Klick landet dann direkt auf dem gemeldeten Vorgang statt auf einer
 *    Liste (oder, vor dem Umbau, im falschen Tool).
 *
 * 2. ERLEDIGTES — Meldungen zu Anfragen, die abgearbeitet oder gar nicht mehr
 *    vorhanden sind, werden gelöscht. Eine Benachrichtigung ist ein
 *    Arbeitssignal, kein Archiv; die Historie steht in der Anfrage selbst.
 *    Neu entstehen können sie nicht — angelegt wird nur für `status: 'neu'`.
 *
 * Ab jetzt erledigt der Reconciliation-Cron (netlify/functions/notifications-generate)
 * Punkt 2 laufend. Dieses Skript ist für den Altbestand.
 *
 * Vorschau:   npx tsx scripts/bereinige-anfrage-notifications.ts --dry-run
 * Ausführen:  npx tsx scripts/bereinige-anfrage-notifications.ts
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY)');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const NOTIFICATIONS = 'notifications';
const ANFRAGEN = 'anfragen';

const dryRun = process.argv.includes('--dry-run');

// Deckungsgleich mit ANFRAGE_ERLEDIGT_STATUS in notifications-generate.ts
const ERLEDIGT_STATUS = [
  'angebot_erstellt',
  'angebot_versendet',
  'verarbeitet',
  'erledigt',
  'abgelehnt',
  'geloescht',
];

interface NotificationDoc {
  $id: string;
  refTyp: string;
  refId: string;
  link: string;
  nachricht?: string;
  erstelltAm?: string;
}

async function ladeAlle<T>(collectionId: string, queries: string[] = []): Promise<T[]> {
  const alle: T[] = [];
  let offset = 0;
  for (;;) {
    const res = await databases.listDocuments(DATABASE_ID, collectionId, [
      ...queries,
      Query.limit(100),
      Query.offset(offset),
    ]);
    alle.push(...(res.documents as unknown as T[]));
    if (res.documents.length < 100) break;
    offset += 100;
  }
  return alle;
}

const zielLink = (refId: string): string =>
  `/projekt-verwaltung?view=anfragen&anfrageId=${refId}`;

async function main() {
  console.log(`\n🔔 Anfrage-Benachrichtigungen bereinigen${dryRun ? ' (Vorschau)' : ''}\n`);

  const meldungen = await ladeAlle<NotificationDoc>(NOTIFICATIONS, [
    Query.equal('refTyp', ANFRAGEN),
  ]);
  console.log(`  ${meldungen.length} Anfrage-Meldung(en) gefunden\n`);
  if (meldungen.length === 0) return;

  // Status der referenzierten Anfragen holen (in 100er-Blöcken)
  const refIds = [...new Set(meldungen.map((m) => m.refId).filter(Boolean))];
  const status = new Map<string, string>();
  for (let i = 0; i < refIds.length; i += 100) {
    const block = refIds.slice(i, i + 100);
    const res = await databases.listDocuments(DATABASE_ID, ANFRAGEN, [
      Query.equal('$id', block),
      Query.limit(block.length),
    ]);
    res.documents.forEach((doc) => {
      status.set(doc.$id, (doc as unknown as { status?: string }).status || 'neu');
    });
  }

  let geloescht = 0;
  let verwaist = 0;
  let umgeschrieben = 0;
  let unveraendert = 0;

  for (const meldung of meldungen) {
    const s = meldung.refId ? status.get(meldung.refId) : undefined;
    // Kein Treffer -> Anfrage hart gelöscht, die Meldung zeigt ins Leere
    const istErledigt = s === undefined || ERLEDIGT_STATUS.includes(s);

    if (istErledigt) {
      const grund = s === undefined ? 'Anfrage nicht mehr vorhanden' : `Status '${s}'`;
      console.log(`  🗑️  ${meldung.$id} – ${grund}: ${meldung.nachricht?.substring(0, 50) || ''}`);
      if (!dryRun) {
        await databases.deleteDocument(DATABASE_ID, NOTIFICATIONS, meldung.$id);
      }
      geloescht++;
      if (s === undefined) verwaist++;
      continue;
    }

    const neuerLink = zielLink(meldung.refId);
    if (meldung.link === neuerLink) {
      unveraendert++;
      continue;
    }
    console.log(`  🔗 ${meldung.$id} – '${meldung.link}' → '${neuerLink}'`);
    if (!dryRun) {
      await databases.updateDocument(DATABASE_ID, NOTIFICATIONS, meldung.$id, { link: neuerLink });
    }
    umgeschrieben++;
  }

  console.log(
    `\n  ${geloescht} Meldung(en) ${dryRun ? 'zu löschen' : 'gelöscht'} (davon ${verwaist} verwaist)`
  );
  console.log(`  ${umgeschrieben} Link(s) ${dryRun ? 'umzuschreiben' : 'umgeschrieben'}`);
  console.log(`  ${unveraendert} bereits korrekt\n`);

  console.log(
    dryRun
      ? '👉 Vorschau beendet. Zum Ausführen ohne --dry-run starten.\n'
      : '✅ Bereinigung abgeschlossen.\n'
  );
}

main().catch((error) => {
  console.error('❌ Fehler:', error instanceof Error ? error.message : error);
  process.exit(1);
});
