/**
 * Die Filterlogik des Kanban-Boards.
 *
 * In der Hochsaison laufen rund 200 Projekte gleichzeitig. Ein Board mit 200
 * Karten ist keine Übersicht, sondern ein Stapel — die Filter sind das, was es
 * wieder benutzbar macht.
 *
 * VERKNÜPFUNG, die wichtigste Entscheidung hier:
 *
 *   Innerhalb einer Gruppe gilt ODER.   „0/2 oder 0/3"
 *   Zwischen den Gruppen gilt UND.      „Shop UND Universal"
 *
 * Das entspricht dem, was Menschen von Filtern erwarten, und deckt beide Fälle
 * ab, die im Betrieb wirklich vorkommen: mehrere gleichartige Dinge einsammeln
 * (Körnungen, Kanäle) und mehrere Bedingungen verschärfen (nur Shop, und davon
 * nur die mit Universal-Positionen).
 *
 * Eine leere Gruppe filtert NICHT. „Nichts ausgewählt" heißt „alles zeigen" und
 * nicht „nichts zeigen" — sonst wäre ein frisch geöffnetes Board leer.
 */

import { Projekt } from '../types/projekt';
import { getProjektKategorien } from './projektHerkunft';
import { getAbwicklungswege, faehrtEigenerLkw } from './abwicklungsweg';
import { parseMaterialAufschluesselung } from './dispoMaterialParser';
import { lieferterminEffektiv, istUeberfaellig } from './liefertermin';

// ============================================================
// Die Achsen
// ============================================================

export type KanalWert = 'shop' | 'platzbau' | 'anfrage' | 'direkt';
export type ProduktWert = 'ziegelmehl' | 'hydrocourt' | 'universal';
export type KoernungWert = '02' | '03';
export type FormWert = 'lose' | 'sackware' | 'bigbag' | 'beiladung';
export type TransportWert = 'eigener_lkw' | 'spedition' | 'abholung' | 'kranwagen';
export type TerminWert = 'ueberfaellig' | 'diese_woche' | 'naechste_woche' | 'spaeter' | 'ohne';

export interface ProjektFilter {
  kanal: KanalWert[];
  produkt: ProduktWert[];
  koernung: KoernungWert[];
  form: FormWert[];
  transport: TransportWert[];
  termin: TerminWert[];
  /** Freitext über Name, Kundennummer, Ort, Belegnummern. */
  suche: string;
}

export const LEERER_FILTER: ProjektFilter = {
  kanal: [],
  produkt: [],
  koernung: [],
  form: [],
  transport: [],
  termin: [],
  suche: '',
};

/** Filtert der Filter überhaupt etwas? Für „Zurücksetzen"-Knopf und Badge. */
export function istFilterAktiv(f: ProjektFilter): boolean {
  return (
    f.kanal.length > 0 ||
    f.produkt.length > 0 ||
    f.koernung.length > 0 ||
    f.form.length > 0 ||
    f.transport.length > 0 ||
    f.termin.length > 0 ||
    f.suche.trim().length > 0
  );
}

export function anzahlAktiverFilter(f: ProjektFilter): number {
  return (
    f.kanal.length +
    f.produkt.length +
    f.koernung.length +
    f.form.length +
    f.transport.length +
    f.termin.length +
    (f.suche.trim() ? 1 : 0)
  );
}

// ============================================================
// Die einzelnen Prüfungen
// ============================================================

function trifftKanal(projekt: Projekt, werte: KanalWert[], anfrageIds?: Set<string>): boolean {
  if (werte.length === 0) return true;
  const kategorien = getProjektKategorien(projekt, anfrageIds);
  return werte.some((w) => {
    if (w === 'direkt') {
      // „Direkt" ist die Abwesenheit der anderen drei — von Hand angelegt, ohne
      // Shop, Platzbauer oder Anfrage dahinter.
      return !kategorien.has('shop') && !kategorien.has('platzbau') && !kategorien.has('anfrage');
    }
    return kategorien.has(w);
  });
}

