/**
 * Legt die Sandbox-Datenbank `tennismehl24_db_mock` samt Schema und die
 * Mock-Storage-Buckets an — als exakte Spiegelung der Produktion.
 *
 * Warum nicht `npm run setup:appwrite` gegen die Mock-DB?
 * Weil dieses Script das LIVE-Schema spiegelt statt eines im Repo gepflegten
 * Soll-Zustands. Die Produktionsdatenbank ist über Monate auch von Hand
 * gewachsen; ein Soll-Schema aus dem Repo wäre nicht deckungsgleich, und jede
 * Abweichung würde beim Kopieren der Daten als stiller Feldverlust auftauchen.
 *
 * Idempotent: bereits vorhandene Tabellen, Spalten, Indizes und Buckets werden
 * übersprungen. Es wird NICHTS gelöscht.
 *
 * Ausführen:
 *   npx tsx scripts/mock-db-setup.ts
 *   npx tsx scripts/mock-db-setup.ts --dry-run   zeigt nur, was angelegt würde
 *
 * SICHERHEIT: Schreibziel ist immer die Datenbank mit `_mock`-Suffix. Die
 * Produktion wird ausschließlich gelesen (siehe pruefeMockZiel()).
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

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Harter Wipe-Guard. Jede schreibende Operation dieses Scripts läuft hier
 * vorbei. Kein Flag kann ihn umgehen — genau das ist der Punkt.
 */
