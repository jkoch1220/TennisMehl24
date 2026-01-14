import { useState } from 'react';
import { X, Clock, User, Calendar } from 'lucide-react';
import {
  Mitarbeiter,
  SchichtTyp,
  getSchichtConfig,
  SchichtEinstellungen,
  DEFAULT_SCHICHT_EINSTELLUNGEN,
} from '../../types/schichtplanung';

interface NeueSchichtDialogProps {
  datum: string;
  startZeit: string;
  endZeit: string;
  mitarbeiter: Mitarbeiter[];
  einstellungen?: SchichtEinstellungen;
  onSave: (mitarbeiterId: string, schichtTyp: SchichtTyp, startZeit: string, endZeit: string) => void;
  onClose: () => void;
}

export default function NeueSchichtDialog({
  datum,
  startZeit: initialStart,
  endZeit: initialEnd,
  mitarbeiter,
  einstellungen = DEFAULT_SCHICHT_EINSTELLUNGEN,
  onSave,
  onClose,
}: NeueSchichtDialogProps) {
  const [selectedMitarbeiter, setSelectedMitarbeiter] = useState<string>('');
  const [startZeit, setStartZeit] = useState(initialStart);
  const [endZeit, setEndZeit] = useState(initialEnd);
  const [schichtTyp, setSchichtTyp] = useState<SchichtTyp>('fruehschicht');

  const schichtConfig = getSchichtConfig(einstellungen);

  // Bestimme Schichttyp basierend auf Startzeit
  const bestimmeSchichtTyp = (zeit: string): SchichtTyp => {
    const [h] = zeit.split(':').map(Number);
    if (h >= 5 && h < 12) return 'fruehschicht';
    if (h >= 12 && h < 20) return 'spaetschicht';
    return 'nachtschicht';
  };

  const handleStartChange = (newStart: string) => {
    setStartZeit(newStart);
    setSchichtTyp(bestimmeSchichtTyp(newStart));
  };

  const handleSave = () => {
    if (!selectedMitarbeiter) return;
    onSave(selectedMitarbeiter, schichtTyp, startZeit, endZeit);
  };

  // Formatiere Datum für Anzeige
  const datumObj = new Date(datum);
  const datumFormatiert = datumObj.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Neue Schicht</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-dark-textMuted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Datum */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-bg rounded-lg">
            <Calendar className="w-5 h-5 text-violet-600" />
            <span className="text-sm font-medium text-gray-700 dark:text-dark-text">
              {datumFormatiert}
            </span>
          </div>

          {/* Zeit-Auswahl */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
              <Clock className="w-4 h-4" />
              Zeitraum
            </label>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={startZeit}
                onChange={(e) => handleStartChange(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <span className="text-gray-400">bis</span>
              <input
                type="time"
                value={endZeit}
                onChange={(e) => setEndZeit(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Schichttyp */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-dark-text mb-2 block">
              Schichttyp
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(schichtConfig) as SchichtTyp[]).map((typ) => {
                const config = schichtConfig[typ];
                return (
                  <button
                    key={typ}
                    onClick={() => setSchichtTyp(typ)}
                    className={`
                      px-3 py-2 rounded-lg text-sm font-medium transition-all
                      ${schichtTyp === typ
                        ? `bg-gradient-to-r ${config.farbe} text-white shadow-md`
                        : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-dark-border'
                      }
                    `}
                  >
                    {config.kurzname} ({config.startZeit})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mitarbeiter-Auswahl */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
              <User className="w-4 h-4" />
              Mitarbeiter
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {mitarbeiter.map((ma) => (
                <button
                  key={ma.id}
                  onClick={() => setSelectedMitarbeiter(ma.id)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all
                    ${selectedMitarbeiter === ma.id
                      ? 'ring-2 ring-violet-500 bg-violet-50 dark:bg-violet-900/20'
                      : 'bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-border'
                    }
                  `}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                    style={{ backgroundColor: ma.farbe }}
                  >
                    {ma.vorname[0]}{ma.nachname[0]}
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text truncate">
                    {ma.vorname} {ma.nachname}
                  </span>
                </button>
              ))}
            </div>
            {mitarbeiter.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-dark-textMuted text-center py-4">
                Keine Mitarbeiter vorhanden
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-700 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedMitarbeiter}
            className={`
              px-4 py-2 rounded-lg font-medium transition-all
              ${selectedMitarbeiter
                ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-md'
                : 'bg-gray-200 dark:bg-dark-hover text-gray-400 cursor-not-allowed'
              }
            `}
          >
            Schicht erstellen
          </button>
        </div>
      </div>
    </div>
  );
}
