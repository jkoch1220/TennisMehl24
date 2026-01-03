/**
 * User aus Appwrite löschen
 * 
 * Verwendung:
 * node scripts/delete-user.js <user-email>
 * 
 * Beispiel:
 * node scripts/delete-user.js admin@tennismehl.local
 */

import { Client, Users } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.VITE_APPWRITE_API_KEY);

const users = new Users(client);

async function deleteUser(email) {
  if (!email) {
    console.error('❌ Bitte Email-Adresse angeben!');
    console.log('Verwendung: node scripts/delete-user.js <email>');
    console.log('Beispiel: node scripts/delete-user.js admin@tennismehl.local');
    process.exit(1);
  }

  console.log(`🔍 Suche User mit Email: ${email}\n`);

  try {
    // Alle User laden und nach Email suchen
    const result = await users.list();
    const user = result.users.find(u => u.email === email);

    if (!user) {
      console.log('⚠️  User nicht gefunden!');
      console.log('\n📋 Verfügbare User:');
      result.users.forEach(u => {
        console.log(`   - ${u.email} (${u.name})`);
      });
      process.exit(1);
    }

    console.log('✅ User gefunden:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   ID: ${user.$id}`);
    console.log(`   Labels: ${user.labels.join(', ') || '(keine)'}\n`);

    // User löschen
    await users.delete(user.$id);
    console.log('✅ User erfolgreich gelöscht!\n');

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  }
}

const email = process.argv[2];
deleteUser(email);




