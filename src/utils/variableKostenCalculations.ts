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

  // Berechne Lohnkosten für Produktion basierend auf Verhältnis Helfer zu Facharbeiter
  // Verhältnis: z.B. 0.5 bedeutet 1 Helfer auf 2 Facharbeiter (1:2)
  // Gesamtanteil: 1 + verhaeltnisHelferZuFacharbeiter = Anzahl Einheiten
  // Beispiel: Verhältnis 0.5 → 1 + 0.5 = 1.5 Einheiten (1 Facharbeiter + 0.5 Helfer)
  const verhaeltnis = input.lohnkosten.verhaeltnisHelferZuFacharbeiter;
  const anteilHelfer = verhaeltnis / (1 + verhaeltnis); // Anteil der Stunden für Helfer
  const anteilFacharbeiter = 1 / (1 + verhaeltnis); // Anteil der Stunden für Facharbeiter
  
  const stundenHelfer = benoetigteStunden * anteilHelfer;
  const stundenFacharbeiter = benoetigteStunden * anteilFacharbeiter;
  
  const jahreskostenLohnHelfer =
    stundenHelfer * input.lohnkosten.stundenlohnHelfer;
  const jahreskostenLohnFacharbeiter =
    stundenFacharbeiter * input.lohnkosten.stundenlohnFacharbeiter;
  const jahreskostenLohnProduktion =
    jahreskostenLohnHelfer + jahreskostenLohnFacharbeiter;

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
  
  // Berechne Anzahl Säcke: Anzahl Paletten × Säcke pro Palette
  const anzahlSaecke = anzahlPaletten * input.sackware.saeckeProPalette;
  
  // Berechne Lohnkosten für Absacken: Anzahl Säcke × Arbeitszeit je Sack × Durchschnitts-Stundenlohn
  const arbeitsstundenAbsacken = anzahlSaecke * input.sackware.arbeitszeitAbsackenJeSack;
  const durchschnittsStundenlohn = (input.lohnkosten.stundenlohnHelfer + input.lohnkosten.stundenlohnFacharbeiter) / 2;
  const jahreskostenLohnAbsacken = arbeitsstundenAbsacken * durchschnittsStundenlohn;
  
  // Berechne Kosten pro Sack: Sackpreis + (Arbeitszeit je Sack × Durchschnitts-Stundenlohn)
  const kostenProSack = input.sackware.sackpreis + (input.sackware.arbeitszeitAbsackenJeSack * durchschnittsStundenlohn);
  
  // Berechne Sackware-Materialkosten
  const jahreskostenPaletten =
    anzahlPaletten * input.sackware.palettenKostenProPalette;
  const jahreskostenSaecke =
    anzahlPaletten * input.sackware.saeckeKostenProPalette;
  const jahreskostenSchrumpfhauben =
    anzahlPaletten * input.sackware.schrumpfhaubenKostenProPalette;
  
  // Gesamtkosten Sackware: Materialkosten + Sackkosten (inkl. Lohn für Absacken)
  const jahreskostenSackwareMaterial =
    jahreskostenPaletten +
    jahreskostenSaecke +
    jahreskostenSchrumpfhauben;
  
  // Sackkosten: Anzahl Säcke × Kosten pro Sack (inkl. Sackpreis und Lohn)
  const jahreskostenSaeckeNeu = anzahlSaecke * kostenProSack;
  
  const jahreskostenSackware =
    jahreskostenSackwareMaterial +
    jahreskostenSaeckeNeu;
  
  // Berechne Kosten je Tonne für Sackware (wird in sackware.kostenJeTonne gespeichert)
  // const kostenJeTonne = geplanterUmsatz > 0
  //   ? jahreskostenSackware / geplanterUmsatz
  //   : 0;

  // Gesamtlohnkosten: Produktion + Absacken
  const jahreskostenLohn = jahreskostenLohnProduktion + jahreskostenLohnAbsacken;

  const jahreskostenVeraenderlichOhneSackware =
    jahreskostenLohnProduktion + jahreskostenVerbrauchsmaterial + jahreskostenVerschleiss;

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

