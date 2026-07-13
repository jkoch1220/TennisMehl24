import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  FolderTree,
  ListTodo,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react';
import { MindmapNode, MindmapNodeType } from '../../types/mindmap';
import { istTaskUeberfaellig, NODE_WIDTH } from './mindmapUtils';

interface MindmapNodeCardProps {
  node: MindmapNode;
  isRoot: boolean;
  childCount: number;
  isEditing: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onAddChild: (type: MindmapNodeType) => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onChangeTitel: (titel: string) => void;
  onUpdateTask: (
    fields: Partial<Pick<MindmapNode, 'faelligAm' | 'zustaendig' | 'erledigt'>>
  ) => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
}

const MindmapNodeCard = ({
  node,
  isRoot,
  childCount,
  isEditing,
  onPointerDown,
  onAddChild,
  onToggleCollapse,
  onDelete,
  onChangeTitel,
  onUpdateTask,
  onStartEdit,
  onStopEdit,
}: MindmapNodeCardProps) => {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [titelDraft, setTitelDraft] = useState(node.titel);
  const titelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setTitelDraft(node.titel);
      titelInputRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const commitTitel = () => {
    const titel = titelDraft.trim();
    if (titel && titel !== node.titel) {
      onChangeTitel(titel);
    }
    onStopEdit();
  };

  const isTask = node.type === 'task';
  const ueberfaellig = istTaskUeberfaellig(node);

  const cardClasses = isRoot
    ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white border-transparent shadow-lg'
    : isTask
      ? `bg-white dark:bg-dark-surface border-l-4 ${
          ueberfaellig
            ? 'border-l-red-500 border-red-200 dark:border-red-900'
            : node.erledigt
              ? 'border-l-green-500 border-gray-200 dark:border-dark-border'
              : 'border-l-amber-500 border-gray-200 dark:border-dark-border'
        } shadow-md`
      : 'bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border shadow-md';

  return (
    <div
      className={`group absolute select-none rounded-xl border cursor-grab active:cursor-grabbing ${cardClasses}`}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
      onPointerDown={onPointerDown}
    >
      {/* Titelzeile */}
      <div className="flex items-center gap-1 px-2 py-2">
        {childCount > 0 ? (
          <button
            onClick={onToggleCollapse}
            title={node.collapsed ? 'Aufklappen' : 'Zuklappen'}
            className={`shrink-0 rounded p-0.5 ${
              isRoot
                ? 'hover:bg-white/20'
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-surfaceHover'
            }`}
          >
            {node.collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        ) : (
          isTask && (
            <button
              onClick={() => onUpdateTask({ erledigt: !node.erledigt })}
              title={node.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-surfaceHover"
            >
              {node.erledigt ? (
                <CircleCheck className="w-4 h-4 text-green-500" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
            </button>
          )
        )}

        {isEditing ? (
          <input
            ref={titelInputRef}
            autoFocus
            value={titelDraft}
            onChange={(e) => setTitelDraft(e.target.value)}
            onBlur={commitTitel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitel();
              if (e.key === 'Escape') onStopEdit();
            }}
            className="min-w-0 flex-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-input px-1 py-0.5 text-sm font-semibold text-gray-900 dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        ) : (
          <span
            onDoubleClick={onStartEdit}
            title="Doppelklick zum Umbenennen"
            className={`min-w-0 flex-1 truncate text-sm font-semibold ${
              isRoot
                ? 'text-white'
                : node.erledigt
                  ? 'text-gray-400 dark:text-dark-textSubtle line-through'
                  : 'text-gray-900 dark:text-dark-text'
            }`}
          >
            {node.titel}
          </span>
        )}

        {/* Anzahl versteckter Kinder bei eingeklapptem Knoten */}
        {node.collapsed && childCount > 0 && (
          <span
            className={`shrink-0 rounded-full px-1.5 text-xs font-medium ${
              isRoot
                ? 'bg-white/20 text-white'
                : 'bg-gray-100 text-gray-500 dark:bg-dark-elevated dark:text-dark-textMuted'
            }`}
          >
            {childCount}
          </span>
        )}

        {/* Aktionen (bei Hover) */}
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
          {!isTask && (
            <div className="relative">
              <button
                onClick={() => setAddMenuOpen((open) => !open)}
                title="Unterknoten oder Task hinzufügen"
                className={`rounded p-0.5 ${
                  isRoot
                    ? 'hover:bg-white/20'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-surfaceHover'
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>
              {addMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setAddMenuOpen(false)}
                  />
                  <div className="absolute left-0 top-6 z-20 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-dark-border dark:bg-dark-elevated">
                    <button
                      onClick={() => {
                        setAddMenuOpen(false);
                        onAddChild('knoten');
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-surfaceHover"
                    >
                      <FolderTree className="w-4 h-4 text-blue-500" />
                      Unterknoten
                    </button>
                    <button
                      onClick={() => {
                        setAddMenuOpen(false);
                        onAddChild('task');
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-surfaceHover"
                    >
                      <ListTodo className="w-4 h-4 text-amber-500" />
                      Task
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {!isRoot && (
            <button
              onClick={onDelete}
              title={childCount > 0 ? 'Knoten inkl. Unterknoten löschen' : 'Löschen'}
              className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Task-Felder: Fälligkeit + Zuständigkeit */}
      {isTask && (
        <div className="space-y-1 border-t border-gray-100 px-2 py-1.5 dark:border-dark-border">
          <label className="flex items-center gap-1.5">
            <CalendarDays
              className={`w-3.5 h-3.5 shrink-0 ${
                ueberfaellig ? 'text-red-500' : 'text-gray-400 dark:text-dark-textSubtle'
              }`}
            />
            <input
              type="date"
              value={node.faelligAm ?? ''}
              onChange={(e) => onUpdateTask({ faelligAm: e.target.value })}
              className={`w-full rounded border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-1 focus:ring-red-500 ${
                ueberfaellig
                  ? 'font-semibold text-red-600 dark:text-dark-accentRed'
                  : 'text-gray-600 dark:text-dark-textMuted'
              }`}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <UserRound className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-dark-textSubtle" />
            <input
              type="text"
              list="mindmap-zustaendige"
              value={node.zustaendig ?? ''}
              onChange={(e) => onUpdateTask({ zustaendig: e.target.value })}
              placeholder="Zuständig…"
              className="w-full rounded border-0 bg-transparent p-0 text-xs text-gray-600 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-red-500 dark:text-dark-textMuted dark:placeholder:text-dark-textSubtle"
            />
          </label>
        </div>
      )}
    </div>
  );
};

export default MindmapNodeCard;
