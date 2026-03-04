/**
 * ANALYSE-Script für Platzbauer Vogl - NUR LESEN, KEINE ÄNDERUNGEN
 *
 * Zeigt an:
 * 1. Welcher Platzbauer "Vogl" gefunden wird
 * 2. Welche Vereine diesem Platzbauer zugeordnet sind
 * 3. Was gelöscht/behalten würde
 *
 * Führe aus mit: npx tsx scripts/vogl-vereine-analyse.ts
 */

import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen!');
  console.error('   Benötigt: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';

// Der zu behaltende Verein
const VEREIN_BEHALTEN = 'TC Dietenhofen e.V.';

function parseDocument<T>(doc: any): T {
  if (doc?.data && typeof doc.data === 'string') {
    try {
      const parsed = JSON.parse(doc.data) as T;
      return { ...parsed, id: (parsed as any).id || doc.$id };
    } catch {
      // ignore
    }
  }
  return { id: doc.$id } as T;
}

async function main() {
  console.log('🔍 Vogl Sportanlagen - Vereins-Analyse');
  console.log('='.repeat(60));
  console.log('📋 NUR LESEN - Keine Änderungen werden vorgenommen!\n');

  try {
    // 1. Lade alle Kunden
    console.log('📥 Lade alle Kunden aus der Datenbank...');
    const kundenResponse = await databases.listDocuments(
      DATABASE_ID,
      SAISON_KUNDEN_COLLECTION_ID,
      [Query.limit(5000)]
    );

    console.log(`   → ${kundenResponse.documents.length} Kunden geladen\n`);

    const alleKunden: any[] = [];
    const allePlatzbauer: any[] = [];

    for (const doc of kundenResponse.documents) {
      const kunde = parseDocument<any>(doc);
      alleKunden.push({ ...kunde, $id: doc.$id });

      if (kunde.typ === 'platzbauer') {
        allePlatzbauer.push({ ...kunde, $id: doc.$id });
      }
    }

    // 2. Zeige alle Platzbauer mit "Vogl" im Namen
    console.log('='.repeat(60));
    console.log('📍 SUCHE NACH PLATZBAUER "VOGL"');
    console.log('='.repeat(60) + '\n');

    const voglPlatzbauer = allePlatzbauer.filter(p =>
      p.name?.toLowerCase().includes('vogl') ||
      p.name?.toLowerCase().includes('thomas vogl')
    );

    if (voglPlatzbauer.length === 0) {
      console.log('❌ Kein Platzbauer mit "Vogl" im Namen gefunden!\n');
      console.log('   Alle Platzbauer im System:');
      allePlatzbauer.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name} (ID: ${p.id}, aktiv: ${p.aktiv})`);
      });
      process.exit(1);
    }

    console.log(`✅ ${voglPlatzbauer.length} Platzbauer mit "Vogl" gefunden:\n`);
    voglPlatzbauer.forEach((p, i) => {
      console.log(`   ${i + 1}. Name: "${p.name}"`);
      console.log(`      ID: ${p.id}`);
      console.log(`      Aktiv: ${p.aktiv ? 'Ja' : 'Nein'}`);
      if (p.rechnungsadresse || p.adresse) {
        const addr = p.rechnungsadresse || p.adresse;
        console.log(`      Adresse: ${addr.strasse || '-'}, ${addr.plz || '-'} ${addr.ort || '-'}`);
      }
      console.log('');
    });

    // Nimm den ersten (oder einzigen) Vogl-Platzbauer
    const hauptVogl = voglPlatzbauer[0];

    // 3. Finde alle Vereine dieses Platzbauers
    console.log('='.repeat(60));
    console.log(`📍 VEREINE VON "${hauptVogl.name}"`);
    console.log('='.repeat(60) + '\n');

    // NUR Vereine mit Bezugsweg "ueber_platzbauer" (wie in der UI)
    const voglVereine = alleKunden.filter(
      k => k.typ === 'verein' &&
           k.standardPlatzbauerId === hauptVogl.id &&
           k.standardBezugsweg === 'ueber_platzbauer' &&
           k.aktiv === true
    );

    if (voglVereine.length === 0) {
      console.log('ℹ️  Keine Vereine diesem Platzbauer zugeordnet.\n');
    } else {
      console.log(`📋 ${voglVereine.length} Vereine gefunden:\n`);

      // Sortiere alphabetisch
      voglVereine.sort((a, b) => a.name.localeCompare(b.name));

      voglVereine.forEach((v, i) => {
        const istBehalten = v.name === VEREIN_BEHALTEN;
        const status = istBehalten ? '🟢 BEHALTEN' : '🔴 LÖSCHEN';
        const aktiv = v.aktiv ? '' : ' [INAKTIV]';

        console.log(`   ${String(i + 1).padStart(2)}. ${v.name}${aktiv}`);
        console.log(`       → ${status}`);

        // Zeige Adresse
        const addr = v.lieferadresse || v.rechnungsadresse || v.adresse;
        if (addr) {
          console.log(`       Adresse: ${addr.strasse || '-'}, ${addr.plz || '-'} ${addr.ort || '-'}`);
        }

        // Zeige Menge
        if (v.tonnenLetztesJahr) {
          console.log(`       Menge: ${v.tonnenLetztesJahr} t`);
        }

        console.log('');
      });
    }

    // 3b. Zeige auch "Direkt Instandsetzung" Vereine (diese werden NICHT gelöscht)
    const direktInstandsetzungVereine = alleKunden.filter(
      k => k.typ === 'verein' &&
           k.standardPlatzbauerId === hauptVogl.id &&
           k.standardBezugsweg === 'direkt_instandsetzung' &&
           k.aktiv === true
    );

    if (direktInstandsetzungVereine.length > 0) {
      console.log('='.repeat(60));
      console.log(`📍 "DIREKT INSTANDSETZUNG" VEREINE (werden NICHT gelöscht)`);
      console.log('='.repeat(60) + '\n');

      console.log(`ℹ️  ${direktInstandsetzungVereine.length} Vereine mit "Direkt Instandsetzung":\n`);

      direktInstandsetzungVereine.sort((a, b) => a.name.localeCompare(b.name));
      direktInstandsetzungVereine.forEach((v, i) => {
        console.log(`   ${String(i + 1).padStart(2)}. ${v.name}`);
        const addr = v.lieferadresse || v.rechnungsadresse || v.adresse;
        if (addr) {
          console.log(`       Adresse: ${addr.plz || '-'} ${addr.ort || '-'}`);
        }
        if (v.tonnenLetztesJahr) {
          console.log(`       Menge: ${v.tonnenLetztesJahr} t`);
        }
        console.log('');
      });

      console.log('   ✅ Diese Vereine bleiben UNVERÄNDERT (anderer Bezugsweg)\n');
    }

    // 3c. Zeige ALLE Vereine mit diesem Platzbauer (ohne Filter)
    const alleVoglVereine = alleKunden.filter(
      k => k.typ === 'verein' && k.standardPlatzbauerId === hauptVogl.id
    );

    console.log('='.repeat(60));
    console.log(`📍 ALLE VEREINE MIT PLATZBAUER VOGL (ohne Filter)`);
    console.log('='.repeat(60) + '\n');

    console.log(`📋 ${alleVoglVereine.length} Vereine insgesamt:\n`);

    // Gruppiere nach Bezugsweg
    const nachBezugsweg: Record<string, any[]> = {};
    for (const v of alleVoglVereine) {
      const bw = v.standardBezugsweg || 'KEIN_BEZUGSWEG';
      const aktiv = v.aktiv ? '' : ' [INAKTIV]';
      if (!nachBezugsweg[bw]) nachBezugsweg[bw] = [];
      nachBezugsweg[bw].push({ ...v, aktivText: aktiv });
    }

    for (const [bezugsweg, vereine] of Object.entries(nachBezugsweg)) {
      console.log(`   ${bezugsweg}: ${vereine.length} Vereine`);
      vereine.forEach((v: any) => {
        console.log(`      - ${v.name}${v.aktivText}`);
      });
      console.log('');
    }

    // 4. Zusammenfassung
    console.log('='.repeat(60));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(60) + '\n');

    const vereineZumLoeschen = voglVereine.filter(v => v.name !== VEREIN_BEHALTEN);
    const vereinZuBehalten = voglVereine.find(v => v.name === VEREIN_BEHALTEN);

    console.log(`   Platzbauer: ${hauptVogl.name} (ID: ${hauptVogl.id})`);
    console.log(`   Aktuelle Vereine: ${voglVereine.length}`);
    console.log(`   Zu löschen: ${vereineZumLoeschen.length}`);
    console.log(`   Zu behalten: ${vereinZuBehalten ? `"${VEREIN_BEHALTEN}"` : '⚠️  NICHT GEFUNDEN!'}`);
    console.log(`   Neu anzulegen: 24 Vereine (aus deiner Liste)`);
    console.log(`   \n   → Nach Bereinigung: ${(vereinZuBehalten ? 1 : 0) + 24} Vereine`);

    if (!vereinZuBehalten) {
      console.log('\n⚠️  ACHTUNG: Der Verein "TC Dietenhofen e.V." wurde NICHT gefunden!');
      console.log('   Bitte prüfe den genauen Namen im System.');
    }

    console.log('\n' + '='.repeat(60));
    console.log('ℹ️  Dies war nur eine ANALYSE - nichts wurde verändert.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

main();
