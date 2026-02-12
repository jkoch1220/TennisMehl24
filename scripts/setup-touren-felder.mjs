/**
 * Script zum Hinzufügen der neuen Touren-Felder (lkwTyp, kapazitaet)
 * Ausführen mit: node scripts/setup-touren-felder.mjs
 */

import 'dotenv/config';

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.VITE_APPWRITE_API_KEY;
const databaseId = 'tennismehl24_db';
const collectionId = 'touren';

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Fehler: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und VITE_APPWRITE_API_KEY müssen in .env gesetzt sein');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

async function createStringAttribute(key, size, required = false, defaultValue = null) {
  console.log(`\n📝 Erstelle Feld: ${key} (String, ${size} Zeichen)`);

  const body = {
    key,
    size,
    required,
    default: defaultValue,
  };

  try {
    const response = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${collectionId}/attributes/string`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (response.ok) {
      console.log(`   ✅ Feld "${key}" erstellt`);
      return true;
    } else if (data.message?.includes('already exists')) {
      console.log(`   ⏭️  Feld "${key}" existiert bereits`);
      return true;
    } else {
      console.error(`   ❌ Fehler: ${data.message}`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Fehler: ${error.message}`);
    return false;
  }
}

async function checkCollection() {
  console.log(`\n🔍 Prüfe Collection "${collectionId}"...`);

  try {
    const response = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${collectionId}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Collection gefunden: ${data.name}`);
      return true;
    } else {
      console.error(`   ❌ Collection nicht gefunden`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Fehler: ${error.message}`);
    return false;
  }
}

async function listAttributes() {
  console.log(`\n📋 Vorhandene Felder:`);

  try {
    const response = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${collectionId}/attributes`,
      {
        method: 'GET',
        headers,
      }
    );

    if (response.ok) {
      const data = await response.json();
      data.attributes.forEach(attr => {
        console.log(`   - ${attr.key} (${attr.type}, ${attr.size || 'n/a'})`);
      });
      return data.attributes;
    }
    return [];
  } catch (error) {
    console.error(`   ❌ Fehler: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('🚛 Touren-Felder Setup');
  console.log('='.repeat(50));

  // Collection prüfen
  const collectionExists = await checkCollection();
  if (!collectionExists) {
    console.error('\n❌ Abbruch: Collection existiert nicht');
    process.exit(1);
  }

  // Vorhandene Felder anzeigen
  const existingAttributes = await listAttributes();
  const existingKeys = existingAttributes.map(a => a.key);

  // Neue Felder hinzufügen
  console.log('\n📦 Füge neue Felder hinzu...');

  // lkwTyp - 'motorwagen' | 'mit_haenger'
  if (!existingKeys.includes('lkwTyp')) {
    await createStringAttribute('lkwTyp', 50, false, 'motorwagen');
    // Warten damit Appwrite das Feld erstellen kann
    await new Promise(resolve => setTimeout(resolve, 1500));
  } else {
    console.log(`\n   ⏭️  Feld "lkwTyp" existiert bereits`);
  }

  // kapazitaet - JSON mit motorwagenTonnen, haengerTonnen, gesamtTonnen
  if (!existingKeys.includes('kapazitaet')) {
    await createStringAttribute('kapazitaet', 500, false, null);
    await new Promise(resolve => setTimeout(resolve, 1500));
  } else {
    console.log(`   ⏭️  Feld "kapazitaet" existiert bereits`);
  }

  // optimierung - JSON mit Methode, Constraints
  if (!existingKeys.includes('optimierung')) {
    await createStringAttribute('optimierung', 10000, false, null);
    await new Promise(resolve => setTimeout(resolve, 1500));
  } else {
    console.log(`   ⏭️  Feld "optimierung" existiert bereits`);
  }

  // datum auf optional setzen - das Feld existiert bereits, aber wir prüfen ob es required ist
  // (Das kann nicht über die API geändert werden, also nur Info)
  console.log('\n⚠️  Hinweis: Das Feld "datum" sollte optional sein (not required).');
  console.log('   Falls es required ist, muss es in der Appwrite Console geändert werden.');

  console.log('\n' + '='.repeat(50));
  console.log('✅ Setup abgeschlossen!');
  console.log('\n💡 Hinweis: Warte einige Sekunden bis Appwrite die Felder aktiviert hat.');
}

main().catch(console.error);
