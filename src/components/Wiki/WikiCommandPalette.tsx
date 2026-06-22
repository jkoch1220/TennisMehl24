import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, FileText, CornerDownLeft, ArrowUp, ArrowDown, Star, X, Filter } from 'lucide-react';
import {
  WikiPage,
  WikiFile,
  WikiSearchResult,
  WikiCategory,
  WIKI_CATEGORIES,
  getFileTypeCategory,
  FILE_TYPE_CONFIG,
} from '../../types/wiki';
import { searchPagesLocal, searchFilesLocal, wikiFileService } from '../../services/wikiService';

interface WikiCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  pages: WikiPage[];
  favoriteIds: string[];
  onSelectPage: (page: WikiPage, file?: WikiFile) => void;
}

// Text mit hervorgehobenen Suchbegriffen rendern (case-insensitiv, ohne dangerouslySetInnerHTML)
const Highlighted = ({ text, query }: { text: string; query: string }) => {
  const tokens = query.trim().split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return <>{text}</>;

  // Regex aus Tokens bauen (Sonderzeichen escapen)
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 text-inherit rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

const WikiCommandPalette = ({
  isOpen,
  onClose,
  pages,
  favoriteIds,
  onSelectPage,
}: WikiCommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<WikiCategory | 'all'>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [allFiles, setAllFiles] = useState<WikiFile[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Beim Öffnen: zurücksetzen, fokussieren, Dateien einmal laden
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      wikiFileService.getAllFiles().then(setAllFiles).catch(() => setAllFiles([]));
    }
  }, [isOpen]);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Ergebnisse berechnen
  const { pageResults, fileResults } = useMemo(() => {
    if (!isOpen) return { pageResults: [], fileResults: [] };
    const pageRes = searchPagesLocal(pages, debouncedQuery, {
      category: categoryFilter,
      onlyFavorites,
      favoriteIds,
    }).slice(0, 30);
    const fileRes = debouncedQuery.trim()
      ? searchFilesLocal(allFiles, pages, debouncedQuery).slice(0, 10)
      : [];
    return { pageResults: pageRes, fileResults: fileRes };
  }, [isOpen, pages, debouncedQuery, categoryFilter, onlyFavorites, favoriteIds, allFiles]);

  // Flache Liste für Tastatur-Navigation
  const flatResults = useMemo<WikiSearchResult[]>(
    () => [...pageResults, ...fileResults],
    [pageResults, fileResults]
  );

  // Active-Index bei neuen Ergebnissen begrenzen
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, flatResults.length - 1)));
  }, [flatResults.length]);

  const handleSelect = useCallback(
    (result: WikiSearchResult) => {
      onSelectPage(result.page, result.file);
      onClose();
    },
    [onSelectPage, onClose]
  );

  // Tastatur-Steuerung
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = flatResults[activeIndex];
      if (result) handleSelect(result);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Aktives Element in den sichtbaren Bereich scrollen
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector('[data-active="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  const hasActiveFilter = categoryFilter !== 'all' || onlyFavorites;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sucheingabe */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-200 dark:border-slate-700">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Seiten und Dateien durchsuchen…"
            className="flex-1 py-4 bg-transparent border-0 focus:ring-0 outline-none text-base text-gray-900 dark:text-dark-text placeholder-gray-400"
          />
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`p-2 rounded-lg transition-colors ${
              showFilters || hasActiveFilter
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
            title="Filter"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filterleiste */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-600'
              }`}
            >
              Alle
            </button>
            {Object.entries(WIKI_CATEGORIES).map(([key, { label, icon }]) => (
              <button
                key={key}
                onClick={() => setCategoryFilter(key as WikiCategory)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  categoryFilter === key
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-600'
                }`}
              >
                {icon} {label}
              </button>
            ))}
            <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />
            <button
              onClick={() => setOnlyFavorites((f) => !f)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                onlyFavorites
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-600'
              }`}
            >
              <Star className="w-3 h-3" /> Favoriten
            </button>
          </div>
        )}

        {/* Ergebnisliste */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
          {flatResults.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-slate-300">
                {debouncedQuery.trim() ? 'Keine Treffer gefunden' : 'Tippe, um zu suchen…'}
              </p>
            </div>
          ) : (
            <>
              {/* Seiten */}
              {pageResults.length > 0 && (
                <div className="px-2">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Seiten
                  </div>
                  {pageResults.map((result, i) => {
                    const idx = i;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={result.page.$id}
                        data-active={isActive}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                          isActive ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <span className="text-xl flex-shrink-0 mt-0.5">{result.page.icon || '📄'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">
                              <Highlighted text={result.page.title} query={debouncedQuery} />
                            </span>
                            {favoriteIds.includes(result.page.$id!) && (
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500 flex-shrink-0" />
                            )}
                            {result.page.category && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 flex-shrink-0">
                                {WIKI_CATEGORIES[result.page.category]?.label}
                              </span>
                            )}
                          </div>
                          {result.snippet && (
                            <p className="text-xs text-gray-500 dark:text-slate-300 truncate mt-0.5">
                              <Highlighted text={result.snippet} query={debouncedQuery} />
                            </p>
                          )}
                        </div>
                        {isActive && (
                          <CornerDownLeft className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Dateien */}
              {fileResults.length > 0 && (
                <div className="px-2 mt-1">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Dateien
                  </div>
                  {fileResults.map((result, i) => {
                    const idx = pageResults.length + i;
                    const isActive = idx === activeIndex;
                    const config = FILE_TYPE_CONFIG[getFileTypeCategory(result.file!.fileName)];
                    return (
                      <button
                        key={result.file!.$id}
                        data-active={isActive}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                          isActive ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <span
                          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${config.bgColor} ${config.color}`}
                        >
                          {config.label.slice(0, 3).toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">
                            <Highlighted text={result.file!.fileName} query={debouncedQuery} />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-slate-300 truncate mt-0.5">
                            in {result.page.icon} {result.page.title}
                          </p>
                        </div>
                        {isActive && (
                          <CornerDownLeft className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Fußzeile mit Tastatur-Hinweisen */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded">
                <ArrowUp className="w-3 h-3 inline" />
                <ArrowDown className="w-3 h-3 inline" />
              </kbd>
              navigieren
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded">
                <CornerDownLeft className="w-3 h-3 inline" />
              </kbd>
              öffnen
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded">
                Esc
              </kbd>
              schließen
            </span>
          </div>
          <span>{flatResults.length} Treffer</span>
        </div>
      </div>
    </div>
  );
};

export default WikiCommandPalette;
