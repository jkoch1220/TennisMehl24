/**
 * Stufe 1 Artikelverwaltung: Artikelstamm härten.
 *
 * Legt die neuen Klassifizierungs-Attribute an der Collection `artikel` an,
 * ergänzt die bisher fehlenden Preisfelder (einkaufspreis/streichpreis standen
 * zwar im TypeScript-Typ und in der UI, existierten in Appwrite aber nie —
 * ein eingetippter EK ließ jeden Save mit „Unknown attribute" scheitern)
 * und setzt den Unique-Index auf artikelnummer.
 *
 * Aufruf:
 *   npx tsx scripts/setup-artikel-stammfelder.ts --mock   # Sandbox zuerst!
 *   npx tsx scripts/setup-artikel-stammfelder.ts          # Produktion
 *
 * Der Unique-Index setzt voraus, dass es keine doppelten Artikelnummern gibt —
 * das Skript prüft das vorher und bricht sonst ab, statt dass Appwrite den
 * Index still verweigert.
 */

import dotenv from 'dotenv';
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen gesetzt sein.');
  process.exit(1);
}

const MOCK = process.argv.includes('--mock');
const DATABASE_ID = MOCK ? 'tennismehl24_db_mock' : 'tennismehl24_db';
const COLLECTION_ID = 'artikel';

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

type AttributDef =
  | { key: string; type: 'string'; size: number; default?: string | null }
  | { key: string; type: 'boolean'; default: boolean }
  | { key: string; type: 'float'; default?: number | null }
  | { key: string; type: 'enum'; elements: string[]; default?: string | null };

/**
 * Bewusst KEINE required-Attribute: die Collection hat 28 Bestandsdokumente,
 * und Appwrite erlaubt required nur mit leerer Collection. Pflicht wird in
 * der Anwendungsschicht (Formular-Validierung) durchgesetzt.
 *
 * warengruppe/preisTyp/lieferart/koernung als Appwrite-Enum, damit auch
 * Skripte und künftige Schreiber keine Fantasiewerte ablegen können.
 */
const NEUE_ATTRIBUTE: AttributDef[] = [
  { key: 'warengruppe', type: 'enum', elements: ['tennismehl', 'fracht', 'zubehoer', 'dienstleistung', 'universal'], default: null },
  { key: 'istTonnageRelevant', type: 'boolean', default: false },
  { key: 'preisTyp', type: 'enum', elements: ['fest', 'variabel', 'kalkuliert'], default: null },
  { key: 'erlaubteEinheit', type: 'enum', elements: ['t', 'kg', 'Stk', 'Pal', 'Platz', 'm', 'm²', 'm³', 'Std', 'Pkt'], default: null },
  { key: 'gewichtProStueckKg', type: 'float', default: null },
  { key: 'lieferart', type: 'enum', elements: ['lose', 'gesackt', 'beiladung', 'bigbag'], default: null },
  { key: 'koernung', type: 'enum', elements: ['0-2', '0-3'], default: null },
  { key: 'aktiv', type: 'boolean', default: true },
  // Bisher nur im TS-Typ vorhanden, nie in Appwrite:
  { key: 'einkaufspreis', type: 'float', default: null },
  { key: 'streichpreis', type: 'float', default: null },
];

async function api(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${json.message || text}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return json;
}

async function erstelleAttribut(attr: AttributDef) {
  const apiType = attr.type;
  const body: Record<string, unknown> = {
    key: attr.key,
    required: false,
    default: 'default' in attr ? attr.default : null,
    array: false,
  };
  if (attr.type === 'string') body.size = attr.size;
  if (attr.type === 'enum') body.elements = attr.elements;

  try {
    await api(`/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/attributes/${apiType}`, 'POST', body);
    console.log(`✅ Attribut angelegt: ${attr.key} (${attr.type})`);
  } catch (e) {
    if ((e as Error & { status?: number }).status === 409) {
      console.log(`⏭️  Attribut existiert bereits: ${attr.key}`);
    } else {
      throw e;
    }
  }
}

async function warteAufVerfuegbar(keys: string[]) {
  for (let versuch = 0; versuch < 30; versuch++) {
    const { attributes } = await api(`/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/attributes`);
    const offen = keys.filter((k) => {
      const a = attributes.find((x: { key: string; status: string }) => x.key === k);
      return !a || a.status !== 'available';
    });
    if (offen.length === 0) return;
    console.log(`⏳ Warte auf Attribut-Verarbeitung: ${offen.join(', ')}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Attribute wurden nicht innerhalb von 30s verfügbar.');
}

async function pruefeDuplikate(): Promise<void> {
  const alle: Array<{ $id: string; artikelnummer: string }> = [];
  let cursor: string | null = null;
  for (;;) {
    const queries = [`queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [100] }))}`];
    if (cursor) queries.push(`queries[]=${encodeURIComponent(JSON.stringify({ method: 'cursorAfter', values: [cursor] }))}`);
    const page = await api(`/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/documents?${queries.join('&')}`);
    alle.push(...page.documents);
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  const gesehen = new Map<string, string[]>();
  for (const a of alle) {
    const liste = gesehen.get(a.artikelnummer) ?? [];
    liste.push(a.$id);
    gesehen.set(a.artikelnummer, liste);
  }
  const duplikate = [...gesehen.entries()].filter(([, ids]) => ids.length > 1);
  if (duplikate.length > 0) {
    console.error('❌ Doppelte Artikelnummern im Bestand — Unique-Index nicht möglich:');
    for (const [nr, ids] of duplikate) console.error(`   ${nr}: ${ids.join(', ')}`);
    process.exit(1);
  }
  console.log(`✅ ${alle.length} Artikel geprüft, keine doppelten Artikelnummern.`);
}

async function erstelleUniqueIndex() {
  try {
    await api(`/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/indexes`, 'POST', {
      key: 'idx_artikelnummer_unique',
      type: 'unique',
      attributes: ['artikelnummer'],
    });
    console.log('✅ Unique-Index auf artikelnummer angelegt.');
  } catch (e) {
    if ((e as Error & { status?: number }).status === 409) {
      console.log('⏭️  Unique-Index existiert bereits.');
    } else {
      throw e;
    }
  }
}

async function main() {
  console.log(`\n📦 Artikelstamm-Setup für ${DATABASE_ID}${MOCK ? ' (SANDBOX)' : ' (PRODUKTION)'}\n`);

  await pruefeDuplikate();

  for (const attr of NEUE_ATTRIBUTE) {
    await erstelleAttribut(attr);
    await new Promise((r) => setTimeout(r, 200));
  }

  await warteAufVerfuegbar(NEUE_ATTRIBUTE.map((a) => a.key));
  console.log('✅ Alle Attribute verfügbar.');

  await erstelleUniqueIndex();

  console.log('\n🎉 Fertig. Nächster Schritt: npx tsx scripts/befuelle-artikel-stammfelder.ts' + (MOCK ? ' --mock' : ''));
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
