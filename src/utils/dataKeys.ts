/**
 * Enum für alle Daten-Keys
 * Definiert alle möglichen Keys für die Datenstruktur
 */

// Fixkosten Keys
export enum FixkostenKeys {
  // Grundstück
  GRUNDSTUECK_PACHT = 'grundstueck.pacht',
  GRUNDSTUECK_STEUER = 'grundstueck.steuer',
  GRUNDSTUECK_PFLEGE = 'grundstueck.pflege',
  GRUNDSTUECK_BUEROCONTAINER = 'grundstueck.buerocontainer',
  
  // Maschinen
  MASCHINEN_WARTUNG_RADLADER = 'maschinen.wartungRadlader',
  MASCHINEN_WARTUNG_STAPLER = 'maschinen.wartungStapler',
  MASCHINEN_WARTUNG_MUEHLE = 'maschinen.wartungMuehle',
  MASCHINEN_WARTUNG_SIEBANLAGE = 'maschinen.wartungSiebanlage',
  MASCHINEN_WARTUNG_ABSACKANLAGE = 'maschinen.wartungAbsackanlage',
  MASCHINEN_SONSTIGE_WARTUNG = 'maschinen.sonstigeWartung',
  MASCHINEN_GRUNDKOSTEN = 'maschinen.grundkostenMaschinen',
  
  // Sonstige
  RUECKLAGEN_ERSATZKAUF = 'ruecklagenErsatzkauf',
  SONSTIGES = 'sonstiges',
  
  // Verwaltung
  VERWALTUNG_SIGLE_KUHN = 'verwaltung.sigleKuhn',
  VERWALTUNG_BRZ_STEUERBERATER = 'verwaltung.brzSteuerberater',
  VERWALTUNG_KOSTEN_VORNDRAN = 'verwaltung.kostenVorndran',
  VERWALTUNG_TELEFON_CLOUD_SERVER = 'verwaltung.telefonCloudServer',
  VERWALTUNG_GEWERBESTEUER = 'verwaltung.gewerbesteuer',
}

// Variable Kosten Keys
export enum VariableKostenKeys {
  // Lohnkosten
  LOHNKOSTEN_STUNDENLOHN = 'lohnkosten.stundenlohn',
  LOHNKOSTEN_TONNEN_PRO_ARBEITSSTUNDE = 'lohnkosten.tonnenProArbeitsstunde',
  
  // Einkauf
  EINKAUF_DIESEL_KOSTEN_PRO_TONNE = 'einkauf.dieselKostenProTonne',
  EINKAUF_ZIEGELBRUCH_KOSTEN_PRO_TONNE = 'einkauf.ziegelbruchKostenProTonne',
  EINKAUF_STROM_KOSTEN_PRO_TONNE = 'einkauf.stromKostenProTonne',
  EINKAUF_ENTSORGUNG_CONTAINER_KOSTEN_PRO_TONNE = 'einkauf.entsorgungContainerKostenProTonne',
  EINKAUF_GASFLASCHEN_KOSTEN_PRO_TONNE = 'einkauf.gasflaschenKostenProTonne',
  
  // Verschleißteile
  VERSCHLEISSTEILE_PREIS_PRO_HAMMER = 'verschleissteile.preisProHammer',
  VERSCHLEISSTEILE_VERBRAUCH_HAEMMER_PRO_TONNE = 'verschleissteile.verbrauchHaemmerProTonne',
  VERSCHLEISSTEILE_SIEBKOERBE_KOSTEN_PRO_TONNE = 'verschleissteile.siebkoerbeKostenProTonne',
  VERSCHLEISSTEILE_VERSCHLEISSBLECHE_KOSTEN_PRO_TONNE = 'verschleissteile.verschleissblecheKostenProTonne',
  VERSCHLEISSTEILE_WELLENLAGER_KOSTEN_PRO_TONNE = 'verschleissteile.wellenlagerKostenProTonne',
  
  // Sackware
  SACKWARE_PALLETTEN_KOSTEN_PRO_PALLETTE = 'sackware.palettenKostenProPalette',
  SACKWARE_SAECKE_KOSTEN_PRO_PALLETTE = 'sackware.saeckeKostenProPalette',
  SACKWARE_SCHRUMPFHAUBEN_KOSTEN_PRO_PALLETTE = 'sackware.schrumpfhaubenKostenProPalette',
  SACKWARE_PALLETTEN_PRO_TONNE = 'sackware.palettenProTonne',
  
  // Verkaufspreise
  VERKAUFSPREIS_1_TONNEN = 'verkaufspreise.0.tonnen',
  VERKAUFSPREIS_1_PREIS_PRO_TONNE = 'verkaufspreise.0.preisProTonne',
  VERKAUFSPREIS_2_TONNEN = 'verkaufspreise.1.tonnen',
  VERKAUFSPREIS_2_PREIS_PRO_TONNE = 'verkaufspreise.1.preisProTonne',
  VERKAUFSPREIS_3_TONNEN = 'verkaufspreise.2.tonnen',
  VERKAUFSPREIS_3_PREIS_PRO_TONNE = 'verkaufspreise.2.preisProTonne',
  
  // Sonstiges
  GEPLANTER_UMSATZ = 'geplanterUmsatz',
}

