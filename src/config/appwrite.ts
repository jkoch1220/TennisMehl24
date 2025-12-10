import { Client, Databases, Storage, Account } from 'appwrite';

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
// Saisonplanung Collections
export const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';
export const SAISON_ANSPRECHPARTNER_COLLECTION_ID = 'saison_ansprechpartner';
export const SAISON_DATEN_COLLECTION_ID = 'saison_daten';
export const SAISON_BEZIEHUNGEN_COLLECTION_ID = 'saison_beziehungen';
export const SAISON_AKTIVITAETEN_COLLECTION_ID = 'saison_aktivitaeten';
export const PROJEKTE_COLLECTION_ID = 'projekte';
export const ARTIKEL_COLLECTION_ID = 'artikel';
export const STAMMDATEN_COLLECTION_ID = 'stammdaten';
export const BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';
export const USER_PERMISSIONS_COLLECTION_ID = 'user_permissions';

// Collections Objekt für einfachen Zugriff
export const COLLECTIONS = {
  FIXKOSTEN: FIXKOSTEN_COLLECTION_ID,
  VARIABLE_KOSTEN: VARIABLE_KOSTEN_COLLECTION_ID,
  LIEFERUNGEN: LIEFERUNGEN_COLLECTION_ID,
  ROUTEN: ROUTEN_COLLECTION_ID,
  FAHRZEUGE: FAHRZEUGE_COLLECTION_ID,
  KUNDEN: KUNDEN_COLLECTION_ID,
  BESTELLUNGEN: BESTELLUNGEN_COLLECTION_ID,
  KREDITOREN: KREDITOREN_COLLECTION_ID,
  OFFENE_RECHNUNGEN: OFFENE_RECHNUNGEN_COLLECTION_ID,
  RECHNUNGS_AKTIVITAETEN: RECHNUNGS_AKTIVITAETEN_COLLECTION_ID,
  TICKETS: TICKETS_COLLECTION_ID,
  TODOS: TODOS_COLLECTION_ID,
  KONKURRENTEN: KONKURRENTEN_COLLECTION_ID,
  WIKI_PAGES: WIKI_PAGES_COLLECTION_ID,
  WIKI_FILES: WIKI_FILES_COLLECTION_ID,
  LAGER: LAGER_COLLECTION_ID,
  KUNDEN_AKTIVITAETEN: KUNDEN_AKTIVITAETEN_COLLECTION_ID,
  SAISON_KUNDEN: SAISON_KUNDEN_COLLECTION_ID,
  SAISON_ANSPRECHPARTNER: SAISON_ANSPRECHPARTNER_COLLECTION_ID,
  SAISON_DATEN: SAISON_DATEN_COLLECTION_ID,
  SAISON_BEZIEHUNGEN: SAISON_BEZIEHUNGEN_COLLECTION_ID,
  SAISON_AKTIVITAETEN: SAISON_AKTIVITAETEN_COLLECTION_ID,
  PROJEKTE: PROJEKTE_COLLECTION_ID,
  ARTIKEL: ARTIKEL_COLLECTION_ID,
  STAMMDATEN: STAMMDATEN_COLLECTION_ID,
  BESTELLABWICKLUNG_DOKUMENTE: BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
  USER_PERMISSIONS: USER_PERMISSIONS_COLLECTION_ID,
};

// Storage Bucket IDs
export const RECHNUNGS_DATEIEN_BUCKET_ID = 'rechnungs-dateien';
export const WIKI_DATEIEN_BUCKET_ID = 'wiki-dateien';
export const KUNDEN_DATEIEN_BUCKET_ID = 'kunden-dateien';
export const BESTELLABWICKLUNG_DATEIEN_BUCKET_ID = 'bestellabwicklung_dateien';

// Dokument-ID für die einzigen Datensätze (wir speichern jeweils nur einen Datensatz)
export const FIXKOSTEN_DOCUMENT_ID = 'fixkosten_data';
export const VARIABLE_KOSTEN_DOCUMENT_ID = 'variable_kosten_data';
export const STAMMDATEN_DOCUMENT_ID = 'stammdaten_data';

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
export const account = new Account(client);
export { client };

// Debug: Zeige Konfiguration in Development
if (import.meta.env.DEV) {
  console.log('✅ Appwrite konfiguriert:', {
    endpoint,
    projectId,
    databaseId: DATABASE_ID,
  });
}

