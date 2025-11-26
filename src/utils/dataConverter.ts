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
export function unflattenFixkosten(data: Record<string, number>): FixkostenInput {
  return {
    grundstueck: {
      pacht: data['grundstueck.pacht'] || 0,
      steuer: data['grundstueck.steuer'] || 0,
      pflege: data['grundstueck.pflege'] || 0,
      buerocontainer: data['grundstueck.buerocontainer'] || 0,
    },
    maschinen: {
      wartungRadlader: data['maschinen.wartungRadlader'] || 0,
      wartungStapler: data['maschinen.wartungStapler'] || 0,
      wartungMuehle: data['maschinen.wartungMuehle'] || 0,
      wartungSiebanlage: data['maschinen.wartungSiebanlage'] || 0,
      wartungAbsackanlage: data['maschinen.wartungAbsackanlage'] || 0,
      sonstigeWartung: data['maschinen.sonstigeWartung'] || 0,
      grundkostenMaschinen: data['maschinen.grundkostenMaschinen'] || 0,
    },
    ruecklagenErsatzkauf: data['ruecklagenErsatzkauf'] || 0,
    sonstiges: data['sonstiges'] || 0,
    verwaltung: {
      brzSteuerberater: data['verwaltung.brzSteuerberater'] || 0,
      telefonCloudServer: data['verwaltung.telefonCloudServer'] || 0,
      gfGehalt: data['verwaltung.gfGehalt'] || 0,
      grundsteuer: data['verwaltung.grundsteuer'] || 0,
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
export function unflattenVariableKosten(data: Record<string, number>): VariableKostenInput {
  return {
    lohnkosten: {
      stundenlohnHelfer: data['lohnkosten.stundenlohnHelfer'] || 0,
      stundenlohnFacharbeiter: data['lohnkosten.stundenlohnFacharbeiter'] || 0,
      tonnenProArbeitsstunde: data['lohnkosten.tonnenProArbeitsstunde'] || 0,
    },
    einkauf: {
      dieselKostenProTonne: data['einkauf.dieselKostenProTonne'] || 0,
      ziegelbruchKostenProTonne: data['einkauf.ziegelbruchKostenProTonne'] || 0,
      stromKostenProTonne: data['einkauf.stromKostenProTonne'] || 0,
      entsorgungContainerKostenProTonne: data['einkauf.entsorgungContainerKostenProTonne'] || 0,
      gasflaschenKostenProTonne: data['einkauf.gasflaschenKostenProTonne'] || 0,
    },
    verschleissteile: {
      preisProHammer: data['verschleissteile.preisProHammer'] || 0,
      verbrauchHaemmerProTonne: data['verschleissteile.verbrauchHaemmerProTonne'] || 0,
      siebkoerbeKostenProTonne: data['verschleissteile.siebkoerbeKostenProTonne'] || 0,
      verschleissblecheKostenProTonne: data['verschleissteile.verschleissblecheKostenProTonne'] || 0,
      wellenlagerKostenProTonne: data['verschleissteile.wellenlagerKostenProTonne'] || 0,
    },
    sackware: {
      palettenKostenProPalette: data['sackware.palettenKostenProPalette'] || 0,
      saeckeKostenProPalette: data['sackware.saeckeKostenProPalette'] || 0,
      schrumpfhaubenKostenProPalette: data['sackware.schrumpfhaubenKostenProPalette'] || 0,
      palettenProTonne: data['sackware.palettenProTonne'] || 0,
      saeckeProPalette: data['sackware.saeckeProPalette'] || 0,
      sackpreis: data['sackware.sackpreis'] || 0,
      arbeitszeitAbsackenJeSack: data['sackware.arbeitszeitAbsackenJeSack'] || 0,
      kostenProSack: data['sackware.kostenProSack'] || 0,
      kostenJeTonne: data['sackware.kostenJeTonne'] || 0,
    },
    verkaufspreise: [
      {
        tonnen: data['verkaufspreise.0.tonnen'] || 0,
        preisProTonne: data['verkaufspreise.0.preisProTonne'] || 0,
      },
      {
        tonnen: data['verkaufspreise.1.tonnen'] || 0,
        preisProTonne: data['verkaufspreise.1.preisProTonne'] || 0,
      },
      {
        tonnen: data['verkaufspreise.2.tonnen'] || 0,
        preisProTonne: data['verkaufspreise.2.preisProTonne'] || 0,
      },
    ] as [VerkaufspreisEingabe, VerkaufspreisEingabe, VerkaufspreisEingabe],
    geplanterUmsatz: data['geplanterUmsatz'] || 0,
  };
}

