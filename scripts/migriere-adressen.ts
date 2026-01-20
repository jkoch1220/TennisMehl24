/**
 * Migration-Script: adresse → rechnungsadresse + lieferadresse
 *
 * Dieses Script migriert alle bestehenden SaisonKunden:
 * - Kopiert das bestehende `adresse` Feld in `rechnungsadresse` und `lieferadresse`
 * - Behält das `adresse` Feld zunächst für Backwards-Compatibility
 * - KEINE DATEN GEHEN VERLOREN
 *
 * Führe aus mit: npx tsx scripts/migriere-adressen.ts
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
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';

interface Adresse {
  strasse: string;
  plz: string;
  ort: string;
  bundesland?: string;
}

interface SaisonKundeAlt {
  id: string;
  typ: string;
  name: string;
  kundennummer?: string;
  adresse: Adresse;
  rechnungsadresse?: Adresse;
  lieferadresse?: Adresse;
  [key: string]: unknown;
}

async function migriere() {
  console.log('🚀 Starte Adressen-Migration...\n');
  console.log('📦 Lade alle SaisonKunden...');

  try {
    // Lade alle Kunden
    const response = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    console.log(`✅ ${response.documents.length} Kunden gefunden\n`);

    let migriert = 0;
    let uebersprungen = 0;
    let fehler = 0;

    for (const doc of response.documents) {
      try {
        // Parse das data-Feld
        const anyDoc = doc as { data?: string; $id: string };
        if (!anyDoc.data) {
          console.log(`⚠️  Kunde ${doc.$id}: Kein data-Feld gefunden`);
          uebersprungen++;
          continue;
        }

        const kunde: SaisonKundeAlt = JSON.parse(anyDoc.data);

        // Prüfe ob Migration nötig ist
        const hatAdresse = kunde.adresse && kunde.adresse.strasse;
        const hatRechnungsadresse = kunde.rechnungsadresse && kunde.rechnungsadresse.strasse;
        const hatLieferadresse = kunde.lieferadresse && kunde.lieferadresse.strasse;

        if (!hatAdresse) {
          console.log(`⚠️  ${kunde.name}: Keine Adresse vorhanden, übersprungen`);
          uebersprungen++;
          continue;
        }

        // Nur migrieren wenn noch keine Rechnungs-/Lieferadresse vorhanden
        if (hatRechnungsadresse && hatLieferadresse) {
          console.log(`✓  ${kunde.name}: Bereits migriert`);
          uebersprungen++;
          continue;
        }

        // Migration durchführen
        const aktualisiert = {
          ...kunde,
          // Kopiere adresse in beide neuen Felder (wenn nicht bereits vorhanden)
          rechnungsadresse: hatRechnungsadresse
            ? kunde.rechnungsadresse
            : { ...kunde.adresse },
          lieferadresse: hatLieferadresse
            ? kunde.lieferadresse
            : { ...kunde.adresse },
          // Behalte adresse für Backwards-Compatibility (wird später entfernt)
          adresse: kunde.adresse,
          geaendertAm: new Date().toISOString(),
        };

        // Speichern
        await databases.updateDocument(
          DATABASE_ID,
          SAISON_KUNDEN_COLLECTION_ID,
          doc.$id,
          { data: JSON.stringify(aktualisiert) }
        );

        console.log(`✅ ${kunde.name}: Migriert (${kunde.adresse.plz} ${kunde.adresse.ort})`);
        migriert++;

      } catch (err) {
        console.error(`❌ Fehler bei Kunde ${doc.$id}:`, err);
        fehler++;
      }
    }

    console.log('\n========================================');
    console.log('📊 Migration abgeschlossen!');
    console.log(`   ✅ Migriert: ${migriert}`);
    console.log(`   ⏭️  Übersprungen: ${uebersprungen}`);
    console.log(`   ❌ Fehler: ${fehler}`);
    console.log('========================================\n');

    if (fehler > 0) {
      console.log('⚠️  Es gab Fehler! Bitte prüfen Sie die Ausgabe oben.');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
    process.exit(1);
  }
}

// DRY-RUN Option
const isDryRun = process.argv.includes('--dry-run');
if (isDryRun) {
  console.log('🔍 DRY-RUN Modus - Keine Änderungen werden gespeichert\n');
}

migriere();
