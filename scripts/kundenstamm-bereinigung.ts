/**
 * Kundenstamm-Bereinigung für den Massenangebots-Herbstlauf.
 *
 * Vier unabhängige Modi (kombinierbar):
 *
 *   --namen       Anrede-Reste als Kundenname („Herrn", „Frau", „Firma", „privat")
 *                 durch den echten Namen aus den Mosaik-Rohdaten ersetzen.
 *                 Generische Namen ([]„BayWa AG" ×9) bekommen den Ort angehängt.
 *   --email-muell email/rechnungsEmail-Werte, die keine E-Mail sind (Telefon-
 *                 nummern aus dem Mosaik-Import), aus dem Feld nehmen. Der Wert
 *                 wandert in `telefon` (falls leer und Telefon-Muster), sonst in
 *                 die Notizen — es geht nichts verloren.
 *   --gambio      E-Mail-Adressen aus den Gambio-Shop-Konten als angebotsEmails
 *                 ergänzen (nur Kunden ohne eigene E-Mail, nur eindeutige
 *                 Firma+PLZ-Treffer). Braucht die Harvest-JSONs (--gambio-dir).
 *   --opt-out     „Massenangebots-tauglich" entziehen: Müll-Namen, fehlende
 *                 Adresse, technische Kunden (TESTVEREIN, Mengenblocker) und
 *                 Kunden ohne irgendeine Bestellung seit 2016 (Portal-Projekte,
 *                 Mosaik-Bestellhistorie, Gambio-Bestellungen).
 *                 Stammkunden (Bestellung >= 2026) sind IMMER geschützt.
 *
 * Sicherheit: Ohne --apply nur Dry-Run. Ohne --produktion nur Sandbox
 * (tennismehl24_db_mock). Jede Änderung landet als Zeile im Protokoll-CSV.
 *
 *   npx tsx scripts/kundenstamm-bereinigung.ts --namen --opt-out            # Dry-Run
 *   npx tsx scripts/kundenstamm-bereinigung.ts --namen --apply              # Sandbox
 *   npx tsx scripts/kundenstamm-bereinigung.ts --opt-out --apply --produktion
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

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
const MODI = {
  namen: args.includes('--namen'),
  emailMuell: args.includes('--email-muell'),
  gambio: args.includes('--gambio'),
  optOut: args.includes('--opt-out'),
  // Entfernt Dienstleister-Adressen, die faelschlich als Kunden-E-Mail hinterlegt sind.
  mailsSaeubern: args.includes('--mails-saeubern'),
  // Buchhaltungs-Postfächer aus dem Angebots-Verteiler in den Rechnungsempfänger.
  buchhaltung: args.includes('--buchhaltung-trennen'),
  // Karteileichen ins Archiv statt löschen — Historie bleibt, Listen werden frei.
  archivieren: args.includes('--archivieren'),
  // Reparaturlauf: holt Kunden zurueck, die ein frueherer --opt-out-Lauf auf
  // Basis der unvollstaendigen Aktivitaetsdaten zu Unrecht ausgeschlossen hat.
  revision: args.includes('--opt-out-revidieren'),
};
if (!Object.values(MODI).some(Boolean)) {
  console.error('Mindestens einen Modus angeben: --namen --email-muell --gambio --opt-out --opt-out-revidieren --mails-saeubern --buchhaltung-trennen --archivieren');
  process.exit(1);
}
const gambioDirArg = args.find((a) => a.startsWith('--gambio-dir='));
const GAMBIO_DIR = gambioDirArg ? gambioDirArg.split('=')[1] : '';
const MIG = path.resolve(process.cwd(), '../migration/data');
const BLOCKLISTE_PFAD = path.resolve(process.cwd(), 'scripts/dienstleister-blockliste.json');
const PROTOKOLL = path.resolve(process.cwd(), `kundenstamm-bereinigung-${PRODUKTION ? 'prod' : 'mock'}-${new Date().toISOString().slice(0, 10)}.csv`);

// ---------------------------------------------------------------------------
// Appwrite-REST (gleiches Muster wie trage-gefundene-angebots-emails-ein.ts)
// ---------------------------------------------------------------------------
async function api<T = any>(methode: 'GET' | 'PATCH', pfad: string, body?: unknown) {
  const antwort = await fetch(`${endpoint}${pfad}`, {
    method: methode,
    headers: {
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await antwort.text();
  return { ok: antwort.ok, status: antwort.status, daten: (text ? JSON.parse(text) : {}) as T & { message?: string } };
}

interface Zeile { $id: string; data?: string; [f: string]: unknown }

async function ladeAlle(tabelle: string): Promise<Zeile[]> {
  const raus: Zeile[] = [];
  let cursor: string | null = null;
  for (;;) {
    const q: Array<{ method: string; values: unknown[] }> = [{ method: 'limit', values: [100] }];
    if (cursor) q.push({ method: 'cursorAfter', values: [cursor] });
    const qs = q.map((e) => `queries[]=${encodeURIComponent(JSON.stringify(e))}`).join('&');
    const res = await api<{ rows: Zeile[] }>('GET', `/tablesdb/${DB}/tables/${tabelle}/rows?${qs}`);
    if (!res.ok) throw new Error(`Lesen ${tabelle}: ${res.daten.message}`);
    const zeilen = res.daten.rows ?? [];
    if (zeilen.length === 0) break;
    raus.push(...zeilen);
    if (zeilen.length < 100) break;
    cursor = zeilen[zeilen.length - 1].$id;
  }
  return raus;
}

function alsObjekt(roh: unknown): Record<string, any> {
  if (roh && typeof roh === 'object' && !Array.isArray(roh)) return roh as Record<string, any>;
  if (typeof roh !== 'string') return {};
  try { const g = JSON.parse(roh); return g && typeof g === 'object' ? g : {}; } catch { return {}; }
}

// Drosselung: Appwrite Cloud verkraftet ~240 Writes/min. 320 ms ≈ 187/min.
const pause = () => new Promise((r) => setTimeout(r, 320));

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const ANREDEN = new Set(['herr', 'herrn', 'frau', 'firma', 'familie', 'fam.', 'privat', 'verein', 'z.hd.', 'z. hd.']);
const MAIL_GENAU = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const TELEFON = /^[\d\s\/\-().+]{6,}[a-z ]{0,3}$/;
const MAIL_IRGENDWO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const norm = (s: string) =>
  (s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\b(e\.?\s?v\.?|ev|tc|tv|tsv|sv|vfl|vfb|fc|sc|djk|tennisclub|tennisverein|sportverein|gmbh|ag|kg|co|gbr|1\.|und|&)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

const protokoll: string[] = ['modus;kundennummer;name;feld;alt;neu;grund'];
const p = (modus: string, knr: string, name: string, feld: string, alt: unknown, neu: unknown, grund: string) =>
  protokoll.push([modus, knr, name, feld, String(alt ?? ''), String(neu ?? ''), grund].map((x) => String(x).replace(/;/g, ',').replace(/\n/g, ' ')).join(';'));


/**
 * Letztes Jahr mit echter Geschäftstätigkeit — aus ALLEN Quellen.
 *
 * Die Mosaik-Vorgangsart ist im Export nur bis 2006 brauchbar: ab 2007 steht
 * bei jedem Vorgang „Sonstiges Kunde", obwohl in Mosaik selbst „Rechnung TM
 * GmbH" steht (Lesefehler des Exports, nicht der Quelle). Ein Filter auf die
 * Vorgangsart würde deshalb alles ab 2007 verwerfen und 502 aktive Kunden als
 * Karteileichen einstufen.
 *
 * Verlässlich ist `Umsatzdatum` am Adressdatensatz — das setzt Mosaik nur bei
 * echtem Umsatz und es reicht bis 2025. Die Vorgangsjahre kommen ergänzend
 * dazu, ohne Filter auf die Art.
 */
