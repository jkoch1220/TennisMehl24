/**
 * Routenberechnung und Zeitberechnung für Eigenlieferung
 * Nutzt Google Routes API für präzise Routen mit Verkehrsdaten
 */

import { EigenlieferungStammdaten, RoutenBerechnung, FremdlieferungStammdaten, FremdlieferungRoutenBerechnung } from '../types';

// Startadresse (Standort des Unternehmens)
export const START_ADRESSE = 'Wertheimer Str. 30, 97828 Marktheidenfeld';
const START_PLZ = '97828'; // PLZ für Fallback

// Manuelle Koordinaten für Marktheidenfeld (Fallback falls Geocodierung fehlschlägt)
// Koordinaten für Marktheidenfeld: ~49.85°N, 9.60°E
export const START_COORDS_MANUELL: [number, number] = [9.60, 49.85]; // [lon, lat]

// API Keys
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const OPENROUTESERVICE_API_KEY = import.meta.env.VITE_OPENROUTESERVICE_API_KEY || '';

// Cache für Geocoding-Ergebnisse
const geocodeCache = new Map<string, [number, number]>();

/**
 * Ergebnis einer Routenberechnung mit Traffic-Daten
 */
interface RouteResult {
  distanzKm: number;
  fahrzeitMinuten: number;          // Mit Traffic
  fahrzeitOhneTrafficMinuten: number; // Ohne Traffic (statisch)
  trafficDelayMinuten: number;       // Zusätzliche Zeit durch Verkehr
}

/**
 * Geocodiert eine PLZ mit Google Geocoding API
 */
const geocodePLZMitGoogle = async (plz: string): Promise<[number, number] | null> => {
  if (!GOOGLE_API_KEY) return null;

  // Check Cache
  const cacheKey = `google-${plz}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${plz},Deutschland&key=${GOOGLE_API_KEY}&language=de&region=de`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Geocoding Fehler: ${response.status}`);

    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      const coords: [number, number] = [location.lng, location.lat]; // [lon, lat]

      console.log(`📍 Google Geocoding für PLZ "${plz}": [${coords[0]}, ${coords[1]}]`);
      geocodeCache.set(cacheKey, coords);
      return coords;
    }

    console.warn(`⚠️ Google Geocoding: Keine Ergebnisse für PLZ "${plz}"`);
    return null;
  } catch (error) {
    console.error('Google Geocoding Fehler:', error);
    return null;
  }
};

/**
 * Geocodiert eine PLZ mit Nominatim (OpenStreetMap) als Fallback
 */
const geocodePLZMitNominatim = async (plz: string): Promise<[number, number] | null> => {
  // Check Cache
  const cacheKey = `nominatim-${plz}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${plz}&countrycodes=de&format=json&limit=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'TennisMehl-Kostenrechner/1.0' }
    });

    if (!response.ok) throw new Error(`Nominatim Fehler: ${response.status}`);

    const data = await response.json();

    if (data && data.length > 0) {
      const coords: [number, number] = [parseFloat(data[0].lon), parseFloat(data[0].lat)];
      console.log(`📍 Nominatim Geocoding für PLZ "${plz}": [${coords[0]}, ${coords[1]}]`);
      geocodeCache.set(cacheKey, coords);
      return coords;
    }

    return null;
  } catch (error) {
    console.warn('Nominatim Geocoding fehlgeschlagen:', error);
    return null;
  }
};

/**
 * Geocodiert eine PLZ - versucht Google zuerst, dann Nominatim als Fallback
 */
const geocodePLZ = async (plz: string): Promise<[number, number] | null> => {
  // Spezialfall: Start-PLZ hat manuelle Koordinaten
  if (plz === START_PLZ) {
    return START_COORDS_MANUELL;
  }

  // Versuche Google zuerst (genauer)
  if (GOOGLE_API_KEY) {
    const googleResult = await geocodePLZMitGoogle(plz);
    if (googleResult) return googleResult;
  }

  // Fallback auf Nominatim
  return await geocodePLZMitNominatim(plz);
};

/**
 * Berechnet Route mit Google Routes API (inkl. Traffic)
 *
 * WICHTIG: Für diese Funktion muss die "Routes API" in Google Cloud aktiviert sein!
 * https://console.cloud.google.com/apis/library/routes.googleapis.com
 */
