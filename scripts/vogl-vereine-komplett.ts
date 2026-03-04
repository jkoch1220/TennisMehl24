/**
 * KOMPLETT-Script für Platzbauer Thomas Vogl
 * Liest Daten aus Excel und legt Vereine + Ansprechpartner korrekt an
 *
 * Speichert:
 * - Vereinsname, Lieferadresse, Tonnen
 * - Belieferungsart (aus Hinweisen abgeleitet)
 * - wunschLieferwoche (erste KW-Zahl)
 * - dispoAnsprechpartner (erster AP mit Telefon)
 * - anfahrtshinweise (Hinweise aus Excel)
 * - Alle Ansprechpartner als separate AP-Dokumente
 *
 * Führe aus mit: npx tsx scripts/vogl-vereine-komplett.ts
 * Für Vorschau: npx tsx scripts/vogl-vereine-komplett.ts --dry-run
 */

import { Client, Databases, Query, ID } from 'node-appwrite';
import * as dotenv from 'dotenv';
import XLSX from 'xlsx';

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

const VEREIN_BEHALTEN = 'TC Dietenhofen e.V.';
const EXCEL_PATH = '/Users/jkoch/Workspace/Tennismehl GmbH/tennismehl_portal/scripts/vogl-daten.xls';

// ==================== TYPEN ====================

type Belieferungsart = 'nur_motorwagen' | 'mit_haenger' | 'abholung_ab_werk' | 'palette_mit_ladekran' | 'bigbag';

interface Telefonnummer {
  nummer: string;
  typ?: string;
  beschreibung?: string;
}

interface AnsprechpartnerData {
  name: string;
  rolle: string;
  telefonnummern: Telefonnummer[];
  notizen?: string;
}

interface VereinData {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  tonnen: number;
  anzahlPlaetze: number;
  lieferwocheKW: number;
  belieferungsart: Belieferungsart;
  anfahrtshinweise?: string;
  dispoAnsprechpartner?: { name: string; telefon: string };
  ansprechpartner: AnsprechpartnerData[];
}

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
  const prefix = plz.substring(0, 2);
  const prefixNum = parseInt(prefix);
  if (prefixNum >= 35 && prefixNum <= 36) return 'Hessen';
  if (prefixNum >= 63 && prefixNum <= 64) return 'Hessen';
  if (prefixNum >= 69 && prefixNum <= 69) return 'Baden-Württemberg';
  if (prefixNum >= 73 && prefixNum <= 73) return 'Baden-Württemberg';
  if (prefixNum >= 90 && prefixNum <= 91) return 'Bayern';
  if (prefixNum >= 95 && prefixNum <= 97) return 'Bayern';
  return 'Bayern';
}