const jahrAus = (v: unknown): number => {
  const s = String(v ?? '');
  return /^\d{4}/.test(s) ? Number(s.slice(0, 4)) : 0;
};

let mosaikUmsatzjahr = new Map<string, number>();
let gambioAktivBisRef = new Map<string, string>();
let mosaikBestRef: Record<string, any> = {};
const BESTELL_STATUS = new Set(['auftragsbestaetigung', 'lieferschein', 'rechnung', 'bezahlt', 'geliefert']);

function letzteAktivitaet(kundeId: string, d: Record<string, any>, proj: Array<{ saisonjahr: number; status: string }>): number {
  let jahr = 0;
  for (const pr of proj) if (BESTELL_STATUS.has(pr.status) && pr.saisonjahr > jahr) jahr = pr.saisonjahr;
  const kurz = d.mosaikKurzname;
  if (kurz) {
    jahr = Math.max(jahr, mosaikUmsatzjahr.get(kurz) ?? 0);
    for (const j of Object.keys(mosaikBestRef[kurz] ?? {})) jahr = Math.max(jahr, Number(j) || 0);
  }
  jahr = Math.max(jahr, jahrAus(gambioAktivBisRef.get(kundeId)));
  return jahr;
}

/**
 * Mosaik-Gruppen, die Wiederverkäufer sind. Sie bekommen kein Massen-Angebot:
 * Ein Platzbauer, ein Baustoffhändler oder ein GaLaBauer kauft im Projekt und
 * zu anderen Konditionen — ein Serienangebot an ihn ist im besten Fall
 * wirkungslos und im schlechtesten eine Preisauskunft an den Wettbewerb.
 */
const HAENDLER_GRUPPEN = new Set(['Tennisplatzbau', 'Baustoffhandel', 'GALA', 'Gärtner-Kunden', 'Sportgeschäft', 'Dachdecker', 'Industrie']);

