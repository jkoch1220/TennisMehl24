import {
  Users,
  Building2,
  Package,
  Euro,
  FileCheck,
  Truck,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { PBVStatistik, PlatzbauermitVereinen } from '../../types/platzbauer';

interface PlatzbauerlStatistikProps {
  statistik: PBVStatistik | null;
  platzbauer: PlatzbauermitVereinen[];
  saisonjahr: number;
}

const PlatzbauerlStatistik = ({
  statistik,
  platzbauer,
}: PlatzbauerlStatistikProps) => {
  if (!statistik) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        Keine Statistik-Daten verfügbar
      </div>
    );
  }

  // Top-Platzbauer nach Vereine
  const topPlatzbauer = [...platzbauer]
    .sort((a, b) => b.vereine.length - a.vereine.length)
    .slice(0, 5);

  // Status-Farben
  const statusConfig = [
    { key: 'angebot', label: 'Angebot', color: 'bg-blue-500' },
    { key: 'angebot_versendet', label: 'Versendet', color: 'bg-indigo-500' },
    { key: 'auftragsbestaetigung', label: 'AB', color: 'bg-purple-500' },
    { key: 'lieferschein', label: 'Lieferschein', color: 'bg-orange-500' },
    { key: 'rechnung', label: 'Rechnung', color: 'bg-amber-500' },
    { key: 'bezahlt', label: 'Bezahlt', color: 'bg-green-500' },
  ];

  const gesamtProjekte = Object.values(statistik.projekteNachStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Übersicht-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Platzbauer"
          value={statistik.gesamtPlatzbauer}
          subValue={`${statistik.aktivePlatzbauer} aktiv`}
          color="amber"
        />
        <StatCard
          icon={Users}
          label="Vereine"
          value={statistik.gesamtVereine}
          color="blue"
        />
        <StatCard
          icon={Package}
          label="Gesamtmenge"
          value={`${statistik.gesamtMenge.toFixed(0)} t`}
          color="green"
        />
        <StatCard
          icon={Euro}
          label="Gesamtumsatz"
          value={`${(statistik.gesamtUmsatz / 1000).toFixed(1)}k €`}
          color="purple"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Projekte nach Status */}
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-gray-400" />
            Projekte nach Status
          </h3>

          {gesamtProjekte === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>Keine Projekte vorhanden</p>
            </div>
          ) : (
            <div className="space-y-3">
              {statusConfig.map(({ key, label, color }) => {
                const count = statistik.projekteNachStatus[key as keyof typeof statistik.projekteNachStatus] || 0;
                const percentage = gesamtProjekte > 0 ? (count / gesamtProjekte) * 100 : 0;

                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-600 dark:text-gray-400">{label}</span>
                    <div className="flex-1 h-6 bg-gray-100 dark:bg-dark-bg rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-sm font-medium text-gray-900 dark:text-white">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lieferschein-Fortschritt */}
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5 text-gray-400" />
            Lieferschein-Fortschritt
          </h3>

          <div className="flex items-center justify-center py-8">
            <div className="relative w-40 h-40">
              {/* Hintergrund-Kreis */}
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-gray-200 dark:text-dark-border"
                />
                {/* Fortschritts-Kreis */}
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeLinecap="round"
                  className="text-green-500"
                  strokeDasharray={`${2 * Math.PI * 70}`}
                  strokeDashoffset={`${2 * Math.PI * 70 * (1 - (statistik.lieferscheineGesamt > 0 ? (statistik.lieferscheineGesamt - statistik.lieferscheineOffen) / statistik.lieferscheineGesamt : 0))}`}
                />
              </svg>
              {/* Zentrum-Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {statistik.lieferscheineGesamt - statistik.lieferscheineOffen}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  von {statistik.lieferscheineGesamt}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-gray-600 dark:text-gray-400">Erstellt</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-200 dark:bg-dark-border" />
              <span className="text-gray-600 dark:text-gray-400">Offen ({statistik.lieferscheineOffen})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top-Platzbauer */}
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gray-400" />
          Top Platzbauer nach Vereinen
        </h3>

        {topPlatzbauer.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Keine Daten verfügbar
          </div>
        ) : (
          <div className="space-y-3">
            {topPlatzbauer.map((pb, index) => (
              <div
                key={pb.platzbauer.id}
                className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-dark-bg rounded-lg"
              >
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {pb.platzbauer.name}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {pb.vereine.length} Vereine · {pb.statistik?.gesamtMenge?.toFixed(0) || 0} t
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pb.projekte.length > 0 ? (
                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                      {pb.projekte.length} Projekt{pb.projekte.length !== 1 ? 'e' : ''}
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                      Kein Projekt
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Statistik-Karte Komponente
const StatCard = ({
  icon: Icon,
  label,
  value,
  subValue,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subValue?: string;
  color: 'amber' | 'blue' | 'green' | 'purple';
}) => {
  const colorClasses = {
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-4">
      <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      {subValue && (
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subValue}</div>
      )}
    </div>
  );
};

export default PlatzbauerlStatistik;
