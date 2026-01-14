import { useState, useRef, useCallback, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Trash2,
  CheckCircle,
  Thermometer,
  Palmtree,
  MoreVertical,
} from 'lucide-react';
import {
  SchichtZuweisung,
  Mitarbeiter,
  zeitZuMinuten,
  minutenZuZeit,
  STATUS_CONFIG,
  DEFAULT_SCHICHT_EINSTELLUNGEN,
} from '../../types/schichtplanung';

// Hilfsfunktion um Zeiten mit Fallback zu bekommen
function getZeitenMitFallback(z: SchichtZuweisung): { startZeit: string; endZeit: string } {
  if (z.startZeit && z.endZeit) {
    return { startZeit: z.startZeit, endZeit: z.endZeit };
  }
  const settings = DEFAULT_SCHICHT_EINSTELLUNGEN[z.schichtTyp];
  return {
    startZeit: z.startZeit || settings.startZeit,
    endZeit: z.endZeit || settings.endZeit,
  };
}

interface SchichtBlockProps {
  zuweisung: SchichtZuweisung;
  mitarbeiter: Mitarbeiter | undefined;
  stundenHoehe: number; // Pixel pro Stunde
  onDelete: () => void;
  onStatusChange: (status: SchichtZuweisung['status']) => void;
  onResize: (startZeit: string, endZeit: string) => void;
  onResizeEnd: (startZeit: string, endZeit: string) => void;
  onMove: (startZeit: string, endZeit: string) => void;
  onMoveEnd: (startZeit: string, endZeit: string) => void;
  spaltenIndex: number;
  gesamtSpalten: number;
}

