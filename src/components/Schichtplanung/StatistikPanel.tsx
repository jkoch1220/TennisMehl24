import { X, TrendingUp, Users, Clock, Award } from 'lucide-react';
import {
  WochenStatistik,
  Mitarbeiter,
  SchichtEinstellungen,
} from '../../types/schichtplanung';

interface StatistikPanelProps {
  statistik: WochenStatistik;
  mitarbeiter: Mitarbeiter[];
  einstellungen: SchichtEinstellungen;
  onClose: () => void;
}

export default function StatistikPanel({
  statistik,
  mitarbeiter,
  onClose,
}: StatistikPanelProps) {
  // Mitarbeiter mit Stunden sortiert
  const mitarbeiterMitStunden = mitarbeiter
    .map((ma) => ({
      ...ma,
      stunden: statistik.stundenProMitarbeiter[ma.id] || 0,
      schichten: statistik.schichtenProMitarbeiter[ma.id] || 0,
    }))
    .sort((a, b) => b.stunden - a.stunden);

  // Max Stunden für Balkenbreite
  const maxStunden = Math.max(...mitarbeiterMitStunden.map((m) => m.stunden), 1);

  // Fairness Score Farbe
  const fairnessColor =
    statistik.fairnessScore >= 80
      ? 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400'
      : statistik.fairnessScore >= 60
      ? 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400'
      : 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';

  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4 sticky top-[120px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-violet-600" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Statistik</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Übersicht Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">Gesamtstunden</span>
          </div>
          <div className="text-2xl font-bold text-violet-700 dark:text-violet-300">
            {statistik.gesamtStunden}h
          </div>
        </div>
        <div className={`rounded-lg p-3 ${fairnessColor}`}>
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-4 h-4" />
            <span className="text-xs font-medium">Fairness</span>
          </div>
          <div className="text-2xl font-bold">
            {statistik.fairnessScore}%
          </div>
        </div>
      </div>

      {/* Stunden pro Mitarbeiter */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-dark-text">
            Stunden pro Mitarbeiter
          </span>
        </div>
        <div className="space-y-2">
          {mitarbeiterMitStunden.map((ma) => {
            const prozent = (ma.stunden / maxStunden) * 100;
            const istUeber = ma.stunden > ma.maxStundenProWoche;

            return (
              <div key={ma.id} className="group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ma.farbe }}
                    />
                    <span className="text-gray-700 dark:text-dark-text truncate max-w-[100px]">
                      {ma.vorname} {ma.nachname[0]}.
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`font-medium ${istUeber ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                      {ma.stunden}h
                    </span>
                    <span className="text-gray-400">/ {ma.maxStundenProWoche}h</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-dark-bg rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      istUeber
                        ? 'bg-gradient-to-r from-red-400 to-red-600'
                        : 'bg-gradient-to-r from-violet-400 to-purple-500'
                    }`}
                    style={{ width: `${Math.min(prozent, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unterbesetzte Schichten */}
      {statistik.unterbesetzteSchichten.length > 0 && (
        <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
          <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">
            Unterbesetzte Schichten ({statistik.unterbesetzteSchichten.length})
          </div>
          <div className="space-y-1 max-h-[150px] overflow-y-auto">
            {statistik.unterbesetzteSchichten.map((ub, i) => {
              const datum = new Date(ub.datum);
              const tag = datum.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
              const schicht = ub.schichtTyp === 'fruehschicht' ? 'F' : ub.schichtTyp === 'spaetschicht' ? 'S' : 'N';

              return (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1"
                >
                  <span className="text-gray-700 dark:text-dark-text">{tag} [{schicht}]</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {ub.aktuell}/{ub.minimum}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legende */}
      <div className="pt-4 mt-4 border-t border-gray-200 dark:border-dark-border">
        <div className="text-xs text-gray-500 dark:text-dark-textMuted">
          <p className="mb-1">
            <span className="font-medium">Fairness-Score:</span> Zeigt wie gleichmäßig die Stunden verteilt sind.
          </p>
          <p>100% = perfekt verteilt, niedriger = ungleichmäßig</p>
        </div>
      </div>
    </div>
  );
}
