import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  MeasuringStrategy,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Edit3, Trash2 } from 'lucide-react';
import type { WikiPage } from '../../../types/wiki';
import SortableTreeItem from './SortableTreeItem';
import { flattenTree, getChildrenIds, getProjection } from './treeUtils';

interface WikiPageTreeProps {
  tree: WikiPage[];
  expanded: Set<string>;
  selectedId?: string;
  onSelect: (page: WikiPage) => void;
  onToggle: (id: string) => void;
  onCreateSub: (parentId: string) => void;
  onEdit: (page: WikiPage) => void;
  onDelete: (page: WikiPage) => void;
  onMove: (activeId: string, newParentId: string | null, orderedSiblingIds: string[]) => void;
}

const INDENT = 16;

const WikiPageTree = ({
  tree,
  expanded,
  selectedId,
  onSelect,
  onToggle,
  onCreateSub,
  onEdit,
  onDelete,
  onMove,
}: WikiPageTreeProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const [menuFor, setMenuFor] = useState<WikiPage | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Sichtbare Einträge; beim Ziehen werden die Nachfahren des aktiven Elements ausgeblendet
  const visibleItems = useMemo(() => {
    const flat = flattenTree(tree, expanded);
    if (!activeId) return flat;
    const excluded = getChildrenIds(flat, [activeId]);
    return flat.filter((i) => !excluded.includes(i.id));
  }, [tree, expanded, activeId]);

  const sortedIds = useMemo(() => visibleItems.map((i) => i.id), [visibleItems]);

  const projected =
    activeId && overId
      ? getProjection(visibleItems, activeId, overId, offsetLeft, INDENT)
      : null;

  const activeItem = activeId ? visibleItems.find((i) => i.id === activeId) : null;

  const resetDrag = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setOverId(String(active.id));
    setMenuFor(null);
  };

  const handleDragMove = ({ delta }: DragMoveEvent) => setOffsetLeft(delta.x);

  const handleDragOver = ({ over }: DragOverEvent) => setOverId(over ? String(over.id) : null);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (projected && over) {
      const { parentId } = projected;
      const clonedItems = [...visibleItems];
      const overIndex = clonedItems.findIndex((i) => i.id === over.id);
      const activeIndex = clonedItems.findIndex((i) => i.id === active.id);
      if (activeIndex !== -1 && overIndex !== -1) {
        clonedItems[activeIndex] = { ...clonedItems[activeIndex], parentId };
        const sorted = arrayMove(clonedItems, activeIndex, overIndex);
        const siblingIds = sorted.filter((i) => i.parentId === parentId).map((i) => i.id);
        onMove(String(active.id), parentId, siblingIds);
      }
    }
    resetDrag();
  };

  const openMenu = (e: React.MouseEvent, page: WikiPage) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuFor(page);
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={resetDrag}
      >
        <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {visibleItems.map((item) => {
              const isActive = item.id === activeId;
              return (
                <SortableTreeItem
                  key={item.id}
                  page={item.page}
                  // Beim Ziehen projizierte Tiefe für das aktive Element anzeigen
                  depth={isActive && projected ? projected.depth : item.depth}
                  collapsed={item.collapsed}
                  hasChildren={item.childCount > 0}
                  selected={selectedId === item.id}
                  indentationWidth={INDENT}
                  onSelect={() => onSelect(item.page)}
                  onToggle={() => onToggle(item.id)}
                  onMenu={(e) => openMenu(e, item.page)}
                />
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeItem ? (
            <div className="flex items-center gap-1.5 px-2 py-2 rounded-lg bg-white dark:bg-slate-800 shadow-xl border border-gray-200 dark:border-slate-700">
              <span className="text-lg">{activeItem.page.icon || '📄'}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-dark-text">
                {activeItem.page.title}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Aktionsmenü */}
      {menuFor && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 min-w-[170px]"
            style={{ left: Math.min(menuPos.x, window.innerWidth - 190), top: menuPos.y }}
          >
            <button
              onClick={() => {
                onCreateSub(menuFor.$id!);
                setMenuFor(null);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <Plus className="w-4 h-4" /> Unterseite
            </button>
            <button
              onClick={() => {
                onEdit(menuFor);
                setMenuFor(null);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <Edit3 className="w-4 h-4" /> Bearbeiten
            </button>
            <hr className="my-1 border-gray-200 dark:border-slate-700" />
            <button
              onClick={() => {
                onDelete(menuFor);
                setMenuFor(null);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="w-4 h-4" /> Löschen
            </button>
          </div>
        </>
      )}
    </>
  );
};

export default WikiPageTree;
