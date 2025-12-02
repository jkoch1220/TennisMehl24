/**
 * Import-Skript für Konkurrenten aus CSV
 * 
 * Verwendung:
 * npx tsx scripts/importKonkurrenten.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import { Client, Databases, ID } from 'appwrite';
import { NeuerKonkurrent, ProduktTyp, Konkurrent } from '../src/types/konkurrent';
import { geocodeAdresse, geocodePLZ } from '../src/utils/geocoding';

// Lade Umgebungsvariablen
config();

// Appwrite-Konfiguration für Node.js
const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = 'tennismehl24_db';
const KONKURRENTEN_COLLECTION_ID = 'konkurrenten';

if (!endpoint || !projectId) {
  console.error('❌ Appwrite Konfiguration fehlt!');
  console.error('Bitte setzen Sie VITE_APPWRITE_ENDPOINT und VITE_APPWRITE_PROJECT_ID in der .env-Datei');
  process.exit(1);
}

const client = new Client();
client.setEndpoint(endpoint).setProject(projectId);
const databases = new Databases(client);

// Konkurrenten-Service für Node.js
const konkurrentService = {
  async createKonkurrent(konkurrent: NeuerKonkurrent): Promise<Konkurrent> {
    const jetzt = new Date().toISOString();
    
    const neuerKonkurrent: Konkurrent = {
      ...konkurrent,
      id: ID.unique(),
      erstelltAm: konkurrent.erstelltAm || jetzt,
      geaendertAm: konkurrent.geaendertAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        KONKURRENTEN_COLLECTION_ID,
        neuerKonkurrent.id,
        {
          data: JSON.stringify(neuerKonkurrent),
        }
      );
      
      return JSON.parse(document.data as string);
    } catch (error) {
      console.error('Fehler beim Erstellen des Konkurrenten:', error);
      throw error;
    }
  },
};

// Einfacher CSV-Parser
function parseCSV(content: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentField || currentLine.length > 0) {
        currentLine.push(currentField.trim());
        lines.push(currentLine);
        currentLine = [];
        currentField = '';
      }
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip \n after \r
      }
    } else {
      currentField += char;
    }
  }
  
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    lines.push(currentLine);
  }
  
  return lines;
}

interface CSVRow {
  Firma: string;
  'Ort / Adresse (soweit auffindbar)': string;
  'Rolle / Produkte im Bereich Tennismehl/Tennissand': string;
  'Unternehmensgröße (soweit öffentlich erkennbar)': string;
}

// Extrahiere PLZ aus Adress-String
function extractPLZ(adresse: string): { plz: string; ort: string; strasse?: string } {
  // Suche nach 5-stelliger PLZ am Anfang
  const plzMatch = adresse.match(/^(\d{5})\s+(.+)/);
  if (plzMatch) {
    const rest = plzMatch[2].trim();
    const ortTeil = rest.split(/[;,\n]/)[0].trim();
    return {
      plz: plzMatch[1],
      ort: ortTeil,
      strasse: rest.includes(',') ? rest.split(',').slice(1).join(',').trim() : undefined,
    };
  }

  // Suche nach PLZ irgendwo im Text (nicht am Ende)
  const plzMatchAnywhere = adresse.match(/(\d{5})/);
  if (plzMatchAnywhere) {
    const plz = plzMatchAnywhere[1];
    const index = adresse.indexOf(plz);
    const vorPLZ = adresse.substring(0, index).trim();
    const nachPLZ = adresse.substring(index + 5).trim();
    
    // Extrahiere Ort nach PLZ
    let ort = nachPLZ.split(/[;,\n]/)[0].trim();
    if (!ort || ort.length < 3) {
      ort = vorPLZ.split(/[;,\n]/).pop()?.trim() || '';
    }
    
    return {
      plz,
      ort: ort || '',
      strasse: vorPLZ || undefined,
    };
  }

  // Versuche bekannte Städte zu erkennen (mit verschiedenen Schreibweisen)
  const staedte: { [key: string]: string } = {
    'Marktheidenfeld': '97828',
    'Empfingen': '72186',
    'Bönnigheim': '74357',
    'Hamburg': '20095',
    'Korntal-Münchingen': '70825',
    'Korntal': '70825',
    'Münchingen': '70825',
  };

  for (const [stadt, plz] of Object.entries(staedte)) {
    if (adresse.toLowerCase().includes(stadt.toLowerCase())) {
      return { plz, ort: stadt };
    }
  }

  // Versuche Ort aus Text zu extrahieren (ignoriere "Deutsche", "Deutscher", etc.)
  const ortMatch = adresse.match(/([A-ZÄÖÜ][a-zäöüß]{2,}(?:-[A-ZÄÖÜ][a-zäöüß]+)?)/);
  if (ortMatch) {
    const ort = ortMatch[1];
    // Ignoriere generische Begriffe
    if (!['Deutsche', 'Deutscher', 'Deutsches', 'Deutschland'].includes(ort)) {
      return { plz: '', ort };
    }
  }

  return { plz: '', ort: adresse.trim() };
}

// Bestimme Produkttypen aus Beschreibung
function extractProdukte(beschreibung: string): ProduktTyp[] {
  const produkte: ProduktTyp[] = [];
  const lower = beschreibung.toLowerCase();
  
  if (lower.includes('tennismehl') || lower.includes('ziegelmehl')) {
    produkte.push('tennismehl');
  }
  if (lower.includes('tennissand') || lower.includes('tennis-sand')) {
    produkte.push('tennissand');
  }
  
  // Wenn nichts gefunden, nehmen wir beide an
  if (produkte.length === 0) {
    produkte.push('tennismehl', 'tennissand');
  }
  
  return produkte;
}

// Schätze Produktionsmenge aus Unternehmensgröße
function schaetzeProduktionsmenge(groesse: string): number | undefined {
  const lower = groesse.toLowerCase();
  
  // Große Unternehmen (300+ Mitarbeiter)
  if (lower.includes('300') || lower.includes('größer')) {
    return 10000; // 10.000 Tonnen/Jahr
  }
  
  // Mittelständler
  if (lower.includes('mittelstand') || lower.includes('mittelständler')) {
    return 5000; // 5.000 Tonnen/Jahr
  }
  
  // Kleine Unternehmen oder keine Angabe
  return 2000; // 2.000 Tonnen/Jahr (Standard)
}

async function importKonkurrenten() {
  // CSV-Datei im Downloads-Ordner des Benutzers
  const csvPath = join(process.env.HOME || '', 'Downloads', 'Firma-OrtAdressesoweitauffindbar-RolleProdukteimBereichTennismehlTennissand-Unternehmensgresoweitffentlicherkennbar.csv');
  
  console.log('📖 Lese CSV-Datei...');
  const csvContent = readFileSync(csvPath, 'utf-8');
  
  const rows = parseCSV(csvContent);
  if (rows.length === 0) {
    console.error('❌ Keine Daten gefunden');
    return;
  }
  
  // Erste Zeile sind Header
  const headers = rows[0].map(h => h.trim());
  const records: CSVRow[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = rows[i][index] || '';
    });
    records.push(row as CSVRow);
  }

  console.log(`✅ ${records.length} Einträge gefunden\n`);

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    console.log(`\n[${i + 1}/${records.length}] Verarbeite: ${row.Firma}`);
    
    // Extrahiere Adressdaten
    const adressDaten = extractPLZ(row['Ort / Adresse (soweit auffindbar)']);
    console.log(`   PLZ: ${adressDaten.plz || 'NICHT GEFUNDEN'}, Ort: ${adressDaten.ort}`);
    
    // Geocode Adresse
    let koordinaten: [number, number] | null = null;
    if (adressDaten.plz) {
      if (adressDaten.strasse) {
        koordinaten = await geocodeAdresse(
          adressDaten.strasse,
          adressDaten.plz,
          adressDaten.ort
        );
      } else {
        koordinaten = await geocodePLZ(adressDaten.plz);
      }
    } else if (adressDaten.ort) {
      // Versuche Ort zu geocodieren
      koordinaten = await geocodeAdresse('', '', adressDaten.ort);
    }
    
    if (koordinaten) {
      console.log(`   ✅ Koordinaten: [${koordinaten[0]}, ${koordinaten[1]}]`);
    } else {
      console.log(`   ⚠️ Keine Koordinaten gefunden`);
    }
    
    // Erstelle Konkurrent
    const produkte = extractProdukte(row['Rolle / Produkte im Bereich Tennismehl/Tennissand']);
    const produktionsmenge = schaetzeProduktionsmenge(row['Unternehmensgröße (soweit öffentlich erkennbar)']);
    
    const neuerKonkurrent: NeuerKonkurrent = {
      name: row.Firma,
      produkte,
      adresse: {
        strasse: adressDaten.strasse,
        plz: adressDaten.plz || '00000', // Fallback PLZ
        ort: adressDaten.ort,
        koordinaten: koordinaten || undefined,
      },
      lieferkostenModell: {
        typ: 'fest',
        festerPreisProTonne: 0, // Wird später konfiguriert
      },
      produktionsmenge,
      unternehmensgroesse: row['Unternehmensgröße (soweit öffentlich erkennbar)'],
      notizen: `Produkte: ${row['Rolle / Produkte im Bereich Tennismehl/Tennissand']}`,
    };
    
    try {
      const konkurrent = await konkurrentService.createKonkurrent(neuerKonkurrent);
      console.log(`   ✅ Konkurrent erstellt: ${konkurrent.id}`);
      
      // Rate limiting für Nominatim (max 1 Request/Sekunde)
      if (i < records.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    } catch (error) {
      console.error(`   ❌ Fehler beim Erstellen:`, error);
    }
  }
  
  console.log(`\n✅ Import abgeschlossen!`);
}

// Führe Import aus
importKonkurrenten().catch(console.error);
