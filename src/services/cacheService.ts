/**
 * Cache-Service für Performance-Optimierung
 * Implementiert kurzzeitiges In-Memory-Caching mit TTL (Time-To-Live)
 * für Echtzeit-Anwendungen mit 1-2 Sekunden Cache-Dauer
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class CacheService {
  private cache = new Map<string, CacheEntry<unknown>>();
  private TTL = 2000; // 2 Sekunden für Echtzeit-Anforderungen

  /**
   * Holt einen Wert aus dem Cache
   * Gibt null zurück wenn der Wert nicht existiert oder abgelaufen ist
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > this.TTL) {
      // Cache ist abgelaufen, lösche ihn
      this.cache.delete(key);
      return null;
    }

    // Cache ist noch gültig
    return entry.data as T;
  }

  /**
   * Speichert einen Wert im Cache
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidiert Cache-Einträge
   * @param pattern - Optional: Nur Einträge die diesen String enthalten
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      // Lösche gesamten Cache
      this.cache.clear();
      return;
    }

    // Lösche nur spezifische Cache-Einträge
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Gibt Statistiken über den Cache zurück (für Debugging)
   */
  getStats(): {
    size: number;
    entries: { key: string; age: number }[];
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Entfernt abgelaufene Cache-Einträge (Cleanup)
   * Sollte gelegentlich aufgerufen werden um Speicher freizugeben
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Ändert die TTL-Dauer (für Tests oder spezielle Anforderungen)
   */
  setTTL(ttl: number): void {
    this.TTL = ttl;
  }

  /**
   * Prüft ob ein Cache-Eintrag existiert und gültig ist
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    if (age > this.TTL) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }
}

// Singleton-Instanz exportieren
export const cacheService = new CacheService();

// Automatisches Cleanup alle 10 Sekunden
if (typeof window !== 'undefined') {
  setInterval(() => {
    const removed = cacheService.cleanup();
    if (removed > 0 && import.meta.env.DEV) {
      console.log(`🧹 Cache cleanup: ${removed} abgelaufene Einträge entfernt`);
    }
  }, 10000);
}
