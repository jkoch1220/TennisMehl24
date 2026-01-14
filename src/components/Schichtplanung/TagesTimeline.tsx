import { useCallback, useState, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SchichtZuweisung,
  Mitarbeiter,
  zeitZuMinuten,
  minutenZuZeit,
  formatDatum,
  WOCHENTAGE_LANG,
  DEFAULT_SCHICHT_EINSTELLUNGEN,
} from '../../types/schichtplanung';

// Hilfsfunktion um Zeiten mit Fallback zu bekommen
function getZeitenMitFallback(z: SchichtZuweisung): { startZeit: string; endZeit: string } {
  if (z.startZeit && z.endZeit) {
    return { startZeit: z.startZeit, endZeit: z.endZeit };
  }
  // Fallback auf Standard-Schichtzeiten
  const settings = DEFAULT_SCHICHT_EINSTELLUNGEN[z.schichtTyp];
  return {
    startZeit: z.startZeit || settings.startZeit,
    endZeit: z.endZeit || settings.endZeit,
  };
}
import SchichtBlock from './SchichtBlock';

interface TagesTimelineProps {
  datum: Date;
  zuweisungen: SchichtZuweisung[];
  mitarbeiter: Mitarbeiter[];
  stundenHoehe: number;
  onZuweisungDelete: (id: string) => void;
  onZuweisungStatusChange: (id: string, status: SchichtZuweisung['status']) => void;
  onZuweisungResize: (id: string, startZeit: string, endZeit: string) => void;
  onZuweisungResizeEnd: (id: string, startZeit: string, endZeit: string) => void;
  onZuweisungMove: (id: string, startZeit: string, endZeit: string) => void;
  onZuweisungMoveEnd: (id: string, startZeit: string, endZeit: string) => void;
  onNeueSchicht: (datum: string, startZeit: string, endZeit: string) => void;
  istHeute: boolean;
  istWochenende: boolean;
}

// Berechne Spalten für überlappende Schichten
function berechneSpalten(zuweisungen: SchichtZuweisung[]): Map<string, { index: number; total: number }> {
  const result = new Map<string, { index: number; total: number }>();

  // Sortiere nach Startzeit
  const sortiert = [...zuweisungen].sort((a, b) => {
    const zeitenA = getZeitenMitFallback(a);
    const zeitenB = getZeitenMitFallback(b);
    return zeitZuMinuten(zeitenA.startZeit) - zeitZuMinuten(zeitenB.startZeit);
  });

  // Spalten-Zuweisung (Greedy-Algorithmus)
  const spalten: SchichtZuweisung[][] = [];

  for (const z of sortiert) {
    const zeiten = getZeitenMitFallback(z);
    const startA = zeitZuMinuten(zeiten.startZeit);
    const endA = zeitZuMinuten(zeiten.endZeit);

    // Finde erste freie Spalte
    let spaltenIndex = 0;
    let gefunden = false;

    for (let i = 0; i < spalten.length; i++) {
      const spalte = spalten[i];
      const hatUeberlappung = spalte.some((other) => {
        const zeitenOther = getZeitenMitFallback(other);
        const startB = zeitZuMinuten(zeitenOther.startZeit);
        const endB = zeitZuMinuten(zeitenOther.endZeit);
        return startA < endB && endA > startB;
      });

      if (!hatUeberlappung) {
        spaltenIndex = i;
        gefunden = true;
        break;
      }
    }

    if (!gefunden) {
      spaltenIndex = spalten.length;
      spalten.push([]);
    }

    spalten[spaltenIndex].push(z);
  }

  // Berechne totale Spalten für jeden Zeitbereich
  for (const z of zuweisungen) {
    const zeiten = getZeitenMitFallback(z);
    const startA = zeitZuMinuten(zeiten.startZeit);
    const endA = zeitZuMinuten(zeiten.endZeit);

    // Zähle überlappende Schichten
    let maxUeberlappung = 1;
    for (const other of zuweisungen) {
      if (other.id === z.id) continue;
      const zeitenOther = getZeitenMitFallback(other);
      const startB = zeitZuMinuten(zeitenOther.startZeit);
      const endB = zeitZuMinuten(zeitenOther.endZeit);
      if (startA < endB && endA > startB) {
        maxUeberlappung++;
      }
    }

    // Finde Spaltenindex
    let index = 0;
    for (let i = 0; i < spalten.length; i++) {
      if (spalten[i].some((s) => s.id === z.id)) {
        index = i;
        break;
      }
    }

    result.set(z.id, { index, total: Math.max(maxUeberlappung, spalten.length) });
  }

  return result;
}

