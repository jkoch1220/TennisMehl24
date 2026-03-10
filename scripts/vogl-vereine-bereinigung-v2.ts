/**
 * Bereinigungsscript V2 für Platzbauer Thomas Vogl
 *
 * VERBESSERT:
 * - Ansprechpartner als echte AP-Dokumente anlegen
 * - wunschLieferwoche als Zahl (erste KW)
 * - dispoAnsprechpartner = erster AP
 * - Alle Kontakte werden als separate APs angelegt
 *
 * Führe aus mit: npx tsx scripts/vogl-vereine-bereinigung-v2.ts
 * Für Vorschau: npx tsx scripts/vogl-vereine-bereinigung-v2.ts --dry-run
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

interface Telefonnummer {
  nummer: string;
  typ?: string;
  beschreibung?: string;
}

interface AnsprechpartnerInput {
  name: string;
  rolle: string; // "Ansprechpartner", "Platzwart", "Kontakt"
  telefonnummern: Telefonnummer[];
  notizen?: string;
}

interface VereinsDaten {
  name: string;
  mengeTonnen: number;
  anzahlPlaetze: number;
  arbeitsterminKW: number; // Erste KW-Zahl
  arbeitsterminText: string; // Original-Text für Notizen
  ansprechpartner: AnsprechpartnerInput[];
  lieferadresse: {
    strasse: string;
    plz: string;
    ort: string;
  };
  hinweise?: string;
  zusatz?: string;
}

// ==================== HELPER ====================

// Extrahiert erste KW-Zahl aus "13.–15." → 13
function extractKW(arbeitstermin: string): number {
  const match = arbeitstermin.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Parst Telefonnummern aus verschiedenen Formaten
function parseTelefonnummern(
  tel?: string,
  mobil?: string,
  tel2?: string,
  weitere?: string
): Telefonnummer[] {
  const nummern: Telefonnummer[] = [];

  if (tel) nummern.push({ nummer: tel, typ: 'Festnetz' });
  if (mobil) nummern.push({ nummer: mobil, typ: 'Mobil' });
  if (tel2) nummern.push({ nummer: tel2, typ: 'Festnetz 2' });

  // "Weitere" parsen: "Name 0123-456, Name2 0789-123"
  if (weitere) {
    const parts = weitere.split(/,\s*/);
    for (const part of parts) {
      // Versuche Nummer zu extrahieren
      const numMatch = part.match(/([\d\s\-\/]+)/);
      if (numMatch) {
        nummern.push({
          nummer: numMatch[1].trim(),
          typ: 'Weitere',
          beschreibung: part.replace(numMatch[1], '').trim() || undefined,
        });
      }
    }
  }

  return nummern;
}

// Erstellt AP-Liste aus den Rohdaten
function createAnsprechpartnerList(
  ap: { name: string; tel?: string; mobil?: string; weitere?: string },
  pw: { name: string; tel?: string; mobil?: string; tel2?: string; weitere?: string }
): AnsprechpartnerInput[] {
  const result: AnsprechpartnerInput[] = [];

  // Haupt-Ansprechpartner
  if (ap.name) {
    result.push({
      name: ap.name,
      rolle: 'Ansprechpartner',
      telefonnummern: parseTelefonnummern(ap.tel, ap.mobil, undefined, undefined),
      notizen: ap.weitere,
    });
  }

  // Platzwart
  if (pw.name) {
    result.push({
      name: pw.name,
      rolle: 'Platzwart',
      telefonnummern: parseTelefonnummern(pw.tel, pw.mobil, pw.tel2, undefined),
      notizen: pw.weitere,
    });
  }

  return result;
}

// ==================== VEREINSDATEN ====================

