/**
 * Netlify Function: Fuel Price Service
 *
 * Sicherer Backend-Endpunkt für TankerKoenig API Aufrufe.
 * API-Key wird NIEMALS an den Client exponiert.
 * Cached für 1 Stunde um API-Calls zu minimieren.
 */

import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

// Types
interface FuelPriceResult {
  success: boolean;
  preis?: number;
  guenstigsterPreis?: number;
  durchschnittspreis?: number;
  anzahlTankstellen?: number;
  quelle: 'tankerkoenig' | 'fallback';
  timestamp: string;
  error?: string;
}

interface FuelPriceRequest {
  plz: string;
  radius?: number; // km, default 10
}

// CORS Headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

// Cache für Dieselpreise (1 Stunde TTL)
const priceCache = new Map<string, { result: FuelPriceResult; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 Stunde

// Fallback Durchschnittspreis
const FALLBACK_DIESEL_PREIS = 1.55;

// Rate Limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 30;
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
 * Geocodiert PLZ zu Koordinaten (mit Nominatim)
 */
async function geocodePLZ(plz: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${plz}&countrycodes=de&format=json&limit=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'TennisMehl-Backend/1.0' }
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }

    return null;
  } catch (error) {
    console.warn('Geocodierung fehlgeschlagen:', error);
    return null;
  }
}

/**
 * Holt Dieselpreise von TankerKoenig API
 */
async function holeDieselpreisVonAPI(
  plz: string,
  radius: number,
  apiKey: string
): Promise<FuelPriceResult> {
  // Check Cache zuerst
  const cacheKey = `${plz}-${radius}`;
  const now = Date.now();
  const cached = priceCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    console.log(`Cache hit für PLZ ${plz}`);
    return cached.result;
  }

  // Geocodiere PLZ
  const coords = await geocodePLZ(plz);

  if (!coords) {
    console.warn(`Konnte PLZ ${plz} nicht geocodieren`);
    return {
      success: true,
      preis: FALLBACK_DIESEL_PREIS,
      durchschnittspreis: FALLBACK_DIESEL_PREIS,
      quelle: 'fallback',
      timestamp: new Date().toISOString(),
    };
  }

  try {
    // TankerKoenig API aufrufen
    const apiUrl = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${coords.lat}&lng=${coords.lng}&rad=${radius}&type=diesel&sort=price&apikey=${apiKey}`;

    console.log(`Hole Dieselpreise für PLZ ${plz} (${coords.lat}, ${coords.lng})...`);

    const response = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`TankerKoenig API Fehler: ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`TankerKoenig API Fehler: ${data.message || 'Unbekannt'}`);
    }

    // Extrahiere Dieselpreise von geöffneten Tankstellen
    const stations = data.stations || [];
    const dieselPreise: number[] = [];

    for (const station of stations) {
      if (station.isOpen && station.diesel && typeof station.diesel === 'number' && station.diesel > 0) {
        dieselPreise.push(station.diesel);
      }
    }

    if (dieselPreise.length > 0) {
      const durchschnittspreis = dieselPreise.reduce((sum, p) => sum + p, 0) / dieselPreise.length;
      const guenstigsterPreis = Math.min(...dieselPreise);

      const result: FuelPriceResult = {
        success: true,
        preis: durchschnittspreis,
        guenstigsterPreis,
        durchschnittspreis,
        anzahlTankstellen: dieselPreise.length,
        quelle: 'tankerkoenig',
        timestamp: new Date().toISOString(),
      };

      // Cache speichern
      priceCache.set(cacheKey, { result, timestamp: now });

      console.log(`TankerKoenig: ${dieselPreise.length} Tankstellen, Durchschnitt: ${durchschnittspreis.toFixed(3)} €/L`);

      return result;
    } else {
      console.warn(`Keine Tankstellen mit Dieselpreis für PLZ ${plz} gefunden`);
      return {
        success: true,
        preis: FALLBACK_DIESEL_PREIS,
        durchschnittspreis: FALLBACK_DIESEL_PREIS,
        quelle: 'fallback',
        timestamp: new Date().toISOString(),
      };
    }

  } catch (error) {
    console.error('TankerKoenig API Fehler:', error);
    return {
      success: true,
      preis: FALLBACK_DIESEL_PREIS,
      durchschnittspreis: FALLBACK_DIESEL_PREIS,
      quelle: 'fallback',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
    };
  }
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // GET und POST erlauben
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // API Key (sicher auf Server)
  const apiKey = process.env.TANKERKOENIG_API_KEY;

  // Auth
  const authHeader = event.headers.authorization;
  const userId = authHeader?.replace('Bearer ', '') || 'anonymous';

  // Rate Limiting
  if (!checkRateLimit(userId)) {
    auditLog('RATE_LIMIT_EXCEEDED', userId, { endpoint: 'fuel-price' });
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie.' }),
    };
  }

  try {
    let plz: string;
    let radius: number = 10;

    // Parse Request (GET oder POST)
    if (event.httpMethod === 'GET') {
      plz = event.queryStringParameters?.plz || '';
      radius = parseInt(event.queryStringParameters?.radius || '10') || 10;
    } else {
      const body: FuelPriceRequest = JSON.parse(event.body || '{}');
      plz = body.plz || '';
      radius = body.radius || 10;
    }

    if (!plz) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'PLZ erforderlich' }),
      };
    }

    // Validiere PLZ Format
    if (!/^\d{5}$/.test(plz)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Ungültiges PLZ-Format (5 Ziffern erwartet)' }),
      };
    }

    // Begrenze Radius
    radius = Math.min(Math.max(radius, 1), 25);

    auditLog('FUEL_PRICE_REQUEST', userId, { plz, radius });

    // Wenn API Key vorhanden, hole echte Preise
    if (apiKey) {
      const result = await holeDieselpreisVonAPI(plz, radius, apiKey);

      auditLog('FUEL_PRICE_SUCCESS', userId, {
        plz,
        preis: result.preis,
        quelle: result.quelle,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result),
      };
    } else {
      // Kein API Key - Fallback
      console.warn('TANKERKOENIG_API_KEY nicht konfiguriert, verwende Fallback');

      const result: FuelPriceResult = {
        success: true,
        preis: FALLBACK_DIESEL_PREIS,
        durchschnittspreis: FALLBACK_DIESEL_PREIS,
        quelle: 'fallback',
        timestamp: new Date().toISOString(),
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result),
      };
    }

  } catch (error) {
    console.error('Fuel Price Fehler:', error);
    auditLog('FUEL_PRICE_ERROR', userId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Fehler beim Abrufen des Dieselpreises',
        preis: FALLBACK_DIESEL_PREIS,
        quelle: 'fallback',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