function trifftProdukt(projekt: Projekt, werte: ProduktWert[]): boolean {
  if (werte.length === 0) return true;
  const kategorien = getProjektKategorien(projekt);
  return werte.some((w) => {
    if (w === 'ziegelmehl') {
      // Eigenes Material: alles, was Tonnage aus den Positionen hat. Ein Auftrag
      // kann Ziegelmehl UND Hydrocourt enthalten — die Werte schliessen sich
      // nicht aus, deshalb keine „sonst"-Logik.
      return parseMaterialAufschluesselung(projekt).gesamtTonnen > 0;
    }
    return kategorien.has(w);
  });
}

function trifftKoernung(projekt: Projekt, werte: KoernungWert[]): boolean {
  if (werte.length === 0) return true;
  const m = parseMaterialAufschluesselung(projekt);
  return werte.some((w) =>
    w === '02'
      ? m.lose02 > 0 || m.gesackt02 > 0 || m.palettenTonnen02 > 0 || m.bigBagTonnen02 > 0
      : m.lose03 > 0 || m.gesackt03 > 0 || m.palettenTonnen03 > 0 || m.bigBagTonnen03 > 0
  );
}

function trifftForm(projekt: Projekt, werte: FormWert[]): boolean {
  if (werte.length === 0) return true;
  const m = parseMaterialAufschluesselung(projekt);
  return werte.some((w) => {
    switch (w) {
      case 'lose':
        return m.gesamtLose > 0;
      case 'sackware':
        // Palettenware ohne BigBag: gezählte Säcke auf Paletten.
        return m.hatPalettenware;
      case 'bigbag':
        return m.hatBigBag;
      case 'beiladung':
        // Einzelne Säcke, die auf einem Schüttgut-LKW mitfahren.
        return m.hatBeiladung;
      default:
        return false;
    }
  });
}

function trifftTransport(projekt: Projekt, werte: TransportWert[]): boolean {
  if (werte.length === 0) return true;
  const wege = getAbwicklungswege(projekt);
  return werte.some((w) => {
    switch (w) {
      case 'eigener_lkw':
        return faehrtEigenerLkw(projekt);
      case 'spedition':
        // Speditionsware ist Palettenware, die NICHT unser LKW fährt — sonst
        // stünde derselbe Auftrag unter beiden Transportarten.
        return (wege.has('palette') || wege.has('kranwagen')) && !faehrtEigenerLkw(projekt);
      case 'abholung':
        return wege.has('abholung');
      case 'kranwagen':
        return wege.has('kranwagen');
      default:
        return false;
    }
  });
}

/** Kalenderwoche eines Datums, ISO-8601 (Montag als Wochenstart). */
function kwVon(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const jahresBeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jahresBeginn.getTime()) / 86400000 + 1) / 7);
}

function trifftTermin(projekt: Projekt, werte: TerminWert[], heute: Date): boolean {
  if (werte.length === 0) return true;
  const termin = lieferterminEffektiv(projekt);

  return werte.some((w) => {
    if (w === 'ohne') return !termin;
    if (!termin) return false;
    if (w === 'ueberfaellig') return istUeberfaellig(projekt, heute);

    const ziel = new Date(termin.datum);
    if (Number.isNaN(ziel.getTime())) return false;
    const kwHeute = kwVon(heute);
    const kwZiel = kwVon(ziel);
    const gleichesJahr = ziel.getFullYear() === heute.getFullYear();

    switch (w) {
      case 'diese_woche':
        return gleichesJahr && kwZiel === kwHeute;
      case 'naechste_woche':
        return gleichesJahr && kwZiel === kwHeute + 1;
      case 'spaeter':
        return ziel > heute && !(gleichesJahr && kwZiel <= kwHeute + 1);
      default:
        return false;
    }
  });
}

/**
 * Freitextsuche über die Felder, nach denen im Betrieb tatsächlich gesucht wird:
 * Vereinsname, Ort, Kundennummer und die Belegnummern. Ohne die Belegnummern
 * müsste man für „wo steckt ANG-2026-0523?" das Board absuchen.
 */
