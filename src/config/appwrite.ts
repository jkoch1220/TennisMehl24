import { Client, Databases, Storage, Account } from 'appwrite';
import { APPWRITE_ENDPOINT, PROJECT_ID, PRODUKTIONS_DATABASE_ID } from './appwriteEnv';
import { getDatabaseId, getBucketId, istMockModusAktiv } from './mockModus';

export { APPWRITE_ENDPOINT, PROJECT_ID };

/**
 * @deprecated Nicht mehr direkt verwenden.
 *
 * Für Appwrite-Aufrufe ist die Konstante bedeutungslos: der Proxy weiter unten
 * ersetzt die Datenbank-ID ohnehin bei jedem Call. `databases.listDocuments(
 * DATABASE_ID, ...)` funktioniert also weiterhin korrekt und landet im
 * Mock-Modus in der Sandbox.
 *
 * GEFÄHRLICH ist die Konstante überall dort, wo die ID in einen String gebaut
 * wird, der NICHT durch den Proxy läuft — vor allem Realtime-Kanäle. Dafür gibt
 * es `realtimeKanal()` aus `config/mockModus`.
 */
export const DATABASE_ID = PRODUKTIONS_DATABASE_ID;
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
export const FAHRTKOSTEN_PERSONEN_COLLECTION_ID = 'fahrtkosten_personen';
export const FAHRTKOSTEN_AUTOS_COLLECTION_ID = 'fahrtkosten_autos';
export const FAHRTKOSTEN_FIRMEN_COLLECTION_ID = 'fahrtkosten_firmen';
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

// Produktion Collection
export const PRODUKTION_COLLECTION_ID = 'produktion_eintraege';

// Platzbauer-Verwaltung Collections
export const PLATZBAUER_PROJEKTE_COLLECTION_ID = 'platzbauer_projekte';
export const PROJEKT_ZUORDNUNGEN_COLLECTION_ID = 'projekt_zuordnungen';
export const PLATZBAUER_DOKUMENTE_COLLECTION_ID = 'platzbauer_dokumente';
export const PLATZBAUER_LIEFERSCHEINE_COLLECTION_ID = 'platzbauer_lieferscheine';

// Instandsetzungsaufträge Collection (für "Direkt Platzbauer"-Kunden)
export const INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID = 'instandsetzungsauftraege';

// Debitorenverwaltung Collection
export const DEBITOREN_METADATEN_COLLECTION_ID = 'debitoren_metadaten';

// Mahnwesen Collection (Zahlungserinnerungen, Mahnungen)
export const MAHNWESEN_DOKUMENTE_COLLECTION_ID = 'mahnwesen_dokumente';

// Tourenplanung Collections
export const TOUREN_COLLECTION_ID = 'touren';
export const FAHRER_COLLECTION_ID = 'fahrer';

// Ziegelmehl Abgabe Collection (from dachziegelrueckgabe.de website)
export const ZIEGELMEHL_ABGABEN_COLLECTION_ID = 'ziegelmehl_abgaben';

// Shop Bestellungen Collection (Gambio Online-Shop)
export const SHOP_BESTELLUNGEN_COLLECTION_ID = 'shop_bestellungen';

// Shop E-Commerce Collections (Next.js Shop)
export const SHOP_PRODUKTE_COLLECTION_ID = 'shop_produkte';
export const SHOP_KATEGORIEN_COLLECTION_ID = 'shop_kategorien';
export const SHOP_RATGEBER_COLLECTION_ID = 'shop_ratgeber';

// Dieselpreis-Historie Collection
export const DIESELPREISE_COLLECTION_ID = 'dieselpreise';

// Mosaik-Migration (Staging für Migration aus altem ERP)
export const MIGRATION_KANDIDATEN_COLLECTION_ID = 'migration_kandidaten';

// Benachrichtigungen (persistenter Notification-Service)
export const NOTIFICATIONS_COLLECTION_ID = 'notifications';

