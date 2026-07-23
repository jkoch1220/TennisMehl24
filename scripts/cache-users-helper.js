/**
 * Helper Script um User automatisch zu cachen
 * Generiert JavaScript Code für die Browser Console
 */

import { Client, Users } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const users = new Users(client);

async function generateCacheCode() {
  console.log('🔄 Lade User aus Appwrite...\n');

  try {
    const result = await users.list();
    
    if (result.total === 0) {
      console.log('⚠️  Keine User gefunden!');
      console.log('Führen Sie zuerst "npm run setup:users" aus.\n');
      return;
    }

    console.log(`✅ ${result.total} User gefunden\n`);

    // Erstelle Cache-Objekt
    const userCache = {};
    result.users.forEach(user => {
      userCache[user.$id] = {
        $id: user.$id,
        name: user.name,
        email: user.email,
        labels: user.labels
      };
      console.log(`   📌 ${user.name} (${user.email}) ${user.labels.includes('admin') ? '👑' : ''}`);
    });

    console.log('\n' + '═'.repeat(70));
    console.log('📋 KOPIERE DIESEN CODE IN DIE BROWSER-CONSOLE:');
    console.log('   1. Öffne die App im Browser');
    console.log('   2. Drücke F12 (DevTools öffnen)');
    console.log('   3. Gehe zum Console-Tab');
    console.log('   4. Kopiere den Code unten und füge ihn ein');
    console.log('   5. Drücke Enter');
    console.log('   6. Lade die Seite neu (F5)');
    console.log('═'.repeat(70) + '\n');

    const cacheCode = `localStorage.setItem('tm_user_cache_v2', '${JSON.stringify(userCache)}'); console.log('✅ User-Cache aktualisiert!');`;
    
    console.log(cacheCode);
    
    console.log('\n' + '═'.repeat(70) + '\n');
    console.log('✅ Fertig! Nach dem Einfügen erscheinen die User in der Benutzerverwaltung.\n');

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  }
}

generateCacheCode();





