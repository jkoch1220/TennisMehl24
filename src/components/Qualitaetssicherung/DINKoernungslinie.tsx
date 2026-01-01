/**
 * DIN 18035-5 konformes Körnungslinien-Diagramm
 *
 * - Logarithmische X-Achse (Siebweite in mm)
 * - Lineare Y-Achse (Siebdurchgang in %)
 * - Grünes Toleranzband nach DIN 18035-5
 * - Massenanteile (Rückstand) als Balken
 */

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Siebanalyse, Siebwerte, SIEB_TOLERANZEN } from '../../types/qualitaetssicherung';
import { CheckCircle, XCircle, Beaker } from 'lucide-react';

interface Props {
  analyse: Siebanalyse;
  vergleichsAnalyse?: Siebanalyse; // Optional: Zweite Linie zum Vergleich
  zeigeMassenanteile?: boolean;    // Rückstand als Balken anzeigen
  kompakt?: boolean;               // Kompakte Ansicht
}

// Siebweiten in mm (für logarithmische Skala)
const SIEBWEITEN = [0.063, 0.125, 0.315, 0.63, 1.0, 2.0];

// Berechne Massenanteile (Rückstand) aus Siebdurchgang
function berechneMassenanteile(siebwerte: Siebwerte): Record<string, number> {
  return {
    '2.0': 100 - siebwerte.mm2_0,                    // 0% (alles geht durch)
    '1.0': siebwerte.mm2_0 - siebwerte.mm1_0,        // Rückstand 1-2mm
    '0.63': siebwerte.mm1_0 - siebwerte.mm0_63,      // Rückstand 0.63-1mm
    '0.315': siebwerte.mm0_63 - siebwerte.mm0_315,   // Rückstand 0.315-0.63mm
    '0.125': siebwerte.mm0_315 - siebwerte.mm0_125,  // Rückstand 0.125-0.315mm
    '0.063': siebwerte.mm0_125 - siebwerte.mm0_063,  // Rückstand 0.063-0.125mm
    '<0.063': siebwerte.mm0_063,                     // Feinstkorn
  };
}

