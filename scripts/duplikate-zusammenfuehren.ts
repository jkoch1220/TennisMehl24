/**
 * Führt bestätigte Duplikat-Paare zusammen — dieselbe Reihenfolge und dasselbe
 * Sicherheitsnetz wie `duplikatService.fuehreMergeDurch` im Portal:
 *
 *   1. Kind-Referenzen auf den Survivor umhängen (Ansprechpartner, Saisondaten,
 *      Aktivitäten, Beziehungen, Siebanalysen, Projekte, Platzbauer-Projekte,
 *      Instandsetzung) — top-level Spalte UND der Wert im `data`-JSON.
 *   2. Felder vereinen: Survivor gewinnt, seine leeren Felder füllt der
 *      Verlierer, abweichende Werte landen als Notiz. Nichts wird überschrieben.
 *   3. Vollständigen Snapshot ins `kunden_merge_archiv` (VOR dem Löschen).
 *   4. Erst dann den Verlierer löschen.
 *
 * Der Survivor ist der Datensatz mit der besseren Substanz: 2026er-Projekt vor
 * E-Mail vor Anzahl Referenzen vor jüngerer Kundennummer.
 *
 *   npx tsx scripts/duplikate-zusammenfuehren.ts --liste=<csv>            # Dry-Run
 *   npx tsx scripts/duplikate-zusammenfuehren.ts --liste=<csv> --apply
 *   ... --produktion   # zusätzlich gegen die Produktion (sonst nur Sandbox)
 *
 * Die CSV ist die Prüfliste aus der Datenqualitäts-Analyse; verarbeitet wird
 * ausschließlich, was dort in Spalte `einstufung` auf `sicher` steht.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const endpoint = process.env.VITE_APPWRITE_ENDPOINT!;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID!;
const apiKey = process.env.APPWRITE_API_KEY!;
if (!endpoint || !projectId || !apiKey) {
  console.error('❌ VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY fehlen');
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PRODUKTION = args.includes('--produktion');
const DB = PRODUKTION ? 'tennismehl24_db' : 'tennismehl24_db_mock';
const listeArg = args.find((a) => a.startsWith('--liste='));
if (!listeArg) { console.error('--liste=<pfad zur pruefliste.csv> fehlt'); process.exit(1); }
const LISTE = listeArg.split('=')[1];

async function api<T = any>(m: 'GET' | 'POST' | 'PATCH' | 'DELETE', pfad: string, body?: unknown) {
  const a = await fetch(`${endpoint}${pfad}`, {
    method: m,
    headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await a.text();
  return { ok: a.ok, status: a.status, daten: (t ? JSON.parse(t) : {}) as T & { message?: string } };
}

interface Zeile { $id: string; data?: string; [f: string]: unknown }

async function ladeAlle(tabelle: string, filter?: { feld: string; wert: string }): Promise<Zeile[]> {
  const raus: Zeile[] = [];
  let cursor: string | null = null;
  for (;;) {
    // Das gefilterte Feld gehört in `attribute`. Steht es stattdessen als erster
    // Wert in `values`, antwortet die API mit 400 „Attribute not found in
    // schema" — und weil ein Fehler hier früher stillschweigend als „keine
    // Treffer" durchging, wurden Kind-Referenzen NICHT umgehängt und die
    // Verlierer trotzdem gelöscht. Deshalb bricht ein Fehler jetzt ab.
    const q: Array<Record<string, unknown>> = [{ method: 'limit', values: [100] }];
    if (filter) q.unshift({ method: 'equal', attribute: filter.feld, values: [filter.wert] });
    if (cursor) q.push({ method: 'cursorAfter', values: [cursor] });
    const qs = q.map((e) => `queries[]=${encodeURIComponent(JSON.stringify(e))}`).join('&');
    const res = await api<{ rows: Zeile[] }>('GET', `/tablesdb/${DB}/tables/${tabelle}/rows?${qs}`);
    if (!res.ok) {
      // 404 = Collection existiert in dieser Datenbank nicht: harmlos.
      // Alles andere ist ein echter Fehler und darf nicht als „nichts zu tun"
      // durchgehen, sonst löschen wir Datensätze mit hängenden Referenzen.
      if (res.status === 404) return raus;
      const err = new Error(`Abfrage ${tabelle}${filter ? ` (${filter.feld}=${filter.wert})` : ''} fehlgeschlagen: HTTP ${res.status} ${res.daten?.message ?? ''}`);
      (err as Error & { nichtFilterbar?: boolean }).nichtFilterbar =
        res.status === 400 && /Attribute not found in schema/i.test(res.daten?.message ?? '');
      throw err;
    }
    const z = res.daten.rows ?? [];
    if (!z.length) break;
    raus.push(...z);
    if (z.length < 100) break;
    cursor = z[z.length - 1].$id;
  }
  return raus;
}

/**
 * Kinder eines Kunden holen.
 *
 * Nicht jede Collection hat das Referenzfeld als eigene Spalte: `siebanalysen`
 * kennt nur `data`, die kundeId steckt im JSON und ist per Query unerreichbar.
 * Dann wird die Collection einmal komplett geladen (und gemerkt) und
 * clientseitig gefiltert — statt den Fehler zu schlucken und den Verlierer mit
 * hängenden Referenzen zu löschen.
 */
