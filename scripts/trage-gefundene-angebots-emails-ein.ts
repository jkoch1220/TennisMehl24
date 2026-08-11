/**
 * Trägt E-Mail-Adressen, die nur in Nebenquellen stehen, als Angebots-Verteiler
 * (`angebotsEmails`) bei den betroffenen Saisonkunden ein.
 *
 * Hintergrund: 1.240 Kunden haben weder `email` noch `rechnungsEmail` und sind
 * damit für Massen-Angebote nicht erreichbar. Für einen Teil von ihnen liegt
 * sehr wohl eine Adresse vor — nur an einer Stelle, die niemand als E-Mail-Feld
 * erwartet:
 *   • in den Mosaik-Migrationsdaten (`migration_kandidaten`), wo es gar kein
 *     E-Mail-Feld gibt; die Adressen stecken in `Kommunikation`, `Info` und
 *     gelegentlich in `Telefax`, `Straße` oder `Bankkontoinhaber`
 *   • bei einem Ansprechpartner im Portal (`saison_ansprechpartner`)
 *
 * Deshalb sucht dieses Skript nicht nach Feldnamen, sondern nach dem
 * `@`-Muster über alle Felder.
 *
 * Ausführen:
 *   npx tsx scripts/trage-gefundene-angebots-emails-ein.ts --dry-run
 *   npx tsx scripts/trage-gefundene-angebots-emails-ein.ts               # nur Sandbox
 *   npx tsx scripts/trage-gefundene-angebots-emails-ein.ts --produktion  # auch Produktion
 *
 * Die Produktion wird NUR mit ausdrücklichem `--produktion` angefasst — ohne
 * das Flag ist das Ziel ausschließlich die Sandbox. Idempotent: bereits
 * eingetragene Adressen werden nicht dupliziert.
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

const PRODUKTIONS_DB = 'tennismehl24_db';
const MOCK_DB = 'tennismehl24_db_mock';
const SEITE = 100;

const DRY_RUN = process.argv.includes('--dry-run');
const MIT_PRODUKTION = process.argv.includes('--produktion');

/** Die Quelle für die Suche ist immer die Produktion — dort ist der Datenstand echt. */
const QUELL_DB = PRODUKTIONS_DB;

const ZIELE: string[] = MIT_PRODUKTION ? [MOCK_DB, PRODUKTIONS_DB] : [MOCK_DB];

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

async function ladeAlle(datenbankId: string, tabelle: string): Promise<Zeile[]> {
  const raus: Zeile[] = [];
  let cursor: string | null = null;
  for (;;) {
    const q: Array<{ method: string; values: unknown[] }> = [{ method: 'limit', values: [SEITE] }];
    if (cursor) q.push({ method: 'cursorAfter', values: [cursor] });
    const qs = q.map((e) => `queries[]=${encodeURIComponent(JSON.stringify(e))}`).join('&');
    const res = await api<{ rows: Zeile[] }>('GET', `/tablesdb/${datenbankId}/tables/${tabelle}/rows?${qs}`);
    if (!res.ok) throw new Error(`Lesen ${tabelle}: ${res.daten.message}`);
    const zeilen = res.daten.rows ?? [];
    if (zeilen.length === 0) break;
    raus.push(...zeilen);
    if (zeilen.length < SEITE) break;
    cursor = zeilen[zeilen.length - 1].$id;
  }
  return raus;
}

const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function findeMails(wert: unknown): string[] {
  if (typeof wert !== 'string') return [];
  return (wert.match(MAIL) ?? []).map((m) => m.toLowerCase());
}

/**
 * Liefert ein Objekt — egal ob der Wert ein JSON-String oder bereits ein
 * geparstes Objekt ist.
 *
 * Beides kommt vor: `zeile.data` ist ein String, `daten.rohdaten` innerhalb
 * davon ist nach dem Parsen ein Objekt. Eine Variante, die nur Strings
 * akzeptiert, hätte die Mosaik-Rohdaten stillschweigend übersprungen — und
 * genau dort stehen die meisten Adressen.
 */
