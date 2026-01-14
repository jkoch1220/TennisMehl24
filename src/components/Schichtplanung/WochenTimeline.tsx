import { useRef, useState, useCallback } from 'react';
import {
  SchichtZuweisung,
  Mitarbeiter,
  getWochentage,
  formatDatum,
  SchichtEinstellungen,
} from '../../types/schichtplanung';
import TagesTimeline from './TagesTimeline';

interface WochenTimelineProps {
  montag: Date;
  zuweisungen: SchichtZuweisung[];
  mitarbeiter: Mitarbeiter[];
  einstellungen: SchichtEinstellungen;
  onZuweisungDelete: (id: string) => void;
  onZuweisungStatusChange: (id: string, status: SchichtZuweisung['status']) => void;
  onZuweisungResize: (id: string, startZeit: string, endZeit: string) => void;
  onZuweisungResizeEnd: (id: string, startZeit: string, endZeit: string) => void;
  onZuweisungMove: (id: string, startZeit: string, endZeit: string) => void;
  onZuweisungMoveEnd: (id: string, startZeit: string, endZeit: string) => void;
  onNeueSchicht: (datum: string, startZeit: string, endZeit: string) => void;
  onSchichtVerschieben?: (id: string, datum: string, startZeit: string) => void;
}

export default function WochenTimeline({
  montag,
  zuweisungen,
  mitarbeiter,
  onZuweisungDelete,
  onZuweisungStatusChange,
  onZuweisungResize,
  onZuweisungResizeEnd,
  onZuweisungMove,
  onZuweisungMoveEnd,
  onNeueSchicht,
}: WochenTimelineProps) {
  const wochentage = getWochentage(montag);
  const heute = formatDatum(new Date());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Pixel pro Stunde (kann angepasst werden für Zoom)
  const [stundenHoehe, setStundenHoehe] = useState(60);

  // Zoom Funktionen
  const zoomIn = useCallback(() => {
    setStundenHoehe((h) => Math.min(h + 10, 120));
  }, []);

  const zoomOut = useCallback(() => {
    setStundenHoehe((h) => Math.max(h - 10, 30));
  }, []);

  const zoomReset = useCallback(() => {
    setStundenHoehe(60);
  }, []);

  // Zuweisungen nach Datum gruppieren
  const zuweisungenProTag = new Map<string, SchichtZuweisung[]>();
  for (const tag of wochentage) {
    const datumStr = formatDatum(tag);
    zuweisungenProTag.set(datumStr, []);
  }
  for (const z of zuweisungen) {
    const liste = zuweisungenProTag.get(z.datum);
    if (liste) {
      liste.push(z);
    }
  }

  // Stunden-Labels (0-23)
  const stunden = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden flex flex-col h-full">
      {/* Zoom Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
        <span className="text-xs text-gray-500 dark:text-dark-textMuted mr-2">Zoom:</span>
        <button
          onClick={zoomOut}
          className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300 dark:bg-dark-hover dark:hover:bg-dark-border transition-colors"
          title="Verkleinern"
        >
          −
        </button>
        <button
          onClick={zoomReset}
          className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300 dark:bg-dark-hover dark:hover:bg-dark-border transition-colors"
          title="Zurücksetzen"
        >
          100%
        </button>
        <button
          onClick={zoomIn}
          className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300 dark:bg-dark-hover dark:hover:bg-dark-border transition-colors"
          title="Vergrößern"
        >
          +
        </button>
        <span className="text-xs text-gray-400 dark:text-dark-textMuted ml-2">
          ({Math.round((stundenHoehe / 60) * 100)}%)
        </span>
        <div className="ml-auto text-xs text-gray-500 dark:text-dark-textMuted">
          Klicken & Ziehen zum Erstellen • Resize an Kanten
        </div>
      </div>

      {/* Scrollbarer Bereich */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        <div className="flex min-h-full">
          {/* Zeit-Spalte (sticky) */}
          <div className="sticky left-0 z-30 w-14 flex-shrink-0 bg-white dark:bg-dark-surface border-r border-gray-200 dark:border-dark-border">
            {/* Header Spacer */}
            <div className="h-[60px] border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg" />

            {/* Stunden Labels */}
            <div className="relative" style={{ height: `${24 * stundenHoehe}px` }}>
              {stunden.map((stunde) => (
                <div
                  key={stunde}
                  className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[10px] text-gray-400 dark:text-dark-textMuted font-medium"
                  style={{ top: `${stunde * stundenHoehe}px` }}
                >
                  <span className="-translate-y-1/2">
                    {stunde.toString().padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tage */}
          {wochentage.map((tag, index) => {
            const datumStr = formatDatum(tag);
            const tagesZuweisungen = zuweisungenProTag.get(datumStr) || [];
            const istWochenende = index >= 5;
            const istHeute = datumStr === heute;

            return (
              <TagesTimeline
                key={datumStr}
                datum={tag}
                zuweisungen={tagesZuweisungen}
                mitarbeiter={mitarbeiter}
                stundenHoehe={stundenHoehe}
                onZuweisungDelete={onZuweisungDelete}
                onZuweisungStatusChange={onZuweisungStatusChange}
                onZuweisungResize={onZuweisungResize}
                onZuweisungResizeEnd={onZuweisungResizeEnd}
                onZuweisungMove={onZuweisungMove}
                onZuweisungMoveEnd={onZuweisungMoveEnd}
                onNeueSchicht={onNeueSchicht}
                istHeute={istHeute}
                istWochenende={istWochenende}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
