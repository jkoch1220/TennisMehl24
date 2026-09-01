/**
 * Findet E-Mail-Adressen für Kunden, bei denen im Stamm keine steht.
 *
 * Grundlage ist der Header-Dump aus `postfach-adressen-dump.cjs`. Ein Verein
 * ohne hinterlegte Adresse hat trotzdem geschrieben oder Post bekommen — die
 * Adresse liegt im Postfach, nur nicht im Kundenstamm.
 *
 * Zugeordnet wird über drei unabhängige Wege, jeder mit eigener Aussagekraft:
 *   1. Kundennummer im Betreff (K10169) — praktisch fälschungssicher
 *   2. Ortsteil der Domain oder des Absendernamens trifft den Vereinsnamen
 *   3. markante Namensbestandteile im Absendernamen
 *
 * ENTSCHEIDENDER FILTER (aus der letzten Runde gelernt): Eine Adresse, die bei
 * MEHREREN VERSCHIEDENEN Vereinen auftaucht, gehört einem Dienstleister —
 * Platzbauer, Spedition, Zubehörhändler — und niemals dem Verein. Ebenso raus:
 * die gepflegte Blockliste und alle eigenen Adressen.
 *
 *   npx tsx scripts/emails-zu-kunden-finden.ts [--dump=postfach-adressen.json]
 *                                              [--csv=kundenstamm-offene-punkte.csv]
 *                                              [--nur-mit-projekt] [--out=<datei>]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
})) as Record<string, string>;

const DUMP = args.dump || 'postfach-adressen.json';
const CSV = args.csv || 'kundenstamm-offene-punkte.csv';
const NUR_MIT_PROJEKT = args['nur-mit-projekt'] === 'true';
const OUT = args.out || 'email-vorschlaege.csv';

interface Kopf {
  von: Array<{ name: string; adresse: string }>;
  an: Array<{ name: string; adresse: string }>;
  betreff: string;
  datum: string;
  konto: string;
  ordner: string;
}

interface Kunde {
  kundennummer: string; name: string; plz: string; ort: string;
  strasse: string; projekte: number; letztesProjekt: string;
}

// ─── Wörter, die keinen Verein unterscheiden ────────────────────────────────
const FUELLWOERTER = new Set([
  // Rechtsform, Vereinskürzel, Branche
  'tc', 'tsv', 'sv', 'tv', 'sc', 'fc', 'vfr', 'vfb', 'tg', 'tf', 'tsg', 'djk', 'spvgg',
  'ev', 'e', 'v', 'de', 'der', 'die', 'das', 'und', 'am', 'im', 'zu', 'von', 'gmbh',
  'verein', 'tennis', 'tennisclub', 'tennisverein', 'club', 'abteilung', 'ta', 'sport',
  'sportverein', 'turnverein', 'sportanlage', 'sportanlagen', 'sportplatz', 'anlage',
  'anlagen', 'platz', 'plaetze', 'service', 'freizeit', 'gemeinde', 'stadt', 'markt',
  'inkl', 'herrn', 'frau', 'firma', '1', 'e.v', 'e.v.',
  // Farben — „Schwarz-Weiß" unterscheidet keinen Verein, traf aber weinbrecht-bau.de
  'blau', 'rot', 'weiss', 'weis', 'weiß', 'gruen', 'grün', 'schwarz', 'gelb', 'gold',
  // Lagebezeichnungen — „Ober" aus Ober-Erlenbach traf wahllos
  'ober', 'unter', 'nieder', 'gross', 'klein', 'neu', 'alt', 'nord', 'sued', 'ost', 'west',
  'oberer', 'unterer', 'mitte', 'bad',
]);

/**
 * Dekodiert MIME-kodierte Kopfzeilen (RFC 2047).
 *
 * Betreffs mit Umlauten kommen als `=?utf-8?Q?Auftragsbest=C3=A4tigung...?=`
 * an. Undekodiert zerfällt jedes Wort mit Umlaut in Bruchstücke — genau die
 * deutschen Vereinsnamen, um die es hier geht.
 */
function dekodiereMime(roh: string): string {
  return String(roh ?? '').replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_treffer, zeichensatz: string, art: string, nutzlast: string) => {
      try {
        const puffer = art.toUpperCase() === 'B'
          ? Buffer.from(nutzlast, 'base64')
          : Buffer.from(nutzlast.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g,
              (__, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'binary');
        const cs = zeichensatz.toLowerCase();
        return puffer.toString(cs.includes('utf') ? 'utf8' : 'latin1');
      } catch {
        return nutzlast;
      }
    }
  ).replace(/\?=\s*=\?/g, '');
}

