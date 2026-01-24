/**
 * Netlify Function: Routing & Geocoding Service
 *
 * Sicherer Backend-Endpunkt für Google Maps und OpenRouteService API Aufrufe.
 * API-Keys werden NIEMALS an den Client exponiert.
 */

import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

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
  formattedAddress?: string;
  error?: string;
}

interface RouteRequest {
  action: 'route' | 'geocode' | 'batch-geocode';
  // Für route
  startPLZ?: string;
  zielPLZ?: string;
  // Für geocode
  address?: string;
  plz?: string;
  // Für batch-geocode
  addresses?: string[];
}

// CORS Headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Manuelle Koordinaten für Marktheidenfeld (Fallback)
const START_PLZ = '97828';
const START_COORDS: Coordinates = { lat: 49.85, lng: 9.60 };

// Cache für Geocoding (in Produktion: Redis verwenden)
const geocodeCache = new Map<string, Coordinates>();
const routeCache = new Map<string, { result: RouteResult; timestamp: number }>();
const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minuten

// Rate Limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitStore.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  userLimit.count++;
  return true;
}

// Audit Logging
function auditLog(action: string, userId: string, details: Record<string, any>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    action,
    userId,
    ...details,
  }));
}

/**
 * Geocodiert eine PLZ mit Google Geocoding API
 */
async function geocodeMitGoogle(plz: string, apiKey: string): Promise<Coordinates | null> {
  const cacheKey = `google-${plz}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(plz)},Deutschland&key=${apiKey}&language=de&region=de`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Geocoding Fehler: ${response.status}`);

    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      const coords: Coordinates = { lat: location.lat, lng: location.lng };

      geocodeCache.set(cacheKey, coords);
      return coords;
    }

    return null;
  } catch (error) {
    console.error('Google Geocoding Fehler:', error);
    return null;
  }
}

/**
 * Geocodiert mit Nominatim (OpenStreetMap) als Fallback
 */
async function geocodeMitNominatim(plz: string): Promise<Coordinates | null> {
  const cacheKey = `nominatim-${plz}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${plz}&countrycodes=de&format=json&limit=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'TennisMehl-Backend/1.0' }
    });

    if (!response.ok) throw new Error(`Nominatim Fehler: ${response.status}`);

    const data = await response.json();

    if (data && data.length > 0) {
      const coords: Coordinates = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
      geocodeCache.set(cacheKey, coords);
      return coords;
    }

    return null;
  } catch (error) {
    console.warn('Nominatim Geocoding fehlgeschlagen:', error);
    return null;
  }
}

/**
 * Geocodiert eine PLZ - versucht Google zuerst, dann Nominatim
 */
async function geocodePLZ(plz: string, googleApiKey?: string): Promise<Coordinates | null> {
  // Spezialfall: Start-PLZ hat manuelle Koordinaten
  if (plz === START_PLZ) {
    return START_COORDS;
  }

  // Versuche Google zuerst (genauer)
  if (googleApiKey) {
    const googleResult = await geocodeMitGoogle(plz, googleApiKey);
    if (googleResult) return googleResult;
  }

  // Fallback auf Nominatim
  return await geocodeMitNominatim(plz);
}

/**
 * Berechnet Route mit Google Routes API (inkl. Traffic)
 */
