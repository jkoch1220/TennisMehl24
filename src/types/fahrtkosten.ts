// Fahrtkosten Types - Mileage Expense Tracking

// ==================== STAMMDATEN ====================

/** Person, die Fahrten erfasst (Luca, Julian, Ronald, ...) */
export interface Person {
  id: string;
  name: string;
  aktiv: boolean;
  sortierung: number;
}

/** Fahrzeug mit eigener km-Pauschale (pro Person) */
export interface Auto {
  id: string;
  personId: string;
  name: string;
  kmPauschale: number; // €/km
  aktiv: boolean;
  sortierung: number;
}

/** Firma, der eine Fahrt zugeordnet wird (pro Person; Basis für den Report) */
export interface Firma {
  id: string;
  personId: string;
  name: string;
  aktiv: boolean;
  sortierung: number;
}

// ==================== VORLAGEN ====================

export interface DefaultStrecke {
  id: string;
  personId: string; // Vorlagen/Quick-Adds gehören zu einer Person
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
  kilometer: number; // gefahrene Gesamt-km

  // Kilometerstand (optional, für manuelle Fahrten mit mehreren Zielen)
  startKm?: number;
  endKm?: number;

  // Berechnung
  kilometerPauschale: number; // €/km (vom Auto)
  betrag: number; // kilometer * pauschale

  // Optional
  hinpirsUndZurueck: boolean; // veraltet – km gelten jetzt immer als Gesamtstrecke
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
  startKm?: number;
  endKm?: number;
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
