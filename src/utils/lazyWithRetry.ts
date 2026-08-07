import { lazy, ComponentType } from 'react';

interface LazyWithRetryOptions {
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Wrapper um React.lazy() der fehlgeschlagene Chunk-Loads automatisch wiederholt.
 * Hilft bei Netzwerkproblemen oder veralteten Chunks nach Deployments.
 *
 * @param importFn - Die dynamische Import-Funktion, z.B. () => import('./Component')
 * @param options - Optionale Konfiguration für Retries
 * @returns Eine lazy-geladene React-Komponente
 *
 * @example
 * // Statt:
 * const MyComponent = lazy(() => import('./MyComponent'));
 *
 * // Verwende:
 * const MyComponent = lazyWithRetry(() => import('./MyComponent'));
 */
/**
 * Zeitstempel des letzten automatischen Chunk-Reloads (sessionStorage).
 *
 * Absichtlich ein Zeitstempel und kein Boolean: Ein reines "schon mal gemacht"-Flag
 * wurde nie zurückgesetzt und hat die Selbsheilung nach dem ERSTEN Reload für den
 * Rest der Sitzung abgeschaltet. Wer lange in der App bleibt, erlebt aber mehrere
 * Deployments — und landete ab dem zweiten auf der Fehlerseite.
 */
const RELOAD_ZEITSTEMPEL_KEY = 'chunk_reload_letzter';

/**
 * Mindestabstand zwischen zwei automatischen Reloads. Eine echte Endlosschleife
 * (Chunk dauerhaft nicht ladbar) feuert sofort wieder und wird dadurch gestoppt;
 * ein späterer Deploy liegt praktisch immer weiter zurück und heilt sich selbst.
 */
const RELOAD_MINDESTABSTAND_MS = 60_000;

/** Darf jetzt automatisch neu geladen werden? Schützt vor Reload-Schleifen. */
const darfNeuLaden = (): boolean => {
  try {
    const letzter = sessionStorage.getItem(RELOAD_ZEITSTEMPEL_KEY);
    if (!letzter) return true;
    const vergangen = Date.now() - Number(letzter);
    return !Number.isFinite(vergangen) || vergangen > RELOAD_MINDESTABSTAND_MS;
  } catch {
    // sessionStorage kann blockiert sein (privater Modus) — dann lieber nicht reloaden
    return false;
  }
};

/** Merkt sich den Reload-Zeitpunkt. */
const merkeReload = (): void => {
  try {
    sessionStorage.setItem(RELOAD_ZEITSTEMPEL_KEY, String(Date.now()));
  } catch {
    // ignorieren
  }
};

export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: LazyWithRetryOptions = {}
): React.LazyExoticComponent<T> {
  const { maxRetries = 2, retryDelay = 1000 } = options;

  return lazy(async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Bei Retry-Versuchen: Warte kurz und logge Warnung
        if (attempt > 0) {
          console.warn(`[lazyWithRetry] Chunk-Laden fehlgeschlagen, Versuch ${attempt}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        const module = await importFn();
        // Erfolgreich geladen -> die Sperre darf keinen kuenftigen Reload blockieren
        try {
          sessionStorage.removeItem(RELOAD_ZEITSTEMPEL_KEY);
        } catch {
          // ignorieren
        }
        return module;
      } catch (error) {
        lastError = error as Error;

        // Prüfe ob es ein Chunk-Load-Fehler ist (diese können wir wiederholen)
        const isChunkLoadError =
          (error as Error)?.message?.includes('Loading chunk') ||
          (error as Error)?.message?.includes('Failed to fetch') ||
          (error as Error)?.message?.includes('dynamically imported module') ||
          (error as Error)?.message?.includes('Importing a module script failed') ||
          (error as Error)?.name === 'ChunkLoadError';

        // Wenn es KEIN Chunk-Fehler ist (z.B. Syntax-Fehler im Modul), sofort werfen
        if (!isChunkLoadError) {
          throw error;
        }

        // Bei letztem Retry: Hard-Reload mit Cache-Busting (nur in Produktion)
        if (attempt === maxRetries) {
          console.error('[lazyWithRetry] Alle Chunk-Load-Versuche fehlgeschlagen:', error);

          // In Produktion: Seite mit Cache-Busting neu laden. Ein fehlender Chunk
          // heißt praktisch immer: seit dem Laden dieses Tabs wurde neu deployt,
          // die alte index.html verweist auf Dateien, die es nicht mehr gibt.
          if (!import.meta.env.DEV && typeof window !== 'undefined') {
            if (darfNeuLaden()) {
              merkeReload();
              const currentUrl = window.location.href;
              const separator = currentUrl.includes('?') ? '&' : '?';
              window.location.href = `${currentUrl}${separator}_cr=${Date.now()}`;
            } else {
              console.error(
                '[lazyWithRetry] Reload vor weniger als 60s bereits versucht – ' +
                  'kein weiterer automatischer Reload (Schleifenschutz).'
              );
            }
          }

          throw error;
        }
      }
    }

    // Sollte nie erreicht werden, aber TypeScript braucht es
    throw lastError || new Error('Unbekannter Chunk-Loading-Fehler');
  });
}

export default lazyWithRetry;
