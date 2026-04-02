/**
 * Migration: Projekt-Status basierend auf vorhandenen Dokumentnummern aktualisieren
 *
 * WICHTIG: Die projekte Collection speichert die meisten Felder im "data" JSON-Feld!
 * - Nur kundeId, kundenname, saisonjahr, status, erstelltAm, geaendertAm sind direkte Felder
 * - lieferscheinnummer, rechnungsnummer, etc. sind im data-JSON
 *
 * Logik (prüft data-Feld):
 * - Hat rechnungsnummer → Status 'rechnung'
 * - Hat lieferscheinnummer (aber keine Rechnung) → Status 'lieferschein'
 * - Hat auftragsbestaetigungsnummer (aber keinen LS/Rechnung) → Status 'auftragsbestaetigung'
 *
 * Ausführen mit: npx tsx scripts/migriere-projekt-status.ts
 * Dry-Run:       npx tsx scripts/migriere-projekt-status.ts --dry-run
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE_COLLECTION_ID = 'projekte';

interface ProjektData {
  // Dokumentnummern
  angebotsnummer?: string;
  auftragsbestaetigungsnummer?: string;
  lieferscheinnummer?: string;
  rechnungsnummer?: string;
  // ... andere Felder
  [key: string]: unknown;
}

interface ProjektDocument {
  $id: string;
  kundenname?: string;
  status: string;
  saisonjahr?: number;
  data: string; // JSON-String mit allen anderen Daten
}

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
 * Parst das data-Feld eines Projekts
 */
function parseDataField(dataString: string): ProjektData {
  try {
    return JSON.parse(dataString) as ProjektData;
  } catch {
    return {};
  }
}

/**
 * Lädt alle Projekte aus der Datenbank
 */
async function ladeAlleProjekte(): Promise<ProjektDocument[]> {
  const alleProjekte: ProjektDocument[] = [];
  let offset = 0;
  const limit = 100;

  console.log('📁 Lade alle Projekte...');

  while (true) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      PROJEKTE_COLLECTION_ID,
      [
        Query.limit(limit),
        Query.offset(offset),
      ]
    );

    alleProjekte.push(...(response.documents as unknown as ProjektDocument[]));

    if (response.documents.length < limit) {
      break;
    }
    offset += limit;
  }

  console.log(`   ${alleProjekte.length} Projekte geladen`);
  return alleProjekte;
}

/**
 * Bestimmt den korrekten Status basierend auf Dokumentnummern im data-Feld
 */
function bestimmeKorrektenStatus(data: ProjektData): { status: string | null; grund: string } {
  // Prüfe von höchstem zu niedrigstem Dokument
  if (data.rechnungsnummer) {
    return { status: 'rechnung', grund: `Hat Rechnung ${data.rechnungsnummer}` };
  }
  if (data.lieferscheinnummer) {
    return { status: 'lieferschein', grund: `Hat Lieferschein ${data.lieferscheinnummer}` };
  }
  if (data.auftragsbestaetigungsnummer) {
    return { status: 'auftragsbestaetigung', grund: `Hat AB ${data.auftragsbestaetigungsnummer}` };
  }
  if (data.angebotsnummer) {
    return { status: 'angebot_versendet', grund: `Hat Angebot ${data.angebotsnummer}` };
  }
  return { status: null, grund: '' };
}

/**
 * Gibt die Hierarchie-Stufe für einen Projektstatus zurück
 */
function getStatusHierarchie(status: string): number {
  const hierarchie: Record<string, number> = {
    'angebot': 1,
    'angebot_versendet': 2,
    'auftragsbestaetigung': 3,
    'lieferschein': 4,
    'rechnung': 5,
    'bezahlt': 6,
    'verloren': 0, // Sonderfall
  };
  return hierarchie[status] || 0;
}

/**
 * Hauptmigration
 */
