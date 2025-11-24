import { FixkostenInput, VariableKostenInput } from '../types';

export const DEFAULT_FIXKOSTEN: FixkostenInput = {
  grundstueck: {
    pacht: 40800.0,
    steuer: 0.0,
    pflege: 4800.0,
    buerocontainer: 0.0,
  },
  maschinen: {
    wartungRadlader: 2035.0,
    wartungStapler: 2100.0,
    wartungMuehle: 1450.0,
    wartungSiebanlage: 0.0,
    wartungAbsackanlage: 0.0,
    sonstigeWartung: 500.0,
    grundkostenMaschinen: 11000.0,
  },
  ruecklagenErsatzkauf: 10000.0,
  sonstiges: 2747.0,
  verwaltung: {
    sigleKuhn: 6180.0,
    brzSteuerberater: 7370.0,
    kostenVorndran: 3800.0,
    telefonCloudServer: 3325.0,
    gewerbesteuer: 30000.0,
  },
};

export const DEFAULT_VARIABLE_KOSTEN: VariableKostenInput = {
  lohnkosten: {
    // Berechnet aus ursprünglichen Werten:
    // Gesamtlohnkosten: 37088.532 + 37088.532 + 17100.0 = 91277.064 €
    // Bei 800 Std je Person (3 Personen) = 2400 Std gesamt
    // Durchschnittlicher Stundenlohn: 91277.064 / 2400 = 38.03 €/Std
    // Tonnen pro Stunde: 4300 t / 2400 Std = 1.792 t/Std (gesamt)
    // Oder pro Person: 4300 t / 800 Std = 5.375 t/Std
    stundenlohn: 38.03,
    tonnenProArbeitsstunde: 5.375,
  },
  einkauf: {
    // Berechnet aus ursprünglichen Werten für 4300 t:
    // Diesel: 6000.0 € / 4300 t = 1.40 €/t
    dieselKostenProTonne: 1.40,
    // Ziegelbruch-Kosten: 31780.0 €
    // Benötigte Menge: 4300 t × 0.75 = 3225 t
    // Kosten pro Tonne: 31780.0 / 3225 = 9.86 €/t
    ziegelbruchKostenProTonne: 9.86,
    // Strom: 12160.0 € / 4300 t = 2.83 €/t
    stromKostenProTonne: 2.83,
    // Entsorgung: 2100.0 € / 4300 t = 0.49 €/t
    entsorgungContainerKostenProTonne: 0.49,
    // Gasflaschen: 276.0 € / 4300 t = 0.06 €/t
    gasflaschenKostenProTonne: 0.06,
  },
  verschleissteile: {
    // Berechnet aus ursprünglichen Werten:
    // Hämmer-Kosten: 25680.0 €
    // Benötigte Hämmer: 4300 t × 0.32 = 1376 Hämmer
    // Preis pro Hammer: 25680.0 / 1376 = 18.66 €/Hammer
    preisProHammer: 18.66,
    verbrauchHaemmerProTonne: 0.32,
    // Siebkörbe: 13700.0 € / 4300 t = 3.19 €/t
    siebkoerbeKostenProTonne: 3.19,
    // Verschleißbleche: 500.0 € / 4300 t = 0.12 €/t
    verschleissblecheKostenProTonne: 0.12,
    // Wellenlager: 1500.0 € / 4300 t = 0.35 €/t
    wellenlagerKostenProTonne: 0.35,
  },
  sackware: {
    // Berechnet aus ursprünglichen Werten für 200 Paletten:
    // Paletten: 1760.0 € / 200 = 8.80 €/Palette
    palettenKostenProPalette: 8.80,
    // Säcke: 3550.0 € / 200 = 17.75 €/Palette
    saeckeKostenProPalette: 17.75,
    // Schrumpfhauben: 1200.0 € / 200 = 6.00 €/Palette
    schrumpfhaubenKostenProPalette: 6.00,
    // 1 Palette = 1 Tonne
    palettenProTonne: 1.0,
  },
  verkaufspreise: [
    { tonnen: 1000, preisProTonne: 200.0 },
    { tonnen: 2000, preisProTonne: 190.0 },
    { tonnen: 1300, preisProTonne: 180.0 },
  ],
  geplanterUmsatz: 4300, // Wird aus verkaufspreise berechnet
};