function pruefeMockZiel(datenbankId: string): void {
  if (!datenbankId.endsWith('_mock')) {
    console.error(`\n🛑 ABBRUCH: Ziel-Datenbank "${datenbankId}" endet nicht auf "_mock".`);
    console.error('   Dieses Script schreibt ausschließlich in die Sandbox.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// REST-Helfer
// ---------------------------------------------------------------------------

interface AppwriteFehler {
  message?: string;
  type?: string;
}

async function api<T>(
  methode: 'GET' | 'POST' | 'DELETE',
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
  const daten = text ? JSON.parse(text) : {};
  return { ok: antwort.ok, status: antwort.status, daten };
}

const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const alleQuery = encodeURIComponent(JSON.stringify({ method: 'limit', values: [200] }));

// ---------------------------------------------------------------------------
// Schema-Typen (nur die Felder, die wir brauchen)
// ---------------------------------------------------------------------------

interface Spalte {
  key: string;
  type: 'string' | 'integer' | 'double' | 'boolean' | 'datetime';
  format?: string;
  required: boolean;
  array: boolean;
  size?: number;
  min?: number;
  max?: number;
  default?: unknown;
  elements?: string[];
  encrypt?: boolean;
  status?: string;
}

interface Index {
  key: string;
  type: 'key' | 'unique' | 'fulltext';
  columns: string[];
  orders?: string[];
  lengths?: number[];
}

interface Tabelle {
  $id: string;
  name: string;
  $permissions: string[];
  rowSecurity: boolean;
  enabled: boolean;
  columns: Spalte[];
  indexes: Index[];
}

interface Bucket {
  $id: string;
  name: string;
  $permissions: string[];
  fileSecurity: boolean;
  enabled: boolean;
  maximumFileSize: number;
  allowedFileExtensions: string[];
  compression: string;
  encryption: boolean;
  antivirus: boolean;
}

/**
 * Appwrite liefert für integer/double die technischen Typgrenzen zurück, wenn
 * kein fachliches Minimum/Maximum gesetzt wurde. Diese Werte wieder
 * mitzuschicken ist sinnlos und schädlich: JavaScript kann int64 nicht exakt
 * darstellen, die Zahl käme gerundet beim Server an.
 *
 * Als Schwelle genügt MAX_SAFE_INTEGER — was darüber liegt, ist garantiert eine
 * Typgrenze und keine fachliche Vorgabe.
 */
function istGrenzwert(wert: number | undefined, typ: 'integer' | 'double'): boolean {
  if (wert === undefined || wert === null) return true;
  if (typ === 'integer') return Math.abs(wert) > Number.MAX_SAFE_INTEGER;
  return !Number.isFinite(wert) || Math.abs(wert) >= Number.MAX_VALUE;
}

/** Endpunkt-Suffix und Payload für eine Spalte. */
function spaltenAnlage(s: Spalte): { pfad: string; payload: Record<string, unknown> } {
  const basis: Record<string, unknown> = {
    key: s.key,
    required: s.required,
    array: s.array,
  };
  // Appwrite verbietet default bei required-Spalten und bei Arrays.
  if (!s.required && !s.array && s.default !== null && s.default !== undefined) {
    basis.default = s.default;
  }

  if (s.type === 'string' && s.format === 'enum') {
    return { pfad: 'enum', payload: { ...basis, elements: s.elements ?? [] } };
  }
  if (s.type === 'string' && s.format === 'email') {
    return { pfad: 'email', payload: basis };
  }
  if (s.type === 'string' && s.format === 'url') {
    return { pfad: 'url', payload: basis };
  }
  if (s.type === 'string' && s.format === 'ip') {
    return { pfad: 'ip', payload: basis };
  }
  if (s.type === 'string') {
    return { pfad: 'string', payload: { ...basis, size: s.size ?? 255, encrypt: s.encrypt ?? false } };
  }
  if (s.type === 'integer') {
    const p: Record<string, unknown> = { ...basis };
    if (!istGrenzwert(s.min, 'integer')) p.min = s.min;
    if (!istGrenzwert(s.max, 'integer')) p.max = s.max;
    return { pfad: 'integer', payload: p };
  }
  if (s.type === 'double') {
    const p: Record<string, unknown> = { ...basis };
    if (!istGrenzwert(s.min, 'double')) p.min = s.min;
    if (!istGrenzwert(s.max, 'double')) p.max = s.max;
    return { pfad: 'float', payload: p };
  }
  if (s.type === 'boolean') {
    return { pfad: 'boolean', payload: basis };
  }
  if (s.type === 'datetime') {
    return { pfad: 'datetime', payload: basis };
  }
  throw new Error(`Unbekannter Spaltentyp "${s.type}" bei "${s.key}" — Script erweitern.`);
}

// ---------------------------------------------------------------------------
// Datenbank + Tabellen
// ---------------------------------------------------------------------------

async function stelleDatenbankSicher(): Promise<void> {
  const vorhanden = await api(`GET`, `/tablesdb/${ZIEL_DB}`);
  if (vorhanden.ok) {
    console.log(`✓ Datenbank ${ZIEL_DB} existiert bereits.`);
    return;
  }
  if (DRY_RUN) {
    console.log(`[dry-run] würde Datenbank ${ZIEL_DB} anlegen`);
    return;
  }
  const res = await api('POST', '/tablesdb', {
    databaseId: ZIEL_DB,
    name: 'TennisMehl24 MOCK (Sandbox)',
    enabled: true,
  });
  if (!res.ok) throw new Error(`Datenbank anlegen fehlgeschlagen: ${res.daten.message}`);
  console.log(`✅ Datenbank ${ZIEL_DB} angelegt.`);
}

async function ladeTabellen(datenbankId: string): Promise<Tabelle[]> {
  const res = await api<{ tables: Tabelle[] }>(
    'GET',
    `/tablesdb/${datenbankId}/tables?queries[]=${alleQuery}`
  );
  if (!res.ok) throw new Error(`Tabellen lesen fehlgeschlagen: ${res.daten.message}`);
  return res.daten.tables ?? [];
}

/**
 * Wartet, bis alle Spalten einer Tabelle den Status `available` haben.
 * Appwrite legt Spalten asynchron an — Indizes und Daten würden sonst auf
 * halbfertige Spalten treffen.
 */
async function warteAufSpalten(tabellenId: string, maxSekunden = 120): Promise<boolean> {
  const bis = Date.now() + maxSekunden * 1000;
  while (Date.now() < bis) {
    const res = await api<{ columns: Spalte[] }>(
      'GET',
      `/tablesdb/${ZIEL_DB}/tables/${tabellenId}`
    );
    if (!res.ok) return false;
    const offen = (res.daten.columns ?? []).filter((c) => c.status !== 'available');
    if (offen.length === 0) return true;
    const fehler = offen.filter((c) => c.status === 'failed');
    if (fehler.length > 0) {
      console.error(`   ✗ Spalten fehlgeschlagen: ${fehler.map((c) => c.key).join(', ')}`);
      return false;
    }
    await warte(700);
  }
  console.error(`   ✗ Zeitüberschreitung beim Warten auf Spalten von ${tabellenId}`);
  return false;
}

async function spiegeleTabelle(quelle: Tabelle, zielTabellen: Map<string, Tabelle>): Promise<void> {
  const ziel = zielTabellen.get(quelle.$id);

  if (!ziel) {
    if (DRY_RUN) {
      console.log(
        `[dry-run] Tabelle ${quelle.$id}: neu (${quelle.columns.length} Spalten, ${quelle.indexes.length} Indizes)`
      );
      return;
    }
    const res = await api('POST', `/tablesdb/${ZIEL_DB}/tables`, {
      tableId: quelle.$id,
      name: quelle.name,
      permissions: quelle.$permissions,
      rowSecurity: quelle.rowSecurity,
      enabled: quelle.enabled,
    });
    if (!res.ok) throw new Error(`Tabelle ${quelle.$id} anlegen: ${res.daten.message}`);
    console.log(`✅ Tabelle ${quelle.$id} angelegt.`);
  }

  const vorhandeneSpalten = new Set((ziel?.columns ?? []).map((c) => c.key));
  const fehlendeSpalten = quelle.columns.filter((c) => !vorhandeneSpalten.has(c.key));

  for (const spalte of fehlendeSpalten) {
    const { pfad, payload } = spaltenAnlage(spalte);
    if (DRY_RUN) {
      console.log(`[dry-run]   + Spalte ${quelle.$id}.${spalte.key} (${pfad})`);
      continue;
    }
    const res = await api('POST', `/tablesdb/${ZIEL_DB}/tables/${quelle.$id}/columns/${pfad}`, payload);
    if (!res.ok) {
      console.error(`   ✗ Spalte ${quelle.$id}.${spalte.key}: ${res.daten.message}`);
    }
    // Appwrite Cloud drosselt; ohne kurze Pause laufen große Tabellen in 429er.
    await warte(120);
  }

  if (fehlendeSpalten.length > 0 && !DRY_RUN) {
    console.log(`   ${fehlendeSpalten.length} Spalten ergänzt — warte auf Verfügbarkeit …`);
    await warteAufSpalten(quelle.$id);
  }

  const vorhandeneIndizes = new Set((ziel?.indexes ?? []).map((i) => i.key));
  const fehlendeIndizes = quelle.indexes.filter((i) => !vorhandeneIndizes.has(i.key));

  for (const index of fehlendeIndizes) {
    if (DRY_RUN) {
      console.log(`[dry-run]   + Index ${quelle.$id}.${index.key} (${index.type})`);
      continue;
    }
    const res = await api('POST', `/tablesdb/${ZIEL_DB}/tables/${quelle.$id}/indexes`, {
      key: index.key,
      type: index.type,
      columns: index.columns,
      orders: index.orders ?? index.columns.map(() => 'ASC'),
      lengths: index.lengths ?? [],
    });
    if (!res.ok) {
      console.error(`   ✗ Index ${quelle.$id}.${index.key}: ${res.daten.message}`);
    }
    await warte(120);
  }

  if (fehlendeSpalten.length === 0 && fehlendeIndizes.length === 0 && ziel) {
    console.log(`✓ Tabelle ${quelle.$id} bereits vollständig.`);
  }
}

// ---------------------------------------------------------------------------
// Storage-Buckets
// ---------------------------------------------------------------------------

/**
 * Buckets, die der Code referenziert, die es in der Produktion aber (noch)
 * nicht gibt — sie hätten sonst kein Vorbild zum Spiegeln.
 *
 * `liefernachweis-dateien` steht in netlify/functions/liefernachweis.ts und in
 * src/services/liefernachweisService.ts. Inzwischen existiert er auch in der
 * Produktion (angelegt mit scripts/add-liefernachweis-bucket.js) und würde
 * normal gespiegelt — dieser Eintrag bleibt als Sicherheitsnetz: Fehlt das
 * Vorbild irgendwann wieder, entsteht der Sandbox-Bucket trotzdem, statt dass
 * der QR-Durchstich stillschweigend am fehlenden Bucket scheitert.
 */
const ZUSATZ_BUCKETS: Array<{ basisId: string; name: string; einstellungen: Record<string, unknown> }> = [
  {
    basisId: 'liefernachweis-dateien',
    name: 'Liefernachweis-Dateien (Fotos & Unterschriften)',
    einstellungen: {
      permissions: ['read("users")'],
      fileSecurity: false,
      enabled: true,
      maximumFileSize: 10 * 1024 * 1024,
      allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
      compression: 'none',
      encryption: true,
      antivirus: true,
    },
  },
];

async function spiegeleBuckets(): Promise<void> {
  console.log('\n📦 Storage-Buckets');
  const res = await api<{ buckets: Bucket[] }>('GET', `/storage/buckets?queries[]=${alleQuery}`);
  if (!res.ok) throw new Error(`Buckets lesen fehlgeschlagen: ${res.daten.message}`);

  const alle = res.daten.buckets ?? [];
  const produktiv = alle.filter((b) => !b.$id.startsWith(BUCKET_PRAEFIX));
  const vorhanden = new Set(alle.map((b) => b.$id));

  for (const zusatz of ZUSATZ_BUCKETS) {
    const mockId = `${BUCKET_PRAEFIX}${zusatz.basisId}`;
    if (vorhanden.has(mockId)) {
      console.log(`✓ Bucket ${mockId} existiert bereits.`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`[dry-run] würde Zusatz-Bucket ${mockId} anlegen`);
      continue;
    }
    const anlage = await api('POST', '/storage/buckets', {
      bucketId: mockId,
      name: `[MOCK] ${zusatz.name}`,
      ...zusatz.einstellungen,
    });
    if (!anlage.ok) console.error(`   ✗ Bucket ${mockId}: ${anlage.daten.message}`);
    else console.log(`✅ Bucket ${mockId} angelegt (kein Produktions-Vorbild).`);
  }

  for (const bucket of produktiv) {
    const mockId = `${BUCKET_PRAEFIX}${bucket.$id}`;
    if (mockId.length > 36) {
      console.error(`   ✗ ${mockId} überschreitet 36 Zeichen — Bucket kann nicht gespiegelt werden.`);
      continue;
    }
    if (vorhanden.has(mockId)) {
      console.log(`✓ Bucket ${mockId} existiert bereits.`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`[dry-run] würde Bucket ${mockId} anlegen`);
      continue;
    }
    const anlage = await api('POST', '/storage/buckets', {
      bucketId: mockId,
      name: `[MOCK] ${bucket.name}`,
      permissions: bucket.$permissions,
      fileSecurity: bucket.fileSecurity,
      enabled: bucket.enabled,
      maximumFileSize: bucket.maximumFileSize,
      allowedFileExtensions: bucket.allowedFileExtensions,
      compression: bucket.compression,
      encryption: bucket.encryption,
      antivirus: bucket.antivirus,
    });
    if (!anlage.ok) {
      console.error(`   ✗ Bucket ${mockId}: ${anlage.daten.message}`);
      continue;
    }
    console.log(`✅ Bucket ${mockId} angelegt.`);
  }
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  pruefeMockZiel(ZIEL_DB);

  console.log('═'.repeat(70));
  console.log('  MOCK-DATENBANK EINRICHTEN');
  console.log(`  Quelle (nur lesend): ${QUELL_DB}`);
  console.log(`  Ziel:                ${ZIEL_DB}`);
  if (DRY_RUN) console.log('  MODUS:               DRY-RUN (keine Änderungen)');
  console.log('═'.repeat(70));

  await stelleDatenbankSicher();

  const quellTabellen = await ladeTabellen(QUELL_DB);
  console.log(`\n🗂  ${quellTabellen.length} Tabellen in der Produktion gefunden.\n`);

  const zielTabellen = new Map<string, Tabelle>();
  if (!DRY_RUN) {
    for (const t of await ladeTabellen(ZIEL_DB)) zielTabellen.set(t.$id, t);
  }

  let fehler = 0;
  for (const tabelle of quellTabellen) {
    try {
      await spiegeleTabelle(tabelle, zielTabellen);
    } catch (error) {
      fehler++;
      console.error(`❌ ${tabelle.$id}: ${(error as Error).message}`);
    }
  }

  await spiegeleBuckets();

  console.log('\n' + '═'.repeat(70));
  if (fehler === 0) {
    console.log('✅ Schema-Spiegelung abgeschlossen.');
    console.log('   Nächster Schritt: npx tsx scripts/copy-to-mock-db.ts');
  } else {
    console.log(`⚠️  Abgeschlossen mit ${fehler} Fehlern — bitte oben prüfen.`);
  }
  console.log('═'.repeat(70));
}

main().catch((error) => {
  console.error('\n❌ Abbruch:', (error as Error).message);
  process.exit(1);
});
