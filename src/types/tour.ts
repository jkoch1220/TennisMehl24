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
  /** Subunternehmer (z. B. Michelbau, Bäuschlein) — planbar wie eigene Fahrer. */
  istFremdfahrer?: boolean;
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

/**
 * Frei setzbare Statusfarbe eines Stopps — das Gegenstück zur Zellfüllung in der
 * Excel-Dispoplanung. Bewusst am Stop und nicht am Projekt: das stops-Feld der Tour
 * fasst 100.000 Zeichen, der data-Blob des Projekts nur 10.000 und ist bei einigen
 * Projekten bereits nahezu ausgeschöpft.
 */
export type StopMarkierung =
  | 'erledigt' // fertig geplant — das Babyblau, mit dem eine Woche abgeschlossen wird
  | 'abgestimmt' // mit dem Kunden abgestimmt / kommuniziert
  | 'zu_kommunizieren' // Tour geplant, Kunde noch nicht informiert
  | 'gedruckt' // gedruckt und geplant
  | 'vorgeladen' // Ware vorgeladen
  | 'auf_lkw' // auf dem LKW
  | 'ausgeliefert' // ausgeliefert, noch nicht abgerechnet
  | 'abgerechnet'
  | 'problem'
  | 'freie_kapazitaet';

// Einzelner Stop in einer Tour
export interface TourStop {
  projektId: string;
  position: number; // 1-basiert

  // Frei gesetzte Statusfarbe (Excel-Ersatz); nicht gesetzt = neutral
  markierung?: StopMarkierung;

  /**
   * Freie Notiz zur Zeile — das Gegenstück zur Notiz-Spalte der Excel-Dispoplanung.
   * Dort transportiert dieses Feld Zeitfenster, Kippstellen, Zufahrtsbeschränkungen
   * und Ansprechpartner in einem; das bleibt bewusst so.
   */
  notiz?: string;

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

/**
 * Farb- und Textzuordnung der Stopp-Markierungen.
 *
 * Die Hex-Werte stammen aus der abgelösten Excel-Dispoplanung; Theme-Farben wurden
 * über xl/theme/theme1.xml aufgelöst. Zwei Abweichungen gegenüber dem Original:
 *  - „abgerechnet" und „Vorgeladen" trugen dort denselben Fill (#D0DFE6). Da beide
 *    Zustände parallel vorkommen, hat „abgerechnet" hier einen dunkleren Ton.
 *  - „mit Kunden abgestimmt" trug in der einen Legende #DCEDD5, in der anderen war
 *    #92D050 als „Kunde komuniziert" geführt. Übernommen ist das kräftigere #92D050,
 *    weil es im Datenbestand mit Abstand am häufigsten verwendet wurde.
 */
export const STOP_MARKIERUNGEN: Record<
  StopMarkierung,
  { label: string; hell: string; dunkel: string; text: string }
> = {
  // #CFECF7 ist in der Excel-Vorlage die mit Abstand häufigste Füllung (437 Zellen,
  // auf Blatt KW15 praktisch flächendeckend) und stand in keiner Legende: die Farbe,
  // mit der eine fertig geplante Woche abgehakt wurde.
  erledigt: { label: 'Fertig geplant', hell: '#CFECF7', dunkel: '#1E4A5F', text: '#0B3A4A' },
  abgestimmt: { label: 'Mit Kunde abgestimmt', hell: '#92D050', dunkel: '#4A7A1F', text: '#1A2E0A' },
  zu_kommunizieren: {
    label: 'Geplant, noch nicht kommuniziert',
    hell: '#FBE3D6',
    dunkel: '#8A4A2A',
    text: '#5A2A10',
  },
  gedruckt: { label: 'Gedruckt und geplant', hell: '#4EA72E', dunkel: '#2F6B1B', text: '#FFFFFF' },
  vorgeladen: { label: 'Vorgeladen', hell: '#D0DFE6', dunkel: '#2E5468', text: '#123040' },
  auf_lkw: { label: 'Auf LKW', hell: '#A02B93', dunkel: '#6B1D62', text: '#FFFFFF' },
  ausgeliefert: {
    label: 'Ausgeliefert, nicht abgerechnet',
    hell: '#FFC000',
    dunkel: '#8A6800',
    text: '#3D2E00',
  },
  abgerechnet: { label: 'Abgerechnet', hell: '#A8BFCC', dunkel: '#3C5866', text: '#0E2530' },
  problem: { label: 'Problem', hell: '#FF0000', dunkel: '#9B1111', text: '#FFFFFF' },
  freie_kapazitaet: {
    label: 'Freie Kapazität',
    hell: '#FFFF00',
    dunkel: '#8A8A00',
    text: '#333300',
  },
};

/**
 * Reihenfolge im Auswahlmenü — „Fertig geplant" steht oben, weil es der am
 * häufigsten gesetzte Zustand ist.
 */
export const STOP_MARKIERUNG_REIHENFOLGE: StopMarkierung[] = [
  'erledigt',
  'abgestimmt',
  'zu_kommunizieren',
  'gedruckt',
  'vorgeladen',
  'auf_lkw',
  'ausgeliefert',
  'abgerechnet',
  'problem',
  'freie_kapazitaet',
];

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

  /**
   * Freie Notiz zur Tour — in der Excel die Spalte rechts neben dem Block
   * („tagestour", „kaum Umweg", „läd um 6:00 Uhr").
   */
  notiz?: string;

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
export type TourFahrzeugTyp = 'motorwagen' | 'mit_haenger' | 'spedition';

// Standard-Kapazitäten (können pro Tour überschrieben werden)
export const STANDARD_KAPAZITAETEN = {
  motorwagen: 14, // Tonnen (Standard)
  haenger: 10, // Tonnen (Standard)
  spedition: 999, // Spedition hat keine echte Kapazitätsgrenze
};

// Kapazitäten für Touren (Gesamt)
export const FAHRZEUG_KAPAZITAETEN = {
  motorwagen: 14, // Tonnen (nur Motorwagen)
  mit_haenger: 24, // Tonnen (14 + 10)
  spedition: 999, // Unbegrenzt (sammelt Aufträge für Spedition)
};

/**
 * Obergrenze für die Ladung eines Motorwagens in der Kalkulation.
 *
 * ACHTUNG, der Code widerspricht sich hier: Die Konstanten oben rechnen mit
 * 14 t, während der KI-Tourenoptimierer (`claudeRouteOptimizer.ts`) und die
 * Beschriftungen in der Tourenplanung („Nur Motor (18t)", „Mit Hänger (28t)")
 * von 18 t ausgehen. Wer eine Tour von Hand anlegt, bekommt also 14 t, wer sie
 * optimieren lässt, 18 t.
 *
 * Für die Kostenkalkulation gilt der gemeldete Wert 18 t (Vorschlag [19]). Die
 * Tourenkapazitäten oben bleiben unangetastet — sie zu ändern würde die
 * Auslastungsanzeige und die Beladeplanung verschieben, das ist eine eigene
 * Entscheidung.
 */
export const MAX_LKW_LADUNG_TONNEN = 18;

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
