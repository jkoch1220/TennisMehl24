/**
 * Import-Script für Averbeck Vereine 2026
 * Basierend auf Excel-Liste "Tennissand Lieferung Tennismehl 2026.xlsx"
 */
import { Client, Databases, Query, ID } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('tennismehl24')
  .setKey('standard_dfd6863760876e94387cc29faa3c91d1fda9db654f0c282ae01de4e0ec80a7db6a8ac3ea4685ef470d592d013141baa01c3e3e66187511f695fe7b776136a31b13fd02e057c4a6adee1bedf7356cfabc4ddb1e680cb60cde834c9ce87b8f33c94ecccace0b8d5c7f3ea101e894df599853d11bdce72bd3a183ddadff7d234f42');

const databases = new Databases(client);
const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';

// Averbeck ID
const AVERBECK_ID = '69381e53001769cc0393';

interface VereinImport {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  tonnen: number;
  kw: number;
  ansprechpartnerName: string;
  ansprechpartnerTelefon: string;
}

// Alle Vereine aus der Excel-Liste + E-Mail (OHNE FC Laubach - wurde storniert)
const VEREINE_ZU_IMPORTIEREN: VereinImport[] = [
  // Aus Excel-Liste
  { name: 'TC Blau Weiss Bad Neustadt a.d. Saale', strasse: 'Salzstraße 2', plz: '97616', ort: 'Bad Neustadt', tonnen: 15.75, kw: 14, ansprechpartnerName: 'Frau Mardian', ansprechpartnerTelefon: '0157-73970794' },
  { name: 'TC 1979 Brensbach e.V.', strasse: 'Waldstr. 83', plz: '64395', ort: 'Brensbach', tonnen: 7.5, kw: 14, ansprechpartnerName: 'Herr Palme', ansprechpartnerTelefon: '0151-18461060' },
  { name: 'TC 1990 Brombachtal e.V.', strasse: 'Dammweg 6', plz: '64753', ort: 'Brombachtal', tonnen: 5.0, kw: 14, ansprechpartnerName: 'Herr Walker', ansprechpartnerTelefon: '0151-46321733' },
  { name: 'TC Bruchköbel e.V.', strasse: 'Gernot-Kopp-Weg', plz: '63486', ort: 'Bruchköbel', tonnen: 20.0, kw: 12, ansprechpartnerName: 'Herr Esakhil', ansprechpartnerTelefon: '0176-20223685' },
  { name: 'DJK Erlangen e.V.', strasse: 'Am Alterlanger See/ Wiesenweg 2', plz: '91056', ort: 'Erlangen', tonnen: 8.5, kw: 14, ansprechpartnerName: 'Herr Rittmeier', ansprechpartnerTelefon: '09131-440961' },
  { name: 'SV Buchonia Flieden e.V.', strasse: 'Am Mühlbach', plz: '36103', ort: 'Flieden', tonnen: 6.0, kw: 15, ansprechpartnerName: 'Frau Diegmüller', ansprechpartnerTelefon: '0151-56156044' },
  { name: 'TC RW Gerbrunn e.V.', strasse: 'Gieshügeler Str. 48', plz: '97218', ort: 'Gerbrunn', tonnen: 15.0, kw: 13, ansprechpartnerName: 'Herr Dr. Pannenbecker', ansprechpartnerTelefon: '0171-8332927' },
  { name: 'TC Gründau e.V.', strasse: 'Am Lindengraben', plz: '63584', ort: 'Gründau-Lieblos', tonnen: 17.0, kw: 13, ansprechpartnerName: 'Herr Köhler', ansprechpartnerTelefon: '0171-9033105' },
  { name: 'TC Grünsfeld e.V.', strasse: 'Taubertalstraße 1A', plz: '97947', ort: 'Grünsfeld', tonnen: 10.0, kw: 13, ansprechpartnerName: 'Herr Dip.-Ing Ehrmann', ansprechpartnerTelefon: '0151-51119444' },
  { name: 'TSV Güntersleben e.V.', strasse: 'Gramschatzerstr. 61', plz: '97261', ort: 'Güntersleben', tonnen: 17.5, kw: 13, ansprechpartnerName: 'Herr Wolf', ansprechpartnerTelefon: '0175-3454963' },
  { name: 'TV Gut Heil von 1903 e.V. Hasloch', strasse: 'Am Witzpfad 1', plz: '97907', ort: 'Hasloch', tonnen: 5.0, kw: 15, ansprechpartnerName: 'Herr Riedel', ansprechpartnerTelefon: '0171-3858730' },
  { name: 'TC Hasselroth e.V.', strasse: 'An den Sportplätzen', plz: '63594', ort: 'Hasselroth', tonnen: 12.5, kw: 13, ansprechpartnerName: 'Herr Zich', ansprechpartnerTelefon: '06055-5394' },
  { name: 'SG Hettstadt', strasse: 'Sportplatzstraße 1', plz: '97265', ort: 'Hettstadt', tonnen: 6.5, kw: 13, ansprechpartnerName: 'Herr Haber', ansprechpartnerTelefon: '0171-5504801' },
  { name: 'TSV Karlstadt e.V.', strasse: 'Baggertsweg', plz: '97753', ort: 'Karlstadt', tonnen: 20.0, kw: 11, ansprechpartnerName: 'Herr Maroscheck', ansprechpartnerTelefon: '0171-5117017' },
  { name: 'TC Kirchheim e.V.', strasse: 'Bayernstr.', plz: '97268', ort: 'Kirchheim', tonnen: 4.0, kw: 14, ansprechpartnerName: 'Herr Rösch', ansprechpartnerTelefon: '0151-15546000' },
  { name: 'SV 1912 Klein Gerau e.V.', strasse: 'Thüringer Weg 12', plz: '64572', ort: 'Büttelborn', tonnen: 10.0, kw: 12, ansprechpartnerName: 'Herr Giebler', ansprechpartnerTelefon: '0177-4795978' },
  { name: 'TC Kleinwallstadt e.V.', strasse: 'Oberhauserweg 4', plz: '63839', ort: 'Kleinwallstadt', tonnen: 17.0, kw: 13, ansprechpartnerName: 'Herr Trautmann', ansprechpartnerTelefon: '0175-2793002' },
  { name: 'TC Knüllwald 1978 e.V.', strasse: 'Im Gernsgrund', plz: '34593', ort: 'Knüllwald', tonnen: 8.0, kw: 14, ansprechpartnerName: 'Herr Bork', ansprechpartnerTelefon: '0172-5125388' },
  { name: 'TC SR Lengfeld e.V.', strasse: 'Werner-von-Siemens-Str. 56', plz: '97076', ort: 'Würzburg', tonnen: 10.0, kw: 13, ansprechpartnerName: 'Herr Müller', ansprechpartnerTelefon: '0170-7990188' },
  { name: 'TC Reichelsheim e.V.', strasse: 'Pestalozzistr. 1', plz: '64385', ort: 'Reichelsheim', tonnen: 10.0, kw: 14, ansprechpartnerName: 'Herr Plößer', ansprechpartnerTelefon: '0175-2231655' },
  { name: 'TC Rimbach e.V.', strasse: 'Kleiststr. 1', plz: '64668', ort: 'Rimbach', tonnen: 7.0, kw: 14, ansprechpartnerName: 'Herr Hennemann', ansprechpartnerTelefon: '0172-6793402' },
  { name: 'TC Weiß-Blau Rimpar e.V.', strasse: 'Burgstrasse', plz: '97222', ort: 'Rimpar', tonnen: 12.0, kw: 13, ansprechpartnerName: 'Herr Dr. Thumbs', ansprechpartnerTelefon: '0152-54295022' },
  { name: 'BSC Urberach e.V.', strasse: 'Traminer Strasse', plz: '63322', ort: 'Rödermark', tonnen: 15.0, kw: 12, ansprechpartnerName: 'Herr Amann', ansprechpartnerTelefon: '0172-6614588' },
  { name: 'TC Westerngrund e.V.', strasse: 'Ruhbornstr.', plz: '63825', ort: 'Westerngrund', tonnen: 7.5, kw: 13, ansprechpartnerName: 'Frau Heilmann', ansprechpartnerTelefon: '0157-373451' },
  { name: 'TG Würzburg-Heidingsfeld e.V.', strasse: 'Wiesenweg 2', plz: '97084', ort: 'Würzburg', tonnen: 15.0, kw: 12, ansprechpartnerName: 'Herr Tauer', ansprechpartnerTelefon: '0160-5824970' },
  // Neukunden aus Excel
  { name: 'TC Rot-Weiß Lohr e.V.', strasse: 'Sackenbacher Str. 31', plz: '97816', ort: 'Lohr am Main', tonnen: 12.5, kw: 14, ansprechpartnerName: 'Herr Knoblach', ansprechpartnerTelefon: '' },
  { name: 'TSV Uettingen e.V.', strasse: 'Mühlweg', plz: '97292', ort: 'Uettingen', tonnen: 6.0, kw: 14, ansprechpartnerName: 'Herr Walter', ansprechpartnerTelefon: '0160-8530703' },
  { name: 'TSV/DJK Wiesentheid', strasse: 'Jahnstraße 35', plz: '97353', ort: 'Wiesentheid', tonnen: 7.5, kw: 14, ansprechpartnerName: 'Herr Pfau', ansprechpartnerTelefon: '0163-3321866' },
  // Neuer Verein aus E-Mail
  { name: 'TC Rot Weiß Eiterfeld e.V.', strasse: 'Am Hain', plz: '36132', ort: 'Eiterfeld', tonnen: 10.0, kw: 13, ansprechpartnerName: 'Herr Scheffer', ansprechpartnerTelefon: '0152-57662300' },
];