function alsObjekt(roh: unknown): Record<string, unknown> {
  if (roh && typeof roh === 'object' && !Array.isArray(roh)) {
    return roh as Record<string, unknown>;
  }
  if (typeof roh !== 'string') return {};
  try {
    const geparst = JSON.parse(roh) as unknown;
    return geparst && typeof geparst === 'object' ? (geparst as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  console.log('═'.repeat(70));
  console.log('  GEFUNDENE E-MAILS ALS ANGEBOTS-VERTEILER EINTRAGEN');
  console.log(`  Quelle der Suche: ${QUELL_DB} (nur lesend)`);
  console.log(`  Ziel(e):          ${ZIELE.join(', ')}`);
  if (!MIT_PRODUKTION) console.log('                    (--produktion nicht gesetzt → Produktion bleibt unberührt)');
  if (DRY_RUN) console.log('  MODUS:            DRY-RUN (keine Änderungen)');
  console.log('═'.repeat(70));

  // --- Nebenquelle 1: Mosaik-Migrationsdaten ---
  const nachKunde = new Map<string, Set<string>>();
  for (const zeile of await ladeAlle(QUELL_DB, 'migration_kandidaten')) {
    const kundeId = typeof zeile.matchKundeId === 'string' ? zeile.matchKundeId : '';
    if (!kundeId) continue;
    const daten = alsObjekt(zeile.data);
    const treffer = new Set<string>();

    for (const wert of Object.values(alsObjekt(daten.rohdaten))) {
      findeMails(wert).forEach((m) => treffer.add(m));
    }
    // Alle Felder durchsuchen, nicht nur die naheliegenden: im alten ERP stehen
    // Adressen auch in Telefax, Straße oder Bankkontoinhaber.
    for (const ap of (daten.ansprechpartner as unknown[]) ?? []) {
      if (!ap || typeof ap !== 'object') continue;
      for (const wert of Object.values(ap as Record<string, unknown>)) {
        findeMails(wert).forEach((m) => treffer.add(m));
      }
    }
    findeMails(JSON.stringify(daten.subAdressen ?? '')).forEach((m) => treffer.add(m));

    if (treffer.size > 0) {
      const vorhanden = nachKunde.get(kundeId) ?? new Set<string>();
      treffer.forEach((m) => vorhanden.add(m));
      nachKunde.set(kundeId, vorhanden);
    }
  }
  console.log(`\n🔎 Mosaik: Adressen für ${nachKunde.size} Kunden gefunden.`);

  // --- Nebenquelle 2: Ansprechpartner im Portal ---
  let apKunden = 0;
  for (const zeile of await ladeAlle(QUELL_DB, 'saison_ansprechpartner')) {
    const daten = alsObjekt(zeile.data);
    const kundeId =
      (typeof daten.kundeId === 'string' && daten.kundeId) ||
      (typeof zeile.kundeId === 'string' && zeile.kundeId) ||
      '';
    if (!kundeId) continue;
    // Auch hier alle Felder: Adressen landen erfahrungsgemäß gern im Notiz-
    // oder Telefonfeld statt im dafür vorgesehenen.
    const mails = [...new Set(Object.values(daten).flatMap((wert) => findeMails(wert)))];
    if (mails.length === 0) continue;
    const vorhanden = nachKunde.get(kundeId) ?? new Set<string>();
    if (!nachKunde.has(kundeId)) apKunden++;
    mails.forEach((m) => vorhanden.add(m));
    nachKunde.set(kundeId, vorhanden);
  }
  console.log(`🔎 Ansprechpartner: ${apKunden} weitere Kunden mit Adresse.`);

  // --- Betroffene bestimmen: nur Kunden OHNE eigene E-Mail ---
  const kunden = await ladeAlle(QUELL_DB, 'saison_kunden');
  const nachzutragen = new Map<string, string[]>();
  for (const kunde of kunden) {
    const daten = alsObjekt(kunde.data);
    const hatEigene =
      (typeof daten.email === 'string' && daten.email.trim() !== '') ||
      (typeof daten.rechnungsEmail === 'string' && daten.rechnungsEmail.trim() !== '');
    if (hatEigene) continue;
    const gefunden = nachKunde.get(kunde.$id);
    if (gefunden && gefunden.size > 0) nachzutragen.set(kunde.$id, [...gefunden].sort());
  }
  const adressen = [...nachzutragen.values()].reduce((s, l) => s + l.length, 0);
  console.log(`\n📋 ${nachzutragen.size} Kunden ohne eigene E-Mail, für die ${adressen} Adressen vorliegen.\n`);

  // Vollständige Auflistung: Wer die Adressen später prüfen will, braucht die
  // Namen — Kunden-IDs allein helfen niemandem.
  const namen = new Map<string, string>();
  for (const kunde of kunden) {
    const d = alsObjekt(kunde.data);
    namen.set(kunde.$id, typeof d.name === 'string' ? d.name : kunde.$id);
  }
  for (const [kundeId, mails] of nachzutragen) {
    console.log(`   ${(namen.get(kundeId) ?? kundeId).slice(0, 38).padEnd(40)} ${mails.join(', ')}`);
  }
  console.log('');

  // --- Eintragen ---
  for (const zielDb of ZIELE) {
    const istProduktion = zielDb === PRODUKTIONS_DB;
    console.log(`${istProduktion ? '⚠️  PRODUKTION' : '🧪 SANDBOX   '}  ${zielDb}`);

    let gesetzt = 0;
    let unveraendert = 0;
    let fehlt = 0;
    const fehler: string[] = [];

    for (const [kundeId, mails] of nachzutragen) {
      const res = await api<Zeile>('GET', `/tablesdb/${zielDb}/tables/saison_kunden/rows/${kundeId}`);
      if (!res.ok) {
        fehlt++;
        continue;
      }
      const daten = alsObjekt(res.daten.data);
      const bisher = Array.isArray(daten.angebotsEmails)
        ? (daten.angebotsEmails as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
      const zusammen = [...new Set([...bisher.map((m) => m.toLowerCase()), ...mails])].sort();

      if (zusammen.length === bisher.length && zusammen.every((m, i) => m === bisher[i])) {
        unveraendert++;
        continue;
      }
      if (DRY_RUN) {
        gesetzt++;
        continue;
      }

      daten.angebotsEmails = zusammen;
      const schreib = await api('PATCH', `/tablesdb/${zielDb}/tables/saison_kunden/rows/${kundeId}`, {
        data: { data: JSON.stringify(daten) },
      });
      if (schreib.ok) gesetzt++;
      else fehler.push(`${kundeId}: ${schreib.daten.message ?? schreib.status}`);
    }

    console.log(`     eingetragen: ${gesetzt}${DRY_RUN ? ' (dry-run)' : ''}`);
    if (unveraendert > 0) console.log(`     schon aktuell: ${unveraendert}`);
    if (fehlt > 0) console.log(`     Kunde dort nicht vorhanden: ${fehlt}`);
    for (const f of fehler.slice(0, 5)) console.log(`     ✗ ${f}`);
    console.log('');
  }

  console.log('═'.repeat(70));
  if (!MIT_PRODUKTION) {
    console.log('Produktion wurde NICHT verändert. Für sie: --produktion anhängen.');
  }
  console.log('═'.repeat(70));
}

main().catch((error) => {
  console.error('\n❌ Abbruch:', (error as Error).message);
  process.exit(1);
});
