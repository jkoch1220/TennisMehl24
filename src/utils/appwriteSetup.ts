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
} from '../config/appwrite';

// Verwende die REST API direkt für Management-Operationen
const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = import.meta.env.VITE_APPWRITE_API_KEY;

const APPWRITE_SETUP_VERSION = '7';

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

// Saisonplanung Collections (Minimalfelder für Filter)
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
    ];

    for (const { id, name, fields } of kundenCollections) {
      await ensureCollection(id, name);
      for (const field of fields) {
        await createFieldViaAPI(id, field);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log('✅ Appwrite Field Setup (Kunden + Saison) abgeschlossen!');
  } catch (error) {
    console.error('❌ Fehler beim Appwrite Setup:', error);
  }
}

