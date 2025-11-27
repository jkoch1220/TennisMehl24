/**
 * Konverter für Daten zwischen Appwrite JSON und TypeScript Interfaces
 */

import { FixkostenInput, VariableKostenInput, VerkaufspreisEingabe } from '../types';

/**
 * Konvertiert FixkostenInput zu einem flachen Objekt für Appwrite
 */
export function flattenFixkosten(data: FixkostenInput): Record<string, number> {
  return {
    'grundstueck.pacht': data.grundstueck.pacht,
    'grundstueck.steuer': data.grundstueck.steuer,
    'grundstueck.pflege': data.grundstueck.pflege,
    'grundstueck.buerocontainer': data.grundstueck.buerocontainer,
    'maschinen.wartungRadlader': data.maschinen.wartungRadlader,
    'maschinen.wartungStapler': data.maschinen.wartungStapler,
    'maschinen.wartungMuehle': data.maschinen.wartungMuehle,
    'maschinen.wartungSiebanlage': data.maschinen.wartungSiebanlage,
    'maschinen.wartungAbsackanlage': data.maschinen.wartungAbsackanlage,
    'maschinen.sonstigeWartung': data.maschinen.sonstigeWartung,
    'maschinen.grundkostenMaschinen': data.maschinen.grundkostenMaschinen,
    'ruecklagenErsatzkauf': data.ruecklagenErsatzkauf,
    'sonstiges': data.sonstiges,
    'verwaltung.brzSteuerberater': data.verwaltung.brzSteuerberater,
    'verwaltung.telefonCloudServer': data.verwaltung.telefonCloudServer,
    'verwaltung.gfGehalt': data.verwaltung.gfGehalt,
    'verwaltung.grundsteuer': data.verwaltung.grundsteuer,
  };
}

/**
 * Konvertiert ein flaches Objekt zurück zu FixkostenInput
 */
export function unflattenFixkosten(data: Record<string, number | unknown>): FixkostenInput {
  // Konvertiere alle Werte zu Zahlen
  const numericData: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    numericData[key] = typeof value === 'number' ? value : (typeof value === 'string' ? parseFloat(value) || 0 : 0);
  }
  return {
    grundstueck: {
      pacht: numericData['grundstueck.pacht'] || 0,
      steuer: numericData['grundstueck.steuer'] || 0,
      pflege: numericData['grundstueck.pflege'] || 0,
      buerocontainer: numericData['grundstueck.buerocontainer'] || 0,
    },
    maschinen: {
      wartungRadlader: numericData['maschinen.wartungRadlader'] || 0,
      wartungStapler: numericData['maschinen.wartungStapler'] || 0,
      wartungMuehle: numericData['maschinen.wartungMuehle'] || 0,
      wartungSiebanlage: numericData['maschinen.wartungSiebanlage'] || 0,
      wartungAbsackanlage: numericData['maschinen.wartungAbsackanlage'] || 0,
      sonstigeWartung: numericData['maschinen.sonstigeWartung'] || 0,
      grundkostenMaschinen: numericData['maschinen.grundkostenMaschinen'] || 0,
    },
    ruecklagenErsatzkauf: numericData['ruecklagenErsatzkauf'] || 0,
    sonstiges: numericData['sonstiges'] || 0,
    verwaltung: {
      brzSteuerberater: numericData['verwaltung.brzSteuerberater'] || 0,
      telefonCloudServer: numericData['verwaltung.telefonCloudServer'] || 0,
      gfGehalt: numericData['verwaltung.gfGehalt'] || 0,
      grundsteuer: numericData['verwaltung.grundsteuer'] || 0,
    },
  };
}

/**
 * Konvertiert VariableKostenInput zu einem flachen Objekt für Appwrite
 */
export function flattenVariableKosten(data: VariableKostenInput): Record<string, number> {
  return {
    'lohnkosten.stundenlohnHelfer': data.lohnkosten.stundenlohnHelfer,
    'lohnkosten.stundenlohnFacharbeiter': data.lohnkosten.stundenlohnFacharbeiter,
    'lohnkosten.tonnenProArbeitsstunde': data.lohnkosten.tonnenProArbeitsstunde,
    'lohnkosten.verhaeltnisHelferZuFacharbeiter': data.lohnkosten.verhaeltnisHelferZuFacharbeiter,
    'einkauf.dieselKostenProTonne': data.einkauf.dieselKostenProTonne,
    'einkauf.ziegelbruchKostenProTonne': data.einkauf.ziegelbruchKostenProTonne,
    'einkauf.stromKostenProTonne': data.einkauf.stromKostenProTonne,
    'einkauf.entsorgungContainerKostenProTonne': data.einkauf.entsorgungContainerKostenProTonne,
    'einkauf.gasflaschenKostenProTonne': data.einkauf.gasflaschenKostenProTonne,
    'verschleissteile.preisProHammer': data.verschleissteile.preisProHammer,
    'verschleissteile.verbrauchHaemmerProTonne': data.verschleissteile.verbrauchHaemmerProTonne,
    'verschleissteile.siebkoerbeKostenProTonne': data.verschleissteile.siebkoerbeKostenProTonne,
    'verschleissteile.verschleissblecheKostenProTonne': data.verschleissteile.verschleissblecheKostenProTonne,
    'verschleissteile.wellenlagerKostenProTonne': data.verschleissteile.wellenlagerKostenProTonne,
    'sackware.palettenKostenProPalette': data.sackware.palettenKostenProPalette,
    'sackware.saeckeKostenProPalette': data.sackware.saeckeKostenProPalette,
    'sackware.schrumpfhaubenKostenProPalette': data.sackware.schrumpfhaubenKostenProPalette,
    'sackware.palettenProTonne': data.sackware.palettenProTonne,
    'sackware.saeckeProPalette': data.sackware.saeckeProPalette,
    'sackware.sackpreis': data.sackware.sackpreis,
    'sackware.arbeitszeitAbsackenJeSack': data.sackware.arbeitszeitAbsackenJeSack,
    'sackware.kostenProSack': data.sackware.kostenProSack,
    'sackware.kostenJeTonne': data.sackware.kostenJeTonne,
    'verkaufspreise.0.tonnen': data.verkaufspreise[0].tonnen,
    'verkaufspreise.0.preisProTonne': data.verkaufspreise[0].preisProTonne,
    'verkaufspreise.1.tonnen': data.verkaufspreise[1].tonnen,
    'verkaufspreise.1.preisProTonne': data.verkaufspreise[1].preisProTonne,
    'verkaufspreise.2.tonnen': data.verkaufspreise[2].tonnen,
    'verkaufspreise.2.preisProTonne': data.verkaufspreise[2].preisProTonne,
    'geplanterUmsatz': data.geplanterUmsatz,
  };
}

