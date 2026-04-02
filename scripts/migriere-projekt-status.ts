/**
 * Migration: Projekt-Status basierend auf vorhandenen Dokumenten aktualisieren
 *
 * Logik:
 * - Hat Rechnung → Status 'rechnung'
 * - Hat Lieferschein (aber keine Rechnung) → Status 'lieferschein'
 * - Hat AB (aber keinen Lieferschein/Rechnung) → Status 'auftragsbestaetigung'
 *
 * Ausführen mit: npx tsx scripts/migriere-projekt-status.ts
 * Dry-Run:       npx tsx scripts/migriere-projekt-status.ts --dry-run
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE_COLLECTION_ID = 'projekte';
const DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';

// Dokument-Hierarchie (höchster Wert = höchster Status)
const DOKUMENT_HIERARCHIE: Record<string, number> = {
  'angebot': 1,
  'auftragsbestaetigung': 2,
  'lieferschein': 3,
  'rechnung': 4,
  'stornorechnung': 4, // Gleiche Stufe wie Rechnung
  'proformarechnung': 3, // Gleiche Stufe wie Lieferschein
};

// Mapping von Dokumenttyp zu Projektstatus
const DOKUMENT_ZU_STATUS: Record<string, string> = {
  'angebot': 'angebot_versendet',
  'auftragsbestaetigung': 'auftragsbestaetigung',
  'lieferschein': 'lieferschein',
  'rechnung': 'rechnung',
  'stornorechnung': 'rechnung',
  'proformarechnung': 'lieferschein',
};

interface Dokument {
  $id: string;
  projektId: string;
  dokumentTyp: string;
  dokumentNummer?: string;
  $createdAt: string;
}

interface Projekt {
  $id: string;
  kundenname?: string;
  status: string;
  saisonjahr?: string;
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
 * Lädt alle Dokumente aus der Datenbank
 */
async function ladeAlleDokumente(): Promise<Dokument[]> {
  const alleDokumente: Dokument[] = [];
  let offset = 0;
  const limit = 100;

  console.log('📄 Lade alle Dokumente...');

  while (true) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      DOKUMENTE_COLLECTION_ID,
      [
        Query.limit(limit),
        Query.offset(offset),
      ]
    );

    alleDokumente.push(...(response.documents as unknown as Dokument[]));

    if (response.documents.length < limit) {
      break;
    }
    offset += limit;
  }

  console.log(`   ${alleDokumente.length} Dokumente geladen`);
  return alleDokumente;
}

/**
 * Lädt alle Projekte aus der Datenbank
 */
async function ladeAlleProjekte(): Promise<Projekt[]> {
  const alleProjekte: Projekt[] = [];
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

    alleProjekte.push(...(response.documents as unknown as Projekt[]));

    if (response.documents.length < limit) {
      break;
    }
    offset += limit;
  }

  console.log(`   ${alleProjekte.length} Projekte geladen`);
  return alleProjekte;
}

/**
 * Gruppiert Dokumente nach Projekt-ID
 */
function gruppiereDokumenteNachProjekt(dokumente: Dokument[]): Map<string, Dokument[]> {
  const gruppiert = new Map<string, Dokument[]>();

  for (const dok of dokumente) {
    if (!dok.projektId) continue;

    const existing = gruppiert.get(dok.projektId) || [];
    existing.push(dok);
    gruppiert.set(dok.projektId, existing);
  }

  return gruppiert;
}

/**
 * Bestimmt den höchsten Dokumenttyp für ein Projekt
 */
function bestimmeHoechstenDokumentTyp(dokumente: Dokument[]): string | null {
  let hoechsterTyp: string | null = null;
  let hoechsteHierarchie = 0;

  for (const dok of dokumente) {
    const hierarchie = DOKUMENT_HIERARCHIE[dok.dokumentTyp] || 0;
    if (hierarchie > hoechsteHierarchie) {
      hoechsteHierarchie = hierarchie;
      hoechsterTyp = dok.dokumentTyp;
    }
  }

  return hoechsterTyp;
}

/**
 * Hauptmigration
 */
async function migriere(dryRun: boolean) {
  console.log('\n🚀 Projekt-Status Migration');
  console.log('============================\n');

  if (dryRun) {
    console.log('⚠️  DRY-RUN MODUS - Keine Änderungen werden durchgeführt\n');
  }

  initClient();

  // Lade alle Daten
  const dokumente = await ladeAlleDokumente();
  const projekte = await ladeAlleProjekte();

  // Gruppiere Dokumente nach Projekt
  const dokumenteProProjekt = gruppiereDokumenteNachProjekt(dokumente);

  console.log(`\n📊 ${dokumenteProProjekt.size} Projekte haben mindestens ein Dokument\n`);

  // Statistiken
  const statistik = {
    geprüft: 0,
    aktualisiert: 0,
    uebersprungen: 0,
    fehler: 0,
    nachTyp: {} as Record<string, number>,
  };

  // Projekte die aktualisiert werden sollen
  const zuAktualisieren: Array<{
    projekt: Projekt;
    alterStatus: string;
    neuerStatus: string;
    grund: string;
  }> = [];

  // Prüfe jedes Projekt mit Dokumenten
  for (const [projektId, projektDokumente] of dokumenteProProjekt) {
    statistik.geprüft++;

    // Finde das Projekt
    const projekt = projekte.find(p => p.$id === projektId);
    if (!projekt) {
      console.log(`⚠️  Projekt ${projektId} nicht gefunden (${projektDokumente.length} Dokumente)`);
      statistik.uebersprungen++;
      continue;
    }

    // Überspringe bereits bezahlte oder verlorene Projekte
    if (projekt.status === 'bezahlt' || projekt.status === 'verloren') {
      statistik.uebersprungen++;
      continue;
    }

    // Bestimme höchsten Dokumenttyp
    const hoechsterTyp = bestimmeHoechstenDokumentTyp(projektDokumente);
    if (!hoechsterTyp) {
      statistik.uebersprungen++;
      continue;
    }

    // Bestimme neuen Status
    const neuerStatus = DOKUMENT_ZU_STATUS[hoechsterTyp];
    if (!neuerStatus) {
      statistik.uebersprungen++;
      continue;
    }

    // Prüfe ob Update nötig
    const hierarchieAlt = getStatusHierarchie(projekt.status);
    const hierarchieNeu = getStatusHierarchie(neuerStatus);

    // Nur aktualisieren wenn neuer Status "höher" ist
    if (hierarchieNeu > hierarchieAlt) {
      zuAktualisieren.push({
        projekt,
        alterStatus: projekt.status,
        neuerStatus,
        grund: `Hat ${hoechsterTyp}`,
      });
    }
  }

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
    // Zeige erste 5 Beispiele
    for (const item of items.slice(0, 5)) {
      console.log(`      - ${item.projekt.kundenname || item.projekt.$id} (${item.grund})`);
    }
    if (items.length > 5) {
      console.log(`      ... und ${items.length - 5} weitere`);
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
  console.log('\n============================');
  console.log('📊 ZUSAMMENFASSUNG\n');
  console.log(`   Geprüft:      ${statistik.geprüft}`);
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

// Hauptprogramm
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

migriere(dryRun).catch(console.error);
