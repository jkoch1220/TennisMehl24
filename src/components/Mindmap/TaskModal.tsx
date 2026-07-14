import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CircleCheck,
  Circle,
  ExternalLink,
  ListTodo,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { MindmapNode } from '../../types/mindmap';
import { istTaskUeberfaellig } from './mindmapUtils';

interface TaskModalProps {
  task: MindmapNode;
  knotenTitel: string; // Titel des Eltern-Knotens (Kontext im Modal-Kopf)
  onPatch: (
    fields: Partial<
      Pick<MindmapNode, 'titel' | 'beschreibung' | 'faelligAm' | 'zustaendig' | 'erledigt'>
    >
  ) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Detail-Modal für einen Task. Änderungen werden live in den State
 * übernommen (Persistenz debounced im Mindmap-Container).
 */
const TaskModal = ({ task, knotenTitel, onPatch, onDelete, onClose }: TaskModalProps) => {
  const navigate = useNavigate();
  const [titelDraft, setTitelDraft] = useState(task.titel);
  const titelRef = useRef<HTMLInputElement>(null);

  // Bei Wechsel auf einen anderen Task den Draft neu initialisieren
  useEffect(() => {
    setTitelDraft(task.titel);
  }, [task.id, task.titel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitTitel = () => {
    const titel = titelDraft.trim();
    if (titel && titel !== task.titel) onPatch({ titel });
    else setTitelDraft(task.titel);
  };

  const ueberfaellig = istTaskUeberfaellig(task);

  const inputClasses =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-dark-border dark:bg-dark-input dark:text-dark-text';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-dark-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kopf */}
        <div className="flex items-start gap-3 border-b border-gray-100 p-5 dark:border-dark-border">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
            <ListTodo className="h-5 w-5 text-amber-600 dark:text-dark-accentOrange" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 dark:text-dark-textSubtle">
              Task in „{knotenTitel}"
            </p>
            <input
              ref={titelRef}
              value={titelDraft}
              onChange={(e) => setTitelDraft(e.target.value)}
              onBlur={commitTitel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitTitel();
                  titelRef.current?.blur();
                }
              }}
              placeholder="Task-Titel"
              className="w-full border-0 bg-transparent p-0 text-lg font-bold text-gray-900 focus:outline-none focus:ring-0 dark:text-dark-text"
            />
          </div>
          <button
            onClick={() => navigate(`/tasks/${task.id}`)}
            title="Vollansicht öffnen (Bilder, Subtasks, Zeiterfassung)"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-surfaceHover"
          >
            <ExternalLink className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            title="Schließen"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-surfaceHover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Felder */}
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
              Beschreibung
            </label>
            <textarea
              value={task.beschreibung ?? ''}
              onChange={(e) => onPatch({ beschreibung: e.target.value })}
              rows={4}
              placeholder="Worum geht es bei diesem Task?"
              className={`${inputClasses} resize-y`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                <CalendarDays className="h-3.5 w-3.5" />
                Fälligkeitsdatum
                {ueberfaellig && (
                  <span className="font-semibold text-red-600 dark:text-dark-accentRed">
                    · überfällig
                  </span>
                )}
              </label>
              <input
                type="date"
                value={task.faelligAm ?? ''}
                onChange={(e) => onPatch({ faelligAm: e.target.value })}
                className={inputClasses}
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                <UserRound className="h-3.5 w-3.5" />
                Zuständigkeit
              </label>
              <input
                type="text"
                list="mindmap-zustaendige"
                value={task.zustaendig ?? ''}
                onChange={(e) => onPatch({ zustaendig: e.target.value })}
                placeholder="Wer kümmert sich?"
                className={inputClasses}
              />
            </div>
          </div>
        </div>

        {/* Fußzeile */}
        <div className="flex items-center justify-between border-t border-gray-100 p-5 dark:border-dark-border">
          <button
            onClick={() => onPatch({ erledigt: !task.erledigt })}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              task.erledigt
                ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-dark-accentGreen'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-dark-elevated dark:text-dark-text dark:hover:bg-dark-surfaceHover'
            }`}
          >
            {task.erledigt ? (
              <>
                <CircleCheck className="h-4 w-4" />
                Erledigt
              </>
            ) : (
              <>
                <Circle className="h-4 w-4" />
                Als erledigt markieren
              </>
            )}
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-dark-accentRed dark:hover:bg-red-900/30"
          >
            <Trash2 className="h-4 w-4" />
            Task löschen
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