// Protokoll der Massen-Angebots-Läufe (Frühjahrsinstandsetzung)
export const ANGEBOTS_LAEUFE_COLLECTION_ID = 'angebots_laeufe';

// Archiv der Kunden-Merges (Wiederherstellung nach Duplikat-Zusammenführung)
export const KUNDEN_MERGE_ARCHIV_COLLECTION_ID = 'kunden_merge_archiv';

// Rollenbasierte Benutzerverwaltung + zentrales Audit-Log
export const ROLES_COLLECTION_ID = 'roles';
export const AUDIT_LOG_COLLECTION_ID = 'audit_log';
export const AUDIT_LOG_ARCHIV_COLLECTION_ID = 'audit_log_archiv';

// Mindmap-Planungstool (ein Dokument pro Knoten/Task, geteilt für alle User)
export const MINDMAP_NODES_COLLECTION_ID = 'mindmap_nodes';
export const MINDMAP_BOARDS_COLLECTION_ID = 'mindmap_boards';
export const MINDMAP_GERAETE_COLLECTION_ID = 'mindmap_geraete';
export const MINDMAP_DURCHFUEHRUNGEN_COLLECTION_ID = 'mindmap_durchfuehrungen';
export const MINDMAP_SUBTASKS_COLLECTION_ID = 'mindmap_subtasks';
export const MINDMAP_ZEITEN_COLLECTION_ID = 'mindmap_zeiteintraege';

// Admin Changelog (privat für Julian - Arbeitsnachweis für Reviews)
export const ADMIN_CHANGELOG_COLLECTION_ID = 'admin_changelog';

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
  FAHRTKOSTEN_PERSONEN: FAHRTKOSTEN_PERSONEN_COLLECTION_ID,
  FAHRTKOSTEN_AUTOS: FAHRTKOSTEN_AUTOS_COLLECTION_ID,
  FAHRTKOSTEN_FIRMEN: FAHRTKOSTEN_FIRMEN_COLLECTION_ID,
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
// Produktion
  PRODUKTION: PRODUKTION_COLLECTION_ID,
  // Platzbauer-Verwaltung
  PLATZBAUER_PROJEKTE: PLATZBAUER_PROJEKTE_COLLECTION_ID,
  PROJEKT_ZUORDNUNGEN: PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
  PLATZBAUER_DOKUMENTE: PLATZBAUER_DOKUMENTE_COLLECTION_ID,
  PLATZBAUER_LIEFERSCHEINE: PLATZBAUER_LIEFERSCHEINE_COLLECTION_ID,
  // Instandsetzungsaufträge
  INSTANDSETZUNGSAUFTRAEGE: INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID,
  // Debitorenverwaltung
  DEBITOREN_METADATEN: DEBITOREN_METADATEN_COLLECTION_ID,
  // Mahnwesen
  MAHNWESEN_DOKUMENTE: MAHNWESEN_DOKUMENTE_COLLECTION_ID,
  // Tourenplanung
  TOUREN: TOUREN_COLLECTION_ID,
  FAHRER: FAHRER_COLLECTION_ID,
  // Ziegelmehl Abgabe (dachziegelrueckgabe.de)
  ZIEGELMEHL_ABGABEN: ZIEGELMEHL_ABGABEN_COLLECTION_ID,
  // Shop Bestellungen (Gambio Online-Shop)
  SHOP_BESTELLUNGEN: SHOP_BESTELLUNGEN_COLLECTION_ID,
  // Shop E-Commerce (Next.js Shop)
  SHOP_PRODUKTE: SHOP_PRODUKTE_COLLECTION_ID,
  SHOP_KATEGORIEN: SHOP_KATEGORIEN_COLLECTION_ID,
  SHOP_RATGEBER: SHOP_RATGEBER_COLLECTION_ID,
  // Dieselpreis-Historie
  DIESELPREISE: DIESELPREISE_COLLECTION_ID,
  // Mosaik-Migration
  MIGRATION_KANDIDATEN: MIGRATION_KANDIDATEN_COLLECTION_ID,
  // Benachrichtigungen
  NOTIFICATIONS: NOTIFICATIONS_COLLECTION_ID,
  ANGEBOTS_LAEUFE: ANGEBOTS_LAEUFE_COLLECTION_ID,
  KUNDEN_MERGE_ARCHIV: KUNDEN_MERGE_ARCHIV_COLLECTION_ID,
  // Mindmap-Planungstool
  MINDMAP_NODES: MINDMAP_NODES_COLLECTION_ID,
  // Admin Changelog
  ADMIN_CHANGELOG: ADMIN_CHANGELOG_COLLECTION_ID,
};

