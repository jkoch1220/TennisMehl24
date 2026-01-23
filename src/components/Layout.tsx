import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Menu, LogOut, Settings, Search, X, CheckSquare, LayoutDashboard, Bell, Wrench, Calendar } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import VorschlagButton from './Tickets/VorschlagButton';
import { ALL_TOOLS } from '../constants/tools';
import { useAuth } from '../contexts/AuthContext';
import { filterAllowedTools } from '../services/permissionsService';
import PasswordChange from './Settings/PasswordChange';
import UserManagement from './Settings/UserManagement';
import ThemeToggle from './ThemeToggle';
import GlobalChatDropdown from './Shared/GlobalChatDropdown';

// Erinnerungs-Einstellungen Typ
interface ReminderSettings {
  instandhaltungEnabled: boolean;
  kalenderEnabled: boolean;
}

// Standard-Einstellungen
const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  instandhaltungEnabled: true,
  kalenderEnabled: true,
};

// Erinnerungs-Einstellungen aus localStorage laden
const loadReminderSettings = (): ReminderSettings => {
  try {
    const stored = localStorage.getItem('tm_reminder_settings_v1');
    if (stored) {
      return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignoriere Parsing-Fehler
  }
  return DEFAULT_REMINDER_SETTINGS;
};

// Erinnerungs-Einstellungen in localStorage speichern
const saveReminderSettings = (settings: ReminderSettings): void => {
  localStorage.setItem('tm_reminder_settings_v1', JSON.stringify(settings));
};

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tools' | 'password' | 'users' | 'reminders'>('tools');
  const [toolSearchQuery, setToolSearchQuery] = useState('');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchIndex, setGlobalSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const globalSearchResultRef = useRef<HTMLAnchorElement>(null);
  const globalSearchInputRef = useRef<HTMLInputElement>(null);
  const globalSearchRef = useRef<HTMLDivElement>(null);
  const { user, logout: authLogout, isAdmin, permissionsLoading } = useAuth();

  // Erinnerungs-Einstellungen
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(() => loadReminderSettings());

  const updateReminderSetting = (key: keyof ReminderSettings, value: boolean) => {
    const newSettings = { ...reminderSettings, [key]: value };
    setReminderSettings(newSettings);
    saveReminderSettings(newSettings);
  };
  
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

  // Index zurücksetzen bei Suchtextänderung
  useEffect(() => {
    setGlobalSearchIndex(0);
  }, [globalSearchQuery]);

  // Ausgewähltes Suchergebnis in den sichtbaren Bereich scrollen
  useEffect(() => {
    if (globalSearchResultRef.current) {
      globalSearchResultRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [globalSearchIndex]);

  // Handler für Keyboard-Navigation in globaler Suche
  const handleGlobalSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setGlobalSearchIndex(prev => Math.min(prev + 1, allSearchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setGlobalSearchIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && allSearchResults.length > 0) {
      e.preventDefault();
      const selectedResult = allSearchResults[globalSearchIndex];
      navigate(selectedResult.href);
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
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#1d1d1f] transition-colors duration-300">
      {/* Apple-Style Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-[#1d1d1f]/80 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <div className="w-full px-6 lg:px-12">
          <div className="flex items-center justify-between h-12">
            {/* Logo */}
            <Link to="/" className="flex-shrink-0">
              <span className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white tracking-tight">
                TennisMehl24
              </span>
            </Link>

            {/* Desktop Navigation - Centered with scroll */}
            <div className="hidden lg:flex items-center flex-1 mx-6 min-w-0 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-5 mx-auto">
                {navigation.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`text-[12px] font-normal transition-opacity whitespace-nowrap ${
                        isActive
                          ? 'text-[#1d1d1f] dark:text-white'
                          : 'text-[#1d1d1f]/80 dark:text-white/80 hover:text-[#1d1d1f] dark:hover:text-white'
                      }`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right side - always visible */}
            <div className="hidden lg:flex items-center gap-3 flex-shrink-0 pl-4">
              {/* Search */}
              <div className="relative" ref={globalSearchRef}>
                <button
                  onClick={() => {
                    setGlobalSearchOpen(true);
                    setTimeout(() => globalSearchInputRef.current?.focus(), 50);
                  }}
                  className="p-1.5 text-[#1d1d1f]/60 dark:text-white/60 hover:text-[#1d1d1f] dark:hover:text-white transition-colors"
                >
                  <Search className="w-[18px] h-[18px]" />
                </button>

                {/* Search Modal */}
                {globalSearchOpen && (
                  <>
                    <div className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-40" onClick={() => { setGlobalSearchOpen(false); setGlobalSearchQuery(''); }} />
                    <div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-[680px] bg-white dark:bg-[#2d2d2f] rounded-2xl shadow-2xl z-50 overflow-hidden">
                      <div className="flex items-center gap-3 px-5 border-b border-black/5 dark:border-white/10">
                        <Search className="w-5 h-5 text-[#86868b]" />
                        <input
                          ref={globalSearchInputRef}
                          type="text"
                          value={globalSearchQuery}
                          onChange={(e) => setGlobalSearchQuery(e.target.value)}
                          onKeyDown={handleGlobalSearchKeyDown}
                          placeholder="Suchen"
                          className="flex-1 py-4 text-[17px] bg-transparent text-[#1d1d1f] dark:text-white placeholder-[#86868b] focus:outline-none"
                          autoFocus
                        />
                        {globalSearchQuery && (
                          <button onClick={() => setGlobalSearchQuery('')} className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full">
                            <X className="w-4 h-4 text-[#86868b]" />
                          </button>
                        )}
                        <kbd className="text-[11px] text-[#86868b] bg-[#f5f5f7] dark:bg-[#3d3d3f] px-2 py-1 rounded">esc</kbd>
                      </div>

                      {globalSearchQuery.trim() && (
                        <div className="max-h-[400px] overflow-y-auto">
                          {allSearchResults.length > 0 ? (
                            <div className="py-2">
                              {allSearchResults.map((item, index) => {
                                const Icon = item.icon;
                                const isActive = location.pathname === item.href;
                                const isSelected = index === globalSearchIndex;
                                return (
                                  <Link
                                    key={item.id}
                                    ref={isSelected ? globalSearchResultRef : null}
                                    to={item.href}
                                    onClick={() => { setGlobalSearchOpen(false); setGlobalSearchQuery(''); }}
                                    onMouseEnter={() => setGlobalSearchIndex(index)}
                                    className={`flex items-center gap-4 px-5 py-3 transition-colors ${
                                      isSelected ? 'bg-[#0071e3] text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                                  >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                      isSelected ? 'bg-white/20' : 'bg-[#f5f5f7] dark:bg-[#3d3d3f]'
                                    }`}>
                                      <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-[15px] font-medium ${isSelected ? '' : 'text-[#1d1d1f] dark:text-white'}`}>
                                        {item.name}
                                      </div>
                                      {(item as any).description && (
                                        <div className={`text-[13px] truncate ${isSelected ? 'text-white/70' : 'text-[#86868b]'}`}>
                                          {(item as any).description}
                                        </div>
                                      )}
                                    </div>
                                    {isActive && !isSelected && (
                                      <div className="w-2 h-2 rounded-full bg-[#0071e3]" />
                                    )}
                                  </Link>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="py-12 text-center">
                              <p className="text-[15px] text-[#86868b]">Keine Ergebnisse für „{globalSearchQuery}"</p>
                            </div>
                          )}
                        </div>
                      )}

                      {!globalSearchQuery.trim() && (
                        <div className="py-8 text-center">
                          <p className="text-[13px] text-[#86868b]">Tippe, um Tools zu suchen</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Global Chat */}
              <GlobalChatDropdown />

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Settings */}
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-1.5 text-[#1d1d1f]/60 dark:text-white/60 hover:text-[#1d1d1f] dark:hover:text-white transition-colors"
                title={user?.name}
              >
                <Settings className="w-[18px] h-[18px]" />
              </button>
            </div>

            {/* Tablet Navigation */}
            <div className="hidden sm:flex lg:hidden items-center gap-5 flex-1 justify-center mx-4 overflow-x-auto scrollbar-hide">
              {navigation.slice(0, 6).map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`p-1.5 transition-opacity ${
                      isActive
                        ? 'text-[#1d1d1f] dark:text-white'
                        : 'text-[#1d1d1f]/50 dark:text-white/50 hover:text-[#1d1d1f] dark:hover:text-white'
                    }`}
                    title={item.name}
                  >
                    <Icon className="w-5 h-5" />
                  </Link>
                );
              })}
            </div>

            {/* Tablet/Mobile right side */}
            <div className="flex sm:flex lg:hidden items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setGlobalSearchOpen(true)}
                className="p-1.5 text-[#1d1d1f]/60 dark:text-white/60 hover:text-[#1d1d1f] dark:hover:text-white transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="hidden sm:block p-1.5 text-[#1d1d1f]/60 dark:text-white/60 hover:text-[#1d1d1f] dark:hover:text-white transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center gap-2 flex-shrink-0 sm:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 text-[#1d1d1f]/60 dark:text-white/60"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden fixed inset-0 z-50 bg-white dark:bg-[#1d1d1f]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 h-12 border-b border-black/10 dark:border-white/10">
            <span className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">Menü</span>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 text-[#1d1d1f]/60 dark:text-white/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Info */}
          <div className="px-6 py-4 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0071e3] to-[#40a9ff] flex items-center justify-center text-white font-semibold text-sm">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <div className="text-[15px] font-medium text-[#1d1d1f] dark:text-white">
                  {user?.name}
                  {isAdmin && <span className="ml-1.5 text-[#ff9500]">👑</span>}
                </div>
                <div className="text-[13px] text-[#86868b]">Angemeldet</div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#86868b] w-4 h-4" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                onKeyDown={handleGlobalSearchKeyDown}
                placeholder="Suchen"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#f5f5f7] dark:bg-[#2d2d2f] text-[#1d1d1f] dark:text-white placeholder-[#86868b] focus:outline-none text-[15px]"
              />
              {globalSearchQuery && (
                <button
                  onClick={() => setGlobalSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-[#86868b]" />
                </button>
              )}
            </div>
          </div>

          {/* Mobile Search Results */}
          {globalSearchQuery.trim() && (
            <div className="px-6 py-2 max-h-48 overflow-y-auto">
              {allSearchResults.length > 0 ? (
                allSearchResults.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.id}
                      to={item.href}
                      onClick={() => { setMobileMenuOpen(false); setGlobalSearchQuery(''); }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 ${
                        isActive ? 'bg-[#0071e3] text-white' : 'active:bg-black/5 dark:active:bg-white/5'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className={`text-[15px] ${isActive ? '' : 'text-[#1d1d1f] dark:text-white'}`}>{item.name}</span>
                    </Link>
                  );
                })
              ) : (
                <p className="text-[13px] text-[#86868b] text-center py-4">Keine Ergebnisse</p>
              )}
            </div>
          )}

          {/* Navigation Links */}
          {!globalSearchQuery.trim() && (
            <div className="flex-1 overflow-y-auto px-6 py-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-4 py-3 border-b border-black/5 dark:border-white/5 ${
                      isActive ? 'text-[#0071e3]' : 'text-[#1d1d1f] dark:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[17px]">{item.name}</span>
                    {isActive && <div className="ml-auto w-2 h-2 rounded-full bg-[#0071e3]" />}
                  </Link>
                );
              })}

              {/* Settings Link */}
              <button
                onClick={() => { setMobileMenuOpen(false); setSettingsOpen(true); }}
                className="flex items-center gap-4 py-3 w-full text-[#1d1d1f] dark:text-white"
              >
                <Settings className="w-5 h-5" />
                <span className="text-[17px]">Einstellungen</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className={location.pathname === '/produktion' ? '' : 'pb-20 sm:pb-0'}>{children}</main>

      {/* Mobile Bottom Navigation - Apple Tab Bar Style */}
      {location.pathname !== '/produktion' && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#1d1d1f]/90 backdrop-blur-xl border-t border-black/10 dark:border-white/10 sm:hidden z-40 safe-area-bottom">
          <div className="flex items-center justify-around h-[50px]">
            <Link
              to="/"
              className={`flex flex-col items-center justify-center flex-1 h-full ${
                location.pathname === '/' ? 'text-[#0071e3]' : 'text-[#86868b]'
              }`}
            >
              <Home className="w-[22px] h-[22px]" />
              <span className="text-[10px] mt-0.5">Start</span>
            </Link>

            <Link
              to="/todos"
              className={`flex flex-col items-center justify-center flex-1 h-full ${
                location.pathname === '/todos' ? 'text-[#0071e3]' : 'text-[#86868b]'
              }`}
            >
              <CheckSquare className="w-[22px] h-[22px]" />
              <span className="text-[10px] mt-0.5">TODOs</span>
            </Link>

            <Link
              to="/dashboard"
              className={`flex flex-col items-center justify-center flex-1 h-full ${
                location.pathname === '/dashboard' ? 'text-[#0071e3]' : 'text-[#86868b]'
              }`}
            >
              <LayoutDashboard className="w-[22px] h-[22px]" />
              <span className="text-[10px] mt-0.5">Dashboard</span>
            </Link>

            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center flex-1 h-full text-[#86868b]"
            >
              <Menu className="w-[22px] h-[22px]" />
              <span className="text-[10px] mt-0.5">Mehr</span>
            </button>
          </div>
        </nav>
      )}

      {/* Footer */}
      {location.pathname !== '/dashboard' && (
        <footer className="bg-[#f5f5f7] dark:bg-[#1d1d1f] border-t border-black/5 dark:border-white/5">
          <div className="py-4 px-6">
            <p className="text-center text-[12px] text-[#86868b]">
              © 2026 TennisMehl24
            </p>
          </div>
        </footer>
      )}

      {/* Global Vorschlag Button - nicht auf Mobile, TODOs und Dashboard-Seite anzeigen */}
      <div className="hidden sm:block">
        {location.pathname !== '/todos' && location.pathname !== '/dashboard' && <VorschlagButton />}
      </div>

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
                onClick={() => setActiveTab('reminders')}
                className={`flex-shrink-0 px-3 sm:px-4 py-2.5 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === 'reminders'
                    ? 'border-red-500 text-red-600 dark:text-red-400'
                    : 'border-transparent text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text'
                }`}
              >
                Erinnerungen
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

              {activeTab === 'reminders' && (
                <div className="space-y-4">
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-dark-textMuted">
                    Erinnerungs-Popups beim Start der Anwendung ein- oder ausschalten
                  </p>

                  <div className="space-y-3">
                    {/* Instandhaltung Erinnerung */}
                    <label className="flex items-center justify-between gap-4 bg-gray-50 dark:bg-dark-bg rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 cursor-pointer">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white flex-shrink-0">
                          <Wrench className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 dark:text-dark-text text-sm sm:text-base">
                            Instandhaltung
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600 dark:text-dark-textMuted">
                            Erinnerung bei überfälligen Begehungen
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-dark-textMuted hidden sm:block">
                          {reminderSettings.instandhaltungEnabled ? 'Aktiv' : 'Aus'}
                        </span>
                        <div className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={reminderSettings.instandhaltungEnabled}
                            onChange={(e) => updateReminderSetting('instandhaltungEnabled', e.target.checked)}
                          />
                          <div className="w-10 h-5 sm:w-12 sm:h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-400 rounded-full peer peer-checked:bg-red-500 dark:peer-checked:bg-red-600 peer-checked:after:translate-x-5 sm:peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 sm:after:h-5 sm:after:w-5 after:transition-all dark:border-gray-600" />
                        </div>
                      </div>
                    </label>

                    {/* Kalender Erinnerung */}
                    <label className="flex items-center justify-between gap-4 bg-gray-50 dark:bg-dark-bg rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 cursor-pointer">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 text-white flex-shrink-0">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 dark:text-dark-text text-sm sm:text-base">
                            Kalendertermine
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600 dark:text-dark-textMuted">
                            Erinnerung bei anstehenden Terminen (nächste 7 Tage)
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-dark-textMuted hidden sm:block">
                          {reminderSettings.kalenderEnabled ? 'Aktiv' : 'Aus'}
                        </span>
                        <div className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={reminderSettings.kalenderEnabled}
                            onChange={(e) => updateReminderSetting('kalenderEnabled', e.target.checked)}
                          />
                          <div className="w-10 h-5 sm:w-12 sm:h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-400 rounded-full peer peer-checked:bg-red-500 dark:peer-checked:bg-red-600 peer-checked:after:translate-x-5 sm:peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 sm:after:h-5 sm:after:w-5 after:transition-all dark:border-gray-600" />
                        </div>
                      </div>
                    </label>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-border">
                    <div className="flex items-start gap-3 text-sm text-gray-500 dark:text-dark-textMuted">
                      <Bell className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <p>
                        Erinnerungs-Popups werden beim Öffnen der Startseite angezeigt.
                        Nach dem Schließen erscheinen sie erst am nächsten Tag wieder.
                      </p>
                    </div>
                  </div>
                </div>
              )}
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

