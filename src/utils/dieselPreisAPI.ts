/**
 * API-Integration für Dieselpreise
 * Unterstützt mehrere Datenquellen:
 * 1. Backend API (wenn VITE_USE_BACKEND=true) - empfohlen, mit Redis-Cache
 * 2. Tankerkoenig API direkt (falls Backend nicht verfügbar)
 * 3. Aktueller deutscher Durchschnittspreis (manuell konfigurierbar) - Fallback
 *
 * OPTIMIERT: Tages-Cache für Dieselpreise (Preise ändern sich nicht stündlich)
 */

import { getKoordinatenFuerPLZ } from '../data/plzKoordinaten';
import { useBackend, backendFetch } from '../config/backend';

const TANKERKOENIG_API_KEY = import.meta.env.VITE_TANKERKOENIG_API_KEY || '';
const TANKERKOENIG_API_BASE_URL = 'https://creativecommons.tankerkoenig.de/json';

// Aktueller deutscher Durchschnittspreis für Diesel (Fallback wenn API nicht verfügbar)
const AKTUELLER_DURCHSCHNITTSPREIS_DIESEL =
  import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS
    ? parseFloat(import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS)
    : 1.55; // €/Liter (Standardwert)

// Backend API Response Interface
interface BackendDieselResponse {
  success: boolean;
  durchschnitt: number;
  minimum?: number;
  maximum?: number;
  stations?: number;
  timestamp?: string;
  error?: string;
}

// === OPTIMIERUNG: TAGES-CACHE FÜR DIESELPREISE ===
// Dieselpreise ändern sich nicht jede Minute - einmal pro Tag reicht
const DIESEL_CACHE_KEY = 'diesel_preise_cache_v1';
const DIESEL_CACHE_DAUER_MS = 24 * 60 * 60 * 1000; // 24 Stunden

interface DieselCacheEntry {
  preis: number;
  timestamp: number;
  plz: string;
}

interface DieselCache {
  [plzRegion: string]: DieselCacheEntry;
}

