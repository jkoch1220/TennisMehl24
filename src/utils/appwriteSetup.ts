/**
 * Automatisches Setup der Appwrite Collection-Felder
 * Wird beim ersten App-Start ausgeführt
 */

import {
  DATABASE_ID,
  KUNDEN_COLLECTION_ID,
  KUNDEN_AKTIVITAETEN_COLLECTION_ID,
  SAISON_KUNDEN_COLLECTION_ID,
  SAISON_ANSPRECHPARTNER_COLLECTION_ID,
  SAISON_DATEN_COLLECTION_ID,
  SAISON_BEZIEHUNGEN_COLLECTION_ID,
  SAISON_AKTIVITAETEN_COLLECTION_ID,
  PROJEKTE_COLLECTION_ID,
  ARTIKEL_COLLECTION_ID,
  STAMMDATEN_COLLECTION_ID,
  LIEFERANTEN_COLLECTION_ID,
  KALENDER_COLLECTION_ID,
  WIKI_PAGES_COLLECTION_ID,
  WIKI_FILES_COLLECTION_ID,
  WIKI_DATEIEN_BUCKET_ID,
  NEWSLETTER_COLLECTION_ID,
  SIEBANALYSEN_COLLECTION_ID,
} from '../config/appwrite';

// Verwende die REST API direkt für Management-Operationen
const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = import.meta.env.VITE_APPWRITE_API_KEY;

const APPWRITE_SETUP_VERSION = '18'; // Siebanalysen Collection für QS-Tool

type FieldConfig = {
  key: string;
  type: 'string' | 'integer' | 'double' | 'boolean';
  size?: number;
  required?: boolean;
  default?: string | number | boolean | null;
  array?: boolean;
  elements?: string[];
};

