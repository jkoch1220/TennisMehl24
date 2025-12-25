/**
 * Script zum automatischen Anlegen der Appwrite Collection-Felder
 * 
 * Führe dieses Script einmalig aus mit:
 * npm run setup:appwrite
 * 
 * Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY
 * 
 * Für Netlify: Setze diese als Umgebungsvariablen im Dashboard
 */

import dotenv from 'dotenv';

// Lade Umgebungsvariablen aus .env (für lokale Entwicklung)
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId) {
  console.error('❌ VITE_APPWRITE_ENDPOINT und VITE_APPWRITE_PROJECT_ID müssen gesetzt sein!');
  process.exit(1);
}

if (!apiKey) {
  console.error('❌ VITE_APPWRITE_API_KEY ist nicht gesetzt!');
  console.log('Bitte erstelle einen API Key in Appwrite mit folgenden Berechtigungen:');
  console.log('- databases.read');
  console.log('- databases.write');
  console.log('- databases.update');
  console.log('- databases.delete');
  process.exit(1);
}

const DATABASE_ID = 'tennismehl24_db';
const FIXKOSTEN_COLLECTION_ID = 'fixkosten';
const VARIABLE_KOSTEN_COLLECTION_ID = 'variable_kosten';
const KUNDEN_COLLECTION_ID = 'kunden';
const KUNDEN_AKTIVITAETEN_COLLECTION_ID = 'kunden_aktivitaeten';
const PROJEKTE_COLLECTION_ID = 'projekte';
const ARTIKEL_COLLECTION_ID = 'artikel';
const STAMMDATEN_COLLECTION_ID = 'stammdaten';
const WIKI_PAGES_COLLECTION_ID = 'wiki_pages';
const WIKI_FILES_COLLECTION_ID = 'wiki_files';
const WIKI_DATEIEN_BUCKET_ID = 'wiki-dateien';

const fixkostenFields = [
  { key: 'grundstueck_pacht', type: 'double' },
  { key: 'grundstueck_steuer', type: 'double' },
  { key: 'grundstueck_pflege', type: 'double' },
  { key: 'grundstueck_buerocontainer', type: 'double' },
  { key: 'maschinen_wartungRadlader', type: 'double' },
  { key: 'maschinen_wartungStapler', type: 'double' },
  { key: 'maschinen_wartungMuehle', type: 'double' },
  { key: 'maschinen_wartungSiebanlage', type: 'double' },
  { key: 'maschinen_wartungAbsackanlage', type: 'double' },
  { key: 'maschinen_sonstigeWartung', type: 'double' },
  { key: 'maschinen_grundkostenMaschinen', type: 'double' },
  { key: 'ruecklagenErsatzkauf', type: 'double' },
  { key: 'sonstiges', type: 'double' },
  { key: 'verwaltung_sigleKuhn', type: 'double' },
  { key: 'verwaltung_brzSteuerberater', type: 'double' },
  { key: 'verwaltung_kostenVorndran', type: 'double' },
  { key: 'verwaltung_telefonCloudServer', type: 'double' },
  { key: 'verwaltung_gewerbesteuer', type: 'double' },
  { key: 'data', type: 'string', size: 10000 },
];

const variableKostenFields = [
  { key: 'lohnkosten_stundenlohn', type: 'double' },
  { key: 'lohnkosten_tonnenProArbeitsstunde', type: 'double' },
  { key: 'einkauf_dieselKostenProTonne', type: 'double' },
  { key: 'einkauf_ziegelbruchKostenProTonne', type: 'double' },
  { key: 'einkauf_stromKostenProTonne', type: 'double' },
  { key: 'einkauf_entsorgungContainerKostenProTonne', type: 'double' },
  { key: 'einkauf_gasflaschenKostenProTonne', type: 'double' },
  { key: 'verschleissteile_preisProHammer', type: 'double' },
  { key: 'verschleissteile_verbrauchHaemmerProTonne', type: 'double' },
  { key: 'verschleissteile_siebkoerbeKostenProTonne', type: 'double' },
  { key: 'verschleissteile_verschleissblecheKostenProTonne', type: 'double' },
  { key: 'verschleissteile_wellenlagerKostenProTonne', type: 'double' },
  { key: 'sackware_palettenKostenProPalette', type: 'double' },
  { key: 'sackware_saeckeKostenProPalette', type: 'double' },
  { key: 'sackware_schrumpfhaubenKostenProPalette', type: 'double' },
  { key: 'sackware_palettenProTonne', type: 'double' },
  { key: 'verkaufspreis1_tonnen', type: 'double' },
  { key: 'verkaufspreis1_preisProTonne', type: 'double' },
  { key: 'verkaufspreis2_tonnen', type: 'double' },
  { key: 'verkaufspreis2_preisProTonne', type: 'double' },
  { key: 'verkaufspreis3_tonnen', type: 'double' },
  { key: 'verkaufspreis3_preisProTonne', type: 'double' },
  { key: 'geplanterUmsatz', type: 'double' },
  { key: 'data', type: 'string', size: 10000 },
];

