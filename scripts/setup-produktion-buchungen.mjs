/**
 * Legt die Collection `produktion_buchungen` an — eine Buchung je Dokument
 * (Rohmaterial, Mahlen, Abfüllung).
 *
 * Ersetzt den Altbestand `produktion_eintraege/produktion_verlauf`, der ALLE
 * Einträge als ein JSON-Feld in einem einzigen Dokument hielt. Das Feld war auf
 * 100.000 Zeichen deklariert, die Appwrite-Zeile aber auf 65.535 Bytes — bei
 * rund 130 Bytes je Eintrag wäre nach etwa 450 Buchungen ohne Fehlermeldung
 * Schluss gewesen.
 *
 * Idempotent: vorhandene Collection, Attribute und Indizes werden übersprungen.
 *
 * Ausführen:  node scripts/setup-produktion-buchungen.mjs
 *   Sandbox:  node scripts/setup-produktion-buchungen.mjs --mock
 */

import 'dotenv/config';

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const mock = process.argv.includes('--mock');
const databaseId = mock ? 'tennismehl24_db_mock' : 'tennismehl24_db';
const COLLECTION_ID = 'produktion_buchungen';

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Umgebungsvariablen fehlen (VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY)');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

const basis = `${endpoint}/databases/${databaseId}/collections/${COLLECTION_ID}`;

/**
 * Attribute. Die Größen sind bewusst knapp gehalten: Appwrite legt String-
 * Attribute in einer MariaDB-Zeile ab, deren Gesamtgröße auf 65.535 Bytes
 * begrenzt ist (utf8mb4 → 4 Bytes je Zeichen). Großzügige Größen kosten hier
 * nichts an Speicher, aber irgendwann die Möglichkeit, weitere Felder
 * hinzuzufügen.
 */
const ATTRIBUTE = [
  { key: 'bereich', typ: 'string', size: 20, required: true },
  { key: 'datum', typ: 'string', size: 10, required: true },
  { key: 'zeitpunkt', typ: 'datetime', required: false },
  { key: 'tonnen', typ: 'float', required: true },
  { key: 'koernung', typ: 'string', size: 20 },
  { key: 'lieferant', typ: 'string', size: 120 },
  { key: 'kennzeichen', typ: 'string', size: 24 },
  { key: 'wiegeschein', typ: 'string', size: 40 },
  { key: 'gebinde', typ: 'string', size: 20 },
  { key: 'gebindeAnzahl', typ: 'float' },
  { key: 'notiz', typ: 'string', size: 500 },
  { key: 'erfasstVonId', typ: 'string', size: 40 },
  { key: 'erfasstVonName', typ: 'string', size: 120 },
  { key: 'quelle', typ: 'string', size: 20 },
  { key: 'storniert', typ: 'boolean', required: false, default: false },
  { key: 'storniertVonName', typ: 'string', size: 120 },
  { key: 'storniertAm', typ: 'datetime' },
  { key: 'storniertGrund', typ: 'string', size: 300 },

  /**
   * Idempotenz-Schlüssel, im Browser erzeugt (crypto.randomUUID()), BEVOR
   * gesendet wird. Ohne ihn ist der Offline-Betrieb eine Doppelbuchungs-
   * maschine: eine Buchung, die beim Verbindungsabbruch schon angekommen war,
   * würde beim Nachsenden ein zweites Mal geschrieben. Mit Unique-Index läuft
   * das Nachsenden stattdessen in einen 409 — und 409 heißt hier ERFOLG.
   */
  { key: 'clientId', typ: 'string', size: 64 },
  /**
   * Wurde der Lagerbestand tatsächlich fortgeschrieben? Die Buchung selbst
   * steht auch dann, wenn der Lagerabgleich scheitert — dann aber sichtbar
   * gekennzeichnet statt still.
   */
  { key: 'lagerGebucht', typ: 'boolean', required: false, default: true },
  /** Storno → Korrekturbuchung: macht die Kette im Verlauf lesbar. */
  { key: 'ersetztBuchungId', typ: 'string', size: 40 },
  /**
   * Der Erfasser hat eine erkannte Wiegeschein-Dublette bewusst gebucht (zwei
   * Ziegeleien können dieselbe Nummer vergeben). Trennt Versehen von Absicht —
   * ohne das Feld sieht beides in der Auswertung gleich aus.
   */
  { key: 'dublettenBestaetigt', typ: 'boolean', required: false, default: false },
];

/**
 * Indizes. `bereich_datum` trägt die Standardabfrage (ein Bereich, ein
 * Zeitraum); `datum` allein die bereichsübergreifende Auswertung. Der Index auf
 * `wiegeschein` macht die Dublettenprüfung bezahlbar.
 */
