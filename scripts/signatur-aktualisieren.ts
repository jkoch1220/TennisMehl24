/**
 * Setzt die gemeinsame E-Mail-Signatur (`standardSignatur` in den Stammdaten-
 * emailTemplates) auf den Inhalt einer HTML-Datei.
 *
 *   npx tsx scripts/signatur-aktualisieren.ts <html-datei> [--prod]
 *
 * Ohne --prod wird nur die Sandbox `tennismehl24_db_mock` beschrieben.
 * Vorher IMMER ein Backup ziehen — die alte Fassung wird zusätzlich mit
 * ausgegeben, damit sie im Zweifel zurückkopiert werden kann.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { Client, Databases } from 'node-appwrite';

const [datei, ...flags] = process.argv.slice(2);
if (!datei) {
  console.error('Aufruf: npx tsx scripts/signatur-aktualisieren.ts <html-datei> [--prod]');
  process.exit(1);
}
const DB = flags.includes('--prod') ? 'tennismehl24_db' : 'tennismehl24_db_mock';

const db = new Databases(new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!));

(async () => {
  const neueSignatur = readFileSync(datei, 'utf-8').trim();
  const doc: any = await db.getDocument(DB, 'stammdaten', 'stammdaten_data');
  const templates = JSON.parse(String(doc.emailTemplates ?? '{}'));

  console.log(`Datenbank: ${DB}`);
  console.log(`Alte standardSignatur (${(templates.standardSignatur ?? '').length} Zeichen):`);
  console.log(templates.standardSignatur ?? '(leer)');

  templates.standardSignatur = neueSignatur;
  await db.updateDocument(DB, 'stammdaten', 'stammdaten_data', {
    emailTemplates: JSON.stringify(templates),
  });
  console.log(`\nNeue standardSignatur gesetzt (${neueSignatur.length} Zeichen). Fertig.`);
})();
