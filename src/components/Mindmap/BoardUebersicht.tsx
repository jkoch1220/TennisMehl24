import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutGrid,
  ListTodo,
  Network,
  Pencil,
  Plus,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { MindmapBoard, MindmapBoardTyp, MindmapNode } from '../../types/mindmap';
import {
  createBoard,
  deleteBoard,
  listBoards,
  loadAllMindmapNodes,
  subscribeBoards,
  updateBoard,
} from '../../services/mindmapService';

const BoardUebersicht = () => {
  const [boards, setBoards] = useState<MindmapBoard[]>([]);
  const [nodes, setNodes] = useState<Record<string, MindmapNode>>({});
  const [loading, setLoading] = useState(true);
  const [neuOffen, setNeuOffen] = useState(false);
  const [neuName, setNeuName] = useState('');
  const [neuTyp, setNeuTyp] = useState<MindmapBoardTyp>('organigramm');
  const [erstelle, setErstelle] = useState(false);
  const [umbenennenId, setUmbenennenId] = useState<string | null>(null);
  const [umbenennenName, setUmbenennenName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<MindmapBoard | null>(null);

  const reload = () => {
    Promise.all([listBoards(), loadAllMindmapNodes()])
      .then(([loadedBoards, loadedNodes]) => {
        setBoards(loadedBoards);
        setNodes(loadedNodes);
        setLoading(false);
      })
      .catch((error) => {
        console.error('❌ Boards konnten nicht geladen werden:', error);
        toast.error('Boards konnten nicht geladen werden');
        setLoading(false);
      });
  };

  useEffect(() => {
    reload();
    const unsubscribe = subscribeBoards(reload);
    return unsubscribe;
  }, []);

  const statistik = useMemo(() => {
    const stats: Record<string, { knoten: number; tasks: number }> = {};
    for (const node of Object.values(nodes)) {
      const s = (stats[node.boardId] ??= { knoten: 0, tasks: 0 });
      if (node.type === 'task') s.tasks++;
      else s.knoten++;
    }
    return stats;
  }, [nodes]);

  const anlegen = () => {
    const name = neuName.trim();
    if (!name || erstelle) return;
    setErstelle(true);
    createBoard(name, neuTyp)
      .then((board) => {
        // Realtime-Reload kann das Board schon eingefügt haben → Dedupe
        setBoards((prev) =>
          prev.some((b) => b.id === board.id)
            ? prev
            : [...prev, board].sort((a, b) => a.name.localeCompare(b.name))
        );
        setNeuOffen(false);
        setNeuName('');
        toast.success(`Board „${board.name}" angelegt`);
      })
      .catch((error) => {
        console.error('❌ Board nicht angelegt:', error);
        toast.error('Board konnte nicht angelegt werden');
      })
      .finally(() => setErstelle(false));
  };

  const umbenennen = (board: MindmapBoard) => {
    const name = umbenennenName.trim();
    setUmbenennenId(null);
    if (!name || name === board.name) return;
    const updated = { ...board, name };
    setBoards((prev) =>
      prev
        .map((b) => (b.id === board.id ? updated : b))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    updateBoard(updated).catch((error) => {
      console.error('❌ Board nicht umbenannt:', error);
      toast.error('Board konnte nicht umbenannt werden');
    });
  };

  const loeschen = (board: MindmapBoard) => {
    setConfirmDelete(null);
    setBoards((prev) => prev.filter((b) => b.id !== board.id));
    deleteBoard(board.id)
      .then(() => toast.info(`Board „${board.name}" gelöscht`))
      .catch((error) => {
        console.error('❌ Board nicht gelöscht:', error);
        toast.error('Board konnte nicht gelöscht werden');
        reload();
      });
  };

  const typInfo = (typ: MindmapBoardTyp) =>
    typ === 'prozess'
      ? { icon: Workflow, label: 'Prozess', farbe: 'from-blue-500 to-cyan-600' }
      : { icon: Network, label: 'Organigramm', farbe: 'from-teal-500 to-emerald-600' };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      {/* Kopfzeile */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-red-600 to-orange-600 shadow-md">
            <LayoutGrid className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              Geschäftsprozesse
            </h1>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted">
              Organigramme für Strukturen, Prozess-Diagramme für Abläufe — geteilt
              mit dem ganzen Team
            </p>
          </div>
        </div>
        <button
          onClick={() => setNeuOffen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-red-600 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:from-red-700 hover:to-orange-700"
        >
          <Plus className="h-4 w-4" />
          Neues Board
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-red-600"></div>
          <p className="mt-3 text-sm text-gray-500 dark:text-dark-textMuted">
            Lade Boards…
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => {
            const info = typInfo(board.typ);
            const Icon = info.icon;
            const stats = statistik[board.id] ?? { knoten: 0, tasks: 0 };
            return (
              <div
                key={board.id}
                className="group relative rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-dark-border dark:bg-dark-surface"
              >
                <Link to={`/geschaeftsprozesse/${board.id}`} className="block">
                  <div
                    className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r ${info.farbe} shadow-md`}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  {umbenennenId === board.id ? (
                    <input
                      autoFocus
                      value={umbenennenName}
                      onChange={(e) => setUmbenennenName(e.target.value)}
                      onBlur={() => umbenennen(board)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') umbenennen(board);
                        if (e.key === 'Escape') setUmbenennenId(null);
                      }}
                      onClick={(e) => e.preventDefault()}
                      className="w-full rounded border border-gray-300 bg-white px-1 py-0.5 font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-dark-border dark:bg-dark-input dark:text-dark-text"
                    />
                  ) : (
                    <h2 className="font-bold text-gray-900 dark:text-dark-text">
                      {board.name}
                    </h2>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-dark-textMuted">
                    {info.label} · {stats.knoten} Knoten
                    {stats.tasks > 0 && ` · ${stats.tasks} Tasks`}
                  </p>
                </Link>
                <div className="absolute right-3 top-3 flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => {
                      setUmbenennenId(board.id);
                      setUmbenennenName(board.name);
                    }}
                    title="Umbenennen"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-surfaceHover"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(board)}
                    title="Board löschen"
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Neues Board anlegen */}
          <button
            onClick={() => setNeuOffen(true)}
            className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 text-gray-400 transition-colors hover:border-red-400 hover:text-red-500 dark:border-dark-border dark:text-dark-textSubtle"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-medium">Neues Board</span>
          </button>
        </div>
      )}

      {/* Dialog: Neues Board */}
      {neuOffen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setNeuOffen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-dark-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">
                Neues Board
              </h2>
              <button
                onClick={() => setNeuOffen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-surfaceHover"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              autoFocus
              value={neuName}
              onChange={(e) => setNeuName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') anlegen();
              }}
              placeholder="Name, z. B. „Radlader reparieren“"
              className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-dark-border dark:bg-dark-input dark:text-dark-text"
            />
            <div className="mb-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => setNeuTyp('organigramm')}
                className={`rounded-xl border-2 p-3 text-left ${
                  neuTyp === 'organigramm'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-dark-border'
                }`}
              >
                <Network className="mb-1.5 h-5 w-5 text-teal-600" />
                <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                  Organigramm
                </p>
                <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                  Strukturen gliedern: Bereiche, Themen, Tasks
                </p>
              </button>
              <button
                onClick={() => setNeuTyp('prozess')}
                className={`rounded-xl border-2 p-3 text-left ${
                  neuTyp === 'prozess'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-dark-border'
                }`}
              >
                <Workflow className="mb-1.5 h-5 w-5 text-blue-600" />
                <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                  Prozess
                </p>
                <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                  Abläufe mit Schritten und Ja/Nein-Entscheidungen
                </p>
              </button>
            </div>
            <button
              onClick={anlegen}
              disabled={!neuName.trim() || erstelle}
              className="w-full rounded-lg bg-gradient-to-r from-red-600 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:from-red-700 hover:to-orange-700 disabled:opacity-50"
            >
              {erstelle ? 'Wird angelegt…' : 'Board anlegen'}
            </button>
          </div>
        </div>
      )}

      {/* Sicherheitsabfrage: Board löschen */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-dark-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-dark-accentRed" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-dark-text">
                  Board löschen?
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-dark-textMuted">
                  „{confirmDelete.name}" wird mit{' '}
                  <span className="font-semibold text-red-600 dark:text-dark-accentRed">
                    allen Knoten und Tasks
                  </span>{' '}
                  unwiderruflich gelöscht — für das ganze Team.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-surfaceHover"
              >
                Abbrechen
              </button>
              <button
                onClick={() => loeschen(confirmDelete)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Querverweis Task-Verwaltung */}
      <div className="mt-8 text-center">
        <Link
          to="/tasks"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 hover:underline dark:text-dark-textMuted"
        >
          <ListTodo className="h-4 w-4" />
          Alle Tasks in der Task-Verwaltung ansehen
        </Link>
      </div>
    </div>
  );
};

export default BoardUebersicht;
