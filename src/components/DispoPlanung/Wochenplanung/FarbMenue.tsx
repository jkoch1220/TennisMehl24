import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban } from 'lucide-react';
import type { StopMarkierung } from '../../../types/tour';
import { STOP_MARKIERUNGEN, STOP_MARKIERUNG_REIHENFOLGE } from '../../../types/tour';

export interface FarbMenuePosition {
  x: number;
  y: number;
}

interface FarbMenueProps {
  position: FarbMenuePosition;
  /** Überschrift, z. B. „TC Utting" oder „Ganze Tour · 3 Stopps". */
  titel: string;
  /** Aktuell gesetzte Markierung, wird hervorgehoben. */
  aktuell?: StopMarkierung | null;
  dunkel: boolean;
  onWaehlen: (markierung: StopMarkierung | null) => void;
  onSchliessen: () => void;
}

const MENUE_BREITE = 216;

/**
 * Kontextmenü zur Farbvergabe.
 *
 * Über ein Portal am Body verankert, damit es nicht an den Überlauf der
 * Wochenliste stößt, und am Mauszeiger positioniert — mit Korrektur, wenn
 * es sonst über den Fensterrand hinausliefe.
 */
const FarbMenue = ({
  position,
  titel,
  aktuell,
  dunkel,
  onWaehlen,
  onSchliessen,
}: FarbMenueProps) => {
  const menueRef = useRef<HTMLDivElement>(null);
  const [korrigiert, setKorrigiert] = useState(position);

  useEffect(() => {
    const hoehe = menueRef.current?.offsetHeight ?? 340;
    setKorrigiert({
      x: Math.min(position.x, window.innerWidth - MENUE_BREITE - 8),
      y: Math.min(position.y, Math.max(8, window.innerHeight - hoehe - 8)),
    });
  }, [position]);

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSchliessen();
    };
    // Beim Scrollen schließen, sonst schwebt das Menü an falscher Stelle.
    window.addEventListener('keydown', beiTaste);
    window.addEventListener('scroll', onSchliessen, true);
    return () => {
      window.removeEventListener('keydown', beiTaste);
      window.removeEventListener('scroll', onSchliessen, true);
    };
  }, [onSchliessen]);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={onSchliessen}
        onContextMenu={(e) => {
          e.preventDefault();
          onSchliessen();
        }}
      />
      <div
        ref={menueRef}
        style={{ left: korrigiert.x, top: korrigiert.y, width: MENUE_BREITE }}
        className="fixed z-[61] rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-2xl py-1 overflow-hidden animate-in fade-in duration-100"
      >
        <div className="px-3 py-1.5 border-b border-gray-100 dark:border-slate-700">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">
            {titel}
          </p>
        </div>

        <div className="py-1">
          {STOP_MARKIERUNG_REIHENFOLGE.map((schluessel) => {
            const eintrag = STOP_MARKIERUNGEN[schluessel];
            const gewaehlt = aktuell === schluessel;
            return (
              <button
                key={schluessel}
                onClick={() => {
                  onWaehlen(schluessel);
                  onSchliessen();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                  gewaehlt
                    ? 'bg-gray-100 dark:bg-slate-700'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-700/60'
                }`}
              >
                <span
                  className="w-4 h-4 shrink-0 rounded border border-black/15 dark:border-white/20"
                  style={{ backgroundColor: dunkel ? eintrag.dunkel : eintrag.hell }}
                />
                <span
                  className={`text-xs truncate ${
                    gewaehlt
                      ? 'font-semibold text-gray-900 dark:text-gray-100'
                      : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {eintrag.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-gray-100 dark:border-slate-700">
          <button
            onClick={() => {
              onWaehlen(null);
              onSchliessen();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-slate-700/60"
          >
            <Ban className="w-4 h-4 shrink-0 text-gray-300 dark:text-slate-600" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Ohne Markierung</span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

export default FarbMenue;
