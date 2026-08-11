/**
 * Setzt in der SANDBOX bei allen Saisonkunden das Opt-in-Flag
 * `automatischesAngebot = true` („Massenangebots-tauglich").
 *
 * Damit lässt sich das Massen-Angebots-Tool mit voller Kundenzahl durchspielen,
 * statt nur mit den drei Kunden, die produktiv markiert sind.
 *
 * ⚠️ NUR für die Sandbox. Das Flag ist produktiv ein bewusstes Opt-in pro Kunde
 *    (siehe src/services/massenAngebotService.ts, Kopfkommentar) — es flächig zu
 *    setzen würde dort bedeuten, dass beim nächsten Lauf jeder Kunde ein Angebot
 *    bekommt. Der Guard unten lässt deshalb ausschließlich `_mock` als Ziel zu.
 *
 * Ausführen:
 *   npx tsx scripts/mock-alle-massenangebots-tauglich.ts --dry-run
 *   npx tsx scripts/mock-alle-massenangebots-tauglich.ts
 *   npx tsx scripts/mock-alle-massenangebots-tauglich.ts --zuruecksetzen
 */

import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const ZIEL_DB = 'tennismehl24_db_mock';
const TABELLE = 'saison_kunden';
const SEITE = 100;

const DRY_RUN = process.argv.includes('--dry-run');
/** Setzt das Flag zurück auf `false`, statt es zu setzen. */
const ZURUECKSETZEN = process.argv.includes('--zuruecksetzen');

/** Harter Guard — dieses Script darf die Produktion niemals berühren. */
function pruefeMockZiel(datenbankId: string): void {
  if (!datenbankId.endsWith('_mock')) {
    console.error(`\n🛑 ABBRUCH: Ziel "${datenbankId}" endet nicht auf "_mock".`);
    console.error('   Das Flag flächig zu setzen ist ausschließlich in der Sandbox zulässig.');
    process.exit(1);
  }
}

interface AppwriteFehler {
  message?: string;
}

async function api<T>(
  methode: 'GET' | 'PATCH',
  pfad: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; daten: T & AppwriteFehler }> {
  const antwort = await fetch(`${endpoint}${pfad}`, {
    method: methode,
    headers: {
      'X-Appwrite-Project': projectId as string,
      'X-Appwrite-Key': apiKey as string,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await antwort.text();
  return { ok: antwort.ok, status: antwort.status, daten: text ? JSON.parse(text) : {} };
}

interface Zeile {
  $id: string;
  data?: string;
  [feld: string]: unknown;
}

async function* leseAlleZeilen(): AsyncGenerator<Zeile[]> {
  let cursor: string | null = null;
  for (;;) {
    const q: Array<{ method: string; values: unknown[] }> = [{ method: 'limit', values: [SEITE] }];
    if (cursor) q.push({ method: 'cursorAfter', values: [cursor] });
    const qs = q.map((e) => `queries[]=${encodeURIComponent(JSON.stringify(e))}`).join('&');
    const res = await api<{ rows: Zeile[] }>('GET', `/tablesdb/${ZIEL_DB}/tables/${TABELLE}/rows?${qs}`);
    if (!res.ok) throw new Error(`Lesen fehlgeschlagen: ${res.daten.message}`);
    const zeilen = res.daten.rows ?? [];
    if (zeilen.length === 0) return;
    yield zeilen;
    if (zeilen.length < SEITE) return;
    cursor = zeilen[zeilen.length - 1].$id;
  }
}

async function main(): Promise<void> {
  pruefeMockZiel(ZIEL_DB);

  const zielwert = !ZURUECKSETZEN;
  console.log('═'.repeat(70));
  console.log('  MASSENANGEBOTS-FLAG IN DER SANDBOX SETZEN');
  console.log(`  Datenbank: ${ZIEL_DB}`);
  console.log(`  Setze:     automatischesAngebot = ${zielwert}`);
  if (DRY_RUN) console.log('  MODUS:     DRY-RUN (keine Änderungen)');
  console.log('═'.repeat(70));

  let gelesen = 0;
  let geaendert = 0;
  let schonRichtig = 0;
  let aktiv = 0;
  let ohneEmail = 0;
  const fehler: string[] = [];

  for await (const seite of leseAlleZeilen()) {
    for (const zeile of seite) {
      gelesen++;
      if (typeof zeile.data !== 'string') continue;

      let kunde: Record<string, unknown>;
      try {
        kunde = JSON.parse(zeile.data) as Record<string, unknown>;
      } catch {
        fehler.push(`${zeile.$id}: data ist kein gültiges JSON`);
        continue;
      }

      if (kunde.aktiv === true) aktiv++;
      const email = kunde.email;
      if (typeof email !== 'string' || email.trim() === '') ohneEmail++;

      if (kunde.automatischesAngebot === zielwert) {
        schonRichtig++;
        continue;
      }

      kunde.automatischesAngebot = zielwert;
      if (DRY_RUN) {
        geaendert++;
        continue;
      }

      pruefeMockZiel(ZIEL_DB);
      const res = await api('PATCH', `/tablesdb/${ZIEL_DB}/tables/${TABELLE}/rows/${zeile.$id}`, {
        data: { data: JSON.stringify(kunde) },
      });
      if (res.ok) geaendert++;
      else fehler.push(`${zeile.$id}: ${res.daten.message ?? res.status}`);
    }
    process.stdout.write('.');
  }

  console.log('\n\n' + '═'.repeat(70));
  console.log(`  Kunden gelesen:        ${gelesen}`);
  console.log(`  davon aktiv:           ${aktiv}`);
  console.log(`  Flag gesetzt:          ${geaendert}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`  war schon ${String(zielwert).padEnd(5)}:      ${schonRichtig}`);
  if (ohneEmail > 0) {
    console.log(`  ohne E-Mail-Adresse:   ${ohneEmail}  (erscheinen als „benötigen Prüfung")`);
  }
  if (fehler.length > 0) {
    console.log(`\n⚠️  ${fehler.length} Fehler:`);
    for (const f of fehler.slice(0, 5)) console.log(`    • ${f}`);
    if (fehler.length > 5) console.log(`    … und ${fehler.length - 5} weitere`);
  }
  console.log('═'.repeat(70));

  if (!DRY_RUN && zielwert) {
    console.log('\n⚠️  Ein Versandlauf über alle diese Kunden schickt im Mock-Modus');
    console.log('    JEDE einzelne Mail an die Testadresse — das können tausende sein.');
    console.log('    Im Tool „Stufenweise (Limit)" nutzen, um klein anzufangen.');
  }
}

main().catch((error) => {
  console.error('\n❌ Abbruch:', (error as Error).message);
  process.exit(1);
});
