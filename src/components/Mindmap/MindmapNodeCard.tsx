import { useEffect, useRef, useState } from 'react';
import {
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  ExternalLink,
  FileText,
  FolderTree,
  Link2,
  ListTodo,
  Plus,
  Split,
  Trash2,
  Workflow,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import AutoGrowTextarea from './AutoGrowTextarea';
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
  istProzess: boolean;
  childCount: number;
  isEditing: boolean;
  isDragging: boolean;
  // Quelle im Verbinden-Modus (freie Verbindung zu anderem Knoten)
  isConnectSource?: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onAddChild: (type: MindmapNodeType) => void;
  // Verbinden-Modus starten (nur auf Prozess-Boards gesetzt)
  onStartConnect?: () => void;
  // Schritt als Unterprozess kapseln (nur Prozess-Boards, normale Schritte)
  onMakeUnterprozess?: () => void;
  // Nur für type === 'prozess': das verlinkte Unterprozess-Board öffnen
  onOpenLinkedBoard?: () => void;
  // Detail-Popup öffnen (Beschreibung, Werkzeuge, Material)
  onOpenDetails: () => void;
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
  istProzess,
  childCount,
  isEditing,
  isDragging,
  isConnectSource,
  onPointerDown,
  onAddChild,
  onStartConnect,
  onMakeUnterprozess,
  onOpenLinkedBoard,
  onOpenDetails,
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
  const titelInputRef = useRef<HTMLTextAreaElement>(null);

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

  const istEntscheidung = node.type === 'entscheidung';
  // Unterprozess-Verweis: orange gekapselt, öffnet das verlinkte Board
  const istUnterprozess = node.type === 'prozess';

  return (
    <div
      onPointerDown={onPointerDown}
      className={`group absolute select-none rounded-xl border transition-[left,top] duration-200 ${
        isRoot
          ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white border-transparent shadow-lg'
          : istEntscheidung
            ? 'cursor-grab active:cursor-grabbing bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-400 dark:border-amber-600 shadow-md'
            : istUnterprozess
              ? 'cursor-grab active:cursor-grabbing bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-400 dark:border-orange-600 shadow-md'
              : 'cursor-grab active:cursor-grabbing bg-gray-100 dark:bg-dark-elevated border-gray-300 dark:border-dark-border shadow-md'
      } ${isDragging ? 'z-10 shadow-2xl ring-2 ring-red-400 dark:ring-dark-accentOrange' : ''} ${
        isConnectSource ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''
      }`}
      style={{ left: pos.x, top: pos.y, width: NODE_WIDTH }}
    >
      {/* Titelzeile (wächst mit umbrechendem Titel mit) */}
      <div className="flex min-h-10 items-start gap-1 px-2 py-[11px]">
        {istEntscheidung && (
          <Split className="mt-px h-4 w-4 shrink-0 rotate-90 text-amber-500" />
        )}
        {istUnterprozess && (
          <Workflow className="mt-px h-4 w-4 shrink-0 text-orange-500" />
        )}
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
          <AutoGrowTextarea
            ref={titelInputRef}
            autoFocus
            value={titelDraft}
            onChange={(e) => setTitelDraft(e.target.value)}
            onBlur={commitTitel}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitTitel();
              }
              if (e.key === 'Escape') onStopEdit();
            }}
            className="min-w-0 flex-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-input px-1 py-0.5 text-sm font-semibold leading-[18px] text-gray-900 dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        ) : (
          <span
            onDoubleClick={onStartEdit}
            title="Doppelklick zum Umbenennen"
            className={`min-w-0 flex-1 break-words text-sm font-semibold leading-[18px] ${
              isRoot ? 'text-white' : 'text-gray-900 dark:text-dark-text'
            }`}
          >
            {node.titel}
          </span>
        )}

        {/* Hinweis: dieser Schritt hat eine Beschreibung (Klick öffnet Details) */}
        {!isEditing && !!node.beschreibung?.trim() && (
          <button
            onClick={onOpenDetails}
            title="Beschreibung vorhanden — Details öffnen"
            className={`mt-px shrink-0 rounded p-0.5 ${
              isRoot ? 'text-white/70 hover:bg-white/20' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-surfaceHover'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
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

        {/* Unterprozess öffnen (immer sichtbar) */}
        {istUnterprozess && onOpenLinkedBoard && (
          <button
            onClick={onOpenLinkedBoard}
            title="Unterprozess öffnen"
            className="shrink-0 rounded p-0.5 text-orange-500 hover:bg-orange-100 hover:text-orange-700 dark:hover:bg-orange-900/40"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}

        {/* Aktionen (bei Hover) */}
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onOpenDetails}
            title="Details öffnen: Beschreibung, Werkzeuge, Material"
            className={`rounded p-0.5 ${
              isRoot
                ? 'hover:bg-white/20'
                : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-dark-surfaceHover'
            }`}
          >
            <FileText className="w-4 h-4" />
          </button>
          {onMakeUnterprozess && (
            <button
              onClick={onMakeUnterprozess}
              title="Als Unterprozess kapseln (legt ein eigenes Prozess-Board an)"
              className={`rounded p-0.5 ${
                isRoot
                  ? 'hover:bg-white/20'
                  : 'text-gray-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/30'
              }`}
            >
              <Boxes className="w-4 h-4" />
            </button>
          )}
          {onStartConnect && (
            <button
              onClick={onStartConnect}
              title="Verbindung zu anderem Schritt ziehen (danach Ziel anklicken)"
              className={`rounded p-0.5 ${
                isRoot
                  ? 'hover:bg-white/20'
                  : 'text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30'
              }`}
            >
              <Link2 className="w-4 h-4" />
            </button>
          )}
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
                    {istProzess ? (
                      <>
                        <Workflow className="w-4 h-4 text-blue-500" />
                        Schritt
                      </>
                    ) : (
                      <>
                        <FolderTree className="w-4 h-4 text-blue-500" />
                        Unterknoten
                      </>
                    )}
                  </button>
                  {istProzess && (
                    <button
                      onClick={() => {
                        setAddMenuOpen(false);
                        onAddChild('entscheidung');
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-surfaceHover"
                    >
                      <Split className="w-4 h-4 rotate-90 text-amber-500" />
                      Entscheidung
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setAddMenuOpen(false);
                      onAddChild('task');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-surfaceHover"
                  >
                    <ListTodo className="w-4 h-4 text-blue-500" />
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

      {/* Task-Liste (blau codiert): Klick auf eine Zeile öffnet das Detail-Modal */}
      {tasks.length > 0 && (
        <div
          className={`border-t py-1 ${
            isRoot
              ? 'border-white/20 bg-white/10'
              : 'border-blue-100 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-900/15'
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
                    : 'hover:bg-blue-100/70 dark:hover:bg-blue-900/30'
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
                        isRoot ? 'text-white/60' : 'text-blue-400 dark:text-blue-500'
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
