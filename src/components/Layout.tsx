import { Link, useLocation } from 'react-router-dom';
import { Calculator, Home, Menu, Euro, TrendingUp, LogOut, Calendar, Receipt, MessageSquare, CheckSquare, MapPin } from 'lucide-react';
import { useState } from 'react';
import { clearSession } from '../utils/auth';
import VorschlagButton from './Tickets/VorschlagButton';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    { name: 'Startseite', href: '/', icon: Home },
    { name: 'Dispo-Planung', href: '/dispo-planung', icon: Calendar },
    { name: 'Kreditoren-Verwaltung', href: '/kreditoren', icon: Receipt },
    { name: 'Konkurrenten-Karte', href: '/konkurrenten', icon: MapPin },
    { name: 'Vorschläge', href: '/vorschlaege', icon: MessageSquare },
    { name: 'TODOs', href: '/todos', icon: CheckSquare },
    { name: 'Fixkosten Rechner', href: '/fixkosten', icon: Euro },
    { name: 'Variable Kosten', href: '/variable-kosten', icon: TrendingUp },
    { name: 'Speditionskosten Rechner', href: '/speditionskosten', icon: Calculator },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50">
      {/* Navigation */}
      <nav className="bg-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center min-h-[72px] py-3">
            <div className="flex items-center flex-1 min-w-0">
              <div className="flex-shrink-0 flex items-center mr-6 lg:mr-8">
                <h1 className="text-2xl font-bold text-red-600 whitespace-nowrap">
                  TennisMehl24
                </h1>
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

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            © 2025 TennisMehl24 - Kalkulationstools
          </p>
        </div>
      </footer>

      {/* Global Vorschlag Button */}
      <VorschlagButton />
    </div>
  );
};

export default Layout;

