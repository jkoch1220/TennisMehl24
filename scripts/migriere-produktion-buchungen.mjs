/**
 * Überführt den alten Produktionsverlauf in die neue Collection.
 *
 * Quelle:  produktion_eintraege / produktion_verlauf  (ein Dokument, JSON-Feld)
 * Ziel:    produktion_buchungen                       (ein Dokument je Buchung)
 *
 * Alle Alt-Einträge sind Mahl-Buchungen — den Bereich gab es damals noch nicht.
 * Die alten Körnungen (fein / fein_grob / mittel / grob) beschreiben eine grobe
 * Feinheit, KEINE verkaufbare Körnung. Sie werden deshalb unverändert
 * übernommen und NICHT auf 0/2 oder 0/3 umgedeutet: eine geratene Zuordnung
 * wäre in der Auswertung schlimmer als ein ehrliches „Alt: Mittel".
 *
 * Der Lagerbestand wird NICHT angefasst — die Alt-Einträge haben ihn seinerzeit
 * bereits fortgeschrieben.
 *
 * Idempotent: bereits migrierte Buchungen werden anhand ihrer Alt-ID erkannt
 * (sie wird als Dokument-ID übernommen) und übersprungen.
 *
 * Ausführen:  node scripts/migriere-produktion-buchungen.mjs --dry-run
 *             node scripts/migriere-produktion-buchungen.mjs
 *   Sandbox:  node scripts/migriere-produktion-buchungen.mjs --mock
 */

import 'dotenv/config';

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const dryRun = process.argv.includes('--dry-run');
const mock = process.argv.includes('--mock');
const databaseId = mock ? 'tennismehl24_db_mock' : 'tennismehl24_db';

const QUELL_COLLECTION = 'produktion_eintraege';
const QUELL_DOKUMENT = 'produktion_verlauf';
const ZIEL_COLLECTION = 'produktion_buchungen';

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY)');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

const ALT_KOERNUNGEN = new Set(['fein', 'fein_grob', 'mittel', 'grob', '0-2', '0-3']);

/**
 * Appwrite-Dokument-IDs dürfen höchstens 36 Zeichen lang sein, müssen mit einem
 * Buchstaben oder einer Ziffer beginnen und nur [a-zA-Z0-9_-] enthalten. Die
 * alten IDs stammen aus ID.unique() und erfüllen das bereits; geprüft wird
 * trotzdem, sonst schlägt die Migration erst beim Schreiben fehl.
 */
const istGueltigeId = (id) => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,35}$/.test(id);

async function ladeAltbestand() {
  const res = await fetch(
    `${endpoint}/databases/${databaseId}/collections/${QUELL_COLLECTION}/documents/${QUELL_DOKUMENT}`,
    { method: 'GET', headers }
  );
  if (res.status === 404) {
    console.log('ℹ️  Kein Altbestand vorhanden — nichts zu migrieren.');
    return [];
  }
  if (!res.ok) {
    throw new Error(`Altbestand konnte nicht gelesen werden (HTTP ${res.status})`);
  }
  const doc = await res.json();
  const daten = JSON.parse(doc.data ?? '{"eintraege":[]}');
  return Array.isArray(daten.eintraege) ? daten.eintraege : [];
}

async function existiertBereits(id) {
  const res = await fetch(
    `${endpoint}/databases/${databaseId}/collections/${ZIEL_COLLECTION}/documents/${id}`,
    { method: 'GET', headers }
  );
  return res.ok;
}

async function schreibe(id, daten) {
  const res = await fetch(
    `${endpoint}/databases/${databaseId}/collections/${ZIEL_COLLECTION}/documents`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentId: id, data: daten }),
    }
  );
  if (res.ok) return true;
  const fehler = await res.json().catch(() => ({}));
  console.error(`❌ ${id}: ${fehler.message ?? res.status}`);
  return false;
}

async function main() {
  console.log(`\n📦 Produktionsverlauf migrieren (Datenbank: ${databaseId}${dryRun ? ', DRY-RUN' : ''})\n`);

  const eintraege = await ladeAltbestand();
  console.log(`Gefunden: ${eintraege.length} Alt-Einträge\n`);
  if (eintraege.length === 0) return;

  let geschrieben = 0;
  let uebersprungen = 0;
  let fehlerhaft = 0;
  let summe = 0;

  // Ältester zuerst, damit die Reihenfolge der Erstellung der Chronologie folgt.
  const sortiert = [...eintraege].sort((a, b) => (a.zeitpunkt ?? '').localeCompare(b.zeitpunkt ?? ''));

  for (const alt of sortiert) {
    const id = istGueltigeId(alt.id) ? alt.id : null;
    if (!id) {
      console.warn(`⚠️  Eintrag ohne brauchbare ID übersprungen: ${JSON.stringify(alt)}`);
      fehlerhaft++;
      continue;
    }

    if (!dryRun && (await existiertBereits(id))) {
      uebersprungen++;
      continue;
    }

    const koernung = ALT_KOERNUNGEN.has(alt.koernung) ? alt.koernung : null;
    const tonnen = Number(alt.tonnen);
    if (!Number.isFinite(tonnen) || tonnen <= 0) {
      console.warn(`⚠️  ${id}: unbrauchbare Menge (${alt.tonnen}) — übersprungen`);
      fehlerhaft++;
      continue;
    }

    const daten = {
      bereich: 'mahlen',
      datum: alt.datum,
      zeitpunkt: alt.zeitpunkt ?? `${alt.datum}T12:00:00.000+00:00`,
      tonnen,
      koernung,
      notiz: alt.notiz ?? null,
      quelle: 'migration',
      storniert: false,
    };

    summe += tonnen;

    if (dryRun) {
      console.log(`  → ${id}  ${daten.datum}  ${tonnen} t  ${koernung ?? '(ohne Körnung)'}`);
      geschrieben++;
      continue;
    }

    if (await schreibe(id, daten)) geschrieben++;
    else fehlerhaft++;
  }

  console.log(`\n${dryRun ? 'Würde schreiben' : 'Geschrieben'}: ${geschrieben}`);
  console.log(`Übersprungen (schon vorhanden): ${uebersprungen}`);
  console.log(`Fehlerhaft/ausgelassen: ${fehlerhaft}`);
  console.log(`Summe Tonnage: ${summe.toLocaleString('de-DE')} t`);
  console.log(
    dryRun
      ? '\nℹ️  Dry-Run — es wurde nichts geschrieben. Ohne --dry-run erneut ausführen.\n'
      : '\n✅ Migration abgeschlossen. Der Altbestand bleibt unangetastet als Sicherung stehen.\n'
  );
}

main().catch((fehler) => {
  console.error('\n❌ Abbruch:', fehler.message);
  process.exit(1);
});
