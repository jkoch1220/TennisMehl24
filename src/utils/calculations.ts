import { Berechnungsergebnis, SpeditionskostenErgebnis, Warenart, AufschlagTyp, Lieferart, EigenlieferungStammdaten } from '../types';
import {
  HERSTELLUNGSKOSTEN,
  SACKWARE_KOSTEN,
  AUFSCHLAEGE,
  LIEFER_PREIS_TABELLE,
  getZoneFromPLZ,
} from '../constants/pricing';
import { berechneEigenlieferungRoute } from './routeCalculation';

export const berechneZiegelmehl = (
  warenart: Warenart,
  paletten: number,
  gewicht: number,
  plz: string,
  aufschlagTyp: AufschlagTyp
): Berechnungsergebnis => {
  const tonnen = gewicht / 1000;
  const zone = plz.length >= 2 ? getZoneFromPLZ(plz) : null;

  let transportkosten = 0;
  if (
    zone &&
    LIEFER_PREIS_TABELLE[paletten] &&
    LIEFER_PREIS_TABELLE[paletten][gewicht]
  ) {
    transportkosten = LIEFER_PREIS_TABELLE[paletten][gewicht][zone];
  }

  let herstellungskostenGesamt = 0;
  let werkspreis = 0;
  let verkaufspreis = 0;
  let aufschlag = 0;

  if (warenart === 'sackware') {
    // Sackware Berechnung
    herstellungskostenGesamt =
      SACKWARE_KOSTEN.werkspreis_ohne_palette * paletten;
    werkspreis = SACKWARE_KOSTEN.cvk_ab_werk * paletten;

    const aufschlagFaktor =
      aufschlagTyp === 'endkunde'
        ? AUFSCHLAEGE.endkunde
        : AUFSCHLAEGE.grosskunde;
    aufschlag = werkspreis * aufschlagFaktor;
    verkaufspreis = werkspreis + aufschlag;
  } else {
    // Schüttware Berechnung
    herstellungskostenGesamt = HERSTELLUNGSKOSTEN.gesamt_pro_tonne * tonnen;
    werkspreis = herstellungskostenGesamt;

    const aufschlagFaktor =
      aufschlagTyp === 'endkunde'
        ? AUFSCHLAEGE.endkunde
        : AUFSCHLAEGE.grosskunde;
    aufschlag = werkspreis * aufschlagFaktor;
    verkaufspreis = werkspreis + aufschlag;
  }

  const gesamtpreisMitLieferung = verkaufspreis + transportkosten;

  return {
    tonnen,
    zone,
    herstellungskostenGesamt,
    herstellungskostenProTonne: herstellungskostenGesamt / tonnen,
    werkspreis,
    aufschlag,
    verkaufspreis,
    transportkosten,
    gesamtpreisMitLieferung,
    preisProTonne: gesamtpreisMitLieferung / tonnen,
    preisProKg: gesamtpreisMitLieferung / gewicht,
  };
};

/**
 * Berechnet Speditionskosten (erweitert um Eigenlieferung)
 * Verwendet Abwerkspreis aus Variable-Kosten-Rechner falls verfügbar
 */
export const berechneSpeditionskosten = async (
  warenart: Warenart,
  paletten: number,
  gewicht: number,
  zielPLZ: string,
  aufschlagTyp: AufschlagTyp,
  lieferart: Lieferart,
  eigenlieferungStammdaten?: EigenlieferungStammdaten,
  startPLZ: string = '97950', // Hundsberg 13, 97950 Großrinderfeld
  herstellkostenJeTonne?: number // Abwerkspreis aus Variable-Kosten-Rechner
): Promise<SpeditionskostenErgebnis> => {
  const tonnen = gewicht / 1000;
  const zone = zielPLZ.length >= 2 ? getZoneFromPLZ(zielPLZ) : null;

  let transportkosten = 0;
  if (
    zone &&
    LIEFER_PREIS_TABELLE[paletten] &&
    LIEFER_PREIS_TABELLE[paletten][gewicht]
  ) {
    transportkosten = LIEFER_PREIS_TABELLE[paletten][gewicht][zone];
  }

  // Verwende Abwerkspreis aus Variable-Kosten-Rechner falls verfügbar
  let herstellungskostenGesamt = 0;
  let werkspreis = 0;
  
  if (warenart === 'sackware') {
    // Für Sackware: Verwende herstellkostenJeTonne falls verfügbar, sonst statische Werte
    const kostenJeTonne = herstellkostenJeTonne || SACKWARE_KOSTEN.cvk_ab_werk;
    herstellungskostenGesamt = kostenJeTonne * tonnen;
    werkspreis = kostenJeTonne * paletten; // Sackware: 1 Tonne = 1 Palette
  } else {
    // Für Schüttware: Verwende herstellkostenJeTonne falls verfügbar, sonst statische Werte
    const kostenJeTonne = herstellkostenJeTonne || HERSTELLUNGSKOSTEN.gesamt_pro_tonne;
    herstellungskostenGesamt = kostenJeTonne * tonnen;
    werkspreis = herstellungskostenGesamt;
  }

  const aufschlagFaktor =
    aufschlagTyp === 'endkunde'
      ? AUFSCHLAEGE.endkunde
      : AUFSCHLAEGE.grosskunde;
  const aufschlag = werkspreis * aufschlagFaktor;
  const verkaufspreis = werkspreis + aufschlag;

  let eigenlieferungRoute = undefined;
  
  // Wenn Eigenlieferung gewählt wurde
  if (lieferart === 'eigenlieferung' && eigenlieferungStammdaten) {
    // Berechne Route und Kosten für Eigenlieferung
    const route = await berechneEigenlieferungRoute(
      startPLZ,
      zielPLZ,
      eigenlieferungStammdaten
    );
    
    // Transportkosten = Dieselkosten + Zeitkosten (optional)
    transportkosten = route.dieselkosten;
    // Optional: Zeitkosten hinzufügen (z.B. Fahrerlohn)
    
    eigenlieferungRoute = {
      route,
      stammdaten: eigenlieferungStammdaten,
    };
  }
  
  const gesamtpreisMitLieferung = verkaufspreis + transportkosten;
  
  return {
    tonnen,
    zone,
    herstellungskostenGesamt,
    herstellungskostenProTonne: herstellungskostenGesamt / tonnen,
    werkspreis,
    aufschlag,
    verkaufspreis,
    transportkosten,
    gesamtpreisMitLieferung,
    preisProTonne: gesamtpreisMitLieferung / tonnen,
    preisProKg: gesamtpreisMitLieferung / gewicht,
    lieferart,
    eigenlieferung: eigenlieferungRoute,
  };
};

