import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { WikiFile } from '../../types/wiki';
import WikiFileCard from './WikiFileCard';

interface SortableFileRowProps {
  file: WikiFile;
  onDelete: (file: WikiFile) => void;
  onInsert?: (file: WikiFile) => void;
}

const SortableFileRow = ({ file, onDelete, onInsert }: SortableFileRowProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: file.$id! });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1" {...attributes}>
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 dark:text-slate-600 dark:hover:text-slate-400 flex-shrink-0"
        title="Ziehen zum Sortieren"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <WikiFileCard file={file} onDelete={onDelete} onInsert={onInsert} compact />
      </div>
    </div>
  );
};

export default SortableFileRow;
