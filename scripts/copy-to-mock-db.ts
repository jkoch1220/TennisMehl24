/**
 * Kopiert die Produktionsdaten in die Sandbox-Datenbank `tennismehl24_db_mock`.
 *
 * Die Quelle wird AUSSCHLIESSLICH gelesen. Geschrieben und gelöscht wird nur in
 * einer Datenbank, deren ID auf `_mock` endet — das prüft pruefeMockZiel() vor
 * jeder schreibenden Operation, und kein Flag kann diesen Guard umgehen.
 *
 * Voraussetzung: `npx tsx scripts/mock-db-setup.ts` (Schema + Buckets).
 *
 * Ausführen:
 *   npx tsx scripts/copy-to-mock-db.ts
 *   npx tsx scripts/copy-to-mock-db.ts --dry-run          nur zählen, nichts schreiben
 *   npx tsx scripts/copy-to-mock-db.ts --only=projekte    einzelne Tabelle
 *   npx tsx scripts/copy-to-mock-db.ts --wipe-target      Sandbox vorher leeren
 *   npx tsx scripts/copy-to-mock-db.ts --with-storage     Dateien mitkopieren (langsam)
 *   npx tsx scripts/copy-to-mock-db.ts --nur-verweise-kappen   nur Dateiverweise leeren
 *
 * ---------------------------------------------------------------------------
 * WARUM DIE $id ERHALTEN BLEIBEN MUSS
 *
 * Das Datenmodell verknüpft über IDs in Feldern (kundeId, projektId, dateiId …),
 * nicht über Appwrite-Relationships. Würde die Kopie neue IDs vergeben, wären
 * sämtliche Verweise gebrochen: Projekte ohne Kunde, Dokumente ohne Projekt.
 * Deshalb wird die `$id` beim Schreiben explizit als rowId übergeben.
 * ---------------------------------------------------------------------------
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

const QUELL_DB = 'tennismehl24_db';
const ZIEL_DB = 'tennismehl24_db_mock';
const BUCKET_PRAEFIX = 'mock_';
const SEITE = 100;

const DRY_RUN = process.argv.includes('--dry-run');
const WIPE = process.argv.includes('--wipe-target');
const MIT_STORAGE = process.argv.includes('--with-storage');
const NUR = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
/** Nur die Dateiverweise kappen, ohne neu zu kopieren (für eine bestehende Sandbox). */
const NUR_VERWEISE = process.argv.includes('--nur-verweise-kappen');

