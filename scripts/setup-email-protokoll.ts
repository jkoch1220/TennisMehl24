/**
 * Script zum Anlegen der E-Mail-Protokoll Collection in Appwrite
 *
 * Führe dieses Script aus mit:
 * npx tsx scripts/setup-email-protokoll.ts
 *
 * Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY
 */

import dotenv from 'dotenv';
import { Client, Databases, Permission, Role } from 'node-appwrite';

// Lade Umgebungsvariablen
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY');
  process.exit(1);
}

const DATABASE_ID = 'tennismehl24_db';
const EMAIL_PROTOKOLL_COLLECTION_ID = 'email_protokoll';

// Initialisiere Appwrite Client
const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

// Attribute für die Collection
const emailProtokollAttributes = [
  { key: 'projektId', type: 'string', size: 36, required: true },
  { key: 'dokumentTyp', type: 'string', size: 30, required: true },
  { key: 'dokumentNummer', type: 'string', size: 50, required: true },
  { key: 'empfaenger', type: 'string', size: 200, required: true },
  { key: 'absender', type: 'string', size: 100, required: true },
  { key: 'betreff', type: 'string', size: 500, required: true },
  { key: 'htmlContent', type: 'string', size: 65535, required: false }, // Max für String in Appwrite
  { key: 'pdfDateiname', type: 'string', size: 255, required: true },
  { key: 'pdfVersion', type: 'integer', required: false },
  { key: 'gesendetAm', type: 'string', size: 30, required: true },
  { key: 'status', type: 'string', size: 20, required: true },
  { key: 'fehlerMeldung', type: 'string', size: 1000, required: false },
  { key: 'messageId', type: 'string', size: 255, required: false },
];

async function createCollection() {
  console.log('📧 E-Mail-Protokoll Collection Setup');
  console.log('=====================================\n');

  try {
    // Prüfe ob Collection bereits existiert
    try {
      await databases.getCollection(DATABASE_ID, EMAIL_PROTOKOLL_COLLECTION_ID);
      console.log('✅ Collection "email_protokoll" existiert bereits.');
      console.log('   Überspringe Erstellung, prüfe Attribute...\n');
    } catch {
      // Collection existiert nicht, erstellen
      console.log('📝 Erstelle Collection "email_protokoll"...');

      await databases.createCollection(
        DATABASE_ID,
        EMAIL_PROTOKOLL_COLLECTION_ID,
        'E-Mail Protokoll',
        [
          Permission.read(Role.users()),
          Permission.create(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ]
      );

      console.log('✅ Collection erstellt!\n');
    }

    // Erstelle Attribute
    console.log('📝 Erstelle/Prüfe Attribute...\n');

    for (const attr of emailProtokollAttributes) {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(
            DATABASE_ID,
            EMAIL_PROTOKOLL_COLLECTION_ID,
            attr.key,
            attr.size,
            attr.required
          );
          console.log(`  ✅ String-Attribut "${attr.key}" (${attr.size}) erstellt`);
        } else if (attr.type === 'integer') {
          await databases.createIntegerAttribute(
            DATABASE_ID,
            EMAIL_PROTOKOLL_COLLECTION_ID,
            attr.key,
            attr.required
          );
          console.log(`  ✅ Integer-Attribut "${attr.key}" erstellt`);
        }
      } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        if (err.code === 409) {
          console.log(`  ⏭️  Attribut "${attr.key}" existiert bereits`);
        } else {
          console.error(`  ❌ Fehler bei "${attr.key}":`, err.message);
        }
      }
    }

    // Erstelle Indizes für schnelle Suche
    console.log('\n📝 Erstelle Indizes...\n');

    const indexes = [
      { key: 'idx_projektId', attributes: ['projektId'] },
      { key: 'idx_gesendetAm', attributes: ['gesendetAm'] },
      { key: 'idx_dokumentTyp', attributes: ['dokumentTyp'] },
      { key: 'idx_status', attributes: ['status'] },
    ];

    for (const idx of indexes) {
      try {
        await databases.createIndex(
          DATABASE_ID,
          EMAIL_PROTOKOLL_COLLECTION_ID,
          idx.key,
          'key',
          idx.attributes
        );
        console.log(`  ✅ Index "${idx.key}" erstellt`);
      } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        if (err.code === 409) {
          console.log(`  ⏭️  Index "${idx.key}" existiert bereits`);
        } else {
          console.error(`  ❌ Fehler bei Index "${idx.key}":`, err.message);
        }
      }
    }

    console.log('\n=====================================');
    console.log('✅ E-Mail-Protokoll Setup abgeschlossen!');
    console.log('\nDie Collection "email_protokoll" ist jetzt bereit.');

  } catch (error) {
    console.error('❌ Fehler beim Setup:', error);
    process.exit(1);
  }
}

createCollection();