const kundenFields = [
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
];

const kundenAktivitaetenFields = [
  { key: 'kundeId', type: 'string', size: 100, required: true },
  { key: 'typ', type: 'string', size: 50, required: true },
  { key: 'titel', type: 'string', size: 500, required: true },
  { key: 'beschreibung', type: 'string', size: 2000 },
  { key: 'dateiId', type: 'string', size: 100 },
  { key: 'dateiName', type: 'string', size: 500 },
  { key: 'dateiTyp', type: 'string', size: 200 },
  { key: 'dateiGroesse', type: 'integer' },
  { key: 'erstelltAm', type: 'string', size: 50 },
  { key: 'erstelltVon', type: 'string', size: 100 },
  { key: 'data', type: 'string', size: 10000 },
];

// ⚠️ WICHTIG: Nur 8 Basis-Felder für Projekte anlegen!
// Appwrite hat ein Attribut-Limit pro Collection.
// Alle anderen Daten werden im 'data'-JSON gespeichert.
// Siehe: APPWRITE_COLLECTION_PROJEKTE.md
const projekteFields = [
  { key: 'projektName', type: 'string', size: 255, required: true },
  { key: 'kundeId', type: 'string', size: 255, required: true },
  { key: 'kundenname', type: 'string', size: 255, required: true },
  { key: 'saisonjahr', type: 'integer', required: true },
  { key: 'status', type: 'string', size: 50, required: true },
  { key: 'erstelltAm', type: 'string', size: 50, required: true },
  { key: 'geaendertAm', type: 'string', size: 50, required: true },
  { key: 'data', type: 'string', size: 100000, required: true },
];

const artikelFields = [
  { key: 'artikelnummer', type: 'string', size: 100, required: true },
  { key: 'bezeichnung', type: 'string', size: 500, required: true },
  { key: 'beschreibung', type: 'string', size: 2000 },
  { key: 'einheit', type: 'string', size: 50, required: true },
  { key: 'einzelpreis', type: 'double', required: false }, // Optional - für Preise auf Anfrage
  { key: 'erstelltAm', type: 'string', size: 50 },
  { key: 'aktualisiertAm', type: 'string', size: 50 },
];

const stammdatenFields = [
  // Firmendaten (keine Pflichtfelder, damit flexibles Speichern möglich ist)
  { key: 'firmenname', type: 'string', size: 500, required: false },
  { key: 'firmenstrasse', type: 'string', size: 500, required: false },
  { key: 'firmenPlz', type: 'string', size: 20, required: false },
  { key: 'firmenOrt', type: 'string', size: 200, required: false },
  { key: 'firmenTelefon', type: 'string', size: 100, required: false },
  { key: 'firmenEmail', type: 'string', size: 320, required: false },
  { key: 'firmenWebsite', type: 'string', size: 500 },

  // Geschäftsführung (Array für mehrere Geschäftsführer)
  { key: 'geschaeftsfuehrer', type: 'string', size: 500, required: false, array: true },

  // Handelsregister
  { key: 'handelsregister', type: 'string', size: 200, required: false },
  { key: 'sitzGesellschaft', type: 'string', size: 200, required: false },

  // Steuerdaten
  { key: 'steuernummer', type: 'string', size: 100 },
  { key: 'ustIdNr', type: 'string', size: 100, required: false },

  // Bankdaten
  { key: 'bankname', type: 'string', size: 500, required: false },
  { key: 'iban', type: 'string', size: 100, required: false },
  { key: 'bic', type: 'string', size: 100, required: false },

  // Werk/Verkauf (optional)
  { key: 'werkName', type: 'string', size: 500 },
  { key: 'werkStrasse', type: 'string', size: 500 },
  { key: 'werkPlz', type: 'string', size: 20 },
  { key: 'werkOrt', type: 'string', size: 200 },

  // E-Mail-Templates (als JSON-String)
  { key: 'emailTemplates', type: 'string', size: 10000 },

  // WICHTIG: Dokumentnummern-Zähler für Nummerierungssystem
  // Diese Felder werden verwendet, um eindeutige, fortlaufende Nummern zu generieren
  { key: 'angebotZaehler', type: 'integer', default: 0 },
  { key: 'auftragsbestaetigungZaehler', type: 'integer', default: 0 },
  { key: 'lieferscheinZaehler', type: 'integer', default: 0 },
  { key: 'rechnungZaehler', type: 'integer', default: 0 },
  { key: 'jahr', type: 'integer', default: 2026 },

  // Metadaten
  { key: 'erstelltAm', type: 'string', size: 50 },
  { key: 'aktualisiertAm', type: 'string', size: 50 },
];

