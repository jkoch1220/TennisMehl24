import { useDraggable } from '@dnd-kit/core';
import { Edit2, Trash2, GripVertical } from 'lucide-react';
import { Mitarbeiter } from '../../types/schichtplanung';

interface MitarbeiterListeProps {
  mitarbeiter: Mitarbeiter[];
  onEdit: (ma: Mitarbeiter) => void;
  onDelete: (ma: Mitarbeiter) => void;
}

function DraggableMitarbeiter({
  mitarbeiter,
  onEdit,
  onDelete,
}: {
  mitarbeiter: Mitarbeiter;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `mitarbeiter-${mitarbeiter.id}`,
    data: {
      type: 'mitarbeiter',
      mitarbeiter,
    },
  });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  const initials = `${mitarbeiter.vorname[0]}${mitarbeiter.nachname[0]}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center gap-2 p-2 rounded-lg
        bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border
        transition-all duration-200
        ${isDragging
          ? 'opacity-80 scale-105 shadow-xl ring-2 ring-violet-500'
          : 'hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm'
        }
      `}
    >
      {/* Drag Handle */}
      <div
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>

      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
        style={{ backgroundColor: mitarbeiter.farbe }}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {mitarbeiter.vorname} {mitarbeiter.nachname}
        </div>
        {mitarbeiter.position && (
          <div className="text-xs text-gray-500 dark:text-dark-textMuted truncate">
            {mitarbeiter.position}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-500 hover:text-violet-600 transition-colors"
          title="Bearbeiten"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-500 hover:text-red-600 transition-colors"
          title="Löschen"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function MitarbeiterListe({ mitarbeiter, onEdit, onDelete }: MitarbeiterListeProps) {
  if (mitarbeiter.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-dark-textMuted text-sm">
        Noch keine Mitarbeiter
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
      {mitarbeiter.map((ma) => (
        <DraggableMitarbeiter
          key={ma.id}
          mitarbeiter={ma}
          onEdit={() => onEdit(ma)}
          onDelete={() => onDelete(ma)}
        />
      ))}
    </div>
  );
}
