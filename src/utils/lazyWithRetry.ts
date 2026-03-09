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

          // In Produktion: Seite mit Cache-Busting neu laden um veraltete Chunks zu beheben
          if (!import.meta.env.DEV && typeof window !== 'undefined') {
            const currentUrl = window.location.href;
            const separator = currentUrl.includes('?') ? '&' : '?';
            // Nur einmal pro Session reloaden um Loop zu verhindern
            const reloadKey = 'chunk_reload_attempted';
            if (!sessionStorage.getItem(reloadKey)) {
              sessionStorage.setItem(reloadKey, 'true');
              window.location.href = `${currentUrl}${separator}_cr=${Date.now()}`;
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
