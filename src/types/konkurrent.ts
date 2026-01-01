// Konkurrent Interface - Erweitert für professionelle Marktanalyse
export interface Konkurrent {
  id: string;
  name: string;
  produkte: ProduktTyp[];
  adresse: {
    strasse?: string;
    plz: string;
    ort: string;
    bundesland?: string;
    koordinaten?: [number, number]; // [lon, lat]
  };
  kontakt?: {
    telefon?: string;
    email?: string;
    website?: string;
    ansprechpartner?: string;
  };
  lieferkostenModell: LieferkostenModell;

  // Erweiterte Marktanalyse-Felder
  produktionsmenge?: number; // Tonnen pro Jahr
  produktionskapazitaet?: number; // Max. Kapazität in Tonnen pro Jahr
  marktanteil?: number; // Geschätzter Marktanteil in %
  unternehmensgroesse?: 'klein' | 'mittel' | 'gross' | 'enterprise';
  mitarbeiteranzahl?: number;
  gruendungsjahr?: number;

  // Bewertungen und Einschätzungen
  bewertung?: KonkurrentBewertung;

  // Preise und Konditionen
  preise?: KonkurrentPreise;

  // Bilder und Dokumente
  bilder?: KonkurrentBild[];
  dokumente?: KonkurrentDokument[];

  // Notizen und Tags
  notizen?: string;
  interneNotizen?: string; // Nur intern sichtbar
  tags?: string[];

  // Status und Tracking
  status?: 'aktiv' | 'inaktiv' | 'beobachten' | 'aufgeloest';
  bedrohungsstufe?: 'niedrig' | 'mittel' | 'hoch' | 'kritisch';
  letzteAktualisierung?: string; // Wann wurden Daten zuletzt geprüft

  // Timestamps
  erstelltAm: string;
  geaendertAm: string;
}

// Bewertung eines Konkurrenten
export interface KonkurrentBewertung {
  qualitaet: number; // 1-5 Sterne
  preisLeistung: number; // 1-5 Sterne
  lieferzeit: number; // 1-5 Sterne
  service: number; // 1-5 Sterne
  zuverlaessigkeit: number; // 1-5 Sterne
  gesamtnote?: number; // Berechneter Durchschnitt
}

// Preise und Konditionen
export interface KonkurrentPreise {
  grundpreisTennisSand?: number; // €/Tonne
  grundpreisTennisMehl?: number; // €/Tonne
  mindestbestellmenge?: number; // Tonnen
  rabattStaffel?: {
    abMenge: number;
    rabattProzent: number;
  }[];
  zahlungsbedingungen?: string;
  letztePruefeung?: string;
}

// Bild eines Konkurrenten
export interface KonkurrentBild {
  id: string;
  url: string;
  thumbnail?: string;
  titel?: string;
  beschreibung?: string;
  typ: 'logo' | 'produkt' | 'standort' | 'dokument' | 'sonstiges';
  hochgeladenAm: string;
}

// Dokument eines Konkurrenten
export interface KonkurrentDokument {
  id: string;
  url: string;
  name: string;
  typ: 'preisliste' | 'katalog' | 'zertifikat' | 'analyse' | 'sonstiges';
  groesse?: number; // Bytes
  hochgeladenAm: string;
}

// Produkttypen
export type ProduktTyp = 'tennismehl' | 'tennissand';

// Lieferkosten-Modell
export interface LieferkostenModell {
  typ: 'fest' | 'pro_km' | 'pro_tonne_km' | 'zonen';
  festerPreisProTonne?: number;
  preisProKm?: number;
  preisProTonneKm?: number;
  zonen?: PLZLieferkostenZone[];
}

// PLZ-Zone für Lieferkosten
export interface PLZLieferkostenZone {
  plzBereich: string;
  kostenProTonne: number;
}

// Neuer Konkurrent (ohne automatische Felder)
export type NeuerKonkurrent = Omit<Konkurrent, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  erstelltAm?: string;
  geaendertAm?: string;
};

// Lieferkosten-Berechnung
export interface LieferkostenBerechnung {
  plz: string;
  kostenProTonne: number;
  konkurrentId: string;
  konkurrentName: string;
  berechnungsgrundlage: string;
}

// Filter für Konkurrenten-Suche
export interface KonkurrentFilter {
  suchbegriff?: string;
  produkte?: ProduktTyp[];
  bundeslaender?: string[];
  produktionsmengeMin?: number;
  produktionsmengeMax?: number;
  bewertungMin?: number;
  status?: ('aktiv' | 'inaktiv' | 'beobachten' | 'aufgeloest')[];
  bedrohungsstufe?: ('niedrig' | 'mittel' | 'hoch' | 'kritisch')[];
  tags?: string[];
  unternehmensgroesse?: ('klein' | 'mittel' | 'gross' | 'enterprise')[];
}

// Markt-Statistiken
export interface MarktStatistiken {
  anzahlKonkurrenten: number;
  gesamtProduktion: number;
  durchschnittlicheProduktion: number;
  produktionsVerteilung: {
    klein: number; // <2000t
    mittel: number; // 2000-5000t
    gross: number; // >5000t
  };
  produkteVerteilung: {
    nurTennisSand: number;
    nurTennisMehl: number;
    beides: number;
  };
  regionalVerteilung: {
    [bundesland: string]: number;
  };
  bedrohungsVerteilung: {
    niedrig: number;
    mittel: number;
    hoch: number;
    kritisch: number;
  };
  topKonkurrenten: Konkurrent[];
}

// Vergleich zwischen Konkurrenten
export interface KonkurrentVergleich {
  konkurrenten: Konkurrent[];
  vergleichsKriterien: {
    kriterium: string;
    werte: { konkurrentId: string; wert: string | number }[];
  }[];
}
