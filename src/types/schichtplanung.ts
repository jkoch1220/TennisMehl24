// Schichtplanung Types - 10X Shift Planning Tool

// Schicht-Typen
export type SchichtTyp = 'fruehschicht' | 'spaetschicht' | 'nachtschicht';

export type SchichtStatus = 'geplant' | 'bestaetigt' | 'krank' | 'urlaub' | 'getauscht';

// Mitarbeiter-Farben (12 distinkte Farben für visuelle Unterscheidung)
export const MITARBEITER_FARBEN: string[] = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#22c55e', // green-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#84cc16', // lime-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#a855f7', // purple-500
];

// Mitarbeiter
export interface Mitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
  email?: string;
  telefon?: string;
  farbe: string;
  position?: string;
  qualifikationen?: string[];
  maxStundenProWoche: number;
  istAktiv: boolean;
  notizen?: string;
  erstelltAm: string;
  geaendertAm: string;
}

export type NeuerMitarbeiter = Omit<Mitarbeiter, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

// Schicht-Zuweisung
export interface SchichtZuweisung {
  id: string;
  mitarbeiterId: string;
  schichtTyp: SchichtTyp;
  datum: string; // ISO date string (YYYY-MM-DD)
  status: SchichtStatus;
  notizen?: string;
  erstelltAm: string;
  erstelltVon?: string;
  geaendertAm: string;
}

export type NeueSchichtZuweisung = Omit<SchichtZuweisung, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

// Schicht-Definition (konfigurierbar)
export interface SchichtDefinition {
  typ: SchichtTyp;
  name: string;
  kurzname: string;
  startZeit: string; // HH:MM format
  endZeit: string; // HH:MM format
  dauer: number; // Stunden
  farbe: string; // Tailwind gradient class
  farbeHex: string; // Hex color for charts
  iconName: string; // Lucide icon name
  minBesetzung: number;
}

// Schicht-Einstellungen (in Stammdaten gespeichert)
export interface SchichtEinstellungen {
  fruehschicht: {
    startZeit: string;
    endZeit: string;
    minBesetzung: number;
  };
  spaetschicht: {
    startZeit: string;
    endZeit: string;
    minBesetzung: number;
  };
  nachtschicht: {
    startZeit: string;
    endZeit: string;
    minBesetzung: number;
  };
}

// Standard-Schicht-Konfiguration
export const DEFAULT_SCHICHT_EINSTELLUNGEN: SchichtEinstellungen = {
  fruehschicht: {
    startZeit: '06:00',
    endZeit: '14:00',
    minBesetzung: 1,
  },
  spaetschicht: {
    startZeit: '14:00',
    endZeit: '22:00',
    minBesetzung: 1,
  },
  nachtschicht: {
    startZeit: '22:00',
    endZeit: '06:00',
    minBesetzung: 1,
  },
};

// Schicht-Konfiguration Factory (mit Einstellungen)
export function getSchichtConfig(einstellungen: SchichtEinstellungen = DEFAULT_SCHICHT_EINSTELLUNGEN): Record<SchichtTyp, SchichtDefinition> {
  return {
    fruehschicht: {
      typ: 'fruehschicht',
      name: 'Frühschicht',
      kurzname: 'F',
      startZeit: einstellungen.fruehschicht.startZeit,
      endZeit: einstellungen.fruehschicht.endZeit,
      dauer: 8,
      farbe: 'from-amber-400 to-orange-500',
      farbeHex: '#f59e0b',
      iconName: 'Sunrise',
      minBesetzung: einstellungen.fruehschicht.minBesetzung,
    },
    spaetschicht: {
      typ: 'spaetschicht',
      name: 'Spätschicht',
      kurzname: 'S',
      startZeit: einstellungen.spaetschicht.startZeit,
      endZeit: einstellungen.spaetschicht.endZeit,
      dauer: 8,
      farbe: 'from-blue-400 to-indigo-500',
      farbeHex: '#3b82f6',
      iconName: 'Sun',
      minBesetzung: einstellungen.spaetschicht.minBesetzung,
    },
    nachtschicht: {
      typ: 'nachtschicht',
      name: 'Nachtschicht',
      kurzname: 'N',
      startZeit: einstellungen.nachtschicht.startZeit,
      endZeit: einstellungen.nachtschicht.endZeit,
      dauer: 8,
      farbe: 'from-purple-500 to-indigo-700',
      farbeHex: '#8b5cf6',
      iconName: 'Moon',
      minBesetzung: einstellungen.nachtschicht.minBesetzung,
    },
  };
}

