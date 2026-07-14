import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronRight,
  Circle,
  CircleCheck,
  ListTodo,
  Network,
  Search,
  UserRound,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { MindmapNode } from '../../types/mindmap';
import {
  loadAllMindmapNodes,
  subscribeMindmap,
  updateMindmapNode,
} from '../../services/mindmapService';
import { istTaskUeberfaellig } from '../Mindmap/mindmapUtils';

type StatusFilter = 'alle' | 'offen' | 'ueberfaellig' | 'erledigt';

/** Pfad vom Task hoch bis zum Root, z. B. "Tennismehl › Instandhaltung › Radlader" */
const knotenPfad = (
  nodes: Record<string, MindmapNode>,
  task: MindmapNode
): string => {
  const teile: string[] = [];
  let current = task.parentId ? nodes[task.parentId] : undefined;
  while (current) {
    teile.unshift(current.titel);
    current = current.parentId ? nodes[current.parentId] : undefined;
  }
  return teile.join(' › ');
};

const TaskVerwaltung = () => {
  const [nodes, setNodes] = useState<Record<string, MindmapNode>>({});
  const [loading, setLoading] = useState(true);
  const [suche, setSuche] = useState('');
  const [status, setStatus] = useState<StatusFilter>('alle');
  const [zustaendigFilter, setZustaendigFilter] = useState('alle');

  useEffect(() => {
    let cancelled = false;
    loadAllMindmapNodes()
      .then((loaded) => {
        if (cancelled) return;
        setNodes(loaded);
        setLoading(false);
      })
      .catch((error) => {
        console.error('❌ Tasks konnten nicht geladen werden:', error);
        if (!cancelled) {
          toast.error('Tasks konnten nicht geladen werden');
          setLoading(false);
        }
      });
    const unsubscribe = subscribeMindmap((event, node) => {
      setNodes((prev) => {
        if (event === 'delete') {
          if (!prev[node.id]) return prev;
          const next = { ...prev };
          delete next[node.id];
          return next;
        }
        return { ...prev, [node.id]: node };
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const alleTasks = useMemo(
    () =>
      Object.values(nodes)
        .filter((n) => n.type === 'task')
        .map((task) => ({ task, pfad: knotenPfad(nodes, task) }))
        .sort(
          (a, b) =>
            (a.task.faelligAm || '9999').localeCompare(b.task.faelligAm || '9999') ||
            a.task.titel.localeCompare(b.task.titel)
        ),
    [nodes]
  );

  const zustaendige = useMemo(
    () =>
      [...new Set(alleTasks.map((t) => t.task.zustaendig).filter(Boolean))].sort() as string[],
    [alleTasks]
  );

  const gefiltert = alleTasks.filter(({ task, pfad }) => {
    if (status === 'offen' && task.erledigt) return false;
    if (status === 'erledigt' && !task.erledigt) return false;
    if (status === 'ueberfaellig' && !istTaskUeberfaellig(task)) return false;
    if (zustaendigFilter !== 'alle' && task.zustaendig !== zustaendigFilter)
      return false;
    if (suche) {
      const s = suche.toLowerCase();
      if (
        !task.titel.toLowerCase().includes(s) &&
        !pfad.toLowerCase().includes(s) &&
        !(task.zustaendig ?? '').toLowerCase().includes(s)
      ) {
        return false;
      }
    }
    return true;
  });

  const offen = alleTasks.filter((t) => !t.task.erledigt).length;
  const ueberfaellig = alleTasks.filter((t) => istTaskUeberfaellig(t.task)).length;

  const toggleErledigt = (task: MindmapNode) => {
    const updated = { ...task, erledigt: !task.erledigt };
    setNodes((prev) => ({ ...prev, [task.id]: updated }));
    updateMindmapNode(updated).catch((error) => {
      console.error('❌ Task nicht gespeichert:', error);
      toast.error('Änderung konnte nicht gespeichert werden');
    });
  };

  const filterButton = (wert: StatusFilter, label: string, anzahl?: number) => (
    <button
      onClick={() => setStatus(wert)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        status === wert
          ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-dark-surface dark:text-dark-textMuted dark:hover:bg-dark-surfaceHover'
      }`}
    >
      {label}
      {anzahl !== undefined && (
        <span className="ml-1.5 text-xs opacity-75">({anzahl})</span>
      )}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      {/* Kopfzeile */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 shadow-md">
          <ListTodo className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">
            Task-Verwaltung
          </h1>
          <p className="text-xs text-gray-500 dark:text-dark-textMuted">
            Alle Tasks aus allen Planungs-Boards — mit Details, Bildern, Subtasks
            und Zeiterfassung
          </p>
        </div>
      </div>

      {/* Filterleiste */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filterButton('alle', 'Alle', alleTasks.length)}
        {filterButton('offen', 'Offen', offen)}
        {filterButton('ueberfaellig', 'Überfällig', ueberfaellig)}
        {filterButton('erledigt', 'Erledigt', alleTasks.length - offen)}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suchen…"
            className="rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
          />
        </div>
        <select
          value={zustaendigFilter}
          onChange={(e) => setZustaendigFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
        >
          <option value="alle">Alle Zuständigen</option>
          {zustaendige.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-red-600"></div>
          <p className="mt-3 text-sm text-gray-500 dark:text-dark-textMuted">
            Lade Tasks…
          </p>
        </div>
      ) : gefiltert.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center dark:border-dark-border">
          <ListTodo className="mx-auto h-10 w-10 text-gray-300 dark:text-dark-textSubtle" />
          <p className="mt-3 text-sm text-gray-500 dark:text-dark-textMuted">
            {alleTasks.length === 0
              ? 'Noch keine Tasks — lege welche in der Mindmap an.'
              : 'Keine Tasks für diesen Filter.'}
          </p>
          <Link
            to="/planung"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline dark:text-dark-accentRed"
          >
            <Network className="h-4 w-4" />
            Zur Planung
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface">
          {gefiltert.map(({ task, pfad }, index) => {
            const ueberfaelligTask = istTaskUeberfaellig(task);
            return (
              <div
                key={task.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-surfaceHover ${
                  index > 0 ? 'border-t border-gray-100 dark:border-dark-border' : ''
                }`}
              >
                <button
                  onClick={() => toggleErledigt(task)}
                  title={task.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'}
                  className="shrink-0"
                >
                  {task.erledigt ? (
                    <CircleCheck className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300 hover:text-gray-400 dark:text-dark-textSubtle" />
                  )}
                </button>
                <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${
                      task.erledigt
                        ? 'text-gray-400 line-through dark:text-dark-textSubtle'
                        : 'text-gray-900 dark:text-dark-text'
                    }`}
                  >
                    {task.titel}
                  </p>
                  <p className="truncate text-xs text-gray-400 dark:text-dark-textSubtle">
                    {pfad || 'Ohne Knoten'}
                  </p>
                </Link>
                {task.zustaendig && (
                  <span className="hidden shrink-0 items-center gap-1 text-xs text-gray-500 sm:flex dark:text-dark-textMuted">
                    <UserRound className="h-3.5 w-3.5" />
                    {task.zustaendig}
                  </span>
                )}
                {task.faelligAm && (
                  <span
                    className={`flex shrink-0 items-center gap-1 text-xs font-medium ${
                      ueberfaelligTask
                        ? 'text-red-600 dark:text-dark-accentRed'
                        : 'text-gray-500 dark:text-dark-textMuted'
                    }`}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {format(parseISO(task.faelligAm), 'dd.MM.yyyy')}
                  </span>
                )}
                <Link to={`/tasks/${task.id}`} className="shrink-0">
                  <ChevronRight className="h-4 w-4 text-gray-300 dark:text-dark-textSubtle" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TaskVerwaltung;
