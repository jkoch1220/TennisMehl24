/**
 * Routing & Geocoding Service
 *
 * Verwendet Google Maps und OpenRouteService für Routing.
 * Nominatim (OpenStreetMap) als Fallback für Geocoding.
 */

import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';

// Types
interface Coordinates {
  lat: number;
  lng: number;
}

interface RouteResult {
  distanzKm: number;
  fahrzeitMinuten: number;
  fahrzeitOhneTrafficMinuten: number;
  trafficDelayMinuten: number;
}

interface GeocodingResult {
  success: boolean;
  coordinates?: Coordinates;
  error?: string;
}

// Cache
const geocodeCache = new Map<string, Coordinates>();
const routeCache = new Map<string, { result: RouteResult; timestamp: number }>();
const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minuten

// Manuelle Koordinaten für Marktheidenfeld
const MARKTHEIDENFELD_COORDS: Coordinates = { lat: 49.85, lng: 9.6 };

/**
 * Geocodiert mit Nominatim (OpenStreetMap)
 */
async function geocodeNominatim(address: string): Promise<Coordinates | null> {
  const cacheKey = `nominatim-${address}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)},Germany&format=json&limit=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'TennisMehl24-Backend/1.0' },
    });

    if (!response.ok) return null;

    const data = await response.json() as Array<{ lat: string; lon: string }>;

    if (data && data.length > 0) {
      const coords: Coordinates = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
      geocodeCache.set(cacheKey, coords);
      return coords;
    }

    return null;
  } catch (error) {
    logger.warn('Nominatim Fehler: %s', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Geocodiert mit Google Maps API
 */
async function geocodeGoogle(address: string): Promise<Coordinates | null> {
  if (!config.GOOGLE_MAPS_API_KEY) return null;

  const cacheKey = `google-${address}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)},Germany&key=${config.GOOGLE_MAPS_API_KEY}&language=de`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json() as {
      status: string;
      results?: Array<{ geometry: { location: { lat: number; lng: number } } }>;
    };

    if (data.status === 'OK' && data.results?.length && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      const coords: Coordinates = { lat: location.lat, lng: location.lng };
      geocodeCache.set(cacheKey, coords);
      return coords;
    }

    return null;
  } catch (error) {
    logger.warn('Google Geocoding Fehler: %s', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Berechnet Route mit Google Routes API
 */
async function calculateGoogleRoute(
  start: Coordinates,
  end: Coordinates
): Promise<RouteResult | null> {
  if (!config.GOOGLE_MAPS_API_KEY) return null;

  try {
    const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: start.lat, longitude: start.lng } } },
        destination: { location: { latLng: { latitude: end.lat, longitude: end.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      routes?: Array<{
        distanceMeters: number;
        duration: string;
        staticDuration: string;
      }>;
    };

    if (!data.routes?.length || data.routes.length === 0) return null;

    const route = data.routes[0];
    const distanzKm = route.distanceMeters / 1000;

    const parseDuration = (str: string): number => {
      if (!str) return 0;
      return parseInt(str.replace('s', '')) / 60;
    };

    const fahrzeitMinuten = parseDuration(route.duration);
    const fahrzeitOhneTrafficMinuten = parseDuration(route.staticDuration);

    return {
      distanzKm,
      fahrzeitMinuten,
      fahrzeitOhneTrafficMinuten,
      trafficDelayMinuten: Math.max(0, fahrzeitMinuten - fahrzeitOhneTrafficMinuten),
    };
  } catch (error) {
    logger.warn('Google Routes Fehler: %s', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Berechnet Route mit OpenRouteService
 */
async function calculateORSRoute(
  start: Coordinates,
  end: Coordinates
): Promise<RouteResult | null> {
  if (!config.OPENROUTESERVICE_API_KEY) return null;

  try {
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${config.OPENROUTESERVICE_API_KEY}&start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json() as {
      features?: Array<{
        properties?: {
          segments?: Array<{ distance: number; duration: number }>;
        };
      }>;
    };

    if (data.features?.length && data.features.length > 0) {
      const segment = data.features[0].properties?.segments?.[0];
      if (segment) {
        const distanzKm = segment.distance / 1000;
        const fahrzeitMinuten = segment.duration / 60;

        return {
          distanzKm,
          fahrzeitMinuten,
          fahrzeitOhneTrafficMinuten: fahrzeitMinuten,
          trafficDelayMinuten: 0,
        };
      }
    }

    return null;
  } catch (error) {
    logger.warn('ORS Fehler: %s', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Berechnet Luftlinie (Haversine)
 */
function calculateHaversine(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371;
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLon = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const routingService = {
  /**
   * Geocodiert eine Adresse
   */
  async geocode(address: string): Promise<GeocodingResult> {
    // Spezialfall: Marktheidenfeld
    if (address.includes('97828') || address.toLowerCase().includes('marktheidenfeld')) {
      return { success: true, coordinates: MARKTHEIDENFELD_COORDS };
    }

    // Google zuerst, dann Nominatim
    let coords = await geocodeGoogle(address);
    if (!coords) {
      coords = await geocodeNominatim(address);
    }

    if (coords) {
      return { success: true, coordinates: coords };
    }

    return { success: false, error: 'Adresse nicht gefunden' };
  },

  /**
   * Batch-Geocoding
   */
  async batchGeocode(addresses: string[]): Promise<GeocodingResult[]> {
    const results: GeocodingResult[] = [];

    for (const address of addresses) {
      const result = await this.geocode(address);
      results.push(result);
      // Rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }

    return results;
  },

  /**
   * Berechnet Route zwischen zwei PLZ
   */
  async calculateRoute(startPLZ: string, zielPLZ: string): Promise<RouteResult> {
    const cacheKey = `${startPLZ}->${zielPLZ}`;
    const now = Date.now();

    // Cache prüfen
    const cached = routeCache.get(cacheKey);
    if (cached && now - cached.timestamp < ROUTE_CACHE_TTL_MS) {
      return cached.result;
    }

    // Geocodieren
    const startResult = await this.geocode(startPLZ);
    const endResult = await this.geocode(zielPLZ);

    if (!startResult.coordinates || !endResult.coordinates) {
      // Fallback-Schätzung
      const startZone = parseInt(startPLZ.substring(0, 2));
      const zielZone = parseInt(zielPLZ.substring(0, 2));
      const geschaetzteDistanz = Math.max(20, Math.abs(startZone - zielZone) * 50);
      const geschaetzteFahrzeit = (geschaetzteDistanz / 60) * 60;

      return {
        distanzKm: geschaetzteDistanz,
        fahrzeitMinuten: geschaetzteFahrzeit,
        fahrzeitOhneTrafficMinuten: geschaetzteFahrzeit,
        trafficDelayMinuten: 0,
      };
    }

    // Route berechnen
    let result = await calculateGoogleRoute(startResult.coordinates, endResult.coordinates);

    if (!result) {
      result = await calculateORSRoute(startResult.coordinates, endResult.coordinates);
    }

    if (!result) {
      // Luftlinien-Fallback
      const luftlinie = calculateHaversine(startResult.coordinates, endResult.coordinates);
      result = {
        distanzKm: luftlinie * 1.3,
        fahrzeitMinuten: ((luftlinie * 1.3) / 60) * 60,
        fahrzeitOhneTrafficMinuten: ((luftlinie * 1.3) / 60) * 60,
        trafficDelayMinuten: 0,
      };
    }

    // Cachen
    routeCache.set(cacheKey, { result, timestamp: now });

    logger.info(`Route ${startPLZ} → ${zielPLZ}: ${result.distanzKm.toFixed(1)}km`);

    return result;
  },
};

export default routingService;
