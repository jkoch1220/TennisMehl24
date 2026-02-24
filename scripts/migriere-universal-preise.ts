/**
 * Migration-Script: Universal-Artikel Brutto → Netto Preise
 *
 * Dieses Script migriert alle bestehenden Dokumente mit Universal-Artikeln:
 * - Findet Positionen mit `beschreibung.startsWith('Universal:')`
 * - Rechnet `einzelpreis` von Brutto auf Netto um (/ 1.19)
 * - Setzt `istUniversalArtikel: true` für zukünftige Filterung
 * - Aktualisiert `gesamtpreis` entsprechend
 * - KEINE ÄNDERUNG an `einkaufspreis` (bleibt Netto wie bisher)
 *
 * Führe aus mit: npx tsx scripts/migriere-universal-preise.ts
 *
 * Optionen:
 *   --dry-run    Zeigt nur Änderungen an, ohne sie durchzuführen
 *   --verbose    Zeigt detaillierte Informationen für jede Position
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';

// CLI-Argumente
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

interface Position {
  id: string;
  artikelnummer?: string;
  bezeichnung: string;
  beschreibung?: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  einkaufspreis?: number;
  gesamtpreis: number;
  istUniversalArtikel?: boolean;
  [key: string]: unknown;
}

interface DokumentDaten {
  positionen?: Position[];
  [key: string]: unknown;
}

// Hilfsfunktion: Rundet auf 2 Dezimalstellen
function rundeAufCent(wert: number): number {
  return Math.round(wert * 100) / 100;
}

// Hilfsfunktion: Prüft ob Position ein Universal-Artikel ist
function istUniversalPosition(position: Position): boolean {
  // Bereits migriert?
  if (position.istUniversalArtikel === true) return false; // Nicht erneut migrieren
  // Universal-Beschreibung?
  if (position.beschreibung?.startsWith('Universal:')) return true;
  return false;
}

async function migriere() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔄 Universal-Artikel Preis-Migration (Brutto → Netto)');
  console.log('═══════════════════════════════════════════════════════════════');

  if (DRY_RUN) {
    console.log('\n  ⚠️  DRY-RUN MODUS: Keine Änderungen werden gespeichert!\n');
  }

  console.log('📦 Lade alle Dokumente...\n');

  try {
    // Lade alle Dokumente (paginiert)
    let alleDokumente: any[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await databases.listDocuments(
        DATABASE_ID,
        DOKUMENTE_COLLECTION_ID,
        [Query.limit(limit), Query.offset(offset)]
      );

      alleDokumente = alleDokumente.concat(response.documents);

      if (response.documents.length < limit) break;
      offset += limit;
    }

    console.log(`✅ ${alleDokumente.length} Dokumente gefunden\n`);

    let dokumenteMigriert = 0;
    let positionenMigriert = 0;
    let dokumenteOhneAenderung = 0;
    let fehler = 0;
    let gesamtDifferenz = 0;

    for (const doc of alleDokumente) {
      try {
        // Parse das daten-Feld
        if (!doc.daten) {
          continue;
        }

        let daten: DokumentDaten;
        try {
          daten = JSON.parse(doc.daten);
        } catch {
          continue; // Ungültiges JSON, überspringen
        }

        if (!daten.positionen || !Array.isArray(daten.positionen)) {
          continue;
        }

        // Finde Universal-Positionen die migriert werden müssen
        let hatAenderungen = false;
        let dokumentPositionenMigriert = 0;

        for (const position of daten.positionen) {
          if (istUniversalPosition(position)) {
            const alterPreis = position.einzelpreis;
            const neuerPreis = rundeAufCent(alterPreis / 1.19);
            const differenz = alterPreis - neuerPreis;

            if (VERBOSE) {
              console.log(`  📍 ${position.bezeichnung}`);
              console.log(`     Artikelnr.: ${position.artikelnummer || '-'}`);
              console.log(`     Alter Preis (Brutto): ${alterPreis.toFixed(2)} €`);
              console.log(`     Neuer Preis (Netto):  ${neuerPreis.toFixed(2)} €`);
              console.log(`     Differenz: -${differenz.toFixed(2)} €`);
              console.log('');
            }

            // Migriere
            position.einzelpreis = neuerPreis;
            position.gesamtpreis = rundeAufCent(neuerPreis * position.menge);
            position.istUniversalArtikel = true;

            hatAenderungen = true;
            dokumentPositionenMigriert++;
            gesamtDifferenz += differenz * position.menge;
          }
        }

        if (hatAenderungen) {
          if (!DRY_RUN) {
            // Speichere das aktualisierte Dokument
            await databases.updateDocument(
              DATABASE_ID,
              DOKUMENTE_COLLECTION_ID,
              doc.$id,
              {
                daten: JSON.stringify(daten)
              }
            );
          }

          console.log(`✅ Dokument ${doc.dokumentNummer || doc.$id}: ${dokumentPositionenMigriert} Position(en) migriert`);
          dokumenteMigriert++;
          positionenMigriert += dokumentPositionenMigriert;
        } else {
          dokumenteOhneAenderung++;
        }

      } catch (err) {
        console.error(`❌ Fehler bei Dokument ${doc.$id}:`, err);
        fehler++;
      }
    }

    // Zusammenfassung
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  📊 ZUSAMMENFASSUNG');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  📄 Dokumente gesamt:        ${alleDokumente.length}`);
    console.log(`  ✅ Dokumente migriert:      ${dokumenteMigriert}`);
    console.log(`  📍 Positionen migriert:     ${positionenMigriert}`);
    console.log(`  ⏭️  Dokumente unverändert:   ${dokumenteOhneAenderung}`);
    console.log(`  ❌ Fehler:                  ${fehler}`);
    console.log(`  💰 Preisdifferenz gesamt:   -${gesamtDifferenz.toFixed(2)} €`);
    console.log('═══════════════════════════════════════════════════════════════');

    if (DRY_RUN && dokumenteMigriert > 0) {
      console.log('\n  ℹ️  Um die Migration durchzuführen, führe das Script ohne --dry-run aus.');
    }

  } catch (err) {
    console.error('❌ Kritischer Fehler:', err);
    process.exit(1);
  }
}

migriere();