export default function DINKoernungslinie({
  analyse,
  vergleichsAnalyse,
  zeigeMassenanteile = false,
  kompakt = false,
}: Props) {
  // Daten für das Diagramm vorbereiten
  const chartData = useMemo(() => {
    return SIEB_TOLERANZEN.map((toleranz, index) => {
      const siebweite = SIEBWEITEN[index];
      const massenanteile = berechneMassenanteile(analyse.siebwerte);
      const vergleichMassenanteile = vergleichsAnalyse
        ? berechneMassenanteile(vergleichsAnalyse.siebwerte)
        : null;

      return {
        siebweite,
        siebLabel: toleranz.label,
        durchgang: analyse.siebwerte[toleranz.sieb],
        vergleichDurchgang: vergleichsAnalyse?.siebwerte[toleranz.sieb],
        minGrenze: toleranz.min,
        maxGrenze: toleranz.max,
        massenanteil: massenanteile[toleranz.label] || 0,
        vergleichMassenanteil: vergleichMassenanteile?.[toleranz.label] || 0,
        inToleranz:
          analyse.siebwerte[toleranz.sieb] >= toleranz.min &&
          analyse.siebwerte[toleranz.sieb] <= toleranz.max,
      };
    }).reverse(); // Klein nach groß
  }, [analyse, vergleichsAnalyse]);

  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ value: number; name: string; color: string }>;
    label?: number
  }) => {
    if (!active || !payload?.length) return null;

    const punkt = chartData.find((d) => d.siebweite === label);
    if (!punkt) return null;

    return (
      <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg shadow-lg p-3 min-w-[200px]">
        <p className="font-bold text-gray-900 dark:text-dark-text border-b pb-2 mb-2">
          Sieb: {punkt.siebLabel} mm
        </p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-dark-textMuted">Durchgang:</span>
            <span className={punkt.inToleranz ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
              {punkt.durchgang}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-dark-textMuted">Toleranz:</span>
            <span className="text-gray-900 dark:text-dark-text">
              {punkt.minGrenze} - {punkt.maxGrenze}%
            </span>
          </div>
          {zeigeMassenanteile && (
            <div className="flex justify-between border-t pt-1 mt-1">
              <span className="text-gray-600 dark:text-dark-textMuted">Rückstand:</span>
              <span className="text-amber-600 font-medium">{punkt.massenanteil.toFixed(1)}%</span>
            </div>
          )}
          {vergleichsAnalyse && punkt.vergleichDurchgang !== undefined && (
            <div className="flex justify-between border-t pt-1 mt-1">
              <span className="text-gray-600 dark:text-dark-textMuted">Vergleich:</span>
              <span className="text-purple-600 font-medium">{punkt.vergleichDurchgang}%</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Ergebnis-Badge
  const ErgebnisBadge = () => {
    if (analyse.ergebnis === 'mischprobe') {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
          <Beaker className="h-4 w-4" />
          <span className="font-medium">MISCHPROBE</span>
        </div>
      );
    }
    if (analyse.ergebnis === 'bestanden') {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span className="font-medium">BESTANDEN</span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
        <XCircle className="h-4 w-4" />
        <span className="font-medium">NICHT BESTANDEN</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      {!kompakt && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-dark-text">
              Körnungslinie nach DIN 18035-5
            </h3>
            <p className="text-sm text-gray-500 dark:text-dark-textMuted">
              {analyse.chargenNummer} • {new Date(analyse.pruefDatum).toLocaleDateString('de-DE')}
              {' • '}
              {new Date(analyse.pruefDatum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              {analyse.probenTyp === 'mischprobe' && ' • Produktionsprobe'}
            </p>
          </div>
          <ErgebnisBadge />
        </div>
      )}

      {/* Diagramm */}
      <div className={kompakt ? 'h-48' : 'h-80'}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 10, bottom: kompakt ? 20 : 40 }}
          >
            <defs>
              {/* Gradient für Toleranzband */}
              <linearGradient id="toleranzGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.1} />
              </linearGradient>
              {/* Gradient für Messwert */}
              <linearGradient id="messwertGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0891b2" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#0891b2" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />

            {/* X-Achse: Logarithmische Siebweite */}
            <XAxis
              dataKey="siebweite"
              scale="log"
              domain={[0.05, 2.5]}
              type="number"
              tickFormatter={(v) => {
                const punkt = chartData.find((d) => Math.abs(d.siebweite - v) < 0.01);
                return punkt?.siebLabel || '';
              }}
              ticks={SIEBWEITEN}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickLine={{ stroke: '#d1d5db' }}
              label={
                !kompakt
                  ? {
                      value: 'Siebweite [mm]',
                      position: 'bottom',
                      offset: 15,
                      fontSize: 12,
                      fill: '#6b7280',
                    }
                  : undefined
              }
            />

            {/* Y-Achse: Siebdurchgang */}
            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickLine={{ stroke: '#d1d5db' }}
              label={
                !kompakt
                  ? {
                      value: 'Siebdurchgang [%]',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 5,
                      fontSize: 12,
                      fill: '#6b7280',
                    }
                  : undefined
              }
            />

            <Tooltip content={<CustomTooltip />} />

            {!kompakt && (
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    durchgang: 'Messwert',
                    maxGrenze: 'DIN Max',
                    minGrenze: 'DIN Min',
                    vergleichDurchgang: 'Vergleich',
                    massenanteil: 'Rückstand',
                  };
                  return <span className="text-sm">{labels[value] || value}</span>;
                }}
              />
            )}

            {/* Referenzlinien */}
            <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={0.5} />

            {/* Toleranzband (Fläche zwischen Min und Max) */}
            <Area
              type="monotone"
              dataKey="maxGrenze"
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              fill="url(#toleranzGradient)"
              fillOpacity={1}
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="minGrenze"
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              fill="#ffffff"
              fillOpacity={1}
              dot={false}
              isAnimationActive={false}
            />

            {/* Massenanteile als Balken (optional) */}
            {zeigeMassenanteile && (
              <Bar
                dataKey="massenanteil"
                fill="#f59e0b"
                fillOpacity={0.6}
                radius={[2, 2, 0, 0]}
                barSize={20}
              />
            )}

            {/* Vergleichs-Linie (optional) */}
            {vergleichsAnalyse && (
              <Line
                type="monotone"
                dataKey="vergleichDurchgang"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }}
                isAnimationActive={false}
              />
            )}

            {/* Messwert-Linie (Hauptlinie) */}
            <Line
              type="monotone"
              dataKey="durchgang"
              stroke="#0891b2"
              strokeWidth={3}
              dot={(props: { cx: number; cy: number; index: number }) => {
                const punkt = chartData[props.index];
                const inToleranz = punkt?.inToleranz;
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={6}
                    fill={inToleranz ? '#0891b2' : '#ef4444'}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 8, fill: '#0891b2', strokeWidth: 3, stroke: '#fff' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legende / Info */}
      {!kompakt && (
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm border-t pt-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 bg-cyan-600 rounded"></div>
            <span className="text-gray-600 dark:text-dark-textMuted">Messwert</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-4 bg-green-500/30 border border-green-500 border-dashed rounded"></div>
            <span className="text-gray-600 dark:text-dark-textMuted">Toleranzbereich DIN 18035-5</span>
          </div>
          {zeigeMassenanteile && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-500/60 rounded"></div>
              <span className="text-gray-600 dark:text-dark-textMuted">Massenanteil (Rückstand)</span>
            </div>
          )}
        </div>
      )}

      {/* Abweichungen */}
      {analyse.abweichungen.length > 0 && analyse.probenTyp !== 'mischprobe' && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
          <h4 className="font-medium text-red-700 dark:text-red-400 mb-1">Abweichungen:</h4>
          <ul className="space-y-0.5">
            {analyse.abweichungen.map((abw, i) => (
              <li key={i} className="text-sm text-red-600 dark:text-red-400">
                • {abw}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Info für Mischproben */}
      {analyse.probenTyp === 'mischprobe' && analyse.abweichungen.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <h4 className="font-medium text-amber-700 dark:text-amber-400 mb-1">
            Hinweise (Mischprobe - keine Bewertung):
          </h4>
          <ul className="space-y-0.5">
            {analyse.abweichungen.map((abw, i) => (
              <li key={i} className="text-sm text-amber-600 dark:text-amber-400">
                • {abw}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
