import { forwardRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, ChevronDown, Pin, MoreVertical, GripVertical, CornerDownRight } from 'lucide-react';
import type { WikiPage } from '../../../types/wiki';

interface SortableTreeItemProps {
  page: WikiPage;
  depth: number;
  collapsed: boolean;
  hasChildren: boolean;
  selected: boolean;
  indentationWidth: number;
  indicator?: boolean; // dieses Element wird gerade gezogen → als Drop-Indikator rendern
  highlighted?: boolean; // Zielordner, in den verschachtelt wird
  onSelect: () => void;
  onToggle: () => void;
  onMenu: (e: React.MouseEvent) => void;
}

const SortableTreeItem = forwardRef<HTMLDivElement, SortableTreeItemProps>((props, _ref) => {
  const {
    page,
    depth,
    collapsed,
    hasChildren,
    selected,
    indentationWidth,
    indicator,
    highlighted,
    onSelect,
    onToggle,
    onMenu,
  } = props;

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: page.$id! });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingLeft: `${8 + depth * indentationWidth}px`,
  };

  // Im Indikator-Modus: schlanke gestrichelte Leiste, eingerückt auf die Zieltiefe
  if (indicator) {
    return (
      <div ref={setNodeRef} style={style} className="relative" {...attributes}>
        <div className="flex items-center gap-2 h-9 rounded-lg border-2 border-dashed border-red-400 dark:border-red-500 bg-red-50/70 dark:bg-red-900/25 px-3 text-xs font-medium text-red-600 dark:text-red-300">
          <CornerDownRight className="w-3.5 h-3.5" />
          <span className="truncate">{page.title}</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="relative" {...attributes}>
      <div
        onClick={onSelect}
        className={`group flex items-center gap-1.5 pr-2 py-2 rounded-lg cursor-pointer transition-all ${
          highlighted
            ? 'bg-red-50 dark:bg-red-900/20 ring-2 ring-red-300 dark:ring-red-600'
            : selected
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-dark-text'
        }`}
      >
        {/* Drag-Griff */}
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-200"
          title="Ziehen zum Verschieben"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {/* Chevron / Platzhalter */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <span className="text-lg">{page.icon || '📄'}</span>
        <span className="flex-1 truncate text-sm font-medium">{page.title}</span>

        {page.isPinned && <Pin className="w-3 h-3 text-amber-500 flex-shrink-0" />}

        <button
          onClick={onMenu}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded flex-shrink-0"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

SortableTreeItem.displayName = 'SortableTreeItem';

export default SortableTreeItem;
