/**
 * Script zum Erhöhen der Größe des emailTemplates Attributs in Appwrite
 *
 * npx tsx scripts/update-email-templates-size.ts
 */

import dotenv from 'dotenv';
import { Client, Databases } from 'node-appwrite';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.VITE_APPWRITE_API_KEY!);

const databases = new Databases(client);
const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'stammdaten';

async function updateAttribute() {
  console.log('📧 Update emailTemplates Attribut-Größe');
  console.log('========================================\n');

  console.log('1. Lösche altes emailTemplates Attribut...');
  try {
    await databases.deleteAttribute(DATABASE_ID, COLLECTION_ID, 'emailTemplates');
    console.log('   ✅ Attribut gelöscht');
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.log('   ⚠️ Attribut existiert nicht oder Fehler:', err.message);
  }

  // Warte bis Attribut gelöscht ist (Appwrite braucht Zeit)
  console.log('\n2. Warte 8 Sekunden (Appwrite verarbeitet...)');
  await new Promise(r => setTimeout(r, 8000));

  console.log('\n3. Erstelle neues emailTemplates Attribut mit 65535 Zeichen...');
  try {
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'emailTemplates',
      65535,  // Maximale String-Größe in Appwrite
      false   // nicht required
    );
    console.log('   ✅ Neues Attribut erstellt!');
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error('   ❌ Fehler:', err.message);
  }

  console.log('\n========================================');
  console.log('✅ Fertig! Das Attribut wird in ~10 Sekunden verfügbar sein.');
}

updateAttribute();
