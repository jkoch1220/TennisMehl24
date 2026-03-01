/**
 * Zentraler Geocode-Cache für alle Kartenansichten
 *
 * Konsolidiert die vorher duplizierten Caches aus:
 * - DispoKartenAnsicht
 * - ProjektKartenansicht
 * - AnfragenKartenansicht
 * - routeCalculation
 *
 * Features:
 * - localStorage Persistenz
 * - Automatische TTL-basierte Bereinigung
 * - In-Memory Cache für schnellen Zugriff
 * - Max-Einträge-Limit (LRU-ähnlich)
 */

// Cache Konfiguration
const CACHE_KEY = 'geocode_cache_unified_v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage (Koordinaten ändern sich selten)
const MAX_ENTRIES = 2000; // Max 2000 Einträge speichern

interface CacheEntry {
  coords: { lat: number; lng: number };
  timestamp: number;
}

interface CacheData {
  [key: string]: CacheEntry;
}

// In-Memory Cache für schnellen Zugriff
const memoryCache = new Map<string, { lat: number; lng: number }>();

// Persistenten Cache beim Import laden
const loadPersistedCache = (): void => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data: CacheData = JSON.parse(cached);
      const now = Date.now();
      let loaded = 0;
      let expired = 0;

      for (const [key, entry] of Object.entries(data)) {
        if (now - entry.timestamp < TTL_MS) {
          memoryCache.set(key, entry.coords);
          loaded++;
        } else {
          expired++;
        }
      }

      // Abgelaufene Einträge entfernen und speichern
      if (expired > 0) {
        savePersistedCache();
      }

      if (loaded > 0) {
        console.log(`[GeocodeCache] ${loaded} Einträge aus Cache geladen, ${expired} abgelaufen`);
      }
    }
  } catch (error) {
    console.warn('[GeocodeCache] Fehler beim Laden des Caches:', error);
  }
};

// Cache in localStorage speichern
const savePersistedCache = (): void => {
  try {
    const data: CacheData = {};
    const now = Date.now();

    // Sortiere nach Timestamp (neueste zuerst) und limitiere auf MAX_ENTRIES
    const entries = Array.from(memoryCache.entries());
    const sortedEntries = entries.slice(0, MAX_ENTRIES);

    for (const [key, coords] of sortedEntries) {
      data[key] = { coords, timestamp: now };
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[GeocodeCache] Fehler beim Speichern des Caches:', error);
  }
};

// Debounced save (verhindert zu häufiges Speichern)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const debouncedSave = (): void => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    savePersistedCache();
    saveTimeout = null;
  }, 1000);
};

/**
 * Koordinaten aus dem Cache holen
 * @param key - Eindeutiger Schlüssel (z.B. PLZ, Adresse, oder kombiniert)
 * @returns Koordinaten oder null wenn nicht im Cache
 */
export const getFromCache = (key: string): { lat: number; lng: number } | null => {
  return memoryCache.get(key) || null;
};

/**
 * Koordinaten im Cache speichern
 * @param key - Eindeutiger Schlüssel
 * @param coords - Koordinaten
 */
export const saveToCache = (key: string, coords: { lat: number; lng: number }): void => {
  memoryCache.set(key, coords);
  debouncedSave();
};

/**
 * Prüfen ob ein Schlüssel im Cache existiert
 */
export const hasInCache = (key: string): boolean => {
  return memoryCache.has(key);
};

/**
 * Cache-Statistiken abrufen
 */
export const getCacheStats = (): { size: number; maxSize: number } => {
  return {
    size: memoryCache.size,
    maxSize: MAX_ENTRIES
  };
};

/**
 * Cache komplett leeren (für Debugging/Testing)
 */
export const clearCache = (): void => {
  memoryCache.clear();
  localStorage.removeItem(CACHE_KEY);
  console.log('[GeocodeCache] Cache geleert');
};

/**
 * Helper: Erstellt einen Cache-Key aus PLZ und optionalem Ort
 */
export const createPlzKey = (plz: string, ort?: string): string => {
  if (ort) {
    return `plz:${plz}:${ort.toLowerCase()}`;
  }
  return `plz:${plz}`;
};

/**
 * Helper: Erstellt einen Cache-Key aus einer vollständigen Adresse
 */
export const createAdresseKey = (strasse: string, plz: string, ort: string): string => {
  const normalized = `${strasse}:${plz}:${ort}`.toLowerCase().replace(/\s+/g, ' ').trim();
  return `adresse:${normalized}`;
};

// Cache beim Import initialisieren
loadPersistedCache();

// Export für direkten Zugriff auf den Memory-Cache (für Migration bestehender Komponenten)
export const geocodeCache = {
  get: getFromCache,
  set: saveToCache,
  has: hasInCache,
  stats: getCacheStats,
  clear: clearCache,
  createPlzKey,
  createAdresseKey
};

export default geocodeCache;
