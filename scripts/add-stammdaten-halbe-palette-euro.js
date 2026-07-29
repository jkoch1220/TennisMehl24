/**
 * Fügt der Collection `stammdaten` das Attribut für den Anbruch-Aufschlag als
 * FESTEN EURO-BETRAG hinzu:
 * - halbePaletteAufschlagEuro (double, Default 0) — fester Aufschlag in EURO je
 *   angebrochener (halber) Palette. Wird im Angebot als eigene Pauschal-Position
 *   ausgewiesen (Vorgabe Inhaber: 25 EUR, in den Stammdaten einstellbar).
 *
 * Ersetzt fachlich das (weiterhin existierende, aber nicht mehr verwendete)
 * Attribut `halbePaletteAufschlagProzent`.
 *
 * Idempotent: existiert ein Attribut bereits, wird es übersprungen.
 *
 * Ausführen mit: node scripts/add-stammdaten-halbe-palette-euro.js
 */

import dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const DATABASE_ID = 'tennismehl24_db';
const STAMMDATEN_COLLECTION_ID = 'stammdaten';

const ATTRIBUTE = [
  { key: 'halbePaletteAufschlagEuro', default: 0 },
];

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT / _PROJECT_ID / APPWRITE_API_KEY)!');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

async function attributeExists(key) {
  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${STAMMDATEN_COLLECTION_ID}/attributes/${key}`,
    { method: 'GET', headers }
  );
  return res.ok;
}

async function createFloatAttribute({ key, default: defaultValue }) {
  console.log(`📝 Erstelle Float-Attribut: ${key} (Default ${defaultValue})...`);

  const res = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${STAMMDATEN_COLLECTION_ID}/attributes/float`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key,
        required: false,
        default: defaultValue,
        array: false,
      }),
    }
  );

  if (res.ok) {
    console.log(`✅ Attribut erstellt: ${key}`);
    return true;
  }

  const error = await res.json().catch(() => ({}));
  console.error(`❌ Fehler beim Erstellen von ${key}:`, error.message || res.status);
  return false;
}

async function main() {
  console.log('🔧 stammdaten: Anbruch-Aufschlag als Euro-Betrag\n');
  console.log(`Endpoint:   ${endpoint}`);
  console.log(`Collection: ${STAMMDATEN_COLLECTION_ID}\n`);

  let fehler = false;
  for (const attribut of ATTRIBUTE) {
    if (await attributeExists(attribut.key)) {
      console.log(`✅ Attribut "${attribut.key}" existiert bereits – nichts zu tun.`);
      continue;
    }
    const created = await createFloatAttribute(attribut);
    if (!created) fehler = true;
  }

  if (fehler) {
    console.error('\n❌ Migration unvollständig.');
    process.exit(1);
  }

  console.log(
    '\n✨ Fertig! Der Aufschlag für angebrochene Paletten ist jetzt als Euro-Betrag in den Stammdaten (Tab „Saison & Nummern") einstellbar.'
  );
}

main().catch((err) => {
  console.error('❌ Unerwarteter Fehler:', err);
  process.exit(1);
});
