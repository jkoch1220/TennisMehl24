import { VariableKostenInput, VariableKostenErgebnis, VerkaufspreisEingabe } from '../types';

// Berechne durchschnittlichen Verkaufspreis aus 3 Verkaufspreis-Eingaben
export const berechneDurchschnittlichenVerkaufspreis = (
  verkaufspreise: [VerkaufspreisEingabe, VerkaufspreisEingabe, VerkaufspreisEingabe]
): number => {
  // Gewichteter Durchschnitt: (Tonnen1 × Preis1 + Tonnen2 × Preis2 + Tonnen3 × Preis3) / (Tonnen1 + Tonnen2 + Tonnen3)
  const gesamtTonnen = verkaufspreise.reduce((sum, v) => sum + v.tonnen, 0);
  if (gesamtTonnen === 0) return 0;
  
  const gewichteterPreis = verkaufspreise.reduce(
    (sum, v) => sum + v.tonnen * v.preisProTonne,
    0
  );
  
  return gewichteterPreis / gesamtTonnen;
};

// Berechne geplanten Umsatz aus Verkaufspreisen (Summe aller Tonnen)
export const berechneGeplantenUmsatz = (
  verkaufspreise: [VerkaufspreisEingabe, VerkaufspreisEingabe, VerkaufspreisEingabe]
): number => {
  return verkaufspreise.reduce((sum, v) => sum + v.tonnen, 0);
};

export const berechneVariableKosten = (
  input: VariableKostenInput,
  fixkostenProJahr: number = 164740.0
): VariableKostenErgebnis => {
  // Berechne geplanten Umsatz und durchschnittlichen Verkaufspreis aus Verkaufspreisen
  const geplanterUmsatzBerechnet = berechneGeplantenUmsatz(input.verkaufspreise);
  const durchschnittlicherVerkaufspreisProTonne = berechneDurchschnittlichenVerkaufspreis(input.verkaufspreise);
  
  // Verwende berechneten Umsatz für alle weiteren Berechnungen
  const geplanterUmsatz = geplanterUmsatzBerechnet > 0 ? geplanterUmsatzBerechnet : input.geplanterUmsatz;
  
  // Berechne Fixkosten je Tonne aus Jahresfixkosten und geplantem Umsatz
  const fixkostenJeTonne =
    geplanterUmsatz > 0
      ? fixkostenProJahr / geplanterUmsatz
      : 0;
  // Berechne benötigte Arbeitsstunden basierend auf geplantem Umsatz und Produktivität
  const benoetigteStunden =
    geplanterUmsatz > 0 && input.lohnkosten.tonnenProArbeitsstunde > 0
      ? geplanterUmsatz / input.lohnkosten.tonnenProArbeitsstunde
      : 0;

  // Berechne Lohnkosten mit einheitlichem Stundenlohn
  const jahreskostenLohn =
    benoetigteStunden * input.lohnkosten.stundenlohn;

  // Berechne Ziegelbruch-Kosten: Benötigte Menge = Output × 0.75
  const benoetigteMengeZiegelbruch = geplanterUmsatz * 0.75;
  const jahreskostenZiegelbruch =
    benoetigteMengeZiegelbruch * input.einkauf.ziegelbruchKostenProTonne;

  // Berechne variable Verbrauchsmaterial-Kosten pro Tonne
  const jahreskostenDiesel =
    geplanterUmsatz * input.einkauf.dieselKostenProTonne;
  const jahreskostenStrom =
    geplanterUmsatz * input.einkauf.stromKostenProTonne;
  const jahreskostenEntsorgung =
    geplanterUmsatz * input.einkauf.entsorgungContainerKostenProTonne;
  const jahreskostenGasflaschen =
    geplanterUmsatz * input.einkauf.gasflaschenKostenProTonne;

  const jahreskostenVerbrauchsmaterial =
    jahreskostenDiesel +
    jahreskostenZiegelbruch +
    jahreskostenStrom +
    jahreskostenEntsorgung +
    jahreskostenGasflaschen;

  // Berechne Hämmer-Kosten: Benötigte Hämmer = Geplanter Umsatz × Verbrauch pro Tonne
  const benoetigteHaemmer =
    geplanterUmsatz * input.verschleissteile.verbrauchHaemmerProTonne;
  const jahreskostenHaemmer =
    benoetigteHaemmer * input.verschleissteile.preisProHammer;

  // Berechne variable Verschleißteile-Kosten pro Tonne
  const jahreskostenSiebkoerbe =
    geplanterUmsatz * input.verschleissteile.siebkoerbeKostenProTonne;
  const jahreskostenVerschleissbleche =
    geplanterUmsatz * input.verschleissteile.verschleissblecheKostenProTonne;
  const jahreskostenWellenlager =
    geplanterUmsatz * input.verschleissteile.wellenlagerKostenProTonne;

  const jahreskostenVerschleiss =
    jahreskostenHaemmer +
    jahreskostenSiebkoerbe +
    jahreskostenVerschleissbleche +
    jahreskostenWellenlager;

  // Berechne Sackware-Kosten: Anzahl Paletten = Tonnen × Paletten pro Tonne
  const anzahlPaletten = geplanterUmsatz * input.sackware.palettenProTonne;
  const jahreskostenPaletten =
    anzahlPaletten * input.sackware.palettenKostenProPalette;
  const jahreskostenSaecke =
    anzahlPaletten * input.sackware.saeckeKostenProPalette;
  const jahreskostenSchrumpfhauben =
    anzahlPaletten * input.sackware.schrumpfhaubenKostenProPalette;

  const jahreskostenSackware =
    jahreskostenPaletten +
    jahreskostenSaecke +
    jahreskostenSchrumpfhauben;

  const jahreskostenVeraenderlichOhneSackware =
    jahreskostenLohn + jahreskostenVerbrauchsmaterial + jahreskostenVerschleiss;

  const veraenderlicheKostenJeTonne =
    geplanterUmsatz > 0
      ? jahreskostenVeraenderlichOhneSackware / geplanterUmsatz
      : 0;

  const herstellkostenJeTonne =
    fixkostenJeTonne + veraenderlicheKostenJeTonne;

  // Berechne Gewinn je Tonne: Verkaufspreis - Herstellkosten
  const gewinnJeTonne =
    durchschnittlicherVerkaufspreisProTonne - herstellkostenJeTonne;

  // Berechne Jahresgewinn: Gesamtzahl Tonnen × Gewinn je Tonne
  const jahresgewinn = geplanterUmsatz * gewinnJeTonne;

  return {
    jahreskostenLohn,
    jahreskostenVerbrauchsmaterial,
    jahreskostenVerschleiss,
    jahreskostenSackware,
    jahreskostenVeraenderlichOhneSackware,
    veraenderlicheKostenJeTonne,
    herstellkostenJeTonne,
    fixkostenJeTonne, // Berechnet aus fixkostenProJahr / geplanterUmsatz
    benoetigteArbeitsstunden: benoetigteStunden,
    benoetigteMengeZiegelbruch,
    jahreskostenZiegelbruch,
    benoetigteHaemmer,
    jahreskostenHaemmer,
    anzahlPaletten,
    durchschnittlicherVerkaufspreisProTonne,
    geplanterUmsatzBerechnet,
    gewinnJeTonne,
    jahresgewinn,
  };
};

