/**
 * Fuel Price Service
 *
 * Holt Dieselpreise von TankerKoenig API.
 */

import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';

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

// Cache
const priceCache = new Map<string, { result: FuelPriceResult; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 Stunde

// Fallback
const FALLBACK_DIESEL_PREIS = 1.55;

/**
 * Geocodiert PLZ für TankerKoenig
 */
async function geocodePLZ(plz: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${plz}&countrycodes=de&format=json&limit=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'TennisMehl24-Backend/1.0' },
    });

    if (!response.ok) return null;

    const data = await response.json() as Array<{ lat: string; lon: string }>;

    if (data?.length && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }

    return null;
  } catch {
    return null;
  }
}

export const fuelService = {
  /**
   * Holt Dieselpreis für eine PLZ
   */
  async getDieselPrice(plz: string, radius: number = 10): Promise<FuelPriceResult> {
    const cacheKey = `${plz}-${radius}`;
    const now = Date.now();

    // Cache prüfen
    const cached = priceCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      logger.info(`Fuel: Cache hit für PLZ ${plz}`);
      return cached.result;
    }

    // Kein API Key -> Fallback
    if (!config.TANKERKOENIG_API_KEY) {
      logger.warn('TANKERKOENIG_API_KEY nicht konfiguriert');
      return {
        success: true,
        preis: FALLBACK_DIESEL_PREIS,
        durchschnittspreis: FALLBACK_DIESEL_PREIS,
        quelle: 'fallback',
        timestamp: new Date().toISOString(),
      };
    }

    // Geocodieren
    const coords = await geocodePLZ(plz);

    if (!coords) {
      logger.warn(`Konnte PLZ ${plz} nicht geocodieren`);
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
      const url = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${coords.lat}&lng=${coords.lng}&rad=${radius}&type=diesel&sort=price&apikey=${config.TANKERKOENIG_API_KEY}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`TankerKoenig API Fehler: ${response.status}`);
      }

      const data = await response.json() as {
        ok: boolean;
        message?: string;
        stations?: Array<{
          isOpen: boolean;
          diesel: number | null;
        }>;
      };

      if (!data.ok) {
        throw new Error(data.message || 'TankerKoenig API Fehler');
      }

      // Dieselpreise extrahieren
      const stations = data.stations || [];
      const dieselPreise: number[] = [];

      for (const station of stations) {
        if (station.isOpen && station.diesel && typeof station.diesel === 'number' && station.diesel > 0) {
          dieselPreise.push(station.diesel);
        }
      }

      if (dieselPreise.length > 0) {
        const durchschnittspreis = dieselPreise.reduce((a, b) => a + b, 0) / dieselPreise.length;
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

        // Cachen
        priceCache.set(cacheKey, { result, timestamp: now });

        logger.info(`Fuel: ${dieselPreise.length} Tankstellen für PLZ ${plz}, Durchschnitt: ${durchschnittspreis.toFixed(3)} €/L`);

        return result;
      }

      // Keine Tankstellen gefunden
      return {
        success: true,
        preis: FALLBACK_DIESEL_PREIS,
        durchschnittspreis: FALLBACK_DIESEL_PREIS,
        quelle: 'fallback',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('TankerKoenig Fehler: %s', error instanceof Error ? error.message : String(error));
      return {
        success: true,
        preis: FALLBACK_DIESEL_PREIS,
        durchschnittspreis: FALLBACK_DIESEL_PREIS,
        quelle: 'fallback',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      };
    }
  },
};

export default fuelService;