const NEUE_VEREINE: VereinsDaten[] = [
  {
    name: 'RSV 1929 e.V. Büblingshausen',
    mengeTonnen: 5,
    anzahlPlaetze: 1,
    arbeitsterminKW: 13,
    arbeitsterminText: '13.–14.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Unützer', tel: '06441-47730', mobil: '0170-2802761' },
      { name: 'Unützer', tel: '0176-45788363', tel2: '06441-9524474' }
    ),
    lieferadresse: { strasse: 'Frankfurter Strasse 111', plz: '35578', ort: 'Wetzlar' },
  },
  {
    name: 'TC Hainstadt 1959 e.V.',
    mengeTonnen: 11,
    anzahlPlaetze: 2,
    arbeitsterminKW: 11,
    arbeitsterminText: '11.–12.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Große-Venhaus', tel: '06182-66477', mobil: '0163-1464325', weitere: 'Seidel 0176-99536932, Schwab 0173-6886667, Frau Dukatz (Vorsitzende) 0171-4187787' },
      { name: 'Marcak', tel: '06182-840635', mobil: '01520-5238678', tel2: '069-89041288', weitere: 'Kasper 06182-69363 / 0172-7330919' }
    ),
    lieferadresse: { strasse: 'Außerhalb 6', plz: '63512', ort: 'Hainburg' },
    hinweise: 'Von der Autobahn Kreisel-Abfahrt Hainburg (OT Hainstadt) im Ort 1. Ampel li. — geradeaus direkt nach Bauhof 1. Str. re. Nach 50m re. Tennisplätze',
  },
  {
    name: 'TC Waldbrunn 1988 e.V.',
    mengeTonnen: 5,
    anzahlPlaetze: 1,
    arbeitsterminKW: 14,
    arbeitsterminText: '14.–15.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'König', tel: '06274-95218', mobil: '0175-4685299' },
      { name: 'Ebert', tel: '0162-6270241', tel2: '06274-2899969' }
    ),
    lieferadresse: { strasse: 'Im Hoffeld 32', plz: '69429', ort: 'Waldbrunn OT Waldkatzenbach' },
  },
  {
    name: 'TSV Bartenbach e.V.',
    mengeTonnen: 4,
    anzahlPlaetze: 1,
    arbeitsterminKW: 14,
    arbeitsterminText: '14.–16.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Weiler', tel: '07161-6548584', mobil: '0152-55944523', weitere: 'alt: Frau Bauer 0175-1699408' },
      { name: 'Eberle', tel: '07161-25217', mobil: '0173-9634260' }
    ),
    lieferadresse: { strasse: 'Lerchenberger Str. 114', plz: '73035', ort: 'Göppingen' },
    hinweise: 'Rechtzeitig Lieferung ankündigen',
  },
  {
    name: 'TSV Sparwiesen e.V.',
    mengeTonnen: 4.5,
    anzahlPlaetze: 1,
    arbeitsterminKW: 14,
    arbeitsterminText: '14.–15.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Schatz', tel: '07161-35122', mobil: '01590-2452338', weitere: 'alt: Frau Bauer 0175-1699408, Loser 07161-33982' },
      { name: 'Köstlin', tel: '07161-33304' }
    ),
    lieferadresse: { strasse: 'Holbeinstr.', plz: '73066', ort: 'Uhingen' },
  },
  {
    name: 'TC Höchstadt/Aisch e.V.',
    mengeTonnen: 15,
    anzahlPlaetze: 2,
    arbeitsterminKW: 12,
    arbeitsterminText: '12.–13.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Weisenberger', mobil: '01578-6359585' },
      { name: 'Frau Harder', mobil: '0172-8612567' }
    ),
    lieferadresse: { strasse: 'Am Sportpark 7', plz: '91315', ort: 'Höchstadt' },
    hinweise: 'Sattel geht besser',
  },
  {
    name: 'TV 1974 Adelsdorf e.V.',
    mengeTonnen: 10,
    anzahlPlaetze: 2,
    arbeitsterminKW: 12,
    arbeitsterminText: '12.–13.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Frau Holmer', mobil: '0176-96193038' },
      { name: 'Meszmer', mobil: '0174-1689039', tel: '09195-4454', weitere: 'Maul 01512-7180387' }
    ),
    lieferadresse: { strasse: 'Am Sportplatz 3-5', plz: '91325', ort: 'Adelsdorf' },
    hinweise: '2 Abladestellen: auf 3-Platz-Anlage 7,5 to, auf 1-Platz-Anlage 2,5 to abkippen',
  },
  {
    name: 'TC Röttenbach',
    mengeTonnen: 13.5,
    anzahlPlaetze: 1,
    arbeitsterminKW: 12,
    arbeitsterminText: '12.–14.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Findeiß', tel: '09195-3113', mobil: '0171-2711876' },
      { name: '' } // Kein Platzwart
    ),
    lieferadresse: { strasse: 'Lohmühlweg 11a', plz: '91341', ort: 'Röttenbach' },
    hinweise: 'Sattel geht wenn er 150m rückwärts fährt',
  },
  {
    name: 'Tennisclub Selb e.V.',
    mengeTonnen: 11,
    anzahlPlaetze: 1,
    arbeitsterminKW: 15,
    arbeitsterminText: '15.–17.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Roch', mobil: '0173-6206529', weitere: 'alt: Erhard 09287-712583 / 0160-6303451' },
      { name: '' }
    ),
    lieferadresse: { strasse: 'Hohenberger Str. 37', plz: '95100', ort: 'Selb' },
    hinweise: 'Anlage zentrumsnah neben Schützengarten, kein Anhänger',
  },
  {
    name: 'EC Erkersreuth e.V.',
    mengeTonnen: 9,
    anzahlPlaetze: 1,
    arbeitsterminKW: 14,
    arbeitsterminText: '14.–16.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Grandits', mobil: '0176-20195163' },
      { name: 'Lautenbacher', mobil: '0157-75161745' }
    ),
    lieferadresse: { strasse: 'Hauptstr. 1', plz: '95100', ort: 'Selb-Erkersreuth' },
  },
  {
    name: 'TSV Melkendorf e.V.',
    mengeTonnen: 10,
    anzahlPlaetze: 2,
    arbeitsterminKW: 13,
    arbeitsterminText: '13.–15.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Küfner', mobil: '0173-7080911', weitere: 'Bruder 01523-6866814' },
      { name: 'Mario Küfner', mobil: '01512-9261090' }
    ),
    lieferadresse: { strasse: 'Steinenhausen 4 / Hauptstraße 66 (neben dem Fußballplatz)', plz: '95326', ort: 'Kulmbach Melkendorf' },
    hinweise: 'Neben Fußballplatz, kein Sattel/Anhänger, schwierig zu wenden',
  },
  {
    name: 'SG Franken e.V.',
    mengeTonnen: 7,
    anzahlPlaetze: 1,
    arbeitsterminKW: 14,
    arbeitsterminText: '14.–16.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Haas', mobil: '0179-2998919', tel: '01514-1972027', weitere: 'alt: 0921-2852849' },
      { name: 'Raab', tel: '0921-2852234', mobil: '0179-1162438' }
    ),
    lieferadresse: { strasse: 'Riedingerstr. 9', plz: '95448', ort: 'Bayreuth' },
  },
  {
    name: 'Tennisclub Rot-Weiß Gefrees',
    mengeTonnen: 7,
    anzahlPlaetze: 1,
    arbeitsterminKW: 14,
    arbeitsterminText: '14.–16.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Bär', mobil: '0170-3036063', tel: '09208-68926' },
      { name: 'Ruchal', mobil: '01590-4791057', weitere: 'Jerschl 0176-20607579, Kassier 09254-1075' }
    ),
    lieferadresse: { strasse: 'Am Hammerweg', plz: '95482', ort: 'Gefrees' },
  },
  {
    name: 'BLSV Sportcamp Nordbayern gGmbH',
    mengeTonnen: 7,
    anzahlPlaetze: 1,
    arbeitsterminKW: 15,
    arbeitsterminText: '15.–17.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Lichtblau', mobil: '01511-5997839' },
      { name: '' }
    ),
    lieferadresse: { strasse: 'Am Sportcamp 1', plz: '95493', ort: 'Bischofsgrün' },
  },
  {
    name: 'TSV Mistelbach',
    mengeTonnen: 5,
    anzahlPlaetze: 1,
    arbeitsterminKW: 12,
    arbeitsterminText: '12.–15.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Wienert', tel: '0921-5070307', mobil: '0160-3376981', weitere: '09279-97010 p.' },
      { name: 'Kraus', tel: '09201-7786', weitere: 'Stahlmann 0171-5321289' }
    ),
    lieferadresse: { strasse: 'Jahnstraße 10', plz: '95511', ort: 'Mistelbach' },
    hinweise: 'Tennisplätze beim Sportplatz, von Gesees kommend, nicht die 1. links in die Jahnstraße sondern Berg runter die 2. Straße links abbiegen (Weg zu den Tennisplätzen)',
  },
  {
    name: 'Baur S.V. Burgkunstadt e.V.',
    mengeTonnen: 18,
    anzahlPlaetze: 2,
    arbeitsterminKW: 13,
    arbeitsterminText: '13.–15.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Fischer', mobil: '0160-96632605' },
      { name: 'Container', mobil: '0173-9924977' }
    ),
    lieferadresse: { strasse: 'Dr. Sattler-Str. 1', plz: '96224', ort: 'Burgkunstadt' },
    hinweise: 'TA hinter Baur-Sporthalle an B289, 2 Abladestellen jeweils genau 50%! Avisieren',
  },
  {
    name: 'TG Schweinfurt 1848 e.V.',
    mengeTonnen: 15,
    anzahlPlaetze: 3,
    arbeitsterminKW: 11,
    arbeitsterminText: '11.–13.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Gäb', tel: '09721-6797544', mobil: '0179-7799061' },
      { name: 'Hausmeister', tel: '09721-22242', weitere: 'Hansi 0170-8130924, Körber, Maerkert 0171-9769372, Frau Stolz 0170-2932259' }
    ),
    lieferadresse: { strasse: 'Lindenbrunnenweg 51 / Zellerstraße', plz: '97422', ort: 'Schweinfurt' },
    hinweise: 'Nach den Hauptgebäuden der TG Schweinfurt noch ca. 200m stadtauswärts, dann linker Hand an der Straße (sehr enge Einfahrt, Fahrzeugtyp anfragen)',
    zusatz: '+ 1 to gesackt als Beiladung',
  },
  {
    name: 'TC Schweinfurt e.V.',
    mengeTonnen: 18,
    anzahlPlaetze: 3,
    arbeitsterminKW: 12,
    arbeitsterminText: '12.–13.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Schunck', tel: '09721-43933', mobil: '0172-7017667' },
      { name: 'Ohl', mobil: '0171-4570402', tel: '09721-9789070' }
    ),
    lieferadresse: { strasse: 'Hainigweg 2-4', plz: '97424', ort: 'Schweinfurt' },
    hinweise: '2 Abladestellen',
  },
  {
    name: 'TC Rot-Weiß Gerolzhofen e.V.',
    mengeTonnen: 11.5,
    anzahlPlaetze: 2,
    arbeitsterminKW: 12,
    arbeitsterminText: '12.–14.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Löhrlein', mobil: '0160-5548514', tel: '09382-4259', weitere: 'Gehring 0160-5530135' },
      { name: 'Herold', mobil: '01622-778839', tel: '09382-1802', weitere: 'alt: Hauke 0176-34486307 / 09382-1440 p.' }
    ),
    lieferadresse: { strasse: 'Schallfelder Str. 52', plz: '97447', ort: 'Gerolzhofen' },
  },
  {
    name: 'TC Gochsheim 77 e.V.',
    mengeTonnen: 8,
    anzahlPlaetze: 2,
    arbeitsterminKW: 12,
    arbeitsterminText: '12.–15.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Binder', tel: '09721-630212', mobil: '0170-5701368', weitere: 'Reinhard 01514-2032559, Frau Brehm 0163-4567457' },
      { name: 'Haberbusch', mobil: '0170-7789095' }
    ),
    lieferadresse: { strasse: 'Kopernikusstr. 4', plz: '97469', ort: 'Gochsheim' },
  },
  {
    name: 'ATS Kulmbach e.V.',
    mengeTonnen: 8,
    anzahlPlaetze: 1,
    arbeitsterminKW: 13,
    arbeitsterminText: '13.–15.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Frau Müller', mobil: '01766-1386406', weitere: 'alt: Friedrich 0173-9495046 / 09221-9488652' },
      { name: '' }
    ),
    lieferadresse: { strasse: 'Alte Forstlahmer Str. 20', plz: '95326', ort: 'Kulmbach' },
  },
  {
    name: 'TV Jahn 1895 e.V. Schweinfurt',
    mengeTonnen: 9,
    anzahlPlaetze: 2,
    arbeitsterminKW: 15,
    arbeitsterminText: '15.–16.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Scholz', tel: '09721-32042', mobil: '0171-6945355', weitere: 'alt: Berger 0176-45631425 / 0172-8173393' },
      { name: 'Köhler', tel: '09721-185886', mobil: '0170-3806189' }
    ),
    lieferadresse: { strasse: 'Ernst-Paul-Str. 6', plz: '97422', ort: 'Schweinfurt' },
    hinweise: 'Anfahrt über Deutschhöfer Str. (Richtung Üchtelhausen). Am Berg oben die 2. Ampel links abbiegen, nach ca. 50m nochmals links (z. Jahn) abbiegen.',
  },
  {
    name: 'SG 1912 Dittelbrunn e.V.',
    mengeTonnen: 14,
    anzahlPlaetze: 2,
    arbeitsterminKW: 13,
    arbeitsterminText: '13.–15.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Landeck', tel: '09721-4760707', mobil: '0157-85318295' },
      { name: '' }
    ),
    lieferadresse: { strasse: 'Am Steinig 1', plz: '97456', ort: 'Dittelbrunn' },
    hinweise: 'Zufahrt über "Am Schleifweg"',
  },
  {
    name: 'TC Weismain e.V.',
    mengeTonnen: 10,
    anzahlPlaetze: 2,
    arbeitsterminKW: 13,
    arbeitsterminText: '13.–15.',
    ansprechpartner: createAnsprechpartnerList(
      { name: 'Dietz', mobil: '0176-11981530', tel: '09575-981516' },
      { name: 'Dinkel', tel: '09575-981510', weitere: 'Hafermann Josefus 0173-3944583, Andreas 01515-2533284' }
    ),
    lieferadresse: { strasse: 'Baiersdorfer Str. 12', plz: '96260', ort: 'Weismain' },
    hinweise: 'Schmaler Anfahrtsweg, 2 Kippstellen sonst Wege zu weit!',
  },
];

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