const vollScanCache = new Map<string, Zeile[]>();
async function ladeKinder(tabelle: string, feld: string, wert: string): Promise<Zeile[]> {
  if (!vollScanCache.has(tabelle)) {
    try {
      return await ladeAlle(tabelle, { feld, wert });
    } catch (e) {
      if (!(e as Error & { nichtFilterbar?: boolean }).nichtFilterbar) throw e;
      console.log(`     ⓘ ${tabelle}.${feld} ist keine Spalte — Collection wird einmal vollständig gelesen`);
      vollScanCache.set(tabelle, await ladeAlle(tabelle));
    }
  }
  return (vollScanCache.get(tabelle) ?? []).filter((z) => {
    const d = obj(z.data);
    return String((z as Record<string, unknown>)[feld] ?? d[feld] ?? '') === wert;
  });
}

const obj = (roh: unknown): Record<string, any> => {
  if (roh && typeof roh === 'object' && !Array.isArray(roh)) return roh as Record<string, any>;
  if (typeof roh !== 'string') return {};
  try { const g = JSON.parse(roh); return g && typeof g === 'object' ? g : {}; } catch { return {}; }
};
const pause = () => new Promise((r) => setTimeout(r, 320));
const leer = (v: unknown) => v === undefined || v === null || v === '';

/** Kind-Collections und das Feld, das auf den Kunden zeigt — wie im duplikatService. */
const KINDER: Array<[string, string]> = [
  ['saison_ansprechpartner', 'kundeId'],
  ['saison_daten', 'kundeId'],
  ['saison_aktivitaeten', 'kundeId'],
  ['kunden_aktivitaeten', 'kundeId'],
  ['siebanalysen', 'kundeId'],
  ['saison_beziehungen', 'vereinId'],
  ['saison_beziehungen', 'platzbauerId'],
  ['platzbauer_projekte', 'platzbauerId'],
  ['instandsetzungsauftraege', 'platzbauerId'],
  ['projekte', 'kundeId'],
];

const SKALARE = [
  'kundennummer', 'email', 'rechnungsEmail', 'zuletztGezahlterPreis', 'tonnenLetztesJahr',
  'standardBezugsweg', 'standardPlatzbauerId', 'beziehtUeberUnsPlatzbauer', 'abwerkspreis',
  'automatischesAngebot', 'zahlungsziel', 'schuettstellenAnzahl', 'belieferungsart',
  'anfahrtshinweise', 'wunschLieferwoche', 'mosaikKurzname', 'gruppe', 'branche', 'herkunft',
  'matchcode', 'telefon', 'mobiltelefon', 'postfach', 'postfachort', 'laendercode', 'mahncode',
];