/**
 * Gepflegte Liste aus echten Fehlzuordnungen (scripts/dienstleister-blockliste.json).
 *
 * Die Mosaik-Gruppe erwischt nur, was dort sauber gepflegt ist — „Court Check"
 * oder „Tennisservice 24" stehen dort als Tennisclub. Deshalb zusätzlich diese
 * Liste, die aus der Durchsicht der echten Korrespondenz entstanden ist.
 */
interface Blockliste { domains: string[]; adressen: string[]; kundenNamen: string[] }
let block: Blockliste = { domains: [], adressen: [], kundenNamen: [] };
try {
  const roh = JSON.parse(fs.readFileSync(BLOCKLISTE_PFAD, 'utf8'));
  block = {
    domains: (roh.domains ?? []).map((d: string) => d.toLowerCase()),
    adressen: (roh.adressen ?? []).map((a: string) => a.toLowerCase()),
    kundenNamen: (roh.kundenNamen ?? []).map((n: string) => n.toLowerCase()),
  };
} catch {
  console.warn('⚠️  dienstleister-blockliste.json nicht lesbar — Blockliste bleibt leer.');
}

/** Gehört diese Adresse einem Dienstleister statt dem Kunden? */
const istDienstleisterMail = (mail: string): boolean => {
  const m = mail.toLowerCase().trim();
  if (block.adressen.includes(m)) return true;
  const dom = m.split('@')[1] ?? '';
  return block.domains.some((d) => dom === d || dom.endsWith(`.${d}`));
};

/**
 * Gehört die Adresse dem Kunden selbst?
 *
 * „Thomas Vogl" mit `info@vogl-sportanlagen.de` ist richtig — Vogl IST der
 * Platzbauer. Dieselbe Adresse bei „TC Bischberg" ist falsch. Ohne diesen Test
 * würde das Säubern genau den Dienstleistern ihre eigene Adresse nehmen.
 */
const gehoertZumKunden = (name: string, mail: string): boolean => {
  const ziel = name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const adresse = mail.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
  const woerter = ziel.split(/[^a-zäöüß0-9]+/).filter((w) => w.length >= 4 &&
    !['tennisservice', 'tennisplatzbau', 'garten', 'landschaftsbau', 'landschaftsgestaltung', 'sportanlagen', 'gmbh'].includes(w));
  return woerter.some((w) => adresse.includes(w));
};

/**
 * Ist der Kunde selbst ein Platzbauer/Händler/Dienstleister?
 *
 * Vereinsmerkmale schlagen die Liste: „Sportverein Wernsdorf e.V. Sportanlagen"
 * enthält „Sportanlagen" und ist trotzdem genau die Zielgruppe. Ein Verein wird
 * nie über ein Branchenwort im Namen ausgeschlossen.
 */
const VEREINSMERKMAL = /(\be\.?\s?v\.?\b|\bverein\b|^(tc|tv|tsv|sv|sc|fc|djk|tg|ta|tb|mtv|tsg|vfl|vfb|spvgg|ssv|fsv)\b)/i;
const istDienstleisterKunde = (name: string): string | undefined => {
  if (VEREINSMERKMAL.test(name)) return undefined;
  return block.kundenNamen.find((n) => name.toLowerCase().includes(n));
};