const berechneRouteMitGoogle = async (
  startCoords: [number, number],
  zielCoords: [number, number]
): Promise<RouteResult | null> => {
  if (!GOOGLE_API_KEY) {
    console.warn('⚠️ Kein Google API Key vorhanden');
    return null;
  }

  try {
    // Google Routes API v2 (computeRoutes)
    const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

    const requestBody = {
      origin: {
        location: {
          latLng: {
            latitude: startCoords[1],  // lat
            longitude: startCoords[0]  // lon
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: zielCoords[1],  // lat
            longitude: zielCoords[0]  // lon
          }
        }
      },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE', // Berücksichtigt aktuellen Verkehr
      computeAlternativeRoutes: false,
      routeModifiers: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: true,
        // LKW-spezifische Einschränkungen
        vehicleInfo: {
          emissionType: 'DIESEL'
        }
      },
      languageCode: 'de-DE',
      units: 'METRIC'
    };

    console.log(`🗺️ Google Routes API Anfrage...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google Routes API Fehler ${response.status}:`, errorText);

      // Spezifische Fehlermeldung für nicht aktivierte API
      if (response.status === 403 || errorText.includes('PERMISSION_DENIED')) {
        console.error(`
⚠️ HINWEIS: Die Google Routes API ist möglicherweise nicht aktiviert!
   Bitte aktiviere sie hier: https://console.cloud.google.com/apis/library/routes.googleapis.com
        `);
      }

      return null;
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      console.warn('⚠️ Google Routes API: Keine Route gefunden');
      return null;
    }

    const route = data.routes[0];

    // Distanz in Metern → Kilometer
    const distanzKm = route.distanceMeters / 1000;

    // Duration ist im Format "3600s" (Sekunden als String)
    const parseDuration = (durationStr: string): number => {
      if (!durationStr) return 0;
      const seconds = parseInt(durationStr.replace('s', ''));
      return seconds / 60; // Minuten
    };

    // LKW-Faktor: LKWs fahren ca. 25% langsamer als PKWs
    // (Durchschnitt PKW: ~80 km/h, LKW: ~60-65 km/h auf Autobahn)
    const LKW_GESCHWINDIGKEITS_FAKTOR = 1.25;

    const pkwFahrzeitMinuten = parseDuration(route.duration);
    const pkwFahrzeitOhneTrafficMinuten = parseDuration(route.staticDuration);

    // Wende LKW-Faktor auf die Fahrzeit an
    const fahrzeitMinuten = pkwFahrzeitMinuten * LKW_GESCHWINDIGKEITS_FAKTOR;
    const fahrzeitOhneTrafficMinuten = pkwFahrzeitOhneTrafficMinuten * LKW_GESCHWINDIGKEITS_FAKTOR;
    const trafficDelayMinuten = Math.max(0, fahrzeitMinuten - fahrzeitOhneTrafficMinuten);

    console.log(`✅ Google Routes API Ergebnis (LKW-korrigiert):`);
    console.log(`   Distanz: ${distanzKm.toFixed(2)} km`);
    console.log(`   Fahrzeit PKW: ${pkwFahrzeitMinuten.toFixed(0)} min`);
    console.log(`   Fahrzeit LKW (×${LKW_GESCHWINDIGKEITS_FAKTOR}): ${fahrzeitMinuten.toFixed(0)} min`);
    if (trafficDelayMinuten > 0) {
      console.log(`   🚗 Verkehrsbedingte Verzögerung: +${trafficDelayMinuten.toFixed(0)} min`);
    }

    return {
      distanzKm,
      fahrzeitMinuten,
      fahrzeitOhneTrafficMinuten,
      trafficDelayMinuten
    };
  } catch (error) {
    console.error('Google Routes API Fehler:', error);
    return null;
  }
};

/**
 * Berechnet Route mit OpenRouteService als Fallback
 */
