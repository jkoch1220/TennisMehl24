// Tour-Typen für KI-gestützte Tourenplanung

import type { Belieferungsart, LieferdatumTyp } from './projekt';

// Tour-Status
export type TourStatus = 'entwurf' | 'geplant' | 'freigegeben' | 'in_durchfuehrung' | 'abgeschlossen';

// Optimierungs-Methode
export type OptimierungsMethode = 'manuell' | 'nearest_neighbor' | 'claude_ai';

// Führerscheinklassen
export type Fuehrerscheinklasse = 'B' | 'BE' | 'C' | 'CE' | 'C1' | 'C1E';

// Wochentag für Verfügbarkeit
export interface WochentagVerfuegbarkeit {
  montag: boolean;
  dienstag: boolean;
  mittwoch: boolean;
  donnerstag: boolean;
  freitag: boolean;
  samstag: boolean;
}

// Fahrer-Entity
export interface Fahrer {
  id: string;
  name: string;
  telefon?: string;
  email?: string;
  fuehrerscheinklassen: Fuehrerscheinklasse[];
  verfuegbarkeit: WochentagVerfuegbarkeit;
  bevorzugtesFahrzeugId?: string;
  maxArbeitszeitMinuten: number; // z.B. 540 (9h)
  pausenregelMinuten: number; // EU: 45min nach 4.5h
  notizen?: string;
  aktiv: boolean;
  erstelltAm: string;
  geaendertAm: string;
}

export type NeuerFahrer = Omit<Fahrer, 'id' | 'erstelltAm' | 'geaendertAm'>;

// Adresse für TourStop
export interface TourAdresse {
  strasse: string;
  plz: string;
  ort: string;
  koordinaten?: [number, number]; // [lon, lat]
}

// Kontakt für TourStop
export interface TourKontakt {
  name: string;
  telefon: string;
}

// Einzelner Stop in einer Tour
export interface TourStop {
  projektId: string;
  position: number; // 1-basiert

  // Geplante Zeiten
  ankunftGeplant: string; // ISO DateTime
  abfahrtGeplant: string; // ISO DateTime

  // Aus Projekt gezogen
  kundenname: string;
  kundennummer?: string;
  adresse: TourAdresse;
  kontakt?: TourKontakt;

  // Lieferdetails
  tonnen: number;
  paletten?: number;
  belieferungsart: Belieferungsart;
  zeitfenster?: {
    von: string; // "08:00"
    bis: string; // "16:00"
  };

  // Für den Fahrer
  anfahrtshinweise?: string;
  wichtigeHinweise?: string[];

  // Distanz/Zeit zum vorherigen Stop (vom Service berechnet)
  distanzVomVorherigenKm?: number;
  fahrzeitVomVorherigenMinuten?: number;
}

// Constraint/Einschränkung für die Tour
export interface TourConstraint {
  typ: 'zeitfenster' | 'kapazitaet' | 'belieferungsart' | 'deadline_kw' | 'arbeitszeit';
  beschreibung: string;
  erfuellt: boolean;
  projektId?: string; // Falls spezifisch für einen Stop
}

// Route-Details (berechnete Werte)
export interface TourRouteDetails {
  gesamtDistanzKm: number;
  gesamtFahrzeitMinuten: number;
  gesamtZeitMinuten: number; // inkl. Be-/Entladung, Pausen
  startZeit: string; // ISO DateTime
  endeZeit: string; // ISO DateTime
  geschaetzteDieselkosten: number;
  geschaetzteVerschleisskosten: number;
  gesamtTonnen: number;
  auslastungProzent: number; // Kapazitätsauslastung
}

// Optimierungs-Metadaten
export interface TourOptimierung {
  methode: OptimierungsMethode;
  optimiertAm: string; // ISO DateTime
  claudeRequestId?: string; // Für Debugging
  begruendung?: string; // Claude's Begründung
  einschraenkungen: TourConstraint[];
}

// Haupt-Tour Interface
export interface Tour {
  id: string;
  datum: string; // ISO Date (YYYY-MM-DD) - kann auch leer sein für "später festlegen"
  name: string; // z.B. "Tour 1 - MSP-ZM 123"
  fahrzeugId: string;
  fahrerId?: string;

  // Fahrer und Fahrzeug-Info (direkt auf der Tour für einfache Anzeige)
  fahrerName?: string; // Name des Fahrers
  kennzeichen?: string; // Kennzeichen des LKW (z.B. "MSP-ZM 123")