// Extrahiert erste KW-Zahl aus "13.-15." → 13
function extractKW(arbeitstermin: string): number {
  if (!arbeitstermin) return 0;
  const match = arbeitstermin.toString().match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Bestimmt Belieferungsart aus Hinweisen
function getBelierungsart(hinweise: string): Belieferungsart {
  if (!hinweise) return 'mit_haenger';
  const lower = hinweise.toLowerCase();
  if (lower.includes('kein anhänger') || lower.includes('kein hänger') ||
      lower.includes('kein sattel') || lower.includes('nur motorwagen')) {
    return 'nur_motorwagen';
  }
  if (lower.includes('sattel geht') || lower.includes('mit hänger')) {
    return 'mit_haenger';
  }
  // Default: mit_haenger (wie im Modal)
  return 'mit_haenger';
}

// Parst Telefonnummern aus einem String
function parseTelefonnummern(telStr: string | undefined): Telefonnummer[] {
  if (!telStr) return [];
  const nummern: Telefonnummer[] = [];

  // Splitte nach Komma oder Semikolon
  const parts = telStr.split(/[,;]/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Extrahiere Nummer (Zahlen, Bindestriche, Leerzeichen, Schrägstriche)
    const numMatch = trimmed.match(/([\d\s\-\/]+)/);
    if (numMatch && numMatch[1].trim().length >= 6) {
      const nummer = numMatch[1].trim();
      // Beschreibung ist alles was keine Zahl ist
      let beschreibung = trimmed.replace(numMatch[1], '').trim();
      // Entferne führende/nachfolgende Sonderzeichen
      beschreibung = beschreibung.replace(/^[\s\-:\.]+|[\s\-:\.]+$/g, '').trim();

      // Typ bestimmen
      let typ = 'Telefon';
      if (nummer.startsWith('01')) typ = 'Mobil';

      nummern.push({
        nummer,
        typ,
        beschreibung: beschreibung || undefined,
      });
    }
  }
  return nummern;
}

// Parst eine Excel-Zeile zu VereinData
function parseExcelRow(row: any[]): VereinData | null {
  // Spalten laut Excel:
  // 0: Vereinsname, 1: Tonnen, 2: (leer), 3: Anzahl Plätze, 4: (leer), 5: Arbeitstermin
  // 6: AP Name, 7: AP Tel1, 8: AP Tel2, 9: AP weitere
  // 10: Platzwart, 11: PW Tel, 12: PW Tel2
  // 13: (leer), 14: Lieferstraße, 15: PLZ+Ort, 16: Hinweise

  const vereinsname = row[0]?.toString().trim();
  if (!vereinsname || vereinsname === 'VEREIN' || vereinsname === 'NEU') {
    return null;
  }

  const tonnen = parseFloat(row[1]) || 0;
  if (tonnen === 0) return null; // Keine gültige Zeile

  // Adresse parsen: Spalte 15 enthält "PLZ Ort"
  const plzOrt = row[15]?.toString().trim() || '';
  const plzMatch = plzOrt.match(/^(\d{5})\s*(.*)$/);
  const plz = plzMatch ? plzMatch[1] : '';

  // Zeile ohne gültige PLZ überspringen (z.B. Summenzeilen)
  if (!plz) return null;

  const anzahlPlaetze = parseInt(row[3]) || 1;
  const arbeitstermin = row[5]?.toString() || '';
  const lieferwocheKW = extractKW(arbeitstermin);

  // Adresse (PLZ bereits oben validiert)
  const ort = plzMatch ? plzMatch[2].trim() : plzOrt;
  const strasse = row[14]?.toString().trim() || '';

  const hinweise = row[16]?.toString().trim() || '';
  const belieferungsart = getBelierungsart(hinweise);

  // Ansprechpartner parsen
  const ansprechpartner: AnsprechpartnerData[] = [];

  // Haupt-Ansprechpartner (Spalten 6-9)
  const apName = row[6]?.toString().trim() || '';
  if (apName) {
    const apTel1 = row[7]?.toString() || '';
    const apTel2 = row[8]?.toString() || '';
    const apWeitere = row[9]?.toString() || '';

    const telefonnummern = [
      ...parseTelefonnummern(apTel1),
      ...parseTelefonnummern(apTel2),
    ];

    ansprechpartner.push({
      name: apName,
      rolle: 'Ansprechpartner',
      telefonnummern,
      notizen: apWeitere || undefined,
    });
  }

  // Platzwart (Spalten 10-12)
  let pwName = row[10]?.toString().trim() || '';
  // Manchmal ist der Name mit Telefon kombiniert: "Ohl 0171-4570402"
  const pwNameMatch = pwName.match(/^([^\d]+)/);
  if (pwNameMatch) {
    pwName = pwNameMatch[1].trim();
  }

  if (pwName) {
    const pwTel1 = row[11]?.toString() || '';
    const pwTel2 = row[12]?.toString() || '';

    // Wenn pwName eine Nummer enthält, extrahiere sie
    let extraTel = '';
    const pwNameTelMatch = row[10]?.toString().match(/([\d\-\/\s]{8,})/);
    if (pwNameTelMatch) {
      extraTel = pwNameTelMatch[1];
    }

    const telefonnummern = [
      ...parseTelefonnummern(extraTel),
      ...parseTelefonnummern(pwTel1),
      ...parseTelefonnummern(pwTel2),
    ];

    ansprechpartner.push({
      name: pwName,
      rolle: 'Platzwart',
      telefonnummern,
    });
  }

  // Dispo-Ansprechpartner = erster AP mit Telefonnummer
  let dispoAnsprechpartner: { name: string; telefon: string } | undefined;
  for (const ap of ansprechpartner) {
    if (ap.telefonnummern.length > 0) {
      dispoAnsprechpartner = {
        name: ap.name,
        telefon: ap.telefonnummern[0].nummer,
      };
      break;
    }
  }

  return {
    name: vereinsname,
    strasse,
    plz,
    ort,
    tonnen,
    anzahlPlaetze,
    lieferwocheKW,
    belieferungsart,
    anfahrtshinweise: hinweise || undefined,
    dispoAnsprechpartner,
    ansprechpartner,
  };
}

// ==================== HAUPTFUNKTION ====================

async function main() {
  console.log('🔧 Vogl Sportanlagen - Vereine KOMPLETT-Import');
  console.log('='.repeat(65));
  console.log(DRY_RUN ? '📋 DRY-RUN Modus (keine Änderungen)\n' : '🚀 LIVE Modus\n');

  // 1. Excel laden
  console.log('📥 Lade Excel-Datei...');
  console.log(`   Pfad: ${EXCEL_PATH}`);
  let workbook;
  try {
    workbook = XLSX.readFile(EXCEL_PATH);
  } catch (error: any) {
    console.error('❌ Fehler beim Laden der Excel-Datei:');
    console.error(`   ${error.message || error}`);
    console.error(`   Pfad: ${EXCEL_PATH}`);
    process.exit(1);
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // Parse alle Vereine aus Excel
  const vereineAusExcel: VereinData[] = [];
  for (const row of rows) {
    const verein = parseExcelRow(row);
    if (verein && verein.name !== VEREIN_BEHALTEN) {
      vereineAusExcel.push(verein);
    }
  }

  console.log(`✅ ${vereineAusExcel.length} Vereine aus Excel gelesen\n`);

  // Zeige Vereine
  console.log('📋 Vereine aus Excel:');
  for (const v of vereineAusExcel) {
    console.log(`   • ${v.name}`);
    console.log(`     KW ${v.lieferwocheKW} | ${v.tonnen}t | ${v.belieferungsart}`);
    console.log(`     ${v.plz} ${v.ort}`);
    if (v.dispoAnsprechpartner) {
      console.log(`     AP: ${v.dispoAnsprechpartner.name} (${v.dispoAnsprechpartner.telefon})`);
    }
    console.log(`     ${v.ansprechpartner.length} Ansprechpartner gesamt`);
    console.log('');
  }

  // 2. Lade Platzbauer
  console.log('🔍 Lade Platzbauer Vogl...');
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
    if (kunde.typ === 'platzbauer' && kunde.aktiv && kunde.name?.toLowerCase().includes('vogl')) {
      voglPlatzbauer = { ...kunde, $id: doc.$id };
    }
  }

  if (!voglPlatzbauer) {
    console.error('❌ Platzbauer Vogl nicht gefunden!');
    process.exit(1);
  }

  console.log(`✅ Gefunden: ${voglPlatzbauer.name}\n`);

  // 3. Finde aktuelle Vereine zum Löschen
  const voglVereine = alleKunden.filter(
    k => k.typ === 'verein' &&
         k.standardPlatzbauerId === voglPlatzbauer.id &&
         k.standardBezugsweg === 'ueber_platzbauer' &&
         k.aktiv === true &&
         k.name !== VEREIN_BEHALTEN
  );

  console.log(`📊 Zusammenfassung:`);
  console.log(`   Zu löschen: ${voglVereine.length} Vereine`);
  console.log(`   Behalten: ${VEREIN_BEHALTEN}`);
  console.log(`   Neu aus Excel: ${vereineAusExcel.length} Vereine\n`);

  if (!DRY_RUN && !SKIP_CONFIRM) {
    console.log('⚠️  Drücke Ctrl+C zum Abbrechen, oder warte 5 Sekunden...');
    await new Promise(r => setTimeout(r, 5000));
  }

  // ==================== SCHRITT 1: LÖSCHEN ====================
  console.log('='.repeat(65));
  console.log('📍 SCHRITT 1: Vereine + Ansprechpartner löschen');
  console.log('='.repeat(65) + '\n');

  let geloescht = 0;
  for (const verein of voglVereine) {
    console.log(`   🗑️  ${verein.name}`);

    if (!DRY_RUN) {
      try {
        // Lösche Ansprechpartner
        const apResponse = await databases.listDocuments(
          DATABASE_ID,
          SAISON_ANSPRECHPARTNER_COLLECTION_ID,
          [Query.equal('kundeId', verein.id || verein.$id), Query.limit(100)]
        );

        for (const apDoc of apResponse.documents) {
          await databases.deleteDocument(DATABASE_ID, SAISON_ANSPRECHPARTNER_COLLECTION_ID, apDoc.$id);
        }
        if (apResponse.documents.length > 0) {
          console.log(`      → ${apResponse.documents.length} AP(s) gelöscht`);
        }

        // Lösche Verein
        await databases.deleteDocument(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, verein.$id);
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
  console.log('\n' + '='.repeat(65));
  console.log('📍 SCHRITT 2: Neue Vereine + Ansprechpartner anlegen');
  console.log('='.repeat(65) + '\n');

  let angelegt = 0;
  let apsAngelegt = 0;

  for (const verein of vereineAusExcel) {
    console.log(`   📝 ${verein.name}`);
    console.log(`      KW: ${verein.lieferwocheKW} | ${verein.tonnen}t | ${verein.belieferungsart}`);

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
      standardPlatzbauerId: voglPlatzbauer.id,
      tonnenLetztesJahr: verein.tonnen,
      schuettstellenAnzahl: verein.anzahlPlaetze > 1 ? verein.anzahlPlaetze : undefined,
      belieferungsart: verein.belieferungsart,
      wunschLieferwoche: verein.lieferwocheKW || undefined,
      dispoAnsprechpartner: verein.dispoAnsprechpartner,
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
        for (const ap of verein.ansprechpartner) {
          if (!ap.name) continue;

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
            { kundeId: vereinId, data: JSON.stringify(neuerAP) }
          );
          apsAngelegt++;
        }

        console.log(`      ✅ Angelegt + ${verein.ansprechpartner.length} AP(s)`);
        angelegt++;
      } catch (error: any) {
        console.error(`      ❌ Fehler: ${error.message}`);
      }
    } else {
      console.log(`      📋 ${verein.ansprechpartner.length} AP(s) würden angelegt`);
      angelegt++;
      apsAngelegt += verein.ansprechpartner.length;
    }
  }

  console.log(`\n   → ${angelegt} Vereine ${DRY_RUN ? 'würden angelegt' : 'angelegt'}`);
  console.log(`   → ${apsAngelegt} Ansprechpartner ${DRY_RUN ? 'würden angelegt' : 'angelegt'}`);

  // ==================== ZUSAMMENFASSUNG ====================
  console.log('\n' + '='.repeat(65));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(65));
  console.log(`   Gelöscht: ${geloescht} Vereine`);
  console.log(`   Behalten: ${VEREIN_BEHALTEN}`);
  console.log(`   Neu angelegt: ${angelegt} Vereine`);
  console.log(`   Ansprechpartner: ${apsAngelegt}`);
  console.log(`   Gesamt: ${(alleKunden.find(k => k.name === VEREIN_BEHALTEN) ? 1 : 0) + angelegt} Vereine`);

  if (DRY_RUN) {
    console.log('\n💡 Führe ohne --dry-run aus:');
    console.log('   npx tsx scripts/vogl-vereine-komplett.ts --yes');
  } else {
    console.log('\n✅ Import abgeschlossen!');
  }
}

main().catch(console.error);
