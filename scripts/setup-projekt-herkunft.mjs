/**
 * Setup: Herkunft eines Projekts als echte Spalte (idempotent)
 *
 * Bis hierher war die Herkunft nur aus Namensmustern erschließbar: `kundeId`
 * beginnt mit `shop-`, die AB-Nummer mit `SHOP-`, der Projektname mit `Shop #`.
 * Das funktioniert, solange niemand ein Projekt umbenennt — und es kostet bei
 * jeder Anzeige eine Ableitung. Für die Anfragen-Herkunft ging es gar nicht:
 * die steht ausschließlich auf der Anfrage, nicht am Projekt.
 *
 * Angelegt werden:
 *   projekte.herkunft            'shop' | 'platzbau' | 'anfrage' | leer (= direkt)
 *   projekte.shopBestellnummer   Bestellnummer aus dem Gambio-Shop
 *   shop_bestellungen.projektIds JSON-Array der erzeugten Projekt-IDs
 *
 * Die Migration schreibt NUR, was aus den vorhandenen Mustern eindeutig folgt,
 * und fasst kein Projekt an, das bereits einen Wert trägt.
 *
 * WICHTIG — `herkunft` bleibt bewusst OPTIONAL: Solange die Migration auf einer
 * Umgebung nicht gelaufen ist, muss der alte Ableitungsweg weiter funktionieren.
 * `projektHerkunft.ts` bevorzugt die Spalte und fällt sonst auf die Muster
 * zurück; `SCHEMA_V39_OPTIONALE_FELDER` in projektService.ts fängt das
 * "Unknown attribute" beim Schreiben ab.
 *
 * Aufruf:  node scripts/setup-projekt-herkunft.mjs [--dry-run]
 */
import { readFileSync } from 'fs';
import { Client, Databases, Query } from 'node-appwrite';

const DRY_RUN = process.argv.includes('--dry-run');

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT = env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = env.APPWRITE_API_KEY;
const DB = 'tennismehl24_db';

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen in .env gesetzt sein');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new Databases(client);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ATTRIBUTE = [
  ['projekte', 'herkunft', 32],
  ['projekte', 'shopBestellnummer', 64],
  // Klein gehalten: eine Bestellung zerfällt in höchstens zwei Projekte (Eigen-
  // und Universalware), das sind ~50 Zeichen JSON. `shop_bestellungen` führt
  // bereits emailHtml/emailText/positionen und stößt an Appwrites Grenze für die
  // Gesamtgröße einer Zeile — jedes Zeichen zählt hier wörtlich.
  ['shop_bestellungen', 'projektIds', 255],
];

/**
 * `listAttributes` paginiert (Default 25). Ohne Limit übersieht der
 * Idempotenz-Check Attribute bei Collections wie `shop_bestellungen` (25!) —
 * und legt sie ein zweites Mal an, was Appwrite mit einem Konflikt quittiert.
 */
async function ensureStringAttr(coll, key, size) {
  const attrs = await db.listAttributes(DB, coll, [Query.limit(500)]);
  if (attrs.attributes.some((a) => a.key === key)) {
    console.log(`OK  ${coll}.${key} existiert`);
    return false;
  }
  if (DRY_RUN) {
    console.log(`DRY ${coll}.${key} würde angelegt (string, ${size}, optional)`);
    return false;
  }
  await db.createStringAttribute(DB, coll, key, size, false);
  console.log(`NEU ${coll}.${key} angelegt (string, ${size}, optional)`);
  // Appwrite legt Attribute asynchron an; sofortiges Schreiben scheitert sonst.
  await sleep(1500);
  return true;
}

/** Alle Dokumente einer Collection, über den Cursor paginiert. */
async function ladeAlle(coll) {
  const out = [];
  let cursor;
  for (;;) {
    const queries = [Query.limit(500), ...(cursor ? [Query.cursorAfter(cursor)] : [])];
    const r = await db.listDocuments(DB, coll, queries);
    out.push(...r.documents);
    if (r.documents.length < 500) break;
    cursor = r.documents[r.documents.length - 1].$id;
  }
  return out;
}

/**
 * Bestellnummer eines Shop-Projekts. Gleiche Regeln wie `getShopBestellnummer`
 * in src/utils/projektHerkunft.ts — beide Seiten müssen dasselbe verstehen.
 */
