/**
 * User in den Frontend-Cache laden
 * Damit sie in der Benutzerverwaltung verfügbar sind
 */

import { Client, Users } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.VITE_APPWRITE_API_KEY);

const users = new Users(client);

async function cacheUsers() {
  console.log('🔄 Lade User aus Appwrite...\n');

  try {
    const result = await users.list();
    
    if (result.total === 0) {
      console.log('⚠️  Keine User gefunden!');
      return;
    }

    console.log(`✅ ${result.total} User gefunden\n`);
    
    // Erstelle Cache-Objekt
    const cache = {};
    
    result.users.forEach((user) => {
      cache[user.$id] = {
        $id: user.$id,
        name: user.name,
        email: user.email,
        labels: user.labels
      };
      
      console.log(`📦 Cache-Eintrag für: ${user.name}`);
      console.log(`   ID: ${user.$id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Labels: ${user.labels.join(', ') || '(keine)'}\n`);
    });

    // Ausgabe für localStorage
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 KOPIERE DIESEN CODE IN DIE BROWSER-CONSOLE:\n');
    console.log(`localStorage.setItem('tm_appwrite_users_cache', '${JSON.stringify(cache)}');`);
    console.log('\n✅ Dann die Seite neu laden!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Alternative: JSON ausgeben für manuelles Copy-Paste
    console.log('📄 Oder füge diese User manuell hinzu:\n');
    result.users.forEach((user) => {
      console.log(`User-ID: ${user.$id}`);
      console.log(`Name: ${user.name}`);
      console.log(`Email: ${user.email}`);
      console.log('---');
    });

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  }
}

cacheUsers();