/** Harter Wipe-Guard — siehe Kopfkommentar. */
function pruefeMockZiel(datenbankId: string): void {
  if (!datenbankId.endsWith('_mock')) {
    console.error(`\n🛑 ABBRUCH: Ziel "${datenbankId}" endet nicht auf "_mock".`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// REST-Helfer
// ---------------------------------------------------------------------------

interface AppwriteFehler {
  message?: string;
}

async function api<T>(
  methode: 'GET' | 'POST' | 'DELETE' | 'PATCH',
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

const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function query(...eintraege: Array<{ method: string; values: unknown[] }>): string {
  return eintraege.map((e) => `queries[]=${encodeURIComponent(JSON.stringify(e))}`).join('&');
}

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

interface Zeile {
  $id: string;
  [feld: string]: unknown;
}

interface Tabelle {
  $id: string;
  rowSecurity: boolean;
}

/**
 * Appwrite-System-Felder. Sie werden vom Server vergeben und dürfen nicht im
 * Daten-Payload stehen — sonst weist Appwrite die Zeile als "unknown attribute"
 * zurück. Die `$id` wird separat als rowId übergeben, nicht als Feld.
 */
const SYSTEM_FELDER = new Set([
  '$id',
  '$createdAt',
  '$updatedAt',
  '$permissions',
  '$databaseId',
  '$collectionId',
  '$tableId',
  '$sequence',
]);

function nutzdaten(zeile: Zeile): Record<string, unknown> {
  const raus: Record<string, unknown> = {};
  for (const [schluessel, wert] of Object.entries(zeile)) {
    if (SYSTEM_FELDER.has(schluessel)) continue;
    raus[schluessel] = wert;
  }
  return raus;
}

// ---------------------------------------------------------------------------
// Lesen (Cursor-Pagination — Offset bricht bei großen Tabellen)
// ---------------------------------------------------------------------------

async function* leseAlleZeilen(datenbankId: string, tabellenId: string): AsyncGenerator<Zeile[]> {
  let cursor: string | null = null;
  for (;;) {
    const q: Array<{ method: string; values: unknown[] }> = [{ method: 'limit', values: [SEITE] }];
    if (cursor) q.push({ method: 'cursorAfter', values: [cursor] });

    const res = await api<{ rows: Zeile[]; total: number }>(
      'GET',
      `/tablesdb/${datenbankId}/tables/${tabellenId}/rows?${query(...q)}`
    );
    if (!res.ok) throw new Error(`Lesen ${tabellenId}: ${res.daten.message}`);

    const zeilen = res.daten.rows ?? [];
    if (zeilen.length === 0) return;
    yield zeilen;
    if (zeilen.length < SEITE) return;
    cursor = zeilen[zeilen.length - 1].$id;
  }
}

// ---------------------------------------------------------------------------
// Leeren
// ---------------------------------------------------------------------------

async function leereTabelle(tabellenId: string): Promise<number> {
  pruefeMockZiel(ZIEL_DB);
  let geloescht = 0;
  for (;;) {
    const res = await api<{ rows: Zeile[] }>(
      'GET',
      `/tablesdb/${ZIEL_DB}/tables/${tabellenId}/rows?${query({ method: 'limit', values: [SEITE] })}`
    );
    if (!res.ok) throw new Error(`Leeren ${tabellenId}: ${res.daten.message}`);
    const zeilen = res.daten.rows ?? [];
    if (zeilen.length === 0) return geloescht;

    for (const zeile of zeilen) {
      const weg = await api('DELETE', `/tablesdb/${ZIEL_DB}/tables/${tabellenId}/rows/${zeile.$id}`);
      if (weg.ok) geloescht++;
    }
    await warte(60);
  }
}

// ---------------------------------------------------------------------------
// Kopieren
// ---------------------------------------------------------------------------

interface Bilanz {
  tabelle: string;
  gelesen: number;
  geschrieben: number;
  fehler: string[];
}

async function kopiereTabelle(tabelle: Tabelle): Promise<Bilanz> {
  const bilanz: Bilanz = { tabelle: tabelle.$id, gelesen: 0, geschrieben: 0, fehler: [] };

  if (WIPE && !DRY_RUN) {
    const weg = await leereTabelle(tabelle.$id);
    if (weg > 0) process.stdout.write(`   (${weg} alte Zeilen entfernt) `);
  }

  for await (const seite of leseAlleZeilen(QUELL_DB, tabelle.$id)) {
    bilanz.gelesen += seite.length;
    if (DRY_RUN) continue;

    for (const zeile of seite) {
      pruefeMockZiel(ZIEL_DB);
      const koerper: Record<string, unknown> = {
        rowId: zeile.$id, // ← die Original-ID erhalten. Siehe Kopfkommentar.
        data: nutzdaten(zeile),
      };
      // Zeilen-Permissions nur bei aktivierter Row-Security übernehmen —
      // sonst weist Appwrite den Aufruf zurück.
      if (tabelle.rowSecurity && Array.isArray(zeile.$permissions)) {
        koerper.permissions = zeile.$permissions;
      }

      const res = await api('POST', `/tablesdb/${ZIEL_DB}/tables/${tabelle.$id}/rows`, koerper);
      if (res.ok) {
        bilanz.geschrieben++;
      } else if (res.status === 409) {
        // Zeile existiert schon (Lauf ohne --wipe-target) — das ist kein Fehler,
        // sondern die idempotente Normalsituation.
        bilanz.geschrieben++;
      } else {
        // Fehler sammeln statt abbrechen: eine kaputte Zeile darf nicht die
        // Kopie von 20.000 anderen verhindern.
        bilanz.fehler.push(`${zeile.$id}: ${res.daten.message ?? res.status}`);
      }
    }
    process.stdout.write('.');
    await warte(40);
  }

  return bilanz;
}

// ---------------------------------------------------------------------------
// Dateiverweise kappen
// ---------------------------------------------------------------------------

/**
 * Entfernt in der Sandbox alle Verweise auf Produktionsdateien.
 *
 * Warum nicht einfach die Dokumentzeilen weglassen? Weil das Massen-Angebots-
 * Tool aus alten ABs und Rechnungen die Positionen und Preise für das neue
 * Angebot ableitet (`ladeReferenzDokumenteFuerProjekte`). Ohne diese Zeilen
 * würde sich das Tool in der Sandbox völlig anders verhalten als in echt —
 * der Testlauf wäre wertlos.
 *
 * Also: Zeilen bleiben, Dateiverweis wird gekappt. Ein aus der Produktion
 * kopiertes Projekt im Status „Rechnung" hat in der Sandbox damit seine Daten,
 * aber kein PDF. Nur was IN der Sandbox erzeugt wird, bekommt dort auch eine
 * Datei — und die liegt in einem `mock_`-Bucket.
 *
 * Die Metadaten (`dateiname`, `dateiTyp`, `dateiGroesse`) bleiben erhalten: sie
 * verraten nichts über eine Datei, die es nicht gibt, und halten die Anzeige
 * lesbar ("Rechnung Musterverein 2025.pdf — kein PDF vorhanden").
 */
const VERWEIS_FELDER = ['dateiId', 'fileId', 'bildHaupt', 'pdfDatenblatt'];

async function kappeDateiVerweise(tabellen: Tabelle[]): Promise<void> {
  pruefeMockZiel(ZIEL_DB);
  console.log('\n🔗 Dateiverweise kappen (die PDFs selbst wurden nicht kopiert)');

  for (const tabelle of tabellen) {
    // Welche Verweis-Spalten hat diese Tabelle überhaupt?
    const schema = await api<{ columns: Array<{ key: string }> }>(
      'GET',
      `/tablesdb/${ZIEL_DB}/tables/${tabelle.$id}`
    );
    if (!schema.ok) continue;
    const spalten = (schema.daten.columns ?? []).map((c) => c.key);
    const felder = spalten.filter((k) => VERWEIS_FELDER.includes(k));

    // Nicht abbrechen, wenn es keine Verweis-SPALTE gibt: manche Tabellen
    // (z.B. rechnungs_aktivitaeten) führen die dateiId ausschließlich im
    // JSON-Textfeld. Die wären sonst still durchgerutscht.
    let geaendert = 0;
    for await (const seite of leseAlleZeilen(ZIEL_DB, tabelle.$id)) {
      for (const zeile of seite) {
        const leerung: Record<string, unknown> = {};
        for (const feld of felder) {
          if (typeof zeile[feld] === 'string' && zeile[feld] !== '') leerung[feld] = '';
        }

        // JSON-Textfelder durchsuchen (heißt je nach Tabelle `data` oder `daten`).
        for (const spalte of spalten) {
          const wert = zeile[spalte];
          if (typeof wert !== 'string' || !wert.startsWith('{')) continue;
          if (!VERWEIS_FELDER.some((f) => wert.includes(`"${f}"`))) continue;
          try {
            const obj = JSON.parse(wert) as Record<string, unknown>;
            let beruehrt = false;
            for (const feld of VERWEIS_FELDER) {
              if (typeof obj[feld] === 'string' && obj[feld] !== '') {
                obj[feld] = '';
                beruehrt = true;
              }
            }
            if (beruehrt) leerung[spalte] = JSON.stringify(obj);
          } catch {
            // kein gültiges JSON — dann steckt dort auch kein Verweis
          }
        }

        if (Object.keys(leerung).length === 0) continue;
        pruefeMockZiel(ZIEL_DB);
        const res = await api(
          'PATCH',
          `/tablesdb/${ZIEL_DB}/tables/${tabelle.$id}/rows/${zeile.$id}`,
          { data: leerung }
        );
        if (res.ok) geaendert++;
      }
    }
    if (geaendert > 0) {
      console.log(`   ${tabelle.$id}: ${geaendert} Verweise gekappt (${felder.join(', ')})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Storage (optional)
// ---------------------------------------------------------------------------

interface Datei {
  $id: string;
  name: string;
  mimeType: string;
  sizeOriginal: number;
}

async function kopiereDateien(): Promise<void> {
  console.log('\n📦 Dateien kopieren (--with-storage)');
  const res = await api<{ buckets: Array<{ $id: string }> }>(
    'GET',
    `/storage/buckets?${query({ method: 'limit', values: [200] })}`
  );
  if (!res.ok) throw new Error(`Buckets lesen: ${res.daten.message}`);

  const quellen = (res.daten.buckets ?? []).filter((b) => !b.$id.startsWith(BUCKET_PRAEFIX));

  for (const bucket of quellen) {
    const zielBucket = `${BUCKET_PRAEFIX}${bucket.$id}`;
    if (zielBucket.length > 36) continue;

    let kopiert = 0;
    let fehler = 0;
    let cursor: string | null = null;

    for (;;) {
      const q: Array<{ method: string; values: unknown[] }> = [{ method: 'limit', values: [SEITE] }];
      if (cursor) q.push({ method: 'cursorAfter', values: [cursor] });

      const liste = await api<{ files: Datei[] }>(
        'GET',
        `/storage/buckets/${bucket.$id}/files?${query(...q)}`
      );
      if (!liste.ok) break;
      const dateien = liste.daten.files ?? [];
      if (dateien.length === 0) break;

      for (const datei of dateien) {
        if (DRY_RUN) {
          kopiert++;
          continue;
        }
        try {
          const roh = await fetch(
            `${endpoint}/storage/buckets/${bucket.$id}/files/${datei.$id}/download?project=${projectId}`,
            { headers: { 'X-Appwrite-Project': projectId as string, 'X-Appwrite-Key': apiKey as string } }
          );
          if (!roh.ok) {
            fehler++;
            continue;
          }
          const inhalt = await roh.blob();

          const form = new FormData();
          form.append('fileId', datei.$id); // ID erhalten — dateiId-Verweise zeigen darauf
          form.append('file', new File([inhalt], datei.name, { type: datei.mimeType }));

          const hoch = await fetch(`${endpoint}/storage/buckets/${zielBucket}/files`, {
            method: 'POST',
            headers: {
              'X-Appwrite-Project': projectId as string,
              'X-Appwrite-Key': apiKey as string,
            },
            body: form,
          });
          if (hoch.ok || hoch.status === 409) kopiert++;
          else fehler++;
        } catch {
          fehler++;
        }
      }

      if (dateien.length < SEITE) break;
      cursor = dateien[dateien.length - 1].$id;
    }

    console.log(
      `   ${zielBucket}: ${kopiert} Dateien${fehler > 0 ? `, ${fehler} Fehler` : ''}${DRY_RUN ? ' [dry-run]' : ''}`
    );
  }
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  pruefeMockZiel(ZIEL_DB);

  console.log('═'.repeat(70));
  console.log('  PRODUKTIONSDATEN → SANDBOX KOPIEREN');
  console.log(`  Quelle (nur lesend): ${QUELL_DB}`);
  console.log(`  Ziel:                ${ZIEL_DB}`);
  if (DRY_RUN) console.log('  MODUS:               DRY-RUN (keine Änderungen)');
  if (WIPE) console.log('  WIPE:                Sandbox-Tabellen werden vorher geleert');
  if (NUR) console.log(`  NUR:                 ${NUR}`);
  if (MIT_STORAGE) console.log('  STORAGE:             Dateien werden mitkopiert');
  else console.log('  STORAGE:             keine Dateien — Verweise werden gekappt');
  if (NUR_VERWEISE) console.log('  MODUS:               NUR Verweise kappen');
  console.log('═'.repeat(70));

  // Die Tabellenliste kommt aus dem ZIEL, nicht aus der COLLECTIONS-Map im
  // Frontend: die Map ist nachweislich unvollständig (u.a. roles, audit_log,
  // mindmap_boards fehlen dort). Was in der Sandbox als Tabelle existiert, wird
  // befüllt — das ist die verlässlichere Quelle.
  const res = await api<{ tables: Tabelle[] }>(
    'GET',
    `/tablesdb/${ZIEL_DB}/tables?${query({ method: 'limit', values: [200] })}`
  );
  if (!res.ok) throw new Error(`Ziel-Tabellen lesen: ${res.daten.message}`);

  let tabellen = res.daten.tables ?? [];
  if (tabellen.length === 0) {
    console.error('\n❌ Die Sandbox hat keine Tabellen. Zuerst ausführen:');
    console.error('   npx tsx scripts/mock-db-setup.ts');
    process.exit(1);
  }
  if (NUR) tabellen = tabellen.filter((t) => t.$id === NUR);
  if (tabellen.length === 0) {
    console.error(`\n❌ Tabelle "${NUR}" existiert in der Sandbox nicht.`);
    process.exit(1);
  }

  if (NUR_VERWEISE) {
    await kappeDateiVerweise(tabellen);
    console.log('\n✅ Dateiverweise gekappt. Es wurde nichts kopiert.');
    return;
  }

  const bilanzen: Bilanz[] = [];
  for (const tabelle of tabellen) {
    process.stdout.write(`\n${tabelle.$id.padEnd(32)} `);
    try {
      const bilanz = await kopiereTabelle(tabelle);
      bilanzen.push(bilanz);
      process.stdout.write(
        ` ${bilanz.geschrieben}/${bilanz.gelesen}${bilanz.fehler.length > 0 ? ` ⚠️ ${bilanz.fehler.length}` : ''}`
      );
    } catch (error) {
      bilanzen.push({ tabelle: tabelle.$id, gelesen: 0, geschrieben: 0, fehler: [(error as Error).message] });
      process.stdout.write(` ❌ ${(error as Error).message}`);
    }
  }

  if (MIT_STORAGE) {
    await kopiereDateien();
  } else if (!DRY_RUN) {
    // Ohne --with-storage gibt es in der Sandbox keine Dateien. Verweise, die
    // ins Leere zeigen, würden im UI als kaputte Links erscheinen — also weg.
    await kappeDateiVerweise(tabellen);
  }

  console.log('\n\n' + '═'.repeat(70));
  console.log('  ZUSAMMENFASSUNG');
  console.log('═'.repeat(70));

  const gelesen = bilanzen.reduce((s, b) => s + b.gelesen, 0);
  const geschrieben = bilanzen.reduce((s, b) => s + b.geschrieben, 0);
  const mitFehlern = bilanzen.filter((b) => b.fehler.length > 0);

  for (const bilanz of bilanzen.filter((b) => b.gelesen > 0)) {
    console.log(`  ${bilanz.tabelle.padEnd(34)} ${String(bilanz.geschrieben).padStart(6)} / ${bilanz.gelesen}`);
  }
  console.log('─'.repeat(70));
  console.log(`  GESAMT${' '.repeat(28)} ${String(geschrieben).padStart(6)} / ${gelesen}`);

  if (mitFehlern.length > 0) {
    console.log(`\n⚠️  ${mitFehlern.length} Tabellen mit Fehlern:`);
    for (const bilanz of mitFehlern) {
      console.log(`\n  ${bilanz.tabelle} (${bilanz.fehler.length}):`);
      for (const fehler of bilanz.fehler.slice(0, 5)) console.log(`    • ${fehler}`);
      if (bilanz.fehler.length > 5) console.log(`    … und ${bilanz.fehler.length - 5} weitere`);
    }
  } else if (!DRY_RUN) {
    console.log('\n✅ Ohne Fehler abgeschlossen.');
  }
  console.log('═'.repeat(70));
}

main().catch((error) => {
  console.error('\n❌ Abbruch:', (error as Error).message);
  process.exit(1);
});