// Felder für Kunden-Liste Collection
const kundenFields: FieldConfig[] = [
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

const kundenAktivitaetenFields: FieldConfig[] = [
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

// Kundenliste Collections (Minimalfelder für Filter)
const saisonKundenFields: FieldConfig[] = [
  { key: 'data', type: 'string', size: 10000 },
];

const saisonAnsprechpartnerFields: FieldConfig[] = [
  { key: 'kundeId', type: 'string', size: 100, required: true },
  { key: 'data', type: 'string', size: 10000 },
];

const saisonDatenFields: FieldConfig[] = [
  { key: 'kundeId', type: 'string', size: 100, required: true },
  { key: 'saisonjahr', type: 'integer', required: true },
  { key: 'data', type: 'string', size: 10000 },
];

const saisonBeziehungenFields: FieldConfig[] = [
  { key: 'vereinId', type: 'string', size: 100, required: true },
  { key: 'platzbauerId', type: 'string', size: 100, required: true },
  { key: 'data', type: 'string', size: 10000 },
];

const saisonAktivitaetenFields: FieldConfig[] = [
  { key: 'kundeId', type: 'string', size: 100, required: true },
  { key: 'erstelltAm', type: 'string', size: 50 },
  { key: 'data', type: 'string', size: 10000 },
];

// Projekte Collection - MINIMAL (nur 7 Felder wegen Appwrite-Limit!)
// Alle anderen Daten werden im data-Feld als JSON gespeichert
const projekteFields: FieldConfig[] = [
  { key: 'kundeId', type: 'string', size: 255, required: true },
  { key: 'kundenname', type: 'string', size: 255, required: true },
  { key: 'saisonjahr', type: 'integer', required: true },
  { key: 'status', type: 'string', size: 50, required: true },
  { key: 'erstelltAm', type: 'string', size: 50, required: true },
  { key: 'geaendertAm', type: 'string', size: 50, required: true },
  { key: 'data', type: 'string', size: 100000, required: true }, // Erhöht für Bestellabwicklungsdaten
];

const artikelFields: FieldConfig[] = [
  { key: 'artikelnummer', type: 'string', size: 100, required: true },
  { key: 'bezeichnung', type: 'string', size: 500, required: true },
  { key: 'beschreibung', type: 'string', size: 2000 },
  { key: 'einheit', type: 'string', size: 50, required: true },
  { key: 'einzelpreis', type: 'double', required: false }, // Optional - kann weggelassen werden
  { key: 'erstelltAm', type: 'string', size: 50 },
  { key: 'aktualisiertAm', type: 'string', size: 50 },
];

const lieferantenFields: FieldConfig[] = [
  { key: 'data', type: 'string', size: 10000 },
];

// Kalender Collection
const kalenderFields: FieldConfig[] = [
  { key: 'titel', type: 'string', size: 500, required: true },
  { key: 'beschreibung', type: 'string', size: 2000 },
  { key: 'startDatum', type: 'string', size: 50, required: true },
  { key: 'endDatum', type: 'string', size: 50, required: true },
  { key: 'ganztaegig', type: 'boolean', default: false },
  { key: 'farbe', type: 'string', size: 50 },
  { key: 'ort', type: 'string', size: 500 },
  { key: 'wiederholung', type: 'string', size: 50, default: 'keine' },
  { key: 'wiederholungEnde', type: 'string', size: 50 },
  { key: 'erinnerung', type: 'integer', default: 0 },
  { key: 'erstelltAm', type: 'string', size: 50, required: true },
  { key: 'geaendertAm', type: 'string', size: 50, required: true },
  { key: 'erstelltVon', type: 'string', size: 100 },
  { key: 'data', type: 'string', size: 10000 },
];

const stammdatenFields: FieldConfig[] = [
  // Firmendaten - ALLE OPTIONAL
  { key: 'firmenname', type: 'string', size: 500, required: false },
  { key: 'firmenstrasse', type: 'string', size: 500, required: false },
  { key: 'firmenPlz', type: 'string', size: 20, required: false },
  { key: 'firmenOrt', type: 'string', size: 200, required: false },
  { key: 'firmenTelefon', type: 'string', size: 100, required: false },
  { key: 'firmenEmail', type: 'string', size: 320, required: false },
  { key: 'firmenWebsite', type: 'string', size: 500 },
  
  // Geschäftsführung (Array für mehrere Geschäftsführer) - OPTIONAL
  { key: 'geschaeftsfuehrer', type: 'string', size: 500, required: false, array: true },
  
  // Handelsregister - OPTIONAL
  { key: 'handelsregister', type: 'string', size: 200, required: false },
  { key: 'sitzGesellschaft', type: 'string', size: 200, required: false },
  
  // Steuerdaten - OPTIONAL
  { key: 'steuernummer', type: 'string', size: 100 },
  { key: 'ustIdNr', type: 'string', size: 100, required: false },
  
  // Bankdaten - OPTIONAL
  { key: 'bankname', type: 'string', size: 500, required: false },
  { key: 'iban', type: 'string', size: 100, required: false },
  { key: 'bic', type: 'string', size: 100, required: false },
  
  // Werk/Verkauf (optional)
  { key: 'werkName', type: 'string', size: 500 },
  { key: 'werkStrasse', type: 'string', size: 500 },
  { key: 'werkPlz', type: 'string', size: 20 },
  { key: 'werkOrt', type: 'string', size: 200 },
  
  // Dokumentnummern-Zähler (für Angebote, Lieferscheine, Rechnungen)
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
const wikiPagesFields: FieldConfig[] = [
  { key: 'title', type: 'string', size: 500, required: true },
  { key: 'slug', type: 'string', size: 500, required: true },
  { key: 'content', type: 'string', size: 100000 }, // HTML-Inhalt
  { key: 'description', type: 'string', size: 1000 },
  { key: 'icon', type: 'string', size: 50 },
  { key: 'category', type: 'string', size: 50 },
  { key: 'tags', type: 'string', size: 2000 }, // JSON Array als String
  { key: 'parentId', type: 'string', size: 100 },
  { key: 'sortOrder', type: 'integer', default: 0 },
  { key: 'isPublished', type: 'boolean', default: true },
  { key: 'isPinned', type: 'boolean', default: false },
  { key: 'viewCount', type: 'integer', default: 0 },
  { key: 'createdBy', type: 'string', size: 100 },
  { key: 'lastEditedBy', type: 'string', size: 100 },
];

// Wiki Files Collection
const wikiFilesFields: FieldConfig[] = [
  { key: 'pageId', type: 'string', size: 100, required: true },
  { key: 'fileName', type: 'string', size: 500, required: true },
  { key: 'fileId', type: 'string', size: 100, required: true },
  { key: 'mimeType', type: 'string', size: 200 },
  { key: 'size', type: 'integer' },
  { key: 'uploadedBy', type: 'string', size: 100 },
  { key: 'uploadTime', type: 'string', size: 50 },
];

// Newsletter Subscribers Collection
const newsletterFields: FieldConfig[] = [
  { key: 'email', type: 'string', size: 320, required: true },
  { key: 'name', type: 'string', size: 200 },
  { key: 'status', type: 'string', size: 20, required: true }, // 'active' | 'unsubscribed'
  { key: 'unsubscribeToken', type: 'string', size: 100, required: true }, // Eindeutiger Token für Abmeldelink
  { key: 'source', type: 'string', size: 50 }, // 'excel-import' | 'manual' | 'website'
  { key: 'tags', type: 'string', size: 500 }, // Komma-getrennte Tags für Segmentierung
  { key: 'notes', type: 'string', size: 1000 },
  { key: 'subscribedAt', type: 'string', size: 50, required: true },
  { key: 'unsubscribedAt', type: 'string', size: 50 },
  { key: 'lastEmailSentAt', type: 'string', size: 50 },
  { key: 'emailsSentCount', type: 'integer', default: 0 },
];

// Siebanalysen Collection für QS-Tool (Tennismehl 0/2 nach DIN 18035-5)
const siebanalysenFields: FieldConfig[] = [
  { key: 'data', type: 'string', size: 50000 }, // Alle Daten als JSON
];

async function ensureIndex(collectionId: string, indexKey: string, attributes: string[], type: 'key' | 'unique' | 'fulltext' = 'key') {
  if (!apiKey) return;
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId!,
    'X-Appwrite-Key': apiKey!,
  };

  // Prüfen ob Index existiert
  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/indexes`,
    { method: 'GET', headers }
  );

  if (res.ok) {
    const data = await res.json();
    const existingIndex = data.indexes?.find((idx: { key: string }) => idx.key === indexKey);
    if (existingIndex) return; // Index existiert bereits
  }

  console.log(`📇 Erstelle Index ${indexKey} für Collection ${collectionId} ...`);
  const createRes = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/indexes`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key: indexKey,
        type,
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

async function ensureBucket(bucketId: string, name: string) {
  if (!apiKey) return;
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId!,
    'X-Appwrite-Key': apiKey!,
  };

  const res = await fetch(
    `${endpoint}/storage/buckets/${bucketId}`,
    { method: 'GET', headers }
  );
  if (res.ok) return;
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
      allowedFileExtensions: [], // Alle erlauben
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    console.error(
      `❌ Bucket ${bucketId} konnte nicht angelegt werden:`,
      err.message || createRes.status
    );
    return;
  }
  console.log(`✅ Bucket erstellt: ${bucketId}`);
}

async function ensureCollection(collectionId: string, name: string) {
  if (!apiKey) return;
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId!,
    'X-Appwrite-Key': apiKey!,
  };

  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}`,
    { method: 'GET', headers }
  );
  if (res.ok) return;
  if (res.status !== 404) {
    console.warn(`⚠️ Konnte Collection ${collectionId} nicht prüfen (${res.status}).`);
    return;
  }

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
}

async function createFieldViaAPI(collectionId: string, field: FieldConfig) {
  if (!apiKey) {
    console.warn('⚠️ API Key nicht gesetzt - Felder können nicht automatisch erstellt werden');
    return false;
  }

  try {
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

    if (field.elements?.length) {
      body.elements = field.elements;
    }

    const response = await fetch(
      `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/attributes/${field.type}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Appwrite-Project': projectId,
          'X-Appwrite-Key': apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    if (response.ok) {
      console.log(`✅ Feld erstellt: ${field.key}`);
      return true;
    } else if (response.status === 409) {
      // Feld existiert bereits
      return false;
    } else {
      const error = await response.json();
      console.warn(`⚠️ Konnte Feld ${field.key} nicht erstellen:`, error.message);
      return false;
    }
  } catch (error) {
    console.warn(`⚠️ Fehler beim Erstellen von ${field.key}:`, error);
    return false;
  }
}

