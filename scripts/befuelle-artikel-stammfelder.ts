/**
 * Stufe 1 Artikelverwaltung: einmaliges Befüllen der neuen Stammfelder.
 *
 * Überträgt die bisher im Code verstreute Fach-Semantik in die Collection:
 * - TENNISMEHL_ARTIKEL (src/constants/artikelPreise.ts): lieferart, koernung,
 *   gewichtProStueckKg
 * - NICHT_MATERIAL_ARTIKEL (src/utils/dispoMaterialParser.ts): Blockliste für
 *   die Tonnage → hier invertiert als istTonnageRelevant
 * - Live-Bestand vom 31.08.2026 (28 Artikel, prod == mock)
 *
 * preisTyp: bewusst KEIN Artikel auf 'fest' — welche Artikel Fixpreise sind,
 * ist Julians Entscheidung (Entscheidungsbedarf Nr. 2 im Redesign-Plan).
 * 'kalkuliert' nur dort, wo der Code den Preis nachweislich dynamisch
 * berechnet (TM-FP: Mindermengenpauschale-Staffel, TM-FK: Frachtkosten-
 * Kalkulation). Alles andere startet als 'variabel'.
 *
 * Aufruf:
 *   npx tsx scripts/befuelle-artikel-stammfelder.ts --mock          # Dry-Run Sandbox
 *   npx tsx scripts/befuelle-artikel-stammfelder.ts --mock --run    # Sandbox schreiben
 *   npx tsx scripts/befuelle-artikel-stammfelder.ts --run           # Produktion schreiben
 */

import dotenv from 'dotenv';
dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const MOCK = process.argv.includes('--mock');
const RUN = process.argv.includes('--run');
const DATABASE_ID = MOCK ? 'tennismehl24_db_mock' : 'tennismehl24_db';
const COLLECTION_ID = 'artikel';

export interface Klassifizierung {
  warengruppe: 'tennismehl' | 'fracht' | 'zubehoer' | 'dienstleistung' | 'universal';
  istTonnageRelevant: boolean;
  preisTyp: 'fest' | 'variabel' | 'kalkuliert';
  lieferart?: 'lose' | 'gesackt' | 'beiladung' | 'bigbag';
  koernung?: '0-2' | '0-3';
  gewichtProStueckKg?: number;
}

/**
 * Nur exakte Artikelnummern, bewusst keine Muster — dieselbe Lehre wie bei
 * NICHT_MATERIAL_ARTIKEL: „Tennismehl 0/2 Schüttgut inkl. Frachtkosten"
 * enthält das Wort Frachtkosten und ist trotzdem Ware.
 */
