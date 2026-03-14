/**
 * Import-Script für Universal Artikelliste 2026
 *
 * Importiert Versand-, Zoll- und Maßdaten aus der Excel-Datei.
 * Bestehende Artikel werden aktualisiert, Preise bleiben erhalten.
 *
 * Ausführung:
 *   npx tsx scripts/import-artikelliste-2026.ts
 */

import { Client, Databases, ID, Query } from 'node-appwrite';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Appwrite Setup
const client = new Client();
client
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID || '')
  .setKey(process.env.VITE_APPWRITE_API_KEY || '');

const databases = new Databases(client);
const DATABASE_ID = 'tennismehl24_db';
const UNIVERSA_ARTIKEL_COLLECTION_ID = 'universa_artikel';

// Batch-Konfiguration
const BATCH_SIZE = 10;
const BATCH_DELAY = 300;

// Typen
type VersandartTyp = 'gls' | 'spedition' | 'post' | 'anfrage' | 'unbekannt';

interface ArtikelData {
  artikelnummer: string;
  bezeichnung: string;
  verpackungseinheit: string;
  zolltarifnummer?: string;
  ursprungsland?: string;
  ursprungsregion?: string;
  gewichtKg?: number;
  laengeCm?: number;
  breiteCm?: number;
  hoeheCm?: number;
  ean?: string;
  seiteKatalog?: number;
  versandcodeDE?: string;
  versandcodeAT?: string;
  versandcodeBenelux?: string;
  versandartDE?: VersandartTyp;
  istSperrgut?: boolean;
}

// Versandcode-Parser
function parseVersandcode(code: string | undefined | null): {
  versandart: VersandartTyp;
  einzelcodes: string[];
} {
  if (!code || code.trim() === '') {
    return { versandart: 'unbekannt', einzelcodes: [] };
  }

  const normalized = code.trim().toLowerCase();

  if (normalized.includes('f. a. a.') || normalized.includes('f.a.a.')) {
    return { versandart: 'anfrage', einzelcodes: [] };
  }

  if (normalized === 'post') {
    return { versandart: 'post', einzelcodes: ['post'] };
  }

  const codePattern = /(?:(\d+)x)?(\d+)/g;
  const matches = [...code.matchAll(codePattern)];

  if (matches.length === 0) {
    return { versandart: 'unbekannt', einzelcodes: [] };
  }

  const einzelcodes: string[] = [];

  for (const match of matches) {
    const codeNumber = match[2];
    if (codeNumber && /^[1-5]\d$/.test(codeNumber)) {
      einzelcodes.push(codeNumber);
    }
  }

  if (einzelcodes.length === 0) {
    return { versandart: 'unbekannt', einzelcodes: [] };
  }

  const ersteZiffer = einzelcodes[0].charAt(0);

  let versandart: VersandartTyp;
  switch (ersteZiffer) {
    case '1': versandart = 'post'; break;
    case '2': versandart = 'spedition'; break;
    case '3':
    case '4':
    case '5': versandart = 'gls'; break;
    default: versandart = 'unbekannt';
  }

  return { versandart, einzelcodes };
}

function istSperrgutArtikel(versandcodeDE: string | undefined, gewichtKg: number | undefined): boolean {
  if (gewichtKg && gewichtKg > 31.5) return true;

  const { einzelcodes, versandart } = parseVersandcode(versandcodeDE);
  if (versandart === 'spedition') return true;

  for (const code of einzelcodes) {
    const zweiteZiffer = parseInt(code.charAt(1));
    if (zweiteZiffer >= 3) return true;
  }

  return false;
}