const INDIZES = [
  { key: 'idx_datum', typ: 'key', attribute: ['datum'], orders: ['DESC'] },
  { key: 'idx_bereich_datum', typ: 'key', attribute: ['bereich', 'datum'], orders: ['ASC', 'DESC'] },
  { key: 'idx_storniert', typ: 'key', attribute: ['storniert'], orders: ['ASC'] },
  { key: 'idx_wiegeschein', typ: 'key', attribute: ['wiegeschein'], orders: ['ASC'] },
  // Unique: trägt die Idempotenz beim Nachsenden gepufferter Buchungen.
  { key: 'idx_clientId', typ: 'unique', attribute: ['clientId'], orders: ['ASC'] },
  { key: 'idx_erfasser', typ: 'key', attribute: ['erfasstVonId'], orders: ['ASC'] },
];

async function collectionAnlegen() {
  const vorhanden = await fetch(basis, { method: 'GET', headers });
  if (vorhanden.ok) {
    console.log(`ℹ️  Collection ${COLLECTION_ID} existiert bereits`);
    return;
  }

  const res = await fetch(`${endpoint}/databases/${databaseId}/collections`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      collectionId: COLLECTION_ID,
      name: 'Produktion Buchungen',
      // Wie bei den übrigen Portal-Collections: Rechte hängen an der Rolle im
      // Portal (Tool `produktion`), nicht an Appwrite-Dokumentrechten.
      permissions: ['read("users")', 'create("users")', 'update("users")', 'delete("users")'],
      documentSecurity: false,
    }),
  });

  if (!res.ok) {
    const fehler = await res.json().catch(() => ({}));
    throw new Error(`Collection konnte nicht angelegt werden: ${fehler.message ?? res.status}`);
  }
  console.log(`✅ Collection ${COLLECTION_ID} angelegt`);
}

async function attributAnlegen(attr) {
  const body = { key: attr.key, required: attr.required ?? false };

  if (attr.typ === 'string') body.size = attr.size ?? 255;
  // Appwrite lehnt `default` bei required-Attributen ab.
  if (!body.required) body.default = attr.default ?? null;

  const res = await fetch(`${basis}/attributes/${attr.typ}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (res.ok) {
    console.log(`✅ Attribut ${attr.key} (${attr.typ})`);
    return;
  }
  if (res.status === 409) {
    console.log(`ℹ️  Attribut ${attr.key} existiert bereits`);
    return;
  }
  const fehler = await res.json().catch(() => ({}));
  console.error(`❌ Attribut ${attr.key}: ${fehler.message ?? res.status}`);
}

/**
 * Appwrite legt Attribute asynchron an. Ein Index auf ein Attribut im Status
 * `processing` schlägt fehl — deshalb wird gewartet, bis alle benötigten
 * Attribute `available` melden.
 */
async function warteAufAttribute(keys, maxSekunden = 60) {
  for (let versuch = 0; versuch < maxSekunden; versuch++) {
    const res = await fetch(`${basis}/attributes?queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [100] }))}`, {
      method: 'GET',
      headers,
    });
    if (res.ok) {
      const daten = await res.json();
      const status = new Map((daten.attributes ?? []).map((a) => [a.key, a.status]));
      const offen = keys.filter((k) => status.get(k) !== 'available');
      if (offen.length === 0) return true;
      if (versuch === 0) console.log(`⏳ Warte auf Attribute: ${offen.join(', ')}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn('⚠️  Attribute wurden nicht rechtzeitig verfügbar — Indizes ggf. erneut anlegen');
  return false;
}

async function indexAnlegen(idx) {
  const vorhandene = await fetch(`${basis}/indexes`, { method: 'GET', headers });
  if (vorhandene.ok) {
    const daten = await vorhandene.json();
    if ((daten.indexes ?? []).some((i) => i.key === idx.key)) {
      console.log(`ℹ️  Index ${idx.key} existiert bereits`);
      return;
    }
  }

  const res = await fetch(`${basis}/indexes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      key: idx.key,
      type: idx.typ,
      attributes: idx.attribute,
      orders: idx.orders,
    }),
  });

  if (res.ok) {
    console.log(`✅ Index ${idx.key}`);
    return;
  }
  const fehler = await res.json().catch(() => ({}));
  console.error(`❌ Index ${idx.key}: ${fehler.message ?? res.status}`);
}

async function main() {
  console.log(`\n🏭 Produktions-Buchungen einrichten (Datenbank: ${databaseId})\n`);

  await collectionAnlegen();

  for (const attr of ATTRIBUTE) {
    await attributAnlegen(attr);
  }

  await warteAufAttribute(['datum', 'bereich', 'storniert', 'wiegeschein', 'clientId', 'erfasstVonId']);

  for (const idx of INDIZES) {
    await indexAnlegen(idx);
  }

  console.log('\n✅ Fertig. Nächster Schritt: node scripts/migriere-produktion-buchungen.mjs\n');
}

main().catch((fehler) => {
  console.error('\n❌ Abbruch:', fehler.message);
  process.exit(1);
});