function shopBestellnummer(p) {
  const ab = String(p.auftragsbestaetigungsnummer || '');
  const ausAb = ab.match(/^SHOP-(.+?)(?:-[UE])?$/);
  if (ausAb) return ausAb[1];
  const name = String(p.projektName || '');
  const ausName = name.match(/^Shop #(\S+)/);
  if (ausName) return ausName[1];
  const kid = String(p.kundeId || '');
  const ausKunde = kid.match(/^shop-(.+?)-(?:universal|eigen)$/);
  return ausKunde ? ausKunde[1] : undefined;
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY-RUN — es wird nichts geschrieben\n' : '✏️  SCHREIBMODUS\n');

  console.log('— Attribute —');
  const fehlend = new Set();
  for (const [coll, key, size] of ATTRIBUTE) {
    try {
      await ensureStringAttr(coll, key, size);
    } catch (error) {
      // Ein nicht anlegbares Attribut ist ein Grund weiterzumachen, nicht
      // abzubrechen: Die Herkunft am Projekt ist der Kern, der Rückverweis an
      // der Bestellung nur Bequemlichkeit. Ein Abbruch hier ließe die Migration
      // halb erledigt zurück.
      console.warn(`⚠️  ${coll}.${key} konnte nicht angelegt werden: ${error.message}`);
      fehlend.add(`${coll}.${key}`);
    }
  }

  console.log('\n— Altbestand —');
  const [projekte, anfragen] = await Promise.all([ladeAlle('projekte'), ladeAlle('anfragen')]);

  // Die Anfragen-Herkunft steht NUR auf der Anfrage. Beide Richtungen der
  // Projekt-ID prüfen: historisch wurde mal `$id`, mal die interne `id` abgelegt.
  const ausAnfrage = new Set();
  for (const a of anfragen) if (a.projektId) ausAnfrage.add(String(a.projektId));

  const zaehler = { shop: 0, platzbau: 0, anfrage: 0, direkt: 0, uebersprungen: 0, fehler: 0 };
  const shopZuProjekte = new Map();

  for (const doc of projekte) {
    let data = {};
    try {
      data = JSON.parse(doc.data || '{}');
    } catch {
      /* defekter Blob — die Top-Level-Felder reichen für die Herkunft */
    }
    const p = { ...data, ...doc };

    if (doc.herkunft) {
      zaehler.uebersprungen += 1;
      continue;
    }

    const name = String(p.projektName || '');
    const kundeId = String(p.kundeId || '');
    const abNummer = String(p.auftragsbestaetigungsnummer || '');

    let herkunft;
    if (kundeId.startsWith('shop-') || abNummer.startsWith('SHOP-') || name.startsWith('Shop #')) {
      herkunft = 'shop';
    } else if (
      p.istPlatzbauerprojekt ||
      p.platzbauerId ||
      p.bezugsweg === 'platzbauer' ||
      p.zugeordnetesPlatzbauerprojektId
    ) {
      herkunft = 'platzbau';
    } else if (ausAnfrage.has(String(doc.$id)) || (p.id && ausAnfrage.has(String(p.id)))) {
      herkunft = 'anfrage';
    }

    if (!herkunft) {
      // Kein Muster trifft zu. Bewusst KEIN 'direkt' eintragen: Eine Anfrage
      // kann diesem Projekt später noch zugeordnet werden, und ein vorschnelles
      // 'direkt' würde die Erkennung dann dauerhaft blockieren. Leer heißt
      // „keine Festlegung", nicht „von Hand angelegt".
      zaehler.direkt += 1;
      continue;
    }

    const felder = { herkunft };
    if (herkunft === 'shop') {
      const nummer = shopBestellnummer(p);
      if (nummer) {
        felder.shopBestellnummer = nummer;
        const liste = shopZuProjekte.get(nummer) ?? [];
        liste.push(doc.$id);
        shopZuProjekte.set(nummer, liste);
      }
    }

    if (DRY_RUN) {
      zaehler[herkunft] += 1;
      continue;
    }

    try {
      await db.updateDocument(DB, 'projekte', doc.$id, felder);
      zaehler[herkunft] += 1;
    } catch (error) {
      console.warn(`  ⚠️  ${doc.$id} (${name}): ${error.message}`);
      zaehler.fehler += 1;
    }
  }

  console.log(
    `  shop=${zaehler.shop}  platzbau=${zaehler.platzbau}  anfrage=${zaehler.anfrage}` +
      `  direkt(ohne Wert)=${zaehler.direkt}  bereits gesetzt=${zaehler.uebersprungen}` +
      (zaehler.fehler ? `  FEHLER=${zaehler.fehler}` : '')
  );

  // Rückrichtung: an der Shop-Bestellung steht, welche Projekte aus ihr wurden.
  // Eine Bestellung kann in zwei Projekte zerfallen (Eigen- und Universalware),
  // deshalb ein Array und kein einzelnes Feld.
  console.log('\n— Rückverweis an den Shop-Bestellungen —');
  if (fehlend.has('shop_bestellungen.projektIds')) {
    console.log('  übersprungen — Spalte nicht vorhanden. Die Zuordnung bleibt über');
    console.log('  projekte.shopBestellnummer auffindbar, nur eben nicht von der');
    console.log('  Bestellung aus. Für die Rückrichtung müsste in shop_bestellungen');
    console.log('  zuerst Platz frei werden (emailHtml/emailText sind die Kandidaten).');
    console.log(DRY_RUN ? '\n🔍 DRY-RUN beendet — nichts geändert.' : '\n✅ Fertig.');
    return;
  }
  const bestellungen = await ladeAlle('shop_bestellungen');
  let verknuepft = 0;
  let ohneTreffer = 0;
  for (const b of bestellungen) {
    const nummer = String(b.bestellnummer || '');
    const ids = shopZuProjekte.get(nummer);
    if (!ids || ids.length === 0) {
      ohneTreffer += 1;
      continue;
    }
    const neu = JSON.stringify(ids);
    if (b.projektIds === neu) continue;
    if (DRY_RUN) {
      verknuepft += 1;
      continue;
    }
    try {
      await db.updateDocument(DB, 'shop_bestellungen', b.$id, { projektIds: neu });
      verknuepft += 1;
    } catch (error) {
      console.warn(`  ⚠️  Bestellung ${nummer}: ${error.message}`);
    }
  }
  console.log(`  verknüpft=${verknuepft}  ohne zugehöriges Projekt=${ohneTreffer}  gesamt=${bestellungen.length}`);

  console.log(DRY_RUN ? '\n🔍 DRY-RUN beendet — nichts geändert.' : '\n✅ Fertig.');
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