function trifftSuche(projekt: Projekt, suche: string): boolean {
  const q = suche.trim().toLowerCase();
  if (!q) return true;
  const felder = [
    projekt.kundenname,
    projekt.projektName,
    projekt.kundennummer,
    projekt.kundenPlzOrt,
    projekt.angebotsnummer,
    projekt.auftragsbestaetigungsnummer,
    projekt.lieferscheinnummer,
    projekt.rechnungsnummer,
    projekt.shopBestellnummer,
  ];
  return felder.some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
}

// ============================================================
// Anwendung
// ============================================================

export interface FilterKontext {
  /** Projekt-IDs, die aus einer Anfrage stammen (Altbestand ohne `herkunft`). */
  anfrageProjektIds?: Set<string>;
  /** Bezugstag für die Terminachse; injizierbar, damit Tests nicht am Kalender hängen. */
  heute?: Date;
}

export function trifftFilter(
  projekt: Projekt,
  filter: ProjektFilter,
  kontext: FilterKontext = {}
): boolean {
  const heute = kontext.heute ?? new Date();
  return (
    trifftKanal(projekt, filter.kanal, kontext.anfrageProjektIds) &&
    trifftProdukt(projekt, filter.produkt) &&
    trifftKoernung(projekt, filter.koernung) &&
    trifftForm(projekt, filter.form) &&
    trifftTransport(projekt, filter.transport) &&
    trifftTermin(projekt, filter.termin, heute) &&
    trifftSuche(projekt, filter.suche)
  );
}

export function wendeFilterAn(
  projekte: Projekt[],
  filter: ProjektFilter,
  kontext: FilterKontext = {}
): Projekt[] {
  if (!istFilterAktiv(filter)) return projekte;
  return projekte.filter((p) => trifftFilter(p, filter, kontext));
}

/**
 * Wie viele Projekte träfe dieser eine Wert ZUSÄTZLICH zur aktuellen Auswahl?
 *
 * Bewusst gegen den Filter OHNE die eigene Gruppe gerechnet: Innerhalb einer
 * Gruppe gilt ODER, ein weiterer Wert kann die Menge also nur vergrössern. Würde
 * man gegen den vollen Filter zählen, zeigte „0/3" eine 0, sobald „0/2" gewählt
 * ist — und der Nutzer schlösse daraus, es gäbe keine 0/3-Aufträge.
 */
export function zaehleFuerWert<G extends keyof Omit<ProjektFilter, 'suche'>>(
  projekte: Projekt[],
  filter: ProjektFilter,
  gruppe: G,
  wert: ProjektFilter[G][number],
  kontext: FilterKontext = {}
): number {
  const ohneEigeneGruppe: ProjektFilter = { ...filter, [gruppe]: [] };
  const probe: ProjektFilter = { ...ohneEigeneGruppe, [gruppe]: [wert] };
  return projekte.filter((p) => trifftFilter(p, probe, kontext)).length;
}

// ============================================================
// URL-Serialisierung
// ============================================================

const GRUPPEN: (keyof Omit<ProjektFilter, 'suche'>)[] = [
  'kanal',
  'produkt',
  'koernung',
  'form',
  'transport',
  'termin',
];

/**
 * Filter als URL-Parameter. Damit überlebt eine Einstellung den Reload, lässt
 * sich als Lesezeichen ablegen und an einen Kollegen schicken — „schau dir die
 * Speditionsaufträge dieser Woche an" wird ein Link statt einer Anleitung.
 */
export function filterZuUrlParams(filter: ProjektFilter, ziel?: URLSearchParams): URLSearchParams {
  const params = ziel ?? new URLSearchParams();
  for (const g of GRUPPEN) {
    const werte = filter[g];
    if (werte.length > 0) params.set(`f_${g}`, werte.join(','));
    else params.delete(`f_${g}`);
  }
  if (filter.suche.trim()) params.set('f_suche', filter.suche.trim());
  else params.delete('f_suche');
  return params;
}

