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
// Kundenliste Collections
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
export const LIEFERANTEN_COLLECTION_ID = 'lieferanten';
export const ANFRAGEN_COLLECTION_ID = 'anfragen';
export const KALENDER_COLLECTION_ID = 'kalender_termine';
export const UNIVERSA_ARTIKEL_COLLECTION_ID = 'universa_artikel';
export const NEWSLETTER_COLLECTION_ID = 'newsletter_subscribers';
export const SIEBANALYSEN_COLLECTION_ID = 'siebanalysen';
export const FAHRTEN_COLLECTION_ID = 'fahrten';
export const DEFAULT_STRECKEN_COLLECTION_ID = 'default_strecken';
export const LOGISTIKPARTNER_COLLECTION_ID = 'logistikpartner';
export const CHAT_NACHRICHTEN_COLLECTION_ID = 'chat_nachrichten';

// Instandhaltung Collections
export const INSTANDHALTUNG_CHECKLISTEN_COLLECTION_ID = 'instandhaltung_checklisten';
export const INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID = 'instandhaltung_begehungen';

// Private Kreditoren Collections
export const PRIVAT_RECHNUNGEN_JULIAN_COLLECTION_ID = 'privat_rechnungen_julian';
export const PRIVAT_KREDITOREN_JULIAN_COLLECTION_ID = 'privat_kreditoren_julian';
export const PRIVAT_AKTIVITAETEN_JULIAN_COLLECTION_ID = 'privat_aktivitaeten_julian';
export const PRIVAT_RECHNUNGEN_LUCA_COLLECTION_ID = 'privat_rechnungen_luca';
export const PRIVAT_KREDITOREN_LUCA_COLLECTION_ID = 'privat_kreditoren_luca';
export const PRIVAT_AKTIVITAETEN_LUCA_COLLECTION_ID = 'privat_aktivitaeten_luca';

// Schichtplanung Collections
export const SCHICHT_MITARBEITER_COLLECTION_ID = 'schicht_mitarbeiter';
export const SCHICHT_ZUWEISUNGEN_COLLECTION_ID = 'schicht_zuweisungen';

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
  LIEFERANTEN: LIEFERANTEN_COLLECTION_ID,
  ANFRAGEN: ANFRAGEN_COLLECTION_ID,
  KALENDER: KALENDER_COLLECTION_ID,
  UNIVERSA_ARTIKEL: UNIVERSA_ARTIKEL_COLLECTION_ID,
  NEWSLETTER: NEWSLETTER_COLLECTION_ID,
  SIEBANALYSEN: SIEBANALYSEN_COLLECTION_ID,
  FAHRTEN: FAHRTEN_COLLECTION_ID,
  DEFAULT_STRECKEN: DEFAULT_STRECKEN_COLLECTION_ID,
  LOGISTIKPARTNER: LOGISTIKPARTNER_COLLECTION_ID,
  CHAT_NACHRICHTEN: CHAT_NACHRICHTEN_COLLECTION_ID,
  // Instandhaltung
  INSTANDHALTUNG_CHECKLISTEN: INSTANDHALTUNG_CHECKLISTEN_COLLECTION_ID,
  INSTANDHALTUNG_BEGEHUNGEN: INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
  // Private Kreditoren
  PRIVAT_RECHNUNGEN_JULIAN: PRIVAT_RECHNUNGEN_JULIAN_COLLECTION_ID,
  PRIVAT_KREDITOREN_JULIAN: PRIVAT_KREDITOREN_JULIAN_COLLECTION_ID,
  PRIVAT_AKTIVITAETEN_JULIAN: PRIVAT_AKTIVITAETEN_JULIAN_COLLECTION_ID,
  PRIVAT_RECHNUNGEN_LUCA: PRIVAT_RECHNUNGEN_LUCA_COLLECTION_ID,
  PRIVAT_KREDITOREN_LUCA: PRIVAT_KREDITOREN_LUCA_COLLECTION_ID,
  PRIVAT_AKTIVITAETEN_LUCA: PRIVAT_AKTIVITAETEN_LUCA_COLLECTION_ID,
  // Schichtplanung
  SCHICHT_MITARBEITER: SCHICHT_MITARBEITER_COLLECTION_ID,
  SCHICHT_ZUWEISUNGEN: SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
};

// Storage Bucket IDs
export const RECHNUNGS_DATEIEN_BUCKET_ID = 'rechnungs-dateien';
export const WIKI_DATEIEN_BUCKET_ID = 'wiki-dateien';
export const KUNDEN_DATEIEN_BUCKET_ID = 'kunden-dateien';
export const BESTELLABWICKLUNG_DATEIEN_BUCKET_ID = 'bestellabwicklung_dateien';
export const PROJEKT_ANHAENGE_BUCKET_ID = 'projekt-anhaenge'; // Für Dispo: PDFs, Mails, Karten etc.
export const KONKURRENTEN_DATEIEN_BUCKET_ID = 'konkurrenten-dateien'; // Für Konkurrenten: Bilder, Dokumente

// Dokument-ID für die einzigen Datensätze (wir speichern jeweils nur einen Datensatz)
export const FIXKOSTEN_DOCUMENT_ID = 'fixkosten_data';
export const VARIABLE_KOSTEN_DOCUMENT_ID = 'variable_kosten_data';
export const STAMMDATEN_DOCUMENT_ID = 'stammdaten_data';

const client = new Client();

export const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT;
export const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;

const endpoint = APPWRITE_ENDPOINT;
const projectId = PROJECT_ID;

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

