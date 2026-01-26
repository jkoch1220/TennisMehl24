/**
 * Appwrite Setup - Client-Side (DEAKTIVIERT)
 *
 * SICHERHEITSHINWEIS:
 * Das Datenbank-Setup wurde auf ein Server-seitiges Script verschoben!
 *
 * Verwendung:
 *   npx ts-node scripts/setup-database.ts
 *
 * Diese Datei existiert nur noch für Abwärtskompatibilität.
 * Der API-Key wird NICHT mehr im Client verwendet.
 */

/**
 * @deprecated Setup wurde auf Server-Script verschoben
 *
 * Das Datenbank-Setup wird jetzt bei Deployment ausgeführt:
 *   npx ts-node scripts/setup-database.ts
 *
 * Diese Funktion tut absichtlich NICHTS mehr.
 */
export async function setupAppwriteFields(): Promise<void> {
  // DEAKTIVIERT - Setup wurde auf Server-Script verschoben
  // Siehe: scripts/setup-database.ts

  // Prüfe ob bereits markiert
  const setupDone = localStorage.getItem('appwrite_setup_migrated');
  if (setupDone) {
    return;
  }

  console.log('ℹ️ Appwrite Setup wurde auf Server-Script verschoben.');
  console.log('   Datenbank-Setup wird bei Deployment ausgeführt.');
  console.log('   Siehe: scripts/setup-database.ts');

  // Markiere als migriert
  localStorage.setItem('appwrite_setup_migrated', 'true');

  // Entferne alte Setup-Version Marker
  localStorage.removeItem('appwrite_setup_version');
}

/**
 * Collection IDs werden weiterhin exportiert für Kompatibilität
 * Diese werden jetzt aus der Config importiert
 */
export {
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
  PRIVAT_RECHNUNGEN_JULIAN_COLLECTION_ID,
  PRIVAT_KREDITOREN_JULIAN_COLLECTION_ID,
  PRIVAT_AKTIVITAETEN_JULIAN_COLLECTION_ID,
  PRIVAT_RECHNUNGEN_LUCA_COLLECTION_ID,
  PRIVAT_KREDITOREN_LUCA_COLLECTION_ID,
  PRIVAT_AKTIVITAETEN_LUCA_COLLECTION_ID,
  FAHRTEN_COLLECTION_ID,
  DEFAULT_STRECKEN_COLLECTION_ID,
  INSTANDHALTUNG_CHECKLISTEN_COLLECTION_ID,
  INSTANDHALTUNG_BEGEHUNGEN_COLLECTION_ID,
  SCHICHT_MITARBEITER_COLLECTION_ID,
  SCHICHT_ZUWEISUNGEN_COLLECTION_ID,
  CHAT_NACHRICHTEN_COLLECTION_ID,
  PRODUKTION_COLLECTION_ID,
  PLATZBAUER_PROJEKTE_COLLECTION_ID,
  PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
  PLATZBAUER_DOKUMENTE_COLLECTION_ID,
  PLATZBAUER_LIEFERSCHEINE_COLLECTION_ID,
  PLATZBAUER_DATEIEN_BUCKET_ID,
  DEBITOREN_METADATEN_COLLECTION_ID,
  TOUREN_COLLECTION_ID,
  FAHRER_COLLECTION_ID,
} from '../config/appwrite';
