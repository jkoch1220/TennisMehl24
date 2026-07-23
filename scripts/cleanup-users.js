/**
 * Alle User löschen
 */

import { Client, Users } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const users = new Users(client);

async function cleanupUsers() {
  console.log('🗑️  Lösche alle User...\n');

  try {
    const result = await users.list();
    
    if (result.total === 0) {
      console.log('✅ Keine User vorhanden.\n');
      return;
    }

    console.log(`📋 Gefundene User: ${result.total}\n`);
    
    for (const user of result.users) {
      console.log(`Lösche: ${user.name} (${user.$id})`);
      await users.delete(user.$id);
    }

    console.log('\n✅ Alle User gelöscht!\n');

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  }
}

cleanupUsers();





