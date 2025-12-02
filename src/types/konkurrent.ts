// Konkurrent Interface
export interface Konkurrent {
  id: string;
  name: string; // Name des Konkurrenten
  produkte: ProduktTyp[]; // Welche Produkte werden hergestellt
  adresse: {
    strasse?: string;
    plz: string; // Postleitzahl (Pflichtfeld)
    ort: string;
    koordinaten?: [number, number]; // [lon, lat] für Kartenansicht
  };
  kontakt?: {
    telefon?: string;
    email?: string;
    website?: string;
  };
  lieferkostenModell: LieferkostenModell; // Wie werden Lieferkosten berechnet
  notizen?: string;
  produktionsmenge?: number; // Produktionsmenge in Tonnen pro Jahr (für Marker-Größe)
  unternehmensgroesse?: string; // Beschreibung der Unternehmensgröße
  erstelltAm: string; // ISO Date String
  geaendertAm: string; // ISO Date String
}

// Produkttypen die Konkurrenten herstellen
export type ProduktTyp = 'tennismehl' | 'tennissand';

// Lieferkosten-Modell für Konkurrenten
export interface LieferkostenModell {
  typ: 'fest' | 'pro_km' | 'pro_tonne_km' | 'zonen'; // Berechnungsmodell
  // Für fest: Ein fester Preis pro Tonne
  festerPreisProTonne?: number;
  // Für pro_km: Preis pro Kilometer
  preisProKm?: number;
  // Für pro_tonne_km: Preis pro Tonne pro Kilometer
  preisProTonneKm?: number;
  // Für zonen: Preis nach PLZ-Zonen
  zonen?: PLZLieferkostenZone[];
}

// PLZ-Zone für Lieferkosten
export interface PLZLieferkostenZone {
  plzBereich: string; // z.B. "80xxx" oder "80000-80999"
  kostenProTonne: number; // Lieferkosten pro Tonne für diese PLZ-Zone
}

// Neuer Konkurrent (ohne ID für Erstellung)
export type NeuerKonkurrent = Omit<Konkurrent, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  erstelltAm?: string;
  geaendertAm?: string;
};

// Lieferkosten-Berechnung für eine PLZ
export interface LieferkostenBerechnung {
  plz: string;
  kostenProTonne: number; // Lieferkosten pro Tonne Tennis-Sand
  konkurrentId: string;
  konkurrentName: string;
  berechnungsgrundlage: string; // Textuelle Beschreibung wie berechnet wurde
}
