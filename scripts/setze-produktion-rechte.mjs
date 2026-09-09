/**
 * Staffelt die Rechte am Produktions-Tool auf die bestehenden Rollen.
 *
 *   Mitarbeiter          → erfasst alle drei Bereiche, sieht keine Auswertung,
 *                          keine Bestände, keine fremden Buchungen, darf nicht
 *                          stornieren (außer der eigenen Buchung von heute —
 *                          das regelt die Oberfläche, nicht das Rechtesystem)
 *   Produktionsleitung   → alles
 *   Geschäftsführung     → alles
 *   Admin                → alles (System-Rolle, wird nicht angefasst)
 *
 * Die Schlüssel unter `hiddenFields` entsprechen src/constants/sensitiveFields.ts;
 * ein Admin kann sie im Rollen-Editor jederzeit anders setzen. Dieses Skript
 * stellt nur den sinnvollen Ausgangszustand her.
 *
 * Idempotent: Es wird ausschließlich der Eintrag `produktion` in der jeweiligen
 * Rechte-Map ersetzt, alles andere bleibt unberührt.
 *
 * Ausführen:  node scripts/setze-produktion-rechte.mjs --dry-run
 *             node scripts/setze-produktion-rechte.mjs
 */

import 'dotenv/config';

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const dryRun = process.argv.includes('--dry-run');
const mock = process.argv.includes('--mock');
const databaseId = mock ? 'tennismehl24_db_mock' : 'tennismehl24_db';
const ROLES_COLLECTION = 'roles';

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY)');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

const VOLLZUGRIFF = {
  enabled: true,
  actions: ['view', 'create', 'edit', 'delete', 'export'],
};

const NUR_ERFASSEN = {
  enabled: true,
  actions: ['view', 'create'],
  hiddenFields: ['auswertung', 'lagerbestand', 'fremde-buchungen'],
};

const ZUWEISUNG = {
  'role-mitarbeiter': NUR_ERFASSEN,
  'role-produktionsleitung': VOLLZUGRIFF,
  'role-geschaeftsfuehrung': VOLLZUGRIFF,
};

async function main() {
  console.log(`\n🔐 Produktions-Rechte setzen (Datenbank: ${databaseId}${dryRun ? ', DRY-RUN' : ''})\n`);

  for (const [rolleId, rechte] of Object.entries(ZUWEISUNG)) {
    const res = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${ROLES_COLLECTION}/documents/${rolleId}`,
      { method: 'GET', headers }
    );

    if (!res.ok) {
      console.warn(`⚠️  Rolle ${rolleId} nicht gefunden (HTTP ${res.status}) — übersprungen`);
      continue;
    }

    const doc = await res.json();
    let map;
    try {
      map = JSON.parse(doc.permissions || '{}');
    } catch {
      console.error(`❌ Rolle ${rolleId}: permissions ist kein gültiges JSON — übersprungen`);
      continue;
    }

    const vorher = JSON.stringify(map.produktion ?? null);
    const nachher = JSON.stringify(rechte);
    if (vorher === nachher) {
      console.log(`ℹ️  ${doc.name}: bereits gesetzt`);
      continue;
    }

    console.log(`→ ${doc.name}`);
    console.log(`   vorher:  ${vorher}`);
    console.log(`   nachher: ${nachher}`);

    if (dryRun) continue;

    map.produktion = rechte;
    const update = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${ROLES_COLLECTION}/documents/${rolleId}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ data: { permissions: JSON.stringify(map) } }),
      }
    );

    if (update.ok) {
      console.log(`   ✅ gespeichert`);
    } else {
      const fehler = await update.json().catch(() => ({}));
      console.error(`   ❌ ${fehler.message ?? update.status}`);
    }
  }

  console.log(
    dryRun
      ? '\nℹ️  Dry-Run — es wurde nichts geschrieben.\n'
      : '\n✅ Fertig. Betroffene Nutzer müssen sich einmal neu anmelden, damit der Rechte-Cache neu lädt.\n'
  );
}

main().catch((fehler) => {
  console.error('\n❌ Abbruch:', fehler.message);
  process.exit(1);
});