// Wiki Pages Collection
const wikiPagesFields = [
  { key: 'title', type: 'string', size: 500, required: true },
  { key: 'slug', type: 'string', size: 500, required: true },
  { key: 'content', type: 'string', size: 100000 },
  { key: 'description', type: 'string', size: 1000 },
  { key: 'icon', type: 'string', size: 50 },
  { key: 'category', type: 'string', size: 50 },
  { key: 'tags', type: 'string', size: 2000 },
  { key: 'parentId', type: 'string', size: 100 },
  { key: 'sortOrder', type: 'integer', default: 0 },
  { key: 'isPublished', type: 'boolean', default: true },
  { key: 'isPinned', type: 'boolean', default: false },
  { key: 'viewCount', type: 'integer', default: 0 },
  { key: 'createdBy', type: 'string', size: 100 },
  { key: 'lastEditedBy', type: 'string', size: 100 },
];

// Wiki Files Collection
const wikiFilesFields = [
  { key: 'pageId', type: 'string', size: 100, required: true },
  { key: 'fileName', type: 'string', size: 500, required: true },
  { key: 'fileId', type: 'string', size: 100, required: true },
  { key: 'mimeType', type: 'string', size: 200 },
  { key: 'size', type: 'integer' },
  { key: 'uploadedBy', type: 'string', size: 100 },
  { key: 'uploadTime', type: 'string', size: 50 },
];

