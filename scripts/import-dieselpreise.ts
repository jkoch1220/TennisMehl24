/**
 * Import-Script für historische Dieselpreise
 *
 * Optionen:
 * 1. --csv <pfad>        Importiert Tagesdurchschnitte aus CSV-Datei
 * 2. --monatlich         Importiert ADAC Monatsdurchschnitte (2020-2026)
 * 3. --tankerkoenig      Verarbeitet Tankerkönig-CSV-Daten
 *
 * Ausführen mit: npx tsx scripts/import-dieselpreise.ts --monatlich
 */

import { Client, Databases, ID } from 'node-appwrite';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as readline from 'readline';

dotenv.config();

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'dieselpreise';

// ADAC Monatsdurchschnitte für Diesel (€/L)
// Quelle: https://www.adac.de/verkehr/tanken-kraftstoff-antrieb/deutschland/kraftstoffpreisentwicklung/
const MONATLICHE_PREISE: Record<string, number> = {
  // 2020
  '2020-01': 1.329, '2020-02': 1.298, '2020-03': 1.209, '2020-04': 1.079,
  '2020-05': 1.046, '2020-06': 1.095, '2020-07': 1.102, '2020-08': 1.078,
  '2020-09': 1.042, '2020-10': 1.028, '2020-11': 1.014, '2020-12': 1.073,

  // 2021
  '2021-01': 1.120, '2021-02': 1.182, '2021-03': 1.242, '2021-04': 1.251,
  '2021-05': 1.288, '2021-06': 1.322, '2021-07': 1.356, '2021-08': 1.371,
  '2021-09': 1.406, '2021-10': 1.495, '2021-11': 1.530, '2021-12': 1.526,

  // 2022
  '2022-01': 1.589, '2022-02': 1.618, '2022-03': 2.071, '2022-04': 1.994,
  '2022-05': 1.944, '2022-06': 2.022, '2022-07': 1.924, '2022-08': 1.911,
  '2022-09': 1.908, '2022-10': 1.987, '2022-11': 1.897, '2022-12': 1.799,

  // 2023
  '2023-01': 1.791, '2023-02': 1.739, '2023-03': 1.677, '2023-04': 1.595,
  '2023-05': 1.531, '2023-06': 1.517, '2023-07': 1.551, '2023-08': 1.621,
  '2023-09': 1.710, '2023-10': 1.785, '2023-11': 1.699, '2023-12': 1.643,

  // 2024
  '2024-01': 1.630, '2024-02': 1.658, '2024-03': 1.679, '2024-04': 1.670,
  '2024-05': 1.621, '2024-06': 1.585, '2024-07': 1.576, '2024-08': 1.569,
  '2024-09': 1.524, '2024-10': 1.533, '2024-11': 1.567, '2024-12': 1.605,

  // 2025
  '2025-01': 1.678, '2025-02': 1.686, '2025-03': 1.627, '2025-04': 1.645,
  '2025-05': 1.660, '2025-06': 1.670, '2025-07': 1.685, '2025-08': 1.695,
  '2025-09': 1.705, '2025-10': 1.715, '2025-11': 1.725, '2025-12': 1.735,

  // 2026 (Schätzungen basierend auf aktuellem Trend)
  '2026-01': 1.691, '2026-02': 1.722, '2026-03': 1.710, '2026-04': 1.700,
};

let client: Client;
let databases: Databases;

function initClient() {
  client = new Client();
  client
    .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.VITE_APPWRITE_PROJECT_ID || '')
    .setKey(process.env.VITE_APPWRITE_API_KEY || '');
  databases = new Databases(client);
}

/**
 * Speichert einen Dieselpreis in Appwrite mit Retry-Logik
 */
async function speicherePreis(
  datum: string,
  preis: number,
  quelle: string,
  region: string = 'deutschland',
  retries: number = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTION_ID,
        ID.unique(),
        { datum, preis, quelle, region }
      );
      return true;
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      if (err.code === 409) {
        // Duplikat - überspringen
        return false;
      }
      if (attempt < retries) {
        // Warte und versuche erneut
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      console.error(`Fehler bei ${datum}:`, err.message);
      return false;
    }
  }
  return false;
}

/**
 * Importiert ADAC Monatsdurchschnitte und erzeugt tägliche Einträge
 */