const normal = (s: string) => String(s ?? '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Markante Wörter eines Namens: alles, was den Verein wirklich unterscheidet. */
const kernwoerter = (name: string): string[] =>
  normal(name).split(' ').filter((w) => w.length >= 5 && !FUELLWOERTER.has(w));

const blockliste = JSON.parse(readFileSync('scripts/dienstleister-blockliste.json', 'utf-8')) as {
  domains: string[]; adressen: string[]; kundenNamen: string[];
};
const BLOCK_DOMAINS = new Set(blockliste.domains.map((d) => d.toLowerCase()));
const BLOCK_ADRESSEN = new Set(blockliste.adressen.map((a) => a.toLowerCase()));
const EIGEN = /@(tennismehl\.com|tennismehl24\.com)$/i;

/**
 * Zerlegt eine Adresse in echte Wörter: `tc-rodenbach.de` → tc, rodenbach, de.
 *
 * Teilstring-Vergleiche waren die Hauptquelle für Fehlzuordnungen — „eiche"
 * traf „Eichelbrönner", „roden" traf „Rodenbach", „franken" traf
 * „sparkasse-tauberfranken.de". Ein Kernwort muss als eigenes Wort auftreten.
 */
const tokens = (s: string): Set<string> =>
  new Set(normal(s).split(' ').filter(Boolean));

/**
 * Wortweiser Treffer, mit einer Ausnahme: Sehr lange Kernwörter dürfen auch
 * in einem zusammengeschriebenen Wort stecken (`tctsfairplay@web.de` enthält
 * „fairplay"). Unter acht Zeichen ist das zu unspezifisch.
 */
const trifftWort = (heuhaufen: string, wort: string): boolean =>
  tokens(heuhaufen).has(wort) || (wort.length >= 8 && normal(heuhaufen).includes(wort));

const domainVon = (a: string) => a.split('@')[1] ?? '';
const istBrauchbar = (a: string) =>
  !EIGEN.test(a) && !BLOCK_ADRESSEN.has(a) && !BLOCK_DOMAINS.has(domainVon(a))
  && !/^(no[-_.]?reply|noreply|donotreply|mailer-daemon|postmaster|bounce)/i.test(a);

// ─── Einlesen ───────────────────────────────────────────────────────────────
if (!existsSync(DUMP)) {
  console.error(`${DUMP} fehlt — zuerst: node scripts/postfach-adressen-dump.cjs --since=2018`);
  process.exit(1);
}
const koepfe = JSON.parse(readFileSync(DUMP, 'utf-8')) as Kopf[];

const zeilen = readFileSync(CSV, 'utf-8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const spalten = zeilen[0].split(';');
const idx = (n: string) => spalten.indexOf(n);
let kunden: Kunde[] = zeilen.slice(1).map((z) => {
  const t = z.split(';');
  return {
    kundennummer: t[idx('kundennummer')] ?? '', name: t[idx('name')] ?? '',
    plz: t[idx('plz')] ?? '', ort: t[idx('ort')] ?? '', strasse: t[idx('strasse')] ?? '',
    projekte: Number(t[idx('projekte')] ?? 0), letztesProjekt: t[idx('letztesProjekt')] ?? '',
  };
});
if (NUR_MIT_PROJEKT) kunden = kunden.filter((k) => k.projekte > 0);
console.log(`${kunden.length} Kunden ohne E-Mail · ${koepfe.length} Kopfzeilen aus dem Postfach\n`);

// ─── Adressen sammeln: Adresse → Anzeigenamen + Betreffs ────────────────────
interface Spur { namen: Set<string>; betreffs: Set<string>; anzahl: number; letztes: string }
const spuren = new Map<string, Spur>();
const merke = (adresse: string, name: string, betreff: string, datum: string) => {
  if (!istBrauchbar(adresse)) return;
  const s = spuren.get(adresse) ?? { namen: new Set(), betreffs: new Set(), anzahl: 0, letztes: '' };
  if (name) s.namen.add(name);
  if (betreff) s.betreffs.add(betreff);
  s.anzahl++;
  if (datum > s.letztes) s.letztes = datum;
  spuren.set(adresse, s);
};
for (const k of koepfe) {
  const betreff = dekodiereMime(k.betreff);
  for (const v of k.von ?? []) merke(v.adresse, dekodiereMime(v.name), betreff, k.datum);
  for (const a of k.an ?? []) merke(a.adresse, dekodiereMime(a.name), betreff, k.datum);
}
console.log(`${spuren.size} verschiedene Adressen im Postfach (ohne eigene und Blockliste)\n`);

/*
 * Die stärkste Quelle: unsere EIGENEN Ausgangsmails.
 *
 * Wenn wir „Angebot ANG-2026-0123 – TSV Kornburg" verschickt haben, steht der
 * Verein im Betreff und seine Adresse im Empfängerfeld. Das ist ein direkter
 * Beleg — anders als bei eingehender Post, wo der Vereinsname im Betreff auch
 * von einem Platzbauer stammen kann, der über den Verein schreibt.
 *
 * Dieser Weg fehlte zuerst und kostete die Hälfte der Treffer: 53 der 103
 * Vereine kommen im Postfach vor, gefunden wurden über Absender und Domain
 * nur 15.
 */
const EIGEN_TEST = /@(tennismehl\.com|tennismehl24\.com)$/i;
interface Ausgang { an: Array<{ name: string; adresse: string }>; betreff: string }
const ausgang: Ausgang[] = [];
for (const k of koepfe) {
  const vonUns = (k.von ?? []).some((v) => EIGEN_TEST.test(v.adresse));
  if (!vonUns) continue;
  const empfaenger = (k.an ?? []).filter((a) => istBrauchbar(a.adresse));
  if (empfaenger.length === 0 || !k.betreff) continue;
  ausgang.push({ an: empfaenger, betreff: dekodiereMime(k.betreff) });
}
console.log(`${ausgang.length} eigene Ausgangsmails mit externem Empfänger\n`);

// ─── Zuordnen ───────────────────────────────────────────────────────────────
/**
 * Ein Vereinsindiz in der Adresse hebt einen Treffer deutlich: `tennis@djk-
 * eigenzell.de` ist etwas anderes als `thomas.walther@stadt.erlangen.de`.
 * Ohne Indiz steht dort meist nur der ORTSNAME — und den tragen Sparkasse,
 * Stadtverwaltung und Nachbarverein genauso.
 */
const VEREINSINDIZ = /(^|[^a-z])(tennis|tennisclub|tennisverein|tc|tsv|tsg|sv|sc|tv|tg|djk|spvgg|vfr|vfb|verein|sportverein|platzwart|vorstand|vorsitzende?r?|sportanlage)([^a-z]|$)/i;

const RANG: Record<string, number> = {
  'wir haben geschrieben (Kundennummer im Betreff)': 6,
  'wir haben geschrieben (Verein im Betreff)': 5,
  'wir haben geschrieben (nur ein Ortswort)': 2,
  'Kundennummer im Betreff': 4,
  'Vereinsname in der Adresse': 3,
  'mehrere Wörter im Absendernamen': 2,
  'Absendername + Ort': 2,
  'nur im Betreff (schwach)': 1,
};

type Stufe = 'sicher' | 'pruefen' | 'schwach';
const einstufen = (weg: string, adresse: string): Stufe => {
  if (weg === 'wir haben geschrieben (nur ein Ortswort)') return 'pruefen';
  if (weg.startsWith('wir haben geschrieben')) return 'sicher';
  if (weg === 'Kundennummer im Betreff') return 'sicher';
  if (weg === 'nur im Betreff (schwach)') return 'schwach';
  return VEREINSINDIZ.test(adresse) ? 'sicher' : 'pruefen';
};

interface Treffer { kunde: Kunde; adresse: string; weg: string; belege: string[]; anzahl: number }
const treffer: Treffer[] = [];

for (const kunde of kunden) {
  const worte = kernwoerter(kunde.name);

  // Zuerst die Ausgangspost: Betreff nennt den Verein → Empfänger ist der Verein.
  for (const mail of ausgang) {
    const betreff = normal(mail.betreff);
    const nr = kunde.kundennummer.trim();
    const perNummer = nr && new RegExp(`(^| )${normal(nr)}( |$)`).test(betreff);
    const perName = worte.filter((w) => trifftWort(betreff, w));
    if (!perNummer && perName.length === 0) continue;
    // Ein EINZELNES Ortswort im Betreff genügt nicht: „Erlenbach" gibt es als
    // Germania, TC Pfalz und TV Nieder-Erlenbach; „Roden" als Ober- und
    // Nieder-Roden. Erst zwei Wörter oder die Kundennummer machen es eindeutig.
    const weg = perNummer
      ? 'wir haben geschrieben (Kundennummer im Betreff)'
      : perName.length >= 2
        ? 'wir haben geschrieben (Verein im Betreff)'
        : 'wir haben geschrieben (nur ein Ortswort)';
    for (const e of mail.an) {
      treffer.push({
        kunde, adresse: e.adresse, weg,
        belege: [`Betreff: ${mail.betreff.slice(0, 70)}`],
        anzahl: spuren.get(e.adresse)?.anzahl ?? 1,
      });
    }
  }

  const ort = normal(kunde.ort).split(' ')[0] ?? '';
  const nummer = kunde.kundennummer.trim();

  for (const [adresse, spur] of spuren) {
    const heu = normal([...spur.namen].join(' '));
    const lokal = normal(adresse.split('@')[0]);
    const domain = normal(domainVon(adresse));
    const betreffe = normal([...spur.betreffs].join(' '));

    const belege: string[] = [];
    let weg = '';

    /*
     * Entscheidend ist nicht OB der Vereinsname vorkommt, sondern WO:
     *   - in der Adresse selbst (tc-roethenbach@web.de) → die Adresse gehört
     *     dem Verein. Stärkster Beleg nach der Kundennummer.
     *   - im Anzeigenamen ("TC Röthenbach Vorstand") → gut, aber es kann auch
     *     ein Dritter sein, der ÜBER den Verein schreibt.
     *   - nur im Betreff → schwach. Ein Platzbauer schreibt uns mit dem
     *     Vereinsnamen im Betreff, die Adresse gehört trotzdem ihm.
     */
    const inAdresse = worte.filter((w) => trifftWort(lokal, w) || trifftWort(domain, w));
    const inName = worte.filter((w) => trifftWort(heu, w));
    const imBetreff = worte.filter((w) => trifftWort(betreffe, w));
    const ortTrifft = ort.length >= 5
      && (trifftWort(domain, ort) || trifftWort(heu, ort) || trifftWort(lokal, ort));

    // 1) Kundennummer im Betreff — praktisch fälschungssicher
    if (nummer && new RegExp(`\\b${nummer}\\b`).test([...spur.betreffs].join(' '))) {
      weg = 'Kundennummer im Betreff';
      belege.push(`Betreff nennt ${nummer}`);
    }
    // 2) Vereinsname steckt in der Adresse
    else if (inAdresse.length > 0) {
      weg = 'Vereinsname in der Adresse';
      belege.push(`Adresse: ${inAdresse.join(', ')}`);
    }
    // 3) Anzeigename trifft — mit Ort oder zweitem Wort als Stütze
    else if (inName.length > 1 || (inName.length === 1 && ortTrifft)) {
      weg = inName.length > 1 ? 'mehrere Wörter im Absendernamen' : 'Absendername + Ort';
      belege.push(`Absender: ${inName.join(', ')}`);
    }
    // 4) Nur der Betreff nennt den Verein — als Hinweis mitnehmen, aber
    //    ausdrücklich als schwach kennzeichnen.
    else if (imBetreff.length > 1) {
      weg = 'nur im Betreff (schwach)';
      belege.push(`Betreff: ${imBetreff.join(', ')}`);
    }

    if (ortTrifft) belege.push(`Ort: ${kunde.ort}`);
    // Ort allein reicht nie: TSG Bamberg ist nicht mtv-bamberg.de.
    if (!weg) continue;
    treffer.push({ kunde, adresse, weg, belege, anzahl: spur.anzahl });
  }
}

// Dieselbe Adresse taucht bei einem Kunden oft mehrfach auf (Angebot, AB,
// Rechnung). Ein Beleg je Adresse genügt — mit der Zahl der Fundstellen.
const zusammengefasst = new Map<string, Treffer & { fundstellen: number }>();
for (const t of treffer) {
  const key = `${t.kunde.kundennummer}|${normal(t.kunde.name)}|${t.adresse}`;
  const da = zusammengefasst.get(key);
  if (!da) { zusammengefasst.set(key, { ...t, fundstellen: 1 }); continue; }
  da.fundstellen++;
  // Den aussagekräftigsten Weg behalten.
  if ((RANG[t.weg] ?? 0) > (RANG[da.weg] ?? 0)) { da.weg = t.weg; da.belege = t.belege; }
}
treffer.length = 0;
treffer.push(...[...zusammengefasst.values()].map((t) => ({
  ...t, belege: t.fundstellen > 1 ? [...t.belege, `${t.fundstellen} Fundstellen`] : t.belege,
})));

// ─── Dienstleister aussortieren ─────────────────────────────────────────────
// Eine Adresse bei mehreren VERSCHIEDENEN Vereinen gehört nicht dem Verein.
const schluessel = (k: Kunde) => `${k.kundennummer}|${normal(k.name)}|${k.plz}`;
const vereineJeAdresse = new Map<string, Set<string>>();
for (const t of treffer) {
  const s = vereineJeAdresse.get(t.adresse) ?? new Set<string>();
  s.add(schluessel(t.kunde));
  vereineJeAdresse.set(t.adresse, s);
}
const sauber = treffer.filter((t) => (vereineJeAdresse.get(t.adresse)?.size ?? 0) === 1);
const dienstleister = [...vereineJeAdresse.entries()].filter(([, s]) => s.size > 1);

// ─── Ausgabe ────────────────────────────────────────────────────────────────
const proKunde = new Map<string, Treffer[]>();
for (const t of sauber) proKunde.set(schluessel(t.kunde), [...(proKunde.get(schluessel(t.kunde)) ?? []), t]);

const rang = (w: string) => RANG[w] ?? 0;
const sortiert = [...proKunde.entries()]
  .map(([nr, ts]) => ({ nr, ts: [...ts].sort((a, b) => rang(b.weg) - rang(a.weg) || b.anzahl - a.anzahl) }))
  .sort((a, b) => rang(b.ts[0].weg) - rang(a.ts[0].weg));

console.log(`=== ${sortiert.length} von ${kunden.length} Kunden haben einen Adressvorschlag ===\n`);
const ZEICHEN: Record<Stufe, string> = { sicher: '✓', pruefen: '?', schwach: '~' };
for (const stufe of ['sicher', 'pruefen', 'schwach'] as Stufe[]) {
  const block = sortiert.filter(({ ts }) => einstufen(ts[0].weg, ts[0].adresse) === stufe);
  if (block.length === 0) continue;
  const titel = stufe === 'sicher' ? 'VEREINSINDIZ in der Adresse — wahrscheinlich richtig'
    : stufe === 'pruefen' ? 'nur EIN Ortswort passt — der Nachbarort trägt es auch'
    : 'nur im Betreff genannt — die Adresse kann einem Dritten gehören';
  console.log(`\n--- ${ZEICHEN[stufe]} ${block.length} ${stufe.toUpperCase()}: ${titel} ---`);
  for (const { ts } of block) {
    const k = ts[0].kunde;
    console.log(`${k.name}  (${k.kundennummer || 'ohne Nr.'}, ${k.plz} ${k.ort}, ${k.projekte} Projekt(e) bis ${k.letztesProjekt})`);
    for (const t of ts.slice(0, 4)) {
      console.log(`    ${ZEICHEN[einstufen(t.weg, t.adresse)]} ${t.adresse}  [${t.anzahl}× im Postfach]  ${t.belege.join(' · ')}`);
    }
  }
}

console.log(`\n=== ${dienstleister.length} Adressen bei mehreren Vereinen — aussortiert ===`);
for (const [a, s] of dienstleister.slice(0, 15)) console.log(`   ${a} → ${s.size} verschiedene Vereine`);

// Spalte `uebernehmen` bleibt leer — sie ist zum Ausfüllen gedacht (x = ja).
const csv = ['uebernehmen;stufe;kundennummer;name;plz;ort;projekte;vorschlag;weg;treffer;belege'];
for (const { ts } of sortiert) {
  for (const t of ts.slice(0, 4)) {
    csv.push(['', einstufen(t.weg, t.adresse), t.kunde.kundennummer, t.kunde.name, t.kunde.plz,
      t.kunde.ort, t.kunde.projekte, t.adresse, t.weg, t.anzahl, t.belege.join(' | ')].join(';'));
  }
}
writeFileSync(OUT, csv.join('\n'));
console.log(`\n${csv.length - 1} Vorschläge → ${OUT}`);