/** Dispo-Felder, deren Widerspruch jemand ansehen muss — ein Zug, der nicht
 *  durch die Zufahrt passt, kostet eine Anfahrt. Sie werden nicht still
 *  überschrieben, sondern landen als eigener Warnblock in den Notizen. */
const DISPO_FELDER = new Set(['belieferungsart', 'schuettstellenAnzahl', 'standardBezugsweg', 'abwerkspreis', 'zahlungsziel']);

function baueMergePatch(s: Record<string, any>, l: Record<string, any>) {
  const patch: Record<string, any> = {};
  const konflikte: string[] = [];
  const dispoKonflikte: string[] = [];
  for (const f of SKALARE) {
    if (leer(s[f]) && !leer(l[f])) patch[f] = l[f];
    else if (!leer(s[f]) && !leer(l[f]) && s[f] !== l[f]) {
      // Der überlebende Datensatz gewinnt — er ist der Kunde, mit dem wir
      // tatsächlich arbeiten. Der abweichende Altwert geht trotzdem nicht
      // verloren, sondern wird in den Notizen dokumentiert.
      (DISPO_FELDER.has(f) ? dispoKonflikte : konflikte).push(`${f}: behalte "${s[f]}", Duplikat hatte "${l[f]}"`);
    }
  }
  // Anfahrtshinweise sind Fließtext: hier ist Aneinanderhängen richtig, nicht
  // Auswählen — beide Hinweise können gleichzeitig gelten.
  if (!leer(s.anfahrtshinweise) && !leer(l.anfahrtshinweise) && s.anfahrtshinweise !== l.anfahrtshinweise) {
    patch.anfahrtshinweise = `${s.anfahrtshinweise}\n${l.anfahrtshinweise}`;
  }
  // --- Anschriften: nichts wegwerfen ----------------------------------------
  // In Mosaik standen Rechnungs- und Lieferanschrift desselben Vereins als ZWEI
  // Einträge. Genau daraus sind die meisten dieser Duplikate entstanden — 31 der
  // 33 sicheren Cluster haben abweichende Anschriften. Die Anschrift des
  // aufgelösten Datensatzes ist deshalb keine Dublette, sondern eine echte
  // zweite Adresse (meist die Platzanlage) und wandert in `lieferadressen`.
  const adrKey = (ad: any) => `${String(ad?.strasse || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${String(ad?.plz || '').trim()}`;
  if (!s.rechnungsadresse?.strasse && l.rechnungsadresse?.strasse) patch.rechnungsadresse = l.rechnungsadresse;
  if (!s.lieferadresse?.strasse && l.lieferadresse?.strasse) patch.lieferadresse = l.lieferadresse;

  const bekannt = new Set<string>();
  for (const ad of [patch.rechnungsadresse ?? s.rechnungsadresse, patch.lieferadresse ?? s.lieferadresse]) {
    if (ad?.strasse) bekannt.add(adrKey(ad));
  }
  const zusatz: any[] = [];
  for (const ad of (Array.isArray(s.lieferadressen) ? s.lieferadressen : [])) {
    if (!ad?.strasse) continue;
    if (bekannt.has(adrKey(ad))) continue;
    bekannt.add(adrKey(ad));
    zusatz.push(ad);
  }
  // Erst die eigenen Zusatzadressen des Verlierers (die trugen in Mosaik schon
  // eine Bezeichnung), dann seine Haupt- und Lieferanschrift.
  const vomVerlierer: Array<[any, string]> = [
    ...(Array.isArray(l.lieferadressen) ? l.lieferadressen : []).map((ad: any) => [ad, ''] as [any, string]),
    [l.lieferadresse, 'Lieferanschrift'],
    [l.rechnungsadresse, 'Anschrift'],
    // `adresse` ist das abgelöste Altfeld — steht aber noch bei 2148 Kunden
    // und enthält teils eine dritte, sonst nirgends erfasste Anschrift.
    [l.adresse, 'Anschrift (Altfeld)'],
    [s.adresse, 'Anschrift (Altfeld)'],
  ];
  for (const [ad, art] of vomVerlierer) {
    if (!ad?.strasse) continue;
    const key = adrKey(ad);
    if (bekannt.has(key)) continue;
    bekannt.add(key);
    const herkunft = `${art || 'Adresse'} aus zusammengeführtem Datensatz „${l.name || ''}"${l.kundennummer ? ` (${l.kundennummer})` : ''}`;
    zusatz.push({ ...ad, bezeichnung: ad.bezeichnung || herkunft, hinweis: ad.bezeichnung ? herkunft : ad.hinweis });
  }
  if (zusatz.length) patch.lieferadressen = zusatz;

  if (!s.dispoAnsprechpartner && l.dispoAnsprechpartner) patch.dispoAnsprechpartner = l.dispoAnsprechpartner;
  if (!s.koordinaten && l.koordinaten) patch.koordinaten = l.koordinaten;
  if (!s.standardLieferzeitfenster && l.standardLieferzeitfenster) patch.standardLieferzeitfenster = l.standardLieferzeitfenster;

  // Der Angebots-Verteiler ist der Grund, warum wir das hier tun: beide Listen
  // zusammen, dedupliziert — eine Adresse darf beim Merge nicht verloren gehen.
  // `email` und `rechnungsEmail` sind Skalare — der Survivor behält seine. Die
  // Adresse des aufgelösten Datensatzes wäre damit weg, obwohl sie zu demselben
  // Kunden gehört (oft Platzwart hier, Kassierer dort). Sie kommt deshalb in den
  // Angebots-Verteiler, der mehrere Empfänger trägt.
  const mails = [...new Set([
    ...(Array.isArray(s.angebotsEmails) ? s.angebotsEmails : []),
    ...(Array.isArray(l.angebotsEmails) ? l.angebotsEmails : []),
    s.email, s.rechnungsEmail, l.email, l.rechnungsEmail,
  ].map((m: unknown) => String(m ?? '').toLowerCase().trim()).filter((m) => m.includes('@')))];
  if (mails.length) patch.angebotsEmails = mails;

  const union = (a: any[], b: any[], key: (x: any) => string) => {
    const seen = new Set<string>(); const out: any[] = [];
    for (const it of [...(a || []), ...(b || [])]) { const k = key(it); if (seen.has(k)) continue; seen.add(k); out.push(it); }
    return out;
  };
  // Preishistorie ist Bestellhistorie. Früher wurde nach Saisonjahr dedupliziert
  // — hatten beide Datensätze einen Eintrag für dieselbe Saison, fiel einer weg.
  // Jetzt entfällt nur, was inhaltlich identisch ist.
  const ph = union(s.preisHistorie, l.preisHistorie, (e) => JSON.stringify(e ?? {}));
  if (ph.length) {
    patch.preisHistorie = ph.sort((x: any, y: any) => (Number(x?.saisonjahr) || 0) - (Number(y?.saisonjahr) || 0));
  }

  // Bestellhistorie (Mosaik, ein Eintrag je Jahr): Jahre zusammenführen und die
  // Werte addieren. Ein Verein, der unter zwei Mosaik-Konten geführt wurde, hat
  // in beiden echte Bestellungen — der Survivor muss beide zeigen.
  if (Array.isArray(s.bestellhistorie) || Array.isArray(l.bestellhistorie)) {
    const proJahr = new Map<number, { jahr: number; anzahl: number; summeEuro: number; quellen: string[] }>();
    for (const e of [...(s.bestellhistorie ?? []), ...(l.bestellhistorie ?? [])]) {
      const jahr = Number(e?.jahr);
      if (!Number.isFinite(jahr)) continue;
      const bisher = proJahr.get(jahr) ?? { jahr, anzahl: 0, summeEuro: 0, quellen: [] };
      bisher.anzahl += Number(e?.anzahl) || 0;
      bisher.summeEuro += Number(e?.summeEuro) || 0;
      for (const q of e?.quellen ?? []) if (!bisher.quellen.includes(q)) bisher.quellen.push(q);
      proJahr.set(jahr, bisher);
    }
    if (proJahr.size) {
      patch.bestellhistorie = [...proJahr.values()]
        .sort((x, y) => x.jahr - y.jahr)
        .map((e) => ({ ...e, summeEuro: Math.round(e.summeEuro * 100) / 100 }));
    }
  }

  // Zahlungsstatistik aus dem Altsystem zusammenrechnen statt zu überschreiben.
  if (s.zahlungsstatistik || l.zahlungsstatistik) {
    const sz = s.zahlungsstatistik ?? {}, lz = l.zahlungsstatistik ?? {};
    const spaeter = (a?: string, b?: string) => (String(a ?? '') > String(b ?? '') ? a : b);
    patch.zahlungsstatistik = {
      anzahlBuchungen: (Number(sz.anzahlBuchungen) || 0) + (Number(lz.anzahlBuchungen) || 0),
      maxMahnstufe: Math.max(Number(sz.maxMahnstufe) || 0, Number(lz.maxMahnstufe) || 0),
      letzteBuchung: spaeter(sz.letzteBuchung, lz.letzteBuchung) ?? '',
    };
  }
  const zb = union(s.zusatzbemerkungen, l.zusatzbemerkungen, (e) => e?.id || JSON.stringify(e));
  if (zb.length) patch.zusatzbemerkungen = zb;
  if (s.saisonpreise || l.saisonpreise) patch.saisonpreise = { ...(l.saisonpreise || {}), ...(s.saisonpreise || {}) };
  if (!s.aktiv && l.aktiv) patch.aktiv = true;
  // Tauglichkeit: wenn EINER der beiden tauglich war, bleibt der Survivor tauglich.
  if (l.automatischesAngebot === true) patch.automatischesAngebot = true;

  // Auffang: alles, was oben keine eigene Regel hat. Eine Positivliste vergisst
  // zwangsläufig Felder (`adresse` und `zahlungsstatistik` sind genau so
  // durchgefallen) — hier fällt garantiert nichts mehr hinten runter, auch
  // Felder nicht, die es heute noch gar nicht gibt.
  const BEHANDELT = new Set([
    ...SKALARE, 'rechnungsadresse', 'lieferadresse', 'lieferadressen', 'adresse',
    'dispoAnsprechpartner', 'koordinaten', 'standardLieferzeitfenster',
    'angebotsEmails', 'preisHistorie', 'zusatzbemerkungen', 'saisonpreise',
    'zahlungsstatistik', 'bestellhistorie', 'aktiv', 'notizen', 'anfahrtshinweise',
    'id', 'name', 'typ', 'erstelltAm', 'geaendertAm',
  ]);
  const uebersehen: string[] = [];
  for (const [f, wert] of Object.entries(l)) {
    if (BEHANDELT.has(f) || leer(wert)) continue;
    if (leer(s[f])) { patch[f] = wert; continue; }
    if (JSON.stringify(s[f]) !== JSON.stringify(wert)) {
      uebersehen.push(`${f}: behalte ${JSON.stringify(s[f])}, Duplikat hatte ${JSON.stringify(wert)}`);
    }
  }

  const notiz: string[] = [];
  if (s.notizen) notiz.push(s.notizen);
  const herkunft = [l.name, l.kundennummer, l.mosaikKurzname ? `Mosaik ${l.mosaikKurzname}` : '']
    .filter(Boolean).join(', ');
  notiz.push(`[Zusammengeführt ${new Date().toISOString().slice(0, 10)}] aus: ${herkunft}`);
  if (l.notizen) notiz.push(`[Aus Duplikat ${l.kundennummer || ''}] ${l.notizen}`);
  for (const k of dispoKonflikte) notiz.push(`[⚠ DISPO PRÜFEN] ${k}`);
  for (const k of konflikte) notiz.push(`[Merge-Konflikt] ${k}`);
  for (const k of uebersehen) notiz.push(`[Merge-Konflikt] ${k}`);
  if (notiz.length) patch.notizen = notiz.join('\n');
  return { patch, konflikte: [...dispoKonflikte, ...konflikte, ...uebersehen], dispoKonflikte };
}