export const KLASSIFIZIERUNG: Record<string, Klassifizierung> = {
  // === Ware (zählt in die Saison-Tonnage) ===
  'TM-ZM-02':     { warengruppe: 'tennismehl', istTonnageRelevant: true, preisTyp: 'variabel', lieferart: 'lose', koernung: '0-2' },
  'TM-ZM-03':     { warengruppe: 'tennismehl', istTonnageRelevant: true, preisTyp: 'variabel', lieferart: 'lose', koernung: '0-3' },
  'TM-ZM-02St':   { warengruppe: 'tennismehl', istTonnageRelevant: true, preisTyp: 'variabel', lieferart: 'gesackt', koernung: '0-2', gewichtProStueckKg: 1000 },
  'TM-ZM-03St':   { warengruppe: 'tennismehl', istTonnageRelevant: true, preisTyp: 'variabel', lieferart: 'gesackt', koernung: '0-3', gewichtProStueckKg: 1000 },
  // Palette (25 × 40 kg) und BigBag ≈ 1000 kg: Nominalgewicht pro Stück für
  // Stk-fakturierte Positionen (Julian, 01.09.2026). Die Stamm-Einheit bleibt t.
  // Beiladung wird in Stück (40-kg-Säcke) geführt → Tonnage über gewichtProStueckKg
  'TM-ZM-02S':    { warengruppe: 'tennismehl', istTonnageRelevant: true, preisTyp: 'variabel', lieferart: 'beiladung', koernung: '0-2', gewichtProStueckKg: 40 },
  'TM-ZM-03S':    { warengruppe: 'tennismehl', istTonnageRelevant: true, preisTyp: 'variabel', lieferart: 'beiladung', koernung: '0-3', gewichtProStueckKg: 40 },
  'TM-ZM-BIG-02': { warengruppe: 'tennismehl', istTonnageRelevant: true, preisTyp: 'variabel', lieferart: 'bigbag', koernung: '0-2', gewichtProStueckKg: 1000 },
  'TM-ZM-BIG-03': { warengruppe: 'tennismehl', istTonnageRelevant: true, preisTyp: 'variabel', lieferart: 'bigbag', koernung: '0-3', gewichtProStueckKg: 1000 },

  // === Fracht/Versand (Einheit teils 't', trotzdem keine Ware!) ===
  'TM-FK':        { warengruppe: 'fracht', istTonnageRelevant: false, preisTyp: 'kalkuliert' },
  'TM-FP':        { warengruppe: 'fracht', istTonnageRelevant: false, preisTyp: 'kalkuliert' },
  'TM-FKZ':       { warengruppe: 'fracht', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-MM':        { warengruppe: 'fracht', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-HYC-V':     { warengruppe: 'fracht', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-UV-SPZ':    { warengruppe: 'fracht', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-UV-VK':     { warengruppe: 'fracht', istTonnageRelevant: false, preisTyp: 'variabel' },

  // === Zubehör ===
  'TM-PE':        { warengruppe: 'zubehoer', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-PAL':       { warengruppe: 'zubehoer', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-BDK':       { warengruppe: 'zubehoer', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-BDR':       { warengruppe: 'zubehoer', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-HYC':       { warengruppe: 'zubehoer', istTonnageRelevant: false, preisTyp: 'variabel' },
  'ZM-LIN-M':     { warengruppe: 'zubehoer', istTonnageRelevant: false, preisTyp: 'variabel' },

  // === Dienstleistungen ===
  'TM-LKW-KR':    { warengruppe: 'dienstleistung', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-VP':        { warengruppe: 'dienstleistung', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-ISF':       { warengruppe: 'dienstleistung', istTonnageRelevant: false, preisTyp: 'variabel' },
  'TM-ZSH':       { warengruppe: 'dienstleistung', istTonnageRelevant: false, preisTyp: 'variabel' },
  'ZM-FA':        { warengruppe: 'dienstleistung', istTonnageRelevant: false, preisTyp: 'variabel' },
  'ZM-FI':        { warengruppe: 'dienstleistung', istTonnageRelevant: false, preisTyp: 'variabel' },
  'ZM-FI-A':      { warengruppe: 'dienstleistung', istTonnageRelevant: false, preisTyp: 'variabel' },
};

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId ?? '',
  'X-Appwrite-Key': apiKey ?? '',
};

async function api(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.message}`);
  return json;
}

async function main() {
  if (!endpoint || !projectId || !apiKey) {
    console.error('❌ VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID und APPWRITE_API_KEY müssen gesetzt sein.');
    process.exit(1);
  }

  console.log(`\n📦 Befülle Artikel-Stammfelder in ${DATABASE_ID}${RUN ? '' : ' (DRY-RUN — nichts wird geschrieben)'}\n`);

  const alle: Array<Record<string, unknown> & { $id: string; artikelnummer: string; einheit: string }> = [];
  let cursor: string | null = null;
  for (;;) {
    const queries = [`queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [100] }))}`];
    if (cursor) queries.push(`queries[]=${encodeURIComponent(JSON.stringify({ method: 'cursorAfter', values: [cursor] }))}`);
    const page = await api(`/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/documents?${queries.join('&')}`);
    alle.push(...page.documents);
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }

  let geschrieben = 0;
  const unbekannt: string[] = [];

  for (const artikel of alle) {
    const klasse = KLASSIFIZIERUNG[artikel.artikelnummer];
    if (!klasse) {
      unbekannt.push(artikel.artikelnummer);
      continue;
    }
    const update = {
      warengruppe: klasse.warengruppe,
      istTonnageRelevant: klasse.istTonnageRelevant,
      preisTyp: klasse.preisTyp,
      // Die erlaubte Einheit ist die, mit der der Artikel heute im Stamm steht.
      erlaubteEinheit: artikel.einheit,
      lieferart: klasse.lieferart ?? null,
      koernung: klasse.koernung ?? null,
      gewichtProStueckKg: klasse.gewichtProStueckKg ?? null,
      aktiv: true,
    };
    console.log(`${RUN ? '✍️ ' : '👁  '}${artikel.artikelnummer.padEnd(14)} → ${klasse.warengruppe.padEnd(14)} tonnage=${klasse.istTonnageRelevant ? 'ja' : 'nein'} preisTyp=${klasse.preisTyp} einheit=${artikel.einheit}${klasse.lieferart ? ' lieferart=' + klasse.lieferart : ''}${klasse.koernung ? ' koernung=' + klasse.koernung : ''}`);
    if (RUN) {
      await api(`/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/documents/${artikel.$id}`, 'PATCH', { data: update });
      geschrieben++;
    }
  }

  if (unbekannt.length > 0) {
    console.warn(`\n⚠️  ${unbekannt.length} Artikel ohne Klassifizierung (bleiben unangetastet, warengruppe=null):`);
    console.warn('   ' + unbekannt.join(', '));
    console.warn('   → Diese Artikel fallen in Auswertungen unter „nicht klassifiziert" und müssen in der UI nachgepflegt werden.');
  }

  console.log(`\n${RUN ? `🎉 ${geschrieben} Artikel aktualisiert.` : `👁  Dry-Run: ${alle.length - unbekannt.length} Artikel würden aktualisiert.`}`);
}

// Nur bei direktem Aufruf ausführen — Tests importieren KLASSIFIZIERUNG ohne Nebenwirkung.
if (process.argv[1]?.includes('befuelle-artikel-stammfelder')) {
  main().catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  });
}
