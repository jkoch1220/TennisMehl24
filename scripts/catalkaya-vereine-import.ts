/**
 * Import-Script für Platzbauer Garten- und Landschaftsbau Catalkaya
 * Legt 45 neue Vereine an (NUR ANLEGEN, kein Löschen)
 *
 * Führe aus mit: npx tsx scripts/catalkaya-vereine-import.ts
 * Für Vorschau: npx tsx scripts/catalkaya-vereine-import.ts --dry-run
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

interface Ansprechpartner {
  name: string;
  telefon: string;
}

interface VereinData {
  name: string;
  raum: string;
  plaetze: number;
  strasse: string;
  plz: string;
  ort: string;
  tonnen: number;
  sackware?: string;
  ansprechpartner: Ansprechpartner[];
  bemerkungen?: string;
}

// ==================== VEREINSDATEN ====================
// Aus Excel: VEREINSLITE CATALKAYA.xlsx

const VEREINE: VereinData[] = [
  // ========== RAUM NÜRNBERG ==========
  {
    name: '1. FC Reichenschwand',
    raum: 'Nürnberg',
    plaetze: 5,
    strasse: 'Anger 1',
    plz: '91244',
    ort: 'Reichenschwand',
    tonnen: 9,
    ansprechpartner: [{ name: 'Walter Zimmermann', telefon: '0170/9356229' }],
  },
  {
    name: '1.FC Stöckach',
    raum: 'Nürnberg',
    plaetze: 5,
    strasse: 'Egloffsteiner Str. 7',
    plz: '91338',
    ort: 'Igensdorf',
    tonnen: 8.5,
    ansprechpartner: [{ name: 'Oliver Schiemichen', telefon: '0177/8044642' }],
  },
  {
    name: 'FC Ottensoos',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Rüblandener Straße 50',
    plz: '91242',
    ort: 'Ottensoos',
    tonnen: 6,
    ansprechpartner: [
      { name: 'Ulrich Stöber', telefon: '09123/83923' },
      { name: 'Hans Reinecke', telefon: '09123/3216' },
    ],
  },
  {
    name: 'FSV Schönberg e. V.',
    raum: 'Nürnberg',
    plaetze: 5,
    strasse: 'Nessenmühlstr. 100',
    plz: '91207',
    ort: 'Lauf a.d. Pegnitz',
    tonnen: 7,
    ansprechpartner: [{ name: 'Jörg Bürner', telefon: '0176 - 55987968' }],
  },
  {
    name: 'TC Neunkirchen am Sand',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Hirtenweg 24',
    plz: '91233',
    ort: 'Neunkirchen',
    tonnen: 5.1,
    sackware: '20 Sack',
    ansprechpartner: [{ name: 'Patrick Poschner', telefon: '0176 51953275' }],
  },
  {
    name: 'TSV Röthenbach',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Sulzbacherstr. 12',
    plz: '90552',
    ort: 'Röthenbach',
    tonnen: 5.1,
    ansprechpartner: [{ name: 'Hans Schieber', telefon: '' }],
  },
  {
    name: '1. FC Hersbruck',
    raum: 'Nürnberg',
    plaetze: 5,
    strasse: 'Happurger Str. 27',
    plz: '91217',
    ort: 'Hersbruck',
    tonnen: 7,
    sackware: '3to. Gesackt',
    ansprechpartner: [{ name: 'Alwin Erlwein', telefon: '09151 7706' }],
  },
  {
    name: 'SC Pommelsbrunn',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Sportplatzweg 1',
    plz: '91224',
    ort: 'Pommelsbrunn',
    tonnen: 5.1,
    ansprechpartner: [{ name: 'Wilfried Weiser', telefon: '0160 8466865' }],
  },
  {
    name: 'TSV Behringersdorf',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Günthersbühlerstr. 75',
    plz: '90571',
    ort: 'Schwaig',
    tonnen: 7,
    ansprechpartner: [{ name: 'Harald Hörber', telefon: '01799119356' }],
  },
  {
    name: 'TSV Lauf',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Röthenbacherstr. 61',
    plz: '91207',
    ort: 'Lauf a. d. Pegnitz',
    tonnen: 9,
    ansprechpartner: [
      { name: 'Antje Buchbinder', telefon: '09123/988677' },
      { name: 'Antje Buchbinder (Mobil)', telefon: '0151/27138380' },
    ],
  },
  {
    name: '1. TC Heroldsberg',
    raum: 'Nürnberg',
    plaetze: 6,
    strasse: 'Mühlstraße',
    plz: '90562',
    ort: 'Heroldsberg',
    tonnen: 10.5,
    ansprechpartner: [{ name: 'Volker Hofmann', telefon: '0160 3892933' }],
  },
  {
    name: 'TUSPO HEROLDSBERG',
    raum: 'Nürnberg',
    plaetze: 6,
    strasse: 'Sportplatzweg 12',
    plz: '90562',
    ort: 'Heroldsberg',
    tonnen: 10.5,
    sackware: '6 Sack',
    ansprechpartner: [
      { name: 'Kerstin Fuchs', telefon: '0171 5429987' },
      { name: 'Udo Sippel', telefon: '0151 15688117' },
    ],
  },
  {
    name: '1. FC Altdorf',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Weidentalstraße 10',
    plz: '90518',
    ort: 'Altdorf',
    tonnen: 5.1,
    ansprechpartner: [{ name: 'Dominik Grabia', telefon: '+49 160 366 46 45' }],
  },
  {
    name: 'TSV Ochenbruck',
    raum: 'Nürnberg',
    plaetze: 6,
    strasse: 'Moorweg 10',
    plz: '90592',
    ort: 'Schwarzenbruck',
    tonnen: 10.5,
    ansprechpartner: [{ name: 'Stefan Schulz', telefon: '0171/3019181' }],
  },
  {
    name: 'TSV Wendelstein',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Am Schießhaus 1',
    plz: '90530',
    ort: 'Wendelstein',
    tonnen: 7,
    ansprechpartner: [{ name: 'Volker Eckert', telefon: '09129/8933' }],
  },
  {
    name: 'TSV 1927 Röthenbach bei St. Wolfgang',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Alte Salzstrasse 24',
    plz: '90530',
    ort: 'Wendelstein',
    tonnen: 7,
    ansprechpartner: [{ name: 'André Hübner', telefon: '' }],
  },
  {
    name: '1. TC LEERSTETTEN',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Schwabacher Straße',
    plz: '90596',
    ort: 'Schwanstetten',
    tonnen: 7,
    ansprechpartner: [
      { name: 'Dieter Bergner', telefon: '09170 8148' },
      { name: 'Ulrike Reinfelder', telefon: '0172 8900804' },
    ],
  },
  {
    name: 'VFL Nürnberg',
    raum: 'Nürnberg',
    plaetze: 7,
    strasse: 'Liegnitzerstr. 498',
    plz: '90475',
    ort: 'Nürnberg',
    tonnen: 12,
    ansprechpartner: [
      { name: 'Herr Siegel', telefon: '0172/8107214' },
      { name: 'Herr Zimmer', telefon: '0911/804210' },
    ],
  },
  {
    name: 'DJK SPARTA NORIS NÜRNBERG',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Wacholderweg 60',
    plz: '90441',
    ort: 'Nürnberg',
    tonnen: 5.5,
    ansprechpartner: [{ name: 'Egor Maisler', telefon: '0176 4769 7035' }],
  },
  {
    name: 'Post SV Nürnberg',
    raum: 'Nürnberg',
    plaetze: 11,
    strasse: 'Kirchenberg 2-4',
    plz: '90482',
    ort: 'Nürnberg',
    tonnen: 19, // zwei Abladestellen 13to + 6to
    bemerkungen: 'Zwei Abladestellen: 13to Ziegenstraße, 6to Daimlerstraße',
    ansprechpartner: [
      { name: 'Atilla Alatali', telefon: '01525-4242493' },
      { name: 'Michael Sommer', telefon: '0911/95459566' },
    ],
  },
  {
    name: 'Tennisclub Noris Weiß-Blau',
    raum: 'Nürnberg',
    plaetze: 13,
    strasse: 'Georg-Buchner-Str. 4',
    plz: '90411',
    ort: 'Nürnberg',
    tonnen: 22,
    ansprechpartner: [{ name: 'Alexander Eibner', telefon: '0163-7337070' }],
  },
  {
    name: 'TSV Maccabi Nürnberg e.V.',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Arno-Hamburger-Straße 3',
    plz: '90411',
    ort: 'Nürnberg',
    tonnen: 8,
    ansprechpartner: [{ name: 'Dr. Anatoli Djanatliev', telefon: '' }],
  },
  {
    name: 'NHTC Nürnberger Hockey- und Tennis Club e.V.',
    raum: 'Nürnberg',
    plaetze: 7,
    strasse: 'Siedlerstraße 111',
    plz: '90480',
    ort: 'Nürnberg',
    tonnen: 12,
    ansprechpartner: [{ name: 'Nicole Kißkalt', telefon: '0173213610' }],
  },
  {
    name: 'ATSV Erlangen',
    raum: 'Nürnberg',
    plaetze: 5,
    strasse: 'Paul-Gossen-Straße 58',
    plz: '91052',
    ort: 'Erlangen',
    tonnen: 7,
    ansprechpartner: [
      { name: 'Kurt Heinemann', telefon: '0176 645 10528' },
      { name: 'Reinhold Eckstein (Platz)', telefon: '0178 516 8405' },
    ],
  },
  {
    name: 'ASV Buchenbühl',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Wildenfelsweg',
    plz: '90411',
    ort: 'Nürnberg',
    tonnen: 7,
    ansprechpartner: [{ name: 'Volker Hofmann', telefon: '0160 3892933' }],
  },
  {
    name: 'ASC Boxdorf 1933 e.V.',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Boxdorfer Hauptstr. 37a',
    plz: '90427',
    ort: 'Nürnberg',
    tonnen: 5.1,
    ansprechpartner: [{ name: 'Dr. Frank Finkemeier', telefon: '0911/93856714' }],
  },
  {
    name: 'SC Obermichelbach',
    raum: 'Nürnberg',
    plaetze: 5,
    strasse: 'BGM-Hans Tauber Weg 15',
    plz: '90587',
    ort: 'Obermichelbach',
    tonnen: 12,
    sackware: '1to. Sackware',
    ansprechpartner: [{ name: 'Horst Erdel', telefon: '0173 20 49 235' }],
  },
  {
    name: 'ASV-Veitsbronn-Siegelsdorf',
    raum: 'Nürnberg',
    plaetze: 5,
    strasse: 'Obermichelbacher Straße 999',
    plz: '90587',
    ort: 'Veitsbronn',
    tonnen: 8,
    ansprechpartner: [
      { name: 'Fiona Kraus', telefon: '0160-90684539' },
      { name: 'Platzwart', telefon: '0151-20220037' },
    ],
  },
  {
    name: 'TC Eibach',
    raum: 'Nürnberg',
    plaetze: 7,
    strasse: 'Riemerstraße',
    plz: '90449',
    ort: 'Nürnberg',
    tonnen: 12,
    ansprechpartner: [{ name: 'Uwe Schultze', telefon: '0151 4193 11 16' }],
  },
  {
    name: 'TSV Altenberg',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Jahnstr. 12',
    plz: '90522',
    ort: 'Oberasbach',
    tonnen: 7,
    sackware: '10 Sack',
    ansprechpartner: [{ name: 'Harald Becker', telefon: '0911/693270' }],
  },
  {
    name: 'ASV Wilhelmsdorf',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Bergstraße 25',
    plz: '91489',
    ort: 'Wilhelmsdorf',
    tonnen: 5.1,
    bemerkungen: 'Dieses Jahr früher - letztes Jahr sehr spät',
    ansprechpartner: [{ name: 'Jürgen Bassalig', telefon: '0171 420 88 86' }],
  },
  {
    name: 'TC EMSKIRCHEN',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Pavillonweg',
    plz: '91448',
    ort: 'Emskirchen',
    tonnen: 5.1,
    ansprechpartner: [{ name: 'Gerd Demel', telefon: '09104 2233' }],
  },
  {
    name: 'TC ROSSTAL',
    raum: 'Nürnberg',
    plaetze: 4,
    strasse: 'Buchschwabacher Str.30',
    plz: '90574',
    ort: 'Roßtal',
    tonnen: 7,
    ansprechpartner: [{ name: 'Christian Haußühl', telefon: '09127 / 6624' }],
  },
  {
    name: 'TSV 1860 Ansbach e. V.',
    raum: 'Nürnberg',
    plaetze: 9,
    strasse: 'Hospitalstraße 50',
    plz: '91522',
    ort: 'Ansbach',
    tonnen: 15,
    ansprechpartner: [
      { name: 'Sophia Frank', telefon: '0151 / 46426100' },
      { name: 'Uli Grundmann', telefon: '0160 / 3341032' },
    ],
  },
  {
    name: '1. FC Gunzenhausen',
    raum: 'Nürnberg',
    plaetze: 5,
    strasse: 'Schießwasen',
    plz: '91710',
    ort: 'Gunzenhausen',
    tonnen: 6,
    ansprechpartner: [{ name: 'Hans-Jürgen Kieslich', telefon: '09831/8646' }],
  },
  {
    name: 'TSV WILBURGSTETTEN',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Mönchsrother Str.',
    plz: '91634',
    ort: 'Wilburgstetten',
    tonnen: 5.1,
    ansprechpartner: [{ name: 'Johannes Mahler', telefon: '' }],
  },
  {
    name: 'SV Mistelgau',
    raum: 'Nürnberg',
    plaetze: 3,
    strasse: 'Seitenbacher Str. 5',
    plz: '95490',
    ort: 'Mistelgau',
    tonnen: 4,
    ansprechpartner: [{ name: 'Elke Sahrmann', telefon: '01728600704' }],
  },

  // ========== RAUM SCHWEINFURT ==========
  {
    name: 'TSV04 Schwebheim',
    raum: 'Schweinfurt',
    plaetze: 5,
    strasse: 'Schweinfurterstr. 29',
    plz: '97525',
    ort: 'Schwebheim',
    tonnen: 10,
    ansprechpartner: [{ name: 'Herr Auer', telefon: '0170/7662152' }],
  },
  {
    name: 'TSV 1866 Schonungen',
    raum: 'Schweinfurt',
    plaetze: 1,
    strasse: 'Sportgelände am Main',
    plz: '97453',
    ort: 'Schonungen',
    tonnen: 1.5,
    sackware: '1,5 gesackt',
    ansprechpartner: [{ name: 'Herr Wißmüller', telefon: '09721/58109' }],
  },
  {
    name: 'TC Sand',
    raum: 'Schweinfurt',
    plaetze: 5,
    strasse: '',
    plz: '97522',
    ort: 'Sand',
    tonnen: 8,
    ansprechpartner: [{ name: 'Herr Krenes', telefon: '09524/83380' }],
  },
  {
    name: 'TSV 1937 Limbach e.V.',
    raum: 'Schweinfurt',
    plaetze: 2,
    strasse: 'Zur Schleuse 1',
    plz: '97483',
    ort: 'Eltmann',
    tonnen: 4,
    ansprechpartner: [{ name: 'Herr Bühl', telefon: '09522/94330' }],
  },
  {
    name: 'DJK Großostheim',
    raum: 'Schweinfurt',
    plaetze: 8,
    strasse: 'Wallstädter Weg 17',
    plz: '63762',
    ort: 'Großostheim',
    tonnen: 16,
    bemerkungen: 'Zusätzlichen Sand berechnen',
    ansprechpartner: [{ name: 'Rudolf Welzbacher', telefon: '0175/2010010' }],
  },
  {
    name: 'TC LICHTENFELS',
    raum: 'Schweinfurt',
    plaetze: 8,
    strasse: 'Am Main 11',
    plz: '96215',
    ort: 'Lichtenfels',
    tonnen: 14,
    ansprechpartner: [{ name: 'Frank Raubner', telefon: '0171/5809610' }],
  },
  {
    name: 'TC Redwitz',
    raum: 'Schweinfurt',
    plaetze: 3,
    strasse: 'Gäßla 22A',
    plz: '96257',
    ort: 'Redwitz an der Rodach',
    tonnen: 5.1,
    ansprechpartner: [{ name: 'Uwe Hoh', telefon: '' }],
  },
  {
    name: 'TC BURGKUNSTADT',
    raum: 'Schweinfurt',
    plaetze: 4,
    strasse: 'Anger 4',
    plz: '96224',
    ort: 'Burgkunstadt',
    tonnen: 7,
    ansprechpartner: [{ name: 'Rudolf Grießer', telefon: '+49 171-6021830' }],
  },
  {
    name: 'TC Blau-Weiß Bischberg',
    raum: 'Schweinfurt',
    plaetze: 2,
    strasse: 'Weipelsdorfer Straße',
    plz: '96120',
    ort: 'Bischberg',
    tonnen: 4,
    ansprechpartner: [{ name: 'Dieter Knöffel', telefon: '09503-5366' }],
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
  if (prefix >= 63 && prefix <= 63) return 'Bayern'; // Aschaffenburg
  if (prefix >= 90 && prefix <= 91) return 'Bayern'; // Nürnberg
  if (prefix >= 95 && prefix <= 96) return 'Bayern'; // Oberfranken
  if (prefix >= 97 && prefix <= 97) return 'Bayern'; // Unterfranken
  return 'Bayern';
}

function cleanTelefonnummer(tel: string): string {
  return tel.replace(/'/g, '').replace(/\s+/g, ' ').trim();
}

// ==================== HAUPTFUNKTION ====================

async function main() {
  console.log('🔧 Garten- und Landschaftsbau Catalkaya - Vereine Import');
  console.log('='.repeat(65));
  console.log(DRY_RUN ? '📋 DRY-RUN Modus (keine Änderungen)\n' : '🚀 LIVE Modus\n');

  // 1. Zeige Statistik
  const raumNuernberg = VEREINE.filter(v => v.raum === 'Nürnberg');
  const raumSchweinfurt = VEREINE.filter(v => v.raum === 'Schweinfurt');
  const gesamtTonnen = VEREINE.reduce((sum, v) => sum + v.tonnen, 0);
  const gesamtPlaetze = VEREINE.reduce((sum, v) => sum + v.plaetze, 0);

  console.log('📊 Übersicht:');
  console.log(`   Raum Nürnberg:    ${raumNuernberg.length} Vereine`);
  console.log(`   Raum Schweinfurt: ${raumSchweinfurt.length} Vereine`);
  console.log(`   Gesamt:           ${VEREINE.length} Vereine`);
  console.log(`   Gesamtmenge:      ${gesamtTonnen.toFixed(1)} Tonnen`);
  console.log(`   Tennisplätze:     ${gesamtPlaetze}`);
  console.log('');

  // 2. Lade Platzbauer Catalkaya
  console.log('🔍 Suche Platzbauer Catalkaya...');
  const kundenResponse = await databases.listDocuments(
    DATABASE_ID,
    SAISON_KUNDEN_COLLECTION_ID,
    [Query.limit(5000)]
  );

  let catalkayaPlatzbauer: any = null;

  for (const doc of kundenResponse.documents) {
    const kunde = parseDocument<any>(doc);
    if (kunde.typ === 'platzbauer' && kunde.aktiv &&
        kunde.name?.toLowerCase().includes('catalkaya')) {
      catalkayaPlatzbauer = { ...kunde, $id: doc.$id };
      break;
    }
  }

  if (!catalkayaPlatzbauer) {
    console.error('❌ Platzbauer Catalkaya nicht gefunden!');
    console.log('\n   Verfügbare Platzbauer:');
    for (const doc of kundenResponse.documents) {
      const kunde = parseDocument<any>(doc);
      if (kunde.typ === 'platzbauer' && kunde.aktiv) {
        console.log(`   - ${kunde.name}`);
      }
    }
    process.exit(1);
  }

  console.log(`✅ Gefunden: ${catalkayaPlatzbauer.name} (ID: ${catalkayaPlatzbauer.id})\n`);

  // 3. Prüfe ob Vereine bereits existieren
  const existierendeVereine: string[] = [];
  for (const doc of kundenResponse.documents) {
    const kunde = parseDocument<any>(doc);
    if (kunde.typ === 'verein' && kunde.standardPlatzbauerId === catalkayaPlatzbauer.id) {
      existierendeVereine.push(kunde.name);
    }
  }

  if (existierendeVereine.length > 0) {
    console.log(`ℹ️  ${existierendeVereine.length} bestehende Vereine bei Catalkaya:`);
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
    console.log(`      ${verein.plaetze} Plätze | ${verein.tonnen}t | ${verein.raum}`);
    if (verein.sackware) {
      console.log(`      Sackware: ${verein.sackware}`);
    }

    const bundesland = getBundeslandAusPLZ(verein.plz);
    const jetzt = new Date().toISOString();
    const vereinId = ID.unique();

    // Notizen zusammenstellen
    const notizen: string[] = [];
    if (verein.raum) notizen.push(`Raum: ${verein.raum}`);
    if (verein.sackware) notizen.push(`Sackware: ${verein.sackware}`);
    if (verein.bemerkungen) notizen.push(verein.bemerkungen);

    // Ansprechpartner für dispoAnsprechpartner (erster mit Telefon)
    const ersterAP = verein.ansprechpartner.find(ap => ap.telefon) || verein.ansprechpartner[0];

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
      standardPlatzbauerId: catalkayaPlatzbauer.id,
      tonnenLetztesJahr: verein.tonnen,
      schuettstellenAnzahl: verein.plaetze > 1 ? verein.plaetze : undefined,
      belieferungsart: 'mit_haenger' as Belieferungsart,
      dispoAnsprechpartner: ersterAP ? {
        name: ersterAP.name,
        telefon: cleanTelefonnummer(ersterAP.telefon),
      } : undefined,
      beziehtUeberUnsPlatzbauer: true,
      abwerkspreis: false,
      notizen: notizen.length > 0 ? notizen.join('\n') : undefined,
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

        // Alle Ansprechpartner anlegen
        for (const ap of verein.ansprechpartner) {
          if (!ap.name || ap.name === '') continue;

          const apId = ID.unique();
          const telefonnummern = ap.telefon ? [{
            nummer: cleanTelefonnummer(ap.telefon),
            typ: ap.telefon.startsWith('01') ? 'Mobil' : 'Telefon',
          }] : [];

          const neuerAP = {
            id: apId,
            kundeId: vereinId,
            name: ap.name,
            rolle: 'Ansprechpartner',
            telefonnummern,
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
          apsAngelegt++;
        }

        console.log(`      ✅ Angelegt + ${verein.ansprechpartner.length} AP`);
        angelegt++;
      } catch (error: any) {
        console.error(`      ❌ Fehler: ${error.message}`);
      }
    } else {
      console.log(`      📋 Würde angelegt werden + ${verein.ansprechpartner.length} AP`);
      angelegt++;
      apsAngelegt += verein.ansprechpartner.length;
    }
  }

  // ==================== ZUSAMMENFASSUNG ====================
  console.log('\n' + '='.repeat(65));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(65));
  console.log(`   Platzbauer: ${catalkayaPlatzbauer.name}`);
  console.log(`   Neu angelegt: ${angelegt} Vereine`);
  console.log(`   Ansprechpartner: ${apsAngelegt}`);
  console.log(`   Gesamt bei Catalkaya: ${existierendeVereine.length + angelegt} Vereine`);

  if (DRY_RUN) {
    console.log('\n💡 Führe ohne --dry-run aus:');
    console.log('   npx tsx scripts/catalkaya-vereine-import.ts --yes');
  } else {
    console.log('\n✅ Import abgeschlossen!');
  }
}

main().catch(console.error);
