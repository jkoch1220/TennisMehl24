import { Berechnungsergebnis, SpeditionskostenErgebnis, Warenart, AufschlagTyp, Lieferart, EigenlieferungStammdaten, FremdlieferungStammdaten } from '../types';
import {
  HERSTELLUNGSKOSTEN,
  SACKWARE_KOSTEN,
  AUFSCHLAEGE,
  LIEFER_PREIS_TABELLE,
  getZoneFromPLZ,
  berechneSpeditionskosten as berechneSpeditionskostenPricing,
  berechneSpeditionskostenMitDiesel,
} from '../constants/pricing';
import { berechneEigenlieferungRoute, berechneFremdlieferungRoute } from './routeCalculation';

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
 * Berechnet Speditionskosten (erweitert um Eigenlieferung und Fremdlieferung)
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
  fremdlieferungStammdaten?: FremdlieferungStammdaten,
  startPLZ: string = '97828', // Wertheimer Str. 30, 97828 Marktheidenfeld
  herstellkostenJeTonne?: number, // Abwerkspreis aus Variable-Kosten-Rechner
  dieselPreisCent?: number // Aktueller Dieselpreis für Zuschlagsberechnung (optional)
): Promise<SpeditionskostenErgebnis> => {
  const tonnen = gewicht / 1000;
  const zone = zielPLZ.length >= 2 ? getZoneFromPLZ(zielPLZ) : null;

  let transportkosten = 0;
  let dieselzuschlag = 0;
  let dieselzuschlagProzent = 0;

  // Speditionskosten berechnen (funktioniert für alle Gewichtsstufen)
  if (lieferart === 'spedition') {
    if (dieselPreisCent !== undefined) {
      // Mit Dieselzuschlag berechnen
      const details = berechneSpeditionskostenMitDiesel(zielPLZ, gewicht, dieselPreisCent);
      if (details) {
        transportkosten = details.gesamtpreis;
        dieselzuschlag = details.dieselzuschlag;
        dieselzuschlagProzent = details.dieselzuschlagProzent;
      }
    } else {
      // Ohne Dieselzuschlag (Basis-Tarif)
      const basisPreis = berechneSpeditionskostenPricing(zielPLZ, gewicht);
      if (basisPreis !== null) {
        transportkosten = basisPreis;
      }
    }
  } else if (
    zone &&
    LIEFER_PREIS_TABELLE[paletten] &&
    LIEFER_PREIS_TABELLE[paletten][gewicht]
  ) {
    // Fallback für Eigen-/Fremdlieferung wenn zone-basierte Referenz benötigt wird
    transportkosten = LIEFER_PREIS_TABELLE[paletten][gewicht][zone];
  }

  // Verwende Abwerkspreis aus Variable-Kosten-Rechner falls verfügbar
  let herstellungskostenGesamt = 0;
  let werkspreisBasis = 0; // Basis-Werkspreis ohne Aufschlag
  
  if (warenart === 'sackware') {
    // Für Sackware: Verwende herstellkostenJeTonne falls verfügbar, sonst statische Werte
    const kostenJeTonne = herstellkostenJeTonne || SACKWARE_KOSTEN.cvk_ab_werk;
    herstellungskostenGesamt = kostenJeTonne * tonnen;
    werkspreisBasis = kostenJeTonne * paletten; // Sackware: 1 Tonne = 1 Palette
  } else {
    // Für Schüttware: Verwende herstellkostenJeTonne falls verfügbar, sonst statische Werte
    const kostenJeTonne = herstellkostenJeTonne || HERSTELLUNGSKOSTEN.gesamt_pro_tonne;
    herstellungskostenGesamt = kostenJeTonne * tonnen;
    werkspreisBasis = herstellungskostenGesamt;
  }

  // Berechne Aufschlag basierend auf Kundentyp
  const aufschlagFaktor =
    aufschlagTyp === 'endkunde'
      ? AUFSCHLAEGE.endkunde
      : AUFSCHLAEGE.grosskunde;
  const aufschlag = werkspreisBasis * aufschlagFaktor;
  
  // Werkspreis enthält bereits den Aufschlag basierend auf Kundentyp
  const werkspreis = werkspreisBasis + aufschlag;
  // Verkaufspreis = Werkspreis (da Aufschlag bereits enthalten ist)
  const verkaufspreis = werkspreis;

  let eigenlieferungRoute = undefined;
  let fremdlieferungRoute = undefined;
  
  // Wenn Eigenlieferung gewählt wurde
  if (lieferart === 'eigenlieferung' && eigenlieferungStammdaten) {
    // Berechne Route und Kosten für Eigenlieferung
    const route = await berechneEigenlieferungRoute(
      startPLZ,
      zielPLZ,
      eigenlieferungStammdaten
    );
    
    // Transportkosten = Dieselkosten + Verschleißkosten
    transportkosten = route.dieselkosten + route.verschleisskosten;
    
    eigenlieferungRoute = {
      route,
      stammdaten: eigenlieferungStammdaten,
    };
  }
  
  // Wenn Fremdlieferung gewählt wurde
  if (lieferart === 'fremdlieferung' && fremdlieferungStammdaten) {
    // Berechne Route und Kosten für Fremdlieferung
    const route = await berechneFremdlieferungRoute(
      startPLZ,
      zielPLZ,
      fremdlieferungStammdaten
    );
    
    // Transportkosten = Lohnkosten
    transportkosten = route.lohnkosten;
    
    fremdlieferungRoute = {
      route,
      stammdaten: fremdlieferungStammdaten,
    };
  }
  
  const gesamtpreisMitLieferung = verkaufspreis + transportkosten;
  
  // Berechne Preise pro Tonne explizit
  // Endpreis pro Tonne = Werkspreis pro Tonne + Transportkosten pro Tonne
  const werkspreisProTonne = tonnen > 0 ? werkspreis / tonnen : 0;
  
  // Bei Eigenlieferung/Fremdlieferung: Transportkosten pro Tonne basierend auf LKW-Ladung
  // Bei Spedition: Transportkosten pro Tonne basierend auf tatsächlicher Liefermenge
  let transportkostenProTonne = 0;
  if (lieferart === 'eigenlieferung' && eigenlieferungStammdaten) {
    // Verwende LKW-Ladung für Berechnung der Kosten pro Tonne
    const lkwLadung = eigenlieferungStammdaten.lkwLadungInTonnen;
    transportkostenProTonne = lkwLadung > 0 ? transportkosten / lkwLadung : 0;
  } else if (lieferart === 'fremdlieferung' && fremdlieferungStammdaten) {
    // Verwende LKW-Ladung für Berechnung der Kosten pro Tonne
    const lkwLadung = fremdlieferungStammdaten.lkwLadungInTonnen;
    transportkostenProTonne = lkwLadung > 0 ? transportkosten / lkwLadung : 0;
  } else {
    // Bei Spedition: Verwende tatsächliche Liefermenge
    transportkostenProTonne = tonnen > 0 ? transportkosten / tonnen : 0;
  }
  
  const preisProTonne = werkspreisProTonne + transportkostenProTonne;
  
  // Basis-Transportkosten (ohne Diesel-Zuschlag) für Spedition
  const transportkostenBasis = lieferart === 'spedition' && dieselzuschlag > 0
    ? transportkosten - dieselzuschlag
    : transportkosten;

  return {
    tonnen,
    zone,
    herstellungskostenGesamt,
    herstellungskostenProTonne: tonnen > 0 ? herstellungskostenGesamt / tonnen : 0,
    werkspreis,
    aufschlag,
    verkaufspreis,
    transportkosten,
    gesamtpreisMitLieferung,
    preisProTonne, // Endpreis pro Tonne = Werkspreis pro Tonne + Transportkosten pro Tonne
    preisProKg: gewicht > 0 ? gesamtpreisMitLieferung / gewicht : 0,
    lieferart,
    werkspreisProTonne, // Werkspreis pro Tonne
    transportkostenProTonne, // Transportkosten pro Tonne
    eigenlieferung: eigenlieferungRoute,
    fremdlieferung: fremdlieferungRoute,
    // Diesel-Zuschlag Informationen (nur bei Spedition)
    dieselzuschlag: lieferart === 'spedition' ? dieselzuschlag : undefined,
    dieselzuschlagProzent: lieferart === 'spedition' ? dieselzuschlagProzent : undefined,
    transportkostenBasis: lieferart === 'spedition' ? transportkostenBasis : undefined,
  };
};

