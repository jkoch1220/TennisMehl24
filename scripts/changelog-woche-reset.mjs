/**
 * Arbeitsnachweis (/admin/mein-fortschritt) neu aufbauen:
 * leert die Collection und fuellt sie mit den Commits der letzten 7 Tage
 * plus manuell gepflegten Vorgaengen.
 *
 * Aufruf:
 *   node scripts/changelog-woche-reset.mjs --dry-run   # nur anzeigen + Backup
 *   node scripts/changelog-woche-reset.mjs             # wirklich schreiben
 */
import { readFileSync, writeFileSync } from 'fs';
import { Client, Databases, ID, Query } from 'node-appwrite';
import { execSync } from 'child_process';

const DRY_RUN = process.argv.includes('--dry-run');
// Nachtragen statt neu aufbauen: legt nur manuelle Eintraege an, die noch fehlen
const NUR_MANUELLE = process.argv.includes('--nur-manuelle');
const BACKUP_PATH =
  process.env.CHANGELOG_BACKUP ||
  '/private/tmp/claude-501/-Users-jkoch-Workspace-Tennismehl-GmbH/f26b4bec-6703-4d78-8ce9-049ef60bbc2a/scratchpad/admin-changelog-backup.json';

// .env laden
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

const DB = 'tennismehl24_db';
const COLLECTION = 'admin_changelog';

// Attributgrenzen aus scripts/ensure-changelog-attributes.mjs
const MAX_TITLE = 100;
const MAX_DESCRIPTION = 2000;

function clamp(text, max) {
  if (!text) return '';
  return text.length <= max ? text : text.substring(0, max - 1).trimEnd() + '…';
}

function getRecentCommits() {
  // \x1f trennt Felder, \x1e die Commits - Commit-Bodies enthalten Zeilenumbrueche
  const output = execSync('git log --since="7 days ago" --format="%H\x1f%aI\x1f%s\x1f%b\x1e"', {
    cwd: process.cwd(),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  return output
    .split('\x1e')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [hash, isoDate, subject, body = ''] = chunk.split('\x1f');
      return { hash, isoDate, subject, body };
    });
}

function inferCategory(message) {
  const lower = message.toLowerCase();
  if (lower.startsWith('fix')) return 'bugfix';
  if (lower.startsWith('feat')) return 'feature';
  if (lower.includes('infra') || lower.includes('docker') || lower.includes('deploy')) return 'infra';
  if (lower.includes('config') || lower.includes('env')) return 'config';
  return 'other';
}

