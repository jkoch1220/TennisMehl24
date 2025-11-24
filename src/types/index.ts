export type Warenart = 'sackware' | 'schuettware';
export type AufschlagTyp = 'endkunde' | 'grosskunde';

export interface Herstellungskosten {
  fixkosten_pro_tonne: number;
  veraenderliche_kosten_pro_tonne: number;
  gesamt_pro_tonne: number;
}

export interface SackwareKosten {
  ziegelmehl: number;
  aufschlag_zm: number;
  absacken: number;
  sacke: number;
  schrumpfsack: number;
  werkspreis_ohne_palette: number;
  aufschlag_10_prozent: number;
  cvk_ab_werk: number;
}

export interface Berechnungsergebnis {
  tonnen: number;
  zone: number | null;
  herstellungskostenGesamt: number;
  herstellungskostenProTonne: number;
  werkspreis: number;
  aufschlag: number;
  verkaufspreis: number;
  transportkosten: number;
  gesamtpreisMitLieferung: number;
  preisProTonne: number;
  preisProKg: number;
}

export interface LieferPreisTabelle {
  [paletten: number]: {
    [gewicht: number]: {
      [zone: number]: number;
    };
  };
}

export interface PLZZuZone {
  [plzPrefix: string]: number;
}

// Fixkosten Typen
export interface GrundstueckKosten {
  pacht: number;
  steuer: number;
  pflege: number;
  buerocontainer: number;
}

export interface MaschinenKosten {
  wartungRadlader: number;
  wartungStapler: number;
  wartungMuehle: number;
  wartungSiebanlage: number;
  wartungAbsackanlage: number;
  sonstigeWartung: number;
  grundkostenMaschinen: number;
}

export interface VerschleissTeile {
  preisProHammer: number; // Einkaufspreis pro Hammer
  verbrauchHaemmerProTonne: number; // Verbrauch Hämmer pro Tonne (Standard: 0.32)
  siebkoerbeKostenProTonne: number; // Kosten pro Tonne
  verschleissblecheKostenProTonne: number; // Kosten pro Tonne
  wellenlagerKostenProTonne: number; // Kosten pro Tonne
}

export interface VerwaltungKosten {
  sigleKuhn: number;
  brzSteuerberater: number;
  kostenVorndran: number;
  telefonCloudServer: number;
  gewerbesteuer: number;
}

export interface FixkostenInput {
  grundstueck: GrundstueckKosten;
  maschinen: MaschinenKosten;
  ruecklagenErsatzkauf: number;
  sonstiges: number;
  verwaltung: VerwaltungKosten;
}

export interface FixkostenErgebnis {
  jahreskostenGrundstueck: number;
  jahreskostenMaschinen: number;
  ruecklagenErsatzkauf: number;
  sonstiges: number;
  grundkostenVerwaltung: number;
  fixkostenProJahr: number;
}

// Variable Kosten Typen
export interface Lohnkosten {
  stundenlohn: number; // Einheitlicher Stundenlohn für alle Personen
  tonnenProArbeitsstunde: number; // Produktivität: wie viele Tonnen pro Stunde produziert werden
}

export interface Einkauf {
  dieselKostenProTonne: number; // Kosten pro Tonne
  ziegelbruchKostenProTonne: number; // Kosten pro Tonne Ziegelbruch
  stromKostenProTonne: number; // Kosten pro Tonne
  entsorgungContainerKostenProTonne: number; // Kosten pro Tonne
  gasflaschenKostenProTonne: number; // Kosten pro Tonne
}

export interface SackwareKostenVariable {
  palettenKostenProPalette: number; // Kosten pro Palette
  saeckeKostenProPalette: number; // Kosten pro Palette
  schrumpfhaubenKostenProPalette: number; // Kosten pro Palette
  palettenProTonne: number; // Anzahl Paletten pro Tonne (Standard: 1 Palette = 1 Tonne)
}

export interface VerkaufspreisEingabe {
  tonnen: number;
  preisProTonne: number; // €/t
}

export interface VariableKostenInput {
  lohnkosten: Lohnkosten;
  einkauf: Einkauf;
  verschleissteile: VerschleissTeile;
  sackware: SackwareKostenVariable;
  verkaufspreise: [VerkaufspreisEingabe, VerkaufspreisEingabe, VerkaufspreisEingabe]; // 3 Verkaufspreis-Eingaben
  geplanterUmsatz: number; // in Tonnen - wird berechnet aus Verkaufspreisen
}

export interface VariableKostenErgebnis {
  jahreskostenLohn: number;
  jahreskostenVerbrauchsmaterial: number;
  jahreskostenVerschleiss: number;
  jahreskostenSackware: number;
  jahreskostenVeraenderlichOhneSackware: number;
  veraenderlicheKostenJeTonne: number;
  herstellkostenJeTonne: number;
  fixkostenJeTonne: number; // wird vom Fixkosten-Rechner übernommen
  benoetigteArbeitsstunden: number;
  benoetigteMengeZiegelbruch: number;
  jahreskostenZiegelbruch: number;
  benoetigteHaemmer: number;
  jahreskostenHaemmer: number;
  anzahlPaletten: number;
  durchschnittlicherVerkaufspreisProTonne: number; // Berechnet aus Verkaufspreisen
  geplanterUmsatzBerechnet: number; // Berechnet aus Verkaufspreisen
  gewinnJeTonne: number; // Gewinn = Verkaufspreis - Herstellkosten
  jahresgewinn: number; // Jahresgewinn = Gesamtzahl Tonnen × Gewinn je Tonne
}

