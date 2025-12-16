/**
 * Liste alle User in Appwrite auf
 * 
 * Verwendung:
 * node scripts/list-users.js
 */

import { Client, Users } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.VITE_APPWRITE_API_KEY);

const users = new Users(client);

async function listUsers() {
  console.log('🔍 Lade User aus Appwrite...\n');

  try {
    const result = await users.list();
    
    if (result.total === 0) {
      console.log('⚠️  Keine User gefunden!');
      console.log('👉 Bitte führen Sie "npm run setup:users" aus, um User zu erstellen.\n');
      return;
    }

    console.log(`✅ ${result.total} User gefunden:\n`);
    
    result.users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name || '(Kein Name)'}`);
      console.log(`   ID: ${user.$id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Labels: ${user.labels.length > 0 ? user.labels.join(', ') : '(keine)'}`);
      console.log(`   Status: ${user.status ? 'Aktiv' : 'Inaktiv'}`);
      console.log(`   Email-Verifiziert: ${user.emailVerification ? 'Ja' : 'Nein'}`);
      console.log(`   Erstellt: ${new Date(user.$createdAt).toLocaleString('de-DE')}`);
      console.log('');
    });

    console.log('\n📝 Login-Informationen:');
    console.log('   Für Username-Login verwenden Sie:');
    result.users.forEach(user => {
      const username = user.email.replace('@tennismehl.local', '');
      console.log(`   - Username: ${username}`);
    });

  } catch (error) {
    console.error('❌ Fehler beim Laden der User:', error.message);
    
    if (error.code === 401) {
      console.log('\n⚠️  API Key ungültig oder nicht gesetzt!');
      console.log('Prüfen Sie VITE_APPWRITE_API_KEY in Ihrer .env Datei.');
    }
  }
}

listUsers();



