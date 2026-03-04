/**
 * Fix-Script für verwaiste Projekt-Referenzen
 *
 * Findet Projekte, die auf gelöschte saison_kunden verweisen und:
 * 1. Versucht sie auf neue Kunden mit gleichem Namen zu mappen
 * 2. Oder entfernt die Referenz wenn kein Match gefunden wird
 *
 * Führe aus mit: npx tsx scripts/fix-orphaned-projekt-referenzen.ts
 * Für Vorschau: npx tsx scripts/fix-orphaned-projekt-referenzen.ts --dry-run
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
const PROJEKTE_COLLECTION_ID = 'projekte';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';

const DRY_RUN = process.argv.includes('--dry-run');

// ==================== HELPER ====================

function parseDocument<T>(doc: any): T {
  if (doc?.data && typeof doc.data === 'string') {
    try {
      const parsed = JSON.parse(doc.data) as T;
      return { ...parsed, id: (parsed as any).id || doc.$id };
    } catch { /* ignore */ }
  }
  return { id: doc.$id } as T;
}

// ==================== HAUPTFUNKTION ====================

async function main() {
  console.log('🔧 Fix verwaiste Projekt-Referenzen');
  console.log('='.repeat(65));
  console.log(DRY_RUN ? '📋 DRY-RUN Modus (keine Änderungen)\n' : '🚀 LIVE Modus\n');

  // 1. Lade alle Kunden (für ID -> Name Mapping)
  console.log('📥 Lade alle Kunden...');
  const kundenResponse = await databases.listDocuments(
    DATABASE_ID,
    SAISON_KUNDEN_COLLECTION_ID,
    [Query.limit(5000)]
  );

  const kundenById = new Map<string, any>();
  const kundenByName = new Map<string, any>();

  for (const doc of kundenResponse.documents) {
    const kunde = parseDocument<any>(doc);
    kundenById.set(kunde.id || doc.$id, { ...kunde, $id: doc.$id });
    if (kunde.name) {
      kundenByName.set(kunde.name.toLowerCase().trim(), { ...kunde, $id: doc.$id });
    }
  }

  console.log(`   → ${kundenById.size} Kunden geladen\n`);

  // 2. Lade alle Projekte
  console.log('📥 Lade alle Projekte...');
  let alleProjekte: any[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      PROJEKTE_COLLECTION_ID,
      [Query.limit(limit), Query.offset(offset)]
    );

    for (const doc of response.documents) {
      const projekt = parseDocument<any>(doc);
      alleProjekte.push({ ...projekt, $id: doc.$id, _rawDoc: doc });
    }

    if (response.documents.length < limit) break;
    offset += limit;
  }

  console.log(`   → ${alleProjekte.length} Projekte geladen\n`);

  // 3. Finde Projekte mit verwaisten Referenzen
  console.log('🔍 Suche verwaiste Referenzen...\n');

  const verwaisteProjekte: any[] = [];

  for (const projekt of alleProjekte) {
    // Prüfe beide möglichen Felder
    const kundeId = projekt.kundeId || projekt.saisonKundeId;

    if (kundeId && !kundenById.has(kundeId)) {
      verwaisteProjekte.push(projekt);
    }
  }

  if (verwaisteProjekte.length === 0) {
    console.log('✅ Keine verwaisten Referenzen gefunden!');
    return;
  }

  console.log(`⚠️  ${verwaisteProjekte.length} Projekte mit verwaisten Referenzen gefunden:\n`);

  // 4. Versuche Mapping oder zeige Info
  const zuAktualisieren: { projekt: any; neueKundeId: string | null; kundenName: string }[] = [];

  for (const projekt of verwaisteProjekte) {
    // Versuche Kunden über den Projektnamen oder Kundenname zu finden
    const projektName = projekt.name || projekt.kundenname || '';
    const kundenname = projekt.kundenname || projekt.name || '';

    // Suche nach passendem Kunden
    let gefundenerKunde: any = null;

    // Exakte Übereinstimmung
    if (kundenByName.has(kundenname.toLowerCase().trim())) {
      gefundenerKunde = kundenByName.get(kundenname.toLowerCase().trim());
    }

    // Wenn nicht gefunden, versuche Teilübereinstimmung
    if (!gefundenerKunde && kundenname) {
      for (const [name, kunde] of kundenByName.entries()) {
        if (name.includes(kundenname.toLowerCase().trim()) ||
            kundenname.toLowerCase().trim().includes(name)) {
          gefundenerKunde = kunde;
          break;
        }
      }
    }

    const status = gefundenerKunde
      ? `→ Match: ${gefundenerKunde.name} (${gefundenerKunde.id})`
      : '→ Kein Match - Referenz wird entfernt';

    console.log(`   📋 Projekt: ${projektName}`);
    console.log(`      Alte kundeId: ${projekt.kundeId || projekt.saisonKundeId}`);
    console.log(`      Kundenname: ${kundenname}`);
    console.log(`      ${status}`);
    console.log('');

    zuAktualisieren.push({
      projekt,
      neueKundeId: gefundenerKunde?.id || null,
      kundenName: gefundenerKunde?.name || kundenname,
    });
  }

  // 5. Zusammenfassung
  const mitMatch = zuAktualisieren.filter(x => x.neueKundeId !== null);
  const ohneMatch = zuAktualisieren.filter(x => x.neueKundeId === null);

  console.log('='.repeat(65));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(65));
  console.log(`   Verwaiste Projekte: ${verwaisteProjekte.length}`);
  console.log(`   Mit Match (wird aktualisiert): ${mitMatch.length}`);
  console.log(`   Ohne Match (Referenz entfernt): ${ohneMatch.length}`);
  console.log('');

  if (DRY_RUN) {
    console.log('💡 Führe ohne --dry-run aus um Änderungen vorzunehmen:');
    console.log('   npx tsx scripts/fix-orphaned-projekt-referenzen.ts');
    return;
  }

  // 6. Aktualisierungen durchführen
  console.log('🔧 Aktualisiere Projekte...\n');

  let aktualisiert = 0;
  let fehler = 0;

  for (const item of zuAktualisieren) {
    const { projekt, neueKundeId, kundenName } = item;

    try {
      // Parse existierende Daten
      const rawDoc = projekt._rawDoc;
      let existingData: any = {};

      if (rawDoc?.data && typeof rawDoc.data === 'string') {
        try {
          existingData = JSON.parse(rawDoc.data);
        } catch { /* ignore */ }
      }

      // Aktualisiere kundeId (und saisonKundeId falls vorhanden)
      const updatedData = {
        ...existingData,
        kundeId: neueKundeId, // null oder neue ID
        saisonKundeId: neueKundeId, // null oder neue ID
      };

      await databases.updateDocument(
        DATABASE_ID,
        PROJEKTE_COLLECTION_ID,
        projekt.$id,
        { data: JSON.stringify(updatedData) }
      );

      const aktion = neueKundeId ? `→ ${kundenName}` : '→ Referenz entfernt';
      console.log(`   ✅ ${projekt.name || projekt.$id}: ${aktion}`);
      aktualisiert++;
    } catch (error: any) {
      console.error(`   ❌ ${projekt.name || projekt.$id}: ${error.message}`);
      fehler++;
    }
  }

  console.log('\n' + '='.repeat(65));
  console.log('📊 ERGEBNIS');
  console.log('='.repeat(65));
  console.log(`   Aktualisiert: ${aktualisiert}`);
  console.log(`   Fehler: ${fehler}`);
  console.log('\n✅ Fertig!');
}

main().catch(console.error);
