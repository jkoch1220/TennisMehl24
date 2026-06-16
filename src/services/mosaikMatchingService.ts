/**
 * Mosaik-Matching: findet pro Mosaik-Kunde den wahrscheinlichsten CRM-Kunden.
 *
 * Strategie (ohne KI — die wird im Graubereich separat ergänzt):
 *  1. Bereits migriert?  → exakter `mosaikKurzname`-Treffer → Score 1.0.
 *  2. Name-Ähnlichkeit (Jaro-Winkler + N-Gram + Levenshtein) gegen normalisierte
 *     CRM-Namen; PLZ- und Orts-Treffer geben Bonus.
 *
 * Schwellen:
 *  - ≥ 0.85 → `auto_match` (UI-Vorschlag, trotzdem bestätigbar)
 *  - 0.55–0.85 → `review` (UI-Entscheidung)
 *  - < 0.55 → `neu` (kein Match)
 */

import { stringSimilarity } from '../utils/fuzzySearch';
import { SaisonKunde } from '../types/saisonplanung';
import {
  MosaikKunde,
  FeldDiffEintrag,
  MigrationKandidat,
  MigrationStatus,
} from '../types/mosaik';
import { plzZuBundesland } from '../utils/plzBundesland';

export const SCHWELLE_AUTO_MATCH = 0.85;
export const SCHWELLE_REVIEW = 0.55;

// ============================================================
// NAMENS-NORMALISIERUNG
// ============================================================

/** Wörter, die fast jeder Verein/Firma im Namen hat und damit kein Signal sind */
const STOPWORDS = new Set([
  'e.v.',
  'ev',
  'e v',
  'gmbh',
  'gmbh & co.',
  'gmbh & co. kg',
  'kg',
  'gbr',
  'ohg',
  'ag',
  'tc',
  'tsv',
  'tv',
  'tus',
  'tg',
  'sv',
  'sg',
  'fc',
  'fsv',
  'sc',
  'tennisclub',
  'tennisverein',
  'tennisabteilung',
  'tennis',
  'sportverein',
  'sportclub',
  'sportgemeinschaft',
  'turnverein',
  'turn',
  'sport',
  'club',
  'verein',
  'abteilung',
  '1.',
  '2.',
  '3.',
]);

/** Liefert einen für den Vergleich geeigneten, sehr aggressiv reduzierten Namen */
export function normalisiereName(name: string | null | undefined): string {
  if (!name) return '';
  const lower = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\w\s.&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const woerter = lower.split(' ').filter((w) => w && !STOPWORDS.has(w));
  return woerter.join(' ').trim();
}

/** Aus Mosaik-Daten die besten Namenskandidaten (Name2 ist meist der "echte" Name) */
export function extrahiereNamenskandidaten(kunde: MosaikKunde): string[] {
  const namen = [kunde.Name2, kunde.Name3, kunde.Name1, kunde.Matchcode]
    .filter((n): n is string => Boolean(n && n.trim()))
    .map((n) => n.trim());
  return Array.from(new Set(namen));
}

// ============================================================
// SCORING
// ============================================================

export interface MatchKandidat {
  kunde: SaisonKunde;
  score: number;
  nameSimilarity: number;
  plzExakt: boolean;
  plzBereich: boolean;
  ortMatch: boolean;
  begruendung: string;
}

function plzBereichGleich(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.substring(0, 2) === b.substring(0, 2);
}

/**
 * Vergleicht einen Mosaik-Kunden mit einem CRM-Kunden.
 * Gibt den finalen Score zurück.
 */
