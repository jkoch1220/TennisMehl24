/**
 * Vergrößert das `data`-Attribut der Collection `projekte` von 10.000 auf
 * 100.000 Zeichen.
 *
 * WARUM: Das Projekt speichert alle Details (Positionen, Angebots-, AB-,
 * Rechnungsdaten, Notizen) als JSON in dieser einen Spalte. Bei 10.000 Zeichen
 * ist die Grenze früher erreicht, als man denkt — ein Angebot mit vielen
 * Positionen und ausführlichen Beschreibungen reicht.
 *
 * Wird die Grenze überschritten, lehnt `projektService.updateProjekt` den
 * Speichervorgang jetzt sichtbar ab (ProjektDatenZuGrossError). Vorher wurde die
 * Änderung STILL verworfen: Der Nutzer bekam „gespeichert" zu sehen, und die
 * Eingabe war weg.
 *
 * Stand 20.08.2026 liegen 9 von 598 Projekten der Saison 2026 über 9.500 Zeichen,
 * der größte bei 9.982 — die sind faktisch schreibgeschützt, bis die Spalte wächst.
 *
 * NACH dem Lauf muss `MAX_DATA_FIELD_SIZE` in src/services/projektService.ts auf
 * einen Wert unterhalb der neuen Größe angehoben werden (z. B. 95000). Solange
 * das nicht passiert, bleibt die alte Schwelle wirksam — das ist Absicht, damit
 * Code und Schema nie auseinanderlaufen.
 *
 * Appwrite erlaubt das VERGRÖSSERN von String-Attributen ohne Datenverlust. Ein
 * Verkleinern wäre nicht möglich — dieser Schritt ist also einseitig.
 *
 * Ausführen mit: node scripts/vergroessere-projekte-data-feld.js
 * Vorschau ohne Änderung: node scripts/vergroessere-projekte-data-feld.js --dry-run
 */

import dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const DATABASE_ID = 'tennismehl24_db';
const COLLECTION_ID = 'projekte';
const ATTRIBUT = 'data';
const NEUE_GROESSE = 100000;

const dryRun = process.argv.includes('--dry-run');

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT / _PROJECT_ID / APPWRITE_API_KEY)!');
  process.exit(1);
}

const kopf = {
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
  'Content-Type': 'application/json',
};

const basis = `${endpoint}/databases/${DATABASE_ID}/collections/${COLLECTION_ID}`;

async function main() {
  // 1. Ist-Zustand lesen
  const antwort = await fetch(`${basis}/attributes/${ATTRIBUT}`, { headers: kopf });
  if (!antwort.ok) {
    console.error(`❌ Attribut "${ATTRIBUT}" konnte nicht gelesen werden: ${antwort.status} ${await antwort.text()}`);
    process.exit(1);
  }
  const attribut = await antwort.json();
  console.log(`Aktuell: ${attribut.key} (${attribut.type}), size=${attribut.size}, required=${attribut.required}, status=${attribut.status}`);

  if (attribut.status !== 'available') {
    console.error(`❌ Attribut ist im Status "${attribut.status}" — erst abwarten, bis es "available" ist.`);
    process.exit(1);
  }

  if (attribut.size >= NEUE_GROESSE) {
    console.log(`✅ Nichts zu tun: Die Spalte fasst bereits ${attribut.size} Zeichen.`);
    return;
  }

  if (dryRun) {
    console.log(`\n[Vorschau] Würde size von ${attribut.size} auf ${NEUE_GROESSE} anheben.`);
    console.log('           Bestehende Daten bleiben unverändert; Appwrite erlaubt nur Wachstum.');
    console.log('\nDanach in src/services/projektService.ts MAX_DATA_FIELD_SIZE anheben (z. B. auf 95000).');
    return;
  }

  // 2. Vergrößern. Appwrite verlangt beim Update alle Pflichtfelder des Attributs.
  const aktualisierung = await fetch(`${basis}/attributes/string/${ATTRIBUT}`, {
    method: 'PATCH',
    headers: kopf,
    body: JSON.stringify({
      required: attribut.required,
      default: attribut.required ? undefined : (attribut.default ?? null),
      size: NEUE_GROESSE,
    }),
  });

  if (!aktualisierung.ok) {
    console.error(`❌ Vergrößern fehlgeschlagen: ${aktualisierung.status} ${await aktualisierung.text()}`);
    process.exit(1);
  }

  const neu = await aktualisierung.json();
  console.log(`✅ size auf ${neu.size} angehoben (Status: ${neu.status}).`);
  console.log('   Appwrite baut das Attribut im Hintergrund um — bis es wieder "available" ist,');
  console.log('   sollten keine Projekte gespeichert werden.');
  console.log('\nNÄCHSTER SCHRITT: MAX_DATA_FIELD_SIZE in src/services/projektService.ts anheben,');
  console.log('sonst bleibt die alte Schwelle von 9500 wirksam.');
}

main().catch((fehler) => {
  console.error('❌ Unerwarteter Fehler:', fehler);
  process.exit(1);
});
