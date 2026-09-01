/**
 * Entfernt die Grußformeln aus den Mahn-Schlusstexten in den Stammdaten
 * (`mahnwesenVorlagen`). Seit der Signatur-Zentralisierung hängt der Versand
 * die zentrale Signatur samt Grußzeile an jede Mahnung an — eine Grußformel
 * im Schlusstext stünde doppelt in der Mail.
 *
 *   npx tsx scripts/mahn-schlusstexte-bereinigen.ts [--prod]
 *
 * Ohne --prod wird nur die Sandbox `tennismehl24_db_mock` beschrieben.
 */
import 'dotenv/config';
import { Client, Databases } from 'node-appwrite';

const DB = process.argv.includes('--prod') ? 'tennismehl24_db' : 'tennismehl24_db_mock';

const db = new Databases(new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!));

(async () => {
  const doc: Record<string, unknown> = await db.getDocument(DB, 'stammdaten', 'stammdaten_data');
  const vorlagen = JSON.parse(String(doc.mahnwesenVorlagen ?? '{}')) as Record<
    string,
    { schlusstext?: string }
  >;

  let geaendert = 0;
  for (const [key, vorlage] of Object.entries(vorlagen)) {
    if (typeof vorlage?.schlusstext !== 'string') continue;
    const vorher = vorlage.schlusstext;
    vorlage.schlusstext = vorher
      .replace(/,\s*und verbleiben\s*\n\s*\nmit freundlichen Grüßen\s*$/i, '.')
      .replace(/\n\s*\nMit freundlichen Grüßen\s*$/i, '')
      .trimEnd();
    if (vorlage.schlusstext !== vorher) {
      geaendert++;
      console.log(`${key} endet jetzt: …${vorlage.schlusstext.slice(-70).replace(/\n/g, ' | ')}`);
    }
  }

  if (geaendert === 0) {
    console.log(`${DB}: nichts zu bereinigen.`);
    return;
  }
  await db.updateDocument(DB, 'stammdaten', 'stammdaten_data', {
    mahnwesenVorlagen: JSON.stringify(vorlagen),
  });
  console.log(`${DB}: ${geaendert} Schlusstext(e) bereinigt.`);
})();
