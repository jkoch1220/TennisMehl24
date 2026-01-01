import {
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Line,
  ComposedChart,
} from 'recharts';
import { Siebanalyse, SIEB_TOLERANZEN } from '../../types/qualitaetssicherung';
import { CheckCircle, XCircle, FileDown } from 'lucide-react';
import { generateQSPruefbericht } from '../../utils/qsPdfHelpers';
import { ladeStammdaten } from '../../services/stammdatenService';

interface Props {
  analyse: Siebanalyse;
  showControls?: boolean;
}

export default function KoernungslinieGraph({ analyse, showControls = true }: Props) {
  // Graph-Daten vorbereiten
  const graphData = SIEB_TOLERANZEN.map((toleranz) => ({
    sieb: toleranz.label,
    siebNumerisch: parseFloat(toleranz.label.replace(',', '.')),
    messwert: analyse.siebwerte[toleranz.sieb],
    minToleranz: toleranz.min,
    maxToleranz: toleranz.max,
  })).reverse(); // Umkehren für richtige Reihenfolge (klein -> groß)

  const handleExportPDF = async () => {
    try {
      const stammdaten = await ladeStammdaten();
      await generateQSPruefbericht(analyse, stammdaten);
    } catch (error) {
      console.error('Fehler beim PDF-Export:', error);
      alert('Fehler beim Erstellen des PDF-Prüfberichts');
    }
  };

  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      const messwert = payload.find((p) => p.name === 'messwert')?.value;
      const minToleranz = payload.find((p) => p.name === 'minToleranz')?.value;
      const maxToleranz = payload.find((p) => p.name === 'maxToleranz')?.value;
      const inToleranz = messwert !== undefined && minToleranz !== undefined && maxToleranz !== undefined &&
        messwert >= minToleranz && messwert <= maxToleranz;

      return (
        <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg shadow-lg p-3">
          <p className="font-medium text-gray-900 dark:text-dark-text mb-1">Sieb: {label} mm</p>
          <div className="space-y-1 text-sm">
            <p className={inToleranz ? 'text-green-600' : 'text-red-600'}>
              Messwert: {messwert}%
            </p>
            <p className="text-gray-500 dark:text-dark-textMuted">
              Toleranz: {minToleranz} - {maxToleranz}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Ergebnis-Badge und Controls */}
      {showControls && (
        <div className="flex items-center justify-between">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${
              analyse.ergebnis === 'bestanden'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}
          >
            {analyse.ergebnis === 'bestanden' ? (
              <>
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">BESTANDEN</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                <span className="font-medium">NICHT BESTANDEN</span>
              </>
            )}
          </div>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
          >
            <FileDown className="h-4 w-4" />
            <span className="text-sm font-medium">PDF</span>
          </button>
        </div>
      )}

      {/* Graph */}
      <div className="h-64 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={graphData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="toleranzGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="sieb"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#d1d5db' }}
              axisLine={{ stroke: '#d1d5db' }}
              label={{ value: 'Siebgröße [mm]', position: 'bottom', offset: -5, fontSize: 12, fill: '#6b7280' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#d1d5db' }}
              axisLine={{ stroke: '#d1d5db' }}
              label={{ value: 'Durchgang [%]', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#6b7280' }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Toleranzband als Area zwischen min und max */}
            <Area
              type="monotone"
              dataKey="maxToleranz"
              stackId="1"
              stroke="none"
              fill="url(#toleranzGradient)"
            />
            <Area
              type="monotone"
              dataKey="minToleranz"
              stackId="2"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
            />

            {/* Toleranzgrenzen als Linien */}
            <Line
              type="monotone"
              dataKey="maxToleranz"
              stroke="#10b981"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="maxToleranz"
            />
            <Line
              type="monotone"
              dataKey="minToleranz"
              stroke="#10b981"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="minToleranz"
            />

            {/* Messwert-Linie */}
            <Line
              type="monotone"
              dataKey="messwert"
              stroke="#0891b2"
              strokeWidth={3}
              dot={{ r: 6, fill: '#0891b2', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 8, fill: '#0891b2', strokeWidth: 3, stroke: '#fff' }}
              name="messwert"
            />

            {/* Referenzlinien */}
            <ReferenceLine y={50} stroke="#d1d5db" strokeDasharray="3 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legende */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-cyan-600"></div>
          <span className="text-gray-600 dark:text-dark-textMuted">Messwert</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-4 bg-green-500/20 border border-green-500 border-dashed"></div>
          <span className="text-gray-600 dark:text-dark-textMuted">Toleranzbereich DIN 18035-5</span>
        </div>
      </div>

      {/* Abweichungen anzeigen */}
      {analyse.abweichungen.length > 0 && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
          <h4 className="font-medium text-red-700 dark:text-red-400 mb-1">Abweichungen:</h4>
          <ul className="space-y-1">
            {analyse.abweichungen.map((abw, i) => (
              <li key={i} className="text-sm text-red-600 dark:text-red-400">
                • {abw}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