function getBundeslandAusPLZ(plz: string): string {
  const prefix = plz.substring(0, 2);
  const prefixNum = parseInt(prefix);

  if (prefixNum >= 35 && prefixNum <= 36) return 'Hessen';
  if (prefixNum >= 63 && prefixNum <= 64) return 'Hessen';
  if (prefixNum >= 69 && prefixNum <= 69) return 'Baden-Württemberg';
  if (prefixNum >= 73 && prefixNum <= 73) return 'Baden-Württemberg';
  if (prefixNum >= 91 && prefixNum <= 91) return 'Bayern';
  if (prefixNum >= 95 && prefixNum <= 96) return 'Bayern';
  if (prefixNum >= 97 && prefixNum <= 97) return 'Bayern';

  return 'Bayern';
}

// ==================== HAUPTFUNKTION ====================

async function main() {
  console.log('🔧 Vogl Sportanlagen - Vereine Bereinigung V2');
  console.log('='.repeat(60));
  console.log(DRY_RUN ? '📋 DRY-RUN Modus (keine Änderungen)\n' : '🚀 LIVE Modus\n');

  console.log('✨ VERBESSERUNGEN:');
  console.log('   • Ansprechpartner als echte AP-Dokumente');
  console.log('   • wunschLieferwoche als Zahl (erste KW)');
  console.log('   • dispoAnsprechpartner = erster AP\n');

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

      if (kunde.typ === 'platzbauer' && kunde.aktiv) {
        const nameLower = kunde.name?.toLowerCase() || '';
        if (nameLower.includes('vogl')) {
          voglPlatzbauer = { ...kunde, $id: doc.$id };
        }
      }
    }

    if (!voglPlatzbauer) {
      console.error('❌ Platzbauer Vogl nicht gefunden!');
      process.exit(1);
    }

    console.log(`✅ Platzbauer gefunden: ${voglPlatzbauer.name} (ID: ${voglPlatzbauer.id})\n`);

    // 2. Finde alle Vereine (nur "ueber_platzbauer")
    const voglVereine = alleKunden.filter(
      k => k.typ === 'verein' &&
           k.standardPlatzbauerId === voglPlatzbauer.id &&
           k.standardBezugsweg === 'ueber_platzbauer' &&
           k.aktiv === true
    );

    const vereineZumLoeschen = voglVereine.filter(v => v.name !== VEREIN_BEHALTEN);

    console.log(`📋 ${voglVereine.length} Vereine gefunden`);
    console.log(`   Zu löschen: ${vereineZumLoeschen.length}`);
    console.log(`   Behalten: ${VEREIN_BEHALTEN}`);
    console.log(`   Neu anzulegen: ${NEUE_VEREINE.length}\n`);

    // ==================== SCHRITT 1: LÖSCHEN ====================
    console.log('='.repeat(60));
    console.log('📍 SCHRITT 1: Vereine + Ansprechpartner löschen');
    console.log('='.repeat(60) + '\n');

    let geloescht = 0;
    for (const verein of vereineZumLoeschen) {
      console.log(`   🗑️  ${verein.name}`);

      if (!DRY_RUN) {
        try {
          // Lösche auch alle Ansprechpartner
          const apResponse = await databases.listDocuments(
            DATABASE_ID,
            SAISON_ANSPRECHPARTNER_COLLECTION_ID,
            [Query.equal('kundeId', verein.id || verein.$id), Query.limit(100)]
          );

          for (const apDoc of apResponse.documents) {
            await databases.deleteDocument(
              DATABASE_ID,
              SAISON_ANSPRECHPARTNER_COLLECTION_ID,
              apDoc.$id
            );
          }

          if (apResponse.documents.length > 0) {
            console.log(`      → ${apResponse.documents.length} AP(s) gelöscht`);
          }

          // Lösche Verein
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

    // ==================== SCHRITT 2: NEU ANLEGEN ====================
    console.log('\n' + '='.repeat(60));
    console.log('📍 SCHRITT 2: Neue Vereine + Ansprechpartner anlegen');
    console.log('='.repeat(60) + '\n');

    let angelegt = 0;
    let apsAngelegt = 0;

    for (const verein of NEUE_VEREINE) {
      console.log(`   📝 ${verein.name}`);
      console.log(`      KW: ${verein.arbeitsterminKW} | ${verein.mengeTonnen}t | ${verein.anzahlPlaetze} Platz/Plätze`);

      const bundesland = getBundeslandAusPLZ(verein.lieferadresse.plz);
      const jetzt = new Date().toISOString();
      const vereinId = ID.unique();

      // Erster AP wird dispoAnsprechpartner
      const ersterAP = verein.ansprechpartner[0];
      const dispoAnsprechpartner = ersterAP ? {
        name: ersterAP.name,
        telefon: ersterAP.telefonnummern[0]?.nummer || '',
      } : undefined;

      // Notizen nur mit Zusatz (falls vorhanden)
      const notizTeile: string[] = [];
      if (verein.zusatz) notizTeile.push(verein.zusatz);

      const neuerKunde = {
        id: vereinId,
        typ: 'verein' as const,
        name: verein.name,
        aktiv: true,
        rechnungsadresse: {
          strasse: verein.lieferadresse.strasse,
          plz: verein.lieferadresse.plz,
          ort: verein.lieferadresse.ort,
          bundesland,
        },
        lieferadresse: {
          strasse: verein.lieferadresse.strasse,
          plz: verein.lieferadresse.plz,
          ort: verein.lieferadresse.ort,
          bundesland,
        },
        adresse: {
          strasse: verein.lieferadresse.strasse,
          plz: verein.lieferadresse.plz,
          ort: verein.lieferadresse.ort,
          bundesland,
        },
        standardBezugsweg: 'ueber_platzbauer' as const,
        standardPlatzbauerId: voglPlatzbauer.id,
        tonnenLetztesJahr: verein.mengeTonnen,
        schuettstellenAnzahl: verein.anzahlPlaetze > 1 ? verein.anzahlPlaetze : undefined,
        belieferungsart: 'nur_motorwagen' as const,
        wunschLieferwoche: verein.arbeitsterminKW,
        dispoAnsprechpartner,
        anfahrtshinweise: verein.hinweise || undefined,
        notizen: notizTeile.length > 0 ? notizTeile.join('\n') : undefined,
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
          for (const ap of verein.ansprechpartner) {
            if (!ap.name) continue; // Leere APs überspringen

            const apId = ID.unique();
            const neuerAP = {
              id: apId,
              kundeId: vereinId,
              name: ap.name,
              rolle: ap.rolle,
              telefonnummern: ap.telefonnummern,
              notizen: ap.notizen,
              aktiv: true,
              erstelltAm: jetzt,
              geaendertAm: jetzt,
            };

            await databases.createDocument(
              DATABASE_ID,
              SAISON_ANSPRECHPARTNER_COLLECTION_ID,
              apId,
              {
                kundeId: vereinId,
                data: JSON.stringify(neuerAP),
              }
            );
            apsAngelegt++;
          }

          console.log(`      ✅ Angelegt + ${verein.ansprechpartner.filter(a => a.name).length} AP(s)`);
          angelegt++;
        } catch (error: any) {
          console.error(`      ❌ Fehler: ${error.message}`);
        }
      } else {
        console.log(`      📋 ${verein.ansprechpartner.filter(a => a.name).length} AP(s) würden angelegt`);
        angelegt++;
        apsAngelegt += verein.ansprechpartner.filter(a => a.name).length;
      }
    }

    console.log(`\n   → ${angelegt} Vereine ${DRY_RUN ? 'würden angelegt' : 'angelegt'}`);
    console.log(`   → ${apsAngelegt} Ansprechpartner ${DRY_RUN ? 'würden angelegt' : 'angelegt'}`);

    // ==================== ZUSAMMENFASSUNG ====================
    console.log('\n' + '='.repeat(60));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(60));
    console.log(`   Gelöscht: ${geloescht} Vereine`);
    console.log(`   Behalten: ${VEREIN_BEHALTEN}`);
    console.log(`   Neu angelegt: ${angelegt} Vereine`);
    console.log(`   Ansprechpartner: ${apsAngelegt}`);
    console.log(`   Gesamt: ${(voglVereine.find(v => v.name === VEREIN_BEHALTEN) ? 1 : 0) + angelegt} Vereine`);

    if (DRY_RUN) {
      console.log('\n💡 Führe ohne --dry-run aus:');
      console.log('   npx tsx scripts/vogl-vereine-bereinigung-v2.ts --yes');
    } else {
      console.log('\n✅ Bereinigung abgeschlossen!');
    }

  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
