import { Link } from 'react-router-dom';
import { Calculator, TrendingUp, Package, BarChart3, Euro } from 'lucide-react';

const Home = () => {
  const tools = [
    {
      name: 'Speditionskosten Rechner',
      description: 'Preisberechnung für Ziegelmehl mit Spedition oder Eigenlieferung',
      href: '/speditionskosten',
      icon: Calculator,
      color: 'from-red-500 to-orange-500',
    },
    {
      name: 'Fixkosten Rechner',
      description: 'Berechnung der Fixkosten für die Ziegelmehl-Herstellung',
      href: '/fixkosten',
      icon: Euro,
      color: 'from-orange-500 to-red-500',
    },
    {
      name: 'Variable Kosten Rechner',
      description: 'Berechnung der variablen Kosten und Gesamtherstellkosten',
      href: '/variable-kosten',
      icon: TrendingUp,
      color: 'from-blue-500 to-indigo-500',
    },
  ];

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12 mt-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            TennisMehl24 Kalkulationstools
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Professionelle Tools für Preisberechnungen, Kalkulationen und
            Analysen
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const content = (
              <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer hover:scale-105">
                <div
                  className={`w-16 h-16 rounded-lg bg-gradient-to-r ${tool.color} flex items-center justify-center mb-4`}
                >
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {tool.name}
                </h3>
                <p className="text-gray-600 mb-4">{tool.description}</p>
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
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Über diese Tools
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <Package className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  Präzise Kalkulationen
                </h3>
                <p className="text-sm text-gray-600">
                  Alle Berechnungen basieren auf aktuellen Herstellungskosten
                  und Preismodellen.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  Aktuelle Daten
                </h3>
                <p className="text-sm text-gray-600">
                  Preise und Kalkulationen werden regelmäßig aktualisiert.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BarChart3 className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  Erweiterbar
                </h3>
                <p className="text-sm text-gray-600">
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