// Excel parsen
function parseArtikellisteExcel(filePath: string): ArtikelData[] {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const artikel: ArtikelData[] = [];

  // Header finden
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (row && row[0]) {
      const firstCell = String(row[0]).toLowerCase().replace(/[\s\-]/g, '');
      // Unterstützt: "artikelnummer", "Artikel- nummer", "Art.-Nr."
      if (firstCell.includes('artikelnummer') || firstCell.includes('art.nr') || firstCell.includes('artnr')) {
        headerRowIndex = i;
        break;
      }
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Header-Zeile nicht gefunden');
  }

  const dataRows = data.slice(headerRowIndex + 1);

  for (const row of dataRows) {
    if (!row || !row[0] || String(row[0]).trim() === '') continue;

    const artikelnummer = String(row[0] || '').trim();
    const bezeichnung = String(row[1] || '').trim();
    const verpackungseinheit = String(row[2] || '').trim();
    const zolltarifnummer = String(row[3] || '').trim() || undefined;
    const ursprungsland = String(row[4] || '').trim().toUpperCase() || undefined;
    const ursprungsregion = String(row[5] || '').trim() || undefined;

    const gewichtKg = row[6] ? parseFloat(String(row[6]).replace(',', '.')) : undefined;
    const laengeCm = row[7] ? parseFloat(String(row[7]).replace(',', '.')) : undefined;
    const breiteCm = row[8] ? parseFloat(String(row[8]).replace(',', '.')) : undefined;
    const hoeheCm = row[9] ? parseFloat(String(row[9]).replace(',', '.')) : undefined;

    const ean = String(row[10] || '').trim() || undefined;
    const seiteKatalog = row[11] ? parseInt(String(row[11])) : undefined;

    const versandcodeDE = String(row[12] || '').trim() || undefined;
    const versandcodeAT = String(row[13] || '').trim() || undefined;
    const versandcodeBenelux = String(row[14] || '').trim() || undefined;

    const { versandart: versandartDE } = parseVersandcode(versandcodeDE);
    const istSperrgut = istSperrgutArtikel(versandcodeDE, gewichtKg);

    artikel.push({
      artikelnummer,
      bezeichnung: bezeichnung || artikelnummer,
      verpackungseinheit: verpackungseinheit || 'Stück',
      zolltarifnummer,
      ursprungsland,
      ursprungsregion,
      gewichtKg: isNaN(gewichtKg!) ? undefined : gewichtKg,
      laengeCm: isNaN(laengeCm!) ? undefined : laengeCm,
      breiteCm: isNaN(breiteCm!) ? undefined : breiteCm,
      hoeheCm: isNaN(hoeheCm!) ? undefined : hoeheCm,
      ean,
      seiteKatalog: isNaN(seiteKatalog!) ? undefined : seiteKatalog,
      versandcodeDE,
      versandcodeAT,
      versandcodeBenelux,
      versandartDE,
      istSperrgut,
    });
  }

  return artikel;
}

// Alle bestehenden Artikel laden
async function ladeBestehendeArtikel(): Promise<Map<string, string>> {
  const artikelMap = new Map<string, string>(); // artikelnummer -> $id
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      UNIVERSA_ARTIKEL_COLLECTION_ID,
      [Query.limit(limit), Query.offset(offset)]
    );

    for (const doc of response.documents) {
      artikelMap.set(doc.artikelnummer, doc.$id);
    }

    offset += limit;
    hasMore = response.documents.length === limit;
  }

  return artikelMap;
}

