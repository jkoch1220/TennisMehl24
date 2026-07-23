/**
 * Diagnose: zeigt die Platzbauer-relevanten Felder eines Projekts.
 * Ausführen: npx tsx scripts/inspect-platzbauer-projekt.ts <projektId>
 */
import { Client, Databases } from 'node-appwrite';
import * as dotenv from 'dotenv';
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT!;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID!;
const apiKey = process.env.APPWRITE_API_KEY!;
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);
const DATABASE_ID = 'tennismehl24_db';

async function main() {
  const id = process.argv[2];
  const doc = (await databases.getDocument(DATABASE_ID, 'projekte', id)) as Record<string, unknown>;
  let p: Record<string, unknown> = {};
  if (typeof doc.data === 'string') {
    try { p = JSON.parse(doc.data); } catch { /* ignore */ }
  }
  const f = (k: string) => (p[k] !== undefined ? p[k] : doc[k]);
  console.log('Projekt', id);
  console.log('  kundenname:                ', f('kundenname'));
  console.log('  kundeId:                   ', f('kundeId'));
  console.log('  bezugsweg:                 ', f('bezugsweg'));
  console.log('  istPlatzbauerprojekt:      ', f('istPlatzbauerprojekt'));
  console.log('  platzbauerId:              ', f('platzbauerId'));
  console.log('  zugeordnetesPlatzbauerprojektId:', f('zugeordnetesPlatzbauerprojektId'));
  console.log('  status:                    ', f('status'));

  // Platzbauer-Namen auflösen, falls platzbauerId vorhanden
  const pbId = f('platzbauerId') as string | undefined;
  if (pbId) {
    try {
      const pb = (await databases.getDocument(DATABASE_ID, 'saison_kunden', pbId)) as Record<string, unknown>;
      let pbData: Record<string, unknown> = {};
      if (typeof pb.data === 'string') { try { pbData = JSON.parse(pb.data); } catch { /* */ } }
      console.log('  → Platzbauer (saison_kunden):', pbData.name ?? pb.name ?? '(?)');
    } catch (e) {
      console.log('  → Platzbauer konnte nicht geladen werden:', (e as Error).message);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
