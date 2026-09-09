import type { ProduktionsBereich, ProduktionsBuchung } from '../../types/produktion';

/**
 * Gestalterische Konstanten der Produktionserfassung.
 * ============================================================================
 *
 * Leitbild: das Tool ist kein Formular, sondern ein Wägeterminal. In allen drei
 * Bereichen steht EINE maßgebliche Zahl an derselben Stelle, in derselben
 * Größe, mit fester Einheit — und ein farbiger Materialstreifen sagt aus zwei
 * Metern Entfernung, in welchen Bestand gerade gebucht wird.
 *
 * WICHTIG zu den Klassennamen: sie stehen hier VOLLSTÄNDIG in einem Record und
 * werden nie zusammengesetzt (`bg-${farbe}-600`). Tailwind liest den Quelltext
 * statisch; interpolierte Klassen landen nicht im Stylesheet und die Fläche
 * bleibt im Betrieb einfach farblos.
 */

export interface StationsStil {
  /** Materialstreifen an der linken Kante der Wertanzeige. */
  streifen: string;
  /** Buchen-Taste im Normalzustand. */
  taste: string;
  /** Aktives Segment der Stationsleiste. */
  segment: string;
  /** Akzenttext und Melderpunkte. */
  text: string;
  /** Aktive Kontextkachel (Körnung, Gebinde, Lieferant). */
  kachelAn: string;
  /** Gradient für das Mengenrad (dessen Prop `farbe`). */
  rad: string;
  /** Flächenfarbe für Diagramme (recharts braucht einen echten Farbwert). */
  hex: string;
}

export const STATION: Record<ProduktionsBereich, StationsStil> = {
  rohmaterial: {
    streifen: 'bg-stone-600 dark:bg-stone-400',
    taste:
      'bg-stone-700 hover:bg-stone-800 active:bg-stone-900 dark:bg-stone-600 dark:hover:bg-stone-500',
    segment: 'bg-stone-700 text-white shadow-sm',
    text: 'text-stone-700 dark:text-stone-300',
    kachelAn:
      'border-stone-600 bg-stone-100 text-stone-900 ring-4 ring-stone-500/25 ' +
      'dark:border-stone-400 dark:bg-stone-500/20 dark:text-stone-50 dark:ring-stone-400/25',
    rad: 'from-stone-500 to-stone-700',
    hex: '#57534e',
  },
  mahlen: {
    streifen: 'bg-orange-600 dark:bg-orange-500',
    taste:
      'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 dark:bg-orange-600 dark:hover:bg-orange-500',
    segment: 'bg-orange-600 text-white shadow-sm',
    text: 'text-orange-700 dark:text-orange-300',
    kachelAn:
      'border-orange-500 bg-orange-50 text-orange-900 ring-4 ring-orange-500/25 ' +
      'dark:border-orange-400 dark:bg-orange-500/15 dark:text-orange-50 dark:ring-orange-400/25',
    rad: 'from-orange-500 to-amber-600',
    hex: '#ea580c',
  },
  abfuellung: {
    streifen: 'bg-sky-600 dark:bg-sky-500',
    taste: 'bg-sky-600 hover:bg-sky-700 active:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500',
    segment: 'bg-sky-600 text-white shadow-sm',
    text: 'text-sky-700 dark:text-sky-300',
    kachelAn:
      'border-sky-500 bg-sky-50 text-sky-900 ring-4 ring-sky-500/25 ' +
      'dark:border-sky-400 dark:bg-sky-500/15 dark:text-sky-50 dark:ring-sky-400/25',
    rad: 'from-sky-500 to-indigo-600',
    hex: '#0284c7',
  },
};

export const MELDER = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  alarm: 'bg-red-600',
  aus: 'bg-gray-300 dark:bg-slate-600',
} as const;

/**
 * 135°-Warnschraffur. Rot und Ziegelorange sind bei Sonne, Staub und
 * Rotschwäche nicht sicher zu unterscheiden — in einer Produktionsmannschaft
 * ist statistisch immer jemand rotschwach. Die Schraffur ist die industrielle
 * Konvention dafür: Alarm trägt nie die Farbe allein.
 */
export const SCHRAFFUR =
  'bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(0,0,0,.18)_6px_12px)]';

// ---------------------------------------------------------------------------
// Typografie — wiederkehrende Klassenketten
// ---------------------------------------------------------------------------

/** Die eine große Zahl. Gesperrte Ziffernbreite, damit sie beim Zählen nicht wandert. */
export const ZAHL_GROSS =
  'text-[clamp(44px,14vw,84px)] font-bold leading-[0.9] tracking-tight tabular-nums';

/** Einheit neben der Zahl — feste Größe, skaliert bewusst NICHT mit. */
export const EINHEIT = 'text-2xl font-semibold text-gray-400 dark:text-slate-500';

/** Siebdruck-Beschriftung wie an einem Maschinenpanel. */
export const PANEL_LABEL =
  'text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600 dark:text-slate-400';

export const ABSCHNITT_LABEL =
  'text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400';

export const TASTEN_TEXT = 'text-[19px] font-bold uppercase tracking-[0.10em]';

/**
 * Durchgängiger Fokusring. Ohne `focus-visible` wäre er nach jedem Tippen zu
 * sehen; ohne Offset verschwindet er auf farbigen Flächen.
 */
