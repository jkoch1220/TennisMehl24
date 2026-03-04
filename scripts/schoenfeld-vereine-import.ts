/**
 * Import-Script für Platzbauer Schönfeld Tennisservice
 * Legt 16 neue Vereine an (NUR ANLEGEN, kein Löschen)
 *
 * Führe aus mit: npx tsx scripts/schoenfeld-vereine-import.ts
 * Für Vorschau: npx tsx scripts/schoenfeld-vereine-import.ts --dry-run
 */

import { Client, Databases, Query, ID } from 'node-appwrite';
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
const SAISON_ANSPRECHPARTNER_COLLECTION_ID = 'saison_ansprechpartner';

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_CONFIRM = process.argv.includes('--yes') || process.argv.includes('-y');

// ==================== TYPEN ====================

type Belieferungsart = 'nur_motorwagen' | 'mit_haenger' | 'abholung_ab_werk' | 'palette_mit_ladekran' | 'bigbag';

interface VereinData {
  name: string;
  plaetze: number;
  strasse: string;
  plz: string;
  ort: string;
  tonnen: number;
  belieferungsart: Belieferungsart;
  anfahrtshinweise?: string;
  apName: string;
  apTelefon: string;
}

// ==================== VEREINSDATEN ====================

const VEREINE: VereinData[] = [
  {
    name: 'TV Würzburg-Oberdürrbach',
    plaetze: 5,
    strasse: 'Schafhofstr.',
    plz: '97080',
    ort: 'Würzburg',
    tonnen: 11,
    belieferungsart: 'mit_haenger', // frei
    apName: 'Klaus Schröder',
    apTelefon: '0171-2219172',
  },
  {
    name: 'TSG Sommerhausen',
    plaetze: 2,
    strasse: 'Wildpark, An der Tränk',
    plz: '97286',
    ort: 'Sommerhausen',
    tonnen: 4.5,
    belieferungsart: 'mit_haenger', // ???
    apName: 'Gertrud Fuchs',
    apTelefon: '0171-2737398',
  },
  {
    name: 'TC Forchheim',
    plaetze: 8,
    strasse: 'Krankenhausstr. 6',
    plz: '91301',
    ort: 'Forchheim',
    tonnen: 17,
    belieferungsart: 'mit_haenger', // frei
    apName: 'Michael Aschke',
    apTelefon: '0162-6951862',
  },
  {
    name: 'TSV Viktoria Homburg',
    plaetze: 3,
    strasse: 'Dertinger Str. 7-9',
    plz: '97855',
    ort: 'Triefenstein',
    tonnen: 6,
    belieferungsart: 'mit_haenger', // ???
    apName: 'Dagmar Baumann',
    apTelefon: '0174-6307204',
  },
  {
    name: 'TC Werbach',
    plaetze: 2,
    strasse: 'Zieglersgrübe 18',
    plz: '97956',
    ort: 'Werbach',
    tonnen: 5,
    belieferungsart: 'mit_haenger', // frei
    apName: 'Herr Seidenspinner',
    apTelefon: '0171-4688286',
  },
  {
    name: 'TC Hausen',
    plaetze: 2,
    strasse: 'Alt-Hausen 29',
    plz: '60488',
    ort: 'Frankfurt',
    tonnen: 5,
    belieferungsart: 'mit_haenger', // ???
    apName: 'Frau Pyzula',
    apTelefon: '0177-4801175',
  },
  {
    name: 'TV Rüsselsheim-Hasloch',
    plaetze: 6,
    strasse: 'Mörfelder Str. 38',
    plz: '65428',
    ort: 'Rüsselsheim',
    tonnen: 14,
    belieferungsart: 'mit_haenger', // ???
    apName: 'Herr Schuchter',
    apTelefon: '0179-4685717',
  },
  {
    name: 'TSV Eisingen',
    plaetze: 3,
    strasse: 'Pfarrer Robert-Kümmert-Str. 3',
    plz: '97249',
    ort: 'Eisingen',
    tonnen: 7,
    belieferungsart: 'mit_haenger', // frei
    apName: 'Eberhard Blenk',
    apTelefon: '0176-22781374',
  },
  {
    name: 'TC Marxheim',
    plaetze: 5,
    strasse: 'Schlossstr. 70',
    plz: '65719',
    ort: 'Marxheim',
    tonnen: 11,
    belieferungsart: 'mit_haenger', // frei
    apName: 'Frau Gramsch',
    apTelefon: '0163-6871039',
  },
  {
    name: 'TG Zell',
    plaetze: 4,
    strasse: 'Scheckertstr. 13',
    plz: '97299',
    ort: 'Zell am Main',
    tonnen: 9,
    belieferungsart: 'nur_motorwagen', // eng
    anfahrtshinweise: 'Enge Zufahrt - kein Anhänger',
    apName: 'Christian Fernandes',
    apTelefon: '0176-24075944',
  },
  {
    name: 'TC BW Zellertal',
    plaetze: 3,
    strasse: 'Schulsportanlage Zellertal',
    plz: '67308',
    ort: 'Zellertal',
    tonnen: 7.5,
    belieferungsart: 'nur_motorwagen', // Maschinenwagen
    anfahrtshinweise: 'Nur Maschinenwagen',
    apName: 'Andreas Lorenz',
    apTelefon: '0170-4328827',
  },
  {
    name: 'TGS Vorwärts Frankfurt',
    plaetze: 5,
    strasse: 'Rebstöcker Weg 17',
    plz: '60489',
    ort: 'Frankfurt',
    tonnen: 12,
    belieferungsart: 'mit_haenger', // frei
    apName: 'Jens Dolderer',
    apTelefon: '0178-5352331',
  },
  {
    name: 'TC Wittighausen',
    plaetze: 2,
    strasse: 'Krensheimer Str. 3',
    plz: '97957',
    ort: 'Wittighausen',
    tonnen: 5,
    belieferungsart: 'mit_haenger', // ???
    apName: 'Herr Deissler',
    apTelefon: '0176-52177058',
  },
  {
    name: 'TG Mainhausen-Zellhausen',
    plaetze: 4,
    strasse: 'Am Mühlbach 27',
    plz: '63533',
    ort: 'Mainhausen-Zellhausen',
    tonnen: 10,
    belieferungsart: 'mit_haenger', // frei
    apName: 'Erik Ulrich',
    apTelefon: '0176-61470875',
  },
  {
    name: 'SV Rieden',
    plaetze: 2,
    strasse: 'Ziegelberg 40',
    plz: '74538',
    ort: 'Rosengarten-Rieden',
    tonnen: 4.5,
    belieferungsart: 'mit_haenger', // frei
    apName: 'Horst Schweizer',
    apTelefon: '0791-9597459',
  },
  {
    name: 'TC Großrinderfeld',
    plaetze: 2,
    strasse: 'Krensheimer Weg 4',
    plz: '97950',
    ort: 'Großrinderfeld',
    tonnen: 5,
    belieferungsart: 'nur_motorwagen', // Maschinenwagen
    anfahrtshinweise: 'Nur Maschinenwagen',
    apName: 'Walter Rüger',
    apTelefon: '0170-4012796',
  },
];

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

