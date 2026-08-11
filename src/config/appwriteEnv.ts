/**
 * Appwrite-Grundkonfiguration — bewusst OHNE Imports.
 *
 * Warum ein eigenes Modul?
 * `mockModus.ts` und `appwrite.ts` brauchen beide Endpoint, Projekt-ID und die
 * Datenbank-IDs. Läge das in `appwrite.ts`, entstünde ein Zirkelbezug
 * (appwrite → mockModus → appwrite). Dieses Modul ist die gemeinsame Wurzel
 * und importiert selbst nichts.
 *
 * Zweiter Grund: `import.meta.env` wird hier an EINER Stelle gelesen. Verstreute
 * Env-Zugriffe haben in diesem Projekt schon zu inkonsistentem Verhalten
 * zwischen Dev-Server und Build geführt.
 */

export const APPWRITE_ENDPOINT: string = import.meta.env.VITE_APPWRITE_ENDPOINT;
export const PROJECT_ID: string = import.meta.env.VITE_APPWRITE_PROJECT_ID;

if (!APPWRITE_ENDPOINT || !PROJECT_ID) {
  console.error('❌ Appwrite Konfiguration fehlt!');
  console.error('VITE_APPWRITE_ENDPOINT:', APPWRITE_ENDPOINT);
  console.error('VITE_APPWRITE_PROJECT_ID:', PROJECT_ID);
  throw new Error('VITE_APPWRITE_ENDPOINT und VITE_APPWRITE_PROJECT_ID müssen gesetzt sein');
}

/** Die echte Datenbank mit den Produktivdaten. Wird NIE als Schreibziel des Mock-Modus verwendet. */
export const PRODUKTIONS_DATABASE_ID = 'tennismehl24_db';

/**
 * Die Sandbox-Datenbank. Der Suffix `_mock` ist Teil des Sicherheitskonzepts:
 * jedes löschende Script prüft darauf, bevor es etwas anfasst
 * (siehe scripts/mock-db-*.ts).
 */
export const MOCK_DATABASE_ID = 'tennismehl24_db_mock';

/**
 * Präfix für die Sandbox-Buckets. Storage ist in Appwrite projektweit und NICHT
 * an eine Datenbank gebunden — ohne eigenes Bucket würden Uploads aus der
 * Sandbox in den Produktions-Buckets landen.
 *
 * Längenprüfung: Appwrite erlaubt 36 Zeichen für Bucket-IDs. Längste Basis-ID
 * ist `bestellabwicklung_dateien` (25) → mit Präfix 30 Zeichen. Passt.
 */
export const MOCK_BUCKET_PRAEFIX = 'mock_';
