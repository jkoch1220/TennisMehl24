import { Link } from 'react-router-dom';
import { Package, BarChart3, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { filterAllowedTools } from '../services/permissionsService';
import { ALL_TOOLS } from '../constants/tools';

const Home = () => {
  const { user } = useAuth();
  
  // Tools basierend auf User-Berechtigungen filtern
  const enabledTools = filterAllowedTools(user, ALL_TOOLS);
  
  // Zusätzlich lokale Visibility-Settings beachten
  const localVisibility = (() => {
    try {
      const stored = localStorage.getItem('tm_local_tool_visibility_v1');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  })();
  
  // Nur Tools anzeigen die sowohl erlaubt als auch lokal nicht ausgeblendet sind
  const visibleTools = enabledTools.filter(tool => localVisibility[tool.id] !== false);

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12 mt-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-dark-text mb-4 transition-colors duration-300">
            TennisMehl24 Kalkulationstools
          </h1>
          <p className="text-xl text-gray-600 dark:text-dark-textMuted max-w-2xl mx-auto transition-colors duration-300">
            Professionelle Tools für Preisberechnungen, Kalkulationen und
            Analysen
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {visibleTools.map((tool) => {
            const Icon = tool.icon;
            const content = (
              <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-6 hover:shadow-xl dark:hover:shadow-dark-xl transition-all duration-300 cursor-pointer hover:scale-105 border border-transparent dark:border-dark-border">
                <div
                  className={`w-16 h-16 rounded-lg bg-gradient-to-r ${tool.color} flex items-center justify-center mb-4 shadow-md`}
                >
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-dark-text mb-2 transition-colors duration-300">
                  {tool.name}
                </h3>
                <p className="text-gray-600 dark:text-dark-textMuted mb-4 transition-colors duration-300">{tool.description}</p>
              </div>
            );

            return (
              <Link key={tool.name} to={tool.href}>
                {content}
              </Link>
            );
          })}
        </div>

        {/* Info Section */}
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-8 border border-transparent dark:border-dark-border transition-all duration-300">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-4 transition-colors duration-300">
            Über diese Tools
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <Package className="w-6 h-6 text-red-600 dark:text-dark-accent flex-shrink-0 mt-1 transition-colors duration-300" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
                  Präzise Kalkulationen
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted transition-colors duration-300">
                  Alle Berechnungen basieren auf aktuellen Herstellungskosten
                  und Preismodellen.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="w-6 h-6 text-red-600 dark:text-dark-accent flex-shrink-0 mt-1 transition-colors duration-300" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
                  Aktuelle Daten
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted transition-colors duration-300">
                  Preise und Kalkulationen werden regelmäßig aktualisiert.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BarChart3 className="w-6 h-6 text-red-600 dark:text-dark-accent flex-shrink-0 mt-1 transition-colors duration-300" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
                  Erweiterbar
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted transition-colors duration-300">
                  Weitere Tools können einfach hinzugefügt werden.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;

