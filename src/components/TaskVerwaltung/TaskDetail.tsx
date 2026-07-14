import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Circle,
  CircleCheck,
  Clock,
  Hourglass,
  ImagePlus,
  ListChecks,
  Network,
  Play,
  Plus,
  Square,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import {
  MindmapNode,
  MindmapSubtask,
  MindmapZeiteintrag,
} from '../../types/mindmap';
import {
  createSubtask,
  createZeiteintrag,
  deleteSubtask,
  deleteTaskBild,
  deleteZeiteintrag,
  getTaskBildUrl,
  listSubtasks,
  listZeiteintraege,
  loadAllMindmapNodes,
  updateMindmapNode,
  updateSubtask,
  uploadTaskBild,
} from '../../services/mindmapService';
import { getCachedUsersList } from '../../services/userCacheService';
import { istTaskUeberfaellig } from '../Mindmap/mindmapUtils';

const TIMER_STORAGE_KEY = 'tm_task_timer';

interface RunningTimer {
  taskId: string;
  start: number; // Unix-Millisekunden
}

const loadTimer = (): RunningTimer | null => {
  try {
    const stored = localStorage.getItem(TIMER_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as RunningTimer;
  } catch {
    /* ignorieren */
  }
  return null;
};

const minutenAnzeige = (minuten: number): string => {
  if (minuten >= 60) {
    const h = Math.floor(minuten / 60);
    const m = minuten % 60;
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }
  return `${minuten} min`;
};

const TaskDetail = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [nodes, setNodes] = useState<Record<string, MindmapNode>>({});
  const [task, setTask] = useState<MindmapNode | null>(null);
  const [subtasks, setSubtasks] = useState<MindmapSubtask[]>([]);
  const [zeiten, setZeiten] = useState<MindmapZeiteintrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [neuerSubtask, setNeuerSubtask] = useState('');
  const [zeitMinuten, setZeitMinuten] = useState('');
  const [zeitNotiz, setZeitNotiz] = useState('');
  const [timer, setTimer] = useState<RunningTimer | null>(() => loadTimer());
  const [timerTick, setTimerTick] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [confirmBildId, setConfirmBildId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskRef = useRef<MindmapNode | null>(null);
  taskRef.current = task;

  // Laden: alle Nodes (für Pfad) + Subtasks + Zeiteinträge
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    Promise.all([loadAllMindmapNodes(), listSubtasks(taskId), listZeiteintraege(taskId)])
      .then(([loadedNodes, loadedSubtasks, loadedZeiten]) => {
        if (cancelled) return;
        setNodes(loadedNodes);
        setTask(loadedNodes[taskId] ?? null);
        setSubtasks(loadedSubtasks);
        setZeiten(loadedZeiten);
        setLoading(false);
      })
      .catch((error) => {
        console.error('❌ Task konnte nicht geladen werden:', error);
        if (!cancelled) {
          toast.error('Task konnte nicht geladen werden');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Timer-Anzeige im Sekundentakt aktualisieren
  useEffect(() => {
    if (!timer) return;
    const interval = setInterval(() => setTimerTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // Ausstehende Änderung beim Verlassen noch rausschreiben
  useEffect(
    () => () => {
      if (saveTimeout.current && taskRef.current) {
        clearTimeout(saveTimeout.current);
        updateMindmapNode(taskRef.current).catch(() => undefined);
      }
    },
    []
  );

  const patchTask = (patch: Partial<MindmapNode>) => {
    setTask((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        saveTimeout.current = null;
        updateMindmapNode(next).catch((error) => {
          console.error('❌ Task nicht gespeichert:', error);
          toast.error('Änderung konnte nicht gespeichert werden');
        });
      }, 600);
      return next;
    });
  };

  // --- Subtasks ---

  const addSubtask = () => {
    const titel = neuerSubtask.trim();
    if (!titel || !taskId) return;
    setNeuerSubtask('');
    const sortOrder = subtasks.length
      ? Math.max(...subtasks.map((s) => s.sortOrder)) + 1
      : 0;
    createSubtask(taskId, titel, sortOrder)
      .then((subtask) => setSubtasks((prev) => [...prev, subtask]))
      .catch((error) => {
        console.error('❌ Subtask nicht angelegt:', error);
        toast.error('Subtask konnte nicht angelegt werden');
      });
  };

  const toggleSubtask = (subtask: MindmapSubtask) => {
    const updated = { ...subtask, erledigt: !subtask.erledigt };
    setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? updated : s)));
    updateSubtask(updated).catch((error) => {
      console.error('❌ Subtask nicht gespeichert:', error);
      toast.error('Subtask konnte nicht gespeichert werden');
    });
  };

  const removeSubtask = (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    deleteSubtask(id).catch((error) => {
      console.error('❌ Subtask nicht gelöscht:', error);
      toast.error('Subtask konnte nicht gelöscht werden');
    });
  };

  // --- Zeiterfassung ---

  const erfassteMinuten = zeiten.reduce((sum, z) => sum + z.minuten, 0);
  const timerLaeuftHier = timer?.taskId === taskId;
  const timerMinuten = timerLaeuftHier
    ? Math.max(0, Math.floor((Date.now() - timer!.start) / 60000))
    : 0;
  void timerTick; // Re-Render-Trigger für die laufende Timer-Anzeige

  const speichereZeit = (minuten: number, beschreibung: string) => {
    if (!taskId || minuten <= 0) return;
    createZeiteintrag({
      taskId,
      person: user?.name ?? '',
      beschreibung,
      datum: format(new Date(), 'yyyy-MM-dd'),
      minuten,
    })
      .then((eintrag) => setZeiten((prev) => [eintrag, ...prev]))
      .catch((error) => {
        console.error('❌ Zeiteintrag nicht angelegt:', error);
        toast.error('Zeit konnte nicht erfasst werden');
      });
  };

  const startTimer = () => {
    if (!taskId) return;
    const running: RunningTimer = { taskId, start: Date.now() };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(running));
    setTimer(running);
  };

  const stopTimer = () => {
    if (!timerLaeuftHier || !timer) return;
    const minuten = Math.max(1, Math.round((Date.now() - timer.start) / 60000));
    localStorage.removeItem(TIMER_STORAGE_KEY);
    setTimer(null);
    speichereZeit(minuten, 'Timer');
    toast.success(`${minutenAnzeige(minuten)} erfasst`);
  };

  const addManuelleZeit = () => {
    const minuten = parseInt(zeitMinuten, 10);
    if (!minuten || minuten <= 0) return;
    speichereZeit(minuten, zeitNotiz.trim());
    setZeitMinuten('');
    setZeitNotiz('');
  };

  const removeZeit = (id: string) => {
    setZeiten((prev) => prev.filter((z) => z.id !== id));
    deleteZeiteintrag(id).catch((error) => {
      console.error('❌ Zeiteintrag nicht gelöscht:', error);
      toast.error('Zeiteintrag konnte nicht gelöscht werden');
    });
  };

  // --- Bilder ---

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !taskRef.current) return;
    setUploading(true);
    try {
      const neueIds: string[] = [];
      for (const file of Array.from(files)) {
        neueIds.push(await uploadTaskBild(file));
      }
      patchTask({ bilderIds: [...(taskRef.current.bilderIds ?? []), ...neueIds] });
    } catch (error) {
      console.error('❌ Bild-Upload fehlgeschlagen:', error);
      toast.error(error instanceof Error ? error.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeBild = (fileId: string) => {
    patchTask({
      bilderIds: (taskRef.current?.bilderIds ?? []).filter((id) => id !== fileId),
    });
    deleteTaskBild(fileId).catch(() => undefined);
    setConfirmBildId(null);
  };

  const zustaendige = useMemo(() => getCachedUsersList(), []);

  const pfad = useMemo(() => {
    if (!task) return [];
    const teile: MindmapNode[] = [];
    let current = task.parentId ? nodes[task.parentId] : undefined;
    while (current) {
      teile.unshift(current);
      current = current.parentId ? nodes[current.parentId] : undefined;
    }
    return teile;
  }, [nodes, task]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-red-600"></div>
        <p className="mt-3 text-sm text-gray-500 dark:text-dark-textMuted">
          Lade Task…
        </p>
      </div>
    );
  }

  if (!task || task.type !== 'task') {
    return (
      <div className="py-24 text-center">
        <p className="text-gray-600 dark:text-dark-textMuted">
          Task nicht gefunden — vielleicht wurde er gelöscht.
        </p>
        <button
          onClick={() => navigate('/tasks')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-red-600 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-md"
        >
          <ArrowLeft className="h-4 w-4" />
          Zur Task-Verwaltung
        </button>
      </div>
    );
  }

  const toggleTaskErledigt = () => patchTask({ erledigt: !taskRef.current?.erledigt });

  const ueberfaellig = istTaskUeberfaellig(task);
  const erledigteSubtasks = subtasks.filter((s) => s.erledigt).length;
  const geschaetzt = task.geschaetztMinuten ?? 0;
  const fortschritt =
    geschaetzt > 0 ? Math.min(150, Math.round((erfassteMinuten / geschaetzt) * 100)) : 0;

  const inputClasses =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-dark-border dark:bg-dark-input dark:text-dark-text';

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      {/* Breadcrumb + Kopf */}
      <div className="mb-1 flex items-center gap-2 text-xs text-gray-400 dark:text-dark-textSubtle">
        <Link to="/tasks" className="hover:text-red-600 hover:underline">
          Task-Verwaltung
        </Link>
        {pfad.map((k) => (
          <span key={k.id} className="flex items-center gap-2">
            <span>›</span>
            <span>{k.titel}</span>
          </span>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => toggleTaskErledigt()}
          title={task.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'}
        >
          {task.erledigt ? (
            <CircleCheck className="h-7 w-7 text-green-500" />
          ) : (
            <Circle className="h-7 w-7 text-gray-300 hover:text-gray-400 dark:text-dark-textSubtle" />
          )}
        </button>
        <input
          value={task.titel}
          onChange={(e) => patchTask({ titel: e.target.value })}
          className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-bold focus:outline-none focus:ring-0 ${
            task.erledigt
              ? 'text-gray-400 line-through dark:text-dark-textSubtle'
              : 'text-gray-900 dark:text-dark-text'
          }`}
        />
        <Link
          to={task.boardId ? `/planung/${task.boardId}` : '/planung'}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text dark:hover:bg-dark-surfaceHover"
        >
          <Network className="h-4 w-4" />
          Zum Board
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Hauptspalte */}
        <div className="space-y-6 lg:col-span-2">
          {/* Beschreibung */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-dark-text">
              Beschreibung
            </h2>
            <textarea
              value={task.beschreibung ?? ''}
              onChange={(e) => patchTask({ beschreibung: e.target.value })}
              rows={6}
              placeholder="Beschreibe vollumfänglich, worum es bei diesem Task geht…"
              className={`${inputClasses} resize-y`}
            />
          </section>

          {/* Bilder */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                Bilder ({task.bilderIds?.length ?? 0})
              </h2>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-dark-elevated dark:text-dark-text dark:hover:bg-dark-surfaceHover"
              >
                <ImagePlus className="h-4 w-4" />
                {uploading ? 'Lädt hoch…' : 'Bild hochladen'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
            {(task.bilderIds?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-dark-textSubtle">
                Noch keine Bilder — Screenshots, Fotos vom Platz, Skizzen…
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(task.bilderIds ?? []).map((fileId) => (
                  <div
                    key={fileId}
                    className="group relative overflow-hidden rounded-xl border border-gray-200 dark:border-dark-border"
                  >
                    <a
                      href={getTaskBildUrl(fileId)}
                      target="_blank"
                      rel="noreferrer"
                      title="In voller Größe öffnen"
                    >
                      <img
                        src={getTaskBildUrl(fileId, true)}
                        alt="Task-Bild"
                        loading="lazy"
                        className="aspect-video w-full object-cover"
                      />
                    </a>
                    <button
                      onClick={() => setConfirmBildId(fileId)}
                      title="Bild löschen"
                      className="absolute right-1.5 top-1.5 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Subtasks */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-dark-text">
                <ListChecks className="h-4 w-4 text-amber-500" />
                Subtasks
              </h2>
              {subtasks.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-dark-textSubtle">
                  {erledigteSubtasks}/{subtasks.length} erledigt
                </span>
              )}
            </div>
            {subtasks.length > 0 && (
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-elevated">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{
                    width: `${Math.round((erledigteSubtasks / subtasks.length) * 100)}%`,
                  }}
                />
              </div>
            )}
            <div className="space-y-1">
              {subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-dark-surfaceHover"
                >
                  <button onClick={() => toggleSubtask(subtask)} className="shrink-0">
                    {subtask.erledigt ? (
                      <CircleCheck className="h-4 w-4 text-green-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-gray-300 dark:text-dark-textSubtle" />
                    )}
                  </button>
                  <span
                    className={`min-w-0 flex-1 text-sm ${
                      subtask.erledigt
                        ? 'text-gray-400 line-through dark:text-dark-textSubtle'
                        : 'text-gray-700 dark:text-dark-text'
                    }`}
                  >
                    {subtask.titel}
                  </span>
                  <button
                    onClick={() => removeSubtask(subtask.id)}
                    title="Subtask löschen"
                    className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100 dark:text-dark-textSubtle"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Plus className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                value={neuerSubtask}
                onChange={(e) => setNeuerSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSubtask();
                }}
                placeholder="Neuen Subtask hinzufügen und Enter drücken…"
                className="w-full border-0 bg-transparent p-1 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none dark:text-dark-text dark:placeholder:text-dark-textSubtle"
              />
            </div>
          </section>
        </div>

        {/* Seitenleiste */}
        <div className="space-y-6">
          {/* Eckdaten */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-dark-text">
              Eckdaten
            </h2>
            <div className="space-y-3">
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
                  onChange={(e) => patchTask({ faelligAm: e.target.value })}
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
                  list="task-zustaendige"
                  value={task.zustaendig ?? ''}
                  onChange={(e) => patchTask({ zustaendig: e.target.value })}
                  placeholder="Wer kümmert sich?"
                  className={inputClasses}
                />
                <datalist id="task-zustaendige">
                  {zustaendige.map((u) => (
                    <option key={u.$id} value={u.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-dark-textMuted">
                  <Hourglass className="h-3.5 w-3.5" />
                  Geschätzter Aufwand (Minuten)
                </label>
                <input
                  type="number"
                  min={0}
                  step={15}
                  value={geschaetzt || ''}
                  onChange={(e) =>
                    patchTask({ geschaetztMinuten: parseInt(e.target.value, 10) || 0 })
                  }
                  placeholder="z. B. 120"
                  className={inputClasses}
                />
                {geschaetzt > 0 && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-dark-textSubtle">
                    = {minutenAnzeige(geschaetzt)}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Zeiterfassung & Messung */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-dark-text">
              <Clock className="h-4 w-4 text-blue-500" />
              Zeiterfassung
            </h2>

            {/* Messung: erfasst vs. geschätzt */}
            <div className="mb-4 rounded-xl bg-gray-50 p-3 dark:bg-dark-elevated">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                  {minutenAnzeige(erfassteMinuten)}
                </span>
                {geschaetzt > 0 && (
                  <span className="text-xs text-gray-500 dark:text-dark-textMuted">
                    von {minutenAnzeige(geschaetzt)} geschätzt
                  </span>
                )}
              </div>
              {geschaetzt > 0 && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-border">
                  <div
                    className={`h-full rounded-full transition-all ${
                      erfassteMinuten > geschaetzt ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, fortschritt)}%` }}
                  />
                </div>
              )}
            </div>

            {/* Timer */}
            {timerLaeuftHier ? (
              <button
                onClick={stopTimer}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Square className="h-4 w-4" />
                Timer stoppen ({minutenAnzeige(Math.max(1, timerMinuten))})
              </button>
            ) : (
              <button
                onClick={startTimer}
                disabled={!!timer}
                title={timer ? 'Es läuft bereits ein Timer für einen anderen Task' : ''}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Timer starten
              </button>
            )}

            {/* Manueller Eintrag */}
            <div className="mb-4 flex gap-2">
              <input
                type="number"
                min={1}
                value={zeitMinuten}
                onChange={(e) => setZeitMinuten(e.target.value)}
                placeholder="Min."
                className={`${inputClasses} w-20`}
              />
              <input
                value={zeitNotiz}
                onChange={(e) => setZeitNotiz(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addManuelleZeit();
                }}
                placeholder="Notiz (optional)"
                className={inputClasses}
              />
              <button
                onClick={addManuelleZeit}
                title="Zeit erfassen"
                className="shrink-0 rounded-lg bg-gray-100 px-3 text-gray-700 hover:bg-gray-200 dark:bg-dark-elevated dark:text-dark-text dark:hover:bg-dark-surfaceHover"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Einträge */}
            {zeiten.length > 0 && (
              <div className="space-y-1">
                {zeiten.map((z) => (
                  <div
                    key={z.id}
                    className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-dark-surfaceHover"
                  >
                    <span className="w-16 shrink-0 font-semibold text-gray-900 dark:text-dark-text">
                      {minutenAnzeige(z.minuten)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-gray-500 dark:text-dark-textMuted">
                      {[z.person, z.beschreibung].filter(Boolean).join(' · ') || '—'}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400 dark:text-dark-textSubtle">
                      {z.datum ? format(parseISO(z.datum), 'dd.MM.') : ''}
                    </span>
                    <button
                      onClick={() => removeZeit(z.id)}
                      title="Eintrag löschen"
                      className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100 dark:text-dark-textSubtle"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Sicherheitsabfrage: Bild löschen */}
      {confirmBildId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmBildId(null)}
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
                  Bild löschen?
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-dark-textMuted">
                  Das Bild wird unwiderruflich gelöscht — für das ganze Team.
                </p>
              </div>
              <button
                onClick={() => setConfirmBildId(null)}
                className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-surfaceHover"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmBildId(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-surfaceHover"
              >
                Abbrechen
              </button>
              <button
                onClick={() => removeBild(confirmBildId)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDetail;