async function berechneRouteMitGoogle(
  startCoords: Coordinates,
  zielCoords: Coordinates,
  apiKey: string
): Promise<RouteResult | null> {
  try {
    const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

    const requestBody = {
      origin: {
        location: {
          latLng: {
            latitude: startCoords.lat,
            longitude: startCoords.lng
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: zielCoords.lat,
            longitude: zielCoords.lng
          }
        }
      },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: false,
      routeModifiers: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: true
      },
      languageCode: 'de-DE',
      units: 'METRIC'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error(`Google Routes API Fehler ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    const distanzKm = route.distanceMeters / 1000;

    const parseDuration = (durationStr: string): number => {
      if (!durationStr) return 0;
      const seconds = parseInt(durationStr.replace('s', ''));
      return seconds / 60;
    };

    const fahrzeitMinuten = parseDuration(route.duration);
    const fahrzeitOhneTrafficMinuten = parseDuration(route.staticDuration);
    const trafficDelayMinuten = Math.max(0, fahrzeitMinuten - fahrzeitOhneTrafficMinuten);

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
}

/**
 * Berechnet Route mit OpenRouteService als Fallback
 */
async function berechneRouteMitOpenRouteService(
  startCoords: Coordinates,
  zielCoords: Coordinates,
  apiKey: string
): Promise<RouteResult | null> {
  try {
    const startParam = `${startCoords.lng},${startCoords.lat}`;
    const endParam = `${zielCoords.lng},${zielCoords.lat}`;

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${startParam}&end=${endParam}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`ORS Fehler: ${response.status}`);

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const segment = data.features[0].properties?.segments?.[0];
      if (segment) {
        const distanzKm = segment.distance / 1000;
        const fahrzeitMinuten = segment.duration / 60;

        return {
          distanzKm,
          fahrzeitMinuten,
          fahrzeitOhneTrafficMinuten: fahrzeitMinuten,
          trafficDelayMinuten: 0
        };
      }
    }

    return null;
  } catch (error) {
    console.error('OpenRouteService Fehler:', error);
    return null;
  }
}

/**
 * Berechnet Luftlinien-Distanz (Haversine)
 */
function berechneLuftlinie(coord1: Coordinates, coord2: Coordinates): number {
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

/**
 * Prüft ob Koordinaten in Deutschland liegen
 */
function isValidGermanCoords(coords: Coordinates): boolean {
  return coords.lng >= 5 && coords.lng <= 16 && coords.lat >= 47 && coords.lat <= 56;
}

/**
 * Hauptfunktion: Berechnet Route zwischen zwei PLZ
 */
async function berechneRoute(
  startPLZ: string,
  zielPLZ: string,
  googleApiKey?: string,
  orsApiKey?: string
): Promise<RouteResult> {
  const cacheKey = `${startPLZ}->${zielPLZ}`;
  const now = Date.now();

  // Check Cache
  const cached = routeCache.get(cacheKey);
  if (cached && now - cached.timestamp < ROUTE_CACHE_TTL_MS) {
    return cached.result;
  }

  // Geocode beide PLZ
  const startCoords = await geocodePLZ(startPLZ, googleApiKey);
  const zielCoords = await geocodePLZ(zielPLZ, googleApiKey);

  if (!startCoords || !zielCoords) {
    // Fallback-Schätzung basierend auf PLZ-Zonen
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

  // Validiere Koordinaten
  if (!isValidGermanCoords(startCoords) || !isValidGermanCoords(zielCoords)) {
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

  // Versuche Google Routes API zuerst
  let result: RouteResult | null = null;

  if (googleApiKey) {
    result = await berechneRouteMitGoogle(startCoords, zielCoords, googleApiKey);
  }

  // Fallback auf OpenRouteService
  if (!result && orsApiKey) {
    result = await berechneRouteMitOpenRouteService(startCoords, zielCoords, orsApiKey);
  }

  // Wenn beide APIs fehlschlagen, Luftlinien-Schätzung
  if (!result) {
    const luftlinie = berechneLuftlinie(startCoords, zielCoords);
    result = {
      distanzKm: luftlinie * 1.3,
      fahrzeitMinuten: (luftlinie * 1.3 / 60) * 60,
      fahrzeitOhneTrafficMinuten: (luftlinie * 1.3 / 60) * 60,
      trafficDelayMinuten: 0
    };
  }

  // Validiere Ergebnis
  const luftlinie = berechneLuftlinie(startCoords, zielCoords);
  if (result.distanzKm > luftlinie * 2.5 || result.distanzKm > 1000) {
    result = {
      distanzKm: luftlinie * 1.3,
      fahrzeitMinuten: (luftlinie * 1.3 / 60) * 60,
      fahrzeitOhneTrafficMinuten: (luftlinie * 1.3 / 60) * 60,
      trafficDelayMinuten: 0
    };
  }

  // Cache Ergebnis
  routeCache.set(cacheKey, { result, timestamp: now });

  return result;
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Nur POST erlauben
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // API Keys (sicher auf Server)
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const orsApiKey = process.env.OPENROUTESERVICE_API_KEY;

  // Auth
  const authHeader = event.headers.authorization;
  const userId = authHeader?.replace('Bearer ', '') || 'anonymous';

  // Rate Limiting
  if (!checkRateLimit(userId)) {
    auditLog('RATE_LIMIT_EXCEEDED', userId, { endpoint: 'routing' });
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie.' }),
    };
  }

  try {
    const request: RouteRequest = JSON.parse(event.body || '{}');

    switch (request.action) {
      case 'route': {
        if (!request.startPLZ || !request.zielPLZ) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'startPLZ und zielPLZ erforderlich' }),
          };
        }

        auditLog('ROUTE_REQUEST', userId, {
          startPLZ: request.startPLZ,
          zielPLZ: request.zielPLZ,
        });

        const result = await berechneRoute(
          request.startPLZ,
          request.zielPLZ,
          googleApiKey,
          orsApiKey
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result),
        };
      }

      case 'geocode': {
        const addressToGeocode = request.address || request.plz;
        if (!addressToGeocode) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'address oder plz erforderlich' }),
          };
        }

        auditLog('GEOCODE_REQUEST', userId, { address: addressToGeocode });

        const coords = await geocodePLZ(addressToGeocode, googleApiKey);

        if (coords) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              coordinates: coords,
            } as GeocodingResult),
          };
        } else {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Adresse konnte nicht geocodiert werden',
            } as GeocodingResult),
          };
        }
      }

      case 'batch-geocode': {
        if (!request.addresses || !Array.isArray(request.addresses)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'addresses Array erforderlich' }),
          };
        }

        auditLog('BATCH_GEOCODE_REQUEST', userId, { count: request.addresses.length });

        const results: GeocodingResult[] = [];

        for (const address of request.addresses.slice(0, 50)) { // Max 50
          const coords = await geocodePLZ(address, googleApiKey);
          if (coords) {
            results.push({ success: true, coordinates: coords });
          } else {
            results.push({ success: false, error: 'Nicht gefunden' });
          }
          // Rate limiting zwischen Anfragen
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(results),
        };
      }

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Ungültige action. Erlaubt: route, geocode, batch-geocode' }),
        };
    }

  } catch (error) {
    console.error('Routing-Fehler:', error);
    auditLog('ROUTING_ERROR', userId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Fehler bei der Routenberechnung',
        details: error instanceof Error ? error.message : 'Unbekannter Fehler',
      }),
    };
  }
};