// Commit-Body aufraeumen: Co-Authored-By-Zeilen raus, Zeilenumbrueche innerhalb
// eines Absatzes zusammenziehen (Git bricht bei 72 Zeichen um)
function cleanBody(body) {
  const ohneCoAuthor = body
    .split('\n')
    .filter((l) => !/^co-authored-by:/i.test(l.trim()))
    .join('\n')
    .trim();

  return ohneCoAuthor
    .split(/\n\s*\n/)
    .map((absatz) => {
      if (/^\s*[-*\d]/.test(absatz)) return absatz.trim(); // Listen behalten ihre Zeilen
      return absatz.replace(/\s*\n\s*/g, ' ').trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

// Manuelle Vorgaenge der Woche (keine Commits)
const MANUELLE_EINTRAEGE = [
  {
    title: 'Steuernummer angefragt',
    description:
      'Steuernummer angefragt. Rueckmeldung steht noch aus.\n\nOffen: Eingang der Steuernummer nachhalten.',
    category: 'other',
  },
  {
    title: 'WLAN-Vertrag: Absage aus Bonitaetsgruenden',
    description:
      'Um den WLAN-/Internetvertrag gekuemmert. Der Anbieter hat den Vertrag aus Bonitaetsgruenden abgelehnt.\n\nOffen: muss weiterverfolgt werden - alternativer Anbieter oder Klaerung der Bonitaetspruefung.',
    category: 'infra',
  },
  {
    title: '📞 Anfragen bearbeitet: 9 neue Vorgaenge, 6 Angebote versendet',
    description: `Eingegangene Anfragen bearbeitet, Kunden angelegt und Angebote erstellt.

Neu angelegte Vorgaenge:
- 03.08. TC Wiehl, Privatkunde
- 04.08. Tennisservice Teetzen, Tennisclub Umpfertal (Zubehoer)
- 05.08. SV BW Alstedde, Andreas Meinecke Tennisservice (Ober Roden)
- 07.08. Yuval Herr, DJK Mainaschaff (Nachbestellung + Zubehoer)

Davon 5 Angebote direkt versendet, dazu das Nachfassangebot an TSV 1914 Berlstedt/Neumark e.V. (Vorgang aus April) - zusammen 6 versendete Angebote.

Ausserdem 4 Altanfragen aus Mai und Juli gesichtet und geschlossen.

Offen: 3 neue Anfragen vom 04.-06.08. warten noch auf Bearbeitung.`,
    category: 'other',
  },
  {
    title: '🚚 Material verkauft: 4 Auftraege bestaetigt, 2 Rechnungen gestellt',
    description: `Aus Angeboten wurden verbindliche Auftraege und Rechnungen.

Auftragsbestaetigungen am 06.08. (Saisonangebote aus Februar):
- TC Utting
- ATSV Kirchseeon
- Cosima Indoor Tennis
- TSV Offingen

Rechnungen gestellt am 04.08.:
- RE-2026-0052 Wiener Parkclub
- RE-2026-0050 Christoph Krug (Shop #197)

Zahlungseingang verbucht: TC Oberhaid e. V.`,
    category: 'other',
  },
];

function manuellesDokument(eintrag) {
  return {
    type: 'manual',
    title: clamp(eintrag.title, MAX_TITLE),
    description: clamp(eintrag.description, MAX_DESCRIPTION),
    category: eintrag.category,
    commitHash: '',
    timestamp: new Date().toISOString(),
    createdBy: '',
  };
}

async function alleEintraege() {
  const alle = [];
  let cursor = null;
  for (;;) {
    const queries = [Query.limit(100), Query.orderDesc('$createdAt')];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await db.listDocuments(DB, COLLECTION, queries);
    alle.push(...res.documents);
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return alle;
}

async function run() {
  console.log(`📋 Arbeitsnachweis ${NUR_MANUELLE ? 'ergaenzen' : 'neu aufbauen'}${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  // Nachtrag-Modus: nur fehlende manuelle Eintraege anlegen, Bestand bleibt
  if (NUR_MANUELLE) {
    const vorhandeneTitel = new Set((await alleEintraege()).map((d) => d.title));
    const fehlend = MANUELLE_EINTRAEGE.filter((e) => !vorhandeneTitel.has(clamp(e.title, MAX_TITLE)));
    console.log(`✍️  Fehlende manuelle Eintraege: ${fehlend.length} von ${MANUELLE_EINTRAEGE.length}`);
    for (const eintrag of fehlend) {
      console.log(`   + ${eintrag.title}`);
      if (!DRY_RUN) await db.createDocument(DB, COLLECTION, ID.unique(), manuellesDokument(eintrag));
    }
    console.log(DRY_RUN ? '\n🔍 Dry Run beendet - nichts geschrieben.' : '\n✅ Fertig.');
    return;
  }

  // 1. Bestand sichern
  const bestand = await alleEintraege();
  writeFileSync(BACKUP_PATH, JSON.stringify(bestand, null, 2), 'utf-8');
  console.log(`💾 Backup: ${bestand.length} Eintraege -> ${BACKUP_PATH}`);
  for (const doc of bestand) {
    console.log(`   - ${(doc.timestamp || doc.$createdAt).substring(0, 10)}  ${doc.title}`);
  }

  // 2. Leeren
  console.log(`\n🗑️  Loesche ${bestand.length} Eintraege...`);
  if (!DRY_RUN) {
    for (const doc of bestand) {
      await db.deleteDocument(DB, COLLECTION, doc.$id);
    }
    console.log('   ✅ geleert');
  } else {
    console.log('   (uebersprungen)');
  }

  // 3. Commits der letzten 7 Tage
  const commits = getRecentCommits();
  console.log(`\n📦 Git-Commits der letzten 7 Tage: ${commits.length}`);

  // aeltester zuerst schreiben, damit die Reihenfolge nachvollziehbar bleibt
  for (const commit of [...commits].reverse()) {
    const payload = {
      type: 'auto',
      title: clamp(commit.subject, MAX_TITLE),
      description: clamp(cleanBody(commit.body) || commit.subject, MAX_DESCRIPTION),
      category: inferCategory(commit.subject),
      commitHash: commit.hash.substring(0, 7),
      timestamp: new Date(commit.isoDate).toISOString(), // echtes Commit-Datum, nicht "jetzt"
      createdBy: '',
    };
    console.log(`   ${payload.timestamp.substring(0, 10)}  ${payload.title}`);
    if (!DRY_RUN) await db.createDocument(DB, COLLECTION, ID.unique(), payload);
  }

  // 4. Manuelle Eintraege
  console.log(`\n✍️  Manuelle Eintraege: ${MANUELLE_EINTRAEGE.length}`);
  for (const eintrag of MANUELLE_EINTRAEGE) {
    const payload = manuellesDokument(eintrag);
    console.log(`   ${payload.timestamp.substring(0, 10)}  ${payload.title}`);
    if (!DRY_RUN) await db.createDocument(DB, COLLECTION, ID.unique(), payload);
  }

  console.log(
    `\n${DRY_RUN ? '🔍 Dry Run beendet - nichts geschrieben.' : '✅ Fertig: ' + (commits.length + MANUELLE_EINTRAEGE.length) + ' Eintraege.'}`
  );
}

run().catch((error) => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});
