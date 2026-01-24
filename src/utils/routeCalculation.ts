/**
 * Routenberechnung und Zeitberechnung für Eigenlieferung
 *
 * SICHERHEITSHINWEIS:
 * Diese Datei ruft jetzt das sichere Backend auf.
 * Google Maps und OpenRouteService API-Keys sind NUR auf dem Server gespeichert.
 */

import { backendApi, RouteResult } from '../services/api/backendClient';
import { EigenlieferungStammdaten, RoutenBerechnung, FremdlieferungStammdaten, FremdlieferungRoutenBerechnung } from '../types';

// Startadresse (Standort des Unternehmens)
export const START_ADRESSE = 'Wertheimer Str. 30, 97828 Marktheidenfeld';
const START_PLZ = '97828';

// Manuelle Koordinaten für Marktheidenfeld (Fallback)
export const START_COORDS_MANUELL: [number, number] = [9.60, 49.85]; // [lon, lat]

// Re-export types
export type { RouteResult };

/**
 * Berechnet Route zwischen zwei PLZ über das sichere Backend
 */
export const berechneRoute = async (
  startPLZ: string,
  zielPLZ: string
): Promise<RouteResult> => {
  console.log(`🔄 Berechne Route: ${startPLZ} → ${zielPLZ}`);

  try {
    const result = await backendApi.routing.calculateRoute(startPLZ, zielPLZ);

    console.log(`✅ Route berechnet:`);
    console.log(`   Distanz: ${result.distanzKm.toFixed(2)} km`);
    console.log(`   Fahrzeit: ${result.fahrzeitMinuten.toFixed(0)} min`);
    if (result.trafficDelayMinuten > 0) {
      console.log(`   🚗 Traffic-Verzögerung: +${result.trafficDelayMinuten.toFixed(0)} min`);
    }

    return result;
  } catch (error) {
    console.error('❌ Fehler bei Routenberechnung:', error);

    // Fallback-Schätzung
    const startZone = parseInt(startPLZ.substring(0, 2));
    const zielZone = parseInt(zielPLZ.substring(0, 2));
    const geschaetzteDistanz = Math.max(20, Math.abs(startZone - zielZone) * 50);
    const geschaetzteFahrzeit = (geschaetzteDistanz / 60) * 60;

    return {
      distanzKm: geschaetzteDistanz,
      fahrzeitMinuten: geschaetzteFahrzeit,
      fahrzeitOhneTrafficMinuten: geschaetzteFahrzeit,
      trafficDelayMinuten: 0
    };
  }
};

/**
 * Legacy-Funktion für Abwärtskompatibilität
 * Gibt nur die Distanz zurück
 */
export const berechneDistanzVonPLZ = async (
  startPLZ: string,
  zielPLZ: string
): Promise<number> => {
  const result = await berechneRoute(startPLZ, zielPLZ);
  return result.distanzKm;
};

/**
 * Berechnet die benötigte Zeit für eine Fahrt
 */
export const berechneFahrzeit = (
  distanz: number,
  durchschnittsgeschwindigkeit: number,
  tatsaechlicheFahrzeitMinuten?: number
): number => {
  if (tatsaechlicheFahrzeitMinuten !== undefined) {
    return tatsaechlicheFahrzeitMinuten;
  }
  return (distanz / durchschnittsgeschwindigkeit) * 60;
};

/**
 * Berechnet die benötigte Pausenzeit basierend auf Fahrzeit
 * EU-Verordnung: 45 Minuten Pause nach 4,5 Stunden Fahrt
 */
export const berechnePausenzeit = (fahrzeitMinuten: number): number => {
  const anzahlPausen = Math.floor(fahrzeitMinuten / 270);
  return anzahlPausen * 45;
};

/**
 * Berechnet die komplette Routenberechnung für Eigenlieferung
 */
