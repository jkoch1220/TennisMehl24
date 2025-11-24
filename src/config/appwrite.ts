import { Client, Databases } from 'appwrite';

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

// Debug: Zeige Konfiguration in Development
if (import.meta.env.DEV) {
  console.log('✅ Appwrite konfiguriert:', {
    endpoint,
    projectId,
    databaseId: DATABASE_ID,
  });
}

export const databases = new Databases(client);

// Database und Collection IDs
export const DATABASE_ID = 'tennismehl24_db';
export const FIXKOSTEN_COLLECTION_ID = 'fixkosten';
export const VARIABLE_KOSTEN_COLLECTION_ID = 'variable_kosten';

// Dokument-ID für die einzigen Datensätze (wir speichern jeweils nur einen Datensatz)
export const FIXKOSTEN_DOCUMENT_ID = 'fixkosten_data';
export const VARIABLE_KOSTEN_DOCUMENT_ID = 'variable_kosten_data';

