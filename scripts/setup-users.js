/**
 * Setup Script für Appwrite User Accounts
 * 
 * Dieses Script erstellt die beiden User-Accounts:
 * 1. Admin User mit Label "admin"
 * 2. Egner User ohne spezielle Labels
 * 
 * WICHTIG: Dieses Script sollte nur einmal ausgeführt werden!
 * 
 * Verwendung:
 * node scripts/setup-users.js
 */

import { Client, Users, ID } from 'node-appwrite';
import 'dotenv/config';

// DEPRECATED: legt Fake-E-Mails (@tennismehl.local) an — seit der Umstellung auf
// echte Account-E-Mails (Recovery-Support) User nur noch über die
// Benutzerverwaltung im Portal anlegen.
console.error('❌ DEPRECATED: scripts/setup-users.js legt @tennismehl.local-Accounts an.');
console.error('   Neue User bitte über Einstellungen → Benutzerverwaltung anlegen (echte E-Mail).');
process.exit(1);

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const users = new Users(client);

async function setupUsers() {
  console.log('🚀 Starte User-Setup...\n');

  try {
    // Admin User erstellen
    console.log('1️⃣  Erstelle Admin User...');
    try {
      const adminUser = await users.create(
        ID.unique(),
        'admin@tennismehl.local', // Interne Email-Adresse
        undefined, // Telefon (optional)
        'Admin2025!', // Standard-Passwort (sollte nach dem ersten Login geändert werden)
        'admin' // Name = Username
      );

      // Label "admin" hinzufügen
      await users.updateLabels(adminUser.$id, ['admin']);
      
      console.log('✅ Admin User erstellt:', {
        id: adminUser.$id,
        email: adminUser.email,
        name: adminUser.name,
        username: 'admin',
        labels: ['admin']
      });
    } catch (error) {
      if (error.code === 409) {
        console.log('ℹ️  Admin User existiert bereits');
      } else {
        throw error;
      }
    }

    console.log('\n');

    // Egner User erstellen
    console.log('2️⃣  Erstelle Egner User...');
    try {
      const egnerUser = await users.create(
        ID.unique(),
        'egner@tennismehl.local', // Interne Email-Adresse
        undefined,
        'Egner2025!', // Standard-Passwort (sollte nach dem ersten Login geändert werden)
        'egner' // Name = Username
      );

      console.log('✅ Egner User erstellt:', {
        id: egnerUser.$id,
        email: egnerUser.email,
        name: egnerUser.name,
        username: 'egner',
        labels: []
      });
    } catch (error) {
      if (error.code === 409) {
        console.log('ℹ️  Egner User existiert bereits');
      } else {
        throw error;
      }
    }

    console.log('\n✅ User-Setup abgeschlossen!\n');
    
    // Liste alle User für den Cache
    console.log('📦 Lade User-Liste für Cache...');
    const allUsers = await users.list();
    
    console.log('\n📋 User-IDs für Benutzerverwaltung:');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('\n⚠️  WICHTIG: Kopieren Sie diesen Code in die Browser-Console:');
    console.log('   (F12 → Console-Tab → Code einfügen → Enter)\n');
    
    const userCache = {};
    allUsers.users.forEach(user => {
      userCache[user.$id] = {
        $id: user.$id,
        name: user.name,
        email: user.email,
        labels: user.labels
      };
      console.log(`   ✓ ${user.name} (${user.email})`);
    });
    
    console.log('\n────────────────────────────────────────────────────────────────');
    console.log(`localStorage.setItem('tm_user_cache_v2', '${JSON.stringify(userCache)}');`);
    console.log('────────────────────────────────────────────────────────────────\n');
    
    console.log('📝 Login-Daten:');
    console.log('   Admin:');
    console.log('   - Username: admin');
    console.log('   - Passwort: Admin2025!');
    console.log('');
    console.log('   Egner:');
    console.log('   - Username: egner');
    console.log('   - Passwort: Egner2025!');
    console.log('');
    console.log('⚠️  WICHTIG: Bitte ändern Sie die Passwörter nach dem ersten Login!');

  } catch (error) {
    console.error('❌ Fehler beim User-Setup:', error);
    process.exit(1);
  }
}

setupUsers();





