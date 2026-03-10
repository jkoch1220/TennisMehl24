/**
 * Bereinigungsscript für Platzbauer Thomas Vogl (Vogl Sportanlagen)
 *
 * Löscht alle Vereine des Platzbauers (AUSSER TC Dietenhofen e.V.)
 * und legt sie mit korrekten Daten neu an.
 *
 * Führe aus mit: npx tsx scripts/vogl-vereine-bereinigung.ts
 * Für Vorschau: npx tsx scripts/vogl-vereine-bereinigung.ts --dry-run
 */

import { Client, Databases, Query, ID } from 'node-appwrite';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('   Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_CONFIRM = process.argv.includes('--yes') || process.argv.includes('-y');

// ==================== VEREINSDATEN ====================
interface VereinsDaten {
  name: string;
  mengeTonnen: number;
  anzahlPlaetze: number;
  arbeitstermin: string;
  ansprechpartner: {
    name: string;
    tel?: string;
    mobil?: string;
    weitere?: string;
  };
  platzwart: {
    name: string;
    tel?: string;
    mobil?: string;
    tel2?: string;
    weitere?: string;
  };
  lieferadresse: {
    strasse: string;
    plz: string;
    ort: string;
  };
  hinweise?: string;
  zusatz?: string;
}

// Die 24 neuen Vereine
const NEUE_VEREINE: VereinsDaten[] = [
  {
    name: 'RSV 1929 e.V. Büblingshausen',
    mengeTonnen: 5,
    anzahlPlaetze: 1,
    arbeitstermin: '13.–14.',
    ansprechpartner: { name: 'Unützer', tel: '06441-47730', mobil: '0170-2802761' },
    platzwart: { name: 'Unützer', tel: '0176-45788363', tel2: '06441-9524474' },
    lieferadresse: { strasse: 'Frankfurter Strasse 111', plz: '35578', ort: 'Wetzlar' },
  },
  {
    name: 'TC Hainstadt 1959 e.V.',
    mengeTonnen: 11,
    anzahlPlaetze: 2,
    arbeitstermin: '11.–12.',
    ansprechpartner: {
      name: 'Große-Venhaus',
      tel: '06182-66477',
      mobil: '0163-1464325',
      weitere: 'Seidel 0176-99536932, Schwab 0173-6886667, Frau Dukatz (Vorsitzende) 0171-4187787'
    },
    platzwart: {
      name: 'Marcak',
      tel: '06182-840635',
      mobil: '01520-5238678',
      tel2: '069-89041288',
      weitere: 'Kasper 06182-69363 / 0172-7330919'
    },
    lieferadresse: { strasse: 'Außerhalb 6', plz: '63512', ort: 'Hainburg' },
    hinweise: 'Von der Autobahn Kreisel-Abfahrt Hainburg (OT Hainstadt) im Ort 1. Ampel li. — geradeaus direkt nach Bauhof 1. Str. re. Nach 50m re. Tennisplätze',
  },
  {
    name: 'TC Waldbrunn 1988 e.V.',
    mengeTonnen: 5,
    anzahlPlaetze: 1,
    arbeitstermin: '14.–15.',
    ansprechpartner: { name: 'König', tel: '06274-95218', mobil: '0175-4685299' },
    platzwart: { name: 'Ebert', tel: '0162-6270241', tel2: '06274-2899969' },
    lieferadresse: { strasse: 'Im Hoffeld 32', plz: '69429', ort: 'Waldbrunn OT Waldkatzenbach' },
  },
  {
    name: 'TSV Bartenbach e.V.',
    mengeTonnen: 4,
    anzahlPlaetze: 1,
    arbeitstermin: '14.–16.',
    ansprechpartner: {
      name: 'Weiler',
      tel: '07161-6548584',
      mobil: '0152-55944523',
      weitere: 'alt: Frau Bauer 0175-1699408'
    },
    platzwart: { name: 'Eberle', tel: '07161-25217', mobil: '0173-9634260' },
    lieferadresse: { strasse: 'Lerchenberger Str. 114', plz: '73035', ort: 'Göppingen' },
    hinweise: 'Rechtzeitig Lieferung ankündigen',
  },
  {
    name: 'TSV Sparwiesen e.V.',
    mengeTonnen: 4.5,
    anzahlPlaetze: 1,
    arbeitstermin: '14.–15.',
    ansprechpartner: {
      name: 'Schatz',
      tel: '07161-35122',
      mobil: '01590-2452338',
      weitere: 'alt: Frau Bauer 0175-1699408, Loser 07161-33982'
    },
    platzwart: { name: 'Köstlin', tel: '07161-33304' },
    lieferadresse: { strasse: 'Holbeinstr.', plz: '73066', ort: 'Uhingen' },
  },
  {
    name: 'TC Höchstadt/Aisch e.V.',
    mengeTonnen: 15,
    anzahlPlaetze: 2,
    arbeitstermin: '12.–13.',
    ansprechpartner: { name: 'Weisenberger', mobil: '01578-6359585' },
    platzwart: { name: 'Frau Harder', mobil: '0172-8612567' },
    lieferadresse: { strasse: 'Am Sportpark 7', plz: '91315', ort: 'Höchstadt' },
    hinweise: 'Sattel geht besser',
  },
  {
    name: 'TV 1974 Adelsdorf e.V.',
    mengeTonnen: 10,
    anzahlPlaetze: 2,
    arbeitstermin: '12.–13.',
    ansprechpartner: { name: 'Frau Holmer', mobil: '0176-96193038' },
    platzwart: { name: 'Meszmer', mobil: '0174-1689039', tel: '09195-4454', weitere: 'Maul 01512-7180387' },
    lieferadresse: { strasse: 'Am Sportplatz 3-5', plz: '91325', ort: 'Adelsdorf' },
    hinweise: '2 Abladestellen: auf 3-Platz-Anlage 7,5 to, auf 1-Platz-Anlage 2,5 to abkippen',
  },
  {
    name: 'TC Röttenbach',
    mengeTonnen: 13.5,
    anzahlPlaetze: 1,
    arbeitstermin: '12.–14.',
    ansprechpartner: { name: 'Findeiß', tel: '09195-3113', mobil: '0171-2711876' },
    platzwart: { name: '' },
    lieferadresse: { strasse: 'Lohmühlweg 11a', plz: '91341', ort: 'Röttenbach' },
    hinweise: 'Sattel geht wenn er 150m rückwärts fährt',
  },
  {
    name: 'Tennisclub Selb e.V.',
    mengeTonnen: 11,
    anzahlPlaetze: 1,
    arbeitstermin: '15.–17.',
    ansprechpartner: { name: 'Roch', mobil: '0173-6206529', weitere: 'alt: Erhard 09287-712583 / 0160-6303451' },
    platzwart: { name: '' },
    lieferadresse: { strasse: 'Hohenberger Str. 37', plz: '95100', ort: 'Selb' },
    hinweise: 'Anlage zentrumsnah neben Schützengarten, kein Anhänger',
  },
  {
    name: 'EC Erkersreuth e.V.',
    mengeTonnen: 9,
    anzahlPlaetze: 1,
    arbeitstermin: '14.–16.',
    ansprechpartner: { name: 'Grandits', mobil: '0176-20195163' },
    platzwart: { name: 'Lautenbacher', mobil: '0157-75161745' },
    lieferadresse: { strasse: 'Hauptstr. 1', plz: '95100', ort: 'Selb-Erkersreuth' },
  },
  {
    name: 'TSV Melkendorf e.V.',
    mengeTonnen: 10,
    anzahlPlaetze: 2,
    arbeitstermin: '13.–15.',
    ansprechpartner: { name: 'Küfner', mobil: '0173-7080911', weitere: 'Bruder 01523-6866814' },
    platzwart: { name: 'Mario Küfner', mobil: '01512-9261090' },
    lieferadresse: { strasse: 'Steinenhausen 4 / Hauptstraße 66 (neben dem Fußballplatz)', plz: '95326', ort: 'Kulmbach Melkendorf' },
    hinweise: 'Neben Fußballplatz, kein Sattel/Anhänger, schwierig zu wenden',
  },
  {
    name: 'SG Franken e.V.',
    mengeTonnen: 7,
    anzahlPlaetze: 1,
    arbeitstermin: '14.–16.',
    ansprechpartner: { name: 'Haas', mobil: '0179-2998919', tel: '01514-1972027', weitere: 'alt: 0921-2852849' },
    platzwart: { name: 'Raab', tel: '0921-2852234', mobil: '0179-1162438' },
    lieferadresse: { strasse: 'Riedingerstr. 9', plz: '95448', ort: 'Bayreuth' },
  },
  {
    name: 'Tennisclub Rot-Weiß Gefrees',
    mengeTonnen: 7,
    anzahlPlaetze: 1,
    arbeitstermin: '14.–16.',
    ansprechpartner: { name: 'Bär', mobil: '0170-3036063', tel: '09208-68926' },
    platzwart: { name: 'Ruchal', mobil: '01590-4791057', weitere: 'Jerschl 0176-20607579, Kassier 09254-1075' },
    lieferadresse: { strasse: 'Am Hammerweg', plz: '95482', ort: 'Gefrees' },
  },
  {
    name: 'BLSV Sportcamp Nordbayern gGmbH',
    mengeTonnen: 7,
    anzahlPlaetze: 1,
    arbeitstermin: '15.–17.',
    ansprechpartner: { name: 'Lichtblau', mobil: '01511-5997839' },
    platzwart: { name: '' },
    lieferadresse: { strasse: 'Am Sportcamp 1', plz: '95493', ort: 'Bischofsgrün' },
  },
  {
    name: 'TSV Mistelbach',
    mengeTonnen: 5,
    anzahlPlaetze: 1,
    arbeitstermin: '12.–15.',
    ansprechpartner: { name: 'Wienert', tel: '0921-5070307', mobil: '0160-3376981', weitere: '09279-97010 p.' },
    platzwart: { name: 'Kraus', tel: '09201-7786', weitere: 'Stahlmann 0171-5321289' },
    lieferadresse: { strasse: 'Jahnstraße 10', plz: '95511', ort: 'Mistelbach' },
    hinweise: 'Tennisplätze beim Sportplatz, von Gesees kommend, nicht die 1. links in die Jahnstraße sondern Berg runter die 2. Straße links abbiegen (Weg zu den Tennisplätzen)',
  },
  {
    name: 'Baur S.V. Burgkunstadt e.V.',
    mengeTonnen: 18,
    anzahlPlaetze: 2,
    arbeitstermin: '13.–15.',
    ansprechpartner: { name: 'Fischer', mobil: '0160-96632605' },
    platzwart: { name: 'Container', mobil: '0173-9924977' },
    lieferadresse: { strasse: 'Dr. Sattler-Str. 1', plz: '96224', ort: 'Burgkunstadt' },
    hinweise: 'TA hinter Baur-Sporthalle an B289, 2 Abladestellen jeweils genau 50%! Avisieren',
  },
  {
    name: 'TG Schweinfurt 1848 e.V.',
    mengeTonnen: 15,
    anzahlPlaetze: 3,
    arbeitstermin: '11.–13.',
    ansprechpartner: { name: 'Gäb', tel: '09721-6797544', mobil: '0179-7799061' },
    platzwart: { name: 'Hausmeister', tel: '09721-22242', weitere: 'Hansi 0170-8130924, Körber, Maerkert 0171-9769372, Frau Stolz 0170-2932259' },
    lieferadresse: { strasse: 'Lindenbrunnenweg 51 / Zellerstraße', plz: '97422', ort: 'Schweinfurt' },
    hinweise: 'Nach den Hauptgebäuden der TG Schweinfurt noch ca. 200m stadtauswärts, dann linker Hand an der Straße (sehr enge Einfahrt, Fahrzeugtyp anfragen)',
    zusatz: '+ 1 to gesackt als Beiladung',
  },
  {
    name: 'TC Schweinfurt e.V.',
    mengeTonnen: 18,
    anzahlPlaetze: 3,
    arbeitstermin: '12.–13.',
    ansprechpartner: { name: 'Schunck', tel: '09721-43933', mobil: '0172-7017667' },
    platzwart: { name: 'Ohl', mobil: '0171-4570402', tel: '09721-9789070' },
    lieferadresse: { strasse: 'Hainigweg 2-4', plz: '97424', ort: 'Schweinfurt' },
    hinweise: '2 Abladestellen',
  },
  {
    name: 'TC Rot-Weiß Gerolzhofen e.V.',
    mengeTonnen: 11.5,
    anzahlPlaetze: 2,
    arbeitstermin: '12.–14.',
    ansprechpartner: { name: 'Löhrlein', mobil: '0160-5548514', tel: '09382-4259', weitere: 'Gehring 0160-5530135' },
    platzwart: { name: 'Herold', mobil: '01622-778839', tel: '09382-1802', weitere: 'alt: Hauke 0176-34486307 / 09382-1440 p.' },
    lieferadresse: { strasse: 'Schallfelder Str. 52', plz: '97447', ort: 'Gerolzhofen' },
  },
  {
    name: 'TC Gochsheim 77 e.V.',
    mengeTonnen: 8,
    anzahlPlaetze: 2,
    arbeitstermin: '12.–15.',
    ansprechpartner: { name: 'Binder', tel: '09721-630212', mobil: '0170-5701368', weitere: 'Reinhard 01514-2032559, Frau Brehm 0163-4567457' },
    platzwart: { name: 'Haberbusch', mobil: '0170-7789095' },
    lieferadresse: { strasse: 'Kopernikusstr. 4', plz: '97469', ort: 'Gochsheim' },
  },
  {
    name: 'ATS Kulmbach e.V.',
    mengeTonnen: 8,
    anzahlPlaetze: 1,
    arbeitstermin: '13.–15.',
    ansprechpartner: { name: 'Frau Müller', mobil: '01766-1386406', weitere: 'alt: Friedrich 0173-9495046 / 09221-9488652' },
    platzwart: { name: '' },
    lieferadresse: { strasse: 'Alte Forstlahmer Str. 20', plz: '95326', ort: 'Kulmbach' },
  },
  {
    name: 'TV Jahn 1895 e.V. Schweinfurt',
    mengeTonnen: 9,
    anzahlPlaetze: 2,
    arbeitstermin: '15.–16.',
    ansprechpartner: { name: 'Scholz', tel: '09721-32042', mobil: '0171-6945355', weitere: 'alt: Berger 0176-45631425 / 0172-8173393' },
    platzwart: { name: 'Köhler', tel: '09721-185886', mobil: '0170-3806189' },
    lieferadresse: { strasse: 'Ernst-Paul-Str. 6', plz: '97422', ort: 'Schweinfurt' },
    hinweise: 'Anfahrt über Deutschhöfer Str. (Richtung Üchtelhausen). Am Berg oben die 2. Ampel links abbiegen, nach ca. 50m nochmals links (z. Jahn) abbiegen.',
  },
  {
    name: 'SG 1912 Dittelbrunn e.V.',
    mengeTonnen: 14,
    anzahlPlaetze: 2,
    arbeitstermin: '13.–15.',
    ansprechpartner: { name: 'Landeck', tel: '09721-4760707', mobil: '0157-85318295' },
    platzwart: { name: '' },
    lieferadresse: { strasse: 'Am Steinig 1', plz: '97456', ort: 'Dittelbrunn' },
    hinweise: 'Zufahrt über "Am Schleifweg"',
  },
  {
    name: 'TC Weismain e.V.',
    mengeTonnen: 10,
    anzahlPlaetze: 2,
    arbeitstermin: '13.–15.',
    ansprechpartner: { name: 'Dietz', mobil: '0176-11981530', tel: '09575-981516' },
    platzwart: { name: 'Dinkel', tel: '09575-981510', weitere: 'Hafermann Josefus 0173-3944583, Andreas 01515-2533284' },
    lieferadresse: { strasse: 'Baiersdorfer Str. 12', plz: '96260', ort: 'Weismain' },
    hinweise: 'Schmaler Anfahrtsweg, 2 Kippstellen sonst Wege zu weit!',
  },
];

// Der zu behaltende Verein
const VEREIN_BEHALTEN = 'TC Dietenhofen e.V.';

// ==================== HILFSFUNKTIONEN ====================

function parseDocument<T>(doc: any): T {
  if (doc?.data && typeof doc.data === 'string') {
    try {
      const parsed = JSON.parse(doc.data) as T;
      return { ...parsed, id: (parsed as any).id || doc.$id };
    } catch {
      // ignore
    }
  }
  return { id: doc.$id } as T;
}

function toPayload<T extends Record<string, any>>(obj: T): Record<string, any> {
  return { data: JSON.stringify(obj) };
}

async function askConfirm(frage: string): Promise<boolean> {
  if (SKIP_CONFIRM) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${frage} (j/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'j' || answer.toLowerCase() === 'ja');
    });
  });
}