// ---------------------------------------------------------------------------
async function main() {
  console.log('═'.repeat(72));
  console.log('  KUNDENSTAMM-BEREINIGUNG');
  console.log(`  Ziel:  ${PRODUKTION ? '⚠️  PRODUKTION' : '🧪 SANDBOX'}  (${DB})`);
  console.log(`  Modus: ${APPLY ? 'APPLY — es wird geschrieben' : 'DRY-RUN (keine Änderungen)'}`);
  console.log(`  Aktiv: ${Object.entries(MODI).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
  console.log('═'.repeat(72));

  const kundenZeilen = await ladeAlle('saison_kunden');
  const kunden = kundenZeilen.map((z) => ({ zeile: z, d: alsObjekt(z.data) }));
  console.log(`${kunden.length} Kunden geladen.`);

  // Mosaik-Rohdaten (für --namen und --opt-out)
  let mosaikByKurz = new Map<string, any>();
  let mosaikApByKurz: Record<string, any[]> = {};
  let mosaikBest: Record<string, any> = {};
  if (MODI.namen || MODI.optOut || MODI.revision) {
    const mk: any[] = JSON.parse(fs.readFileSync(`${MIG}/kunden.json`, 'utf8'));
    mosaikByKurz = new Map(mk.map((m) => [m.Kurzname, m]));
    mosaikUmsatzjahr = new Map(mk.filter((m) => m.Kurzname).map((m) => [m.Kurzname, jahrAus(m.Umsatzdatum)]));
    mosaikApByKurz = JSON.parse(fs.readFileSync(`${MIG}/ansprechpartner.json`, 'utf8'));
    mosaikBest = JSON.parse(fs.readFileSync(`${MIG}/bestellhistorie.json`, 'utf8'));
    mosaikBestRef = mosaikBest;
  }

  // Portal-Projekte (Schutz + Aktivität)
  let projByKunde = new Map<string, any[]>();
  if (MODI.optOut || MODI.revision) {
    const projekte = await ladeAlle('projekte');
    for (const pr of projekte) {
      const kid = typeof pr.kundeId === 'string' ? pr.kundeId : '';
      if (!kid) continue;
      const arr = projByKunde.get(kid) ?? [];
      arr.push({ saisonjahr: Number(pr.saisonjahr) || 0, status: String(pr.status || ''), herkunft: String(pr.herkunft || '') });
      projByKunde.set(kid, arr);
    }
    console.log(`${[...projByKunde.values()].reduce((s, a) => s + a.length, 0)} Projekte geladen.`);
  }

  // Gambio-Harvest (für --gambio und als Aktivitätssignal in --opt-out)
  let gambioMailByKunde = new Map<string, { mail: string; art: string }>();
  let gambioAktivBis = new Map<string, string>(); // kundeId(Portal) → letztes Bestelldatum
  if ((MODI.gambio || MODI.optOut || MODI.revision) && GAMBIO_DIR) {
    const gk = new Map<number, any>((JSON.parse(fs.readFileSync(`${GAMBIO_DIR}/gambio-customers.json`, 'utf8')) as any[]).map((k) => [k.id, k]));
    const ga: any[] = JSON.parse(fs.readFileSync(`${GAMBIO_DIR}/gambio-addresses.json`, 'utf8'));
    const orders: any[] = JSON.parse(fs.readFileSync(`${GAMBIO_DIR}/gambio-orders.json`, 'utf8'));
    const letzteBest = new Map<string, string>();
    for (const o of orders) {
      const keys = [`k${o.kundeId}`, `m${(o.email || '').toLowerCase()}`];
      for (const key of keys) if ((o.datum || '') > (letzteBest.get(key) || '')) letzteBest.set(key, o.datum);
    }
    const idxFirmaPlz = new Map<string, any[]>();
    const idxFirma = new Map<string, any[]>();
    for (const a of ga) {
      if (!a.firma) continue;
      const nf = norm(a.firma);
      if (!nf) continue;
      if (a.plz) {
        const key = `${nf}|${String(a.plz).trim()}`;
        (idxFirmaPlz.get(key) ?? idxFirmaPlz.set(key, []).get(key)!).push(a);
      }
      (idxFirma.get(nf) ?? idxFirma.set(nf, []).get(nf)!).push(a);
    }
    for (const { zeile, d } of kunden) {
      const nn = norm(d.name || '');
      const plz = String(d.lieferadresse?.plz || d.rechnungsadresse?.plz || '').trim();
      let match: any[] | undefined; let art = '';
      if (nn && plz && idxFirmaPlz.has(`${nn}|${plz}`)) { match = idxFirmaPlz.get(`${nn}|${plz}`); art = 'firma+plz'; }
      else if (nn.length > 8 && idxFirma.get(nn)?.length === 1) { match = idxFirma.get(nn); art = 'firma-eindeutig'; }
      if (!match) continue;
      for (const a of match) {
        const konto = gk.get(a.kundeId);
        const mail = (konto?.email || '').toLowerCase();
        if (mail && MAIL_GENAU.test(mail) && !istDienstleisterMail(mail)) {
          gambioMailByKunde.set(zeile.$id, { mail, art });
          const aktiv = letzteBest.get(`k${a.kundeId}`) || letzteBest.get(`m${mail}`) || '';
          if (aktiv > (gambioAktivBis.get(zeile.$id) || '')) gambioAktivBis.set(zeile.$id, aktiv);
          break;
        }
      }
    }
    gambioAktivBisRef = gambioAktivBis;
    console.log(`Gambio: ${gambioMailByKunde.size} Kunden gematcht, ${gambioAktivBis.size} mit Bestelldatum.`);
  } else if (MODI.gambio) {
    console.error('--gambio braucht --gambio-dir=<Pfad zu gambio-*.json>'); process.exit(1);
  }

  // Aenderungen sammeln: kundeId → { d (neu), gruende[] }
  const geplant = new Map<string, { d: Record<string, any>; gruende: string[] }>();
  const merken = (zeile: Zeile, d: Record<string, any>, grund: string) => {
    const e = geplant.get(zeile.$id) ?? { d, gruende: [] };
    e.d = d; e.gruende.push(grund);
    geplant.set(zeile.$id, e);
  };

  // ===== --namen =====
  if (MODI.namen) {
    console.log('\n───── NAMEN REPARIEREN ─────');
    let anz = 0;
    for (const { zeile, d } of kunden) {
      const name = String(d.name || '').trim();
      const knr = String(d.kundennummer || '');
      let neuerName = '';
      let grund = '';

      if (ANREDEN.has(name.toLowerCase()) || name.length < 3) {
        const m = d.mosaikKurzname ? mosaikByKurz.get(d.mosaikKurzname) : undefined;
        if (m) {
          const kandidaten = [m.Name1, m.Name2, m.Name3]
            .map((x: string) => (x || '').trim())
            .filter((x: string) => x && !ANREDEN.has(x.toLowerCase()));
          if (kandidaten.length > 0) {
            neuerName = kandidaten[0];
            grund = 'Mosaik Name-Feld';
          } else {
            // Ansprechpartner, dessen Nachname im Kurznamen steckt
            const aps = mosaikApByKurz[d.mosaikKurzname] ?? [];
            const kurz = String(d.mosaikKurzname).replace(/[^A-Za-zÄÖÜäöüß ]/g, ' ').trim();
            const ap = aps.find((a: any) => a.Ansprechpartner && kurz && String(a.Ansprechpartner).toLowerCase().includes(kurz.split(' ')[0].toLowerCase()));
            if (ap) { neuerName = String(ap.Ansprechpartner).trim(); grund = 'Mosaik Ansprechpartner'; }
            else if (kurz && kurz.toLowerCase() !== name.toLowerCase()) { neuerName = kurz; grund = 'Mosaik Kurzname'; }
          }
        }
      } else if (/^baywa\s*ag$/i.test(name)) {
        const ort = String(d.lieferadresse?.ort || d.rechnungsadresse?.ort || '').trim();
        if (ort) { neuerName = `BayWa AG ${ort}`; grund = 'Filiale unterscheidbar machen'; }
      }

      if (neuerName && neuerName !== name) {
        anz++;
        console.log(`  ${knr.padEnd(8)} ${JSON.stringify(name).padEnd(22)} → ${JSON.stringify(neuerName).padEnd(34)} (${grund})`);
        const dNeu = { ...d, name: neuerName, notizen: `${d.notizen ? d.notizen + '\n' : ''}[Datenpflege] Name war "${name}" — korrigiert aus ${grund}.` };
        merken(zeile, dNeu, `namen: "${name}" → "${neuerName}"`);
        p('namen', knr, name, 'name', name, neuerName, grund);
      }
    }
    console.log(`→ ${anz} Namen zu reparieren.`);
  }

  // ===== --email-muell =====
  if (MODI.emailMuell) {
    console.log('\n───── E-MAIL-FELDER BEREINIGEN ─────');
    let anz = 0;
    for (const { zeile, d } of kunden) {
      const basis = geplant.get(zeile.$id)?.d ?? d;
      let dNeu = { ...basis };
      let geaendert = false;
      for (const feld of ['email', 'rechnungsEmail'] as const) {
        const wert = String(dNeu[feld] || '').trim();
        if (!wert || MAIL_GENAU.test(wert)) continue;
        geaendert = true;
        // Erst retten, dann wegräumen: In vielen Feldern stecken gültige
        // Adressen in Unordnung — "a@x.de; b@x.de", "'Name' <mail@x.de>".
        const gefunden = (wert.match(MAIL_IRGENDWO) ?? []).map((m) => m.toLowerCase()).filter((m) => MAIL_GENAU.test(m));
        if (gefunden.length > 0) {
          dNeu[feld] = gefunden[0];
          if (gefunden.length > 1) {
            const bisher = Array.isArray(dNeu.angebotsEmails) ? dNeu.angebotsEmails : [];
            dNeu.angebotsEmails = [...new Set([...bisher, ...gefunden])];
          }
          p('email-muell', String(d.kundennummer || ''), String(d.name || ''), feld, wert, gefunden.join('|'), 'E-Mails aus Freitext extrahiert');
        } else if (TELEFON.test(wert) && !dNeu.telefon) {
          dNeu.telefon = wert.replace(/\s*[gpd]$/i, '').trim();
          dNeu[feld] = '';
          dNeu.notizen = `${dNeu.notizen ? dNeu.notizen + '\n' : ''}[Datenpflege] ${feld} enthielt Telefonnummer "${wert}" — nach Telefon verschoben.`;
          p('email-muell', String(d.kundennummer || ''), String(d.name || ''), feld, wert, '→ telefon', 'Telefonnummer im E-Mail-Feld');
        } else {
          dNeu[feld] = '';
          dNeu.notizen = `${dNeu.notizen ? dNeu.notizen + '\n' : ''}[Datenpflege] ${feld} enthielt "${wert}" — kein E-Mail-Format, in die Notizen übernommen.`;
          p('email-muell', String(d.kundennummer || ''), String(d.name || ''), feld, wert, '', 'kein gültiges E-Mail-Format');
        }
      }
      if (geaendert) {
        anz++;
        console.log(`  ${String(d.kundennummer || '').padEnd(8)} ${String(d.name || '').slice(0, 30).padEnd(30)} email="${String(d.email || '')}" rechnungsEmail="${String(d.rechnungsEmail || '')}"`);
        merken(zeile, dNeu, 'email-muell');
      }
    }
    console.log(`→ ${anz} Kunden mit Nicht-E-Mail-Werten im E-Mail-Feld.`);
  }

  // ===== --gambio =====
  if (MODI.gambio) {
    console.log('\n───── GAMBIO-E-MAILS ERGÄNZEN ─────');
    let anz = 0;
    for (const { zeile, d } of kunden) {
      const basis = geplant.get(zeile.$id)?.d ?? d;
      const hatMail = MAIL_GENAU.test(String(basis.email || '')) || MAIL_GENAU.test(String(basis.rechnungsEmail || '')) || (Array.isArray(basis.angebotsEmails) && basis.angebotsEmails.length > 0);
      const treffer = gambioMailByKunde.get(zeile.$id);
      if (hatMail || !treffer) continue;
      anz++;
      const dNeu = {
        ...basis,
        angebotsEmails: [treffer.mail],
        notizen: `${basis.notizen ? basis.notizen + '\n' : ''}[Datenpflege] E-Mail ${treffer.mail} aus Gambio-Shop-Konto übernommen (${treffer.art}).`,
      };
      console.log(`  ${String(d.kundennummer || '').padEnd(8)} ${String(d.name || '').slice(0, 32).padEnd(32)} → ${treffer.mail} (${treffer.art})`);
      merken(zeile, dNeu, `gambio: ${treffer.mail}`);
      p('gambio', String(d.kundennummer || ''), String(d.name || ''), 'angebotsEmails', '', treffer.mail, treffer.art);
    }
    console.log(`→ ${anz} Kunden bekommen eine Gambio-E-Mail.`);
  }

  // ===== --opt-out =====
  if (MODI.optOut) {
    console.log('\n───── OPT-OUT (Massenangebots-Tauglichkeit entziehen) ─────');
    const TECHNISCH = /testverein|mengenblocker|topp commerce|^test$/i;
    const BESTELL = new Set(['auftragsbestaetigung', 'lieferschein', 'rechnung', 'bezahlt', 'geliefert']);
    let anz = 0; const statistik: Record<string, number> = {};
    for (const { zeile, d } of kunden) {
      const basis = geplant.get(zeile.$id)?.d ?? d;
      if (basis.automatischesAngebot !== true) continue; // ist schon draußen
      const name = String(basis.name || '');
      const knr = String(d.kundennummer || '');
      const proj = projByKunde.get(zeile.$id) ?? [];

      // Platzbauer und Händler VOR dem Stammkunden-Schutz prüfen. Sie sind oft
      // die aktivsten Kunden überhaupt — und bekommen trotzdem kein Serien-
      // angebot: Sie kaufen im Projekt, zu eigenen Konditionen, nach Absprache.
      // Ohne diese Reihenfolge deckt der Schutz für aktive Kunden genau die
      // Adressaten, die auf keinen Fall angeschrieben werden dürfen.
      const dienstleister = istDienstleisterKunde(name);
      if (!dienstleister) {
        const stammkunde = proj.some((pr) => pr.saisonjahr >= 2026 && BESTELL.has(pr.status));
        const vorgang2026 = proj.some((pr) => pr.saisonjahr >= 2026);
        if (stammkunde || vorgang2026) continue;
      }

      const letztesJahr = letzteAktivitaet(zeile.$id, d, proj);

      const gruppe = d.mosaikKurzname ? mosaikByKurz.get(d.mosaikKurzname)?.Gruppe : undefined;
      let grund = '';
      if (TECHNISCH.test(name)) grund = 'technischer Kunde';
      else if (dienstleister) grund = `Platzbauer/Dienstleister („${dienstleister}")`;
      else if (gruppe && HAENDLER_GRUPPEN.has(gruppe)) grund = `Wiederverkäufer (Mosaik-Gruppe ${gruppe})`;
      else if (ANREDEN.has(name.trim().toLowerCase()) || name.trim().length < 3) grund = 'kein brauchbarer Name';
      else if (!(basis.lieferadresse?.plz || basis.rechnungsadresse?.plz)) grund = 'keine Adresse';
      else if (letztesJahr === 0) grund = 'nie eine Bestellung (Portal, Mosaik, Gambio)';
      else if (letztesJahr < 2016) grund = `letzte Bestellung ${letztesJahr} (>10 Jahre)`;
      if (!grund) continue;

      anz++;
      statistik[grund.replace(/\d{4}/, 'JJJJ')] = (statistik[grund.replace(/\d{4}/, 'JJJJ')] ?? 0) + 1;
      const dNeu = { ...basis, automatischesAngebot: false };
      merken(zeile, dNeu, `opt-out: ${grund}`);
      p('opt-out', knr, name, 'automatischesAngebot', 'true', 'false', grund);
    }
    console.log(`→ ${anz} Kunden verlieren die Massenangebots-Tauglichkeit:`);
    for (const [g, c] of Object.entries(statistik).sort((a, b) => b[1] - a[1])) console.log(`     ${String(c).padStart(5)}  ${g}`);
  }

  // ===== --mails-saeubern =====
  if (MODI.mailsSaeubern) {
    console.log('\n───── DIENSTLEISTER-ADRESSEN AUS DEN KUNDENFELDERN ENTFERNEN ─────');
    let anz = 0;
    for (const { zeile, d } of kunden) {
      const basis = geplant.get(zeile.$id)?.d ?? d;
      const dNeu = { ...basis };
      const raus: string[] = [];
      for (const feld of ['email', 'rechnungsEmail'] as const) {
        const wert = String(dNeu[feld] || '').trim();
        if (wert && istDienstleisterMail(wert) && !gehoertZumKunden(String(basis.name || ''), wert)) {
          raus.push(`${feld}=${wert}`); dNeu[feld] = '';
        }
      }
      if (Array.isArray(dNeu.angebotsEmails)) {
        const fremd = (m: string) => istDienstleisterMail(String(m)) && !gehoertZumKunden(String(basis.name || ''), String(m));
        const behalten = dNeu.angebotsEmails.filter((m: string) => !fremd(m));
        const weg = dNeu.angebotsEmails.filter((m: string) => fremd(m));
        if (weg.length) { raus.push(...weg.map((m: string) => `angebotsEmails=${m}`)); dNeu.angebotsEmails = behalten; }
      }
      if (!raus.length) continue;
      anz++;
      console.log(`  ${String(d.kundennummer || '').padEnd(8)} ${String(d.name || '').slice(0, 30).padEnd(30)} ${raus.join(', ')}`);
      dNeu.notizen = `${dNeu.notizen ? dNeu.notizen + '\n' : ''}[Datenpflege] Dienstleister-Adresse entfernt (${raus.join(', ')}) — gehört einem Platzbauer/Lieferanten, nicht dem Kunden.`;
      merken(zeile, dNeu, 'mails-saeubern');
      for (const r of raus) p('mails-saeubern', String(d.kundennummer || ''), String(d.name || ''), r.split('=')[0], r.split('=').slice(1).join('='), '', 'Dienstleister-Adresse');
    }
    console.log(`→ ${anz} Kunden mit fremder Dienstleister-Adresse im E-Mail-Feld.`);
  }

  // ===== --buchhaltung-trennen =====
  if (MODI.buchhaltung) {
    console.log('\n───── BUCHHALTUNGS-ADRESSEN AUS DEM ANGEBOTS-VERTEILER ─────');
    let anz = 0;
    for (const { zeile, d } of kunden) {
      const basis = geplant.get(zeile.$id)?.d ?? d;
      if (!Array.isArray(basis.angebotsEmails) || !basis.angebotsEmails.length) continue;
      const buch = basis.angebotsEmails.filter((m: string) => BUCHHALTUNGS_POSTFACH.test(String(m)));
      const rest = basis.angebotsEmails.filter((m: string) => !BUCHHALTUNGS_POSTFACH.test(String(m)));
      // Die letzte verbliebene Adresse bleibt stehen — lieber die Buchhaltung
      // im Verteiler als gar kein Empfänger.
      if (!buch.length || !rest.length) continue;
      anz++;
      const dNeu = { ...basis, angebotsEmails: rest };
      if (!dNeu.rechnungsEmail) dNeu.rechnungsEmail = buch[0];
      dNeu.notizen = `${dNeu.notizen ? dNeu.notizen + '\n' : ''}[Datenpflege] ${buch.join(', ')} aus dem Angebots-Verteiler in den Rechnungsempfänger verschoben.`;
      console.log(`  ${String(d.kundennummer || '').padEnd(8)} ${String(d.name || '').slice(0, 32).padEnd(32)} ${buch.join(', ')}`);
      merken(zeile, dNeu, 'buchhaltung-trennen');
      p('buchhaltung-trennen', String(d.kundennummer || ''), String(d.name || ''), 'angebotsEmails', buch.join(','), '→ rechnungsEmail', 'Buchhaltungs-Postfach');
    }
    console.log(`→ ${anz} Kunden.`);
  }

  // ===== --archivieren =====
  if (MODI.archivieren) {
    console.log('\n───── KARTEILEICHEN ARCHIVIEREN ─────');
    // Namen ohne jeden Informationswert. Bewusst als exakte Treffer und nicht
    // als Teilstring: „Privatweg 3" oder „TC Privatsee" wären sonst mit drin.
    const OHNE_WERT = /^(privat|privatkunde|tennisanlage|tennisplatz|sportplatz|verein|firma|kunde|neuer kunde|unbekannt|\?+)$/i;
    let anz = 0; const statistik: Record<string, number> = {};
    for (const { zeile, d } of kunden) {
      const basis = geplant.get(zeile.$id)?.d ?? d;
      if (basis.archiviert === true) continue;
      const name = String(basis.name || '').trim();
      let grund = '';
      if (OHNE_WERT.test(name)) grund = 'Kein verwertbarer Kundenname';
      else if (!name || name.length < 3) grund = 'Kundenname fehlt';
      if (!grund) continue;
      anz++;
      statistik[grund] = (statistik[grund] ?? 0) + 1;
      console.log(`  ${String(d.kundennummer || '—').padEnd(9)} „${name}" · ${basis.lieferadresse?.plz || ''} ${basis.lieferadresse?.ort || ''}`);
      merken(zeile, {
        ...basis, archiviert: true, aktiv: false, automatischesAngebot: false,
        archivGrund: grund, archiviertAm: new Date().toISOString(),
      }, `archivieren: ${grund}`);
      p('archivieren', String(d.kundennummer || ''), name, 'archiviert', 'false', 'true', grund);
    }
    console.log(`→ ${anz} Kunden ins Archiv. Projekte und Belege bleiben erhalten.`);
    for (const [g, c] of Object.entries(statistik)) console.log(`     ${String(c).padStart(5)}  ${g}`);
  }

  // ===== --opt-out-revidieren =====
  if (MODI.revision) {
    console.log('\n───── OPT-OUT REVIDIEREN (zu Unrecht Ausgeschlossene zurückholen) ─────');
    const TECHNISCH = /testverein|mengenblocker|topp commerce|^test$/i;
    let anz = 0; const statistik: Record<string, number> = {};
    for (const { zeile, d } of kunden) {
      const basis = geplant.get(zeile.$id)?.d ?? d;
      if (basis.automatischesAngebot === true) continue; // schon drin
      if (basis.aktiv === false) continue;
      const name = String(basis.name || '');
      const proj = projByKunde.get(zeile.$id) ?? [];
      const gruppe = d.mosaikKurzname ? mosaikByKurz.get(d.mosaikKurzname)?.Gruppe : undefined;

      // Dieselben Ausschlussgründe wie beim Opt-out — nur die Aktivität ist neu.
      if (TECHNISCH.test(name)) continue;
      if (ANREDEN.has(name.trim().toLowerCase()) || name.trim().length < 3) continue;
      if (!(basis.lieferadresse?.plz || basis.rechnungsadresse?.plz)) continue;
      if (gruppe && HAENDLER_GRUPPEN.has(gruppe)) continue;
      if (istDienstleisterKunde(name)) continue;

      const jahr = letzteAktivitaet(zeile.$id, d, proj);
      if (jahr < 2016) continue;

      anz++;
      const bucket = jahr >= 2023 ? 'Aktivität 2023–2026' : jahr >= 2020 ? 'Aktivität 2020–2022' : 'Aktivität 2016–2019';
      statistik[bucket] = (statistik[bucket] ?? 0) + 1;
      merken(zeile, { ...basis, automatischesAngebot: true }, `revision: aktiv bis ${jahr}`);
      p('revision', String(d.kundennummer || ''), name, 'automatischesAngebot', 'false', 'true', `letzte Aktivität ${jahr}${gruppe ? ` · ${gruppe}` : ''}`);
    }
    console.log(`→ ${anz} Kunden bekommen die Tauglichkeit zurück:`);
    for (const [g, c] of Object.entries(statistik).sort((a, b) => b[1] - a[1])) console.log(`     ${String(c).padStart(5)}  ${g}`);
  }

  // ===== Schreiben =====
  console.log('\n' + '═'.repeat(72));
  console.log(`Geplante Änderungen: ${geplant.size} Kunden.`);
  fs.writeFileSync(PROTOKOLL, protokoll.join('\n'));
  console.log(`Protokoll: ${PROTOKOLL}`);
  if (!APPLY) { console.log('DRY-RUN — nichts geschrieben. Zum Ausführen: --apply'); return; }

  let ok = 0, fehler = 0, i = 0;
  for (const [kundeId, e] of geplant) {
    i++;
    const res = await api('PATCH', `/tablesdb/${DB}/tables/saison_kunden/rows/${kundeId}`, {
      data: { data: JSON.stringify(e.d) },
    });
    if (res.ok) ok++; else { fehler++; console.error(`  ✗ ${kundeId}: ${res.daten.message ?? res.status}`); }
    if (i % 100 === 0) console.log(`  … ${i}/${geplant.size}`);
    await pause();
  }
  console.log(`FERTIG: ${ok} geschrieben, ${fehler} Fehler.`);
}

main().catch((e) => { console.error('❌ Abbruch:', (e as Error).message); process.exit(1); });
