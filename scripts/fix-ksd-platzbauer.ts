/**
 * Korrektur-Script: Vereine auf den richtigen K.S.D Platzbauer umstellen
 * Führe aus mit: npx tsx scripts/fix-ksd-platzbauer.ts
 */

import { Client, Databases, Query, ID } from 'node-appwrite';
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
const SAISON_BEZIEHUNGEN_COLLECTION_ID = 'saison_beziehungen';
const PROJEKTE_COLLECTION_ID = 'projekte';
const PLATZBAUER_PROJEKTE_COLLECTION_ID = 'platzbauer_projekte';
const PROJEKT_ZUORDNUNGEN_COLLECTION_ID = 'projekt_zuordnungen';

// IDs
const RICHTIGER_PLATZBAUER_ID = '6938564f002e3348542c'; // K.S.D Tennisplatzbau Garten- und Sportplatzbau GmbH
const FALSCHER_PLATZBAUER_ID = '69933f7c00255667b9d6'; // K.S.D Sportplatzbau (falsch angelegt)
const FALSCHES_PLATZBAUERPROJEKT_ID = '69933fe60027e0efae14'; // Falsches Platzbauerprojekt

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
  console.log('🔧 Starte Korrektur...\n');
  const jetzt = new Date().toISOString();

  try {
    // ========== 1. FINDE ODER ERSTELLE RICHTIGES PLATZBAUERPROJEKT ==========
    console.log('📦 Suche/Erstelle Platzbauerprojekt für richtigen Platzbauer...');

    const existierendeProjekte = await databases.listDocuments(
      DATABASE_ID,
      PLATZBAUER_PROJEKTE_COLLECTION_ID,
      [Query.equal('platzbauerId', RICHTIGER_PLATZBAUER_ID), Query.equal('saisonjahr', 2026), Query.limit(10)]
    );

    let richtigesPlatzbauerprojektId: string;

    if (existierendeProjekte.documents.length > 0) {
      richtigesPlatzbauerprojektId = existierendeProjekte.documents[0].$id;
      console.log(`✅ Platzbauerprojekt existiert bereits: ${richtigesPlatzbauerprojektId}`);
    } else {
      // Erstelle neues Platzbauerprojekt für richtigen Platzbauer
      richtigesPlatzbauerprojektId = ID.unique();
      const payload = {
        platzbauerId: RICHTIGER_PLATZBAUER_ID,
        platzbauerName: 'K.S.D Tennisplatzbau Garten- und Sportplatzbau GmbH',
        saisonjahr: 2026,
        status: 'angebot',
        typ: 'saisonprojekt',
        erstelltAm: jetzt,
        geaendertAm: jetzt,
        data: JSON.stringify({}),
      };

      await databases.createDocument(
        DATABASE_ID,
        PLATZBAUER_PROJEKTE_COLLECTION_ID,
        richtigesPlatzbauerprojektId,
        payload
      );
      console.log(`✅ Platzbauerprojekt erstellt: ${richtigesPlatzbauerprojektId}`);
    }

    // ========== 2. AKTUALISIERE ALLE VEREINE ==========
    console.log('\n📦 Aktualisiere Vereine...');

    const alleKunden = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    let aktualisierteVereine = 0;
    for (const doc of alleKunden.documents) {
      const kunde = parseDocument<any>(doc);

      if (kunde.standardPlatzbauerId === FALSCHER_PLATZBAUER_ID) {
        // Aktualisiere auf richtigen Platzbauer
        const aktualisiert = {
          ...kunde,
          standardPlatzbauerId: RICHTIGER_PLATZBAUER_ID,
          geaendertAm: jetzt,
        };

        await databases.updateDocument(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          doc.$id,
          { data: JSON.stringify(aktualisiert) }
        );
        console.log(`  ✅ ${kunde.name} → richtiger Platzbauer`);
        aktualisierteVereine++;
      }
    }
    console.log(`  Gesamt: ${aktualisierteVereine} Vereine aktualisiert`);

    // ========== 3. AKTUALISIERE ALLE SAISONDATEN ==========
    console.log('\n📦 Aktualisiere SaisonDaten...');

    const alleSaisonDaten = await databases.listDocuments(
      DATABASE_ID,
      SAISON_DATEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    let aktualisierteSaisonDaten = 0;
    for (const doc of alleSaisonDaten.documents) {
      const daten = parseDocument<any>(doc);

      if (daten.platzbauerId === FALSCHER_PLATZBAUER_ID) {
        const aktualisiert = {
          ...daten,
          platzbauerId: RICHTIGER_PLATZBAUER_ID,
          geaendertAm: jetzt,
        };

        await databases.updateDocument(
          DATABASE_ID,
          SAISON_DATEN_COLLECTION_ID,
          doc.$id,
          {
            kundeId: daten.kundeId,
            saisonjahr: daten.saisonjahr,
            data: JSON.stringify(aktualisiert)
          }
        );
        aktualisierteSaisonDaten++;
      }
    }
    console.log(`  ✅ ${aktualisierteSaisonDaten} SaisonDaten aktualisiert`);

    // ========== 4. AKTUALISIERE ALLE BEZIEHUNGEN ==========
    console.log('\n📦 Aktualisiere Beziehungen...');

    const alleBeziehungen = await databases.listDocuments(
      DATABASE_ID,
      SAISON_BEZIEHUNGEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    let aktualisierteBeziehungen = 0;
    let geloeschteBeziehungen = 0;

    for (const doc of alleBeziehungen.documents) {
      const beziehung = parseDocument<any>(doc);

      if (beziehung.platzbauerId === FALSCHER_PLATZBAUER_ID) {
        // Prüfe ob bereits eine Beziehung zum richtigen Platzbauer existiert
        const existiert = alleBeziehungen.documents.some(d => {
          const b = parseDocument<any>(d);
          return b.vereinId === beziehung.vereinId && b.platzbauerId === RICHTIGER_PLATZBAUER_ID;
        });

        if (existiert) {
          // Lösche die falsche Beziehung
          await databases.deleteDocument(DATABASE_ID, SAISON_BEZIEHUNGEN_COLLECTION_ID, doc.$id);
          geloeschteBeziehungen++;
        } else {
          // Aktualisiere auf richtigen Platzbauer
          const aktualisiert = {
            ...beziehung,
            platzbauerId: RICHTIGER_PLATZBAUER_ID,
            geaendertAm: jetzt,
          };

          await databases.updateDocument(
            DATABASE_ID,
            SAISON_BEZIEHUNGEN_COLLECTION_ID,
            doc.$id,
            {
              vereinId: beziehung.vereinId,
              platzbauerId: RICHTIGER_PLATZBAUER_ID,
              data: JSON.stringify(aktualisiert)
            }
          );
          aktualisierteBeziehungen++;
        }
      }
    }
    console.log(`  ✅ ${aktualisierteBeziehungen} Beziehungen aktualisiert, ${geloeschteBeziehungen} gelöscht`);

    // ========== 5. AKTUALISIERE ALLE PROJEKTE ==========
    console.log('\n📦 Aktualisiere Projekte...');

    const alleProjekte = await databases.listDocuments(
      DATABASE_ID,
      PROJEKTE_COLLECTION_ID,
      [Query.limit(5000)]
    );

    let aktualisierteProjekte = 0;
    for (const doc of alleProjekte.documents) {
      const projekt = parseDocument<any>(doc);

      if (projekt.platzbauerId === FALSCHER_PLATZBAUER_ID ||
          projekt.zugeordnetesPlatzbauerprojektId === FALSCHES_PLATZBAUERPROJEKT_ID) {
        const aktualisiert = {
          ...projekt,
          platzbauerId: projekt.platzbauerId === FALSCHER_PLATZBAUER_ID ? RICHTIGER_PLATZBAUER_ID : projekt.platzbauerId,
          zugeordnetesPlatzbauerprojektId: projekt.zugeordnetesPlatzbauerprojektId === FALSCHES_PLATZBAUERPROJEKT_ID ? richtigesPlatzbauerprojektId : projekt.zugeordnetesPlatzbauerprojektId,
          geaendertAm: jetzt,
        };

        await databases.updateDocument(
          DATABASE_ID,
          PROJEKTE_COLLECTION_ID,
          doc.$id,
          {
            projektName: aktualisiert.projektName,
            kundeId: aktualisiert.kundeId,
            kundenname: aktualisiert.kundenname,
            saisonjahr: aktualisiert.saisonjahr,
            status: aktualisiert.status,
            erstelltAm: aktualisiert.erstelltAm,
            geaendertAm: jetzt,
            data: JSON.stringify(aktualisiert)
          }
        );
        aktualisierteProjekte++;
      }
    }
    console.log(`  ✅ ${aktualisierteProjekte} Projekte aktualisiert`);

    // ========== 6. AKTUALISIERE ALLE PROJEKT-ZUORDNUNGEN ==========
    console.log('\n📦 Aktualisiere Projekt-Zuordnungen...');

    const alleZuordnungen = await databases.listDocuments(
      DATABASE_ID,
      PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    let aktualisierteZuordnungen = 0;
    for (const doc of alleZuordnungen.documents) {
      const zuordnung = parseDocument<any>(doc);

      if (zuordnung.platzbauerprojektId === FALSCHES_PLATZBAUERPROJEKT_ID) {
        const aktualisiert = {
          ...zuordnung,
          platzbauerprojektId: richtigesPlatzbauerprojektId,
        };

        await databases.updateDocument(
          DATABASE_ID,
          PROJEKT_ZUORDNUNGEN_COLLECTION_ID,
          doc.$id,
          {
            vereinsProjektId: zuordnung.vereinsProjektId,
            platzbauerprojektId: richtigesPlatzbauerprojektId,
            position: zuordnung.position,
            erstelltAm: zuordnung.erstelltAm,
            data: JSON.stringify(aktualisiert)
          }
        );
        aktualisierteZuordnungen++;
      }
    }
    console.log(`  ✅ ${aktualisierteZuordnungen} Zuordnungen aktualisiert`);

    // ========== 7. LÖSCHE FALSCHES PLATZBAUERPROJEKT ==========
    console.log('\n📦 Lösche falsches Platzbauerprojekt...');
    try {
      await databases.deleteDocument(DATABASE_ID, PLATZBAUER_PROJEKTE_COLLECTION_ID, FALSCHES_PLATZBAUERPROJEKT_ID);
      console.log(`  ✅ Falsches Platzbauerprojekt gelöscht`);
    } catch (e) {
      console.log(`  ℹ️ Platzbauerprojekt konnte nicht gelöscht werden (evtl. bereits gelöscht)`);
    }

    // ========== 8. LÖSCHE FALSCHEN PLATZBAUER ==========
    console.log('\n📦 Lösche falschen Platzbauer...');
    try {
      await databases.deleteDocument(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, FALSCHER_PLATZBAUER_ID);
      console.log(`  ✅ Falscher Platzbauer "K.S.D Sportplatzbau" gelöscht`);
    } catch (e) {
      console.log(`  ℹ️ Platzbauer konnte nicht gelöscht werden (evtl. bereits gelöscht)`);
    }

    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(50));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(50));
    console.log(`✅ Richtiger Platzbauer: K.S.D Tennisplatzbau (${RICHTIGER_PLATZBAUER_ID})`);
    console.log(`✅ Richtiges Platzbauerprojekt 2026: ${richtigesPlatzbauerprojektId}`);
    console.log(`✅ Vereine aktualisiert: ${aktualisierteVereine}`);
    console.log(`✅ SaisonDaten aktualisiert: ${aktualisierteSaisonDaten}`);
    console.log(`✅ Beziehungen aktualisiert: ${aktualisierteBeziehungen}`);
    console.log(`✅ Projekte aktualisiert: ${aktualisierteProjekte}`);
    console.log(`✅ Zuordnungen aktualisiert: ${aktualisierteZuordnungen}`);
    console.log('\n🎉 Korrektur abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  }
}

main();
