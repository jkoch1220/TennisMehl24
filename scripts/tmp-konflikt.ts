import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';
import { parseMaterialAufschluesselung } from '../src/utils/dispoMaterialParser';
import type { Projekt } from '../src/types/projekt';
const c = new Client().setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!).setProject(process.env.VITE_APPWRITE_PROJECT_ID!).setKey(process.env.APPWRITE_API_KEY!);
const db = new Databases(c);
const r = await db.listDocuments('tennismehl24_db','projekte',[Query.limit(500), Query.equal('saisonjahr',2026)]);
let lkwUndNurPalette = 0, lkwUndLose = 0, lkwOhnePositionen = 0, lkwGesamt = 0;
const bsp: string[] = [];
for (const d of r.documents) {
  const data = JSON.parse((d as {data?:string}).data||'{}');
  const p = { ...data, ...d, id: d.$id } as Projekt;
  if (p.belieferungsart !== 'mit_haenger' && p.belieferungsart !== 'nur_motorwagen') continue;
  lkwGesamt++;
  const m = parseMaterialAufschluesselung(p);
  const hatWare = m.gesamtLose > 0 || m.hatPalettenware || m.hatBigBag;
  if (!hatWare) { lkwOhnePositionen++; continue; }
  if (m.gesamtLose > 0) { lkwUndLose++; continue; }
  lkwUndNurPalette++;
  if (bsp.length < 5) bsp.push(`${p.projektName} (${p.status})`);
}
console.log('Projekte mit eigenem LKW (mit_haenger/nur_motorwagen):', lkwGesamt);
console.log('  davon loses Material dabei :', lkwUndLose);
console.log('  davon NUR Palettenware     :', lkwUndNurPalette, '<- faelschlich als Schuettgut gefuehrt');
console.log('  davon ohne Positionen      :', lkwOhnePositionen);
bsp.forEach(b=>console.log('    z.B.', b));
