/**
 * Automatisches Setup der Appwrite Collection-Felder
 * Wird beim ersten App-Start ausgeführt
 */

import {
  DATABASE_ID,
  FIXKOSTEN_COLLECTION_ID,
  VARIABLE_KOSTEN_COLLECTION_ID,
  LIEFERUNGEN_COLLECTION_ID,
  ROUTEN_COLLECTION_ID,
  FAHRZEUGE_COLLECTION_ID,
  KUNDEN_COLLECTION_ID,
  BESTELLUNGEN_COLLECTION_ID,
  LAGER_COLLECTION_ID,
  KUNDEN_AKTIVITAETEN_COLLECTION_ID,
} from '../config/appwrite';

// Verwende die REST API direkt für Management-Operationen
const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = import.meta.env.VITE_APPWRITE_API_KEY;

const APPWRITE_SETUP_VERSION = '4';

type FieldConfig = {
  key: string;
  type: 'string' | 'integer' | 'double' | 'boolean';
  size?: number;
  required?: boolean;
  default?: string | number | boolean | null;
  array?: boolean;
  elements?: string[];
};

// Felder für fixkosten Collection
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
];

// Felder für variable_kosten Collection
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
];

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
    const kundenCollections: Array<{ id: string; fields: FieldConfig[] }> = [
      { id: KUNDEN_COLLECTION_ID, fields: kundenFields },
      { id: KUNDEN_AKTIVITAETEN_COLLECTION_ID, fields: kundenAktivitaetenFields },
    ];

    for (const { id, fields } of kundenCollections) {
      for (const field of fields) {
        await createFieldViaAPI(id, field);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // Nur das Pflicht-data-Feld noch für Kunden ergänzen (falls fehlt)
    await createFieldViaAPI(KUNDEN_COLLECTION_ID, { key: 'data', type: 'string' });
    await createFieldViaAPI(KUNDEN_AKTIVITAETEN_COLLECTION_ID, { key: 'data', type: 'string' });

    console.log('✅ Appwrite Field Setup (Kunden) abgeschlossen!');
  } catch (error) {
    console.error('❌ Fehler beim Appwrite Setup:', error);
  }
}