async function main() {
  console.log('═'.repeat(72));
  console.log('  DUPLIKATE ZUSAMMENFÜHREN');
  console.log(`  Ziel:  ${PRODUKTION ? '⚠️  PRODUKTION' : '🧪 SANDBOX'}  (${DB})`);
  console.log(`  Modus: ${APPLY ? 'APPLY — es wird geschrieben' : 'DRY-RUN'}`);
  console.log('═'.repeat(72));

  // Prüfliste einlesen: nur `sicher`
  const zeilen = fs.readFileSync(LISTE, 'utf8').replace(/^\ufeff/, '').trim().split('\n');
  const kopf = zeilen[0].split(';');
  const idx = (n: string) => kopf.indexOf(n);
  // Felder können Semikolon enthalten und sind dann in Anführungszeichen gepackt.
  const zerlege = (z: string) => {
    const raus: string[] = []; let cur = '', inQ = false;
    for (let i = 0; i < z.length; i++) {
      const c = z[i];
      if (inQ) { if (c === '"') { if (z[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
      else if (c === '"') inQ = true;
      else if (c === ';') { raus.push(cur); cur = ''; }
      else cur += c;
    }
    raus.push(cur);
    return raus;
  };
  // Identifiziert wird über die Kunden-ID, nicht über die Kundennummer: 61 der
  // 2262 Datensätze haben gar keine Nummer und fielen sonst still durchs Raster.
  const gruppen = new Map<string, Array<{ id: string; knr: string }>>();
  const vorgabe = new Map<string, string>();
  for (const z of zeilen.slice(1)) {
    if (!z.trim()) continue;
    const f = zerlege(z);
    if (f[idx('einstufung')] !== 'sicher') continue;
    const c = f[idx('cluster')];
    const liste = gruppen.get(c) ?? [];
    liste.push({ id: idx('kundeId') >= 0 ? f[idx('kundeId')] : '', knr: f[idx('kundennummer')] });
    gruppen.set(c, liste);
    // Der Prüfer kann den Survivor in der Liste vorgeben — seine Entscheidung
    // sticht die automatische Bewertung.
    if (idx('survivor_id') >= 0 && f[idx('survivor_id')]) vorgabe.set(c, f[idx('survivor_id')]);
  }
  console.log(`Prüfliste: ${gruppen.size} sichere Cluster.`);

  const alleKunden = await ladeAlle('saison_kunden');
  const byKnr = new Map<string, { zeile: Zeile; d: Record<string, any> }>();
  const byId = new Map<string, { zeile: Zeile; d: Record<string, any> }>();
  for (const z of alleKunden) {
    const d = obj(z.data);
    const eintrag = { zeile: z, d };
    if (d.kundennummer) byKnr.set(String(d.kundennummer), eintrag);
    byId.set(String(d.id || z.$id), eintrag);
    byId.set(z.$id, eintrag);
  }
  const projekte = await ladeAlle('projekte');
  const projZaehler = new Map<string, { anzahl: number; max: number }>();
  for (const p of projekte) {
    const kid = String(p.kundeId ?? '');
    if (!kid) continue;
    const e = projZaehler.get(kid) ?? { anzahl: 0, max: 0 };
    e.anzahl++; e.max = Math.max(e.max, Number(p.saisonjahr) || 0);
    projZaehler.set(kid, e);
  }

  // Survivor bestimmen: 2026er-Projekt > E-Mail > mehr Projekte > jüngere Nummer.
  // Der Portal-Bonus steht bewusst UNTER der Geschäftsaktivität: ein Datensatz,
  // über den 2026 geliefert wurde, ist unser Kunde — auch wenn er ursprünglich
  // aus Mosaik stammt. Er entscheidet nur bei sonst gleichem Stand, und dann
  // zugunsten des im Portal gepflegten Datensatzes.
  const ausMosaik = (d: Record<string, any>) => Boolean(d.mosaikKurzname);
  const punkte = (id: string, d: Record<string, any>) => {
    const p = projZaehler.get(id) ?? { anzahl: 0, max: 0 };
    const mail = d.email || d.rechnungsEmail || (d.angebotsEmails?.length ? 'x' : '');
    // Jahre Bestellhistorie zählen mit: ein Datensatz mit 19 Jahren Umsatz ist
    // der echte Kunde, auch wenn daneben ein frisch angelegter Namensvetter steht.
    const jahre = Array.isArray(d.bestellhistorie) ? d.bestellhistorie.length : 0;
    return (p.max >= 2026 ? 10000 : 0) + (mail ? 1000 : 0) + p.anzahl * 10
      + Math.min(jahre * 12, 240) + (p.max >= 2016 ? 5 : 0) + (ausMosaik(d) ? 0 : 3);
  };

  let gemerged = 0, uebersprungen = 0;
  const dispoGesamt: string[] = [];
  for (const [cluster, eintraege] of gruppen) {
    const teile = eintraege
      .map((e) => (e.id && byId.get(e.id)) || (e.knr && byKnr.get(e.knr)) || null)
      .filter(Boolean) as Array<{ zeile: Zeile; d: Record<string, any> }>;
    if (teile.length < eintraege.length) {
      console.warn(`   ⚠️  [${cluster}] ${eintraege.length - teile.length} Datensatz/Datensätze nicht gefunden — Cluster übersprungen.`);
      uebersprungen++; continue;
    }
    if (teile.length < 2) { uebersprungen++; continue; }
    const sortiert = [...teile].sort((a, b) => punkte(b.zeile.$id, b.d) - punkte(a.zeile.$id, a.d));
    const gewuenscht = vorgabe.get(cluster);
    const vorgemerkt = gewuenscht
      ? sortiert.find((t) => String(t.d.id || t.zeile.$id) === gewuenscht || t.zeile.$id === gewuenscht)
      : undefined;
    const survivor = vorgemerkt ?? sortiert[0];
    const verlierer = sortiert.filter((t) => t !== survivor);

    const herk = (d: Record<string, any>) => (ausMosaik(d) ? 'Mosaik' : 'Portal');
    const nr = (d: Record<string, any>) => String(d.kundennummer || '—').padEnd(8);
    console.log(`\n[${cluster}]${vorgemerkt ? '  (Survivor laut Prüfliste)' : ''}`);
    console.log(`   BEHALTEN  ${nr(survivor.d)} ${String(survivor.d.name).slice(0, 34).padEnd(34)} ${herk(survivor.d)}`);
    for (const v of verlierer) {
      console.log(`   auflösen  ${nr(v.d)} ${String(v.d.name).slice(0, 34).padEnd(34)} ${herk(v.d)}`);
    }
    if (!APPLY) {
      // Vorschau rechnen, ohne zu schreiben: Was würde an Adressen und
      // Dispo-Angaben passieren?
      const probe = { ...survivor.d };
      for (const v of verlierer) {
        const { patch, dispoKonflikte } = baueMergePatch(probe, v.d);
        Object.assign(probe, patch);
        if (Array.isArray(patch.lieferadressen) && patch.lieferadressen.length) {
          console.log(`     📍 ${patch.lieferadressen.length} Lieferanschrift(en) würden gesichert`);
        }
        for (const dk of dispoKonflikte) {
          console.log(`     ⚠ DISPO: ${dk}`);
          dispoGesamt.push(`[${cluster}] ${survivor.d.name}: ${dk}`);
        }
      }
      gemerged += verlierer.length;
      continue;
    }

    for (const v of verlierer) {
      const survivorVorher = JSON.stringify(survivor.d);
      const loserJson = JSON.stringify(v.d);
      const repointed: Record<string, string[]> = {};

      // 1) Kinder umhängen
      for (const [coll, feld] of KINDER) {
        const kinder = await ladeKinder(coll, feld, v.zeile.$id);
        const ids: string[] = [];
        for (const kind of kinder) {
          const kd = obj(kind.data);
          kd[feld] = survivor.zeile.$id;
          // Nur Spalten schreiben, die diese Collection wirklich hat.
          const top: Record<string, unknown> = {};
          if ((kind as Record<string, unknown>)[feld] !== undefined) top[feld] = survivor.zeile.$id;
          if (coll === 'projekte') {
            kd.kundenname = survivor.d.name; kd.kundennummer = survivor.d.kundennummer;
            top.kundenname = survivor.d.name;
          }
          const r = await api('PATCH', `/tablesdb/${DB}/tables/${coll}/rows/${kind.$id}`, { data: { ...top, data: JSON.stringify(kd) } });
          if (r.ok) ids.push(kind.$id);
          else console.error(`     ✗ ${coll}/${kind.$id}: ${r.daten.message}`);
          await pause();
        }
        if (ids.length) { repointed[`${coll}.${feld}`] = ids; console.log(`     → ${ids.length}× ${coll}.${feld} umgehängt`); }
      }

      // 2) Felder vereinen
      const { patch, konflikte, dispoKonflikte } = baueMergePatch(survivor.d, v.d);
      Object.assign(survivor.d, patch);
      const up = await api('PATCH', `/tablesdb/${DB}/tables/saison_kunden/rows/${survivor.zeile.$id}`, { data: { data: JSON.stringify(survivor.d) } });
      if (!up.ok) { console.error(`     ✗ Survivor-Update: ${up.daten.message}`); continue; }
      if (Array.isArray(patch.lieferadressen) && patch.lieferadressen.length) {
        console.log(`     📍 ${patch.lieferadressen.length} Lieferanschrift(en) gesichert`);
      }
      for (const dk of dispoKonflikte) {
        console.log(`     ⚠ DISPO: ${dk}`);
        dispoGesamt.push(`[${cluster}] ${survivor.d.name}: ${dk}`);
      }
      if (konflikte.length) console.log(`     ⓘ ${konflikte.length} Konflikt(e) als Notiz gesichert`);
      await pause();

      // 3) Archiv VOR dem Löschen
      const arch = await api('POST', `/tablesdb/${DB}/tables/kunden_merge_archiv/rows`, {
        rowId: 'unique()',
        data: {
          survivorId: survivor.zeile.$id, loserId: v.zeile.$id,
          survivorName: String(survivor.d.name || ''), loserName: String(v.d.name || ''),
          zeitpunkt: new Date().toISOString(), benutzer: 'skript:duplikate-zusammenfuehren',
          loserKunde: loserJson, survivorVorher, repointed: JSON.stringify(repointed), rueckgaengig: false,
        },
      });
      if (!arch.ok) { console.error(`     ✗ Archiv fehlgeschlagen (${arch.daten.message}) — Verlierer bleibt stehen`); continue; }
      await pause();

      // 4) Erst jetzt löschen
      const del = await api('DELETE', `/tablesdb/${DB}/tables/saison_kunden/rows/${v.zeile.$id}`);
      if (del.ok) { gemerged++; console.log(`     ✓ zusammengeführt (Archiv ${(arch.daten as any).$id})`); }
      else console.error(`     ✗ Löschen: ${del.daten.message}`);
      await pause();
    }
  }

  console.log('\n' + '═'.repeat(72));
  console.log(`${APPLY ? 'Zusammengeführt' : 'Würden zusammengeführt'}: ${gemerged} Datensätze.`);
  if (dispoGesamt.length) {
    console.log(`\n⚠️  ${dispoGesamt.length} Dispo-Widerspruch/-widersprüche — stehen als Notiz am Kunden:`);
    for (const d of dispoGesamt) console.log(`   ${d}`);
  }
  if (uebersprungen) console.log(`Übersprungen (nicht gefunden): ${uebersprungen} Cluster.`);
  if (!APPLY) console.log('DRY-RUN — nichts geschrieben. Zum Ausführen: --apply');
}

main().catch((e) => { console.error('❌ Abbruch:', (e as Error).message); process.exit(1); });
