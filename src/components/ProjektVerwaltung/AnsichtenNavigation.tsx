import { useCallback, useEffect, useRef, useState } from 'react';
import { Grid3X3 } from 'lucide-react';
import { ANSICHTEN, type AnsichtDefinition, type ViewMode } from './ansichten';

interface Rechte {
  isAdmin: boolean;
  darfShop: boolean;
}

const darfSehen = (ansicht: AnsichtDefinition, rechte: Rechte): boolean => {
  if (ansicht.benoetigt === 'admin') return rechte.isAdmin;
  if (ansicht.benoetigt === 'shop') return rechte.darfShop;
  return true;
};

/**
 * Verzögerungen beim Überfahren. Ohne die zweite würde das Menü zuklappen,
 * sobald der Zeiger auf dem Weg zum Raster den Spalt zwischen Button und
 * Panel kreuzt — der klassische Grund, warum Hover-Menüs als hakelig gelten.
 */
const OEFFNEN_MS = 90;
const SCHLIESSEN_MS = 220;

interface Props {
  aktiv: ViewMode;
  onWechsel: (ziel: ViewMode) => void;
  isAdmin: boolean;
  darfShop: boolean;
}

export default function AnsichtenNavigation({ aktiv, onWechsel, isAdmin, darfShop }: Props) {
  const rechte: Rechte = { isAdmin, darfShop };
  const primaere = ANSICHTEN.filter((a) => a.primaer && darfSehen(a, rechte));
  const imMenue = ANSICHTEN.filter((a) => !a.primaer && darfSehen(a, rechte));

  const [offen, setOffen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const stoppeTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const planeOeffnen = () => {
    stoppeTimer();
    timer.current = setTimeout(() => setOffen(true), OEFFNEN_MS);
  };

  const planeSchliessen = () => {
    stoppeTimer();
    timer.current = setTimeout(() => setOffen(false), SCHLIESSEN_MS);
  };

  const schliesseSofort = useCallback(() => {
    stoppeTimer();
    setOffen(false);
  }, []);

  useEffect(() => () => stoppeTimer(), []);

  // Escape und Klick daneben schließen. Beides nur registrieren, solange das
  // Menü offen ist — ein dauerhaft lauschender Dokument-Handler pro Ansicht
  // summiert sich in einer Seite mit dieser Reiter-Dichte spürbar.
  useEffect(() => {
    if (!offen) return;
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') schliesseSofort();
    };
    const beiKlick = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) schliesseSofort();
    };
    document.addEventListener('keydown', beiTaste);
    document.addEventListener('mousedown', beiKlick);
    return () => {
      document.removeEventListener('keydown', beiTaste);
      document.removeEventListener('mousedown', beiKlick);
    };
  }, [offen, schliesseSofort]);

  const aktivesImMenue = imMenue.find((a) => a.id === aktiv);
  const TriggerIcon = aktivesImMenue?.icon ?? Grid3X3;

  const waehle = (ziel: ViewMode) => {
    onWechsel(ziel);
    schliesseSofort();
  };

  return (
    <div className="flex items-center gap-2">
      {/* Reiter des Tagesgeschäfts */}
      <div className="flex border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
        {primaere.map((ansicht) => {
          const Icon = ansicht.icon;
          const istAktiv = aktiv === ansicht.id;
          return (
            <button
              key={ansicht.id}
              onClick={() => onWechsel(ansicht.id)}
              aria-current={istAktiv ? 'page' : undefined}
              title={ansicht.beschreibung}
              className={`px-3 py-2 flex items-center gap-2 transition-colors ${
                istAktiv
                  ? ansicht.aktivKlasse
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{ansicht.label}</span>
            </button>
          );
        })}
      </div>

      {/* Alles Übrige */}
      {imMenue.length > 0 && (
        <div
          ref={wrapper}
          className="relative"
          onMouseEnter={planeOeffnen}
          onMouseLeave={planeSchliessen}
        >
          <button
            type="button"
            onClick={() => (offen ? schliesseSofort() : (stoppeTimer(), setOffen(true)))}
            onFocus={planeOeffnen}
            aria-haspopup="menu"
            aria-expanded={offen}
            title="Alle Werkzeuge der Projekt-Verwaltung"
            className={`px-3 py-2 flex items-center gap-2 rounded-lg border transition-colors ${
              aktivesImMenue
                ? `${aktivesImMenue.aktivKlasse} border-transparent`
                : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            <TriggerIcon className="w-4 h-4" />
            {/* Wenn ein Werkzeug aus dem Menü läuft, steht sein Name im Button.
                Sonst wüsste man beim Blick auf die Kopfzeile nicht, wo man ist. */}
            <span className="hidden sm:inline">{aktivesImMenue?.label ?? 'Werkzeuge'}</span>
            {/* Die Anzahl beziffert, was hinter dem Raster liegt — sobald der Name
                eines Werkzeugs im Button steht, waere sie nur noch Rauschen. */}
            {!aktivesImMenue && (
              <span className="text-xs opacity-60 hidden lg:inline">{imMenue.length}</span>
            )}
          </button>

          {offen && (
            <div
              role="menu"
              className="absolute right-0 top-full pt-2 z-40"
              onMouseEnter={stoppeTimer}
            >
              <div className="w-[22rem] sm:w-[26rem] rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl p-3">
                <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                  Werkzeuge
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {imMenue.map((ansicht) => {
                    const Icon = ansicht.icon;
                    const istAktiv = aktiv === ansicht.id;
                    return (
                      <button
                        key={ansicht.id}
                        role="menuitem"
                        onClick={() => waehle(ansicht.id)}
                        title={ansicht.beschreibung}
                        className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition-colors ${
                          istAktiv
                            ? 'bg-gray-100 dark:bg-slate-700'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            istAktiv
                              ? ansicht.aktivKlasse
                              : `bg-gray-100 dark:bg-slate-700 ${ansicht.symbolKlasse}`
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </span>
                        <span
                          className={`text-xs leading-tight ${
                            istAktiv
                              ? 'font-semibold text-gray-900 dark:text-slate-100'
                              : 'text-gray-700 dark:text-slate-300'
                          }`}
                        >
                          {ansicht.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
