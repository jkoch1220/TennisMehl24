/**
 * Setzt die Berechtigungen für die Siebanalysen Collection
 * Ausführen: node scripts/fix-siebanalysen-permissions.js
 */

import 'dotenv/config';

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = 'tennismehl24_db';
const collectionId = 'siebanalysen';

async function fixPermissions() {
  if (!endpoint || !projectId || !apiKey) {
    console.error('❌ Umgebungsvariablen fehlen!');
    console.error('VITE_APPWRITE_ENDPOINT:', endpoint);
    console.error('VITE_APPWRITE_PROJECT_ID:', projectId);
    console.error('APPWRITE_API_KEY:', apiKey ? '***' : 'fehlt');
    process.exit(1);
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  console.log('🔧 Aktualisiere Berechtigungen für siebanalysen Collection...\n');

  try {
    // Collection-Berechtigungen aktualisieren
    const res = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${collectionId}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: 'Siebanalysen QS',
          permissions: [
            'read("users")',
            'create("users")',
            'update("users")',
            'delete("users")',
          ],
          documentSecurity: false, // Collection-Level Permissions
          enabled: true,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('❌ Fehler:', err.message || res.status);
      process.exit(1);
    }

    console.log('✅ Berechtigungen erfolgreich gesetzt!');
    console.log('   - read("users")');
    console.log('   - create("users")');
    console.log('   - update("users")');
    console.log('   - delete("users")');
    console.log('\n🎉 Du kannst jetzt Siebanalysen speichern!');
  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  }
}

fixPermissions();
