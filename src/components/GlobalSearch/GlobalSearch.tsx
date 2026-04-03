import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Clock, X, ArrowRight } from 'lucide-react';
import { useGlobalSearch } from './hooks/useGlobalSearch';
import { useSearchHistory } from './hooks/useSearchHistory';
import { SearchResult, CATEGORY_LABELS, CATEGORY_ORDER } from './types';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Spotlight-Style globale Suche
 *
 * Sucht parallel in:
 * - Tools & Navigation (instant, lokal)
 * - Projekte (Appwrite, 300ms debounce)
 * - Kunden/Vereine (Appwrite)
 * - Debitoren (Appwrite)
 * - Anfragen (Appwrite)
 */
export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    groupedResults,
    allResults,
    isLoading,
    handleKeyDown,
  } = useGlobalSearch();

  const { history, addToHistory } = useSearchHistory();

  // Auto-Focus beim Öffnen
  useEffect(() => {
    if (isOpen) {
      // Kleiner Delay damit das Modal erst gerendert wird
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll zum ausgewählten Ergebnis
  useEffect(() => {
    if (resultsRef.current && selectedIndex >= 0) {
      const items = resultsRef.current.querySelectorAll('[data-search-item]');
      const selected = items[selectedIndex] as HTMLElement | undefined;
      selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Ergebnis auswählen
  const handleSelect = useCallback(
    (result: SearchResult) => {
      addToHistory(query);
      onClose();
      setQuery('');
      navigate(result.href);
    },
    [query, addToHistory, onClose, setQuery, navigate]
  );

  // Keyboard-Events
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const result = handleKeyDown(e);
      if (result && e.key === 'Enter') {
        handleSelect(result);
      }
    },
    [handleKeyDown, handleSelect]
  );

  // Click außerhalb schließt
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Historie-Query laden
  const loadHistoryQuery = useCallback(
    (q: string) => {
      setQuery(q);
      inputRef.current?.focus();
    },
    [setQuery]
  );

  if (!isOpen) return null;

  // Kategorien mit Ergebnissen zählen
  let currentIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-50"
        onClick={handleBackdropClick}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-[5%] sm:top-[15%] -translate-x-1/2 w-[calc(100%-2rem)] max-w-[640px] bg-white dark:bg-[#2d2d2f] rounded-2xl shadow-2xl z-50 overflow-hidden border border-gray-200/50 dark:border-white/10">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200/80 dark:border-white/10">
          <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Suchen nach Tools, Projekten, Kunden..."
            className="flex-1 bg-transparent text-[17px] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {isLoading && (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
          )}
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          className="max-h-[50vh] sm:max-h-[400px] overflow-y-auto overscroll-contain"
        >
          {/* Ergebnisse nach Kategorie */}
          {CATEGORY_ORDER.map((category) => {
            const results = groupedResults.get(category);
            if (!results || results.length === 0) return null;

            const categoryStartIndex = currentIndex;
            currentIndex += results.length;

            return (
              <div key={category} className="py-2">
                {/* Kategorie-Header */}
                <div className="px-4 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {CATEGORY_LABELS[category]}
                </div>

                {/* Ergebnisse */}
                {results.map((result, idx) => {
                  const globalIndex = categoryStartIndex + idx;
                  const isSelected = globalIndex === selectedIndex;
                  const Icon = result.icon;

                  return (
                    <button
                      key={result.id}
                      data-search-item
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      {/* Icon */}
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                          isSelected
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {Icon && <Icon className="w-4 h-4" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-medium truncate ${
                              isSelected
                                ? 'text-blue-900 dark:text-blue-100'
                                : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {result.title}
                          </span>
                          {result.badge && (
                            <span
                              className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                result.badge.color === 'green'
                                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                  : result.badge.color === 'amber'
                                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                                  : result.badge.color === 'red'
                                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                  : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                              }`}
                            >
                              {result.badge.text}
                            </span>
                          )}
                        </div>
                        {(result.subtitle || result.description) && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {result.subtitle}
                            {result.subtitle && result.description && ' · '}
                            {result.description}
                          </div>
                        )}
                      </div>

                      {/* Arrow */}
                      {isSelected && (
                        <ArrowRight className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Keine Ergebnisse */}
          {query.length >= 2 && !isLoading && allResults.length === 0 && (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>Keine Ergebnisse für "{query}"</p>
            </div>
          )}

          {/* Suchhistorie (wenn keine Query) */}
          {!query && history.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Letzte Suchen
              </div>
              {history.slice(0, 5).map((q) => (
                <button
                  key={q}
                  onClick={() => loadHistoryQuery(q)}
                  className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-gray-700 dark:text-gray-300">{q}</span>
                </button>
              ))}
            </div>
          )}

          {/* Leerer Zustand */}
          {!query && history.length === 0 && (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>Tippe um zu suchen</p>
              <p className="text-sm mt-1">Tools, Projekte, Kunden, Debitoren...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-200/80 dark:border-white/10 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
          <div className="hidden sm:flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">↑</kbd>
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">↓</kbd>
              navigieren
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">↵</kbd>
              öffnen
            </span>
          </div>
          <span className="sm:ml-0 ml-auto">
            {allResults.length} Ergebnis{allResults.length !== 1 ? 'se' : ''}
          </span>
        </div>
      </div>
    </>
  );
}

export default GlobalSearch;
