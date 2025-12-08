import { Client, Databases, Storage } from 'appwrite';

// Database und Collection IDs (müssen zuerst definiert werden)
export const DATABASE_ID = 'tennismehl24_db';
export const FIXKOSTEN_COLLECTION_ID = 'fixkosten';
export const VARIABLE_KOSTEN_COLLECTION_ID = 'variable_kosten';
export const LIEFERUNGEN_COLLECTION_ID = 'lieferungen';
export const ROUTEN_COLLECTION_ID = 'routen';
export const FAHRZEUGE_COLLECTION_ID = 'fahrzeuge';
export const KUNDEN_COLLECTION_ID = 'kunden';
export const BESTELLUNGEN_COLLECTION_ID = 'bestellungen';
export const KREDITOREN_COLLECTION_ID = 'kreditoren';
export const OFFENE_RECHNUNGEN_COLLECTION_ID = 'offene_rechnungen';
export const RECHNUNGS_AKTIVITAETEN_COLLECTION_ID = 'rechnungs_aktivitaeten';
export const TICKETS_COLLECTION_ID = 'tickets';
export const TODOS_COLLECTION_ID = 'todos';
export const KONKURRENTEN_COLLECTION_ID = 'konkurrenten';
export const WIKI_PAGES_COLLECTION_ID = 'wiki_pages';
export const WIKI_FILES_COLLECTION_ID = 'wiki_files';
export const LAGER_COLLECTION_ID = 'lager_bestand';
export const KUNDEN_AKTIVITAETEN_COLLECTION_ID = 'kunden_aktivitaeten';

// Storage Bucket IDs
export const RECHNUNGS_DATEIEN_BUCKET_ID = 'rechnungs-dateien';
export const WIKI_DATEIEN_BUCKET_ID = 'wiki-dateien';
export const KUNDEN_DATEIEN_BUCKET_ID = 'kunden-dateien';

// Dokument-ID für die einzigen Datensätze (wir speichern jeweils nur einen Datensatz)
export const FIXKOSTEN_DOCUMENT_ID = 'fixkosten_data';
export const VARIABLE_KOSTEN_DOCUMENT_ID = 'variable_kosten_data';

const client = new Client();

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;

if (!endpoint || !projectId) {
  console.error('❌ Appwrite Konfiguration fehlt!');
  console.error('VITE_APPWRITE_ENDPOINT:', endpoint);
  console.error('VITE_APPWRITE_PROJECT_ID:', projectId);
  throw new Error('VITE_APPWRITE_ENDPOINT und VITE_APPWRITE_PROJECT_ID müssen gesetzt sein');
}

client.setEndpoint(endpoint).setProject(projectId);

export const databases = new Databases(client);
export const storage = new Storage(client);
export { client };

// Debug: Zeige Konfiguration in Development
if (import.meta.env.DEV) {
  console.log('✅ Appwrite konfiguriert:', {
    endpoint,
    projectId,
    databaseId: DATABASE_ID,
  });
}

