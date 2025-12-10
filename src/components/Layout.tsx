import { Link, useLocation } from 'react-router-dom';
import { Home, Menu, LogOut, Settings } from 'lucide-react';
import { useState } from 'react';
import { clearSession } from '../utils/auth';
import VorschlagButton from './Tickets/VorschlagButton';
import { ALL_TOOLS } from '../constants/tools';
import { useToolSettings } from '../hooks/useToolSettings';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { visibility, enabledTools, setToolVisibility, resetVisibility } = useToolSettings();

  const navigation = [
    { name: 'Startseite', href: '/', icon: Home },
    ...enabledTools.map((tool) => ({
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
              <button
                onClick={() => setSettingsOpen(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-red-600 hover:bg-gray-50 rounded-lg transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
                <span className="hidden lg:inline">Settings</span>
              </button>
              <button
                onClick={() => {
                  clearSession();
                  window.location.reload();
                }}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-red-600 hover:bg-gray-50 rounded-lg transition-colors"
                title="Abmelden"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden lg:inline">Abmelden</span>
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
                  clearSession();
                  window.location.reload();
                }}
                className="flex items-center pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 w-full text-left"
              >
                <LogOut className="w-5 h-5 mr-3" />
                Abmelden
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
            onClick={() => setSettingsOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 sm:p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Tools pro Nutzer ein- und ausblenden (wird im Browser gespeichert)
                </p>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {ALL_TOOLS.map((tool) => {
                const Icon = tool.icon;
                const checked = visibility[tool.id] ?? true;
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
            </div>

            <div className="flex justify-between items-center mt-6">
              <button
                onClick={resetVisibility}
                className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Alle anzeigen
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;

