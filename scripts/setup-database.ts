#!/usr/bin/env npx ts-node
/**
 * Appwrite Database Setup Script
 *
 * WICHTIG: Dieses Script wird bei Deployment ausgeführt, NICHT im Client!
 * Der API-Key bleibt sicher auf dem Server und wird nie an den Client exponiert.
 *
 * Verwendung:
 *   npx ts-node scripts/setup-database.ts
 *
 * Oder in package.json:
 *   "scripts": {
 *     "setup:db": "ts-node scripts/setup-database.ts"
 *   }
 *
 * Benötigte Umgebungsvariablen (NICHT VITE_ prefixed!):
 *   - APPWRITE_ENDPOINT
 *   - APPWRITE_PROJECT_ID
 *   - APPWRITE_API_KEY (Admin-Key, NIEMALS im Client!)
 */

import * as dotenv from 'dotenv';

// Lade .env.local für lokale Entwicklung
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Konfiguration aus Umgebungsvariablen
const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || process.env.VITE_APPWRITE_API_KEY;

// Database ID (kann auch aus env kommen)
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'main';

// Collection IDs
const COLLECTIONS = {
  KUNDEN: 'kunden',
  KUNDEN_AKTIVITAETEN: 'kunden_aktivitaeten',
  SAISON_KUNDEN: 'saisonkunden',
  SAISON_ANSPRECHPARTNER: 'saison_ansprechpartner',
  SAISON_DATEN: 'saison_daten',
  SAISON_BEZIEHUNGEN: 'saison_beziehungen',
  SAISON_AKTIVITAETEN: 'saison_aktivitaeten',
  PROJEKTE: 'projekte',
  ARTIKEL: 'artikel',
  STAMMDATEN: 'stammdaten',
  LIEFERANTEN: 'lieferanten',
  KALENDER: 'kalender',
  WIKI_PAGES: 'wiki_pages',
  WIKI_FILES: 'wiki_files',
  NEWSLETTER: 'newsletter_subscribers',
  SIEBANALYSEN: 'siebanalysen',
  PRIVAT_RECHNUNGEN_JULIAN: 'privat_rechnungen_julian',
  PRIVAT_KREDITOREN_JULIAN: 'privat_kreditoren_julian',
  PRIVAT_AKTIVITAETEN_JULIAN: 'privat_aktivitaeten_julian',
  PRIVAT_RECHNUNGEN_LUCA: 'privat_rechnungen_luca',
  PRIVAT_KREDITOREN_LUCA: 'privat_kreditoren_luca',
  PRIVAT_AKTIVITAETEN_LUCA: 'privat_aktivitaeten_luca',
  FAHRTEN: 'fahrten',
  DEFAULT_STRECKEN: 'default_strecken',
  INSTANDHALTUNG_CHECKLISTEN: 'instandhaltung_checklisten',
  INSTANDHALTUNG_BEGEHUNGEN: 'instandhaltung_begehungen',
  SCHICHT_MITARBEITER: 'schicht_mitarbeiter',
  SCHICHT_ZUWEISUNGEN: 'schicht_zuweisungen',
  CHAT_NACHRICHTEN: 'chat_nachrichten',
  PRODUKTION: 'produktion',
  PLATZBAUER_PROJEKTE: 'platzbauer_projekte',
  PROJEKT_ZUORDNUNGEN: 'projekt_zuordnungen',
  PLATZBAUER_DOKUMENTE: 'platzbauer_dokumente',
  PLATZBAUER_LIEFERSCHEINE: 'platzbauer_lieferscheine',
  DEBITOREN_METADATEN: 'debitoren_metadaten',
  TOUREN: 'touren',
  FAHRER: 'fahrer',
  AUDIT_LOG: 'audit_log', // NEU: Audit Logging
  ANFRAGEN: 'anfragen',
};

// Bucket IDs
const BUCKETS = {
  WIKI_DATEIEN: 'wiki_dateien',
  PLATZBAUER_DATEIEN: 'platzbauer_dateien',
};

