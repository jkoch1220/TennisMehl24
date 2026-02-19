/**
 * Prüfe K.S.D Platzbauerprojekt Status
 * Führe aus mit: npx tsx scripts/check-ksd-projekt.ts
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.VITE_APPWRITE_API_KEY!);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';
const SAISON_DATEN_COLLECTION_ID = 'saison_daten';
const PROJEKTE_COLLECTION_ID = 'projekte';
const PLATZBAUER_PROJEKTE_COLLECTION_ID = 'platzbauer_projekte';
const PROJEKT_ZUORDNUNGEN_COLLECTION_ID = 'projekt_zuordnungen';

const KSD_PLATZBAUER_ID = '6938564f002e3348542c';
const KSD_PLATZBAUERPROJEKT_ID = '696f4ccd0001faedce54';

function parseDocument<T>(doc: any): T {
  if (doc?.data && typeof doc.data === 'string') {
    try {
      return { ...JSON.parse(doc.data), id: doc.$id, $id: doc.$id };
    } catch {
      return { id: doc.$id, $id: doc.$id } as T;
    }
  }
  return { id: doc.$id, $id: doc.$id } as T;
}

async function main() {
  console.log('🔍 Prüfe K.S.D Platzbauerprojekt...\n');

  try {
    // 1. Platzbauerprojekt laden
    console.log('📦 Platzbauerprojekt:');
    const pbProjekt = await databases.getDocument(
      DATABASE_ID,
      PLATZBAUER_PROJEKTE_COLLECTION_ID,
      KSD_PLATZBAUERPROJEKT_ID
    );
    const pbData = parseDocument<any>(pbProjekt);
    console.log(`   ID: ${pbProjekt.$id}`);
    console.log(`   Name: ${pbData.platzbauerName || pbData.projektName}`);
    console.log(`   Status: ${pbData.status}`);
    console.log(`   Saisonjahr: ${pbData.saisonjahr}`);

    // 2. Alle Zuordnungen laden
    console.log('\n📦 Projekt-Zuordnungen:');
    const zuordnungen = await databases.listDocuments(
      DATABASE_ID,
      PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
      [Query.equal('platzbauerprojektId', KSD_PLATZBAUERPROJEKT_ID), Query.limit(100)]
    );
    console.log(`   Anzahl: ${zuordnungen.documents.length}`);

    // 3. Alle Vereinsprojekte mit K.S.D laden
    console.log('\n📦 Vereinsprojekte mit K.S.D:');
    const alleProjekte = await databases.listDocuments(
      DATABASE_ID,
      PROJEKTE_COLLECTION_ID,
      [Query.limit(5000)]
    );

    const ksdProjekte = alleProjekte.documents
      .map(d => parseDocument<any>(d))
      .filter(p => p.platzbauerId === KSD_PLATZBAUER_ID || p.zugeordnetesPlatzbauerprojektId === KSD_PLATZBAUERPROJEKT_ID);

    console.log(`   Anzahl: ${ksdProjekte.length}`);

    // 4. Alle Vereine mit K.S.D als Platzbauer
    console.log('\n📦 Vereine mit K.S.D als Standard-Platzbauer:');
    const alleKunden = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    const ksdVereine = alleKunden.documents
      .map(d => parseDocument<any>(d))
      .filter(k => k.typ === 'verein' && k.standardPlatzbauerId === KSD_PLATZBAUER_ID);

    console.log(`   Anzahl: ${ksdVereine.length}`);

    // 5. SaisonDaten 2026 für K.S.D Vereine
    console.log('\n📦 SaisonDaten 2026 für K.S.D Vereine:');
    const alleSaisonDaten = await databases.listDocuments(
      DATABASE_ID,
      SAISON_DATEN_COLLECTION_ID,
      [Query.equal('saisonjahr', 2026), Query.limit(5000)]
    );

    const ksdSaisonDaten = alleSaisonDaten.documents
      .map(d => parseDocument<any>(d))
      .filter(sd => sd.platzbauerId === KSD_PLATZBAUER_ID);

    console.log(`   Anzahl: ${ksdSaisonDaten.length}`);

    // 6. Detaillierte Übersicht
    console.log('\n' + '='.repeat(80));
    console.log('📊 DETAILLIERTE ÜBERSICHT');
    console.log('='.repeat(80));

    // Sammle alle Daten
    const zuordnungMap = new Map<string, any>();
    for (const z of zuordnungen.documents) {
      const zData = parseDocument<any>(z);
      zuordnungMap.set(zData.vereinsProjektId, zData);
    }

    let gesamtMenge = 0;
    const vereineOhneProjekt: any[] = [];
    const vereineOhneZuordnung: any[] = [];

    console.log('\n🏟️ Vereine im K.S.D Platzbauerprojekt:\n');
    console.log('Name'.padEnd(40) + 'Menge (t)'.padStart(12) + 'Projekt'.padStart(10) + 'Zuordnung'.padStart(12));
    console.log('-'.repeat(74));

    for (const verein of ksdVereine) {
      // Finde SaisonDaten
      const saisonDaten = ksdSaisonDaten.find(sd => sd.kundeId === verein.$id);
      const menge = saisonDaten?.angefragteMenge || 0;
      gesamtMenge += menge;

      // Finde Projekt
      const projekt = ksdProjekte.find(p => p.kundeId === verein.$id);
      const hatProjekt = projekt ? '✅' : '❌';

      // Finde Zuordnung
      const hatZuordnung = projekt && zuordnungMap.has(projekt.$id) ? '✅' : '❌';

      console.log(
        (verein.name || 'Unbekannt').substring(0, 38).padEnd(40) +
        menge.toString().padStart(12) +
        hatProjekt.padStart(10) +
        hatZuordnung.padStart(12)
      );

      if (!projekt) vereineOhneProjekt.push(verein);
      if (projekt && !zuordnungMap.has(projekt.$id)) vereineOhneZuordnung.push({ verein, projekt });
    }

    console.log('-'.repeat(74));
    console.log('GESAMT'.padEnd(40) + gesamtMenge.toString().padStart(12) + ' t');

    // Probleme anzeigen
    if (vereineOhneProjekt.length > 0) {
      console.log('\n⚠️ VEREINE OHNE PROJEKT:');
      for (const v of vereineOhneProjekt) {
        console.log(`   - ${v.name} (${v.$id})`);
      }
    }

    if (vereineOhneZuordnung.length > 0) {
      console.log('\n⚠️ PROJEKTE OHNE ZUORDNUNG ZUM PLATZBAUERPROJEKT:');
      for (const { verein, projekt } of vereineOhneZuordnung) {
        console.log(`   - ${verein.name} → Projekt ${projekt.$id}`);
      }
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
