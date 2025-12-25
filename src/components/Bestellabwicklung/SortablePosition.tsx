import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ReactNode } from 'react';

interface SortablePositionProps {
  id: string;
  children: ReactNode;
  disabled?: boolean;
  accentColor?: 'blue' | 'orange' | 'green' | 'red';
}

const SortablePosition = ({ id, children, disabled = false, accentColor = 'blue' }: SortablePositionProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
  };

  const accentColors = {
    blue: 'border-blue-500 dark:border-blue-400',
    orange: 'border-orange-500 dark:border-orange-400',
    green: 'border-green-500 dark:border-green-400',
    red: 'border-red-500 dark:border-red-400',
  };

  const handleColors = {
    blue: 'hover:bg-blue-100 dark:hover:bg-blue-900/30 active:bg-blue-200 dark:active:bg-blue-800/40',
    orange: 'hover:bg-orange-100 dark:hover:bg-orange-900/30 active:bg-orange-200 dark:active:bg-orange-800/40',
    green: 'hover:bg-green-100 dark:hover:bg-green-900/30 active:bg-green-200 dark:active:bg-green-800/40',
    red: 'hover:bg-red-100 dark:hover:bg-red-900/30 active:bg-red-200 dark:active:bg-red-800/40',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border transition-all duration-200 ${
        isDragging
          ? `opacity-90 shadow-2xl z-50 scale-[1.02] ${accentColors[accentColor]} border-2`
          : 'border-gray-200 dark:border-slate-700'
      } ${
        isOver && !isDragging
          ? `${accentColors[accentColor]} border-2 shadow-lg`
          : ''
      }`}
    >
      {/* Drag Handle - oben links */}
      {!disabled && (
        <div
          {...attributes}
          {...listeners}
          className={`absolute top-2 left-2 p-1.5 rounded-md cursor-grab active:cursor-grabbing
            text-gray-400 dark:text-gray-500 transition-all duration-150
            ${handleColors[accentColor]}
            ${isDragging ? 'cursor-grabbing' : ''}`}
          title="Zum Verschieben ziehen"
        >
          {/* Strichelung / Grip Pattern */}
          <div className="flex flex-col gap-0.5">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-current" />
              <div className="w-1 h-1 rounded-full bg-current" />
            </div>
            <div className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-current" />
              <div className="w-1 h-1 rounded-full bg-current" />
            </div>
            <div className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-current" />
              <div className="w-1 h-1 rounded-full bg-current" />
            </div>
          </div>
        </div>
      )}

      {/* Content mit Padding für Handle */}
      <div className={!disabled ? 'pl-8' : ''}>
        {children}
      </div>
    </div>
  );
};

export default SortablePosition;
