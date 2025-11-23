import { Berechnungsergebnis, Warenart, AufschlagTyp } from '../types';
import {
  HERSTELLUNGSKOSTEN,
  SACKWARE_KOSTEN,
  AUFSCHLAEGE,
  LIEFER_PREIS_TABELLE,
  getZoneFromPLZ,
} from '../constants/pricing';

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

