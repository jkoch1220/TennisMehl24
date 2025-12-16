/**
 * User Cache Service
 * Speichert User-Informationen im localStorage
 */

export interface CachedUser {
  $id: string;
  name: string;
  email: string;
  labels: string[];
}

const CACHE_KEY = 'tm_user_cache_v2';

/**
 * User im Cache speichern
 */
export const cacheUser = (user: CachedUser): void => {
  if (typeof window === 'undefined') return;
  try {
    const cache = getAllCachedUsers();
    cache[user.$id] = user;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('⚠️ Konnte User nicht cachen:', error);
  }
};

/**
 * Alle User aus dem Cache laden
 */
export const getAllCachedUsers = (): Record<string, CachedUser> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      return JSON.parse(stored) as Record<string, CachedUser>;
    }
  } catch (error) {
    console.warn('⚠️ Konnte User-Cache nicht laden:', error);
  }
  return {};
};

/**
 * User-Liste als Array
 */
export const getCachedUsersList = (): CachedUser[] => {
  return Object.values(getAllCachedUsers());
};

/**
 * User aus Cache entfernen
 */
export const removeUserFromCache = (userId: string): void => {
  if (typeof window === 'undefined') return;
  const cache = getAllCachedUsers();
  delete cache[userId];
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
};

/**
 * Cache leeren
 */
export const clearUserCache = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_KEY);
};