// Retry mit Backoff
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (error?.code === 429 || error?.code >= 500) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Hauptfunktion
async function main() {
  const excelPath = path.join(process.env.HOME || '', 'Downloads', 'Artikelliste 2026 - DE - AT - Benelux - 06.03.26.xlsx');

  console.log('='.repeat(60));
  console.log('Universal Artikelliste 2026 Import');
  console.log('='.repeat(60));
  console.log('');

  // Prüfe ob Datei existiert
  if (!fs.existsSync(excelPath)) {
    console.error(`Datei nicht gefunden: ${excelPath}`);
    process.exit(1);
  }

  console.log(`Datei: ${path.basename(excelPath)}`);
  console.log('');

  // Excel parsen
  console.log('Lese Excel-Datei...');
  const artikelListe = parseArtikellisteExcel(excelPath);
  console.log(`${artikelListe.length} Artikel gefunden`);
  console.log('');

  // Statistik der Versandarten
  const versandStats = { gls: 0, spedition: 0, anfrage: 0, post: 0, unbekannt: 0 };
  for (const art of artikelListe) {
    versandStats[art.versandartDE || 'unbekannt']++;
  }
  console.log('Versandarten:');
  console.log(`  GLS: ${versandStats.gls}`);
  console.log(`  Spedition: ${versandStats.spedition}`);
  console.log(`  Auf Anfrage: ${versandStats.anfrage}`);
  console.log(`  Post: ${versandStats.post}`);
  console.log(`  Unbekannt: ${versandStats.unbekannt}`);
  console.log('');

  // Bestehende Artikel laden
  console.log('Lade bestehende Artikel aus Appwrite...');
  const bestehendeArtikel = await ladeBestehendeArtikel();
  console.log(`${bestehendeArtikel.size} Artikel in Datenbank`);
  console.log('');

  // Import durchführen
  console.log('Starte Import...');
  let aktualisiert = 0;
  let neuErstellt = 0;
  let fehler = 0;

  for (let i = 0; i < artikelListe.length; i += BATCH_SIZE) {
    const batch = artikelListe.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (art) => {
      const existingId = bestehendeArtikel.get(art.artikelnummer);

      const updateData: Record<string, any> = {
        bezeichnung: art.bezeichnung,
        verpackungseinheit: art.verpackungseinheit,
        zolltarifnummer: art.zolltarifnummer ?? null,
        ursprungsland: art.ursprungsland ?? null,
        ursprungsregion: art.ursprungsregion ?? null,
        gewichtKg: art.gewichtKg ?? null,
        laengeCm: art.laengeCm ?? null,
        breiteCm: art.breiteCm ?? null,
        hoeheCm: art.hoeheCm ?? null,
        ean: art.ean ?? null,
        seiteKatalog: art.seiteKatalog ?? null,
        versandcodeDE: art.versandcodeDE ?? null,
        versandcodeAT: art.versandcodeAT ?? null,
        versandcodeBenelux: art.versandcodeBenelux ?? null,
        versandartDE: art.versandartDE ?? null,
        istSperrgut: art.istSperrgut ?? null,
      };

      try {
        if (existingId) {
          await retryWithBackoff(() =>
            databases.updateDocument(DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID, existingId, updateData)
          );
          return 'updated';
        } else {
          await retryWithBackoff(() =>
            databases.createDocument(DATABASE_ID, UNIVERSA_ARTIKEL_COLLECTION_ID, ID.unique(), {
              artikelnummer: art.artikelnummer,
              ...updateData,
              grosshaendlerPreisNetto: 0,
              katalogPreisNetto: 0,
              katalogPreisBrutto: 0,
              importDatum: new Date().toISOString(),
            })
          );
          return 'created';
        }
      } catch (err: any) {
        console.error(`  Fehler bei ${art.artikelnummer}: ${err?.message}`);
        return 'error';
      }
    });

    const results = await Promise.all(promises);

    for (const res of results) {
      if (res === 'updated') aktualisiert++;
      else if (res === 'created') neuErstellt++;
      else fehler++;
    }

    const progress = Math.min(i + BATCH_SIZE, artikelListe.length);
    process.stdout.write(`\r  Fortschritt: ${progress}/${artikelListe.length} (${aktualisiert} aktualisiert, ${neuErstellt} neu)`);

    if (i + BATCH_SIZE < artikelListe.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  console.log('\n');
  console.log('-'.repeat(60));
  console.log('Import abgeschlossen!');
  console.log('');
  console.log(`  Aktualisiert: ${aktualisiert}`);
  console.log(`  Neu erstellt: ${neuErstellt}`);
  console.log(`  Fehler: ${fehler}`);
  console.log('');
}

main().catch(console.error);
