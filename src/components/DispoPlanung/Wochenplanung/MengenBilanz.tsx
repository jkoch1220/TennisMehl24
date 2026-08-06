import { TrendingUp } from 'lucide-react';
import type { Mengenbilanz } from './wochenplanungUtils';
import { formatTonnen } from './wochenplanungUtils';
import { WOCHENTAGE_LANG, formatISODatum, formatTagKurz } from '../../../utils/kalenderwoche';

interface MengenBilanzProps {
  bilanz: Mengenbilanz;
  tage: Date[];
}

/** Balken für eine Aufschlüsselungszeile, skaliert am größten Wert der Gruppe. */
const Zeile = ({ label, wert, maximum }: { label: string; wert: number; maximum: number }) => (
  <div className="flex items-center gap-2">
    <span className="w-20 shrink-0 text-[11px] text-gray-600 dark:text-gray-300 truncate" title={label}>
      {label}
    </span>
    <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
      <div
        className="h-full rounded-full bg-blue-500 dark:bg-blue-400"
        style={{ width: maximum > 0 ? `${(wert / maximum) * 100}%` : '0%' }}
      />
    </div>
    <span className="w-14 shrink-0 text-right text-[11px] font-medium text-gray-700 dark:text-gray-200">
      {formatTonnen(wert)}
    </span>
  </div>
);

const Abschnitt = ({
  titel,
  eintraege,
}: {
  titel: string;
  eintraege: [string, number][];
}) => {
  const sichtbar = eintraege.filter(([, wert]) => wert > 0);
  if (sichtbar.length === 0) return null;
  const maximum = Math.max(...sichtbar.map(([, w]) => w));

  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
        {titel}
      </h4>
      <div className="space-y-1">
        {sichtbar.map(([label, wert]) => (
          <Zeile key={label} label={label} wert={wert} maximum={maximum} />
        ))}
      </div>
    </div>
  );
};

const MengenBilanz = ({ bilanz, tage }: MengenBilanzProps) => {
  const jeTag: [string, number][] = tage.map((tag, i) => [
    `${WOCHENTAGE_LANG[i].slice(0, 2)} ${formatTagKurz(tag)}`,
    bilanz.jeTag[formatISODatum(tag)] ?? 0,
  ]);

  const jeFahrer = Object.entries(bilanz.jeFahrer).sort((a, b) => b[1] - a[1]);
  const jePlatzbauer = Object.entries(bilanz.jePlatzbauer).sort((a, b) => b[1] - a[1]);

  const anteilGeplant = bilanz.gesamt > 0 ? (bilanz.geplant / bilanz.gesamt) * 100 : 0;

  return (
    <div className="flex flex-col h-full border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/50">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
          <TrendingUp className="w-4 h-4" />
          Mengenbilanz
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-300">Geplant</span>
            <span className="text-base font-semibold text-green-600 dark:text-green-400">
              {formatTonnen(bilanz.geplant)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-300">Ungeplant</span>
            <span
              className={`text-base font-semibold ${
                bilanz.ungeplant > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {formatTonnen(bilanz.ungeplant)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-300">Ausgeliefert</span>
            <span className="text-base font-semibold text-amber-600 dark:text-amber-400">
              {formatTonnen(bilanz.ausgeliefert)}
            </span>
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex items-baseline justify-between">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Gesamt</span>
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatTonnen(bilanz.gesamt)}
            </span>
          </div>

          {bilanz.ohneWoche > 0 && (
            <div
              className="flex items-baseline justify-between"
              title="Aufträge ohne Liefertermin — zählen zu keiner Woche"
            >
              <span className="text-[11px] text-amber-700 dark:text-amber-400">Ohne KW</span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {formatTonnen(bilanz.ohneWoche)}
              </span>
            </div>
          )}

          <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden flex">
            <div
              className="h-full bg-green-500"
              style={{ width: `${anteilGeplant}%` }}
              title={`Geplant: ${formatTonnen(bilanz.geplant)}`}
            />
            <div
              className="h-full bg-red-400"
              style={{ width: `${100 - anteilGeplant}%` }}
              title={`Ungeplant: ${formatTonnen(bilanz.ungeplant)}`}
            />
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
            {Math.round(anteilGeplant)} % der Wochenmenge verplant
          </p>
        </div>

        <Abschnitt titel="Pro Tag" eintraege={jeTag} />
        <Abschnitt titel="Pro Fahrer" eintraege={jeFahrer} />
        <Abschnitt titel="Pro Platzbauer" eintraege={jePlatzbauer} />
      </div>
    </div>
  );
};

export default MengenBilanz;
