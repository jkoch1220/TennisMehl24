/**
 * Repariert Projekte für die eine aktive Rechnung existiert, deren projekt.status aber NICHT
 * 'rechnung'/'bezahlt' ist ODER deren rechnungsnummer fehlt.
 *
 * Schreibt NUR Top-Level-Felder (status, rechnungsnummer, rechnungsdatum, geaendertAm), damit
 * das `data`-Feld nicht angetastet wird — genau der Schutz, der bei der Original-Speicherung
 * gefehlt hat (data-Overflow am 10000-Zeichen-Limit).
 *
 * Vorsicht bei status='bezahlt': nur rechnungsnummer/rechnungsdatum ergänzen, status NICHT
 * zurück auf 'rechnung' setzen (bezahlt ist der gewünschte Endzustand).
 *
 * Vorsicht bei status='rechnung': nur rechnungsnummer/rechnungsdatum ergänzen wenn fehlt.
 *
 * Vorsicht bei status anders (lieferschein etc.): status auf 'rechnung' setzen +
 * rechnungsnummer/rechnungsdatum ergänzen.
 *
 * Ausführen:    npx tsx scripts/repariere-projekte-ohne-rechnung-status.ts --dry-run
 * Live-Update:  npx tsx scripts/repariere-projekte-ohne-rechnung-status.ts
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.VITE_APPWRITE_API_KEY!);
const databases = new Databases(client);

const DRY_RUN = process.argv.includes('--dry-run');
const DB = 'tennismehl24_db';
const COL_DOKUMENTE = 'bestellabwicklung_dokumente';
const COL_PROJEKTE = 'projekte';

interface RechnungsDok {
  $id: string;
  $createdAt: string;
  projektId: string;
  dokumentTyp: string;
  dokumentNummer: string;
  rechnungsStatus?: string;
  bruttobetrag?: number;
}

interface ProjektDoc {
  $id: string;
  status?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  data?: string;
}

async function ladeAlleRechnungen(): Promise<RechnungsDok[]> {
  const alle: RechnungsDok[] = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DB, COL_DOKUMENTE, [
      Query.equal('dokumentTyp', 'rechnung'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
      Query.offset(offset),
    ]);
    for (const d of res.documents) alle.push(d as unknown as RechnungsDok);
    if (res.documents.length < 100) break;
    offset += 100;
    if (offset > 50000) break;
  }
  return alle;
}

async function main() {
  console.log('🔧 Repariere Projekte mit fehlender Rechnungs-Verknüpfung');
  console.log(DRY_RUN ? '📋 DRY-RUN — keine Schreibvorgänge\n' : '🚀 LIVE — schreibt in Appwrite\n');

  const rechnungen = await ladeAlleRechnungen();

  // Pro projektId nur die neueste AKTIVE Rechnung
  const aktiveProProjekt = new Map<string, RechnungsDok>();
  for (const r of rechnungen) {
    if (r.rechnungsStatus === 'storniert') continue;
    if (!aktiveProProjekt.has(r.projektId)) {
      aktiveProProjekt.set(r.projektId, r);
    }
  }

  let inkonsistent = 0;
  let erfolg = 0;
  let fehler = 0;
  let uebersprungen = 0;

  for (const [projektId, rechnung] of aktiveProProjekt) {
    let projekt: ProjektDoc;
    try {
      const doc = await databases.getDocument(DB, COL_PROJEKTE, projektId);
      projekt = doc as unknown as ProjektDoc;
    } catch {
      console.log(`⏭️  ${projektId}: Projekt nicht gefunden — übersprungen`);
      uebersprungen++;
      continue;
    }

    // Effektiven Status + rechnungsnummer ermitteln (Top-Level vor data-JSON bevorzugen)
    let dataStatus: string | undefined;
    let dataRechnungsnummer: string | undefined;
    if (typeof projekt.data === 'string') {
      try {
        const parsed = JSON.parse(projekt.data);
        dataStatus = parsed.status;
        dataRechnungsnummer = parsed.rechnungsnummer;
      } catch { /* ignore */ }
    }
    const effektiverStatus = projekt.status || dataStatus || '(leer)';
    const effektiveRechnungsnummer = projekt.rechnungsnummer || dataRechnungsnummer || '';

    const statusInkorrekt = effektiverStatus !== 'rechnung' && effektiverStatus !== 'bezahlt';
    const rechnungsnummerFehlt = !effektiveRechnungsnummer;

    if (!statusInkorrekt && !rechnungsnummerFehlt) continue; // alles OK
    inkonsistent++;

    // Schreib-Plan:
    // - rechnungsnummer + rechnungsdatum IMMER ergänzen wenn fehlt
    // - status auf 'rechnung' setzen NUR wenn aktuell weder 'rechnung' noch 'bezahlt'
    //   (bezahlt-Projekte behalten 'bezahlt' — das ist der gewünschte Endzustand)
    const update: Record<string, string> = {
      geaendertAm: new Date().toISOString(),
    };
    const aktionen: string[] = [];

    if (statusInkorrekt) {
      update.status = 'rechnung';
      aktionen.push(`status ${effektiverStatus} → rechnung`);
    }
    if (rechnungsnummerFehlt) {
      update.rechnungsnummer = rechnung.dokumentNummer;
      update.rechnungsdatum = rechnung.$createdAt.split('T')[0];
      aktionen.push(`rechnungsnummer → ${rechnung.dokumentNummer}`);
    }

    console.log(`▶ ${projektId}  (data ${typeof projekt.data === 'string' ? projekt.data.length : 0} Zeichen)`);
    for (const a of aktionen) console.log(`     ${a}`);

    if (DRY_RUN) continue;

    try {
      await databases.updateDocument(DB, COL_PROJEKTE, projektId, update);
      console.log(`     ✅ geschrieben`);
      erfolg++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`     ❌ Fehler: ${msg}`);
      fehler++;
    }
  }

  console.log('');
  console.log('📊 Ergebnis:');
  console.log(`   Inkonsistente Projekte gefunden:   ${inkonsistent}`);
  if (!DRY_RUN) {
    console.log(`   Erfolgreich repariert:             ${erfolg}`);
    console.log(`   Fehlgeschlagen:                    ${fehler}`);
  }
  console.log(`   Übersprungen (Projekt gelöscht):   ${uebersprungen}`);

  if (DRY_RUN && inkonsistent > 0) {
    console.log('\nMit "npx tsx scripts/repariere-projekte-ohne-rechnung-status.ts" (ohne --dry-run) ausführen.');
  }
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