async function migriere(dryRun: boolean) {
  console.log('\n🚀 Projekt-Status Migration (basierend auf data-Feld Dokumentnummern)');
  console.log('====================================================================\n');

  if (dryRun) {
    console.log('⚠️  DRY-RUN MODUS - Keine Änderungen werden durchgeführt\n');
  }

  initClient();

  // Lade alle Projekte
  const projekte = await ladeAlleProjekte();

  // Statistiken
  const statistik = {
    geprueft: 0,
    mitLieferschein: 0,
    mitRechnung: 0,
    aktualisiert: 0,
    uebersprungen: 0,
    fehler: 0,
    nachTyp: {} as Record<string, number>,
  };

  // Projekte die aktualisiert werden sollen
  const zuAktualisieren: Array<{
    projekt: ProjektDocument;
    alterStatus: string;
    neuerStatus: string;
    grund: string;
  }> = [];

  // Prüfe jedes Projekt
  for (const projekt of projekte) {
    statistik.geprueft++;

    // Parse das data-Feld
    const data = parseDataField(projekt.data);

    // Zähle für Statistik
    if (data.lieferscheinnummer) statistik.mitLieferschein++;
    if (data.rechnungsnummer) statistik.mitRechnung++;

    // Überspringe bereits bezahlte oder verlorene Projekte
    if (projekt.status === 'bezahlt' || projekt.status === 'verloren') {
      statistik.uebersprungen++;
      continue;
    }

    // Bestimme korrekten Status basierend auf Dokumentnummern
    const { status: korrekterStatus, grund } = bestimmeKorrektenStatus(data);
    if (!korrekterStatus) {
      statistik.uebersprungen++;
      continue;
    }

    // Prüfe ob Update nötig
    const hierarchieAlt = getStatusHierarchie(projekt.status);
    const hierarchieNeu = getStatusHierarchie(korrekterStatus);

    // Nur aktualisieren wenn neuer Status "höher" ist
    if (hierarchieNeu > hierarchieAlt) {
      zuAktualisieren.push({
        projekt,
        alterStatus: projekt.status,
        neuerStatus: korrekterStatus,
        grund,
      });
    }
  }

  // Zeige Statistik
  console.log('📊 Analyse:\n');
  console.log(`   Geprüft:           ${statistik.geprueft}`);
  console.log(`   Mit Lieferschein:  ${statistik.mitLieferschein}`);
  console.log(`   Mit Rechnung:      ${statistik.mitRechnung}`);

  // Zeige geplante Änderungen
  console.log('\n📝 Geplante Änderungen:\n');

  if (zuAktualisieren.length === 0) {
    console.log('   Keine Änderungen erforderlich - alle Projekte sind bereits korrekt.\n');
    return;
  }

  // Gruppiere nach Status-Änderung
  const nachAenderung = new Map<string, typeof zuAktualisieren>();
  for (const item of zuAktualisieren) {
    const key = `${item.alterStatus} → ${item.neuerStatus}`;
    const existing = nachAenderung.get(key) || [];
    existing.push(item);
    nachAenderung.set(key, existing);
  }

  for (const [aenderung, items] of nachAenderung) {
    console.log(`   ${aenderung}: ${items.length} Projekte`);
    // Zeige erste 10 Beispiele
    for (const item of items.slice(0, 10)) {
      console.log(`      - ${item.projekt.kundenname || item.projekt.$id} (${item.grund})`);
    }
    if (items.length > 10) {
      console.log(`      ... und ${items.length - 10} weitere`);
    }
  }

  console.log(`\n   GESAMT: ${zuAktualisieren.length} Projekte werden aktualisiert\n`);

  // Führe Updates durch (wenn kein Dry-Run)
  if (!dryRun) {
    console.log('🔄 Führe Updates durch...\n');

    for (const item of zuAktualisieren) {
      try {
        await databases.updateDocument(
          DATABASE_ID,
          PROJEKTE_COLLECTION_ID,
          item.projekt.$id,
          { status: item.neuerStatus }
        );
        statistik.aktualisiert++;

        // Zähle nach Typ
        const key = `${item.alterStatus} → ${item.neuerStatus}`;
        statistik.nachTyp[key] = (statistik.nachTyp[key] || 0) + 1;

        if (statistik.aktualisiert % 50 === 0) {
          console.log(`   ${statistik.aktualisiert} / ${zuAktualisieren.length} aktualisiert...`);
        }

        // Rate limiting
        if (statistik.aktualisiert % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Fehler bei ${item.projekt.kundenname || item.projekt.$id}:`, error);
        statistik.fehler++;
      }
    }
  }

  // Zusammenfassung
  console.log('\n====================================================================');
  console.log('📊 ZUSAMMENFASSUNG\n');
  console.log(`   Geprüft:      ${statistik.geprueft}`);
  console.log(`   Aktualisiert: ${dryRun ? '(Dry-Run)' : statistik.aktualisiert}`);
  console.log(`   Übersprungen: ${statistik.uebersprungen}`);
  console.log(`   Fehler:       ${statistik.fehler}`);

  if (!dryRun && Object.keys(statistik.nachTyp).length > 0) {
    console.log('\n   Nach Änderungstyp:');
    for (const [typ, anzahl] of Object.entries(statistik.nachTyp)) {
      console.log(`      ${typ}: ${anzahl}`);
    }
  }

  console.log('\n✅ Migration abgeschlossen!\n');
}

// Hauptprogramm
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

migriere(dryRun).catch(console.error);