export function bewerteMatch(mosaik: MosaikKunde, crm: SaisonKunde): MatchKandidat {
  // Direkter Treffer auf mosaikKurzname → kein Raten
  if (crm.mosaikKurzname && crm.mosaikKurzname === mosaik.Kurzname) {
    return {
      kunde: crm,
      score: 1.0,
      nameSimilarity: 1.0,
      plzExakt: true,
      plzBereich: true,
      ortMatch: true,
      begruendung: `Bereits migriert (mosaikKurzname = ${mosaik.Kurzname})`,
    };
  }

  const mosaikNamen = extrahiereNamenskandidaten(mosaik).map(normalisiereName);
  const crmName = normalisiereName(crm.name);

  let beste = 0;
  for (const n of mosaikNamen) {
    if (!n || !crmName) continue;
    const sim = stringSimilarity(n, crmName);
    if (sim > beste) beste = sim;
  }

  const plzMosaik = mosaik.PLZ?.trim();
  const plzCrm = crm.rechnungsadresse?.plz?.trim() || crm.lieferadresse?.plz?.trim();
  const plzExakt = Boolean(plzMosaik && plzCrm && plzMosaik === plzCrm);
  const plzBereich = !plzExakt && plzBereichGleich(plzMosaik, plzCrm);

  const ortMosaik = (mosaik.Ort ?? '').toLowerCase().trim();
  const ortCrm = (
    crm.rechnungsadresse?.ort ||
    crm.lieferadresse?.ort ||
    ''
  )
    .toLowerCase()
    .trim();
  const ortMatch = Boolean(ortMosaik && ortCrm && ortMosaik === ortCrm);

  let score = beste;
  if (plzExakt) score = Math.min(1.0, score + 0.1);
  else if (plzBereich) score = Math.min(1.0, score + 0.03);
  if (ortMatch && !plzExakt) score = Math.min(1.0, score + 0.05);

  const teile: string[] = [];
  teile.push(`Namens-Ähnlichkeit ${(beste * 100).toFixed(0)} %`);
  if (plzExakt) teile.push(`PLZ ${plzMosaik} exakt`);
  else if (plzBereich) teile.push(`PLZ-Bereich ${plzMosaik?.substring(0, 2)} gleich`);
  if (ortMatch) teile.push(`Ort "${mosaik.Ort}" gleich`);

  return {
    kunde: crm,
    score,
    nameSimilarity: beste,
    plzExakt,
    plzBereich,
    ortMatch,
    begruendung: teile.join(', '),
  };
}

/** Findet die TopN-CRM-Kandidaten für einen Mosaik-Kunden */
export function findeTopMatches(
  mosaik: MosaikKunde,
  crmKunden: SaisonKunde[],
  topN = 3
): MatchKandidat[] {
  const bewertet = crmKunden
    .map((k) => bewerteMatch(mosaik, k))
    .filter((m) => m.score > 0);
  bewertet.sort((a, b) => b.score - a.score);
  return bewertet.slice(0, topN);
}

export function leiteStatusAb(score: number): MigrationStatus {
  if (score >= SCHWELLE_AUTO_MATCH) return 'auto_match';
  if (score >= SCHWELLE_REVIEW) return 'review';
  return 'neu';
}

// ============================================================
// FELD-DIFF
// ============================================================

/**
 * Empfiehlt pro Feld, ob der Mosaik-Wert übernommen werden soll.
 * Regel: ist das CRM-Feld leer → Mosaik füllt; ist es befüllt → CRM behält
 * (kein automatisches Überschreiben). Bei "Konflikt" muss die UI entscheiden.
 */