export function filterAusUrlParams(params: URLSearchParams): ProjektFilter {
  const lese = <T extends string>(gruppe: string, erlaubt: readonly T[]): T[] => {
    const roh = params.get(`f_${gruppe}`);
    if (!roh) return [];
    // Unbekannte Werte werden verworfen, nicht durchgereicht: Ein veraltetes
    // Lesezeichen soll ein harmloses Ergebnis liefern, keine leere Tafel.
    return roh
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is T => (erlaubt as readonly string[]).includes(s));
  };

  return {
    kanal: lese('kanal', ['shop', 'platzbau', 'anfrage', 'direkt'] as const),
    produkt: lese('produkt', ['ziegelmehl', 'hydrocourt', 'universal'] as const),
    koernung: lese('koernung', ['02', '03'] as const),
    form: lese('form', ['lose', 'sackware', 'bigbag', 'beiladung'] as const),
    transport: lese('transport', ['eigener_lkw', 'spedition', 'abholung', 'kranwagen'] as const),
    termin: lese('termin', [
      'ueberfaellig',
      'diese_woche',
      'naechste_woche',
      'spaeter',
      'ohne',
    ] as const),
    suche: params.get('f_suche') ?? '',
  };
}

// ============================================================
// Beschriftungen
// ============================================================

export interface FilterGruppenDefinition {
  schluessel: keyof Omit<ProjektFilter, 'suche'>;
  titel: string;
  /** Erklärt, was die Gruppe unterscheidet — nicht was sie enthält. */
  hinweis?: string;
  werte: { wert: string; label: string; titel?: string }[];
}

export const FILTER_GRUPPEN: FilterGruppenDefinition[] = [
  {
    schluessel: 'kanal',
    titel: 'Herkunft',
    hinweis: 'Woher der Auftrag ins Haus kam',
    werte: [
      { wert: 'shop', label: 'Onlineshop', titel: 'Bestellung über tennismehl24.com' },
      { wert: 'platzbau', label: 'Platzbauer', titel: 'Über einen Platzbauer-Partner' },
      { wert: 'anfrage', label: 'Anfrage', titel: 'Aus einer E-Mail-Anfrage entstanden' },
      { wert: 'direkt', label: 'Direkt', titel: 'Von Hand angelegt' },
    ],
  },
  {
    schluessel: 'produkt',
    titel: 'Produkt',
    hinweis: 'Was der Auftrag enthält — mehrfach möglich',
    werte: [
      { wert: 'ziegelmehl', label: 'Ziegelmehl', titel: 'Eigenes Material' },
      { wert: 'hydrocourt', label: 'Hydrocourt', titel: 'Fremdbezug, wird beim Lieferanten bestellt' },
      { wert: 'universal', label: 'Universal', titel: 'Fremdbezug aus dem Universal-Katalog' },
    ],
  },
  {
    schluessel: 'koernung',
    titel: 'Körnung',
    werte: [
      { wert: '02', label: '0/2' },
      { wert: '03', label: '0/3' },
    ],
  },
  {
    schluessel: 'form',
    titel: 'Gebindeform',
    werte: [
      { wert: 'lose', label: 'Schüttgut', titel: 'Loses Material' },
      { wert: 'sackware', label: 'Sackware', titel: 'Säcke auf Paletten' },
      { wert: 'bigbag', label: 'BigBag' },
      { wert: 'beiladung', label: 'Beiladung', titel: 'Einzelne Säcke auf dem Schüttgut-LKW' },
    ],
  },
  {
    schluessel: 'transport',
    titel: 'Transport',
    hinweis: 'Wer fährt',
    werte: [
      { wert: 'eigener_lkw', label: 'Eigener LKW' },
      { wert: 'spedition', label: 'Spedition' },
      { wert: 'abholung', label: 'Abholung ab Werk' },
      { wert: 'kranwagen', label: 'Mit Ladekran', titel: 'Kran muss vor Ort bereitstehen' },
    ],
  },
  {
    schluessel: 'termin',
    titel: 'Liefertermin',
    werte: [
      { wert: 'ueberfaellig', label: 'Überfällig' },
      { wert: 'diese_woche', label: 'Diese Woche' },
      { wert: 'naechste_woche', label: 'Nächste Woche' },
      { wert: 'spaeter', label: 'Später' },
      { wert: 'ohne', label: 'Ohne Termin' },
    ],
  },
];