export const berechneEigenlieferungRoute = async (
  startPLZ: string,
  zielPLZ: string,
  stammdaten: EigenlieferungStammdaten
): Promise<RoutenBerechnung> => {
  console.log(`🚛 Berechne Route für Eigenlieferung: ${startPLZ} → ${zielPLZ} → ${startPLZ}`);

  // Berechne Hinweg
  console.log(`\n📤 === HINWEG ===`);
  const hinwegRoute = await berechneRoute(startPLZ, zielPLZ);

  // Warte kurz zwischen Anfragen
  await new Promise(resolve => setTimeout(resolve, 100));

  // Berechne Rückweg
  console.log(`\n📥 === RÜCKWEG ===`);
  const rueckwegRoute = await berechneRoute(zielPLZ, startPLZ);

  // Gesamtwerte
  const distanz = hinwegRoute.distanzKm + rueckwegRoute.distanzKm;
  const hinwegFahrzeit = hinwegRoute.fahrzeitMinuten;
  const rueckwegFahrzeit = rueckwegRoute.fahrzeitMinuten;
  const fahrzeit = hinwegFahrzeit + rueckwegFahrzeit;
  const totalTrafficDelay = hinwegRoute.trafficDelayMinuten + rueckwegRoute.trafficDelayMinuten;

  console.log(`\n📊 === ZUSAMMENFASSUNG ===`);
  console.log(`   Gesamtdistanz: ${distanz.toFixed(2)} km`);
  console.log(`   Gesamtfahrzeit: ${fahrzeit.toFixed(0)} min (${(fahrzeit / 60).toFixed(1)} h)`);
  if (totalTrafficDelay > 0) {
    console.log(`   🚗 Gesamt Traffic-Verzögerung: +${totalTrafficDelay.toFixed(0)} min`);
  }

  const pausenzeit = berechnePausenzeit(fahrzeit);
  const gesamtAbladungszeit = stammdaten.abladungszeit * stammdaten.anzahlAbladestellen;
  const gesamtzeit = stammdaten.beladungszeit + fahrzeit + pausenzeit + gesamtAbladungszeit;

  const dieselverbrauch = (distanz / 100) * stammdaten.dieselverbrauchDurchschnitt;
  const dieselkosten = dieselverbrauch * stammdaten.dieselLiterKostenBrutto;
  const verschleisskosten = distanz * stammdaten.verschleisspauschaleProKm;

  console.log(`   Dieselverbrauch: ${dieselverbrauch.toFixed(2)} L`);
  console.log(`   Dieselkosten: ${dieselkosten.toFixed(2)} €`);
  console.log(`   Verschleißkosten: ${verschleisskosten.toFixed(2)} €`);
  console.log(`   Gesamtzeit inkl. Be-/Entladung: ${gesamtzeit.toFixed(0)} min (${(gesamtzeit / 60).toFixed(1)} h)`);

  return {
    distanz,
    fahrzeit,
    gesamtzeit,
    dieselverbrauch,
    dieselkosten,
    verschleisskosten,
    beladungszeit: stammdaten.beladungszeit,
    abladungszeit: gesamtAbladungszeit,
    pausenzeit,
    hinwegDistanz: hinwegRoute.distanzKm,
    rueckwegDistanz: rueckwegRoute.distanzKm,
    hinwegFahrzeit,
    rueckwegFahrzeit,
  };
};

/**
 * Berechnet die komplette Routenberechnung für Fremdlieferung
 */
export const berechneFremdlieferungRoute = async (
  startPLZ: string,
  zielPLZ: string,
  stammdaten: FremdlieferungStammdaten
): Promise<FremdlieferungRoutenBerechnung> => {
  console.log(`🚚 Berechne Route für Fremdlieferung: ${startPLZ} → ${zielPLZ} → ${startPLZ}`);

  const hinwegRoute = await berechneRoute(startPLZ, zielPLZ);
  await new Promise(resolve => setTimeout(resolve, 100));
  const rueckwegRoute = await berechneRoute(zielPLZ, startPLZ);

  const distanz = hinwegRoute.distanzKm + rueckwegRoute.distanzKm;
  const hinwegFahrzeit = hinwegRoute.fahrzeitMinuten;
  const rueckwegFahrzeit = rueckwegRoute.fahrzeitMinuten;
  const fahrzeit = hinwegFahrzeit + rueckwegFahrzeit;

  const pausenzeit = berechnePausenzeit(fahrzeit);
  const gesamtAbladungszeit = stammdaten.abladungszeit * stammdaten.anzahlAbladestellen;
  const gesamtzeit = stammdaten.beladungszeit + fahrzeit + pausenzeit + gesamtAbladungszeit;

  const gesamtzeitInStunden = gesamtzeit / 60;
  const lohnkosten = gesamtzeitInStunden * stammdaten.stundenlohn;

  console.log(`   Gesamtzeit: ${gesamtzeit.toFixed(0)} min (${gesamtzeitInStunden.toFixed(2)} h)`);
  console.log(`   Lohnkosten: ${lohnkosten.toFixed(2)} € (${stammdaten.stundenlohn.toFixed(2)} €/h)`);

  return {
    distanz,
    fahrzeit,
    gesamtzeit,
    lohnkosten,
    beladungszeit: stammdaten.beladungszeit,
    abladungszeit: gesamtAbladungszeit,
    pausenzeit,
    hinwegDistanz: hinwegRoute.distanzKm,
    rueckwegDistanz: rueckwegRoute.distanzKm,
    hinwegFahrzeit,
    rueckwegFahrzeit,
  };
};

/**
 * Formatiert Zeit in Stunden und Minuten
 */
export const formatZeit = (minuten: number): string => {
  const stunden = Math.floor(minuten / 60);
  const restMinuten = Math.round(minuten % 60);
  return `${stunden}h ${restMinuten}min`;
};