// Status-Konfiguration
export const STATUS_CONFIG: Record<SchichtStatus, { label: string; farbe: string; darkFarbe: string; icon: string }> = {
  geplant: {
    label: 'Geplant',
    farbe: 'bg-gray-100 text-gray-700 border-gray-300',
    darkFarbe: 'dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
    icon: 'Clock',
  },
  bestaetigt: {
    label: 'Bestätigt',
    farbe: 'bg-green-100 text-green-700 border-green-300',
    darkFarbe: 'dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
    icon: 'CheckCircle',
  },
  krank: {
    label: 'Krank',
    farbe: 'bg-red-100 text-red-700 border-red-300',
    darkFarbe: 'dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
    icon: 'Thermometer',
  },
  urlaub: {
    label: 'Urlaub',
    farbe: 'bg-blue-100 text-blue-700 border-blue-300',
    darkFarbe: 'dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
    icon: 'Palmtree',
  },
  getauscht: {
    label: 'Getauscht',
    farbe: 'bg-purple-100 text-purple-700 border-purple-300',
    darkFarbe: 'dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
    icon: 'ArrowLeftRight',
  },
};

// Wochen-Statistiken
export interface WochenStatistik {
  gesamtStunden: number;
  stundenProMitarbeiter: Record<string, number>;
  schichtenProMitarbeiter: Record<string, number>;
  unterbesetzteSchichten: Array<{ datum: string; schichtTyp: SchichtTyp; aktuell: number; minimum: number }>;
  fairnessScore: number; // 0-100
}

// Konflikt-Typen
export type KonfliktTyp = 'doppelbelegung' | 'ueberstunden' | 'ruhezeit' | 'unterbesetzung';

export interface Konflikt {
  typ: KonfliktTyp;
  schwere: 'warnung' | 'fehler';
  nachricht: string;
  mitarbeiterId?: string;
  datum?: string;
  schichtTyp?: SchichtTyp;
}

// Drag & Drop Typen
export interface DragData {
  typ: 'mitarbeiter' | 'zuweisung';
  mitarbeiter?: Mitarbeiter;
  zuweisung?: SchichtZuweisung;
}

export interface DropData {
  datum: string;
  schichtTyp: SchichtTyp;
}

// Wochentage
export const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const WOCHENTAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;

// Helper: Datum zu Wochentag-Index (0 = Montag)
export function getWochentagIndex(datum: string): number {
  const date = new Date(datum);
  const day = date.getDay();
  return day === 0 ? 6 : day - 1; // Sonntag (0) -> 6, Montag (1) -> 0
}

// Helper: Montag der Woche berechnen
export function getMontag(datum: Date): Date {
  const d = new Date(datum);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Helper: Alle Tage einer Woche
export function getWochentage(montag: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(montag);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Helper: Datum formatieren (YYYY-MM-DD)
export function formatDatum(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper: Datum formatieren für Anzeige (DD.MM.)
export function formatDatumKurz(date: Date): string {
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.`;
}

// Helper: Stunden berechnen
export function berechneStunden(startZeit: string, endZeit: string): number {
  const [startH, startM] = startZeit.split(':').map(Number);
  const [endH, endM] = endZeit.split(':').map(Number);

  let start = startH * 60 + startM;
  let end = endH * 60 + endM;

  // Nachtschicht: Ende am nächsten Tag
  if (end <= start) {
    end += 24 * 60;
  }

  return (end - start) / 60;
}

// Helper: Fairness-Score berechnen (0-100)
export function berechneFairnessScore(stundenProMitarbeiter: Record<string, number>): number {
  const stunden = Object.values(stundenProMitarbeiter);
  if (stunden.length <= 1) return 100;

  const durchschnitt = stunden.reduce((a, b) => a + b, 0) / stunden.length;
  if (durchschnitt === 0) return 100;

  const abweichungen = stunden.map(s => Math.abs(s - durchschnitt));
  const durchschnittlicheAbweichung = abweichungen.reduce((a, b) => a + b, 0) / abweichungen.length;

  // Score: 100 bei perfekter Verteilung, niedriger bei großen Abweichungen
  const maxAbweichung = durchschnitt; // Maximum wäre wenn jemand 0 und jemand 2x Durchschnitt hätte
  const normalisiertAbweichung = Math.min(durchschnittlicheAbweichung / maxAbweichung, 1);

  return Math.round((1 - normalisiertAbweichung) * 100);
}
