import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Menu, LogOut, Settings, Search, X, Command, CheckSquare, LayoutDashboard, ClipboardList } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import VorschlagButton from './Tickets/VorschlagButton';
import { ALL_TOOLS } from '../constants/tools';
import { useAuth } from '../contexts/AuthContext';
import { filterAllowedTools } from '../services/permissionsService';
import PasswordChange from './Settings/PasswordChange';
import UserManagement from './Settings/UserManagement';
import ThemeToggle from './ThemeToggle';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tools' | 'password' | 'users'>('tools');
  const [toolSearchQuery, setToolSearchQuery] = useState('');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const globalSearchInputRef = useRef<HTMLInputElement>(null);
  const globalSearchRef = useRef<HTMLDivElement>(null);
  const { user, logout: authLogout, isAdmin, permissionsLoading } = useAuth();
  
  // Tools basierend auf User-Berechtigungen filtern (nur wenn Permissions geladen)
  const enabledTools = permissionsLoading ? [] : filterAllowedTools(user, ALL_TOOLS);
  
  // Local visibility settings (zusätzlich zur Permission-basierten Filterung)
  const [localVisibility, setLocalVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('tm_local_tool_visibility_v1');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const setToolVisibility = (toolId: string, visible: boolean) => {
    const newVisibility = { ...localVisibility, [toolId]: visible };
    setLocalVisibility(newVisibility);
    localStorage.setItem('tm_local_tool_visibility_v1', JSON.stringify(newVisibility));
  };

  const resetVisibility = () => {
    setLocalVisibility({});
    localStorage.removeItem('tm_local_tool_visibility_v1');
  };

  // Nur Tools anzeigen die sowohl erlaubt als auch lokal sichtbar sind
  const visibleTools = enabledTools.filter(tool => localVisibility[tool.id] !== false);

  // Tools basierend auf Suchbegriff filtern (für Settings)
  const filteredTools = enabledTools.filter((tool) => {
    if (!toolSearchQuery.trim()) return true;
    const query = toolSearchQuery.toLowerCase();
    return (
      tool.name.toLowerCase().includes(query) ||
      tool.description.toLowerCase().includes(query) ||
      tool.id.toLowerCase().includes(query)
    );
  });

  // Tools für globale Suche filtern und priorisieren
  const globalSearchResults = (() => {
    if (!globalSearchQuery.trim()) return [];
    const query = globalSearchQuery.toLowerCase();
    
    // Filtere Tools die den Suchbegriff enthalten
    const matchingTools = enabledTools.filter((tool) => {
      const nameLower = tool.name.toLowerCase();
      const descLower = tool.description.toLowerCase();
      const idLower = tool.id.toLowerCase();
      
      return (
        nameLower.includes(query) ||
        descLower.includes(query) ||
        idLower.includes(query)
      );
    });
    
    // Sortiere nach Priorität: Titel-Matches vor Beschreibungs-Matches
    return matchingTools.sort((a, b) => {
      const queryLower = query.toLowerCase();
      const aNameLower = a.name.toLowerCase();
      const bNameLower = b.name.toLowerCase();
      
      // Berechne Score für jedes Tool
      const getScore = (tool: typeof a) => {
        const nameLower = tool.name.toLowerCase();
        const descLower = tool.description.toLowerCase();
        
        // Titel beginnt mit Suchbegriff: höchste Priorität
        if (nameLower.startsWith(queryLower)) return 3;
        // Titel enthält Suchbegriff: hohe Priorität
        if (nameLower.includes(queryLower)) return 2;
        // Beschreibung enthält Suchbegriff: niedrigere Priorität
        if (descLower.includes(queryLower)) return 1;
        // ID enthält Suchbegriff: niedrigste Priorität
        return 0.5;
      };
      
      const scoreA = getScore(a);
      const scoreB = getScore(b);
      
      // Sortiere nach Score (höher = weiter oben)
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      
      // Bei gleichem Score: alphabetisch nach Name
      return aNameLower.localeCompare(bNameLower);
    });
  })();

  // Startseite auch in Suchergebnissen anzeigen
  const allSearchResults = [
    ...(globalSearchQuery.trim() && 'startseite'.includes(globalSearchQuery.toLowerCase()) 
      ? [{ name: 'Startseite', href: '/', icon: Home, id: 'home', description: 'Zurück zur Startseite' }]
      : []),
    ...globalSearchResults
  ];

  // Keyboard shortcut für globale Suche (Cmd/Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Globale Suche öffnen
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !settingsOpen) {
        e.preventDefault();
        setGlobalSearchOpen(true);
        setTimeout(() => globalSearchInputRef.current?.focus(), 50);
      }
      // ESC zum Schließen
      if (e.key === 'Escape' && globalSearchOpen) {
        setGlobalSearchOpen(false);
        setGlobalSearchQuery('');
      }
      // Settings-Suche
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && settingsOpen && activeTab === 'tools') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen, activeTab, globalSearchOpen]);

  // Klick außerhalb schließt globale Suche
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Prüfe ob das Ziel ein Link innerhalb des Dropdowns ist
      if (target.closest('a') && globalSearchRef.current?.contains(target)) {
        return; // Ignoriere Klicks auf Links innerhalb des Dropdowns
      }
      if (globalSearchRef.current && !globalSearchRef.current.contains(target)) {
        setGlobalSearchOpen(false);
        setGlobalSearchQuery('');
      }
    };
    if (globalSearchOpen) {
      // Verwende 'click' statt 'mousedown' für bessere Kompatibilität mit Links
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [globalSearchOpen]);

  // Suche zurücksetzen wenn Tab gewechselt wird
  useEffect(() => {
    if (activeTab !== 'tools') {
      setToolSearchQuery('');
    } else if (settingsOpen && activeTab === 'tools') {
      // Fokus auf Suchfeld setzen wenn Tools-Tab aktiviert wird
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [activeTab, settingsOpen]);

  // Hilfsfunktion zum Highlighten von Suchergebnissen
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-yellow-200 text-gray-900 dark:text-dark-text">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Handler für Enter-Taste - öffnet das erste Ergebnis
  const handleGlobalSearchEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && allSearchResults.length > 0) {
      e.preventDefault();
      const firstResult = allSearchResults[0];
      navigate(firstResult.href);
      setGlobalSearchOpen(false);
      setGlobalSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authLogout();
      window.location.reload();
    } catch (error) {
      console.error('Logout Fehler:', error);
    }
  };

  const navigation = [
    { name: 'Startseite', href: '/', icon: Home },
    ...visibleTools.map((tool) => ({
      name: tool.name,
      href: tool.href,
      icon: tool.icon,
      id: tool.id,
    })),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface transition-colors duration-300">
      {/* Navigation */}
      <nav className="bg-white dark:bg-dark-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center min-h-[72px] py-3">
            <div className="flex items-center flex-1 min-w-0">
              <div className="flex-shrink-0 flex items-center mr-6 lg:mr-8">
                <Link to="/">
                  <h1 className="text-2xl font-bold text-red-600 whitespace-nowrap cursor-pointer hover:text-red-700 transition-colors">
                    TennisMehl24
                  </h1>
                </Link>
              </div>
              {/* Globale Suchleiste */}
              <div className="hidden lg:flex items-center flex-1 min-w-0 mr-4">
                <div className="relative w-full max-w-md" ref={globalSearchRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      ref={globalSearchInputRef}
                      type="text"
                      value={globalSearchQuery}
                      onChange={(e) => {
                        setGlobalSearchQuery(e.target.value);
                        setGlobalSearchOpen(true);
                      }}
                      onFocus={() => setGlobalSearchOpen(true)}
                      onKeyDown={handleGlobalSearchEnter}
                      placeholder="Tools suchen... (⌘K)"
                      className="w-full pl-10 pr-20 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors duration-200"
                    />
                    {globalSearchQuery && (
                      <button
                        onClick={() => {
                          setGlobalSearchQuery('');
                          setGlobalSearchOpen(false);
                        }}
                        className="absolute right-10 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:text-dark-textMuted"
                        aria-label="Suche zurücksetzen"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-300 border border-gray-200 dark:border-dark-border">
                      <Command className="w-3 h-3" />
                      <span>K</span>
                    </div>
                  </div>

                  {/* Dropdown mit Suchergebnissen */}
                  {globalSearchOpen && globalSearchQuery.trim() && (
                    <div className="absolute top-full mt-2 w-full bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-dark-border z-50">
                      {allSearchResults.length > 0 ? (
                        <div className="p-2">
                          {allSearchResults.map((item, index) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.href;
                            const isFirst = index === 0;
                            return (
                              <Link
                                key={item.id}
                                to={item.href}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGlobalSearchOpen(false);
                                  setGlobalSearchQuery('');
                                }}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                                  isActive
                                    ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800'
                                    : isFirst
                                    ? 'bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-2 border-transparent'
                                }`}
                              >
                                <div className={`p-2 rounded-lg bg-gradient-to-br ${
                                  item.id === 'home' 
                                    ? 'from-gray-500 to-gray-600' 
                                    : (item as any).color || 'from-gray-500 to-gray-600'
                                } text-white flex-shrink-0`}>
                                  <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-gray-900 dark:text-dark-text">
                                    {highlightText(item.name, globalSearchQuery)}
                                  </div>
                                  {(item as any).description && (
                                    <div className="text-sm text-gray-600 dark:text-dark-textMuted">
                                      {highlightText((item as any).description, globalSearchQuery)}
                                    </div>
                                  )}
                                </div>
                                {isActive && (
                                  <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                                )}
                                {isFirst && !isActive && (
                                  <div className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                                    <span>Enter</span>
                                  </div>
                                )}
                              </Link>
                            );
                          })}
                          {allSearchResults.length > 0 && (
                            <div className="px-4 py-2 border-t border-gray-100 dark:border-dark-border text-xs text-gray-500 dark:text-dark-textMuted">
                              <span className="inline-flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700">Enter</kbd>
                                <span>zum Öffnen</span>
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-8 text-center">
                          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700">
                            <Search className="w-6 h-6 text-gray-400" />
                          </div>
                          <p className="text-gray-600 dark:text-dark-textMuted">Keine Ergebnisse gefunden</p>
                          <p className="text-sm text-gray-500 dark:text-dark-textMuted">Versuche es mit einem anderen Suchbegriff</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="hidden lg:flex items-center flex-1 overflow-x-auto scrollbar-hide -mx-2 px-2">
                <div className="flex items-center gap-1 xl:gap-2">
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={`inline-flex items-center px-3 xl:px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all whitespace-nowrap ${
                          isActive
                            ? 'border-red-500 dark:border-red-600 text-gray-900 dark:text-dark-text bg-red-50 dark:bg-red-900/20'
                            : 'border-transparent text-gray-600 dark:text-dark-textMuted hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-dark-text hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
              {/* Tablet Navigation - Kompakter */}
              <div className="hidden sm:flex lg:hidden items-center gap-2 flex-1 min-w-0">
                {/* Tablet Suchleiste */}
                <div className="relative flex-1 max-w-xs mr-2" ref={globalSearchRef}>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      value={globalSearchQuery}
                      onChange={(e) => {
                        setGlobalSearchQuery(e.target.value);
                        setGlobalSearchOpen(true);
                      }}
                      onFocus={() => setGlobalSearchOpen(true)}
                      onKeyDown={handleGlobalSearchEnter}
                      placeholder="Suchen..."
                      className="w-full pl-8 pr-8 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors duration-200"
                    />
                    {globalSearchQuery && (
                      <button
                        onClick={() => {
                          setGlobalSearchQuery('');
                          setGlobalSearchOpen(false);
                        }}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-dark-textMuted"
                        aria-label="Suche zurücksetzen"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Tablet Dropdown */}
                  {globalSearchOpen && globalSearchQuery.trim() && (
                    <div className="absolute top-full mt-1 w-full bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-dark-border z-50">
                      {allSearchResults.length > 0 ? (
                        <div className="p-1">
                          {allSearchResults.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.href;
                            return (
                              <Link
                                key={item.id}
                                to={item.href}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGlobalSearchOpen(false);
                                  setGlobalSearchQuery('');
                                }}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                }}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                                  isActive
                                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                              >
                                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${
                                  item.id === 'home' 
                                    ? 'from-gray-500 to-gray-600' 
                                    : (item as any).color || 'from-gray-500 to-gray-600'
                                } text-white flex-shrink-0`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 dark:text-dark-text">
                                    {highlightText(item.name, globalSearchQuery)}
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-gray-600 dark:text-dark-textMuted">Keine Ergebnisse</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-2 px-2">
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={`inline-flex items-center px-2 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                          isActive
                            ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                            : 'text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                        title={item.name}
                      >
                        <Icon className="w-4 h-4" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              {/* User Avatar als Settings Button */}
              <button
                onClick={() => setSettingsOpen(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200"
                title="Einstellungen öffnen"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="hidden lg:flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-dark-textMuted">Angemeldet als</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                    {user?.name}
                    {isAdmin && <span className="ml-1 text-xs text-orange-600 dark:text-orange-400">👑</span>}
                  </span>
                </div>
                <Settings className="w-4 h-4 text-gray-400 dark:text-gray-300" />
              </button>
              
              {/* Theme Toggle - ganz rechts */}
              <ThemeToggle />
              
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 dark:text-dark-textMuted hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden">
            {/* Mobile User Info */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-dark-textMuted">Angemeldet als</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                      {user?.name}
                      {isAdmin && <span className="ml-1 text-xs text-orange-600 dark:text-orange-400">👑 Admin</span>}
                    </span>
                  </div>
                </div>
                {/* Mobile Theme Toggle */}
                <ThemeToggle />
              </div>
            </div>

            {/* Mobile Suchleiste */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={globalSearchQuery}
                  onChange={(e) => {
                    setGlobalSearchQuery(e.target.value);
                    setGlobalSearchOpen(true);
                  }}
                  onFocus={() => setGlobalSearchOpen(true)}
                  onKeyDown={handleGlobalSearchEnter}
                  placeholder="Tools suchen..."
                  className="w-full pl-10 pr-10 py-2.5 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors duration-200"
                />
                {globalSearchQuery && (
                  <button
                    onClick={() => {
                      setGlobalSearchQuery('');
                      setGlobalSearchOpen(false);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:text-dark-textMuted"
                    aria-label="Suche zurücksetzen"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Mobile Dropdown mit Suchergebnissen */}
              {globalSearchOpen && globalSearchQuery.trim() && (
                <div className="absolute left-4 right-4 top-full mt-2 bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-dark-border z-50">
                  {allSearchResults.length > 0 ? (
                    <div className="p-2">
                      {allSearchResults.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        return (
                          <Link
                            key={item.id}
                            to={item.href}
                            onClick={() => {
                              setGlobalSearchOpen(false);
                              setGlobalSearchQuery('');
                              setMobileMenuOpen(false);
                            }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                              isActive
                                ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-2 border-transparent'
                            }`}
                          >
                            <div className={`p-2 rounded-lg bg-gradient-to-br ${
                              item.id === 'home' 
                                ? 'from-gray-500 to-gray-600' 
                                : (item as any).color || 'from-gray-500 to-gray-600'
                            } text-white flex-shrink-0`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-900 dark:text-dark-text">
                                {highlightText(item.name, globalSearchQuery)}
                              </div>
                              {(item as any).description && (
                                <div className="text-sm text-gray-600 dark:text-dark-textMuted">
                                  {highlightText((item as any).description, globalSearchQuery)}
                                </div>
                              )}
                            </div>
                            {isActive && (
                              <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700">
                        <Search className="w-5 h-5 text-gray-400" />
                      </div>
                      <p className="text-gray-600 dark:text-dark-textMuted">Keine Ergebnisse</p>
                      <p className="text-xs text-gray-500 dark:text-dark-textMuted">Versuche einen anderen Begriff</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="pt-2 pb-3 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center pl-3 pr-4 py-2 border-l-4 text-base font-medium transition-colors duration-300 ${
                      isActive
                        ? 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-700 dark:text-red-400'
                        : 'border-transparent text-gray-500 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-dark-text'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    {item.name}
                  </Link>
                );
              })}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSettingsOpen(true);
                }}
                className="flex items-center pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-500 dark:text-dark-textMuted"
              >
                <Settings className="w-5 h-5 mr-3" />
                Einstellungen
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content - mit bottom padding für mobile Bottom-Nav */}
      <main className="pb-20 sm:pb-0">{children}</main>

      {/* Mobile Bottom Navigation - nur auf Mobile sichtbar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border sm:hidden z-40 safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {/* Home */}
          <Link
            to="/"
            className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors ${
              location.pathname === '/'
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <Home className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Start</span>
          </Link>

          {/* TODOs - wichtigstes Tool */}
          <Link
            to="/todos"
            className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors ${
              location.pathname === '/todos'
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <CheckSquare className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">TODOs</span>
          </Link>

          {/* Dashboard */}
          <Link
            to="/dashboard"
            className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors ${
              location.pathname === '/dashboard'
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <LayoutDashboard className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Dashboard</span>
          </Link>

          {/* Alle Tools */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center flex-1 h-full py-2 text-gray-500 dark:text-gray-400"
          >
            <ClipboardList className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Mehr</span>
          </button>

          {/* Einstellungen */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex flex-col items-center justify-center flex-1 h-full py-2 text-gray-500 dark:text-gray-400"
          >
            <Settings className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Settings</span>
          </button>
        </div>
      </nav>

      {/* Footer - nicht auf Dashboard-Seite anzeigen */}
      {location.pathname !== '/dashboard' && (
        <footer className="bg-white dark:bg-dark-surface">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-gray-500 dark:text-dark-textMuted">
              © 2026 TennisMehl24 - Kalkulationstools
            </p>
          </div>
        </footer>
      )}

      {/* Global Vorschlag Button - nicht auf TODOs und Dashboard-Seite anzeigen */}
      {location.pathname !== '/todos' && location.pathname !== '/dashboard' && <VorschlagButton />}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4 sm:py-6 lg:px-8">
          <div
            className="absolute inset-0 bg-black bg-opacity-40 backdrop-blur-sm"
            onClick={() => {
              setSettingsOpen(false);
              setActiveTab('tools');
            }}
          />
          <div className="relative bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-lg shadow-xl dark:shadow-dark-xl border border-gray-200 dark:border-dark-border sm:max-w-4xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-hidden mobile-modal-enter">
            {/* Mobile Drag Handle */}
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            <div className="flex justify-between items-start p-4 sm:p-6 sm:mb-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text">Settings</h2>
                <p className="text-sm sm:text-base text-gray-600 dark:text-dark-textMuted">
                  Einstellungen und Verwaltung
                </p>
              </div>
              <button
                onClick={() => {
                  setSettingsOpen(false);
                  setActiveTab('tools');
                }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-dark-textMuted dark:hover:text-dark-text transition-colors duration-200 touch-target"
                aria-label="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs - horizontal scrollbar auf Mobile */}
            <div className="flex gap-1 sm:gap-2 border-b border-gray-200 dark:border-dark-border px-4 sm:px-6 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveTab('tools')}
                className={`flex-shrink-0 px-3 sm:px-4 py-2.5 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === 'tools'
                    ? 'border-red-500 text-red-600 dark:text-red-400'
                    : 'border-transparent text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text'
                }`}
              >
                Tools
              </button>
              <button
                onClick={() => setActiveTab('password')}
                className={`flex-shrink-0 px-3 sm:px-4 py-2.5 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === 'password'
                    ? 'border-red-500 text-red-600 dark:text-red-400'
                    : 'border-transparent text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text'
                }`}
              >
                Passwort
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('users')}
                  className={`flex-shrink-0 px-3 sm:px-4 py-2.5 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${
                    activeTab === 'users'
                      ? 'border-red-500 text-red-600 dark:text-red-400'
                      : 'border-transparent text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text'
                  }`}
                >
                  Benutzer
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 max-h-[60vh] sm:max-h-[65vh]">
              {activeTab === 'tools' && (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-dark-textMuted">
                    Tools ein- und ausblenden
                  </p>

                  {/* Suchfeld */}
                  <div className="relative mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={toolSearchQuery}
                        onChange={(e) => setToolSearchQuery(e.target.value)}
                        placeholder="Tools suchen..."
                        className="w-full pl-9 sm:pl-10 pr-10 py-2.5 sm:py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors duration-200 text-base"
                      />
                      {toolSearchQuery && (
                        <button
                          onClick={() => setToolSearchQuery('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-dark-textMuted p-1"
                          aria-label="Suche zurücksetzen"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {toolSearchQuery && (
                      <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
                        {filteredTools.length} {filteredTools.length === 1 ? 'Tool' : 'Tools'}
                      </p>
                    )}
                  </div>

                  {/* Tools Liste */}
                  {filteredTools.length > 0 ? (
                    <div className="space-y-2">
                      {filteredTools.map((tool) => {
                    const Icon = tool.icon;
                    const checked = localVisibility[tool.id] !== false;
                    return (
                      <label
                        key={tool.id}
                        className="flex items-center justify-between gap-3 sm:gap-4 bg-gray-50 dark:bg-dark-bg rounded-lg p-3 sm:p-4 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className={`p-1.5 sm:p-2 rounded-lg bg-gradient-to-br ${tool.color} text-white flex-shrink-0`}>
                            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-gray-900 dark:text-dark-text text-sm sm:text-base truncate">
                              {toolSearchQuery ? highlightText(tool.name, toolSearchQuery) : tool.name}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-600 dark:text-dark-textMuted hidden sm:block">
                              {toolSearchQuery ? highlightText(tool.description, toolSearchQuery) : tool.description}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs sm:text-sm text-gray-600 dark:text-dark-textMuted hidden sm:block">
                            {checked ? 'Aktiv' : 'Aus'}
                          </span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={checked}
                              onChange={(e) => setToolVisibility(tool.id, e.target.checked)}
                            />
                            <div className="w-10 h-5 sm:w-12 sm:h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-400 rounded-full peer peer-checked:bg-red-500 dark:peer-checked:bg-red-600 peer-checked:after:translate-x-5 sm:peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 sm:after:h-5 sm:after:w-5 after:transition-all dark:border-gray-600" />
                          </label>
                        </div>
                      </label>
                      );
                    })}
                    </div>
                  ) : (
                    <div className="text-center py-12 px-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700">
                        <Search className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-600 dark:text-dark-textMuted">Keine Tools gefunden</p>
                      <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                        Versuche es mit einem anderen Suchbegriff
                      </p>
                    </div>
                  )}
                  
                  {filteredTools.length > 0 && (
                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200 dark:border-dark-border">
                    <button
                      onClick={resetVisibility}
                      className="text-sm font-semibold text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text transition-colors duration-200"
                    >
                      Alle anzeigen
                    </button>
                  </div>
                  )}
                </div>
              )}

              {activeTab === 'password' && <PasswordChange />}

              {activeTab === 'users' && isAdmin && <UserManagement />}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-border px-6 pb-6 flex gap-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200"
              >
                <LogOut className="w-4 h-4" />
                Abmelden
              </button>
              <button
                onClick={() => {
                  setSettingsOpen(false);
                  setActiveTab('tools');
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 dark:text-dark-textMuted hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;