// Nächste Kundennummer ermitteln
async function getNextKundennummer(): Promise<number> {
  const docs = await databases.listDocuments(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, [
    Query.limit(500),
  ]);

  let maxNummer = 10000;
  for (const doc of docs.documents) {
    const data = doc.data ? JSON.parse(doc.data as string) : {};
    if (data.kundennummer) {
      const numMatch = data.kundennummer.match(/K(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        if (num > maxNummer) maxNummer = num;
      }
    }
  }
  return maxNummer + 1;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('🔍 DRY-RUN MODUS - Keine Änderungen werden vorgenommen\n');
  }

  // Prüfe welche Vereine bereits existieren
  const docs = await databases.listDocuments(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, [
    Query.limit(500),
  ]);

  const existierendeNamen = new Set<string>();
  for (const doc of docs.documents) {
    const data = doc.data ? JSON.parse(doc.data as string) : {};
    if (data.name) {
      existierendeNamen.add(data.name.toLowerCase().trim());
    }
  }

  // Filtere bereits eingetragene
  const zuImportieren = VEREINE_ZU_IMPORTIEREN.filter(v => {
    const nameNormalized = v.name.toLowerCase().trim();
    // Prüfe exakte Übereinstimmung
    if (existierendeNamen.has(nameNormalized)) {
      console.log(`⏭️  Übersprungen (bereits vorhanden): ${v.name}`);
      return false;
    }
    // Prüfe auf ähnliche Namen
    for (const existing of existierendeNamen) {
      if (existing.includes('bad königshofen') && nameNormalized.includes('bad königshofen')) {
        console.log(`⏭️  Übersprungen (ähnlich vorhanden): ${v.name}`);
        return false;
      }
      if (existing.includes('weis-blau würzburg') && nameNormalized.includes('weiß-blau würzburg')) {
        console.log(`⏭️  Übersprungen (ähnlich vorhanden): ${v.name}`);
        return false;
      }
      if (existing.includes('etsv würzburg') && nameNormalized.includes('etsv würzburg')) {
        console.log(`⏭️  Übersprungen (ähnlich vorhanden): ${v.name}`);
        return false;
      }
    }
    return true;
  });

  console.log(`\n📊 ${zuImportieren.length} Vereine werden importiert\n`);

  if (zuImportieren.length === 0) {
    console.log('✅ Alle Vereine sind bereits eingetragen!');
    return;
  }

  let nextKundennummer = await getNextKundennummer();
  let erfolg = 0;
  let fehler = 0;

  for (const verein of zuImportieren) {
    const kundennummer = `K${nextKundennummer}`;
    nextKundennummer++;

    const kundeData: Record<string, unknown> = {
      id: ID.unique(),
      typ: 'verein',
      name: verein.name,
      kundennummer: kundennummer,
      rechnungsadresse: {
        strasse: verein.strasse,
        plz: verein.plz,
        ort: verein.ort,
        bundesland: '',
      },
      lieferadresse: {
        strasse: verein.strasse,
        plz: verein.plz,
        ort: verein.ort,
        bundesland: '',
      },
      standardBezugsweg: 'ueber_platzbauer',
      standardPlatzbauerId: AVERBECK_ID,
      aktiv: true,
      tonnenLetztesJahr: verein.tonnen,
      wunschLieferwoche: verein.kw,
      erstelltAm: new Date().toISOString(),
    };

    if (verein.ansprechpartnerName) {
      kundeData.dispoAnsprechpartner = {
        name: verein.ansprechpartnerName,
        telefon: verein.ansprechpartnerTelefon,
      };
    }

    console.log(`📝 ${verein.name}`);
    console.log(`   ${verein.plz} ${verein.ort} | ${verein.tonnen}t | KW ${verein.kw}`);
    console.log(`   ${kundennummer} | Ansprechpartner: ${verein.ansprechpartnerName || '-'}`);

    if (!dryRun) {
      try {
        await databases.createDocument(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          kundeData.id as string,
          { data: JSON.stringify(kundeData) }
        );
        console.log(`   ✅ Angelegt\n`);
        erfolg++;
      } catch (err) {
        console.log(`   ❌ Fehler: ${err}\n`);
        fehler++;
      }
    } else {
      console.log(`   🔍 (Dry-Run)\n`);
      erfolg++;
    }
  }

  console.log('='.repeat(50));
  console.log(`✅ Erfolgreich: ${erfolg}`);
  if (fehler > 0) console.log(`❌ Fehler: ${fehler}`);

  if (dryRun) {
    console.log('\n💡 Zum tatsächlichen Import: npx tsx scripts/import-averbeck-vereine.ts');
  }
}

main().catch(console.error);
