/**
 * LKW-Visualisierung für Tour-Buchung
 *
 * Grafische Darstellung von Motorwagen und Hänger mit:
 * - Klickbaren Bereichen zum Bebuchen
 * - Kapazitätsanzeige pro Segment
 * - Visuelle Füllstands-Anzeige
 */

import { Tour } from '../../types/tour';
import { tourenService } from '../../services/tourenService';
import { Plus, Minus, Check, Loader2 } from 'lucide-react';

interface LKWVisualisierungProps {
  tour: Tour;
  ausgewaehlterBereich: 'motorwagen' | 'haenger' | null;
  onBereichWaehlen: (bereich: 'motorwagen' | 'haenger') => void;
  tonnenEingabe: number;
  onTonnenChange: (tonnen: number) => void;
  maxTonnen: number;
  onBuchen: () => void;
  saving: boolean;
}

/**
 * Hauptkomponente: Grafische LKW-Darstellung
 */
export const LKWVisualisierung = ({
  tour,
  ausgewaehlterBereich,
  onBereichWaehlen,
  tonnenEingabe,
  onTonnenChange,
  maxTonnen,
  onBuchen,
  saving,
}: LKWVisualisierungProps) => {
  const beladung = tourenService.berechneBeladung(tour);
  const hatHaenger = tour.lkwTyp === 'mit_haenger';

  // Kapazitäten
  const mwKapazitaet = tour.kapazitaet?.motorwagenTonnen || 14;
  const hgKapazitaet = tour.kapazitaet?.haengerTonnen || (hatHaenger ? 10 : 0);

  // Belegte Tonnen
  const mwBelegt = beladung.motorwagenTonnen || 0;
  const hgBelegt = beladung.haengerTonnen || 0;

  // Freie Kapazität
  const mwFrei = Math.max(0, mwKapazitaet - mwBelegt);
  const hgFrei = hatHaenger ? Math.max(0, hgKapazitaet - hgBelegt) : 0;

  // Prozentuale Füllung
  const mwProzent = (mwBelegt / mwKapazitaet) * 100;
  const hgProzent = hatHaenger ? (hgBelegt / hgKapazitaet) * 100 : 0;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
      <div className="text-center text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
        Klicke auf Motorwagen oder Hänger zum Bebuchen
      </div>

      {/* LKW-Grafik */}
      <div className="flex items-end justify-center gap-2">
        {/* Motorwagen */}
        <button
          onClick={() => onBereichWaehlen('motorwagen')}
          className={`relative transition-all ${
            ausgewaehlterBereich === 'motorwagen'
              ? 'ring-4 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800 scale-105'
              : 'hover:scale-102'
          }`}
        >
          <div className="relative">
            {/* Fahrerhaus */}
            <div className="absolute -left-6 bottom-0 w-6 h-16 bg-blue-600 rounded-tl-lg rounded-bl-lg flex items-center justify-center">
              <div className="w-3 h-8 bg-blue-400 rounded-sm" />
            </div>

            {/* Ladefläche Motorwagen */}
            <div
              className={`relative w-32 h-24 rounded-lg border-4 overflow-hidden ${
                ausgewaehlterBereich === 'motorwagen'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-700'
              }`}
            >
              {/* Füllstand */}
              <div
                className={`absolute bottom-0 left-0 right-0 transition-all ${
                  mwProzent > 100
                    ? 'bg-red-500'
                    : mwProzent > 80
                    ? 'bg-orange-400'
                    : 'bg-blue-400'
                }`}
                style={{ height: `${Math.min(mwProzent, 100)}%` }}
              />

              {/* Beschriftung */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-xs font-bold">
                <span className="text-gray-800 dark:text-white z-10">MW</span>
                <span className="text-gray-600 dark:text-gray-300 z-10">
                  {mwBelegt.toFixed(1)}t / {mwKapazitaet}t
                </span>
                {mwFrei > 0 && (
                  <span className="text-green-600 dark:text-green-400 text-[10px] z-10">
                    ({mwFrei.toFixed(1)}t frei)
                  </span>
                )}
              </div>
            </div>

            {/* Räder Motorwagen */}
            <div className="flex justify-between px-2 -mt-1">
              <div className="w-6 h-6 bg-gray-800 dark:bg-gray-600 rounded-full border-2 border-gray-600 dark:border-gray-500" />
              <div className="w-6 h-6 bg-gray-800 dark:bg-gray-600 rounded-full border-2 border-gray-600 dark:border-gray-500" />
            </div>
          </div>
        </button>

        {/* Kupplung */}
        {hatHaenger && (
          <div className="w-4 h-2 bg-gray-400 dark:bg-gray-600 rounded self-center mb-4" />
        )}

        {/* Hänger */}
        {hatHaenger && (
          <button
            onClick={() => onBereichWaehlen('haenger')}
            className={`relative transition-all ${
              ausgewaehlterBereich === 'haenger'
                ? 'ring-4 ring-purple-500 ring-offset-2 dark:ring-offset-slate-800 scale-105'
                : 'hover:scale-102'
            }`}
          >
            <div className="relative">
              {/* Ladefläche Hänger */}
              <div
                className={`relative w-28 h-20 rounded-lg border-4 overflow-hidden ${
                  ausgewaehlterBereich === 'haenger'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-700'
                }`}
              >
                {/* Füllstand */}
                <div
                  className={`absolute bottom-0 left-0 right-0 transition-all ${
                    hgProzent > 100
                      ? 'bg-red-500'
                      : hgProzent > 80
                      ? 'bg-orange-400'
                      : 'bg-purple-400'
                  }`}
                  style={{ height: `${Math.min(hgProzent, 100)}%` }}
                />

                {/* Beschriftung */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-xs font-bold">
                  <span className="text-gray-800 dark:text-white z-10">Hänger</span>
                  <span className="text-gray-600 dark:text-gray-300 z-10">
                    {hgBelegt.toFixed(1)}t / {hgKapazitaet}t
                  </span>
                  {hgFrei > 0 && (
                    <span className="text-green-600 dark:text-green-400 text-[10px] z-10">
                      ({hgFrei.toFixed(1)}t frei)
                    </span>
                  )}
                </div>
              </div>

              {/* Räder Hänger */}
              <div className="flex justify-between px-2 -mt-1">
                <div className="w-5 h-5 bg-gray-800 dark:bg-gray-600 rounded-full border-2 border-gray-600 dark:border-gray-500" />
                <div className="w-5 h-5 bg-gray-800 dark:bg-gray-600 rounded-full border-2 border-gray-600 dark:border-gray-500" />
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Tonnen-Eingabe wenn Bereich ausgewählt */}
      {ausgewaehlterBereich && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
          <div className="text-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tonnen auf{' '}
            <span className={ausgewaehlterBereich === 'motorwagen' ? 'text-blue-600' : 'text-purple-600'}>
              {ausgewaehlterBereich === 'motorwagen' ? 'Motorwagen' : 'Hänger'}
            </span>{' '}
            laden:
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onTonnenChange(Math.max(0.5, tonnenEingabe - 0.5))}
              className="p-2 rounded-lg bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-300 dark:border-slate-600"
            >
              <Minus className="w-5 h-5" />
            </button>

            <input
              type="number"
              step="0.5"
              min="0.5"
              max={maxTonnen}
              value={tonnenEingabe}
              onChange={(e) => onTonnenChange(Math.min(parseFloat(e.target.value) || 0, maxTonnen))}
              className="w-24 px-3 py-2 text-center text-xl font-bold border-2 rounded-lg bg-white dark:bg-slate-800
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                border-gray-300 dark:border-slate-600"
            />
            <span className="text-lg font-medium text-gray-500">t</span>

            <button
              type="button"
              onClick={() => onTonnenChange(Math.min(maxTonnen, tonnenEingabe + 0.5))}
              className="p-2 rounded-lg bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-300 dark:border-slate-600"
            >
              <Plus className="w-5 h-5" />
            </button>

            <button
              onClick={onBuchen}
              disabled={tonnenEingabe <= 0 || saving}
              className="px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-bold
                hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 flex items-center gap-2 shadow-lg"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Buchen
                </>
              )}
            </button>
          </div>

          {/* Quick-Buttons */}
          <div className="flex justify-center gap-2 mt-3">
            {[2, 5, 7, 10, 14].filter(v => v <= maxTonnen).map(value => (
              <button
                key={value}
                onClick={() => onTonnenChange(value)}
                className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                  tonnenEingabe === value
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600'
                }`}
              >
                {value}t
              </button>
            ))}
            {maxTonnen > 0 && (
              <button
                onClick={() => onTonnenChange(maxTonnen)}
                className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                  tonnenEingabe === maxTonnen
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600'
                }`}
              >
                Max ({maxTonnen.toFixed(1)}t)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Gesamtkapazität */}
      <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Gesamtkapazität:</span>
          <span className="font-bold text-gray-800 dark:text-gray-200">
            {beladung.geladenTonnen.toFixed(1)}t / {tour.kapazitaet.gesamtTonnen}t
            <span className="ml-2 text-gray-500">
              ({beladung.auslastungProzent.toFixed(0)}%)
            </span>
          </span>
        </div>
        {beladung.istUeberladen && (
          <div className="mt-1 text-center text-red-600 dark:text-red-400 font-medium text-sm">
            Achtung: LKW ist überladen!
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Kompakte LKW-Anzeige für Tour-Liste
 */
interface LKWBadgeProps {
  tour: Tour;
  className?: string;
}

export const LKWBadge = ({ tour, className = '' }: LKWBadgeProps) => {
  const beladung = tourenService.berechneBeladung(tour);
  const hatHaenger = tour.lkwTyp === 'mit_haenger';

  const mwKapazitaet = tour.kapazitaet?.motorwagenTonnen || 14;
  const hgKapazitaet = tour.kapazitaet?.haengerTonnen || 10;

  const mwProzent = Math.min(100, (beladung.motorwagenTonnen / mwKapazitaet) * 100);
  const hgProzent = hatHaenger ? Math.min(100, (beladung.haengerTonnen / hgKapazitaet) * 100) : 0;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Motorwagen Mini */}
      <div className="relative w-10 h-6 bg-gray-200 dark:bg-slate-600 rounded overflow-hidden border border-gray-300 dark:border-slate-500">
        <div
          className={`absolute bottom-0 left-0 right-0 ${
            mwProzent > 100 ? 'bg-red-500' : mwProzent > 80 ? 'bg-orange-400' : 'bg-blue-400'
          }`}
          style={{ height: `${mwProzent}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-gray-700 dark:text-gray-200">
          {beladung.motorwagenTonnen.toFixed(0)}
        </span>
      </div>

      {hatHaenger && (
        <>
          <div className="w-1 h-0.5 bg-gray-400" />
          {/* Hänger Mini */}
          <div className="relative w-8 h-5 bg-gray-200 dark:bg-slate-600 rounded overflow-hidden border border-gray-300 dark:border-slate-500">
            <div
              className={`absolute bottom-0 left-0 right-0 ${
                hgProzent > 100 ? 'bg-red-500' : hgProzent > 80 ? 'bg-orange-400' : 'bg-purple-400'
              }`}
              style={{ height: `${hgProzent}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-gray-700 dark:text-gray-200">
              {beladung.haengerTonnen.toFixed(0)}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default LKWVisualisierung;
