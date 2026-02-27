/**
 * Fix-Script für K.S.D Vereine
 * Migriert fehlende Felder: tonnenLetztesJahr und belieferungsart
 *
 * Führe aus mit: npx tsx scripts/fix-ksd-vereine-daten.ts
 * Für Vorschau: npx tsx scripts/fix-ksd-vereine-daten.ts --dry-run
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';
const SAISON_DATEN_COLLECTION_ID = 'saison_daten';

const DRY_RUN = process.argv.includes('--dry-run');

// Bekannte Mengen aus dem Import (für Vereine ohne SaisonDaten)
const BEKANNTE_MENGEN: Record<string, number> = {
  'TC Rot-Weiß Miltenberg': 12,
  'TC Grün-Weiß Freudenberg': 12.5,
  'TC Weiß-Blau Wörth am Main': 12.5,
  'TC Großheubach': 19,
  'TC Blau-Weiß Wertheim': 6,
  'Tennisclub Bürgstadt': 5,
  'TC Mömlingen': 12,
  'SV GW Laudenbach': 5,
  'TC Grün-Weiß Fulda': 25,
  'TC Rot-Weiß Fulda': 15,
  'TC Bad Zwesten': 6,
  'TSV Eintracht Naumburg Tennis': 10,
  'SV S-W Kleinenglis': 7,
};

// Standard-Belieferungsart falls nicht bekannt
const DEFAULT_BELIEFERUNGSART = 'nur_motorwagen';

function parseDocument<T>(doc: any): T {
  if (doc?.data && typeof doc.data === 'string') {
    try {
      const parsed = JSON.parse(doc.data) as T;
      return {
        ...parsed,
        id: (parsed as any).id || doc.$id,
      };
    } catch {
      // ignore
    }
  }
  return { id: doc.$id } as T;
}

function toPayload<T extends Record<string, any>>(obj: T): Record<string, any> {
  return { data: JSON.stringify(obj) };
}

async function main() {
  console.log('🔧 K.S.D Vereine Fix-Script');
  console.log(DRY_RUN ? '📋 DRY-RUN Modus (keine Änderungen)\n' : '🚀 LIVE Modus\n');

  try {
    // 1. Finde KSD Platzbauer
    console.log('🔍 Suche K.S.D Platzbauer...');
    const kundenResponse = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    let ksdPlatzbauer: any = null;
    const alleKunden: any[] = [];

    for (const doc of kundenResponse.documents) {
      const kunde = parseDocument<any>(doc);
      alleKunden.push({ ...kunde, $id: doc.$id });

      if (kunde.typ === 'platzbauer' && kunde.name?.toLowerCase().includes('k.s.d')) {
        ksdPlatzbauer = { ...kunde, $id: doc.$id };
      }
    }

    if (!ksdPlatzbauer) {
      console.error('❌ K.S.D Platzbauer nicht gefunden!');
      process.exit(1);
    }

    console.log(`✅ Gefunden: ${ksdPlatzbauer.name} (${ksdPlatzbauer.id})\n`);

    // 2. Finde alle Vereine dieses Platzbauers
    const ksdVereine = alleKunden.filter(
      k => k.typ === 'verein' &&
           k.aktiv &&
           k.standardPlatzbauerId === ksdPlatzbauer.id
    );

    console.log(`📋 ${ksdVereine.length} Vereine gefunden\n`);

    // 3. Lade alle SaisonDaten für 2026
    const saisonDatenResponse = await databases.listDocuments(
      DATABASE_ID,
      SAISON_DATEN_COLLECTION_ID,
      [Query.equal('saisonjahr', 2026), Query.limit(5000)]
    );

    const saisonDatenMap = new Map<string, any>();
    for (const doc of saisonDatenResponse.documents) {
      const sd = parseDocument<any>(doc);
      saisonDatenMap.set(sd.kundeId, sd);
    }

    // 4. Vereine durchgehen und updaten
    let aktualisiert = 0;
    let uebersprungen = 0;

    for (const verein of ksdVereine) {
      const saisonDaten = saisonDatenMap.get(verein.id);

      // Bestimme Menge
      let menge = verein.tonnenLetztesJahr;
      if (!menge && saisonDaten?.angefragteMenge) {
        menge = saisonDaten.angefragteMenge;
      }
      if (!menge && BEKANNTE_MENGEN[verein.name]) {
        menge = BEKANNTE_MENGEN[verein.name];
      }

      // Bestimme Belieferungsart
      let belieferungsart = verein.belieferungsart;
      if (!belieferungsart) {
        belieferungsart = DEFAULT_BELIEFERUNGSART;
      }

      // Bestimme Lieferwoche aus SaisonDaten
      let wunschLieferwoche = verein.wunschLieferwoche;
      if (!wunschLieferwoche && saisonDaten?.lieferfensterFrueh) {
        // Berechne KW aus Datum
        const datum = new Date(saisonDaten.lieferfensterFrueh);
        const startOfYear = new Date(datum.getFullYear(), 0, 1);
        const days = Math.floor((datum.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
        wunschLieferwoche = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      }

      // Prüfe ob Update nötig
      const needsUpdate =
        verein.tonnenLetztesJahr !== menge ||
        verein.belieferungsart !== belieferungsart ||
        verein.wunschLieferwoche !== wunschLieferwoche;

      if (!needsUpdate) {
        console.log(`⏭️  ${verein.name} - bereits aktuell`);
        uebersprungen++;
        continue;
      }

      console.log(`\n📝 ${verein.name}:`);
      if (verein.tonnenLetztesJahr !== menge) {
        console.log(`   Menge: ${verein.tonnenLetztesJahr || '-'} → ${menge || '-'} t`);
      }
      if (verein.belieferungsart !== belieferungsart) {
        console.log(`   Belieferung: ${verein.belieferungsart || '-'} → ${belieferungsart}`);
      }
      if (verein.wunschLieferwoche !== wunschLieferwoche) {
        console.log(`   Lieferwoche: ${verein.wunschLieferwoche || '-'} → KW ${wunschLieferwoche || '-'}`);
      }

      if (!DRY_RUN) {
        const aktualisierterKunde = {
          ...verein,
          tonnenLetztesJahr: menge,
          belieferungsart,
          wunschLieferwoche,
          geaendertAm: new Date().toISOString(),
        };
        delete aktualisierterKunde.$id;

        await databases.updateDocument(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          verein.$id,
          toPayload(aktualisierterKunde)
        );
        console.log(`   ✅ Aktualisiert`);
      }

      aktualisiert++;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`\n✅ Fertig!`);
    console.log(`   ${aktualisiert} Vereine ${DRY_RUN ? 'würden aktualisiert werden' : 'aktualisiert'}`);
    console.log(`   ${uebersprungen} Vereine bereits aktuell`);

    if (DRY_RUN) {
      console.log('\n💡 Führe ohne --dry-run aus, um Änderungen zu speichern.');
    }

  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