// Storage Bucket IDs
export const RECHNUNGS_DATEIEN_BUCKET_ID = 'rechnungs-dateien';
export const WIKI_DATEIEN_BUCKET_ID = 'wiki-dateien';
export const KUNDEN_DATEIEN_BUCKET_ID = 'kunden-dateien';
export const BESTELLABWICKLUNG_DATEIEN_BUCKET_ID = 'bestellabwicklung_dateien';
export const PROJEKT_ANHAENGE_BUCKET_ID = 'projekt-anhaenge'; // Für Dispo: PDFs, Mails, Karten etc.
export const KONKURRENTEN_DATEIEN_BUCKET_ID = 'konkurrenten-dateien'; // Für Konkurrenten: Bilder, Dokumente
export const PLATZBAUER_DATEIEN_BUCKET_ID = 'platzbauer-dateien'; // Für Platzbauer: Angebote, ABs, Rechnungen, Lieferscheine
export const SHOP_PRODUKTBILDER_BUCKET_ID = 'shop-produktbilder'; // Für Shop: Produktbilder
export const MINDMAP_BILDER_BUCKET_ID = 'mindmap-bilder'; // Für Mindmap: Task-Bilder

// Dokument-ID für die einzigen Datensätze (wir speichern jeweils nur einen Datensatz)
export const FIXKOSTEN_DOCUMENT_ID = 'fixkosten_data';
export const VARIABLE_KOSTEN_DOCUMENT_ID = 'variable_kosten_data';
export const STAMMDATEN_DOCUMENT_ID = 'stammdaten_data';

const client = new Client();

const endpoint = APPWRITE_ENDPOINT;
const projectId = PROJECT_ID;

client.setEndpoint(endpoint).setProject(projectId);

// ===========================================================================
// MOCK-MODUS-INTERCEPTOR
// ===========================================================================
//
// Das ist die zentrale Sicherheitskomponente des Sandbox-Features. 68 Dateien
// importieren `databases` von hier. Statt in allen 68 Dateien die Datenbank-ID
// auszutauschen, sitzt hier ein Proxy, der bei JEDEM Aufruf die Ziel-Datenbank
// aus `getDatabaseId()` einsetzt. Analog für `storage` mit `getBucketId()`.
//
// Warum das funktioniert: Bei allen dokumentbezogenen Methoden des Appwrite-
// SDK ist die `databaseId` das erste Argument (bzw. ein Feld des Parameter-
// Objekts). Es gibt keinen Aufruf ohne sie.
//
// ---------------------------------------------------------------------------
// ⚠️ ZWEI AUFRUFFORMEN — hier lag die eigentliche Falle
//
// Appwrite SDK 21 überlädt jede Methode doppelt (verifiziert in
// node_modules/appwrite/types/services/databases.d.ts):
//
//   listDocuments(databaseId, collectionId, queries?)          // positional
//   listDocuments({ databaseId, collectionId, queries? })      // Objekt-Form
//
// Ein Proxy, der nur `args[0]` ersetzt, würde die Objekt-Form still
// durchrutschen lassen — und damit einen Schreibzugriff auf die
// Produktionsdatenbank. Der Wrapper unten behandelt beide Formen.
//
// ---------------------------------------------------------------------------
// FAIL-CLOSED
//
// Trifft der Proxy im Mock-Modus auf etwas, das er nicht sicher umschreiben
// kann (unbekannte Methode, Transaktions-API, unerwartete Argumentform), wirft
// er. Ein blockiertes Feature ist ein akzeptables Ergebnis; ein durchgerutschter
// Schreibzugriff auf Produktivdaten nicht.
//
// Im Normalbetrieb (Mock-Modus aus) wird nie geworfen — dort zeigt
// `getDatabaseId()` ohnehin auf die Produktionsdatenbank, es gibt also nichts
// umzuschreiben und nichts zu schützen.
// ===========================================================================

