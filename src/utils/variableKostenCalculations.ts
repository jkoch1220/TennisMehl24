import { VariableKostenInput, VariableKostenErgebnis } from '../types';

export const berechneVariableKosten = (
  input: VariableKostenInput,
  fixkostenProJahr: number = 164740.0
): VariableKostenErgebnis => {
  // Berechne Fixkosten je Tonne aus Jahresfixkosten und geplantem Umsatz
  const fixkostenJeTonne =
    input.geplanterUmsatz > 0
      ? fixkostenProJahr / input.geplanterUmsatz
      : 0;
  // Berechne benötigte Arbeitsstunden basierend auf geplantem Umsatz und Produktivität
  const benoetigteStunden =
    input.geplanterUmsatz > 0 && input.lohnkosten.tonnenProArbeitsstunde > 0
      ? input.geplanterUmsatz / input.lohnkosten.tonnenProArbeitsstunde
      : 0;

  // Berechne Lohnkosten mit einheitlichem Stundenlohn
  const jahreskostenLohn =
    benoetigteStunden * input.lohnkosten.stundenlohn;

  // Berechne Ziegelbruch-Kosten: Benötigte Menge = Output × 0.75
  const benoetigteMengeZiegelbruch = input.geplanterUmsatz * 0.75;
  const jahreskostenZiegelbruch =
    benoetigteMengeZiegelbruch * input.einkauf.ziegelbruchKostenProTonne;

  // Berechne variable Verbrauchsmaterial-Kosten pro Tonne
  const jahreskostenDiesel =
    input.geplanterUmsatz * input.einkauf.dieselKostenProTonne;
  const jahreskostenStrom =
    input.geplanterUmsatz * input.einkauf.stromKostenProTonne;
  const jahreskostenEntsorgung =
    input.geplanterUmsatz * input.einkauf.entsorgungContainerKostenProTonne;
  const jahreskostenGasflaschen =
    input.geplanterUmsatz * input.einkauf.gasflaschenKostenProTonne;

  const jahreskostenVerbrauchsmaterial =
    jahreskostenDiesel +
    jahreskostenZiegelbruch +
    jahreskostenStrom +
    jahreskostenEntsorgung +
    jahreskostenGasflaschen;

  // Berechne Hämmer-Kosten: Benötigte Hämmer = Geplanter Umsatz × Verbrauch pro Tonne
  const benoetigteHaemmer =
    input.geplanterUmsatz * input.verschleissteile.verbrauchHaemmerProTonne;
  const jahreskostenHaemmer =
    benoetigteHaemmer * input.verschleissteile.preisProHammer;

  // Berechne variable Verschleißteile-Kosten pro Tonne
  const jahreskostenSiebkoerbe =
    input.geplanterUmsatz * input.verschleissteile.siebkoerbeKostenProTonne;
  const jahreskostenVerschleissbleche =
    input.geplanterUmsatz * input.verschleissteile.verschleissblecheKostenProTonne;
  const jahreskostenWellenlager =
    input.geplanterUmsatz * input.verschleissteile.wellenlagerKostenProTonne;

  const jahreskostenVerschleiss =
    jahreskostenHaemmer +
    jahreskostenSiebkoerbe +
    jahreskostenVerschleissbleche +
    jahreskostenWellenlager;

  // Berechne Sackware-Kosten: Anzahl Paletten = Tonnen × Paletten pro Tonne
  const anzahlPaletten = input.geplanterUmsatz * input.sackware.palettenProTonne;
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
    input.geplanterUmsatz > 0
      ? jahreskostenVeraenderlichOhneSackware / input.geplanterUmsatz
      : 0;

  const herstellkostenJeTonne =
    fixkostenJeTonne + veraenderlicheKostenJeTonne;

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
  };
};

