/**
 * Script zum Erstellen des Storage Buckets für Kunden-Dateien (Schüttplatzbilder, etc.)
 *
 * npx tsx scripts/setup-kunden-dateien-bucket.ts
 */

import dotenv from 'dotenv';
import { Client, Storage, Permission, Role } from 'node-appwrite';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.VITE_APPWRITE_API_KEY!);

const storage = new Storage(client);
const BUCKET_ID = 'kunden-dateien';

async function createBucket() {
  console.log('📷 Kunden-Dateien Storage Bucket Setup');
  console.log('======================================\n');

  try {
    // Prüfe ob Bucket existiert
    try {
      await storage.getBucket(BUCKET_ID);
      console.log('✅ Bucket "kunden-dateien" existiert bereits.');
      return;
    } catch {
      // Bucket existiert nicht, erstellen
    }

    console.log('📝 Erstelle Bucket "kunden-dateien"...');

    await storage.createBucket(
      BUCKET_ID,
      'Kunden-Dateien (Schüttplatzbilder, Aktivitäten)',
      [
        Permission.read(Role.users()),    // Eingeloggte User können lesen
        Permission.create(Role.users()),  // Eingeloggte User können hochladen
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      false, // fileSecurity
      true,  // enabled
      50 * 1024 * 1024, // maxFileSize: 50MB
      [], // Leeres Array = alle Dateitypen erlaubt (HEIC, PNG, JPG, PDF, etc.)
      'gzip', // compression
      true,   // encryption
      true    // antivirus
    );

    console.log('✅ Bucket erstellt!');
    console.log('\n======================================');
    console.log('✅ Setup abgeschlossen!');
    console.log('\nDateien können jetzt hochgeladen werden.');
    console.log(`Bucket ID: ${BUCKET_ID}`);

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('❌ Fehler:', err.message);
  }
}

createBucket();
