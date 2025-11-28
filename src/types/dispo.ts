import { Warenart, AufschlagTyp, Lieferart, EigenlieferungStammdaten } from './index';

// Status-Typen
export type LieferungStatus = 'geplant' | 'bestaetigt' | 'beladen' | 'unterwegs' | 'geliefert' | 'abgerechnet';
export type RouteStatus = 'geplant' | 'aktiv' | 'abgeschlossen' | 'storniert';
export type Prioritaet = 'hoch' | 'normal' | 'niedrig';

// Adresse Interface
export interface Adresse {
  strasse: string;
  plz: string;
  ort: string;
  koordinaten?: [number, number]; // [lon, lat]
}

// Kontakt Interface
export interface Kontakt {
  name: string;
  telefon: string;
  email?: string;
}

// Lieferung Interface
export interface Lieferung {
  id: string;
  kundenname: string;
  kundennummer?: string;
  adresse: Adresse;
  kontakt?: Kontakt;
  lieferdetails: {
    warenart: Warenart;
    paletten: number;
    gewicht: number; // kg
    tonnen: number;
    kundentyp: AufschlagTyp;
  };
  zeitfenster: {
    gewuenscht: string; // ISO Date String
    bestaetigt?: string; // ISO Date String
    zeitfenster?: {
      von: string; // HH:mm
      bis: string; // HH:mm
    };
  };
  status: LieferungStatus;
  prioritaet: Prioritaet;
  lieferart: Lieferart;
  route?: {
    routeId: string;
    positionInRoute: number;
  };
  kosten?: {
    werkspreis: number;
    transportkosten: number;
    gesamtpreis: number;
  };
  notizen?: string;
  erstelltAm: string; // ISO Date String
  geaendertAm: string; // ISO Date String
}

// Route Stop Interface
export interface RouteStop {
  lieferungId: string;
  ankunft: string; // ISO Date String
  abfahrt: string; // ISO Date String
  distanzVomStart: number; // km
}

// Route Interface
export interface Route {
  id: string;
  name: string;
  datum: string; // ISO Date String
  fahrzeugId: string;
  fahrer?: string;
  lieferungen: string[]; // IDs der Lieferungen in Reihenfolge
  routeDetails: {
    startAdresse: string;
    endAdresse: string;
    gesamtDistanz: number; // km
    gesamtFahrzeit: number; // Minuten
    gesamtZeit: number; // Minuten (inkl. Beladung, Abladung, Pausen)
    dieselkosten: number; // €
    verschleisskosten: number; // €
    gesamtkosten: number; // €
  };
  zeitplan: {
    startZeit: string; // ISO Date String
    rueckkehrZeit: string; // ISO Date String
    stops: RouteStop[];
  };
  status: RouteStatus;
  optimiert: boolean;
  erstelltAm: string; // ISO Date String
  geaendertAm: string; // ISO Date String
}

// Fahrzeug Interface
export interface Fahrzeug {
  id: string;
  kennzeichen: string;
  typ: string;
  kapazitaetTonnen: number;
  stammdaten: EigenlieferungStammdaten;
  verfuegbarkeit: {
    verfuegbar: boolean;
    nichtVerfuegbarBis?: string; // ISO Date String
    grund?: string;
  };
  fahrer?: string;
  statistik: {
    gesamtKilometer: number;
    gesamtLieferungen: number;
    durchschnittlicheAuslastung: number; // %
  };
  erstelltAm: string; // ISO Date String
}

// Kunde Interface
export interface Kunde {
  id: string;
  kundennummer: string;
  name: string;
  adresse: Adresse;
  kontakt: Kontakt;
  kundentyp: AufschlagTyp;
  lieferhinweise?: string;
  zahlungsbedingungen?: string;
  lieferhistorie: string[]; // IDs vergangener Lieferungen
  erstelltAm: string; // ISO Date String
}

// Neue Lieferung (ohne ID für Erstellung)
export type NeueLieferung = Omit<Lieferung, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  erstelltAm?: string;
  geaendertAm?: string;
};

// Neue Route (ohne ID für Erstellung)
export type NeueRoute = Omit<Route, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  erstelltAm?: string;
  geaendertAm?: string;
};

// Neues Fahrzeug (ohne ID für Erstellung)
export type NeuesFahrzeug = Omit<Fahrzeug, 'id' | 'erstelltAm'> & {
  erstelltAm?: string;
};

// Neuer Kunde (ohne ID für Erstellung)
export type NeuerKunde = Omit<Kunde, 'id' | 'erstelltAm'> & {
  erstelltAm?: string;
};

