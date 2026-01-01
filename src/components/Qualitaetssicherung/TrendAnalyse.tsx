import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  BarChart3,
} from 'lucide-react';
import { Siebanalyse, TrendDaten, SIEB_TOLERANZEN, Siebwerte } from '../../types/qualitaetssicherung';

interface Props {
  trendDaten: TrendDaten;
  analysen: Siebanalyse[];
}

const siebFarben: Record<keyof Siebwerte, string> = {
  mm2_0: '#6366f1',   // indigo
  mm1_0: '#8b5cf6',   // violet
  mm0_63: '#a855f7',  // purple
  mm0_315: '#d946ef', // fuchsia
  mm0_125: '#ec4899', // pink
  mm0_063: '#f43f5e', // rose
};

const TrendIcon = ({ trend }: { trend: 'steigend' | 'fallend' | 'stabil' }) => {
  switch (trend) {
    case 'steigend':
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    case 'fallend':
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    default:
      return <Minus className="h-4 w-4 text-gray-400" />;
  }
};

export default function TrendAnalyse({ trendDaten, analysen }: Props) {
  // Daten für Trend-Chart vorbereiten
  const chartData = analysen
    .slice()
    .reverse()
    .map((analyse) => ({
      name: analyse.chargenNummer.replace('CH-2026-', ''),
      datum: new Date(analyse.pruefDatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      ...analyse.siebwerte,
      ergebnis: analyse.ergebnis,
    }));

  return (
    <div className="space-y-6">
      {/* Trend-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {SIEB_TOLERANZEN.map((toleranz) => {
          const sieb = toleranz.sieb;
          const durchschnitt = trendDaten.durchschnitt[sieb];
          const stdAbw = trendDaten.standardabweichung[sieb];
          const trend = trendDaten.trend[sieb];
          const inToleranz = durchschnitt >= toleranz.min && durchschnitt <= toleranz.max;

          return (
            <div
              key={sieb}
              className={`bg-white dark:bg-dark-surface rounded-xl p-4 border shadow-sm ${
                inToleranz
                  ? 'border-green-200 dark:border-green-700'
                  : 'border-red-200 dark:border-red-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500 dark:text-dark-textMuted">
                  {toleranz.label} mm
                </span>
                <TrendIcon trend={trend} />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                {durchschnitt.toFixed(1)}%
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-dark-textMuted">
                  ±{stdAbw.toFixed(1)}%
                </span>
                {inToleranz ? (
                  <CheckCircle className="h-3 w-3 text-green-500" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                )}
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-dark-textMuted">
                Soll: {toleranz.min}-{toleranz.max}%
              </p>
            </div>
          );
        })}
      </div>

      {/* Trend-Chart */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h3 className="font-semibold text-gray-900 dark:text-dark-text">
            Siebwerte-Verlauf (letzte {analysen.length} Chargen)
          </h3>
        </div>

        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500 dark:text-dark-textMuted">
            Keine Daten für Trend-Analyse vorhanden
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis
                  dataKey="datum"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={{ stroke: '#d1d5db' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={{ stroke: '#d1d5db' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    borderColor: 'var(--tooltip-border, #e5e7eb)',
                    borderRadius: '0.5rem',
                  }}
                  formatter={(value: number, name: string) => {
                    const toleranz = SIEB_TOLERANZEN.find((t) => t.sieb === name);
                    return [
                      `${value}% (Soll: ${toleranz?.min}-${toleranz?.max}%)`,
                      `${toleranz?.label} mm`,
                    ];
                  }}
                />
                <Legend
                  formatter={(value: string) => {
                    const toleranz = SIEB_TOLERANZEN.find((t) => t.sieb === value);
                    return toleranz ? `${toleranz.label} mm` : value;
                  }}
                />
                {SIEB_TOLERANZEN.filter((t) => t.sieb !== 'mm2_0').map((toleranz) => (
                  <Line
                    key={toleranz.sieb}
                    type="monotone"
                    dataKey={toleranz.sieb}
                    stroke={siebFarben[toleranz.sieb]}
                    strokeWidth={2}
                    dot={{ r: 4, fill: siebFarben[toleranz.sieb] }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Statistik-Zusammenfassung */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4">
        <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-4">Zusammenfassung</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-dark-textMuted">
              Durchschnittswerte
            </h4>
            <div className="space-y-2">
              {SIEB_TOLERANZEN.map((toleranz) => {
                const wert = trendDaten.durchschnitt[toleranz.sieb];
                const inToleranz = wert >= toleranz.min && wert <= toleranz.max;
                return (
                  <div
                    key={toleranz.sieb}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-600 dark:text-dark-textMuted">
                      {toleranz.label} mm
                    </span>
                    <span
                      className={`font-medium ${
                        inToleranz ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {wert.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-dark-textMuted">
              Streuung (Standardabweichung)
            </h4>
            <div className="space-y-2">
              {SIEB_TOLERANZEN.map((toleranz) => {
                const wert = trendDaten.standardabweichung[toleranz.sieb];
                const istKritisch = wert > 5;
                return (
                  <div
                    key={toleranz.sieb}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-600 dark:text-dark-textMuted">
                      {toleranz.label} mm
                    </span>
                    <span
                      className={`font-medium ${
                        istKritisch ? 'text-amber-600' : 'text-gray-900 dark:text-dark-text'
                      }`}
                    >
                      ±{wert.toFixed(1)}%
                      {istKritisch && (
                        <AlertTriangle className="h-3 w-3 inline ml-1" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Warnungen */}
      {trendDaten.warnungen.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-300">
                Qualitätshinweise
              </h3>
              <ul className="mt-2 space-y-1">
                {trendDaten.warnungen.map((warnung, i) => (
                  <li key={i} className="text-sm text-amber-700 dark:text-amber-400">
                    • {warnung}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
