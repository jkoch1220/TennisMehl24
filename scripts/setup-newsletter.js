/**
 * Manuelles Setup der Newsletter Collection in Appwrite
 * Ausführen mit: node scripts/setup-newsletter.js
 */

import 'dotenv/config';

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;
const DATABASE_ID = 'tennismehl24_db';
const NEWSLETTER_COLLECTION_ID = 'newsletter_subscribers';

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Fehlende Environment-Variablen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

const newsletterFields = [
  { key: 'email', type: 'string', size: 320, required: true },
  { key: 'name', type: 'string', size: 200 },
  { key: 'status', type: 'string', size: 20, required: true },
  { key: 'unsubscribeToken', type: 'string', size: 100, required: true },
  { key: 'source', type: 'string', size: 50 },
  { key: 'tags', type: 'string', size: 500 },
  { key: 'notes', type: 'string', size: 1000 },
  { key: 'subscribedAt', type: 'string', size: 50, required: true },
  { key: 'unsubscribedAt', type: 'string', size: 50 },
  { key: 'lastEmailSentAt', type: 'string', size: 50 },
  { key: 'emailsSentCount', type: 'integer', default: 0 },
];

async function createCollection() {
  console.log('📦 Erstelle Newsletter Collection...');

  // Prüfen ob Collection existiert
  const checkRes = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${NEWSLETTER_COLLECTION_ID}`,
    { method: 'GET', headers }
  );

  if (checkRes.ok) {
    console.log('✅ Collection existiert bereits');
  } else if (checkRes.status === 404) {
    // Collection erstellen
    const createRes = await fetch(
      `${endpoint}/databases/${DATABASE_ID}/collections`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          collectionId: NEWSLETTER_COLLECTION_ID,
          name: 'Newsletter Subscribers',
          documentSecurity: false,
          permissions: [
            'read("any")',
            'create("users")',
            'update("users")',
            'delete("users")',
          ],
        }),
      }
    );

    if (createRes.ok) {
      console.log('✅ Collection erstellt');
    } else {
      const err = await createRes.json();
      console.error('❌ Fehler beim Erstellen:', err.message);
      return false;
    }
  } else {
    console.error('❌ Fehler beim Prüfen der Collection');
    return false;
  }

  return true;
}

async function createField(field) {
  const body = {
    key: field.key,
    required: field.required ?? false,
    default: field.default ?? null,
  };

  if (field.type === 'string') {
    body.size = field.size ?? 500;
  }

  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${NEWSLETTER_COLLECTION_ID}/attributes/${field.type}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }
  );

  if (res.ok) {
    console.log(`  ✅ Feld erstellt: ${field.key}`);
    return true;
  } else if (res.status === 409) {
    console.log(`  ⏭️  Feld existiert: ${field.key}`);
    return true;
  } else {
    const err = await res.json();
    console.error(`  ❌ Fehler bei ${field.key}:`, err.message);
    return false;
  }
}

async function createIndex(key, attributes, type = 'key') {
  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${NEWSLETTER_COLLECTION_ID}/indexes`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key,
        type,
        attributes,
        orders: attributes.map(() => 'ASC'),
      }),
    }
  );

  if (res.ok) {
    console.log(`  ✅ Index erstellt: ${key}`);
  } else if (res.status === 409) {
    console.log(`  ⏭️  Index existiert: ${key}`);
  } else {
    const err = await res.json();
    console.error(`  ❌ Fehler bei Index ${key}:`, err.message);
  }
}

async function main() {
  console.log('🚀 Newsletter Collection Setup\n');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project: ${projectId}`);
  console.log(`Database: ${DATABASE_ID}\n`);

  // Collection erstellen
  const collectionOk = await createCollection();
  if (!collectionOk) {
    process.exit(1);
  }

  // Felder erstellen
  console.log('\n📝 Erstelle Felder...');
  for (const field of newsletterFields) {
    await createField(field);
    await new Promise(r => setTimeout(r, 300)); // Rate limiting
  }

  // Warten bis Felder verfügbar sind
  console.log('\n⏳ Warte auf Feld-Aktivierung (3s)...');
  await new Promise(r => setTimeout(r, 3000));

  // Indizes erstellen
  console.log('\n📇 Erstelle Indizes...');
  await createIndex('email_index', ['email']);
  await createIndex('token_index', ['unsubscribeToken'], 'unique');
  await createIndex('status_index', ['status']);

  console.log('\n✅ Newsletter Setup abgeschlossen!');
}

main().catch(console.error);