export function berechneFeldDiff(
  mosaik: MosaikKunde,
  crm: SaisonKunde | null | undefined
): FeldDiffEintrag[] {
  const crmName = crm?.name ?? null;
  const crmStrasse = crm?.rechnungsadresse?.strasse ?? null;
  const crmPlz = crm?.rechnungsadresse?.plz ?? null;
  const crmOrt = crm?.rechnungsadresse?.ort ?? null;
  const crmEmail = crm?.email ?? null;
  const crmKundennr = crm?.kundennummer ?? null;
  const crmNotizen = crm?.notizen ?? null;

  // Bevorzugter Mosaik-Name: Name2, Fallback Name3
  const mosaikName = mosaik.Name2 || mosaik.Name3 || mosaik.Name1 || null;
  const mosaikStrasse = mosaik.Straße || null;
  const mosaikPlz = mosaik.PLZ || null;
  const mosaikOrt = mosaik.Ort || null;
  const mosaikEmail = mosaik.Kommunikation || null;
  const mosaikInfo = mosaik.Info || null;

  function eintrag(
    feld: string,
    mosaikWert: string | null,
    crmWert: string | null
  ): FeldDiffEintrag {
    let empfehlung: FeldDiffEintrag['empfehlung'];
    if (!mosaikWert && !crmWert) empfehlung = 'beibehalten';
    else if (mosaikWert && !crmWert) empfehlung = 'mosaik';
    else if (!mosaikWert && crmWert) empfehlung = 'crm';
    else if (mosaikWert === crmWert) empfehlung = 'beibehalten';
    // Notizen niemals verlieren → Default = Mosaik anhängen
    else if (feld === 'notizen') empfehlung = 'mosaik';
    else empfehlung = 'crm'; // sonstiger Konflikt → CRM behalten
    return { feld, mosaikWert, crmWert, empfehlung };
  }

  return [
    eintrag('name', mosaikName, crmName),
    eintrag('kundennummer', mosaik.Nummer, crmKundennr),
    eintrag('strasse', mosaikStrasse, crmStrasse),
    eintrag('plz', mosaikPlz, crmPlz),
    eintrag('ort', mosaikOrt, crmOrt),
    eintrag(
      'bundesland',
      plzZuBundesland(mosaikPlz) ?? null,
      crm?.rechnungsadresse?.bundesland ?? null
    ),
    eintrag('email', mosaikEmail, crmEmail),
    eintrag('telefon', mosaik.Telefon, null), // CRM hat Telefon nur via Ansprechpartner
    eintrag('mobil', mosaik.Mobiltelefon, null),
    eintrag('webseite', mosaik.Internetadresse, null),
    eintrag('ustid', mosaik.UStID, null),
    eintrag('iban', mosaik.IBAN, null),
    eintrag('notizen', mosaikInfo, crmNotizen),
  ].filter(
    // Felder ohne jeden Wert raus
    (e) => e.mosaikWert !== null || e.crmWert !== null
  );
}

// ============================================================
// BATCH-MATCHING (lokal, deterministisch)
// ============================================================

export interface MatchingErgebnis {
  kandidatId: string;
  vorherStatus: MigrationStatus;
  neuStatus: MigrationStatus;
  matchKundeId?: string;
  matchScore?: number;
  matchBegruendung?: string;
  feldDiff: FeldDiffEintrag[];
}

/**
 * Berechnet für jeden Kandidaten den besten CRM-Match.
 * Status wird nur dann auf `auto_match`/`review`/`neu` gesetzt, wenn der
 * Kandidat noch nicht manuell bearbeitet wurde (`neu`, `auto_match`, `review`).
 * `bestaetigt` und `angelegt` bleiben unangetastet.
 */
export function berechneMatchesLokal(
  kandidaten: MigrationKandidat[],
  crmKunden: SaisonKunde[]
): MatchingErgebnis[] {
  const ergebnisse: MatchingErgebnis[] = [];
  for (const k of kandidaten) {
    if (k.status === 'bestaetigt' || k.status === 'angelegt') continue;

    const top = findeTopMatches(k.data.rohdaten, crmKunden, 1);
    const best = top[0];
    const neuStatus: MigrationStatus = best ? leiteStatusAb(best.score) : 'neu';
    const matchKunde = best?.kunde;
    const feldDiff = berechneFeldDiff(k.data.rohdaten, matchKunde);

    ergebnisse.push({
      kandidatId: k.id,
      vorherStatus: k.status,
      neuStatus,
      matchKundeId: matchKunde?.id,
      matchScore: best?.score,
      matchBegruendung: best?.begruendung,
      feldDiff,
    });
  }
  return ergebnisse;
}