export default function SchichtBlock({
  zuweisung,
  mitarbeiter,
  stundenHoehe,
  onDelete,
  onStatusChange,
  onResize,
  onResizeEnd,
  onMove: _onMove,
  onMoveEnd: _onMoveEnd,
  spaltenIndex,
  gesamtSpalten,
}: SchichtBlockProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isResizing, setIsResizing] = useState<'top' | 'bottom' | null>(null);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [initialMinuten, setInitialMinuten] = useState({ start: 0, end: 0 });
  const currentZeitenRef = useRef({ startZeit: '', endZeit: '' });
  const menuRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `schicht-${zuweisung.id}`,
    data: {
      type: 'schicht',
      zuweisung,
      mitarbeiter,
    },
    disabled: isResizing !== null,
  });

  // Zeiten mit Fallback holen
  const zeiten = getZeitenMitFallback(zuweisung);
  const startMinuten = zeitZuMinuten(zeiten.startZeit);
  const endMinuten = zeitZuMinuten(zeiten.endZeit);
  const dauerMinuten = endMinuten > startMinuten ? endMinuten - startMinuten : (24 * 60 - startMinuten) + endMinuten;

  // Position und Größe berechnen
  const top = (startMinuten / 60) * stundenHoehe;
  const height = Math.max((dauerMinuten / 60) * stundenHoehe, 30); // Minimum 30px

  // Spaltenbreite für überlappende Schichten
  const spaltenBreite = 100 / gesamtSpalten;
  const left = spaltenIndex * spaltenBreite;

  const style = {
    top: `${top}px`,
    height: `${height}px`,
    left: `${left}%`,
    width: `${spaltenBreite}%`,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    zIndex: isDragging ? 100 : isResizing ? 50 : 10,
  };

  // Resize Handler
  const handleResizeStart = useCallback((e: React.MouseEvent, edge: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(edge);
    setResizeStartY(e.clientY);
    setInitialMinuten({ start: startMinuten, end: endMinuten });
  }, [startMinuten, endMinuten]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const deltaY = e.clientY - resizeStartY;
    const deltaMinuten = Math.round((deltaY / stundenHoehe) * 60 / 15) * 15; // 15-Minuten-Schritte

    let newStart = zeiten.startZeit;
    let newEnd = zeiten.endZeit;

    if (isResizing === 'top') {
      const neueStartMinuten = Math.max(0, Math.min(initialMinuten.end - 30, initialMinuten.start + deltaMinuten));
      newStart = minutenZuZeit(neueStartMinuten);
    } else {
      const neueEndMinuten = Math.max(initialMinuten.start + 30, Math.min(24 * 60, initialMinuten.end + deltaMinuten));
      newEnd = minutenZuZeit(neueEndMinuten);
    }

    // Speichere aktuelle Zeiten für onResizeEnd
    currentZeitenRef.current = { startZeit: newStart, endZeit: newEnd };
    onResize(newStart, newEnd);
  }, [isResizing, resizeStartY, stundenHoehe, initialMinuten, onResize, zeiten.startZeit, zeiten.endZeit]);

  const handleResizeEnd = useCallback(() => {
    if (currentZeitenRef.current.startZeit && currentZeitenRef.current.endZeit) {
      // Finale Speicherung an Server
      onResizeEnd(currentZeitenRef.current.startZeit, currentZeitenRef.current.endZeit);
    }
    setIsResizing(null);
    currentZeitenRef.current = { startZeit: '', endZeit: '' };
  }, [onResizeEnd]);

  // Effect für Resize Events
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!mitarbeiter) return null;

  const statusConfig = STATUS_CONFIG[zuweisung.status];
  const initials = `${mitarbeiter.vorname[0]}${mitarbeiter.nachname[0]}`;

  const StatusIcon =
    zuweisung.status === 'bestaetigt'
      ? CheckCircle
      : zuweisung.status === 'krank'
      ? Thermometer
      : zuweisung.status === 'urlaub'
      ? Palmtree
      : null;

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (blockRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={style}
      className={`
        absolute group rounded-lg border-2 overflow-hidden
        transition-shadow duration-200 select-none
        ${isDragging ? 'shadow-2xl ring-2 ring-violet-500 opacity-90' : 'shadow-sm hover:shadow-lg'}
        ${isResizing ? 'cursor-ns-resize' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      `}
    >
      {/* Resize Handle Top */}
      <div
        className="absolute top-0 left-0 right-0 h-2 cursor-n-resize hover:bg-white/30 transition-colors z-20"
        onMouseDown={(e) => handleResizeStart(e, 'top')}
      />

      {/* Main Content - dnd-kit für Cross-Day Dragging */}
      <div
        className={`h-full flex flex-col p-1.5 ${statusConfig.farbe} ${statusConfig.darkFarbe}`}
        style={{ backgroundColor: `${mitarbeiter.farbe}20`, borderColor: mitarbeiter.farbe }}
        {...listeners}
        {...attributes}
      >
        {/* Header */}
        <div className="flex items-center gap-1 mb-1">
          <GripVertical className="w-3 h-3 opacity-50 flex-shrink-0" />
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
            style={{ backgroundColor: mitarbeiter.farbe }}
          >
            {initials}
          </div>
          <span className="text-xs font-semibold truncate flex-1" style={{ color: mitarbeiter.farbe }}>
            {mitarbeiter.vorname[0]}. {mitarbeiter.nachname}
          </span>
          {StatusIcon && <StatusIcon className="w-3 h-3 flex-shrink-0" style={{ color: mitarbeiter.farbe }} />}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 transition-all"
          >
            <MoreVertical className="w-3 h-3" />
          </button>
        </div>

        {/* Zeitangabe */}
        <div className="text-[10px] font-medium opacity-80 px-1" style={{ color: mitarbeiter.farbe }}>
          {zeiten.startZeit} - {zeiten.endZeit}
        </div>

        {/* Dauer wenn genug Platz */}
        {height > 60 && (
          <div className="text-[9px] opacity-60 px-1 mt-auto" style={{ color: mitarbeiter.farbe }}>
            {Math.round(dauerMinuten / 60 * 10) / 10}h
          </div>
        )}
      </div>

      {/* Resize Handle Bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize hover:bg-white/30 transition-colors z-20"
        onMouseDown={(e) => handleResizeStart(e, 'bottom')}
      />

      {/* Context Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-[200] bg-white dark:bg-dark-surface rounded-lg shadow-xl border border-gray-200 dark:border-dark-border py-1 min-w-[140px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onStatusChange('bestaetigt');
              setShowMenu(false);
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4 text-green-600" />
            Bestätigen
          </button>
          <button
            onClick={() => {
              onStatusChange('krank');
              setShowMenu(false);
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
          >
            <Thermometer className="w-4 h-4 text-red-600" />
            Krank melden
          </button>
          <button
            onClick={() => {
              onStatusChange('urlaub');
              setShowMenu(false);
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
          >
            <Palmtree className="w-4 h-4 text-blue-600" />
            Urlaub
          </button>
          <hr className="my-1 border-gray-200 dark:border-dark-border" />
          <button
            onClick={() => {
              onDelete();
              setShowMenu(false);
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Entfernen
          </button>
        </div>
      )}
    </div>
  );
}