type FieldConfig = {
  key: string;
  type: 'string' | 'integer' | 'double' | 'boolean';
  size?: number;
  required?: boolean;
  default?: string | number | boolean | null;
  array?: boolean;
};

// Field Definitions (aus appwriteSetup.ts übernommen)
const fieldDefinitions: Record<string, FieldConfig[]> = {
  [COLLECTIONS.KUNDEN]: [
    { key: 'name', type: 'string', size: 500, required: true },
    { key: 'kundenTyp', type: 'string', size: 50, required: true },
    { key: 'bestelltDirekt', type: 'boolean', default: false },
    { key: 'adresse_strasse', type: 'string', size: 500 },
    { key: 'adresse_plz', type: 'string', size: 20 },
    { key: 'adresse_ort', type: 'string', size: 200 },
    { key: 'lieferadresse_strasse', type: 'string', size: 500 },
    { key: 'lieferadresse_plz', type: 'string', size: 20 },
    { key: 'lieferadresse_ort', type: 'string', size: 200 },
    { key: 'bestelltUeberIds', type: 'string', size: 100, array: true },
    { key: 'tennisplatzAnzahl', type: 'integer', default: 0 },
    { key: 'tonnenProJahr', type: 'double', default: 0 },
    { key: 'telefonnummer', type: 'string', size: 100 },
    { key: 'ansprechpartner', type: 'string', size: 200 },
    { key: 'email', type: 'string', size: 320 },
    { key: 'zahlungsbedingungen', type: 'string', size: 500 },
    { key: 'zahlungsverhalten', type: 'string', size: 500 },
    { key: 'zahlungszielTage', type: 'integer', default: 0 },
    { key: 'bemerkungen', type: 'string', size: 1000 },
    { key: 'erstelltAm', type: 'string', size: 50 },
    { key: 'aktualisiertAm', type: 'string', size: 50 },
    { key: 'data', type: 'string', size: 10000 },
  ],
  [COLLECTIONS.PROJEKTE]: [
    { key: 'kundeId', type: 'string', size: 255, required: true },
    { key: 'kundenname', type: 'string', size: 255, required: true },
    { key: 'saisonjahr', type: 'integer', required: true },
    { key: 'status', type: 'string', size: 50, required: true },
    { key: 'erstelltAm', type: 'string', size: 50, required: true },
    { key: 'geaendertAm', type: 'string', size: 50, required: true },
    { key: 'data', type: 'string', size: 100000, required: true },
  ],
  [COLLECTIONS.AUDIT_LOG]: [
    { key: 'timestamp', type: 'string', size: 50, required: true },
    { key: 'userId', type: 'string', size: 100, required: true },
    { key: 'action', type: 'string', size: 100, required: true },
    { key: 'resource', type: 'string', size: 500 },
    { key: 'details', type: 'string', size: 10000 },
    { key: 'ip', type: 'string', size: 50 },
    { key: 'userAgent', type: 'string', size: 500 },
  ],
  [COLLECTIONS.TOUREN]: [
    { key: 'datum', type: 'string', size: 20, required: true },
    { key: 'name', type: 'string', size: 255, required: true },
    { key: 'fahrzeugId', type: 'string', size: 100, required: true },
    { key: 'fahrerId', type: 'string', size: 100 },
    { key: 'status', type: 'string', size: 50, required: true },
    { key: 'stops', type: 'string', size: 100000, required: true },
    { key: 'routeDetails', type: 'string', size: 10000, required: true },
    { key: 'optimierung', type: 'string', size: 10000, required: true },
    { key: 'encodedPolyline', type: 'string', size: 50000 },
    { key: 'erstelltVon', type: 'string', size: 100 },
  ],
  // Minimal Collections (nur data-Feld)
  [COLLECTIONS.SAISON_KUNDEN]: [{ key: 'data', type: 'string', size: 10000 }],
  [COLLECTIONS.LIEFERANTEN]: [{ key: 'data', type: 'string', size: 10000 }],
  [COLLECTIONS.SIEBANALYSEN]: [{ key: 'data', type: 'string', size: 50000 }],
  [COLLECTIONS.FAHRTEN]: [{ key: 'data', type: 'string', size: 50000 }],
  [COLLECTIONS.DEFAULT_STRECKEN]: [{ key: 'data', type: 'string', size: 10000 }],
  [COLLECTIONS.PRODUKTION]: [{ key: 'data', type: 'string', size: 100000 }],
};

