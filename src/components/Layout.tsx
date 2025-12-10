import { Link, useLocation } from 'react-router-dom';
import { Home, Menu, LogOut, Settings } from 'lucide-react';
import { useState } from 'react';
import VorschlagButton from './Tickets/VorschlagButton';
import { ALL_TOOLS } from '../constants/tools';
import { useAuth } from '../contexts/AuthContext';
import { filterAllowedTools } from '../services/permissionsService';
import PasswordChange from './Settings/PasswordChange';
import UserManagement from './Settings/UserManagement';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tools' | 'password' | 'users'>('tools');
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50">
      {/* Navigation */}
      <nav className="bg-white shadow-lg sticky top-0 z-50">
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
                            ? 'border-red-500 text-gray-900 bg-red-50'
                            : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50'
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
              <div className="hidden sm:flex lg:hidden items-center gap-1 overflow-x-auto scrollbar-hide flex-1 -mx-2 px-2">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`inline-flex items-center px-2 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                        isActive
                          ? 'text-red-600 bg-red-50'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      title={item.name}
                    >
                      <Icon className="w-4 h-4" />
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              {/* User Avatar als Settings Button */}
              <button
                onClick={() => setSettingsOpen(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition-all hover:shadow-md"
                title="Einstellungen öffnen"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="hidden lg:flex flex-col">
                  <span className="text-xs text-gray-500">Angemeldet als</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {user?.name}
                    {isAdmin && <span className="ml-1 text-xs text-orange-600">👑</span>}
                  </span>
                </div>
                <Settings className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500 sm:hidden"
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
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">Angemeldet als</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {user?.name}
                    {isAdmin && <span className="ml-1 text-xs text-orange-600">👑 Admin</span>}
                  </span>
                </div>
              </div>
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
                    className={`flex items-center pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                      isActive
                        ? 'bg-red-50 border-red-500 text-red-700'
                        : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
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
                className="flex items-center pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 w-full text-left"
              >
                <Settings className="w-5 h-5 mr-3" />
                Einstellungen
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main>{children}</main>

      {/* Footer - nicht auf Dashboard-Seite anzeigen */}
      {location.pathname !== '/dashboard' && (
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-gray-500">
              © 2026 TennisMehl24 - Kalkulationstools
            </p>
          </div>
        </footer>
      )}

      {/* Global Vorschlag Button - nicht auf TODOs und Dashboard-Seite anzeigen */}
      {location.pathname !== '/todos' && location.pathname !== '/dashboard' && <VorschlagButton />}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div
            className="absolute inset-0 bg-black bg-opacity-40 backdrop-blur-sm"
            onClick={() => {
              setSettingsOpen(false);
              setActiveTab('tools');
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 sm:p-8 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Einstellungen und Verwaltung
                </p>
              </div>
              <button
                onClick={() => {
                  setSettingsOpen(false);
                  setActiveTab('tools');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200 mb-6">
              <button
                onClick={() => setActiveTab('tools')}
                className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 ${
                  activeTab === 'tools'
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Tool-Sichtbarkeit
              </button>
              <button
                onClick={() => setActiveTab('password')}
                className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 ${
                  activeTab === 'password'
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Passwort ändern
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 ${
                    activeTab === 'users'
                      ? 'border-red-500 text-red-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Benutzerverwaltung
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto pr-1">
              {activeTab === 'tools' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-4">
                    Tools ein- und ausblenden (lokale Browser-Einstellung)
                  </p>
                  {enabledTools.map((tool) => {
                    const Icon = tool.icon;
                    const checked = localVisibility[tool.id] !== false;
                    return (
                      <label
                        key={tool.id}
                        className="flex items-center justify-between gap-4 bg-gray-50 hover:bg-gray-100 transition-colors rounded-xl px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg bg-gradient-to-br ${tool.color} text-white`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{tool.name}</div>
                            <div className="text-sm text-gray-600">{tool.description}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 hidden sm:inline">
                            {checked ? 'Aktiv' : 'Ausgeblendet'}
                          </span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={checked}
                              onChange={(e) => setToolVisibility(tool.id, e.target.checked)}
                            />
                            <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-400 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500" />
                          </label>
                        </div>
                      </label>
                    );
                  })}
                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200">
                    <button
                      onClick={resetVisibility}
                      className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      Alle anzeigen
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'password' && <PasswordChange />}

              {activeTab === 'users' && isAdmin && <UserManagement />}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Abmelden
              </button>
              <button
                onClick={() => {
                  setSettingsOpen(false);
                  setActiveTab('tools');
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
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

