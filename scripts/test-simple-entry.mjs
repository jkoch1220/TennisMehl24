import { readFileSync } from 'fs';
import { Client, Databases, ID } from 'node-appwrite';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);

const db = new Databases(client);

try {
  console.log('Creating document...');
  const doc = await db.createDocument(
    'tennismehl24_db',
    'admin_changelog',
    ID.unique(),
    {
      type: 'manual',
      title: 'Test',
      description: 'Test desc',
      category: 'feature',
      commitHash: '',
      timestamp: new Date().toISOString(),
      createdBy: '',
    }
  );
  console.log('✅ Success:', doc.$id);
} catch (e) {
  console.error('❌ Error:', e.message);
  console.error('Details:', e);
}