/**
 * Methoden, deren erstes Argument die `databaseId` ist.
 * Erhoben aus der SDK-Typdefinition, nicht geraten. Bei einem SDK-Update ist
 * diese Liste gegen `databases.d.ts` zu prüfen — alles, was hier fehlt, wird
 * im Mock-Modus geblockt (nicht durchgelassen), fällt also sofort auf.
 */
const DB_METHODEN_MIT_DATABASE_ID = new Set([
  'listDocuments',
  'createDocument',
  'getDocument',
  'upsertDocument',
  'updateDocument',
  'deleteDocument',
  'incrementDocumentAttribute',
  'decrementDocumentAttribute',
]);

/**
 * Transaktions-API: `createOperations(transactionId, operations)` trägt die
 * `databaseId` in jedem Element von `operations`, nicht im ersten Argument.
 * Das ließe sich umschreiben — wird aktuell aber nirgends im Projekt benutzt.
 * Solange das so ist, ist Blocken die ehrlichere Lösung als ungetesteter Code
 * in einem Sicherheitspfad.
 */
const DB_TRANSAKTIONS_METHODEN = new Set([
  'listTransactions',
  'createTransaction',
  'getTransaction',
  'updateTransaction',
  'deleteTransaction',
  'createOperations',
]);

/** Storage-Methoden mit `bucketId` als erstem Argument. */
const STORAGE_METHODEN_MIT_BUCKET_ID = new Set([
  'listFiles',
  'createFile',
  'getFile',
  'updateFile',
  'deleteFile',
  'getFileDownload',
  'getFilePreview',
  'getFileView',
]);

type UnbekannteFunktion = (...args: unknown[]) => unknown;

/**
 * Ersetzt die ID im ersten Argument — egal ob positional oder Objekt-Form.
 * Gibt die neue Argumentliste zurück, oder `null`, wenn die Form unbekannt ist.
 */
function ersetzeId(
  args: unknown[],
  feldname: 'databaseId' | 'bucketId',
  neueId: (alt: string) => string
): unknown[] | null {
  const erstes = args[0];

  // Positional: listDocuments('tennismehl24_db', 'projekte', [...])
  if (typeof erstes === 'string') {
    return [neueId(erstes), ...args.slice(1)];
  }

  // Objekt-Form: listDocuments({ databaseId: '...', collectionId: '...' })
  if (erstes !== null && typeof erstes === 'object' && feldname in erstes) {
    const alt = (erstes as Record<string, unknown>)[feldname];
    if (typeof alt !== 'string') return null;
    return [{ ...(erstes as Record<string, unknown>), [feldname]: neueId(alt) }, ...args.slice(1)];
  }

  return null;
}