/**
 * Konvertiert ein flaches Objekt zurück zu VariableKostenInput
 */
export function unflattenVariableKosten(data: Record<string, number | unknown>): VariableKostenInput {
  // Konvertiere alle Werte zu Zahlen
  const numericData: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    numericData[key] = typeof value === 'number' ? value : (typeof value === 'string' ? parseFloat(value) || 0 : 0);
  }
  return {
    lohnkosten: {
      stundenlohnHelfer: numericData['lohnkosten.stundenlohnHelfer'] || 0,
      stundenlohnFacharbeiter: numericData['lohnkosten.stundenlohnFacharbeiter'] || 0,
      tonnenProArbeitsstunde: numericData['lohnkosten.tonnenProArbeitsstunde'] || 0,
      verhaeltnisHelferZuFacharbeiter: numericData['lohnkosten.verhaeltnisHelferZuFacharbeiter'] ?? 0.5, // Default: 0.5 (1:2)
    },
    einkauf: {
      dieselKostenProTonne: numericData['einkauf.dieselKostenProTonne'] || 0,
      ziegelbruchKostenProTonne: numericData['einkauf.ziegelbruchKostenProTonne'] || 0,
      stromKostenProTonne: numericData['einkauf.stromKostenProTonne'] || 0,
      entsorgungContainerKostenProTonne: numericData['einkauf.entsorgungContainerKostenProTonne'] || 0,
      gasflaschenKostenProTonne: numericData['einkauf.gasflaschenKostenProTonne'] || 0,
    },
    verschleissteile: {
      preisProHammer: numericData['verschleissteile.preisProHammer'] || 0,
      verbrauchHaemmerProTonne: numericData['verschleissteile.verbrauchHaemmerProTonne'] || 0,
      siebkoerbeKostenProTonne: numericData['verschleissteile.siebkoerbeKostenProTonne'] || 0,
      verschleissblecheKostenProTonne: numericData['verschleissteile.verschleissblecheKostenProTonne'] || 0,
      wellenlagerKostenProTonne: numericData['verschleissteile.wellenlagerKostenProTonne'] || 0,
    },
    sackware: {
      palettenKostenProPalette: numericData['sackware.palettenKostenProPalette'] || 0,
      saeckeKostenProPalette: numericData['sackware.saeckeKostenProPalette'] || 0,
      schrumpfhaubenKostenProPalette: numericData['sackware.schrumpfhaubenKostenProPalette'] || 0,
      palettenProTonne: numericData['sackware.palettenProTonne'] || 0,
      saeckeProPalette: numericData['sackware.saeckeProPalette'] || 0,
      sackpreis: numericData['sackware.sackpreis'] || 0,
      arbeitszeitAbsackenJeSack: numericData['sackware.arbeitszeitAbsackenJeSack'] || 0,
      kostenProSack: numericData['sackware.kostenProSack'] || 0,
      kostenJeTonne: numericData['sackware.kostenJeTonne'] || 0,
    },
    verkaufspreise: [
      {
        tonnen: numericData['verkaufspreise.0.tonnen'] || 0,
        preisProTonne: numericData['verkaufspreise.0.preisProTonne'] || 0,
      },
      {
        tonnen: numericData['verkaufspreise.1.tonnen'] || 0,
        preisProTonne: numericData['verkaufspreise.1.preisProTonne'] || 0,
      },
      {
        tonnen: numericData['verkaufspreise.2.tonnen'] || 0,
        preisProTonne: numericData['verkaufspreise.2.preisProTonne'] || 0,
      },
    ] as [VerkaufspreisEingabe, VerkaufspreisEingabe, VerkaufspreisEingabe],
    geplanterUmsatz: numericData['geplanterUmsatz'] || 0,
  };
}

