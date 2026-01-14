import { useDroppable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';

interface TrashDropZoneProps {
  isActive: boolean; // Zeigt an ob gerade eine Schicht gezogen wird
}

export default function TrashDropZone({ isActive }: TrashDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'trash-zone',
    data: {
      type: 'trash',
    },
  });

  if (!isActive) return null;

  return (
    <div
      ref={setNodeRef}
      className={`
        mt-4 p-4 rounded-xl border-2 border-dashed transition-all duration-200
        flex flex-col items-center justify-center gap-2
        ${isOver
          ? 'border-red-500 bg-red-100 dark:bg-red-900/30 scale-105'
          : 'border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/50'
        }
      `}
    >
      <Trash2
        className={`w-8 h-8 transition-colors ${
          isOver ? 'text-red-500' : 'text-gray-400 dark:text-dark-textMuted'
        }`}
      />
      <span className={`text-sm font-medium transition-colors ${
        isOver ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-dark-textMuted'
      }`}>
        {isOver ? 'Loslassen zum Löschen' : 'Hierher ziehen zum Löschen'}
      </span>
    </div>
  );
}
