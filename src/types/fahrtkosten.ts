// Fahrtkosten Types - Mileage Expense Tracking

// ==================== STAMMDATEN ====================

/** Person, die Fahrten erfasst (Luca, Julian, Ronald, ...) */
export interface Person {
  id: string;
  name: string;
  aktiv: boolean;
  sortierung: number;
}

/** Fahrzeug mit eigener km-Pauschale */
export interface Auto {
  id: string;
  name: string;
  kmPauschale: number; // €/km
  aktiv: boolean;
  sortierung: number;
}

/** Firma, der eine Fahrt zugeordnet wird (Basis für den Report) */
export interface Firma {
  id: string;
  name: string;
  aktiv: boolean;
  sortierung: number;
}

// ==================== VORLAGEN ====================

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

  // Standardwerte für Quick-Add (überschreibbar)
  standardAutoId?: string;
  standardHinUndZurueck?: boolean;
}

// ==================== FAHRTEN ====================

export interface Fahrt {
  id: string;
  datum: string; // ISO date (YYYY-MM-DD)

  // Person (im Appwrite-Dokument als fahrer/fahrerName gespeichert)
  personId: string;
  personName: string;

  // Auto / Pauschale
  autoId?: string;
  autoName?: string;

  // Firma (Pflicht)
  firmaId: string;
  firmaName: string;

  // Strecke
  startort: string;
  startAdresse: string;
  zielort: string;
  zielAdresse: string;
  kilometer: number;

  // Berechnung
  kilometerPauschale: number; // €/km (vom Auto)
  betrag: number; // kilometer * pauschale

  // Optional
  hinpirsUndZurueck: boolean; // Hin- und Rückfahrt (km werden verdoppelt)
  kommentar?: string; // im Appwrite-Dokument als notizen gespeichert

  // Meta
  defaultStreckeId?: string; // Referenz zur verwendeten Vorlage
  erstelltAm: string;
  geaendertAm: string;
}

export interface NeueFahrt {
  datum: string;
  personId: string;
  personName: string;
  autoId?: string;
  autoName?: string;
  firmaId: string;
  firmaName: string;
  startort: string;
  startAdresse: string;
  zielort: string;
  zielAdresse: string;
  kilometer: number;
  kilometerPauschale?: number;
  hinpirsUndZurueck?: boolean;
  kommentar?: string;
  defaultStreckeId?: string;
}

export interface FahrkostenFilter {
  personId?: string;
  firmaId?: string;
  von?: string; // YYYY-MM-DD
  bis?: string; // YYYY-MM-DD
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

// Personen, die beim ersten Setup angelegt werden
export const STANDARD_PERSONEN: Omit<Person, 'id'>[] = [
  { name: 'Luca', aktiv: true, sortierung: 0 },
  { name: 'Julian', aktiv: true, sortierung: 1 },
  { name: 'Ronald', aktiv: true, sortierung: 2 },
];

// Beispiel-Auto, das beim ersten Setup angelegt wird
export const STANDARD_AUTOS: Omit<Auto, 'id'>[] = [
  { name: 'PKW (0,30 €/km)', kmPauschale: 0.30, aktiv: true, sortierung: 0 },
];

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
    standardHinUndZurueck: false,
  },
  {
    name: 'Giebelstadt ↔ Produktion (Hin+Rück)',
    startort: 'Giebelstadt',
    startAdresse: 'Giebelstadt',
    zielort: 'Produktion Marktheidenfeld',
    zielAdresse: 'Wertheimer Straße 30, 97828 Marktheidenfeld',
    kilometer: 45,
    istFavorit: true,
    sortierung: 0,
    standardHinUndZurueck: true,
  },
];
