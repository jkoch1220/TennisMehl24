import React from 'react';
import { Check } from 'lucide-react';
import type { ProduktionsBereich } from '../../types/produktion';
import { ABSCHNITT_LABEL, FOKUS, STATION } from './produktionUi';
import { melde } from './feedback';

/**
 * Kachelreihe für Kontextangaben: Körnung, Gebinde, Lieferant.
 *
 * Der aktive Zustand trägt IMMER ein Häkchen zusätzlich zur Farbe. Bei Sonne,
 * Staub und mit Rotschwäche ist eine gefüllte Fläche allein kein verlässliches
 * Signal — und wer die falsche Körnung bucht, merkt es nie.
 */

export interface KachelOption {
  wert: string;
  label: string;
  /** Zweite Zeile, z.B. „25 Säcke × 40 kg". */
  untertitel?: string;
}

export interface KachelWahlProps {
  label: string;
  optionen: KachelOption[];
  wert: string | null | undefined;
  onWaehle: (wert: string) => void;
  bereich: ProduktionsBereich;
  /** true = ohne Auswahl kann nicht gebucht werden; wird an der Beschriftung vermerkt. */
  pflicht?: boolean;
  /** Reihe scrollt horizontal statt zu umbrechen (Lieferantenliste). */
  scrollend?: boolean;
  /** Hinweis unter der Reihe, z.B. „wie zuletzt". */
  fussnote?: string;
}

const KachelWahl: React.FC<KachelWahlProps> = ({
  label,
  optionen,
  wert,
  onWaehle,
  bereich,
  pflicht = false,
  scrollend = false,
  fussnote,
}) => {
  const stil = STATION[bereich];

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className={`pz-panel ${ABSCHNITT_LABEL}`}>{label}</span>
        {pflicht && !wert && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Pflicht
          </span>
        )}
      </div>

      <div
        className={
          scrollend
            ? 'flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'flex gap-2'
        }
      >
        {optionen.map((opt) => {
          const aktiv = opt.wert === wert;
          return (
            <button
              key={opt.wert}
              type="button"
              aria-pressed={aktiv}
              onClick={() => {
                melde('wechsel');
                onWaehle(opt.wert);
              }}
              className={[
                'pz-rahmen relative flex min-h-[72px] select-none touch-manipulation flex-col',
                'items-center justify-center gap-0.5 rounded-xl border-2 px-3',
                'text-lg font-semibold transition-colors',
                scrollend ? 'min-w-[120px] flex-shrink-0' : 'flex-1',
                FOKUS,
                aktiv
                  ? stil.kachelAn
                  : 'border-gray-200 bg-white text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
              ].join(' ')}
            >
              {aktiv && <Check className="absolute right-2 top-2 h-4 w-4" aria-hidden />}
              <span className="leading-tight">{opt.label}</span>
              {opt.untertitel && (
                <span className="text-[11px] font-medium leading-tight opacity-70">
                  {opt.untertitel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {fussnote && (
        <p className="mt-1.5 text-[11px] font-medium text-gray-400 dark:text-slate-500">
          {fussnote}
        </p>
      )}
    </div>
  );
};

export default KachelWahl;
