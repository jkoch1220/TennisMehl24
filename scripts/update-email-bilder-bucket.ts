/**
 * Script zum Updaten des Storage Buckets für E-Mail-Signatur-Bilder
 * Fügt erlaubte Dateiendungen hinzu
 *
 * npx tsx scripts/update-email-bilder-bucket.ts
 */

import dotenv from 'dotenv';
import { Client, Storage, Permission, Role } from 'node-appwrite';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const storage = new Storage(client);
const BUCKET_ID = 'email-bilder';

async function updateBucket() {
  console.log('📷 E-Mail Bilder Storage Bucket Update');
  console.log('======================================\n');

  try {
    // Prüfe ob Bucket existiert
    const bucket = await storage.getBucket(BUCKET_ID);
    console.log('✅ Bucket gefunden:', bucket.name);
    console.log('   Aktuelle erlaubte Extensions:', bucket.allowedFileExtensions);

    console.log('\n📝 Update Bucket mit Dateiendungen...');

    await storage.updateBucket(
      BUCKET_ID,
      'E-Mail Signatur Bilder',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      false, // fileSecurity
      true,  // enabled
      10 * 1024 * 1024, // maxFileSize: 10MB
      // Sowohl MIME-Types als auch Dateiendungen erlauben
      [
        'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'
      ],
      'gzip', // compression
      true,   // encryption
      true    // antivirus
    );

    console.log('✅ Bucket aktualisiert!');

    // Verifizieren
    const updatedBucket = await storage.getBucket(BUCKET_ID);
    console.log('   Neue erlaubte Extensions:', updatedBucket.allowedFileExtensions);

  } catch (error: unknown) {
    const err = error as { message?: string; code?: number };
    if (err.code === 404) {
      console.error('❌ Bucket nicht gefunden. Bitte erst setup-email-bilder-bucket.ts ausführen.');
    } else {
      console.error('❌ Fehler:', err.message);
    }
  }
}

updateBucket();
