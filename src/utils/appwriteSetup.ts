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
} from '../config/appwrite';

// Verwende die REST API direkt für Management-Operationen
const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = import.meta.env.VITE_APPWRITE_API_KEY;

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


async function createFieldViaAPI(collectionId: string, field: { key: string; type: string }) {
  if (!apiKey) {
    console.warn('⚠️ API Key nicht gesetzt - Felder können nicht automatisch erstellt werden');
    return false;
  }

  try {
    const response = await fetch(
      `${endpoint}/databases/${DATABASE_ID}/collections/${collectionId}/attributes/${field.type}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Appwrite-Project': projectId,
          'X-Appwrite-Key': apiKey,
        },
        body: JSON.stringify({
          key: field.key,
          required: false,
          default: null,
        }),
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
  const setupDone = localStorage.getItem('appwrite_setup_done');
  if (setupDone === 'true') {
    return; // Setup bereits durchgeführt
  }

  if (!apiKey) {
    console.warn('⚠️ VITE_APPWRITE_API_KEY nicht gesetzt - Felder müssen manuell erstellt werden');
    return;
  }

  console.log('🚀 Starte automatisches Appwrite Field Setup...');

  try {
    // Setup fixkosten Collection
    for (const field of fixkostenFields) {
      await createFieldViaAPI(FIXKOSTEN_COLLECTION_ID, field);
      await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
    }

    // Setup variable_kosten Collection
    for (const field of variableKostenFields) {
      await createFieldViaAPI(VARIABLE_KOSTEN_COLLECTION_ID, field);
      await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
    }

    // Setup Collections mit JSON-String im data-Feld
    const dataCollections = [
      LIEFERUNGEN_COLLECTION_ID,
      ROUTEN_COLLECTION_ID,
      FAHRZEUGE_COLLECTION_ID,
      KUNDEN_COLLECTION_ID,
      BESTELLUNGEN_COLLECTION_ID,
      LAGER_COLLECTION_ID, // Dashboard Collection
    ];

    for (const collectionId of dataCollections) {
      await createFieldViaAPI(collectionId, { key: 'data', type: 'string' });
      await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
    }

    localStorage.setItem('appwrite_setup_done', 'true');
    console.log('✅ Appwrite Field Setup abgeschlossen!');
  } catch (error) {
    console.error('❌ Fehler beim Appwrite Setup:', error);
  }
}

