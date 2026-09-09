/**
 * Löscht ein Massen-Angebot samt seiner Zeilen — über den Server-Key.
 *
 * Warum nicht im Browser: Appwrite Cloud drosselt schreibende Zugriffe je
 * Sitzung hart. Bei 623 Zeilen läuft das Löschen aus dem Portal auch mit
 * Pausen in HTTP 429, und die Kampagne bleibt halb gelöscht zurück. Der
 * Server-Key hat ein eigenes, deutlich höheres Kontingent.
 *
 *   npx tsx scripts/kampagne-loeschen.ts                       # listet auf
 *   npx tsx scripts/kampagne-loeschen.ts <id>                  # Dry-Run
 *   npx tsx scripts/kampagne-loeschen.ts <id> --apply
 *   npx tsx scripts/kampagne-loeschen.ts <id> --apply --produktion
 */
import 'dotenv/config';
import { Client, Databases, Query } from 'node-appwrite';

const APPLY = process.argv.includes('--apply');
const PRODUKTION = process.argv.includes('--produktion');
const DB = PRODUKTION ? 'tennismehl24_db' : 'tennismehl24_db_mock';
const id = process.argv.slice(2).find((a) => !a.startsWith('--'));

const db = new Databases(new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!));

const schlaf = (ms: number) => new Promise((r) => setTimeout(r, ms));

const alleZeilen = async (kampagneId: string) => {
  const out: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (;;) {
    const r = await db.listDocuments(DB, 'massen_angebot_zeilen',
      [Query.equal('kampagneId', kampagneId), Query.limit(100), Query.offset(offset)]);
    out.push(...(r.documents as Array<Record<string, unknown>>));
    if (r.documents.length < 100) break;
    offset += 100;
  }
  return out;
};

(async () => {
  if (!id) {
    const r = await db.listDocuments(DB, 'massen_angebote', [Query.limit(50)]);
    console.log(`Kampagnen in ${DB}:\n`);
    for (const k of r.documents as Array<Record<string, unknown>>) {
      const zeilen = await alleZeilen(String(k.$id));
      const versendet = zeilen.filter((z) => z.versendetAm).length;
      console.log(`  ${k.$id}  ${k.saisonjahr} · ${k.name} · ${k.status}`);
      console.log(`      ${zeilen.length} Zeilen${versendet > 0 ? `, davon ${versendet} VERSENDET` : ''}`);
    }
    console.log('\nZum Löschen: npx tsx scripts/kampagne-loeschen.ts <id> --apply');
    return;
  }

  const kampagne = await db.getDocument(DB, 'massen_angebote', id) as Record<string, unknown>;
  const zeilen = await alleZeilen(id);
  const versendet = zeilen.filter((z) => z.versendetAm);

  console.log(`${APPLY ? 'LÖSCHEN' : 'DRY-RUN'} · ${DB}`);
  console.log(`  ${kampagne.name} (${kampagne.saisonjahr}, Status ${kampagne.status})`);
  console.log(`  ${zeilen.length} Zeilen, davon ${versendet.length} bereits versendet\n`);

  if (kampagne.status === 'versendet') {
    console.error('ABBRUCH: Die Kampagne ist als versendet markiert. Was beim Verein im');
    console.error('Postfach liegt, muss nachvollziehbar bleiben — bitte abbrechen statt löschen.');
    process.exit(1);
  }
  if (versendet.length > 0) {
    console.error(`ABBRUCH: ${versendet.length} Zeile(n) wurden bereits verschickt:`);
    versendet.slice(0, 10).forEach((z) => console.error(`   ${z.kundenname} → ${z.empfaengerEmail}`));
    console.error('Diese Angebote liegen beim Verein. Löschen würde die Spur kappen.');
    process.exit(1);
  }
  if (!APPLY) { console.log('Nichts gelöscht. Zum Ausführen: --apply'); return; }

  let weg = 0;
  for (const z of zeilen) {
    for (let versuch = 1; versuch <= 5; versuch++) {
      try {
        await db.deleteDocument(DB, 'massen_angebot_zeilen', String(z.$id));
        weg++;
        break;
      } catch (error) {
        const code = (error as { code?: number })?.code;
        if (code === 404) break;               // schon weg — kein Fehler
        if (code === 429 && versuch < 5) { await schlaf(versuch * 1500); continue; }
        if (versuch === 5) throw error;
      }
    }
    if (weg % 50 === 0) console.log(`  ${weg}/${zeilen.length} …`);
    await schlaf(60);
  }

  await db.deleteDocument(DB, 'massen_angebote', id);
  console.log(`\n✓ ${weg} Zeilen und die Kampagne „${kampagne.name}" gelöscht.`);
})();