export async function setupAppwriteFields() {
  // Prüfe ob Setup bereits durchgeführt wurde
  const setupDone = localStorage.getItem('appwrite_setup_version');
  if (setupDone === APPWRITE_SETUP_VERSION) {
    return; // Setup bereits durchgeführt
  }

  if (!apiKey) {
    console.warn('⚠️ VITE_APPWRITE_API_KEY nicht gesetzt - Felder müssen manuell erstellt werden');
    return;
  }

  console.log('🚀 Starte automatisches Appwrite Field Setup...');

  // Schutz gegen Wiederholungen bei Fehlern: direkt markieren, damit kein Loop entsteht
  localStorage.setItem('appwrite_setup_version', APPWRITE_SETUP_VERSION);

  try {
    // Nur Kunden-relevante Felder anlegen, um 404-Schleifen zu vermeiden
    const kundenCollections: Array<{ id: string; name: string; fields: FieldConfig[] }> = [
      { id: KUNDEN_COLLECTION_ID, name: 'Kunden', fields: kundenFields },
      { id: KUNDEN_AKTIVITAETEN_COLLECTION_ID, name: 'Kunden Aktivitäten', fields: kundenAktivitaetenFields },
      { id: SAISON_KUNDEN_COLLECTION_ID, name: 'Saison Kunden', fields: saisonKundenFields },
      {
        id: SAISON_ANSPRECHPARTNER_COLLECTION_ID,
        name: 'Saison Ansprechpartner',
        fields: saisonAnsprechpartnerFields,
      },
      { id: SAISON_DATEN_COLLECTION_ID, name: 'Saison Daten', fields: saisonDatenFields },
      { id: SAISON_BEZIEHUNGEN_COLLECTION_ID, name: 'Saison Beziehungen', fields: saisonBeziehungenFields },
      { id: SAISON_AKTIVITAETEN_COLLECTION_ID, name: 'Saison Aktivitäten', fields: saisonAktivitaetenFields },
      { id: PROJEKTE_COLLECTION_ID, name: 'Projekte', fields: projekteFields },
      { id: ARTIKEL_COLLECTION_ID, name: 'Artikel', fields: artikelFields },
      { id: STAMMDATEN_COLLECTION_ID, name: 'Stammdaten', fields: stammdatenFields },
      { id: LIEFERANTEN_COLLECTION_ID, name: 'Lieferanten', fields: lieferantenFields },
      { id: KALENDER_COLLECTION_ID, name: 'Kalender', fields: kalenderFields },
      { id: WIKI_PAGES_COLLECTION_ID, name: 'Wiki Pages', fields: wikiPagesFields },
      { id: WIKI_FILES_COLLECTION_ID, name: 'Wiki Files', fields: wikiFilesFields },
      { id: NEWSLETTER_COLLECTION_ID, name: 'Newsletter Subscribers', fields: newsletterFields },
      { id: SIEBANALYSEN_COLLECTION_ID, name: 'Siebanalysen QS', fields: siebanalysenFields },
    ];

    for (const { id, name, fields } of kundenCollections) {
      await ensureCollection(id, name);
      for (const field of fields) {
        await createFieldViaAPI(id, field);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // Wiki-Bucket erstellen
    await ensureBucket(WIKI_DATEIEN_BUCKET_ID, 'Wiki Dateien');

    // Warte kurz, damit Felder erstellt sind bevor Indizes angelegt werden
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Indizes für Wiki Files erstellen (für Query.equal auf pageId)
    await ensureIndex(WIKI_FILES_COLLECTION_ID, 'pageId_index', ['pageId']);

    // Index für Wiki Pages slug (für Query.equal auf slug)
    await ensureIndex(WIKI_PAGES_COLLECTION_ID, 'slug_index', ['slug']);

    // Indizes für Newsletter
    await ensureIndex(NEWSLETTER_COLLECTION_ID, 'email_index', ['email']);
    await ensureIndex(NEWSLETTER_COLLECTION_ID, 'token_index', ['unsubscribeToken'], 'unique');
    await ensureIndex(NEWSLETTER_COLLECTION_ID, 'status_index', ['status']);

    console.log('✅ Appwrite Field Setup abgeschlossen!');
  } catch (error) {
    console.error('❌ Fehler beim Appwrite Setup:', error);
  }
}

