import {
  BarChart3,
  CalendarDays,
  Calculator,
  Download,
  Droplets,
  LayoutGrid,
  List,
  Mail,
  Map as MapIcon,
  Package,
  Receipt,
  Scale,
  ShoppingCart,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/**
 * ============================================================================
 * ANSICHTEN-NAVIGATION DER PROJEKT-VERWALTUNG
 * ============================================================================
 *
 * Die Kopfzeile trug fünfzehn gleich laute Reiter nebeneinander. Auf einem
 * 13-Zoll-Bildschirm brach sie in eine zweite Zeile um und schob den Inhalt
 * nach unten; vor allem aber stand „Karte" optisch genauso wichtig da wie
 * „Kanban", obwohl das eine täglich und das andere monatlich benutzt wird.
 *
 * Deshalb zwei Ebenen:
 *
 *   PRIMÄR   Übersicht, Anfragen, Kanban, Wochen — die Ansichten des
 *            Tagesgeschäfts. Bleiben als Reiter sichtbar, ein Klick entfernt.
 *   MENÜ     Alles Übrige hinter einem Raster-Button (Google-App-Launcher).
 *            Öffnet beim Überfahren, nicht erst beim Klick.
 *
 * Die Liste ANSICHTEN ist die einzige Wahrheitsquelle: Reiter, Menü-Raster und
 * die erlaubten `?view=`-Werte werden alle daraus abgeleitet. Wer eine Ansicht
 * ergänzt, trägt sie hier ein — und nur hier.
 */

export type ViewMode =
  | 'overview'
  | 'anfragen'
  | 'kanban'
  | 'wochen'
  | 'angebotsliste'
  | 'statistik'
  | 'karte'
  | 'shop'
  | 'hydrocourt'
  | 'universal'
  | 'wiegescheine'
  | 'fakturierung'
  | 'exports'
  | 'massenangebot';

/** Recht, das eine Ansicht voraussetzt. `undefined` = für alle sichtbar. */
type Recht = 'admin' | 'shop';

export interface AnsichtDefinition {
  id: ViewMode;
  label: string;
  icon: LucideIcon;
  /** Hintergrund des aktiven Reiters bzw. der aktiven Menü-Kachel. */
  aktivKlasse: string;
  /** Farbe des Symbols im Menü-Raster, solange die Ansicht nicht aktiv ist. */
  symbolKlasse: string;
  /** Erklärt im Menü, wofür die Ansicht da ist. Kurz, ohne Punkt. */
  beschreibung: string;
  /** Reiter in der Kopfzeile statt Eintrag im Menü. */
  primaer?: boolean;
  benoetigt?: Recht;
}

export const ANSICHTEN: readonly AnsichtDefinition[] = [
  {
    id: 'overview',
    label: 'Übersicht',
    icon: Workflow,
    aktivKlasse: 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900',
    symbolKlasse: 'text-slate-600 dark:text-slate-300',
    beschreibung: 'Der Weg von der Anfrage bis zur Rechnung',
    primaer: true,
  },
  {
    id: 'anfragen',
    label: 'Anfragen',
    icon: Mail,
    aktivKlasse: 'bg-amber-500 text-white',
    symbolKlasse: 'text-amber-600 dark:text-amber-400',
    beschreibung: 'Eingang aus Formular und Postfach',
    primaer: true,
  },
  {
    id: 'kanban',
    label: 'Kanban',
    icon: LayoutGrid,
    aktivKlasse: 'bg-purple-600 text-white',
    symbolKlasse: 'text-purple-600 dark:text-purple-400',
    beschreibung: 'Alle Projekte nach Status',
    primaer: true,
  },
  {
    id: 'wochen',
    label: 'Wochen',
    icon: CalendarDays,
    aktivKlasse: 'bg-sky-600 text-white',
    symbolKlasse: 'text-sky-600 dark:text-sky-400',
    beschreibung: 'Nach Lieferwoche — die Frage der Hochsaison',
    primaer: true,
  },
  {
    id: 'angebotsliste',
    label: 'Angebote',
    icon: List,
    aktivKlasse: 'bg-purple-600 text-white',
    symbolKlasse: 'text-purple-600 dark:text-purple-400',
    beschreibung: 'Offene Angebote als Liste',
  },
  {
    id: 'fakturierung',
    label: 'Fakturierung',
    icon: Receipt,
    aktivKlasse: 'bg-emerald-600 text-white',
    symbolKlasse: 'text-emerald-600 dark:text-emerald-400',
    beschreibung: 'Rechnungen einer Lieferwoche auf einmal',
  },
  {
    id: 'wiegescheine',
    label: 'Wiegescheine',
    icon: Scale,
    aktivKlasse: 'bg-amber-600 text-white',
    symbolKlasse: 'text-amber-600 dark:text-amber-400',
    beschreibung: 'Liefergewichte prüfen und bestätigen',
  },
  {
    id: 'shop',
    label: 'Shop',
    icon: ShoppingCart,
    aktivKlasse: 'bg-orange-600 text-white',
    symbolKlasse: 'text-orange-600 dark:text-orange-400',
    beschreibung: 'Bestellungen aus dem Onlineshop',
    benoetigt: 'shop',
  },
  {
    id: 'hydrocourt',
    label: 'Hydrocourt',
    icon: Droplets,
    aktivKlasse: 'bg-cyan-500 text-white',
    symbolKlasse: 'text-cyan-600 dark:text-cyan-400',
    beschreibung: 'Teilprojekte Hydrocourt',
  },
  {
    id: 'universal',
    label: 'Universal',
    icon: Package,
    aktivKlasse: 'bg-amber-500 text-white',
    symbolKlasse: 'text-amber-600 dark:text-amber-400',
    beschreibung: 'Teilprojekte Universal',
  },
  {
    id: 'karte',
    label: 'Karte',
    icon: MapIcon,
    aktivKlasse: 'bg-purple-600 text-white',
    symbolKlasse: 'text-purple-600 dark:text-purple-400',
    beschreibung: 'Projekte geografisch',
  },
  {
    id: 'statistik',
    label: 'Statistik',
    icon: BarChart3,
    aktivKlasse: 'bg-purple-600 text-white',
    symbolKlasse: 'text-purple-600 dark:text-purple-400',
    beschreibung: 'Mengen, Umsatz, Verteilung',
  },
  {
    id: 'exports',
    label: 'Exports',
    icon: Download,
    aktivKlasse: 'bg-green-600 text-white',
    symbolKlasse: 'text-green-600 dark:text-green-400',
    beschreibung: 'Listen als Excel oder CSV',
  },
  {
    id: 'massenangebot',
    label: 'Massen-Angebote',
    icon: Calculator,
    aktivKlasse: 'bg-emerald-600 text-white',
    symbolKlasse: 'text-emerald-600 dark:text-emerald-400',
    beschreibung: 'Der Herbstlauf für die Frühjahrsinstandsetzung',
    benoetigt: 'admin',
  },
] as const;

export const VIEW_MODES = ANSICHTEN.map((a) => a.id) as readonly ViewMode[];

export const istViewMode = (wert: string | null): wert is ViewMode =>
  wert !== null && (VIEW_MODES as readonly string[]).includes(wert);
