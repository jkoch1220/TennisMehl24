// Fahrtkosten Types - Mileage Expense Tracking

export interface DefaultStrecke {
  id: string;
  name: string;
  startort: string;
  startAdresse: string;
  zielort: string;
  zielAdresse: string;
  kilometer: number;
  istFavorit: boolean; // Quick-Access auf Hauptseite
  sortierung: number;
}

export interface Fahrt {
  id: string;
  datum: string; // ISO date
  fahrer: string;
  fahrerName: string;

  // Strecke
  startort: string;
  startAdresse: string;
  zielort: string;
  zielAdresse: string;
  kilometer: number;

  // Berechnung
  kilometerPauschale: number; // €/km (default 0.30)
  betrag: number; // kilometer * pauschale

  // Optional
  hinpirsUndZurueck: boolean; // Hin- und Rückfahrt
  zweck?: string;
  notizen?: string;

  // Meta
  defaultStreckeId?: string; // Referenz zur verwendeten Default-Strecke
  erstelltAm: string;
  geaendertAm: string;
}

export interface NeueFahrt {
  datum: string;
  fahrer: string;
  fahrerName: string;
  startort: string;
  startAdresse: string;
  zielort: string;
  zielAdresse: string;
  kilometer: number;
  kilometerPauschale?: number;
  hinpirsUndZurueck?: boolean;
  zweck?: string;
  notizen?: string;
  defaultStreckeId?: string;
}

export interface FahrkostenFilter {
  fahrer?: string;
  monat?: string; // YYYY-MM
  nurMeine?: boolean;
}

export interface MonatsZusammenfassung {
  monat: string; // YYYY-MM
  anzahlFahrten: number;
  gesamtKilometer: number;
  gesamtBetrag: number;
  fahrten: Fahrt[];
}

// Default-Werte
export const DEFAULT_KILOMETER_PAUSCHALE = 0.30; // €/km

// Vordefinierte Strecken für TennisMehl
export const STANDARD_STRECKEN: Omit<DefaultStrecke, 'id'>[] = [
  {
    name: 'Giebelstadt → Produktion',
    startort: 'Giebelstadt',
    startAdresse: 'Giebelstadt',
    zielort: 'Produktion Marktheidenfeld',
    zielAdresse: 'Wertheimer Straße 30, 97828 Marktheidenfeld',
    kilometer: 45,
    istFavorit: true,
    sortierung: 1,
  },
  {
    name: 'Giebelstadt ↔ Produktion (Hin+Rück)',
    startort: 'Giebelstadt',
    startAdresse: 'Giebelstadt',
    zielort: 'Produktion Marktheidenfeld',
    zielAdresse: 'Wertheimer Straße 30, 97828 Marktheidenfeld',
    kilometer: 90,
    istFavorit: true,
    sortierung: 0,
  },
];
