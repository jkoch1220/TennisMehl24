/**
 * Cleanup K.S.D Duplikate
 * Führe aus mit: npx tsx scripts/cleanup-ksd-duplicates.ts
 *
 * Dieses Script bereinigt die durch den K.S.D-Import erstellten Duplikate:
 * 1. TC Rot-Weiß Miltenberg - Neu auf Alt übertragen, Neu löschen
 * 2. HTC Würzburg - Neu löschen (Original war bereits "direkt")
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';
const SAISON_DATEN_COLLECTION_ID = 'saison_daten';
const SAISON_BEZIEHUNGEN_COLLECTION_ID = 'saison_beziehungen';
const PROJEKTE_COLLECTION_ID = 'projekte';
const PROJEKT_ZUORDNUNGEN_COLLECTION_ID = 'projekt_zuordnungen';

// Duplikate aus meinem K.S.D-Import
const DUPLIKATE = {
  'TC Rot-Weiß Miltenberg': {
    originalId: '693863e5002c9c90d2db',      // Dec 2025 - ohne Platzbauer
    neuesId: '69933fe800358e67acf2',         // Feb 2026 - mit K.S.D (mein Import)
    aktion: 'merge_to_original',              // Auf Original übertragen, dann löschen
    neuePlatzbauerId: '6938564f002e3348542c', // K.S.D
    neuerBezugsweg: 'ueber_platzbauer',
  },
  'HTC Würzburg': {
    originalId: '69386e1c000ae5301e24',       // Dec 2025 - HTC Würzburg e.V.
    neuesId: '69934080000e36872d92',          // Feb 2026 - HTC Würzburg (mein Import)
    aktion: 'delete_new_only',                // Nur Neues löschen - Original bleibt "direkt"
    neuePlatzbauerId: null,                   // Bleibt ohne Platzbauer
    neuerBezugsweg: 'direkt',                 // Bleibt "direkt" (bestellt selbst)
  }
};

const RICHTIGER_PLATZBAUER_ID = '6938564f002e3348542c';
const PLATZBAUERPROJEKT_ID = '696f4ccd0001faedce54'; // K.S.D Platzbauerprojekt 2026

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
  console.log('🧹 Starte Duplikat-Bereinigung...\n');
  const jetzt = new Date().toISOString();

  try {
    for (const [name, config] of Object.entries(DUPLIKATE)) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📌 Bearbeite: ${name}`);
      console.log(`   Original-ID: ${config.originalId}`);
      console.log(`   Neu-ID: ${config.neuesId}`);
      console.log(`   Aktion: ${config.aktion}`);
      console.log('='.repeat(60));

      // ========== 1. SAISONDATEN ÜBERTRAGEN ==========
      console.log('\n📦 Übertrage SaisonDaten...');

      const neueSaisonDaten = await databases.listDocuments(
        DATABASE_ID,
        SAISON_DATEN_COLLECTION_ID,
        [Query.equal('kundeId', config.neuesId), Query.limit(100)]
      );

      for (const doc of neueSaisonDaten.documents) {
        const daten = parseDocument<any>(doc);

        // Prüfe ob bereits SaisonDaten für Original existieren
        const existierende = await databases.listDocuments(
          DATABASE_ID,
          SAISON_DATEN_COLLECTION_ID,
          [
            Query.equal('kundeId', config.originalId),
            Query.equal('saisonjahr', daten.saisonjahr),
            Query.limit(1)
          ]
        );

        if (existierende.documents.length > 0) {
          // Update existierende SaisonDaten mit den neuen Werten
          const existDaten = parseDocument<any>(existierende.documents[0]);
          const merged = {
            ...existDaten,
            ...daten,
            kundeId: config.originalId,
            platzbauerId: config.neuePlatzbauerId || existDaten.platzbauerId,
            bezugsweg: config.neuerBezugsweg || existDaten.bezugsweg,
            geaendertAm: jetzt,
          };

          await databases.updateDocument(
            DATABASE_ID,
            SAISON_DATEN_COLLECTION_ID,
            existierende.documents[0].$id,
            {
              kundeId: config.originalId,
              saisonjahr: merged.saisonjahr,
              data: JSON.stringify(merged)
            }
          );
          console.log(`   ✅ SaisonDaten ${daten.saisonjahr} gemerged`);
        } else {
          // Erstelle neue SaisonDaten für Original
          const neueDaten = {
            ...daten,
            kundeId: config.originalId,
            platzbauerId: config.neuePlatzbauerId || daten.platzbauerId,
            bezugsweg: config.neuerBezugsweg || daten.bezugsweg,
            geaendertAm: jetzt,
          };
          delete neueDaten.id;
          delete neueDaten.$id;

          await databases.createDocument(
            DATABASE_ID,
            SAISON_DATEN_COLLECTION_ID,
            doc.$id + '_migrated',
            {
              kundeId: config.originalId,
              saisonjahr: neueDaten.saisonjahr,
              data: JSON.stringify(neueDaten)
            }
          );
          console.log(`   ✅ SaisonDaten ${daten.saisonjahr} übertragen`);
        }

        // Lösche alte SaisonDaten
        await databases.deleteDocument(DATABASE_ID, SAISON_DATEN_COLLECTION_ID, doc.$id);
      }
      console.log(`   Gesamt: ${neueSaisonDaten.documents.length} SaisonDaten verarbeitet`);

      // ========== 2. BEZIEHUNGEN ÜBERTRAGEN ==========
      console.log('\n📦 Übertrage Beziehungen...');

      const neueBeziehungen = await databases.listDocuments(
        DATABASE_ID,
        SAISON_BEZIEHUNGEN_COLLECTION_ID,
        [Query.equal('vereinId', config.neuesId), Query.limit(100)]
      );

      for (const doc of neueBeziehungen.documents) {
        const beziehung = parseDocument<any>(doc);

        // Prüfe ob bereits Beziehung für Original existiert
        const existierende = await databases.listDocuments(
          DATABASE_ID,
          SAISON_BEZIEHUNGEN_COLLECTION_ID,
          [
            Query.equal('vereinId', config.originalId),
            Query.equal('platzbauerId', beziehung.platzbauerId),
            Query.limit(1)
          ]
        );

        if (existierende.documents.length === 0 && config.neuePlatzbauerId) {
          // Erstelle Beziehung für Original
          const neueBeziehung = {
            ...beziehung,
            vereinId: config.originalId,
            geaendertAm: jetzt,
          };
          delete neueBeziehung.id;
          delete neueBeziehung.$id;

          await databases.createDocument(
            DATABASE_ID,
            SAISON_BEZIEHUNGEN_COLLECTION_ID,
            doc.$id + '_migrated',
            {
              vereinId: config.originalId,
              platzbauerId: beziehung.platzbauerId,
              data: JSON.stringify(neueBeziehung)
            }
          );
          console.log(`   ✅ Beziehung zu Platzbauer übertragen`);
        }

        // Lösche alte Beziehung
        await databases.deleteDocument(DATABASE_ID, SAISON_BEZIEHUNGEN_COLLECTION_ID, doc.$id);
      }
      console.log(`   Gesamt: ${neueBeziehungen.documents.length} Beziehungen verarbeitet`);

      // ========== 3. PROJEKTE AKTUALISIEREN ==========
      console.log('\n📦 Aktualisiere Projekte...');

      const neueProjekte = await databases.listDocuments(
        DATABASE_ID,
        PROJEKTE_COLLECTION_ID,
        [Query.equal('kundeId', config.neuesId), Query.limit(100)]
      );

      for (const doc of neueProjekte.documents) {
        const projekt = parseDocument<any>(doc);

        // Aktualisiere kundeId auf Original
        const aktualisiert = {
          ...projekt,
          kundeId: config.originalId,
          platzbauerId: config.neuePlatzbauerId || projekt.platzbauerId,
          geaendertAm: jetzt,
        };

        await databases.updateDocument(
          DATABASE_ID,
          PROJEKTE_COLLECTION_ID,
          doc.$id,
          {
            projektName: aktualisiert.projektName,
            kundeId: config.originalId,
            kundenname: aktualisiert.kundenname,
            saisonjahr: aktualisiert.saisonjahr,
            status: aktualisiert.status,
            erstelltAm: aktualisiert.erstelltAm,
            geaendertAm: jetzt,
            data: JSON.stringify(aktualisiert)
          }
        );
        console.log(`   ✅ Projekt ${projekt.projektName} auf Original umgeleitet`);
      }
      console.log(`   Gesamt: ${neueProjekte.documents.length} Projekte aktualisiert`);

      // ========== 4. ORIGINAL AKTUALISIEREN ==========
      if (config.aktion === 'merge_to_original') {
        console.log('\n📦 Aktualisiere Original-Kunde...');

        const originalDoc = await databases.getDocument(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          config.originalId
        );
        const original = parseDocument<any>(originalDoc);

        const aktualisiert = {
          ...original,
          standardPlatzbauerId: config.neuePlatzbauerId,
          standardBezugsweg: config.neuerBezugsweg,
          geaendertAm: jetzt,
        };

        await databases.updateDocument(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          config.originalId,
          { data: JSON.stringify(aktualisiert) }
        );
        console.log(`   ✅ Original auf K.S.D Platzbauer aktualisiert`);
      }

      // ========== 5. NEUES DUPLIKAT LÖSCHEN ==========
      console.log('\n📦 Lösche neues Duplikat...');
      try {
        await databases.deleteDocument(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, config.neuesId);
        console.log(`   ✅ Duplikat ${config.neuesId} gelöscht`);
      } catch (e) {
        console.log(`   ℹ️ Duplikat konnte nicht gelöscht werden (evtl. bereits gelöscht)`);
      }
    }

    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(60));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(60));
    console.log('✅ TC Rot-Weiß Miltenberg: Auf Original übertragen, mit K.S.D verknüpft');
    console.log('✅ HTC Würzburg: Duplikat gelöscht, Original bleibt "direkt"');
    console.log('\n🎉 Duplikat-Bereinigung abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  }
}

main();
