import { Lieferung, Route, Fahrzeug } from '../types/dispo';
import { berechneEigenlieferungRoute } from './routeCalculation';
import { START_ADRESSE } from './routeCalculation';

const START_COORDS: [number, number] = [9.60, 49.85]; // Marktheidenfeld [lon, lat]

/**
 * Berechnet die Distanz zwischen zwei Koordinaten (Haversine-Formel)
 */
function berechneDistanz(
  coord1: [number, number],
  coord2: [number, number]
): number {
  const R = 6371; // Erdradius in km
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Nearest Neighbor Algorithmus für Routenoptimierung
 */
export async function optimiereRoute(
  lieferungen: Lieferung[],
  fahrzeug: Fahrzeug,
  startZeit: Date
): Promise<{
  optimierteReihenfolge: Lieferung[];
  routeDetails: Route['routeDetails'];
  zeitplan: Route['zeitplan'];
}> {
  if (lieferungen.length === 0) {
    throw new Error('Keine Lieferungen zum Optimieren');
  }

  // Startpunkt
  const startPunkt = START_COORDS;
  
  // Erstelle Koordinaten-Map für alle Lieferungen
  const koordinatenMap = new Map<string, [number, number]>();
  
  for (const lieferung of lieferungen) {
    if (lieferung.adresse.koordinaten) {
      koordinatenMap.set(lieferung.id, lieferung.adresse.koordinaten);
    } else {
      // Fallback: Verwende PLZ-Zentrum (vereinfacht)
      // In Produktion sollte hier Geocoding verwendet werden
      koordinatenMap.set(lieferung.id, START_COORDS);
    }
  }

  // Nearest Neighbor Algorithmus
  const optimierteReihenfolge: Lieferung[] = [];
  const verfuegbar = new Set(lieferungen.map(l => l.id));
  let aktuellerPunkt = startPunkt;
  let aktuelleZeit = new Date(startZeit);

  while (verfuegbar.size > 0) {
    let naechsteLieferung: Lieferung | null = null;
    let kuerzesteDistanz = Infinity;

    // Finde nächste Lieferung
    for (const lieferungId of verfuegbar) {
      const lieferung = lieferungen.find(l => l.id === lieferungId);
      if (!lieferung) continue;

      const zielKoords = koordinatenMap.get(lieferungId);
      if (!zielKoords) continue;

      const distanz = berechneDistanz(aktuellerPunkt, zielKoords);
      
      if (distanz < kuerzesteDistanz) {
        kuerzesteDistanz = distanz;
        naechsteLieferung = lieferung;
      }
    }

    if (!naechsteLieferung) break;

    optimierteReihenfolge.push(naechsteLieferung);
    verfuegbar.delete(naechsteLieferung.id);
    
    const zielKoords = koordinatenMap.get(naechsteLieferung.id);
    if (zielKoords) {
      aktuellerPunkt = zielKoords;
    }
  }

  // Berechne Route-Details für optimierte Reihenfolge
  let gesamtDistanz = 0;
  let gesamtFahrzeit = 0;
  const stops: Route['zeitplan']['stops'] = [];
  
  let aktuellePosition = startPunkt;
  let aktuelleZeitStopp = new Date(startZeit);

  // Beladungszeit am Start
  aktuelleZeitStopp.setMinutes(aktuelleZeitStopp.getMinutes() + fahrzeug.stammdaten.beladungszeit);

  for (let i = 0; i < optimierteReihenfolge.length; i++) {
    const lieferung = optimierteReihenfolge[i];
    const zielKoords = koordinatenMap.get(lieferung.id) || START_COORDS;
    
    // Berechne Distanz und Fahrzeit
    const distanz = berechneDistanz(aktuellePosition, zielKoords);
    const fahrzeit = (distanz / fahrzeug.stammdaten.durchschnittsgeschwindigkeit) * 60; // Minuten
    
    gesamtDistanz += distanz;
    gesamtFahrzeit += fahrzeit;

    // Ankunft
    const ankunft = new Date(aktuelleZeitStopp);
    ankunft.setMinutes(ankunft.getMinutes() + fahrzeit);
    
    // Abfahrt (nach Abladung)
    const abfahrt = new Date(ankunft);
    abfahrt.setMinutes(abfahrt.getMinutes() + fahrzeug.stammdaten.abladungszeit);

    stops.push({
      lieferungId: lieferung.id,
      ankunft: ankunft.toISOString(),
      abfahrt: abfahrt.toISOString(),
      distanzVomStart: gesamtDistanz,
    });

    aktuellePosition = zielKoords;
    aktuelleZeitStopp = abfahrt;
  }

  // Rückweg zum Start
  const rueckwegDistanz = berechneDistanz(aktuellePosition, startPunkt);
  const rueckwegFahrzeit = (rueckwegDistanz / fahrzeug.stammdaten.durchschnittsgeschwindigkeit) * 60;
  gesamtDistanz += rueckwegDistanz;
  gesamtFahrzeit += rueckwegFahrzeit;

  // Berechne Pausenzeit (alle 4 Stunden Fahrt)
  const pausenzeit = Math.floor(gesamtFahrzeit / 240) * fahrzeug.stammdaten.pausenzeit;
  const gesamtZeit = fahrzeug.stammdaten.beladungszeit + gesamtFahrzeit + pausenzeit + 
    (optimierteReihenfolge.length * fahrzeug.stammdaten.abladungszeit);

  // Berechne Kosten
  const dieselverbrauch = (gesamtDistanz / 100) * fahrzeug.stammdaten.dieselverbrauchDurchschnitt;
  const dieselkosten = dieselverbrauch * fahrzeug.stammdaten.dieselLiterKostenBrutto;
  const verschleisskosten = gesamtDistanz * fahrzeug.stammdaten.verschleisspauschaleProKm;
  const gesamtkosten = dieselkosten + verschleisskosten;

  // Rückkehr-Zeit
  const rueckkehrZeit = new Date(aktuelleZeitStopp);
  rueckkehrZeit.setMinutes(rueckkehrZeit.getMinutes() + rueckwegFahrzeit + pausenzeit);

  return {
    optimierteReihenfolge,
    routeDetails: {
      startAdresse: START_ADRESSE,
      endAdresse: START_ADRESSE,
      gesamtDistanz: Math.round(gesamtDistanz * 100) / 100,
      gesamtFahrzeit: Math.round(gesamtFahrzeit),
      gesamtZeit: Math.round(gesamtZeit),
      dieselkosten: Math.round(dieselkosten * 100) / 100,
      verschleisskosten: Math.round(verschleisskosten * 100) / 100,
      gesamtkosten: Math.round(gesamtkosten * 100) / 100,
    },
    zeitplan: {
      startZeit: startZeit.toISOString(),
      rueckkehrZeit: rueckkehrZeit.toISOString(),
      stops,
    },
  };
}

/**
 * Prüft ob alle Lieferungen in das Fahrzeug passen
 */
export function pruefeKapazitaet(
  lieferungen: Lieferung[],
  fahrzeug: Fahrzeug
): { passt: boolean; gesamtTonnen: number } {
  const gesamtTonnen = lieferungen.reduce((sum, l) => sum + l.lieferdetails.tonnen, 0);
  return {
    passt: gesamtTonnen <= fahrzeug.kapazitaetTonnen,
    gesamtTonnen,
  };
}