const loadDieselCache = (): DieselCache => {
  try {
    const cached = localStorage.getItem(DIESEL_CACHE_KEY);
    if (!cached) return {};
    const cache: DieselCache = JSON.parse(cached);
    // Alte Einträge entfernen
    const now = Date.now();
    const cleaned: DieselCache = {};
    for (const [key, entry] of Object.entries(cache)) {
      if (now - entry.timestamp < DIESEL_CACHE_DAUER_MS) {
        cleaned[key] = entry;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
};

const saveDieselCache = (plzRegion: string, preis: number, plz: string) => {
  try {
    const cache = loadDieselCache();
    cache[plzRegion] = { preis, timestamp: Date.now(), plz };
    localStorage.setItem(DIESEL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore localStorage errors
  }
};

const getDieselFromCache = (plz: string): number | null => {
  const cache = loadDieselCache();
  // Verwende 2-stellige PLZ-Region als Cache-Key (Preise in einer Region ähnlich)
  const plzRegion = plz.substring(0, 2);
  const entry = cache[plzRegion];
  if (entry && Date.now() - entry.timestamp < DIESEL_CACHE_DAUER_MS) {
    console.log(`⚡ Dieselpreis aus Cache: ${entry.preis.toFixed(3)} €/L (Region ${plzRegion})`);
    return entry.preis;
  }
  return null;
};

/**
 * Geocodiert eine PLZ zu Koordinaten (für Tankerkönig-API)
 * OPTIMIERT: Nutzt lokale PLZ-Tabelle statt Nominatim API!
 */
const geocodePLZFuerDieselPreis = (plz: string): [number, number] | null => {
  // ZERO API COST: Lokale PLZ-Lookup!
  const coords = getKoordinatenFuerPLZ(plz);
  if (coords) {
    return [coords.lng, coords.lat]; // [lon, lat]
  }
  return null;
};

/**
 * Holt den aktuellen Dieselpreis - primär über Backend, Fallback auf direkte API
 * OPTIMIERT: Backend hat Redis-Cache, Frontend hat localStorage-Cache
 */
export const holeDieselPreis = async (plz: string): Promise<number> => {
  // OPTIMIERUNG 1: Prüfe lokalen Cache zuerst (24h gültig)
  const cachedPreis = getDieselFromCache(plz);
  if (cachedPreis !== null) {
    return cachedPreis;
  }

  // Option 1: Backend API (empfohlen - hat Redis-Cache und versteckten API-Key)
  if (useBackend('diesel')) {
    try {
      console.log(`🔍 Hole Dieselpreis vom Backend für PLZ ${plz}...`);

      const response = await backendFetch<BackendDieselResponse>(
        `/api/geo/diesel-preis/preis?plz=${plz}&radius=15`
      );

      if (response.success && response.durchschnitt > 0) {
        const preis = response.durchschnitt;
        console.log(`✅ Backend: Dieselpreis ${preis.toFixed(3)} €/L (${response.stations || 0} Tankstellen)`);

        // Lokalen Cache aktualisieren
        saveDieselCache(plz.substring(0, 2), preis, plz);

        return preis;
      } else {
        console.warn(`⚠️ Backend: ${response.error || 'Kein Preis erhalten'}`);
        // Fallback auf direkten API-Call
      }
    } catch (error) {
      console.warn('⚠️ Backend nicht erreichbar, versuche direkten API-Call:', error);
      // Fallback auf direkten API-Call
    }
  }

  // Option 2: Direkter Tankerkoenig API Call (falls Backend nicht verfügbar)
  if (TANKERKOENIG_API_KEY) {
    try {
      // Lokales Geocoding (ZERO API COST!)
      const koordinaten = geocodePLZFuerDieselPreis(plz);

      if (!koordinaten) {
        console.warn(`⚠️ Konnte PLZ ${plz} nicht geocodieren, verwende Durchschnittspreis`);
        return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
      }

      const [lon, lat] = koordinaten;

      // Hole Tankstellen-Liste mit aktuellen Preisen
      const radius = 15; // 15 km Radius (erhöht für ländliche Gebiete)
      const apiUrl = `${TANKERKOENIG_API_BASE_URL}/list.php?lat=${lat}&lng=${lon}&rad=${radius}&type=diesel&sort=price&apikey=${TANKERKOENIG_API_KEY}`;

      console.log(`🔍 Hole Dieselpreise direkt von Tankerkönig-API für PLZ ${plz}...`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Tankerkönig API Fehler: ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(`Tankerkönig API Fehler: ${data.message || 'Unbekannt'}`);
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
        const durchschnittspreis = dieselPreise.reduce((sum, preis) => sum + preis, 0) / dieselPreise.length;

        console.log(`✅ Tankerkönig direkt: ${dieselPreise.length} Tankstellen, Durchschnitt: ${durchschnittspreis.toFixed(3)} €/L`);

        // Speichere im lokalen Cache (24h)
        saveDieselCache(plz.substring(0, 2), durchschnittspreis, plz);

        return durchschnittspreis;
      } else {
        console.warn(`⚠️ Keine Tankstellen gefunden für PLZ ${plz}`);
        return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
      }
    } catch (error) {
      console.error('❌ Tankerkönig-API Fehler:', error);
      return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
    }
  }

  // Fallback auf Durchschnittspreis
  console.info(`ℹ️ Keine API verfügbar, verwende Durchschnittspreis: ${AKTUELLER_DURCHSCHNITTSPREIS_DIESEL} €/L`);
  return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
};

/**
 * Validiert ob die Tankerkönig-API verfügbar ist
 */
export const istDieselPreisAPIVerfuegbar = (): boolean => {
  return TANKERKOENIG_API_KEY.length > 0;
};

/**
 * Gibt den aktuell konfigurierten Durchschnittspreis zurück
 * (kann für manuelle Anpassungen verwendet werden)
 */
export const getAktuellerDurchschnittspreis = (): number => {
  return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
};