function baueProxy<T extends object>(
  ziel: T,
  art: 'databases' | 'storage',
  methodenMitId: Set<string>,
  transaktionsMethoden: Set<string>,
  feldname: 'databaseId' | 'bucketId',
  neueId: (alt: string) => string
): T {
  return new Proxy(ziel, {
    get(target, prop, receiver) {
      const wert = Reflect.get(target, prop, receiver);

      // Nicht-Funktionen (Properties, Symbole) unverändert durchreichen.
      if (typeof wert !== 'function' || typeof prop !== 'string') {
        return wert;
      }

      const original = wert as UnbekannteFunktion;

      return function (this: unknown, ...args: unknown[]): unknown {
        // Normalbetrieb: nichts umschreiben, nichts blockieren.
        if (!istMockModusAktiv()) {
          return original.apply(target, args);
        }

        if (methodenMitId.has(prop)) {
          const neu = ersetzeId(args, feldname, neueId);
          if (neu === null) {
            throw new Error(
              `🧪 Mock-Modus: Aufruf von ${art}.${prop}() hat eine unerwartete Argumentform — ` +
                `die ${feldname} konnte nicht auf die Sandbox umgebogen werden. ` +
                'Der Aufruf wurde blockiert, damit er nicht auf Produktivdaten wirkt.'
            );
          }
          return original.apply(target, neu);
        }

        if (transaktionsMethoden.has(prop)) {
          throw new Error(
            `🧪 Mock-Modus: ${art}.${prop}() (Transaktions-API) wird in der Sandbox nicht ` +
              'unterstützt — die Datenbank-ID steckt dort in den einzelnen Operationen und ' +
              'wird vom Interceptor nicht erfasst. Zum Ausführen zurück auf Echtdaten schalten.'
          );
        }

        // Geerbtes von Object.prototype (toString, valueOf, hasOwnProperty …)
        // ist keine SDK-Methode und kann nichts adressieren — durchreichen.
        // Sonst würde schon ein `String(databases)` in der Sandbox werfen.
        if (!Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(target), prop)) {
          return original.apply(target, args);
        }

        // Eine echte SDK-Methode, die der Interceptor nicht kennt — typischer
        // Fall nach einem SDK-Update. Fail-closed: lieber blockieren, als eine
        // Methode durchzulassen, von der niemand geprüft hat, wohin sie zeigt.
        throw new Error(
          `🧪 Mock-Modus: ${art}.${prop}() ist dem Interceptor nicht bekannt und wurde ` +
            'blockiert. Bitte in src/config/appwrite.ts eintragen, nachdem geprüft wurde, ' +
            'wie die Methode ihr Ziel adressiert.'
        );
      };
    },
  });
}

const databasesRoh = new Databases(client);
const storageRoh = new Storage(client);

/**
 * Datenbankzugriff für die gesamte Anwendung.
 * Zeigt automatisch auf `tennismehl24_db_mock`, solange der Mock-Modus läuft.
 */
export const databases = baueProxy(
  databasesRoh,
  'databases',
  DB_METHODEN_MIT_DATABASE_ID,
  DB_TRANSAKTIONS_METHODEN,
  'databaseId',
  () => getDatabaseId()
);

/**
 * Dateizugriff für die gesamte Anwendung.
 * Bucket `projekt-anhaenge` wird im Mock-Modus zu `mock_projekt-anhaenge`.
 */
export const storage = baueProxy(
  storageRoh,
  'storage',
  STORAGE_METHODEN_MIT_BUCKET_ID,
  new Set<string>(),
  'bucketId',
  (alt) => getBucketId(alt)
);

export const account = new Account(client);
export { client };

/**
 * Direkte Datei-URL (Anzeigen/Herunterladen im Browser-Tab).
 *
 * Warum diese Funktion existiert: An mehreren Stellen wurden solche URLs von
 * Hand zusammengesetzt —
 *   `${APPWRITE_ENDPOINT}/storage/buckets/${BUCKET}/files/${id}/view?project=...`
 * — und liefen damit am Storage-Proxy vorbei. Im Mock-Modus hätten sie weiter
 * auf den Produktions-Bucket gezeigt. Über `getBucketId()` stimmt das Ziel jetzt
 * in beiden Modi.
 */
export const dateiUrl = (
  bucketId: string,
  dateiId: string,
  modus: 'view' | 'download' = 'view'
): string =>
  `${APPWRITE_ENDPOINT}/storage/buckets/${getBucketId(bucketId)}/files/${dateiId}/${modus}?project=${PROJECT_ID}`;

// Debug: Zeige Konfiguration in Development
if (import.meta.env.DEV) {
  console.log('✅ Appwrite konfiguriert:', {
    endpoint,
    projectId,
    databaseId: getDatabaseId(),
    mockModus: istMockModusAktiv(),
  });
}

