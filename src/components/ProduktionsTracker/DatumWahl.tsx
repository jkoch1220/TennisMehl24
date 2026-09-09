import React from 'react';
import { X } from 'lucide-react';
import { ABSCHNITT_LABEL, FOKUS } from './produktionUi';
import { formatDatumKurz, heuteDatum, verschiebeTage } from './statistik';

/**
 * Datumswahl als Bottom-Sheet.
 *
 * Drei große Kacheln decken über 95 % der Fälle ab; der Kalender kommt erst
 * dahinter. Ein `<input type="date">` als Erstkontakt ist am Handy mit
 * Handschuhen eine Zumutung — und für „heute" braucht es ihn nie.
 *
 * Nachtrag ist ein sichtbarer Zustand, kein stiller: die Melderzeile färbt
 * sich, die Wertanzeige bekommt Ring und Schraffur. Wer vergisst, das Datum
 * zurückzustellen, bucht sonst eine Woche lang auf den Dienstag.
 */

export interface DatumWahlProps {
  datum: string;
  onDatum: (datum: string) => void;
  onSchliessen: () => void;
}

const DatumWahl: React.FC<DatumWahlProps> = ({ datum, onDatum, onSchliessen }) => {
  const heute = heuteDatum();
  const schnell = [heute, verschiebeTage(heute, -1), verschiebeTage(heute, -2)];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Buchungsdatum wählen"
      onClick={onSchliessen}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50">Buchungsdatum</h2>
          <button
            type="button"
            onClick={onSchliessen}
            aria-label="Schließen"
            className={`rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 ${FOKUS}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-2">
          {schnell.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                onDatum(d);
                onSchliessen();
              }}
              className={[
                'min-h-[72px] flex-1 rounded-xl border-2 text-base font-bold transition-colors',
                FOKUS,
                d === datum
                  ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-100'
                  : 'border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
              ].join(' ')}
            >
              {formatDatumKurz(d)}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label className={`pz-panel mb-2 block ${ABSCHNITT_LABEL}`} htmlFor="pz-datum">
            Anderer Tag
          </label>
          <input
            id="pz-datum"
            type="date"
            value={datum}
            max={heute}
            onChange={(e) => {
              if (e.target.value) onDatum(e.target.value);
            }}
            className={`w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-center text-lg font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${FOKUS}`}
          />
        </div>

        {datum !== heute && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
            Es wird für einen zurückliegenden Tag gebucht. Die Anzeige bleibt so lange
            gekennzeichnet, bis wieder auf heute gestellt wird.
          </p>
        )}

        <button
          type="button"
          onClick={onSchliessen}
          className={`mt-5 min-h-[52px] w-full rounded-xl bg-gray-900 font-semibold text-white dark:bg-slate-100 dark:text-slate-900 ${FOKUS}`}
        >
          Übernehmen
        </button>
      </div>
    </div>
  );
};

export default DatumWahl;
