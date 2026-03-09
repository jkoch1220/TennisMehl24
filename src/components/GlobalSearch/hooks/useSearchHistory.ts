import { useState, useCallback } from 'react';

const STORAGE_KEY = 'tm_global_search_history_v1';
const MAX_HISTORY = 10;

/**
 * Hook für die Suchhistorie (localStorage)
 */
export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const addToHistory = useCallback((query: string) => {
    if (!query.trim() || query.length < 2) return;

    setHistory(prev => {
      // Entferne Duplikate und füge neuen Query vorne ein
      const filtered = prev.filter(q => q.toLowerCase() !== query.toLowerCase());
      const updated = [query, ...filtered].slice(0, MAX_HISTORY);

      // In localStorage speichern
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Konnte Suchhistorie nicht speichern:', e);
      }

      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Konnte Suchhistorie nicht löschen:', e);
    }
  }, []);

  return { history, addToHistory, clearHistory };
}
