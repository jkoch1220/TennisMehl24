import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toISODate } from './dateUtils';

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

interface MiniKalenderProps {
  /** Ausgewählte Tage als YYYY-MM-DD */
  selected: string[];
  /** Toggle eines Tages */
  onToggle: (datum: string) => void;
  /** Startmonat (default: aktueller Monat) */
  startMonat?: Date;
}

export default function MiniKalender({ selected, onToggle, startMonat }: MiniKalenderProps) {
  const [angezeigterMonat, setAngezeigterMonat] = useState<Date>(() => {
    const base = startMonat ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const jahr = angezeigterMonat.getFullYear();
  const monat = angezeigterMonat.getMonth();
  const heute = toISODate(new Date());

  // Erster Wochentag (Mo=0 ... So=6)
  const ersterTag = new Date(jahr, monat, 1);
  const offset = (ersterTag.getDay() + 6) % 7;
  const tageImMonat = new Date(jahr, monat + 1, 0).getDate();

  const zellen: (number | null)[] = [];
  for (let i = 0; i < offset; i++) zellen.push(null);
  for (let t = 1; t <= tageImMonat; t++) zellen.push(t);

  const wechsleMonat = (delta: number) => {
    setAngezeigterMonat(new Date(jahr, monat + delta, 1));
  };

  return (
    <div className="select-none">
      {/* Monats-Navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => wechsleMonat(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-semibold text-gray-900 dark:text-white">
          {MONATE[monat]} {jahr}
        </span>
        <button
          type="button"
          onClick={() => wechsleMonat(1)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Wochentage */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WOCHENTAGE.map(w => (
          <div key={w} className="text-center text-xs font-medium text-gray-400 py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Tage */}
      <div className="grid grid-cols-7 gap-1">
        {zellen.map((tag, idx) => {
          if (tag === null) return <div key={`empty-${idx}`} />;
          const datum = toISODate(new Date(jahr, monat, tag));
          const istSelektiert = selected.includes(datum);
          const istHeute = datum === heute;
          const wochenende = (offset + tag - 1) % 7 >= 5;
          return (
            <button
              key={datum}
              type="button"
              onClick={() => onToggle(datum)}
              className={`aspect-square flex items-center justify-center rounded-lg text-sm transition-all ${
                istSelektiert
                  ? 'bg-red-600 text-white font-semibold shadow'
                  : istHeute
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-600 ring-1 ring-red-300'
                  : wochenende
                  ? 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
