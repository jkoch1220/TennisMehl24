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
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { MindmapNode, MindmapNodeType } from '../../types/mindmap';
import {
  istTaskUeberfaellig,
  LayoutPos,
  NODE_WIDTH,
  TASK_ROW_HEIGHT,
} from './mindmapUtils';

interface MindmapNodeCardProps {
  node: MindmapNode;
  pos: LayoutPos;
  tasks: MindmapNode[];
  isRoot: boolean;
  childCount: number;
  isEditing: boolean;
  onAddChild: (type: MindmapNodeType) => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onChangeTitel: (titel: string) => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onOpenTask: (taskId: string) => void;
  onToggleTaskErledigt: (task: MindmapNode) => void;
}

const MindmapNodeCard = ({
  node,
  pos,
  tasks,
  isRoot,
  childCount,
  isEditing,
  onAddChild,
  onToggleCollapse,
  onDelete,
  onChangeTitel,
  onStartEdit,
  onStopEdit,
  onOpenTask,
  onToggleTaskErledigt,
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

  return (
    <div
      className={`group absolute select-none rounded-xl border transition-[left,top] duration-200 ${
        isRoot
          ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white border-transparent shadow-lg'
          : 'bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border shadow-md'
      }`}
      style={{ left: pos.x, top: pos.y, width: NODE_WIDTH }}
    >
      {/* Titelzeile */}
      <div className="flex h-10 items-center gap-1 px-2">
        {childCount > 0 && (
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
              isRoot ? 'text-white' : 'text-gray-900 dark:text-dark-text'
            }`}
          >
            {node.titel}
          </span>
        )}

        {/* Anzahl versteckter Unterknoten bei eingeklapptem Knoten */}
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
          {!isRoot && (
            <button
              onClick={onDelete}
              title={
                childCount > 0 || tasks.length > 0
                  ? 'Knoten inkl. Unterknoten und Tasks löschen'
                  : 'Löschen'
              }
              className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Task-Liste: Klick auf eine Zeile öffnet das Detail-Modal */}
      {tasks.length > 0 && (
        <div
          className={`border-t py-1 ${
            isRoot
              ? 'border-white/20'
              : 'border-gray-100 dark:border-dark-border'
          }`}
        >
          {tasks.map((task) => {
            const ueberfaellig = istTaskUeberfaellig(task);
            return (
              <button
                key={task.id}
                onClick={() => onOpenTask(task.id)}
                title="Task öffnen"
                style={{ height: TASK_ROW_HEIGHT }}
                className={`flex w-full items-center gap-1.5 px-2 text-left ${
                  isRoot
                    ? 'hover:bg-white/15'
                    : 'hover:bg-gray-50 dark:hover:bg-dark-surfaceHover'
                }`}
              >
                <span
                  role="checkbox"
                  aria-checked={!!task.erledigt}
                  title={
                    task.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTaskErledigt(task);
                  }}
                  className="shrink-0"
                >
                  {task.erledigt ? (
                    <CircleCheck className="w-4 h-4 text-green-500" />
                  ) : (
                    <Circle
                      className={`w-4 h-4 ${
                        isRoot ? 'text-white/60' : 'text-gray-300 dark:text-dark-textSubtle'
                      }`}
                    />
                  )}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-xs ${
                    task.erledigt
                      ? 'text-gray-400 line-through dark:text-dark-textSubtle'
                      : isRoot
                        ? 'text-white'
                        : 'text-gray-700 dark:text-dark-text'
                  }`}
                >
                  {task.titel}
                </span>
                {task.faelligAm && (
                  <span
                    className={`flex shrink-0 items-center gap-0.5 text-[10px] font-medium ${
                      ueberfaellig
                        ? 'text-red-600 dark:text-dark-accentRed'
                        : isRoot
                          ? 'text-white/70'
                          : 'text-gray-400 dark:text-dark-textMuted'
                    }`}
                  >
                    <CalendarDays className="w-3 h-3" />
                    {format(parseISO(task.faelligAm), 'dd.MM.')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MindmapNodeCard;