async function createField(collectionId, field) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
    };

    let body = {
      key: field.key,
      required: field.required || false,
      default: field.default ?? null,
      array: field.array || false,
    };

    if (field.type === 'string') {
      body.size = field.size || 500;
    }

    // Appwrite verwendet 'float' statt 'double' in der API
    const apiType = field.type === 'double' ? 'float' : field.type;

    const response = await fetch(
      `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/attributes/${apiType}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );

    if (response.ok) {
      console.log(`✅ Feld erstellt: ${field.key}`);
      // Warte auf die Verarbeitung durch Appwrite
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } else if (response.status === 409) {
      console.log(`⏭️  Feld existiert bereits: ${field.key}`);
      return false;
    } else {
      const error = await response.json();
      console.error(`❌ Fehler beim Erstellen von ${field.key}:`, error.message || error);
      return false;
    }
  } catch (error) {
    console.error(`❌ Fehler beim Erstellen von ${field.key}:`, error.message || error);
    return false;
  }
}

async function setupCollection(collectionId, collectionName, fields) {
  console.log(`\n📦 Setup für Collection: ${collectionName} (${collectionId})`);
  console.log(`   Erstelle ${fields.length} Felder...\n`);

  for (const field of fields) {
    await createField(collectionId, field);
    // Kurze Pause zwischen den Requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function ensureCollection(collectionId, name) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  // Prüfe ob Collection existiert
  const checkRes = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}`,
    { method: 'GET', headers }
  );

  if (checkRes.ok) {
    console.log(`✓ Collection existiert bereits: ${collectionId}`);
    return;
  }

  if (checkRes.status !== 404) {
    console.warn(`⚠️ Konnte Collection ${collectionId} nicht prüfen (${checkRes.status}).`);
    return;
  }

  // Collection existiert nicht, erstelle sie
  console.log(`📦 Erstelle fehlende Collection ${collectionId} (${name}) ...`);
  const createRes = await fetch(`${endpoint}/databases/${DATABASE_ID}/collections`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      collectionId,
      name,
      documentSecurity: true,
      permissions: [],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    console.error(
      `❌ Collection ${collectionId} konnte nicht angelegt werden:`,
      err.message || createRes.status
    );
    return;
  }
  console.log(`✅ Collection erstellt: ${collectionId}`);
  // Warte kurz nach dem Erstellen
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function ensureBucket(bucketId, name) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  const res = await fetch(
    `${endpoint}/storage/buckets/${bucketId}`,
    { method: 'GET', headers }
  );

  if (res.ok) {
    console.log(`✓ Bucket existiert bereits: ${bucketId}`);
    return;
  }

  if (res.status !== 404) {
    console.warn(`⚠️ Konnte Bucket ${bucketId} nicht prüfen (${res.status}).`);
    return;
  }

  console.log(`📦 Erstelle fehlenden Bucket ${bucketId} (${name}) ...`);
  const createRes = await fetch(`${endpoint}/storage/buckets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      bucketId,
      name,
      permissions: ['read("any")', 'create("users")', 'update("users")', 'delete("users")'],
      fileSecurity: false,
      maximumFileSize: 52428800, // 50MB
      allowedFileExtensions: [],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    console.error(`❌ Bucket ${bucketId} konnte nicht angelegt werden:`, err.message || createRes.status);
    return;
  }
  console.log(`✅ Bucket erstellt: ${bucketId}`);
}

async function ensureIndex(collectionId, indexKey, attributes) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  // Prüfen ob Index existiert
  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/indexes`,
    { method: 'GET', headers }
  );

  if (res.ok) {
    const data = await res.json();
    const existingIndex = data.indexes?.find(idx => idx.key === indexKey);
    if (existingIndex) {
      console.log(`✓ Index existiert bereits: ${indexKey}`);
      return;
    }
  }

  console.log(`📇 Erstelle Index ${indexKey} für Collection ${collectionId} ...`);
  const createRes = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/indexes`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key: indexKey,
        type: 'key',
        attributes,
        orders: attributes.map(() => 'ASC'),
      }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    console.warn(`⚠️ Index ${indexKey} konnte nicht angelegt werden:`, err.message || createRes.status);
    return;
  }
  console.log(`✅ Index erstellt: ${indexKey}`);
}

async function main() {
  console.log('🚀 Starte Appwrite Field Setup...\n');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project ID: ${projectId}\n`);

  try {
    // Erstelle Collections falls sie nicht existieren
    await ensureCollection(FIXKOSTEN_COLLECTION_ID, 'Fixkosten');
    await ensureCollection(VARIABLE_KOSTEN_COLLECTION_ID, 'Variable Kosten');
    await ensureCollection(KUNDEN_COLLECTION_ID, 'Kunden');
    await ensureCollection(KUNDEN_AKTIVITAETEN_COLLECTION_ID, 'Kunden Aktivitäten');
    await ensureCollection(PROJEKTE_COLLECTION_ID, 'Projekte');
    await ensureCollection(ARTIKEL_COLLECTION_ID, 'Artikel');
    await ensureCollection(STAMMDATEN_COLLECTION_ID, 'Stammdaten');
    await ensureCollection(WIKI_PAGES_COLLECTION_ID, 'Wiki Pages');
    await ensureCollection(WIKI_FILES_COLLECTION_ID, 'Wiki Files');

    // Erstelle Bucket für Wiki-Dateien
    await ensureBucket(WIKI_DATEIEN_BUCKET_ID, 'Wiki Dateien');

    console.log('\n📝 Erstelle Felder...\n');

    // Erstelle Felder
    await setupCollection(FIXKOSTEN_COLLECTION_ID, 'Fixkosten', fixkostenFields);
    await setupCollection(VARIABLE_KOSTEN_COLLECTION_ID, 'Variable Kosten', variableKostenFields);
    await setupCollection(KUNDEN_COLLECTION_ID, 'Kunden', kundenFields);
    await setupCollection(KUNDEN_AKTIVITAETEN_COLLECTION_ID, 'Kunden Aktivitäten', kundenAktivitaetenFields);
    await setupCollection(PROJEKTE_COLLECTION_ID, 'Projekte', projekteFields);
    await setupCollection(ARTIKEL_COLLECTION_ID, 'Artikel', artikelFields);
    await setupCollection(STAMMDATEN_COLLECTION_ID, 'Stammdaten', stammdatenFields);
    await setupCollection(WIKI_PAGES_COLLECTION_ID, 'Wiki Pages', wikiPagesFields);
    await setupCollection(WIKI_FILES_COLLECTION_ID, 'Wiki Files', wikiFilesFields);

    // Warte kurz, damit Felder erstellt sind
    console.log('\n⏳ Warte auf Feld-Erstellung...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Erstelle Indizes für Wiki
    console.log('\n📇 Erstelle Indizes...\n');
    await ensureIndex(WIKI_FILES_COLLECTION_ID, 'pageId_index', ['pageId']);
    await ensureIndex(WIKI_PAGES_COLLECTION_ID, 'slug_index', ['slug']);

    console.log('\n✨ Setup abgeschlossen!');
    console.log('\n⚠️  WICHTIG: Warte einige Sekunden, bis Appwrite die Felder vollständig erstellt hat.');
    console.log('   Danach kannst du die App verwenden.\n');
  } catch (error) {
    console.error('\n❌ Fehler beim Setup:', error);
    process.exit(1);
  }
}

main();