  // LKW-Typ und Kapazitäten (neu für manuelle Touren)
  lkwTyp: TourFahrzeugTyp; // 'motorwagen' | 'mit_haenger'
  kapazitaet: TourKapazitaet; // Variable Kapazitäten

  // Stops in optimierter Reihenfolge
  stops: TourStop[];

  // Berechnete Werte
  routeDetails: TourRouteDetails;

  // Optimierungs-Metadaten
  optimierung: TourOptimierung;

  // Encoded Polyline für Kartenanzeige (von Google Routes)
  encodedPolyline?: string;

  // Status
  status: TourStatus;

  // Timestamps
  erstelltAm: string;
  geaendertAm: string;
  erstelltVon?: string;
}

export type NeueTour = Omit<Tour, 'id' | 'erstelltAm' | 'geaendertAm'>;

// === Claude API Types ===

// Projekt-Daten für Claude-Optimierung (vereinfacht)
export interface ProjektFuerOptimierung {
  id: string;
  kundenname: string;
  kundennummer?: string;
  adresse: TourAdresse;
  tonnen: number;
  paletten?: number;
  belieferungsart: Belieferungsart;
  zeitfenster?: { von: string; bis: string };
  lieferKW?: number;
  lieferKWJahr?: number;
  lieferdatumTyp?: LieferdatumTyp;
  wichtigeHinweise?: string[];
  anfahrtshinweise?: string;
  kontakt?: TourKontakt;
}

// Fahrzeug-Daten für Claude-Optimierung (vereinfacht)
export interface FahrzeugFuerOptimierung {
  id: string;
  kennzeichen: string;
  kapazitaetTonnen: number;
  typ: string;
  fahrerId?: string;
  fahrerName?: string;
}

// Request an Claude für Tourenoptimierung
export interface ClaudeOptimierungRequest {
  projekte: ProjektFuerOptimierung[];
  fahrzeuge: FahrzeugFuerOptimierung[];
  startAdresse: TourAdresse;
  startZeit: string; // ISO DateTime
  einschraenkungen: {
    maxArbeitszeitMinuten: number;
    pausenregelMinuten: number;
    respektiereZeitfenster: boolean;
    respektiereKWDeadlines: boolean;
    aktuelleKW: number;
  };
}

// Fahrzeug-Typ für Touren
export type TourFahrzeugTyp = 'motorwagen' | 'mit_haenger';

// Standard-Kapazitäten (können pro Tour überschrieben werden)
export const STANDARD_KAPAZITAETEN = {
  motorwagen: 14, // Tonnen (Standard)
  haenger: 10, // Tonnen (Standard)
};

// Kapazitäten für Touren (Gesamt)
export const FAHRZEUG_KAPAZITAETEN = {
  motorwagen: 14, // Tonnen (nur Motorwagen)
  mit_haenger: 24, // Tonnen (14 + 10)
};

// Tour-Kapazitäts-Konfiguration (variabel pro Tour)
export interface TourKapazitaet {
  motorwagenTonnen: number; // z.B. 14t
  haengerTonnen?: number; // z.B. 10t (nur bei mit_haenger)
  gesamtTonnen: number; // Berechnet: motorwagen + hänger
}

// Einzelne Tour-Empfehlung von Claude
export interface ClaudeTourEmpfehlung {
  fahrzeugTyp: TourFahrzeugTyp;
  fahrzeugId?: string; // Wird später zugewiesen
  stopReihenfolge: string[]; // Projekt-IDs in optimierter Reihenfolge
  begruendung: string;
  geschaetzteTonnen: number;
  kapazitaetMaximal: number; // 18 oder 28
  geschaetzteDistanzKm?: number;
}

// Response von Claude
export interface ClaudeOptimierungResponse {
  touren: ClaudeTourEmpfehlung[];
  warnungen: string[];
  nichtFuerHeute: string[]; // Projekt-IDs die heute nicht gefahren werden
  empfehlung?: string;
}

// === Filter und UI Types ===

export interface TourenFilter {
  datum?: string;
  status?: TourStatus[];
  fahrzeugId?: string;
  fahrerId?: string;
}

// Statistiken für UI
export interface TourenStatistik {
  anzahlTouren: number;
  anzahlStops: number;
  gesamtTonnen: number;
  gesamtDistanzKm: number;
  durchschnittlicheAuslastung: number;
  offeneWarnungen: number;
}
