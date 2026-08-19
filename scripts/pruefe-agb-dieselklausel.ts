/**
 * Prüft (und ergänzt auf Wunsch) den Dieselpreiszuschlag-Absatz für 2027 in den AGB.
 *
 * Hintergrund: `getAgbAbschnitte()` liest die AGB primär aus dem JSON-Snapshot in den
 * Stammdaten (Feld `agbAbschnitte`, gepflegt unter Stammdaten → „Klauseln & AGB") und
 * greift nur ersatzweise auf `DEFAULT_AGB_ABSCHNITTE` im Code zurück. Wurde der Snapshot
 * jemals gespeichert, wirkt eine Code-Änderung an § 4 produktiv NICHT — die Angebote
 * drucken dann weiter die alte Fassung, während das Portal bereits nach der neuen Staffel
 * rechnet.
 *
 * Prüfen (nur lesend):   npx tsx scripts/pruefe-agb-dieselklausel.ts
 * Ergänzen:              npx tsx scripts/pruefe-agb-dieselklausel.ts --fix
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

const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'tennismehl24_db';
const COLLECTION_ID = 'stammdaten';

/** Muss wortgleich zu vertragsklauseln.ts sein — dort ist die Quelle. */
const ABSATZ_2027 =
  'Angebote mit Gültigkeit ab 01.01.2027: Den angebotenen Preisen liegt ein Basis-Dieselpreis von bis zu 1,749 €/Liter zugrunde. Bei einer Steigerung des Dieselpreises über diesen Basiswert erhöht sich der Preis des gelieferten Ziegelmehls pro 0,05 € Dieselpreisanstieg gestaffelt nach der Entfernung zwischen dem Versandwerk von Tennismehl und der Abladestelle (einfache Strecke): bis 50 km: 0,45 € je Tonne; über 50 bis 75 km: 0,65 € je Tonne; über 75 bis 100 km: 0,85 € je Tonne; über 100 bis 125 km: 1,05 € je Tonne; über 125 bis 150 km: 1,25 € je Tonne; über 150 km: 1,45 € je Tonne. Maßgeblich ist die Entfernung zur vereinbarten Abladestelle.';

interface AgbAbschnitt {
  titel: string;
  absaetze: string[];
}

const fix = process.argv.includes('--fix');

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function main() {
  console.log(fix ? '🔧 Modus: ERGÄNZEN' : '🔍 Modus: nur prüfen (--fix zum Ergänzen)');
  console.log(`   Datenbank: ${DATABASE_ID}\n`);

  const liste = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [Query.limit(25)]);

  if (liste.documents.length === 0) {
    console.log('ℹ️  Keine Stammdaten gefunden — es gilt DEFAULT_AGB_ABSCHNITTE aus dem Code.');
    console.log('   Nichts zu tun, die Code-Änderung wirkt.');
    return;
  }

  let handlungsbedarf = false;

  for (const dok of liste.documents) {
    const roh = (dok as Record<string, unknown>).agbAbschnitte;

    if (!roh || typeof roh !== 'string' || roh.trim().length === 0) {
      console.log(`✅ ${dok.$id}: kein AGB-Snapshot → Code-Fassung greift.`);
      continue;
    }

    let abschnitte: AgbAbschnitt[];
    try {
      abschnitte = JSON.parse(roh);
    } catch {
      console.log(`⚠️  ${dok.$id}: agbAbschnitte ist kein gültiges JSON — bitte in der UI prüfen.`);
      handlungsbedarf = true;
      continue;
    }

    const paragraph4 = abschnitte.find((a) => a.titel?.startsWith('§ 4'));
    if (!paragraph4) {
      console.log(`⚠️  ${dok.$id}: § 4 im Snapshot nicht gefunden — bitte in der UI prüfen.`);
      handlungsbedarf = true;
      continue;
    }

    if (paragraph4.absaetze.some((a) => a.includes('ab 01.01.2027'))) {
      console.log(`✅ ${dok.$id}: 2027er Staffel steht bereits in den gespeicherten AGB.`);
      continue;
    }

    handlungsbedarf = true;
    console.log(`❌ ${dok.$id}: 2027er Staffel FEHLT im gespeicherten AGB-Snapshot.`);
    console.log('   Das Portal rechnet ab 2027 nach der Entfernungsstaffel, die AGB auf dem');
    console.log('   Angebot kennt sie aber nicht.');

    if (!fix) continue;

    // Hinter den 2026er Absatz einsortieren, sonst ans Ende der Dieselabsätze
    const index2026 = paragraph4.absaetze.findIndex((a) => a.includes('bis 31.12.2026'));
    if (index2026 >= 0) {
      paragraph4.absaetze.splice(index2026 + 1, 0, ABSATZ_2027);
    } else {
      paragraph4.absaetze.push(ABSATZ_2027);
    }

    await databases.updateDocument(DATABASE_ID, COLLECTION_ID, dok.$id, {
      agbAbschnitte: JSON.stringify(abschnitte),
    });
    console.log(`   ✅ Ergänzt und gespeichert.`);
  }

  console.log('');
  if (handlungsbedarf && !fix) {
    console.log('👉 Zum Ergänzen: npx tsx scripts/pruefe-agb-dieselklausel.ts --fix');
    console.log('   (Alternativ von Hand unter Stammdaten → „Klauseln & AGB")');
  } else if (!handlungsbedarf) {
    console.log('👍 Alles konsistent.');
  }
}

main().catch((error) => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});