// Bundesland aus PLZ ableiten (vereinfacht)
function getBundeslandAusPLZ(plz: string): string {
  const prefix = plz.substring(0, 2);
  const prefixNum = parseInt(prefix);

  // Grobe Zuordnung
  if (prefixNum >= 35 && prefixNum <= 36) return 'Hessen';
  if (prefixNum >= 63 && prefixNum <= 64) return 'Hessen';
  if (prefixNum >= 69 && prefixNum <= 69) return 'Baden-Württemberg';
  if (prefixNum >= 73 && prefixNum <= 73) return 'Baden-Württemberg';
  if (prefixNum >= 91 && prefixNum <= 91) return 'Bayern';
  if (prefixNum >= 95 && prefixNum <= 96) return 'Bayern';
  if (prefixNum >= 97 && prefixNum <= 97) return 'Bayern';

  return 'Bayern'; // Fallback
}

// ==================== HAUPTFUNKTIONEN ====================

async function main() {
  console.log('🔧 Vogl Sportanlagen - Vereine Bereinigung');
  console.log('='.repeat(50));
  console.log(DRY_RUN ? '📋 DRY-RUN Modus (keine Änderungen)\n' : '🚀 LIVE Modus\n');

  try {
    // 1. Lade alle Kunden
    console.log('🔍 Lade alle Kunden...');
    const kundenResponse = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    const alleKunden: any[] = [];
    let voglPlatzbauer: any = null;

    for (const doc of kundenResponse.documents) {
      const kunde = parseDocument<any>(doc);
      alleKunden.push({ ...kunde, $id: doc.$id });

      // Suche nach Vogl Platzbauer
      if (kunde.typ === 'platzbauer' && kunde.aktiv) {
        const nameLower = kunde.name?.toLowerCase() || '';
        if (nameLower.includes('vogl')) {
          voglPlatzbauer = { ...kunde, $id: doc.$id };
        }
      }
    }

    if (!voglPlatzbauer) {
      console.error('❌ Platzbauer Vogl nicht gefunden!');
      console.error('   Bitte prüfe ob ein Platzbauer mit "Vogl" im Namen existiert.');
      process.exit(1);
    }

    console.log(`✅ Platzbauer gefunden: ${voglPlatzbauer.name} (ID: ${voglPlatzbauer.id})\n`);

    // 2. Finde alle Vereine dieses Platzbauers (NUR "ueber_platzbauer" Bezugsweg!)
    const voglVereine = alleKunden.filter(
      k => k.typ === 'verein' &&
           k.standardPlatzbauerId === voglPlatzbauer.id &&
           k.standardBezugsweg === 'ueber_platzbauer' &&
           k.aktiv === true
    );

    console.log(`📋 ${voglVereine.length} Vereine gefunden für Platzbauer Vogl:\n`);

    // Zeige alle Vereine
    voglVereine.forEach((v, i) => {
      const istBehalten = v.name === VEREIN_BEHALTEN;
      const status = istBehalten ? '✅ BEHALTEN' : '❌ LÖSCHEN';
      console.log(`   ${i + 1}. ${v.name} [${status}]`);
    });

    // Finde den zu behaltenden Verein
    const vereinZuBehalten = voglVereine.find(v => v.name === VEREIN_BEHALTEN);

    // Vereine zum Löschen
    const vereineZumLoeschen = voglVereine.filter(v => v.name !== VEREIN_BEHALTEN);

    console.log(`\n📊 Zusammenfassung:`);
    console.log(`   Zu löschen: ${vereineZumLoeschen.length} Vereine`);
    console.log(`   Zu behalten: ${vereinZuBehalten ? 1 : 0} Verein (${VEREIN_BEHALTEN})`);
    console.log(`   Neu anzulegen: ${NEUE_VEREINE.length} Vereine`);
    console.log(`   Gesamt nach Bereinigung: ${(vereinZuBehalten ? 1 : 0) + NEUE_VEREINE.length} Vereine\n`);

    // Bestätigung
    if (!DRY_RUN) {
      const bestaetigt = await askConfirm('\n⚠️  Möchtest du fortfahren?');
      if (!bestaetigt) {
        console.log('❌ Abgebrochen.');
        process.exit(0);
      }
    }

    // 3. SCHRITT 1: Vereine löschen
    console.log('\n' + '='.repeat(50));
    console.log('📍 SCHRITT 1: Vereine löschen');
    console.log('='.repeat(50) + '\n');

    let geloescht = 0;
    for (const verein of vereineZumLoeschen) {
      console.log(`   🗑️  ${verein.name}`);

      if (!DRY_RUN) {
        try {
          await databases.deleteDocument(
            DATABASE_ID,
            SAISON_KUNDEN_COLLECTION_ID,
            verein.$id
          );
          console.log(`      ✅ Gelöscht`);
          geloescht++;
        } catch (error: any) {
          console.error(`      ❌ Fehler: ${error.message}`);
        }
      } else {
        geloescht++;
      }
    }

    console.log(`\n   → ${geloescht} Vereine ${DRY_RUN ? 'würden gelöscht' : 'gelöscht'}`);

    // 4. SCHRITT 2: Neue Vereine anlegen
    console.log('\n' + '='.repeat(50));
    console.log('📍 SCHRITT 2: Neue Vereine anlegen');
    console.log('='.repeat(50) + '\n');

    let angelegt = 0;
    for (const verein of NEUE_VEREINE) {
      console.log(`   📝 ${verein.name}`);

      // Erstelle Notizen aus den Kontaktdaten
      const notizTeile: string[] = [];

      // Ansprechpartner
      if (verein.ansprechpartner.name) {
        const apParts: string[] = [`Ansprechpartner: ${verein.ansprechpartner.name}`];
        if (verein.ansprechpartner.tel) apParts.push(`Tel: ${verein.ansprechpartner.tel}`);
        if (verein.ansprechpartner.mobil) apParts.push(`Mobil: ${verein.ansprechpartner.mobil}`);
        if (verein.ansprechpartner.weitere) apParts.push(`Weitere: ${verein.ansprechpartner.weitere}`);
        notizTeile.push(apParts.join(' | '));
      }

      // Platzwart
      if (verein.platzwart.name) {
        const pwParts: string[] = [`Platzwart: ${verein.platzwart.name}`];
        if (verein.platzwart.tel) pwParts.push(`Tel: ${verein.platzwart.tel}`);
        if (verein.platzwart.mobil) pwParts.push(`Mobil: ${verein.platzwart.mobil}`);
        if (verein.platzwart.tel2) pwParts.push(`Tel2: ${verein.platzwart.tel2}`);
        if (verein.platzwart.weitere) pwParts.push(`Weitere: ${verein.platzwart.weitere}`);
        notizTeile.push(pwParts.join(' | '));
      }

      // Arbeitstermin
      if (verein.arbeitstermin) {
        notizTeile.push(`Arbeitstermin KW: ${verein.arbeitstermin}`);
      }

      // Hinweise
      if (verein.hinweise) {
        notizTeile.push(`Hinweise: ${verein.hinweise}`);
      }

      // Zusatz
      if (verein.zusatz) {
        notizTeile.push(`Zusatz: ${verein.zusatz}`);
      }

      const bundesland = getBundeslandAusPLZ(verein.lieferadresse.plz);

      const jetzt = new Date().toISOString();
      const neuerKunde = {
        id: ID.unique(),
        typ: 'verein' as const,
        name: verein.name,
        aktiv: true,
        rechnungsadresse: {
          strasse: verein.lieferadresse.strasse,
          plz: verein.lieferadresse.plz,
          ort: verein.lieferadresse.ort,
          bundesland: bundesland,
        },
        lieferadresse: {
          strasse: verein.lieferadresse.strasse,
          plz: verein.lieferadresse.plz,
          ort: verein.lieferadresse.ort,
          bundesland: bundesland,
        },
        // Backwards-Compatibility
        adresse: {
          strasse: verein.lieferadresse.strasse,
          plz: verein.lieferadresse.plz,
          ort: verein.lieferadresse.ort,
          bundesland: bundesland,
        },
        standardBezugsweg: 'ueber_platzbauer' as const,
        standardPlatzbauerId: voglPlatzbauer.id,
        tonnenLetztesJahr: verein.mengeTonnen,
        schuettstellenAnzahl: verein.anzahlPlaetze > 1 ? verein.anzahlPlaetze : undefined,
        belieferungsart: 'nur_motorwagen' as const,
        notizen: notizTeile.join('\n'),
        anfahrtshinweise: verein.hinweise || undefined,
        beziehtUeberUnsPlatzbauer: true,
        abwerkspreis: false,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      };

      if (!DRY_RUN) {
        try {
          await databases.createDocument(
            DATABASE_ID,
            SAISON_KUNDEN_COLLECTION_ID,
            neuerKunde.id,
            toPayload(neuerKunde)
          );
          console.log(`      ✅ Angelegt (${verein.mengeTonnen}t, ${verein.anzahlPlaetze} Platz/Plätze)`);
          angelegt++;
        } catch (error: any) {
          console.error(`      ❌ Fehler: ${error.message}`);
        }
      } else {
        console.log(`      📋 ${verein.mengeTonnen}t, ${verein.anzahlPlaetze} Platz/Plätze, ${verein.lieferadresse.plz} ${verein.lieferadresse.ort}`);
        angelegt++;
      }
    }

    console.log(`\n   → ${angelegt} Vereine ${DRY_RUN ? 'würden angelegt' : 'angelegt'}`);

    // 5. Zusammenfassung
    console.log('\n' + '='.repeat(50));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(50));
    console.log(`   Gelöscht: ${geloescht} Vereine`);
    console.log(`   Behalten: ${vereinZuBehalten ? `${VEREIN_BEHALTEN}` : 'keiner'}`);
    console.log(`   Neu angelegt: ${angelegt} Vereine`);
    console.log(`   Gesamt: ${(vereinZuBehalten ? 1 : 0) + angelegt} Vereine`);

    if (DRY_RUN) {
      console.log('\n💡 Führe ohne --dry-run aus, um Änderungen zu speichern:');
      console.log('   npx tsx scripts/vogl-vereine-bereinigung.ts');
    } else {
      console.log('\n✅ Bereinigung abgeschlossen!');
    }

  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
