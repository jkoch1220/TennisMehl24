/**
 * Gleicht das Sandbox-Schema an die Produktion an.
 *
 * Die Mock-Datenbank ist eine KOPIE, aber sie altert: Wer in der Produktion ein
 * Attribut ergänzt, hat es in der Sandbox nicht. Das fällt nicht sofort auf —
 * Appwrite antwortet auf eine Abfrage mit unbekanntem Attribut mit HTTP 400,
 * und wo ein Fallback greift, sieht man nur rote Konsolenzeilen.
 *
 * Gefährlich wird es beim SCHREIBEN: Ein Feld, das es in der Sandbox nicht
 * gibt, wird stillschweigend nicht gespeichert. Die Generalprobe prüft dann
 * einen Ablauf, den es so in der Produktion nicht gibt.
 *
 * FALLE: `listCollections` liefert ohne Query nur 25 Einträge. Bei 81
 * Collections prüft man sonst ein Drittel und meldet „alles in Ordnung".
 *
 *   npx tsx scripts/sandbox-schema-angleichen.ts            # Dry-Run
 *   npx tsx scripts/sandbox-schema-angleichen.ts --apply
 */
import 'dotenv/config';
import { Client, Databases, Query } from 'node-appwrite';

const APPLY = process.argv.includes('--apply');
const PROD = 'tennismehl24_db';
const MOCK = 'tennismehl24_db_mock';

const db = new Databases(new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!));

const schlaf = (ms: number) => new Promise((r) => setTimeout(r, ms));

const alleCollections = async (DB: string) => {
  const out: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (;;) {
    const r = await db.listCollections(DB, [Query.limit(100), Query.offset(offset)]);
    out.push(...(r.collections as Array<Record<string, unknown>>));
    if (r.collections.length < 100) break;
    offset += 100;
  }
  return out;
};

type Attribut = Record<string, unknown> & { key: string; type: string };

const holeAttribute = async (DB: string, coll: string): Promise<Attribut[] | null> => {
  try {
    const c = await db.getCollection(DB, coll) as unknown as { attributes: Attribut[] };
    return c.attributes;
  } catch { return null; }
};

/** Legt ein Attribut mit denselben Eigenschaften an wie in der Produktion. */
const lege = async (coll: string, a: Attribut): Promise<void> => {
  const key = a.key;
  const pflicht = Boolean(a.required);
  const array = Boolean(a.array);
  const standard = pflicht ? undefined : (a.default as never);
  switch (a.type) {
    case 'string':
      if (a.format === 'email') { await db.createEmailAttribute(MOCK, coll, key, pflicht, standard, array); break; }
      if (a.format === 'url') { await db.createUrlAttribute(MOCK, coll, key, pflicht, standard, array); break; }
      if (a.format === 'enum') {
        await db.createEnumAttribute(MOCK, coll, key, a.elements as string[], pflicht, standard, array); break;
      }
      await db.createStringAttribute(MOCK, coll, key, Number(a.size ?? 255), pflicht, standard, array);
      break;
    case 'integer':
      await db.createIntegerAttribute(MOCK, coll, key, pflicht, a.min as number, a.max as number, standard, array);
      break;
    case 'double':
      await db.createFloatAttribute(MOCK, coll, key, pflicht, a.min as number, a.max as number, standard, array);
      break;
    case 'boolean':
      await db.createBooleanAttribute(MOCK, coll, key, pflicht, standard, array);
      break;
    case 'datetime':
      await db.createDatetimeAttribute(MOCK, coll, key, pflicht, standard, array);
      break;
    default:
      throw new Error(`Unbekannter Attributtyp ${a.type}`);
  }
};

(async () => {
  const prod = await alleCollections(PROD);
  const mock = await alleCollections(MOCK);
  const mockIds = new Set(mock.map((c) => String(c.$id)));
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} · Produktion ${prod.length} Collections · Sandbox ${mock.length}\n`);

  let ergaenzt = 0;
  const fehlendeColl: string[] = [];
  for (const c of prod) {
    const coll = String(c.$id);
    if (!mockIds.has(coll)) { fehlendeColl.push(coll); continue; }
    const p = await holeAttribute(PROD, coll) ?? [];
    const m = await holeAttribute(MOCK, coll) ?? [];
    const vorhanden = new Set(m.map((a) => a.key));
    const fehlt = p.filter((a) => !vorhanden.has(a.key));
    if (fehlt.length === 0) continue;

    console.log(`${coll}: ${fehlt.length} Attribut(e) fehlen`);
    for (const a of fehlt) {
      console.log(`   ${a.key} (${a.type}${a.size ? `, ${a.size}` : ''}${a.required ? ', required' : ''})`);
      if (!APPLY) continue;
      try {
        await lege(coll, a);
        ergaenzt++;
        // Appwrite legt Attribute asynchron an; zu schnell hintereinander
        // quittiert es mit 429.
        await schlaf(400);
      } catch (error) {
        console.error(`      FEHLER: ${(error as Error).message}`);
      }
    }
  }

  if (fehlendeColl.length > 0) {
    console.log(`\nNur in der Produktion (nicht angelegt, das wäre ein eigener Schritt):`);
    console.log(`   ${fehlendeColl.join(', ')}`);
  }
  const prodIds = new Set(prod.map((c) => String(c.$id)));
  const nurMock = mock.filter((c) => !prodIds.has(String(c.$id))).map((c) => String(c.$id));
  if (nurMock.length > 0) {
    console.log(`\nNur in der Sandbox — fehlen der PRODUKTION:`);
    console.log(`   ${nurMock.join(', ')}`);
  }

  console.log(APPLY ? `\n✓ ${ergaenzt} Attribut(e) in der Sandbox ergänzt.` : '\nNichts geschrieben. Zum Ausführen: --apply');
})();
