import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) {
  console.error('❌ APPWRITE_API_KEY fehlt (.env)');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID || 'tennismehl24')
  .setKey(apiKey);

const databases = new Databases(client);
const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';

async function main() {
  const alleDocs = await databases.listDocuments(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, [
    Query.limit(500),
  ]);
  
  const averbeck = alleDocs.documents.find(p => {
    const data = p.data ? JSON.parse(p.data) : {};
    return data.typ === 'platzbauer' && data.name && data.name.toLowerCase().includes('averbeck');
  });
  
  if (!averbeck) {
    console.log('Averbeck nicht gefunden!');
    return;
  }
  
  const averbeckId = averbeck.$id;
  console.log('Averbeck ID:', averbeckId);
  console.log('');
  
  // Prüfe Vereine mit allen Details
  console.log('=== VEREINE MIT standardPlatzbauerId = Averbeck ===');
  const vereine = alleDocs.documents.filter(v => {
    const data = v.data ? JSON.parse(v.data) : {};
    return data.typ === 'verein' && data.standardPlatzbauerId === averbeckId;
  });
  
  console.log('Gefunden:', vereine.length);
  console.log('');
  
  vereine.forEach(v => {
    const data = JSON.parse(v.data);
    console.log('Name:', data.name);
    console.log('  standardBezugsweg:', data.standardBezugsweg || 'NICHT GESETZT');
    console.log('  aktiv:', data.aktiv);
    console.log('  standardPlatzbauerId:', data.standardPlatzbauerId);
    console.log('');
  });
}

main().catch(console.error);