// Index Definitions
const indexDefinitions: Record<string, Array<{ key: string; attributes: string[]; type?: 'key' | 'unique' | 'fulltext' }>> = {
  [COLLECTIONS.PROJEKTE]: [
    { key: 'kundeId_index', attributes: ['kundeId'] },
    { key: 'status_index', attributes: ['status'] },
    { key: 'saisonjahr_index', attributes: ['saisonjahr'] },
  ],
  [COLLECTIONS.AUDIT_LOG]: [
    { key: 'userId_index', attributes: ['userId'] },
    { key: 'action_index', attributes: ['action'] },
    { key: 'timestamp_index', attributes: ['timestamp'] },
  ],
  [COLLECTIONS.TOUREN]: [
    { key: 'datum_index', attributes: ['datum'] },
    { key: 'status_index', attributes: ['status'] },
    { key: 'fahrzeugId_index', attributes: ['fahrzeugId'] },
  ],
};

// Helper Functions
async function makeRequest(path: string, method: string, body?: object): Promise<any> {
  const url = `${endpoint}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId!,
    'X-Appwrite-Key': apiKey!,
  };

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  return { ok: response.ok, status: response.status, data };
}

async function ensureCollection(
  collectionId: string,
  name: string,
  permissions?: string[]
): Promise<boolean> {
  // Prüfe ob Collection existiert
  const check = await makeRequest(`/databases/${DATABASE_ID}/collections/${collectionId}`, 'GET');

  if (check.ok) {
    console.log(`  ✓ Collection ${collectionId} existiert bereits`);
    return false;
  }

  if (check.status !== 404) {
    console.error(`  ✗ Fehler beim Prüfen von ${collectionId}: ${check.status}`);
    return false;
  }

  // Collection erstellen
  console.log(`  → Erstelle Collection ${collectionId}...`);
  const create = await makeRequest(`/databases/${DATABASE_ID}/collections`, 'POST', {
    collectionId,
    name,
    documentSecurity: !permissions?.length,
    permissions: permissions || [],
  });

  if (!create.ok) {
    console.error(`  ✗ Fehler beim Erstellen von ${collectionId}: ${create.data?.message}`);
    return false;
  }

  console.log(`  ✓ Collection ${collectionId} erstellt`);
  return true;
}

async function ensureField(collectionId: string, field: FieldConfig): Promise<boolean> {
  const body: Record<string, unknown> = {
    key: field.key,
    required: field.required ?? false,
    default: field.default ?? null,
  };

  if (field.type === 'string') {
    body.size = field.size ?? 500;
  }

  if (field.array) {
    body.array = true;
  }

  const create = await makeRequest(
    `/databases/${DATABASE_ID}/collections/${collectionId}/attributes/${field.type}`,
    'POST',
    body
  );

  if (create.ok) {
    console.log(`    ✓ Feld ${field.key} erstellt`);
    return true;
  } else if (create.status === 409) {
    // Feld existiert bereits
    return false;
  } else {
    console.warn(`    ⚠ Feld ${field.key}: ${create.data?.message}`);
    return false;
  }
}

async function ensureIndex(
  collectionId: string,
  indexKey: string,
  attributes: string[],
  type: 'key' | 'unique' | 'fulltext' = 'key'
): Promise<boolean> {
  // Prüfe ob Index existiert
  const check = await makeRequest(`/databases/${DATABASE_ID}/collections/${collectionId}/indexes`, 'GET');

  if (check.ok) {
    const existing = check.data.indexes?.find((idx: { key: string }) => idx.key === indexKey);
    if (existing) return false;
  }

  // Index erstellen
  const create = await makeRequest(
    `/databases/${DATABASE_ID}/collections/${collectionId}/indexes`,
    'POST',
    {
      key: indexKey,
      type,
      attributes,
      orders: attributes.map(() => 'ASC'),
    }
  );

  if (create.ok) {
    console.log(`    ✓ Index ${indexKey} erstellt`);
    return true;
  } else if (create.status === 409) {
    return false;
  } else {
    console.warn(`    ⚠ Index ${indexKey}: ${create.data?.message}`);
    return false;
  }
}

async function ensureBucket(bucketId: string, name: string): Promise<boolean> {
  const check = await makeRequest(`/storage/buckets/${bucketId}`, 'GET');

  if (check.ok) {
    console.log(`  ✓ Bucket ${bucketId} existiert bereits`);
    return false;
  }

  if (check.status !== 404) {
    console.error(`  ✗ Fehler beim Prüfen von Bucket ${bucketId}: ${check.status}`);
    return false;
  }

  console.log(`  → Erstelle Bucket ${bucketId}...`);
  const create = await makeRequest('/storage/buckets', 'POST', {
    bucketId,
    name,
    permissions: ['read("any")', 'create("users")', 'update("users")', 'delete("users")'],
    fileSecurity: false,
    maximumFileSize: 52428800,
    allowedFileExtensions: [],
  });

  if (!create.ok) {
    console.error(`  ✗ Fehler beim Erstellen von Bucket ${bucketId}: ${create.data?.message}`);
    return false;
  }

  console.log(`  ✓ Bucket ${bucketId} erstellt`);
  return true;
}

// Main Setup Function
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           TennisMehl24 - Appwrite Database Setup                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Validierung
  if (!endpoint || !projectId || !apiKey) {
    console.error('❌ Fehler: Umgebungsvariablen nicht konfiguriert!');
    console.error('');
    console.error('Benötigt:');
    console.error('  - APPWRITE_ENDPOINT (oder VITE_APPWRITE_ENDPOINT)');
    console.error('  - APPWRITE_PROJECT_ID (oder VITE_APPWRITE_PROJECT_ID)');
    console.error('  - APPWRITE_API_KEY (NIEMALS VITE_ für API-Key!)');
    console.error('');
    process.exit(1);
  }

  console.log(`📡 Endpoint: ${endpoint}`);
  console.log(`📁 Projekt: ${projectId}`);
  console.log(`🔑 API-Key: ${apiKey.substring(0, 10)}...`);
  console.log(`🗄️  Database: ${DATABASE_ID}`);
  console.log('');

  // Prüfe Verbindung
  console.log('🔌 Prüfe Verbindung...');
  const health = await makeRequest('/health', 'GET');
  if (!health.ok) {
    console.error('❌ Verbindung zu Appwrite fehlgeschlagen!');
    process.exit(1);
  }
  console.log('✓ Verbindung erfolgreich');
  console.log('');

  // Collections erstellen
  console.log('📦 Erstelle Collections...');

  const defaultPermissions = ['read("users")', 'create("users")', 'update("users")', 'delete("users")'];

  for (const [key, collectionId] of Object.entries(COLLECTIONS)) {
    const name = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    await ensureCollection(collectionId, name, defaultPermissions);

    // Felder erstellen wenn definiert
    const fields = fieldDefinitions[collectionId];
    if (fields) {
      for (const field of fields) {
        await ensureField(collectionId, field);
        await new Promise(r => setTimeout(r, 100)); // Rate limiting
      }
    }

    // Indizes erstellen wenn definiert
    const indexes = indexDefinitions[collectionId];
    if (indexes) {
      // Warte kurz, damit Felder erstellt sind
      await new Promise(r => setTimeout(r, 500));
      for (const index of indexes) {
        await ensureIndex(collectionId, index.key, index.attributes, index.type || 'key');
      }
    }
  }

  console.log('');

  // Buckets erstellen
  console.log('📁 Erstelle Storage Buckets...');
  for (const [key, bucketId] of Object.entries(BUCKETS)) {
    const name = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    await ensureBucket(bucketId, name);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                     Setup abgeschlossen! ✓                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
}

// Run
main().catch(error => {
  console.error('❌ Unerwarteter Fehler:', error);
  process.exit(1);
});