export default function TagesTimeline({
  datum,
  zuweisungen,
  mitarbeiter,
  stundenHoehe,
  onZuweisungDelete,
  onZuweisungStatusChange,
  onZuweisungResize,
  onZuweisungResizeEnd,
  onZuweisungMove,
  onZuweisungMoveEnd,
  onNeueSchicht,
  istHeute,
  istWochenende,
}: TagesTimelineProps) {
  const datumStr = formatDatum(datum);
  const wochentagIndex = datum.getDay() === 0 ? 6 : datum.getDay() - 1;

  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState<number | null>(null);
  const [createEnd, setCreateEnd] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Custom Drop-Handler für präzise Positionierung
  const { setNodeRef, isOver } = useDroppable({
    id: `timeline-${datumStr}`,
    data: {
      type: 'timeline',
      datum: datumStr,
      getDropTime: (clientY: number) => {
        if (!timelineRef.current) return '08:00';
        const rect = timelineRef.current.getBoundingClientRect();
        const y = clientY - rect.top;
        const minuten = Math.round((y / stundenHoehe) * 60 / 15) * 15;
        return minutenZuZeit(Math.max(0, Math.min(24 * 60 - 60, minuten)));
      }
    },
  });

  // Berechne Spalten für überlappende Schichten
  const spaltenMap = berechneSpalten(zuweisungen);

  // Stunden-Array (0-23)
  const stunden = Array.from({ length: 24 }, (_, i) => i);

  // Mouse Handler für Schicht-Erstellung
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Nur linke Maustaste

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const minuten = Math.round((y / stundenHoehe) * 60 / 15) * 15; // 15-Minuten-Raster

    setIsCreating(true);
    setCreateStart(minuten);
    setCreateEnd(minuten + 60); // Initial 1 Stunde
  }, [stundenHoehe]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isCreating || createStart === null) return;

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const minuten = Math.round((y / stundenHoehe) * 60 / 15) * 15;

    setCreateEnd(Math.max(createStart + 30, Math.min(24 * 60, minuten)));
  }, [isCreating, createStart, stundenHoehe]);

  const handleMouseUp = useCallback(() => {
    if (isCreating && createStart !== null && createEnd !== null && createEnd > createStart) {
      onNeueSchicht(datumStr, minutenZuZeit(createStart), minutenZuZeit(createEnd));
    }
    setIsCreating(false);
    setCreateStart(null);
    setCreateEnd(null);
  }, [isCreating, createStart, createEnd, datumStr, onNeueSchicht]);

  const handleMouseLeave = useCallback(() => {
    if (isCreating) {
      setIsCreating(false);
      setCreateStart(null);
      setCreateEnd(null);
    }
  }, [isCreating]);

  // Aktuelle Zeit-Linie
  const jetzt = new Date();
  const istHeuteTag = formatDatum(jetzt) === datumStr;
  const aktuelleMinuten = jetzt.getHours() * 60 + jetzt.getMinutes();
  const zeitLinieTop = (aktuelleMinuten / 60) * stundenHoehe;

  return (
    <div
      className={`
        flex flex-col min-w-[120px] flex-1 border-r border-gray-200 dark:border-dark-border last:border-r-0
        ${istWochenende ? 'bg-gray-50/50 dark:bg-dark-bg/30' : ''}
      `}
    >
      {/* Header */}
      <div
        className={`
          sticky top-0 z-20 px-2 py-2 text-center border-b border-gray-200 dark:border-dark-border
          bg-white/90 dark:bg-dark-surface/90 backdrop-blur-sm
          ${istWochenende ? 'bg-gray-50/90 dark:bg-dark-bg/90' : ''}
        `}
      >
        <div className={`text-sm font-medium ${istWochenende ? 'text-gray-500' : 'text-gray-700 dark:text-dark-text'}`}>
          {WOCHENTAGE_LANG[wochentagIndex]}
        </div>
        <div
          className={`
            inline-flex items-center justify-center w-8 h-8 mt-1 rounded-full text-sm font-bold
            ${istHeute
              ? 'bg-violet-600 text-white'
              : istWochenende
              ? 'text-gray-400 dark:text-dark-textMuted'
              : 'text-gray-900 dark:text-white'
            }
          `}
        >
          {datum.getDate()}
        </div>
      </div>

      {/* Timeline Grid */}
      <div
        ref={(node) => {
          setNodeRef(node);
          (timelineRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={`
          relative flex-1 select-none
          ${isOver ? 'bg-violet-50 dark:bg-violet-900/10' : ''}
        `}
        style={{ height: `${24 * stundenHoehe}px` }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Stunden-Linien */}
        {stunden.map((stunde) => (
          <div
            key={stunde}
            className="absolute left-0 right-0 border-t border-gray-100 dark:border-dark-border/50"
            style={{ top: `${stunde * stundenHoehe}px`, height: `${stundenHoehe}px` }}
          >
            {/* Halbe-Stunde Linie */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-gray-100 dark:border-dark-border/30"
              style={{ top: `${stundenHoehe / 2}px` }}
            />
          </div>
        ))}

        {/* Aktuelle Zeit-Linie */}
        {istHeuteTag && (
          <div
            className="absolute left-0 right-0 z-30 pointer-events-none"
            style={{ top: `${zeitLinieTop}px` }}
          >
            <div className="h-0.5 bg-red-500 dark:bg-red-400" />
            <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" />
          </div>
        )}

        {/* Schicht-Blöcke */}
        {zuweisungen.map((z) => {
          const ma = mitarbeiter.find((m) => m.id === z.mitarbeiterId);
          const spaltenInfo = spaltenMap.get(z.id) || { index: 0, total: 1 };

          return (
            <SchichtBlock
              key={z.id}
              zuweisung={z}
              mitarbeiter={ma}
              stundenHoehe={stundenHoehe}
              onDelete={() => onZuweisungDelete(z.id)}
              onStatusChange={(status) => onZuweisungStatusChange(z.id, status)}
              onResize={(start, end) => onZuweisungResize(z.id, start, end)}
              onResizeEnd={(start, end) => onZuweisungResizeEnd(z.id, start, end)}
              onMove={(start, end) => onZuweisungMove(z.id, start, end)}
              onMoveEnd={(start, end) => onZuweisungMoveEnd(z.id, start, end)}
              spaltenIndex={spaltenInfo.index}
              gesamtSpalten={spaltenInfo.total}
            />
          );
        })}

        {/* Erstellungs-Preview */}
        {isCreating && createStart !== null && createEnd !== null && (
          <div
            className="absolute left-1 right-1 bg-violet-200/80 dark:bg-violet-800/50 border-2 border-dashed border-violet-500 rounded-lg z-40 pointer-events-none"
            style={{
              top: `${(createStart / 60) * stundenHoehe}px`,
              height: `${((createEnd - createStart) / 60) * stundenHoehe}px`,
            }}
          >
            <div className="p-2 text-xs font-medium text-violet-700 dark:text-violet-300">
              {minutenZuZeit(createStart)} - {minutenZuZeit(createEnd)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