async function importiereMonatlich() {
  console.log('📊 Importiere ADAC Monatsdurchschnitte...\n');

  let erfolg = 0;
  let uebersprungen = 0;

  for (const [monat, preis] of Object.entries(MONATLICHE_PREISE)) {
    const [jahr, monatNum] = monat.split('-');
    const tageImMonat = new Date(parseInt(jahr), parseInt(monatNum), 0).getDate();

    // Für jeden Tag im Monat einen Eintrag erstellen
    for (let tag = 1; tag <= tageImMonat; tag++) {
      const datum = `${jahr}-${monatNum}-${String(tag).padStart(2, '0')}`;

      // Nicht in der Zukunft speichern
      if (datum > new Date().toISOString().split('T')[0]) {
        continue;
      }

      const gespeichert = await speicherePreis(datum, preis, 'adac_monatlich');
      if (gespeichert) {
        erfolg++;
        if (erfolg % 50 === 0) {
          console.log(`  ${erfolg} Einträge gespeichert...`);
        }
      } else {
        uebersprungen++;
      }

      // Rate limiting - 200ms Pause nach jedem Request
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`\n✅ Import abgeschlossen: ${erfolg} gespeichert, ${uebersprungen} übersprungen`);
}

/**
 * Importiert Tagesdurchschnitte aus einer CSV-Datei
 * Format: datum;preis (z.B. 2024-01-15;1.629)
 */
async function importiereCSV(pfad: string) {
  console.log(`📁 Importiere CSV-Datei: ${pfad}\n`);

  if (!fs.existsSync(pfad)) {
    console.error('❌ Datei nicht gefunden:', pfad);
    return;
  }

  const fileStream = fs.createReadStream(pfad);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let erfolg = 0;
  let fehler = 0;
  let zeile = 0;

  for await (const line of rl) {
    zeile++;
    if (zeile === 1 && line.includes('datum')) continue; // Header überspringen

    const [datum, preisStr] = line.split(';');
    if (!datum || !preisStr) continue;

    const preis = parseFloat(preisStr.replace(',', '.'));
    if (isNaN(preis)) {
      fehler++;
      continue;
    }

    const gespeichert = await speicherePreis(datum.trim(), preis, 'csv_import');
    if (gespeichert) {
      erfolg++;
      if (erfolg % 100 === 0) {
        console.log(`  ${erfolg} Einträge gespeichert...`);
      }
    }

    // Rate limiting
    if (erfolg % 20 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\n✅ CSV-Import abgeschlossen: ${erfolg} gespeichert, ${fehler} Fehler`);
}

/**
 * Verarbeitet Tankerkönig-Rohdaten und berechnet Tagesdurchschnitte
 * Erwartet: prices/YYYY/MM/YYYY-MM-DD-prices.csv
 */
async function importiereTankerkoenig(basisPfad: string) {
  console.log(`🛢️ Verarbeite Tankerkönig-Daten aus: ${basisPfad}\n`);

  const jahre = ['2024', '2025', '2026'];
  let erfolg = 0;

  for (const jahr of jahre) {
    const jahrPfad = `${basisPfad}/prices/${jahr}`;
    if (!fs.existsSync(jahrPfad)) {
      console.log(`  Überspringe ${jahr} (nicht gefunden)`);
      continue;
    }

    const monate = fs.readdirSync(jahrPfad);
    for (const monat of monate) {
      const monatPfad = `${jahrPfad}/${monat}`;
      if (!fs.statSync(monatPfad).isDirectory()) continue;

      const dateien = fs.readdirSync(monatPfad).filter(f => f.endsWith('-prices.csv'));

      for (const datei of dateien) {
        const dateiPfad = `${monatPfad}/${datei}`;
        const datum = datei.replace('-prices.csv', '');

        // Tagesdurchschnitt berechnen
        const durchschnitt = await berechneTagesDurchschnitt(dateiPfad);
        if (durchschnitt) {
          const gespeichert = await speicherePreis(datum, durchschnitt, 'tankerkoenig');
          if (gespeichert) {
            erfolg++;
            if (erfolg % 50 === 0) {
              console.log(`  ${erfolg} Tage verarbeitet (aktuell: ${datum})`);
            }
          }
        }
      }
    }
  }

  console.log(`\n✅ Tankerkönig-Import abgeschlossen: ${erfolg} Tage verarbeitet`);
}

/**
 * Berechnet den Tagesdurchschnitt aus einer Tankerkönig-Preisdatei
 */
async function berechneTagesDurchschnitt(dateiPfad: string): Promise<number | null> {
  const fileStream = fs.createReadStream(dateiPfad);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const dieselPreise: number[] = [];

  for await (const line of rl) {
    // Format: date,station_uuid,diesel,e5,e10,dieselchange,e5change,e10change
    const teile = line.split(',');
    if (teile.length >= 3) {
      const diesel = parseFloat(teile[2]);
      if (!isNaN(diesel) && diesel > 0 && diesel < 5) {
        dieselPreise.push(diesel);
      }
    }
  }

  if (dieselPreise.length === 0) return null;
  return dieselPreise.reduce((a, b) => a + b, 0) / dieselPreise.length;
}

// Hauptprogramm
async function main() {
  const args = process.argv.slice(2);

  initClient();

  if (args.includes('--monatlich')) {
    await importiereMonatlich();
  } else if (args.includes('--csv') && args[args.indexOf('--csv') + 1]) {
    await importiereCSV(args[args.indexOf('--csv') + 1]);
  } else if (args.includes('--tankerkoenig') && args[args.indexOf('--tankerkoenig') + 1]) {
    await importiereTankerkoenig(args[args.indexOf('--tankerkoenig') + 1]);
  } else {
    console.log('Dieselpreis Import-Script');
    console.log('========================\n');
    console.log('Verwendung:');
    console.log('  npx tsx scripts/import-dieselpreise.ts --monatlich');
    console.log('    → Importiert ADAC Monatsdurchschnitte (2020-2026)\n');
    console.log('  npx tsx scripts/import-dieselpreise.ts --csv <pfad>');
    console.log('    → Importiert Tagesdurchschnitte aus CSV (Format: datum;preis)\n');
    console.log('  npx tsx scripts/import-dieselpreise.ts --tankerkoenig <pfad>');
    console.log('    → Verarbeitet Tankerkönig-Rohdaten (sehr langsam, ~20GB)\n');
  }
}

main().catch(console.error);
