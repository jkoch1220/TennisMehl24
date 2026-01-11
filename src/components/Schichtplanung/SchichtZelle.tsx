import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import {
  Sunrise,
  Sun,
  Moon,
  AlertTriangle,
  Trash2,
  CheckCircle,
  Thermometer,
  Palmtree,
  MoreVertical,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import {
  SchichtTyp,
  SchichtZuweisung,
  Mitarbeiter,
  getSchichtConfig,
  SchichtEinstellungen,
  STATUS_CONFIG,
} from '../../types/schichtplanung';

interface SchichtZelleProps {
  datum: string;
  schichtTyp: SchichtTyp;
  zuweisungen: SchichtZuweisung[];
  mitarbeiter: Mitarbeiter[];
  einstellungen: SchichtEinstellungen;
  onZuweisungDelete: (id: string) => void;
  onZuweisungStatusChange: (id: string, status: SchichtZuweisung['status']) => void;
}

function ZuweisungItem({
  zuweisung,
  mitarbeiter,
  onDelete,
  onStatusChange,
}: {
  zuweisung: SchichtZuweisung;
  mitarbeiter: Mitarbeiter | undefined;
  onDelete: () => void;
  onStatusChange: (status: SchichtZuweisung['status']) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `zuweisung-${zuweisung.id}`,
    data: {
      type: 'zuweisung',
      zuweisung,
      mitarbeiter,
    },
  });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: isDragging ? 100 : undefined,
      }
    : undefined;

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
      ref={setNodeRef}
      style={style}
      className={`
        group relative flex items-center gap-1.5 px-2 py-1 rounded-md cursor-grab
        transition-all duration-200
        ${isDragging ? 'opacity-80 scale-105 shadow-lg z-50 ring-2 ring-violet-500' : ''}
        ${statusConfig.farbe} ${statusConfig.darkFarbe}
        border
      `}
      {...listeners}
      {...attributes}
    >
      {/* Avatar */}
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
        style={{ backgroundColor: mitarbeiter.farbe }}
      >
        {initials}
      </div>

      {/* Name */}
      <span className="text-xs font-medium truncate flex-1">
        {mitarbeiter.vorname[0]}. {mitarbeiter.nachname}
      </span>

      {/* Status Icon */}
      {StatusIcon && (
        <StatusIcon className="w-3 h-3 flex-shrink-0" />
      )}

      {/* Menu Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 transition-all"
      >
        <MoreVertical className="w-3 h-3" />
      </button>

      {/* Context Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-dark-surface rounded-lg shadow-xl border border-gray-200 dark:border-dark-border py-1 min-w-[140px]"
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

export default function SchichtZelle({
  datum,
  schichtTyp,
  zuweisungen,
  mitarbeiter,
  einstellungen,
  onZuweisungDelete,
  onZuweisungStatusChange,
}: SchichtZelleProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `${datum}-${schichtTyp}`,
    data: { datum, schichtTyp },
  });

  const config = getSchichtConfig(einstellungen)[schichtTyp];

  // Effektive Besetzung (ohne Krank/Urlaub)
  const effektiveBesetzung = zuweisungen.filter(
    (z) => z.status !== 'krank' && z.status !== 'urlaub'
  ).length;
  const istUnterbesetzt = effektiveBesetzung < config.minBesetzung;

  const SchichtIcon =
    schichtTyp === 'fruehschicht'
      ? Sunrise
      : schichtTyp === 'spaetschicht'
      ? Sun
      : Moon;

  // Prüfen ob der drag über diese Zelle ein gültiger Drop wäre
  const isValidDrop = active && isOver;

  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-[100px] p-2 rounded-lg border-2 transition-all duration-200
        ${isValidDrop
          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 scale-[1.02]'
          : istUnterbesetzt
          ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
          : 'border-transparent bg-gray-50/50 dark:bg-dark-bg/50'
        }
      `}
    >
      {/* Schicht Header */}
      <div className={`flex items-center justify-between mb-2`}>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r ${config.farbe} text-white`}>
          <SchichtIcon className="w-3 h-3" />
          <span>{config.kurzname}</span>
          <span className="opacity-80">{config.startZeit}</span>
        </div>
        {istUnterbesetzt && (
          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title="Unterbesetzt">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-[10px] font-medium">{effektiveBesetzung}/{config.minBesetzung}</span>
          </div>
        )}
      </div>

      {/* Zuweisungen */}
      <div className="space-y-1">
        {zuweisungen.map((z) => (
          <ZuweisungItem
            key={z.id}
            zuweisung={z}
            mitarbeiter={mitarbeiter.find((m) => m.id === z.mitarbeiterId)}
            onDelete={() => onZuweisungDelete(z.id)}
            onStatusChange={(status) => onZuweisungStatusChange(z.id, status)}
          />
        ))}
      </div>

      {/* Drop Indicator */}
      {isValidDrop && zuweisungen.length === 0 && (
        <div className="flex items-center justify-center h-8 rounded border-2 border-dashed border-violet-400 text-violet-500 text-xs mt-2">
          Hier ablegen
        </div>
      )}
    </div>
  );
}
