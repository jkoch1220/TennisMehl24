/**
 * Script zum Erstellen des Storage Buckets für E-Mail-Signatur-Bilder
 *
 * npx tsx scripts/setup-email-bilder-bucket.ts
 */

import dotenv from 'dotenv';
import { Client, Storage, Permission, Role } from 'node-appwrite';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.VITE_APPWRITE_API_KEY!);

const storage = new Storage(client);
const BUCKET_ID = 'email-bilder';

async function createBucket() {
  console.log('📷 E-Mail Bilder Storage Bucket Setup');
  console.log('======================================\n');

  try {
    // Prüfe ob Bucket existiert
    try {
      await storage.getBucket(BUCKET_ID);
      console.log('✅ Bucket "email-bilder" existiert bereits.');
      return;
    } catch {
      // Bucket existiert nicht, erstellen
    }

    console.log('📝 Erstelle Bucket "email-bilder"...');

    await storage.createBucket(
      BUCKET_ID,
      'E-Mail Signatur Bilder',
      [
        Permission.read(Role.any()),     // Jeder kann lesen (für E-Mail-Clients)
        Permission.create(Role.users()), // Nur eingeloggte User können hochladen
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      false, // fileSecurity
      true,  // enabled
      10 * 1024 * 1024, // maxFileSize: 10MB
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'], // erlaubte MIME-Types
      'gzip', // compression
      true,   // encryption
      true    // antivirus
    );

    console.log('✅ Bucket erstellt!');
    console.log('\n======================================');
    console.log('✅ Setup abgeschlossen!');
    console.log('\nBilder können jetzt hochgeladen werden.');
    console.log(`Bucket ID: ${BUCKET_ID}`);

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('❌ Fehler:', err.message);
  }
}

createBucket();
