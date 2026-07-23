/**
 * Migration-Script: Angebotsnummern aus Dokumenten in Projekte übertragen
 *
 * Dieses Script:
 * 1. Lädt alle Projekte für 2026
 * 2. Für jedes Projekt: Lädt die Angebots-Dokumente
 * 3. Extrahiert die Angebotsnummer aus dem neuesten Dokument
 * 4. Aktualisiert das Projekt mit der Angebotsnummer
 *
 * Führe aus mit: npx tsx scripts/migriere-angebotsnummern.ts
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const PROJEKTE_COLLECTION_ID = 'projekte';
const DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';

interface Projekt {
  $id: string;
  projektName: string;
  kundenname: string;
  saisonjahr: number;
  status: string;
  data?: string;
  angebotsnummer?: string;
  angebotsdatum?: string;
  angebotId?: string;
}

interface Dokument {
  $id: string;
  projektId: string;
  dokumentTyp: string;
  dokumentNummer: string;
  daten?: string;
  $createdAt: string;
}

async function migriere() {
  console.log('🚀 Starte Migration: Angebotsnummern aus Dokumenten in Projekte übertragen\n');

  // 1. Alle Projekte für 2026 laden
  console.log('📂 Lade alle Projekte für Saison 2026...');

  let alleProjekte: Projekt[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await databases.listDocuments(DATABASE_ID, PROJEKTE_COLLECTION_ID, [
      Query.equal('saisonjahr', 2026),
      Query.limit(limit),
      Query.offset(offset)
    ]);

    alleProjekte = alleProjekte.concat(response.documents as unknown as Projekt[]);

    if (response.documents.length < limit) break;
    offset += limit;
  }

  console.log(`✅ ${alleProjekte.length} Projekte geladen\n`);

  let aktualisiert = 0;
  let uebersprungen = 0;
  let keinDokument = 0;
  let fehler = 0;

  // 2. Für jedes Projekt die Angebots-Dokumente laden
  for (const projekt of alleProjekte) {
    try {
      // Parse das data-Feld um zu prüfen, ob bereits eine Angebotsnummer vorhanden ist
      let projektData: any = {};
      if (projekt.data && typeof projekt.data === 'string') {
        try {
          projektData = JSON.parse(projekt.data);
        } catch {
          // Ignoriere Parse-Fehler
        }
      }

      // Prüfe ob bereits eine Angebotsnummer im Projekt vorhanden ist
      if (projektData.angebotsnummer) {
        console.log(`⏭️  ${projekt.kundenname}: Bereits Angebotsnummer vorhanden (${projektData.angebotsnummer})`);
        uebersprungen++;
        continue;
      }

      // Lade Angebots-Dokumente für dieses Projekt
      const dokumente = await databases.listDocuments(DATABASE_ID, DOKUMENTE_COLLECTION_ID, [
        Query.equal('projektId', projekt.$id),
        Query.equal('dokumentTyp', 'angebot'),
        Query.orderDesc('$createdAt'),
        Query.limit(1)
      ]);

      if (dokumente.documents.length === 0) {
        console.log(`📭 ${projekt.kundenname}: Kein Angebots-Dokument gefunden`);
        keinDokument++;
        continue;
      }

      const dokument = dokumente.documents[0] as unknown as Dokument;

      // Extrahiere Angebotsnummer und Datum aus dem Dokument
      let angebotsnummer = dokument.dokumentNummer;
      let angebotsdatum: string | undefined;

      // Versuche auch das Datum aus den daten zu extrahieren
      if (dokument.daten && typeof dokument.daten === 'string') {
        try {
          const daten = JSON.parse(dokument.daten);
          if (daten.angebotsdatum) {
            angebotsdatum = daten.angebotsdatum;
          }
        } catch {
          // Ignoriere Parse-Fehler
        }
      }

      if (!angebotsnummer) {
        console.log(`⚠️  ${projekt.kundenname}: Dokument hat keine Nummer`);
        keinDokument++;
        continue;
      }

      // 3. Projekt mit Angebotsnummer aktualisieren
      // Aktualisiere das data-Feld mit den neuen Werten
      const aktualisiertesDatenObjekt = {
        ...projektData,
        angebotsnummer: angebotsnummer,
        angebotId: dokument.$id,
        ...(angebotsdatum && { angebotsdatum: angebotsdatum })
      };

      await databases.updateDocument(DATABASE_ID, PROJEKTE_COLLECTION_ID, projekt.$id, {
        data: JSON.stringify(aktualisiertesDatenObjekt)
      });

      console.log(`✅ ${projekt.kundenname}: Angebotsnummer ${angebotsnummer} übertragen`);
      aktualisiert++;

    } catch (error) {
      console.error(`❌ ${projekt.kundenname}: Fehler - ${(error as Error).message}`);
      fehler++;
    }
  }

  // Zusammenfassung
  console.log('\n' + '='.repeat(60));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(60));
  console.log(`✅ Aktualisiert:        ${aktualisiert}`);
  console.log(`⏭️  Übersprungen:        ${uebersprungen} (bereits vorhanden)`);
  console.log(`📭 Kein Dokument:       ${keinDokument}`);
  console.log(`❌ Fehler:              ${fehler}`);
  console.log(`📁 Gesamt:              ${alleProjekte.length}`);
  console.log('='.repeat(60));
}

migriere().catch(console.error);
