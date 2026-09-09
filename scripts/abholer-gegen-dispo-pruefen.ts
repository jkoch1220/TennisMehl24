/**
 * Gegenprobe: Wer auf der Dispo-Liste steht, wurde BELIEFERT.
 *
 * Die Belegregeln (Verladepauschale, Werkspreis ohne Fracht) schließen aus dem
 * Papier auf den Bezugsweg. Die Dispo-Liste ist die unabhängige Wirklichkeit:
 * Dort steht, wer eine Tour bekommen hat. Ein als Abholer geführter Kunde, der
 * in der Dispo auftaucht, ist ein Widerspruch — und der gehört gemeldet, bevor
 * er ein Angebot ohne Frachtkosten bekommt.
 *
 * Die Namen in der Dispo sind Kurzformen („Rammelsbach" für „TC Rammelsbach
 * e.V."), deshalb wird über markante Wortbestandteile verglichen, nicht exakt.
 *
 *   npx tsx scripts/abholer-gegen-dispo-pruefen.ts <dispo.xlsx> [--produktion]
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { Client, Databases, Query } from 'node-appwrite';

const datei = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DB = process.argv.includes('--produktion') ? 'tennismehl24_db' : 'tennismehl24_db_mock';
if (!datei) {
  console.error('Aufruf: npx tsx scripts/abholer-gegen-dispo-pruefen.ts <dispo.xlsx> [--produktion]');
  process.exit(1);
}

const db = new Databases(new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!));

/**
 * Eine .xlsx ist eine ZIP-Datei mit XML darin. Gelesen wird sie über `unzip`,
 * das auf macOS und Linux vorhanden ist — für diese eine Auswertung lohnt keine
 * zusätzliche Abhängigkeit im Projekt.
 *
 * Die Zellen enthalten meist nur einen Index in `sharedStrings.xml`; der Text
 * steht dort. Wer nur die Sheets liest, bekommt Zahlen statt Vereinsnamen.
 */
const ausZip = (pfad: string, eintrag: string): string => {
  try {
    return execFileSync('unzip', ['-p', pfad, eintrag], { maxBuffer: 64 * 1024 * 1024 }).toString('utf-8');
  } catch { return ''; }
};

const entpacke = (pfad: string): string[] => {
  const gemeinsam = [...ausZip(pfad, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, ''));

  const liste = execFileSync('unzip', ['-Z1', pfad], { maxBuffer: 16 * 1024 * 1024 })
    .toString('utf-8').split('\n')
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n.trim()));

  const texte: string[] = [];
  for (const blatt of liste) {
    const xml = ausZip(pfad, blatt.trim());
    for (const zelle of xml.matchAll(/<c[^>]*?t="s"[^>]*>\s*<v>(\d+)<\/v>/g)) {
      const i = Number(zelle[1]);
      if (Number.isFinite(i) && gemeinsam[i]) texte.push(gemeinsam[i]);
    }
  }
  return texte;
};

const normal = (s: string) => String(s ?? '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const FUELL = new Set([
  'tc', 'tsv', 'sv', 'tv', 'sc', 'fc', 'vfr', 'vfb', 'tg', 'tf', 'tsg', 'djk', 'spvgg', 'ev',
  'tennis', 'tennisclub', 'tennisverein', 'club', 'verein', 'sport', 'sportverein', 'abteilung',
  'blau', 'weiss', 'weis', 'rot', 'gruen', 'schwarz', 'ober', 'unter', 'nieder', 'gross', 'klein',
]);
const kern = (name: string) => normal(name).split(' ').filter((w) => w.length >= 5 && !FUELL.has(w));

(async () => {
  const texte = entpacke(datei);
  const dispoWorte = new Set(texte.flatMap((t) => normal(t).split(' ')).filter((w) => w.length >= 5));
  console.log(`Dispo-Liste: ${texte.length} Textzellen · ${dispoWorte.size} verschiedene Wörter\n`);

  const alle = async (coll: string) => {
    const out: Array<Record<string, unknown>> = [];
    let offset = 0;
    for (;;) {
      const r = await db.listDocuments(DB, coll, [Query.limit(100), Query.offset(offset)]);
      out.push(...(r.documents as Array<Record<string, unknown>>));
      if (r.documents.length < 100) break;
      offset += 100;
    }
    return out;
  };
  const flach = (d: Record<string, unknown>) => {
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(String(d.data ?? '{}')); } catch { /* Rohdokument genügt */ }
    return { ...j, ...d };
  };

  const kunden = (await alle('saison_kunden')).map(flach);
  const abholer = kunden.filter((k) => k.belieferungsart === 'abholung_ab_werk');
  console.log(`${abholer.length} Kunden sind als Abholer gekennzeichnet\n`);

  const widersprueche: string[] = [];
  for (const k of abholer) {
    const worte = kern(String(k.name ?? ''));
    const treffer = worte.filter((w) => dispoWorte.has(w));
    if (treffer.length === 0) continue;
    widersprueche.push(`${k.name} (${k.kundennummer ?? 'ohne Nr.'}) — Dispo nennt: ${treffer.join(', ')}`);
  }

  if (widersprueche.length === 0) {
    console.log('✓ Kein als Abholer geführter Kunde steht auf der Dispo-Liste.');
  } else {
    console.log(`${widersprueche.length} WIDERSPRUCH — steht in der Dispo, gilt aber als Abholer:`);
    widersprueche.forEach((w) => console.log(`   ${w}`));
    console.log('\nDie Dispo ist die Wirklichkeit: Diese Kunden wurden beliefert.');
    console.log('Bitte `belieferungsart` prüfen und die Zeile in den Liefer-Lauf verschieben.');
  }
})();
