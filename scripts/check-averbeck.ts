import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('tennismehl24')
  .setKey('standard_dfd6863760876e94387cc29faa3c91d1fda9db654f0c282ae01de4e0ec80a7db6a8ac3ea4685ef470d592d013141baa01c3e3e66187511f695fe7b776136a31b13fd02e057c4a6adee1bedf7356cfabc4ddb1e680cb60cde834c9ce87b8f33c94ecccace0b8d5c7f3ea101e894df599853d11bdce72bd3a183ddadff7d234f42');

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