export const FOKUS =
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500 ' +
  'focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950';

// ---------------------------------------------------------------------------
// Merkwerte
// ---------------------------------------------------------------------------

const MERKWERTE_SPEICHER = 'produktion_merkwerte_v1';

const STANDARD_MERKWERTE: Record<ProduktionsBereich, number[]> = {
  // Rohmaterial bekommt bewusst KEINE Vorschläge: dort steht eine gewogene
  // Zahl auf dem Wiegeschein. Vier angebotene Tonnagen verführen dazu, 26
  // statt 24,32 zu buchen — und das ist die einzige exakt gemessene Zahl der
  // ganzen Kette.
  rohmaterial: [],
  mahlen: [10, 20, 25, 40],
  abfuellung: [],
};

/**
 * Die vier häufigsten eigenen Mengen der letzten 30 Buchungen eines Bereichs.
 *
 * Bewusst aus den EIGENEN Buchungen: betriebsweit gemittelte Werte wären eine
 * Auswertung und dürfen einem Mitarbeiter ohne `auswertung`-Recht nicht
 * erscheinen — auch nicht getarnt als Schnelltaste.
 */
export const merkwerte = (
  bereich: ProduktionsBereich,
  eigeneBuchungen: ProduktionsBuchung[]
): number[] => {
  if (bereich === 'rohmaterial') return [];

  const haeufigkeit = new Map<number, number>();
  for (const b of eigeneBuchungen.filter((b) => b.bereich === bereich).slice(0, 30)) {
    const wert = bereich === 'abfuellung' ? b.gebindeAnzahl ?? 0 : b.tonnen;
    if (wert > 0) haeufigkeit.set(wert, (haeufigkeit.get(wert) ?? 0) + 1);
  }

  const gelernt = [...haeufigkeit.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 4)
    .map(([wert]) => wert)
    .sort((a, b) => a - b);

  if (gelernt.length >= 3) return gelernt;
  return STANDARD_MERKWERTE[bereich];
};

/** Merkwerte überleben den Neustart, damit die erste Buchung am Morgen sitzt. */
export const speichereMerkwert = (bereich: ProduktionsBereich, wert: number): void => {
  try {
    const roh = localStorage.getItem(MERKWERTE_SPEICHER);
    const daten = roh ? (JSON.parse(roh) as Record<string, number[]>) : {};
    const liste = [wert, ...(daten[bereich] ?? []).filter((w) => w !== wert)].slice(0, 30);
    localStorage.setItem(MERKWERTE_SPEICHER, JSON.stringify({ ...daten, [bereich]: liste }));
  } catch {
    /* privater Modus: Merkwerte gelten dann nur für diese Sitzung */
  }
};

export const geladeneMerkwerte = (bereich: ProduktionsBereich): number[] => {
  try {
    const roh = localStorage.getItem(MERKWERTE_SPEICHER);
    if (!roh) return STANDARD_MERKWERTE[bereich];
    const daten = JSON.parse(roh) as Record<string, number[]>;
    const liste = daten[bereich] ?? [];
    if (liste.length < 3) return STANDARD_MERKWERTE[bereich];

    const haeufigkeit = new Map<number, number>();
    for (const wert of liste) haeufigkeit.set(wert, (haeufigkeit.get(wert) ?? 0) + 1);
    return [...haeufigkeit.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 4)
      .map(([wert]) => wert)
      .sort((a, b) => a - b);
  } catch {
    return STANDARD_MERKWERTE[bereich];
  }
};

// ---------------------------------------------------------------------------
// Klebe-Vorwahl
// ---------------------------------------------------------------------------

const VORWAHL_SPEICHER = 'produktion_vorwahl_v1';

export interface Vorwahl {
  bereich?: ProduktionsBereich;
  mahlen?: { koernung?: string };
  abfuellung?: { gebinde?: string; koernung?: string };
  rohmaterial?: { lieferant?: string; tag?: string };
}

/**
 * Was über eine Buchung hinweg stehenbleibt: Station, Körnung, Gebinde,
 * Lieferant. Was NIE stehenbleibt: die MENGE. Eine vorbelegte Menge ist die
 * klassische Doppelbuchung — stattdessen erscheint der zuletzt gebuchte Wert
 * als zusätzliche Schnelltaste, die ein bewusster Tipp bleibt.
 */
export const ladeVorwahl = (): Vorwahl => {
  try {
    const roh = localStorage.getItem(VORWAHL_SPEICHER);
    return roh ? (JSON.parse(roh) as Vorwahl) : {};
  } catch {
    return {};
  }
};

export const speichereVorwahl = (vorwahl: Vorwahl): void => {
  try {
    localStorage.setItem(VORWAHL_SPEICHER, JSON.stringify(vorwahl));
  } catch {
    /* siehe oben */
  }
};

// ---------------------------------------------------------------------------
// Sonnenmodus
// ---------------------------------------------------------------------------

const SONNE_SPEICHER = 'produktion_sonne';

export const ladeSonnenmodus = (): boolean => {
  try {
    return localStorage.getItem(SONNE_SPEICHER) === 'an';
  } catch {
    return false;
  }
};

export const speichereSonnenmodus = (an: boolean): void => {
  try {
    localStorage.setItem(SONNE_SPEICHER, an ? 'an' : 'aus');
  } catch {
    /* siehe oben */
  }
};