const berechneRouteMitOpenRouteService = async (
  startCoords: [number, number],
  zielCoords: [number, number]
): Promise<RouteResult | null> => {
  if (!OPENROUTESERVICE_API_KEY) {
    return null;
  }

  try {
    const startParam = `${startCoords[0]},${startCoords[1]}`;
    const endParam = `${zielCoords[0]},${zielCoords[1]}`;

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${OPENROUTESERVICE_API_KEY}&start=${startParam}&end=${endParam}`;

    console.log(`🗺️ OpenRouteService Fallback...`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`ORS Fehler: ${response.status}`);

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const segment = data.features[0].properties?.segments?.[0];
      if (segment) {
        const distanzKm = segment.distance / 1000;
        const fahrzeitMinuten = segment.duration / 60;

        console.log(`✅ OpenRouteService Ergebnis: ${distanzKm.toFixed(2)} km, ${fahrzeitMinuten.toFixed(0)} min`);

        return {
          distanzKm,
          fahrzeitMinuten,
          fahrzeitOhneTrafficMinuten: fahrzeitMinuten, // ORS hat keine Traffic-Daten
          trafficDelayMinuten: 0
        };
      }
    }

    return null;
  } catch (error) {
    console.error('OpenRouteService Fehler:', error);
    return null;
  }
};

/**
 * Berechnet die Luftlinien-Distanz zwischen zwei Koordinaten (Haversine-Formel)
 */
const berechneLuftlinie = (
  coord1: [number, number],
  coord2: [number, number]
): number => {
  const R = 6371; // Erdradius in km
  const dLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const dLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1[1] * Math.PI) / 180) *
      Math.cos((coord2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Cache für Routen-Ergebnisse (spart API-Calls)
const routenCache = new Map<string, RouteResult>();

/**
 * Berechnet Route zwischen zwei PLZ
 * Priorisiert Google Routes API (mit Traffic), fällt auf OpenRouteService zurück
 */
export const berechneRoute = async (
  startPLZ: string,
  zielPLZ: string
): Promise<RouteResult> => {
  const cacheKey = `${startPLZ}->${zielPLZ}`;

  // Check Cache (5 Minuten gültig für Traffic-Daten)
  if (routenCache.has(cacheKey)) {
    console.log(`📦 Route aus Cache: ${cacheKey}`);
    return routenCache.get(cacheKey)!;
  }

  console.log(`🔄 Berechne Route: ${startPLZ} → ${zielPLZ}`);

  // Geocode beide PLZ
  const startCoords = await geocodePLZ(startPLZ);
  const zielCoords = await geocodePLZ(zielPLZ);

  if (!startCoords || !zielCoords) {
    console.warn('⚠️ Geocoding fehlgeschlagen, verwende Schätzung');
    return createFallbackRoute(startPLZ, zielPLZ);
  }

  // Validiere Koordinaten (Deutschland: ~47-55°N, ~6-15°E)
  if (!isValidGermanCoords(startCoords) || !isValidGermanCoords(zielCoords)) {
    console.warn('⚠️ Koordinaten außerhalb Deutschlands, verwende Schätzung');
    return createFallbackRoute(startPLZ, zielPLZ);
  }

  // Versuche Google Routes API zuerst (hat Traffic-Daten)
  let result = await berechneRouteMitGoogle(startCoords, zielCoords);

  // Fallback auf OpenRouteService
  if (!result) {
    console.log('⚠️ Google Routes fehlgeschlagen, versuche OpenRouteService...');
    result = await berechneRouteMitOpenRouteService(startCoords, zielCoords);
  }

  // Wenn beide APIs fehlschlagen, verwende Schätzung
  if (!result) {
    console.warn('⚠️ Alle APIs fehlgeschlagen, verwende Luftlinien-Schätzung');
    const luftlinie = berechneLuftlinie(startCoords, zielCoords);
    result = {
      distanzKm: luftlinie * 1.3, // Faktor für Straßenroute
      fahrzeitMinuten: (luftlinie * 1.3 / 60) * 60, // 60 km/h Durchschnitt
      fahrzeitOhneTrafficMinuten: (luftlinie * 1.3 / 60) * 60,
      trafficDelayMinuten: 0
    };
  }

  // Validiere Ergebnis
  const luftlinie = berechneLuftlinie(startCoords, zielCoords);
  if (result.distanzKm > luftlinie * 2.5 || result.distanzKm > 1000) {
    console.warn(`⚠️ Unplausible Distanz ${result.distanzKm.toFixed(0)} km, korrigiere...`);
    result = {
      distanzKm: luftlinie * 1.3,
      fahrzeitMinuten: (luftlinie * 1.3 / 60) * 60,
      fahrzeitOhneTrafficMinuten: (luftlinie * 1.3 / 60) * 60,
      trafficDelayMinuten: 0
    };
  }

  // Cache Ergebnis
  routenCache.set(cacheKey, result);

  // Cache-Bereinigung nach 5 Minuten (für frische Traffic-Daten)
  setTimeout(() => routenCache.delete(cacheKey), 5 * 60 * 1000);

  return result;
};

/**
 * Prüft ob Koordinaten in Deutschland liegen
 */
const isValidGermanCoords = (coords: [number, number]): boolean => {
  const [lon, lat] = coords;
  return lon >= 5 && lon <= 16 && lat >= 47 && lat <= 56;
};

/**
 * Erstellt eine Fallback-Route basierend auf PLZ-Zonen
 */
const createFallbackRoute = (startPLZ: string, zielPLZ: string): RouteResult => {
  const startZone = parseInt(startPLZ.substring(0, 2));
  const zielZone = parseInt(zielPLZ.substring(0, 2));
  const geschaetzteDistanz = Math.max(20, Math.abs(startZone - zielZone) * 50);
  const geschaetzteFahrzeit = (geschaetzteDistanz / 60) * 60; // 60 km/h

  console.log(`📏 Fallback-Schätzung: ${geschaetzteDistanz} km, ${geschaetzteFahrzeit.toFixed(0)} min`);

  return {
    distanzKm: geschaetzteDistanz,
    fahrzeitMinuten: geschaetzteFahrzeit,
    fahrzeitOhneTrafficMinuten: geschaetzteFahrzeit,
    trafficDelayMinuten: 0
  };
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
 * Kann sowohl API-Fahrzeit als auch manuelle Berechnung verwenden
 */
export const berechneFahrzeit = (
  distanz: number,
  durchschnittsgeschwindigkeit: number,
  tatsaechlicheFahrzeitMinuten?: number
): number => {
  // Wenn tatsächliche Fahrzeit verfügbar ist (z.B. von Google mit Traffic), verwende diese
  if (tatsaechlicheFahrzeitMinuten !== undefined) {
    return tatsaechlicheFahrzeitMinuten;
  }

  // Sonst berechne basierend auf Distanz und Geschwindigkeit
  return (distanz / durchschnittsgeschwindigkeit) * 60; // Minuten
};

/**
 * Berechnet die benötigte Pausenzeit basierend auf Fahrzeit
 * EU-Verordnung: 45 Minuten Pause nach 4,5 Stunden Fahrt
 */
export const berechnePausenzeit = (fahrzeitMinuten: number): number => {
  // 45 Minuten Pause alle 4,5 Stunden (270 Minuten)
  const anzahlPausen = Math.floor(fahrzeitMinuten / 270);
  return anzahlPausen * 45; // Minuten
};

/**
 * Berechnet die komplette Routenberechnung für Eigenlieferung
 * Berücksichtigt sowohl Hinweg als auch Rückfahrt
 * Nutzt Google Routes API für präzise Traffic-basierte Zeiten
 */
export const berechneEigenlieferungRoute = async (
  startPLZ: string,
  zielPLZ: string,
  stammdaten: EigenlieferungStammdaten
): Promise<RoutenBerechnung> => {
  console.log(`🚛 Berechne Route für Eigenlieferung: ${startPLZ} → ${zielPLZ} → ${startPLZ}`);

  // Berechne Hinweg (Start → Ziel) mit Traffic
  console.log(`\n📤 === HINWEG ===`);
  const hinwegRoute = await berechneRoute(startPLZ, zielPLZ);
  console.log(`   Distanz: ${hinwegRoute.distanzKm.toFixed(2)} km`);
  console.log(`   Fahrzeit: ${hinwegRoute.fahrzeitMinuten.toFixed(0)} min (inkl. Traffic)`);
  if (hinwegRoute.trafficDelayMinuten > 0) {
    console.log(`   🚗 Traffic-Verzögerung: +${hinwegRoute.trafficDelayMinuten.toFixed(0)} min`);
  }

  // Warte kurz zwischen Anfragen
  await new Promise(resolve => setTimeout(resolve, 100));

  // Berechne Rückweg (Ziel → Start) mit Traffic
  console.log(`\n📥 === RÜCKWEG ===`);
  const rueckwegRoute = await berechneRoute(zielPLZ, startPLZ);
  console.log(`   Distanz: ${rueckwegRoute.distanzKm.toFixed(2)} km`);
  console.log(`   Fahrzeit: ${rueckwegRoute.fahrzeitMinuten.toFixed(0)} min (inkl. Traffic)`);
  if (rueckwegRoute.trafficDelayMinuten > 0) {
    console.log(`   🚗 Traffic-Verzögerung: +${rueckwegRoute.trafficDelayMinuten.toFixed(0)} min`);
  }

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

  // Berechne Pausenzeit für die gesamte Fahrt
  const pausenzeit = berechnePausenzeit(fahrzeit);

  // Berechne Gesamtabladungszeit: Abladungszeit × Anzahl Abladestellen
  const gesamtAbladungszeit = stammdaten.abladungszeit * stammdaten.anzahlAbladestellen;

  // Gesamtzeit = Beladung + Hinweg + Abladung + Rückweg + Pausen
  const gesamtzeit = stammdaten.beladungszeit + fahrzeit + pausenzeit + gesamtAbladungszeit;

  // Berechne Dieselverbrauch für die gesamte Strecke (Hinweg + Rückweg)
  const dieselverbrauch = (distanz / 100) * stammdaten.dieselverbrauchDurchschnitt;

  // Berechne Dieselkosten für die gesamte Strecke
  const dieselkosten = dieselverbrauch * stammdaten.dieselLiterKostenBrutto;

  // Berechne Verschleißkosten basierend auf Verschleißpauschale pro km
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
 * Berücksichtigt sowohl Hinweg als auch Rückfahrt
 * Berechnet Kosten basierend auf Stundenlohn statt Diesel/Verschleiß
 */
export const berechneFremdlieferungRoute = async (
  startPLZ: string,
  zielPLZ: string,
  stammdaten: FremdlieferungStammdaten
): Promise<FremdlieferungRoutenBerechnung> => {
  console.log(`🚚 Berechne Route für Fremdlieferung: ${startPLZ} → ${zielPLZ} → ${startPLZ}`);

  // Berechne Hinweg (Start → Ziel) mit Traffic
  console.log(`\n📤 === HINWEG ===`);
  const hinwegRoute = await berechneRoute(startPLZ, zielPLZ);

  // Warte kurz zwischen Anfragen
  await new Promise(resolve => setTimeout(resolve, 100));

  // Berechne Rückweg (Ziel → Start) mit Traffic
  console.log(`\n📥 === RÜCKWEG ===`);
  const rueckwegRoute = await berechneRoute(zielPLZ, startPLZ);

  // Gesamtwerte
  const distanz = hinwegRoute.distanzKm + rueckwegRoute.distanzKm;
  const hinwegFahrzeit = hinwegRoute.fahrzeitMinuten;
  const rueckwegFahrzeit = rueckwegRoute.fahrzeitMinuten;
  const fahrzeit = hinwegFahrzeit + rueckwegFahrzeit;

  console.log(`\n📊 === ZUSAMMENFASSUNG ===`);
  console.log(`   Gesamtdistanz: ${distanz.toFixed(2)} km`);
  console.log(`   Gesamtfahrzeit: ${fahrzeit.toFixed(0)} min (inkl. Traffic)`);

  // Berechne Pausenzeit für die gesamte Fahrt
  const pausenzeit = berechnePausenzeit(fahrzeit);

  // Berechne Gesamtabladungszeit: Abladungszeit × Anzahl Abladestellen
  const gesamtAbladungszeit = stammdaten.abladungszeit * stammdaten.anzahlAbladestellen;

  // Gesamtzeit = Beladung + Hinweg + Abladung + Rückweg + Pausen
  const gesamtzeit = stammdaten.beladungszeit + fahrzeit + pausenzeit + gesamtAbladungszeit;

  // Berechne Lohnkosten basierend auf Stundenlohn und Gesamtzeit
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
