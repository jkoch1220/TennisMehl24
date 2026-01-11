import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { Mitarbeiter } from '../../types/schichtplanung';

interface MitarbeiterChipProps {
  mitarbeiter: Mitarbeiter;
  isDragging?: boolean;
  isInCalendar?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export default function MitarbeiterChip({
  mitarbeiter,
  isDragging = false,
  isInCalendar = false,
  onContextMenu,
}: MitarbeiterChipProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: isInCalendar ? `zuweisung-${mitarbeiter.id}` : `mitarbeiter-${mitarbeiter.id}`,
    data: {
      type: isInCalendar ? 'zuweisung' : 'mitarbeiter',
      mitarbeiter,
    },
  });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
      }
    : undefined;

  const initials = `${mitarbeiter.vorname[0]}${mitarbeiter.nachname[0]}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onContextMenu={onContextMenu}
      className={`
        flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab select-none
        transition-all duration-200
        ${isDragging
          ? 'opacity-90 scale-105 shadow-xl z-50 ring-2 ring-violet-500'
          : 'hover:shadow-md'
        }
        ${isInCalendar
          ? 'bg-white/90 dark:bg-dark-bg/90 backdrop-blur-sm'
          : 'bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border'
        }
      `}
    >
      {/* Drag Handle */}
      <GripVertical className="w-3 h-3 text-gray-400 flex-shrink-0" />

      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: mitarbeiter.farbe }}
      >
        {initials}
      </div>

      {/* Name */}
      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
        {isInCalendar
          ? `${mitarbeiter.vorname[0]}. ${mitarbeiter.nachname}`
          : `${mitarbeiter.vorname} ${mitarbeiter.nachname}`
        }
      </span>
    </div>
  );
}