function toPayload<T extends Record<string, any>>(obj: T): Record<string, any> {
  return { data: JSON.stringify(obj) };
}

function getBundeslandAusPLZ(plz: string): string {
  const prefix = parseInt(plz.substring(0, 2));
  if (prefix >= 60 && prefix <= 65) return 'Hessen';
  if (prefix >= 67 && prefix <= 67) return 'Rheinland-Pfalz';
  if (prefix >= 74 && prefix <= 74) return 'Baden-Württemberg';
  if (prefix >= 91 && prefix <= 91) return 'Bayern';
  if (prefix >= 97 && prefix <= 97) return 'Bayern';
  if (prefix >= 63 && prefix <= 63) return 'Bayern'; // Aschaffenburg area
  return 'Bayern';
}

// ==================== HAUPTFUNKTION ====================

async function main() {
  console.log('🔧 Schönfeld Tennisservice - Vereine Import');
  console.log('='.repeat(65));
  console.log(DRY_RUN ? '📋 DRY-RUN Modus (keine Änderungen)\n' : '🚀 LIVE Modus\n');

  // 1. Zeige Vereine
  console.log(`📋 ${VEREINE.length} Vereine zum Anlegen:\n`);
  for (const v of VEREINE) {
    console.log(`   • ${v.name}`);
    console.log(`     ${v.plaetze} Plätze | ${v.tonnen}t | ${v.belieferungsart}`);
    console.log(`     ${v.plz} ${v.ort}`);
    console.log(`     AP: ${v.apName} (${v.apTelefon})`);
    console.log('');
  }

  // 2. Lade Platzbauer Schönfeld
  console.log('🔍 Suche Platzbauer Schönfeld...');
  const kundenResponse = await databases.listDocuments(
    DATABASE_ID,
    SAISON_KUNDEN_COLLECTION_ID,
    [Query.limit(5000)]
  );

  let schoenfeldPlatzbauer: any = null;

  for (const doc of kundenResponse.documents) {
    const kunde = parseDocument<any>(doc);
    if (kunde.typ === 'platzbauer' && kunde.aktiv &&
        (kunde.name?.toLowerCase().includes('schönfeld') ||
         kunde.name?.toLowerCase().includes('schoenfeld'))) {
      schoenfeldPlatzbauer = { ...kunde, $id: doc.$id };
      break;
    }
  }

  if (!schoenfeldPlatzbauer) {
    console.error('❌ Platzbauer Schönfeld nicht gefunden!');
    console.log('\n   Verfügbare Platzbauer:');
    for (const doc of kundenResponse.documents) {
      const kunde = parseDocument<any>(doc);
      if (kunde.typ === 'platzbauer' && kunde.aktiv) {
        console.log(`   - ${kunde.name}`);
      }
    }
    process.exit(1);
  }

  console.log(`✅ Gefunden: ${schoenfeldPlatzbauer.name} (ID: ${schoenfeldPlatzbauer.id})\n`);

  // 3. Prüfe ob Vereine bereits existieren
  const existierendeVereine: string[] = [];
  for (const doc of kundenResponse.documents) {
    const kunde = parseDocument<any>(doc);
    if (kunde.typ === 'verein' && kunde.standardPlatzbauerId === schoenfeldPlatzbauer.id) {
      existierendeVereine.push(kunde.name);
    }
  }

  if (existierendeVereine.length > 0) {
    console.log(`ℹ️  ${existierendeVereine.length} bestehende Vereine bei Schönfeld:`);
    existierendeVereine.forEach(n => console.log(`   - ${n}`));
    console.log('');
  }

  // Prüfe Duplikate
  const duplikate = VEREINE.filter(v => existierendeVereine.includes(v.name));
  if (duplikate.length > 0) {
    console.log('⚠️  Diese Vereine existieren bereits (werden übersprungen):');
    duplikate.forEach(v => console.log(`   - ${v.name}`));
    console.log('');
  }

  const zuAnlegen = VEREINE.filter(v => !existierendeVereine.includes(v.name));
  console.log(`📊 Zusammenfassung:`);
  console.log(`   Neu anzulegen: ${zuAnlegen.length} Vereine`);
  console.log(`   Übersprungen (Duplikate): ${duplikate.length}`);
  console.log('');

  if (zuAnlegen.length === 0) {
    console.log('ℹ️  Keine neuen Vereine anzulegen.');
    process.exit(0);
  }

  if (!DRY_RUN && !SKIP_CONFIRM) {
    console.log('⚠️  Drücke Ctrl+C zum Abbrechen, oder warte 5 Sekunden...');
    await new Promise(r => setTimeout(r, 5000));
  }

  // ==================== VEREINE ANLEGEN ====================
  console.log('='.repeat(65));
  console.log('📍 Vereine + Ansprechpartner anlegen');
  console.log('='.repeat(65) + '\n');

  let angelegt = 0;
  let apsAngelegt = 0;

  for (const verein of zuAnlegen) {
    console.log(`   📝 ${verein.name}`);
    console.log(`      ${verein.plaetze} Plätze | ${verein.tonnen}t | ${verein.belieferungsart}`);

    const bundesland = getBundeslandAusPLZ(verein.plz);
    const jetzt = new Date().toISOString();
    const vereinId = ID.unique();

    const neuerKunde = {
      id: vereinId,
      typ: 'verein' as const,
      name: verein.name,
      aktiv: true,
      rechnungsadresse: {
        strasse: verein.strasse,
        plz: verein.plz,
        ort: verein.ort,
        bundesland,
      },
      lieferadresse: {
        strasse: verein.strasse,
        plz: verein.plz,
        ort: verein.ort,
        bundesland,
      },
      adresse: {
        strasse: verein.strasse,
        plz: verein.plz,
        ort: verein.ort,
        bundesland,
      },
      standardBezugsweg: 'ueber_platzbauer' as const,
      standardPlatzbauerId: schoenfeldPlatzbauer.id,
      tonnenLetztesJahr: verein.tonnen,
      schuettstellenAnzahl: verein.plaetze > 1 ? verein.plaetze : undefined,
      belieferungsart: verein.belieferungsart,
      dispoAnsprechpartner: {
        name: verein.apName,
        telefon: verein.apTelefon,
      },
      anfahrtshinweise: verein.anfahrtshinweise,
      beziehtUeberUnsPlatzbauer: true,
      abwerkspreis: false,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    if (!DRY_RUN) {
      try {
        // Verein anlegen
        await databases.createDocument(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          vereinId,
          toPayload(neuerKunde)
        );

        // Ansprechpartner anlegen
        const apId = ID.unique();
        const neuerAP = {
          id: apId,
          kundeId: vereinId,
          name: verein.apName,
          rolle: 'Ansprechpartner',
          telefonnummern: [{
            nummer: verein.apTelefon,
            typ: verein.apTelefon.startsWith('01') ? 'Mobil' : 'Telefon',
          }],
          aktiv: true,
          erstelltAm: jetzt,
          geaendertAm: jetzt,
        };

        await databases.createDocument(
          DATABASE_ID,
          SAISON_ANSPRECHPARTNER_COLLECTION_ID,
          apId,
          { kundeId: vereinId, data: JSON.stringify(neuerAP) }
        );

        console.log(`      ✅ Angelegt + 1 AP`);
        angelegt++;
        apsAngelegt++;
      } catch (error: any) {
        console.error(`      ❌ Fehler: ${error.message}`);
      }
    } else {
      console.log(`      📋 Würde angelegt werden + 1 AP`);
      angelegt++;
      apsAngelegt++;
    }
  }

  // ==================== ZUSAMMENFASSUNG ====================
  console.log('\n' + '='.repeat(65));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(65));
  console.log(`   Platzbauer: ${schoenfeldPlatzbauer.name}`);
  console.log(`   Neu angelegt: ${angelegt} Vereine`);
  console.log(`   Ansprechpartner: ${apsAngelegt}`);
  console.log(`   Gesamt bei Schönfeld: ${existierendeVereine.length + angelegt} Vereine`);

  if (DRY_RUN) {
    console.log('\n💡 Führe ohne --dry-run aus:');
    console.log('   npx tsx scripts/schoenfeld-vereine-import.ts --yes');
  } else {
    console.log('\n✅ Import abgeschlossen!');
  }
}

main().catch(console.error);
