import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Maximize2,
  Network,
  Trash2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MindmapBoard,
  MindmapNode,
  MindmapNodeType,
  MindmapViewport,
} from '../../types/mindmap';
import {
  createMindmapNode,
  deleteMindmapNodes,
  deleteTaskAnhaenge,
  getBoard,
  loadBoardNodes,
  loadViewport,
  saveViewport,
  subscribeMindmap,
  updateMindmapNode,
} from '../../services/mindmapService';
import { getCachedUsersList } from '../../services/userCacheService';
import {
  cardHeight,
  findRoot,
  getDescendantIds,
  getKnotenChildren,
  getTasks,
  getVisibleNodes,
  layoutTree,
  NODE_WIDTH,
} from './mindmapUtils';
import MindmapNodeCard from './MindmapNodeCard';
import TaskModal from './TaskModal';

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
// Textänderungen werden gebündelt rausgeschrieben (nicht pro Tastendruck)
const WRITE_DEBOUNCE_MS = 600;

interface BoardAnsichtProps {
  boardId: string;
}

const BoardAnsicht = ({ boardId }: BoardAnsichtProps) => {
  const [board, setBoard] = useState<MindmapBoard | null>(null);
  const [nodes, setNodes] = useState<Record<string, MindmapNode>>({});
  const [loading, setLoading] = useState(true);
  const [viewport, setViewport] = useState<MindmapViewport>(() =>
    loadViewport(boardId)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [taskModalId, setTaskModalId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ lastX: number; lastY: number } | null>(null);
  // Umsortieren per Drag: gestartet erst ab kleinem Schwellwert, damit
  // Klicks und Doppelklicks auf der Karte normal funktionieren
  const reorderState = useRef<{
    id: string;
    parentId: string;
    pointerStartX: number;
    started: boolean;
    changed: boolean;
  } | null>(null);
  // Noch nicht rausgeschriebene lokale Änderungen (Node-ID → Debounce-Timer).
  // Solange ein Write aussteht, überschreiben Realtime-Events diesen Node nicht.
  const pendingWrites = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Ansicht noch nie benutzt → Root nach dem Laden zentrieren
  const isFresh = useRef(
    viewport.x === 0 && viewport.y === 0 && viewport.scale === 1
  );

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const istProzess = board?.typ === 'prozess';

  // Initial laden + Realtime-Subscription für Änderungen anderer User
  useEffect(() => {
    let cancelled = false;
    Promise.all([getBoard(boardId), loadBoardNodes(boardId)])
      .then(async ([loadedBoard, loadedNodes]) => {
        if (cancelled) return;
        // Falls das Board (noch) keinen Wurzelknoten hat, einen anlegen
        if (loadedBoard && !findRoot(loadedNodes)) {
          const root: MindmapNode = {
            id: crypto.randomUUID(),
            boardId,
            parentId: null,
            type: 'knoten',
            titel: loadedBoard.name,
            collapsed: false,
            sortOrder: 0,
          };
          await createMindmapNode(root).catch(() => undefined);
          loadedNodes[root.id] = root;
        }
        setBoard(loadedBoard);
        setNodes(loadedNodes);
        setLoading(false);
      })
      .catch((error) => {
        console.error('❌ Board konnte nicht geladen werden:', error);
        if (!cancelled) {
          toast.error('Board konnte nicht geladen werden');
          setLoading(false);
        }
      });

    const unsubscribe = subscribeMindmap((event, node) => {
      if (node.boardId !== boardId) return;
      if (event === 'delete') {
        setNodes((prev) => {
          if (!prev[node.id]) return prev;
          const next = { ...prev };
          delete next[node.id];
          return next;
        });
        setTaskModalId((current) => (current === node.id ? null : current));
        setEditingId((current) => (current === node.id ? null : current));
      } else {
        // Eigene, noch ausstehende Änderungen nicht mit dem Echo überschreiben
        if (pendingWrites.current.has(node.id)) return;
        setNodes((prev) => ({ ...prev, [node.id]: node }));
      }
    });

    const pending = pendingWrites.current;
    return () => {
      cancelled = true;
      unsubscribe();
      pending.forEach((timeout) => clearTimeout(timeout));
      pending.clear();
    };
  }, [boardId]);

  // Ansicht (Pan/Zoom) bleibt pro Browser und Board lokal
  useEffect(() => {
    const timeout = setTimeout(() => saveViewport(boardId, viewport), 300);
    return () => clearTimeout(timeout);
  }, [boardId, viewport]);

  const rootId = useMemo(() => findRoot(nodes)?.id ?? '', [nodes]);

  // Organigramm-Layout: Positionen werden komplett aus der Hierarchie berechnet
  const layout = useMemo(() => layoutTree(nodes, rootId), [nodes, rootId]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Root nach dem ersten Laden mittig oben platzieren
  useEffect(() => {
    if (loading || !rootId) return;
    const el = containerRef.current;
    if (!el || !isFresh.current) return;
    isFresh.current = false;
    const rootPos = layoutRef.current[rootId] ?? { x: 0, y: 0 };
    setViewport({
      x: el.clientWidth / 2 - NODE_WIDTH / 2 - rootPos.x,
      y: 48 - rootPos.y,
      scale: 1,
    });
  }, [loading, rootId]);

  /** Debounced Write-Through: lokalen Stand nach kurzer Ruhe nach Appwrite schreiben */
  const scheduleUpsert = (id: string) => {
    const pending = pendingWrites.current;
    const existing = pending.get(id);
    if (existing) clearTimeout(existing);
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id);
        const node = nodesRef.current[id];
        if (!node) return;
        updateMindmapNode(node).catch((error) => {
          console.error('❌ Knoten nicht gespeichert:', error);
          toast.error(`„${node.titel}" konnte nicht gespeichert werden`);
        });
      }, WRITE_DEBOUNCE_MS)
    );
  };

  // Pan + Umsortieren über globale Pointer-Events
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Karte horizontal ziehen → Geschwister-Reihenfolge ändern (rastet ein)
      const drag = reorderState.current;
      if (drag) {
        e.preventDefault();
        if (!drag.started) {
          if (Math.abs(e.clientX - drag.pointerStartX) < 6) return;
          drag.started = true;
          setDraggingId(drag.id);
        }
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const v = viewportRef.current;
        // Cursor-Position in Canvas-Koordinaten
        const canvasX = (e.clientX - rect.left - v.x) / v.scale;
        const siblings = getKnotenChildren(nodesRef.current, drag.parentId);
        const currentIndex = siblings.findIndex((s) => s.id === drag.id);
        if (currentIndex === -1) return;
        // Ziel-Slot = Anzahl fremder Slot-Mitten links vom Cursor
        let targetIndex = 0;
        for (const sibling of siblings) {
          if (sibling.id === drag.id) continue;
          const slot = layoutRef.current[sibling.id];
          if (slot && canvasX > slot.x + NODE_WIDTH / 2) targetIndex++;
        }
        if (targetIndex !== currentIndex) {
          const reordered = siblings.filter((s) => s.id !== drag.id);
          reordered.splice(targetIndex, 0, siblings[currentIndex]);
          setNodes((prev) => {
            const next = { ...prev };
            reordered.forEach((s, i) => {
              if ((next[s.id]?.sortOrder ?? 0) !== i) {
                next[s.id] = { ...next[s.id], sortOrder: i };
              }
            });
            return next;
          });
          drag.changed = true;
        }
        return;
      }

      const st = panState.current;
      if (!st) return;
      e.preventDefault();
      const dx = e.clientX - st.lastX;
      const dy = e.clientY - st.lastY;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    };
    const onUp = () => {
      const drag = reorderState.current;
      if (drag) {
        reorderState.current = null;
        setDraggingId(null);
        if (drag.started && drag.changed) {
          // Neue Reihenfolge aller Geschwister persistieren
          getKnotenChildren(nodesRef.current, drag.parentId).forEach((s) =>
            scheduleUpsert(s.id)
          );
        }
      }
      panState.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scrollen = Ansicht verschieben, Pinch bzw. Ctrl/Cmd+Scrollen = Zoom auf den Cursor
  // (natives Event, da Reacts onWheel passiv ist und preventDefault ignoriert)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setViewport((v) => {
          const next = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, v.scale * Math.exp(-e.deltaY * 0.01))
          );
          if (next === v.scale) return v;
          const f = next / v.scale;
          return { x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f, scale: next };
        });
      } else {
        setViewport((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const patchNode = (id: string, patch: Partial<MindmapNode>) => {
    setNodes((prev) =>
      prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev
    );
    scheduleUpsert(id);
  };

  const addChild = (parentId: string, type: MindmapNodeType) => {
    const parent = nodes[parentId];
    if (!parent) return;
    const id = crypto.randomUUID();
    // Neue Kinder hinten anstellen
    const siblings =
      type === 'task' ? getTasks(nodes, parentId) : getKnotenChildren(nodes, parentId);
    const sortOrder = siblings.length
      ? Math.max(...siblings.map((s) => s.sortOrder ?? 0)) + 1
      : 0;
    // Nach Entscheidungen die Kanten mit Ja/Nein vorbelegen
    const edgeLabel =
      type !== 'task' && parent.type === 'entscheidung'
        ? siblings.length === 0
          ? 'Ja'
          : siblings.length === 1
            ? 'Nein'
            : ''
        : '';
    const titel =
      type === 'task'
        ? 'Neuer Task'
        : type === 'entscheidung'
          ? 'Entscheidung?'
          : istProzess
            ? 'Neuer Schritt'
            : 'Neuer Knoten';
    const newNode: MindmapNode = {
      id,
      boardId,
      parentId,
      type,
      titel,
      edgeLabel,
      collapsed: false,
      sortOrder,
      ...(type === 'task'
        ? { beschreibung: '', faelligAm: '', zustaendig: '', erledigt: false }
        : {}),
    };
    setNodes((prev) => ({
      ...prev,
      // Eltern aufklappen, damit das neue Kind sofort sichtbar ist
      [parentId]: { ...prev[parentId], collapsed: false },
      [id]: newNode,
    }));
    if (parent.collapsed) scheduleUpsert(parentId);
    createMindmapNode(newNode).catch((error) => {
      console.error('❌ Knoten nicht angelegt:', error);
      toast.error('Konnte nicht angelegt werden');
      setNodes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
    // Knoten: Titel direkt inline editieren; Task: Detail-Modal öffnen
    if (type === 'task') {
      setTaskModalId(id);
    } else {
      setEditingId(id);
    }
  };

  /** Löschen immer mit Sicherheitsabfrage — erst der Dialog, dann deleteNode */
  const requestDelete = (id: string) => {
    if (nodes[id]?.parentId === null) return; // Root ist nicht löschbar
    setConfirmDeleteId(id);
  };

  const deleteNode = (id: string) => {
    const node = nodesRef.current[id];
    if (!node || node.parentId === null) return;
    const doomed = [id, ...getDescendantIds(nodesRef.current, id)];
    const doomedSet = new Set(doomed);
    // Anhänge betroffener Tasks (Subtasks, Zeiten, Bilder) mit aufräumen
    const tasks = doomed
      .map((doomedId) => nodesRef.current[doomedId])
      .filter((n): n is MindmapNode => !!n && n.type === 'task');
    setNodes((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => !doomedSet.has(k)))
    );
    deleteMindmapNodes(doomed);
    deleteTaskAnhaenge(tasks).catch(() => undefined);
    if (doomed.length > 1) {
      toast.info(`${doomed.length} Knoten gelöscht`);
    }
    setEditingId((current) => (doomedSet.has(current ?? '') ? null : current));
    setTaskModalId((current) => (doomedSet.has(current ?? '') ? null : current));
  };

  // Global-Toggle: solange irgendein Knoten mit Unterknoten offen ist → alles zuklappen
  // (Tasks zählen nicht — sie hängen als Liste in der Karte und klappen nicht)
  const hatKinder = useMemo(() => {
    const parents = new Set<string>();
    for (const n of Object.values(nodes)) {
      if (n.parentId && n.type !== 'task') parents.add(n.parentId);
    }
    return parents;
  }, [nodes]);

  const anyExpanded = Object.values(nodes).some(
    (n) => hatKinder.has(n.id) && !n.collapsed
  );

  const toggleAll = () => {
    const changed: string[] = [];
    setNodes((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([id, n]) => {
          if (hatKinder.has(id) && n.collapsed !== anyExpanded) {
            changed.push(id);
            return [id, { ...n, collapsed: anyExpanded }];
          }
          return [id, n];
        })
      )
    );
    changed.forEach(scheduleUpsert);
  };

  const zoomBy = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setViewport((v) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const f = next / v.scale;
      return { x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f, scale: next };
    });
  };

  const resetView = () => {
    const el = containerRef.current;
    if (!el) return;
    const rootPos = layout[rootId] ?? { x: 0, y: 0 };
    setViewport({
      x: el.clientWidth / 2 - NODE_WIDTH / 2 - rootPos.x,
      y: 48 - rootPos.y,
      scale: 1,
    });
  };

  const beginPan = (e: React.PointerEvent<HTMLDivElement>) => {
    // Nur auf freier Fläche pannen, nicht auf Karten
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    setEditingId(null);
    setEditingEdgeId(null);
    panState.current = { lastX: e.clientX, lastY: e.clientY };
  };

  const beginReorder = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    // Root hat keine Geschwister; Buttons/Inputs bleiben normale Klickziele
    const node = nodes[id];
    if (!node?.parentId) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, button, textarea, label, [role="checkbox"]')) return;
    reorderState.current = {
      id,
      parentId: node.parentId,
      pointerStartX: e.clientX,
      started: false,
      changed: false,
    };
  };

  const zustaendige = useMemo(() => getCachedUsersList(), []);

  // Nur Knoten sind Baum-Elemente; Tasks werden als Liste in ihrer Karte gerendert
  const visibleNodes = getVisibleNodes(nodes).filter((n) => layout[n.id]);
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const { x: vx, y: vy, scale } = viewport;

  // Orthogonale Kanten: Eltern-Unterkante → Kind-Oberkante
  const edges = visibleNodes
    .filter((n) => n.parentId && visibleIds.has(n.parentId))
    .map((n) => {
      const p = layout[n.parentId!];
      const c = layout[n.id];
      const x1 = p.x + NODE_WIDTH / 2;
      const y1 = p.y + cardHeight(nodes, n.parentId!);
      const x2 = c.x + NODE_WIDTH / 2;
      const y2 = c.y;
      const midY = (y1 + y2) / 2;
      const parentIstEntscheidung = nodes[n.parentId!]?.type === 'entscheidung';
      return {
        node: n,
        d: `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`,
        labelX: x2,
        labelY: (midY + y2) / 2,
        // Nach Entscheidungen ist die Kante immer beschriftbar ("Ja"/"Nein"/…)
        zeigeLabel: parentIstEntscheidung || !!n.edgeLabel,
      };
    });

  const modalTask = taskModalId ? nodes[taskModalId] : null;
  const confirmNode = confirmDeleteId ? nodes[confirmDeleteId] : null;
  const confirmDescendants = confirmNode
    ? getDescendantIds(nodes, confirmNode.id).length
    : 0;

  const BoardIcon = istProzess ? Workflow : Network;

  return (
    <div className="p-4 sm:p-6">
      {/* Kopfzeile mit Aktionen */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/planung"
            title="Zur Board-Übersicht"
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface dark:text-dark-textMuted dark:hover:bg-dark-surfaceHover"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r shadow-md ${
              istProzess ? 'from-blue-500 to-cyan-600' : 'from-teal-500 to-emerald-600'
            }`}
          >
            <BoardIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              {board?.name ?? 'Board'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted">
              {istProzess
                ? 'Prozess-Diagramm · Kanten nach Entscheidungen beschriften (Ja/Nein) · geteilt mit dem Team'
                : 'Organigramm · Doppelklick: umbenennen · Karte seitlich ziehen: Reihenfolge tauschen · geteilt mit dem Team'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text dark:hover:bg-dark-surfaceHover"
          >
            {anyExpanded ? (
              <>
                <ChevronsDownUp className="h-4 w-4" />
                Alles zuklappen
              </>
            ) : (
              <>
                <ChevronsUpDown className="h-4 w-4" />
                Alles aufklappen
              </>
            )}
          </button>
          <div className="flex items-center rounded-lg border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface">
            <button
              onClick={() => zoomBy(1 / 1.2)}
              title="Herauszoomen"
              className="p-2 text-gray-600 hover:bg-gray-50 dark:text-dark-textMuted dark:hover:bg-dark-surfaceHover"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="w-12 text-center text-xs font-medium text-gray-500 dark:text-dark-textMuted">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => zoomBy(1.2)}
              title="Hineinzoomen"
              className="p-2 text-gray-600 hover:bg-gray-50 dark:text-dark-textMuted dark:hover:bg-dark-surfaceHover"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={resetView}
              title="Ansicht zurücksetzen"
              className="border-l border-gray-200 p-2 text-gray-600 hover:bg-gray-50 dark:border-dark-border dark:text-dark-textMuted dark:hover:bg-dark-surfaceHover"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Zeichenfläche */}
      <div
        ref={containerRef}
        onPointerDown={beginPan}
        className="relative h-[calc(100vh-220px)] min-h-[480px] touch-none overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-dark-border dark:bg-dark-bg"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(148, 163, 184, 0.35) 1px, transparent 1px)',
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `${vx}px ${vy}px`,
        }}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-red-600"></div>
              <p className="mt-3 text-sm text-gray-500 dark:text-dark-textMuted">
                Lade Board…
              </p>
            </div>
          </div>
        ) : (
          <div
            className="absolute left-0 top-0"
            style={{
              transform: `translate(${vx}px, ${vy}px) scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
            <svg
              width="1"
              height="1"
              className="pointer-events-none absolute overflow-visible"
            >
              {edges.map((edge) => (
                <path
                  key={edge.node.id}
                  d={edge.d}
                  fill="none"
                  strokeWidth={2}
                  className="stroke-gray-300 transition-[d] duration-200 dark:stroke-dark-border"
                />
              ))}
            </svg>

            {/* Kantenbeschriftungen (Ja/Nein nach Entscheidungen) */}
            {edges
              .filter((edge) => edge.zeigeLabel)
              .map((edge) => (
                <div
                  key={`label-${edge.node.id}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-200"
                  style={{ left: edge.labelX, top: edge.labelY }}
                >
                  {editingEdgeId === edge.node.id ? (
                    <input
                      autoFocus
                      defaultValue={edge.node.edgeLabel ?? ''}
                      onBlur={(e) => {
                        patchNode(edge.node.id, { edgeLabel: e.target.value.trim() });
                        setEditingEdgeId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingEdgeId(null);
                      }}
                      className="w-20 rounded-full border border-amber-400 bg-white px-2 py-0.5 text-center text-xs font-semibold text-gray-900 focus:outline-none dark:bg-dark-input dark:text-dark-text"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingEdgeId(edge.node.id)}
                      title="Kantenbeschriftung ändern"
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold shadow-sm ${
                        edge.node.edgeLabel?.toLowerCase() === 'ja'
                          ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/40 dark:text-dark-accentGreen'
                          : edge.node.edgeLabel?.toLowerCase() === 'nein'
                            ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-dark-accentRed'
                            : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-dark-accentOrange'
                      }`}
                    >
                      {edge.node.edgeLabel || '?'}
                    </button>
                  )}
                </div>
              ))}

            {visibleNodes.map((node) => (
              <MindmapNodeCard
                key={node.id}
                node={node}
                pos={layout[node.id]}
                tasks={getTasks(nodes, node.id)}
                isRoot={node.parentId === null}
                istProzess={istProzess}
                childCount={getKnotenChildren(nodes, node.id).length}
                isEditing={editingId === node.id}
                isDragging={draggingId === node.id}
                onPointerDown={(e) => beginReorder(e, node.id)}
                onAddChild={(type) => addChild(node.id, type)}
                onToggleCollapse={() =>
                  patchNode(node.id, { collapsed: !node.collapsed })
                }
                onDelete={() => requestDelete(node.id)}
                onChangeTitel={(titel) => patchNode(node.id, { titel })}
                onStartEdit={() => setEditingId(node.id)}
                onStopEdit={() => setEditingId(null)}
                onOpenTask={(taskId) => setTaskModalId(taskId)}
                onToggleTaskErledigt={(task) =>
                  patchNode(task.id, { erledigt: !task.erledigt })
                }
              />
            ))}
          </div>
        )}

        {/* Vorschläge für Zuständigkeit aus dem User-Cache */}
        <datalist id="mindmap-zustaendige">
          {zustaendige.map((user) => (
            <option key={user.$id} value={user.name} />
          ))}
        </datalist>
      </div>

      {/* Task-Detail-Modal */}
      {modalTask && (
        <TaskModal
          task={modalTask}
          knotenTitel={
            (modalTask.parentId && nodes[modalTask.parentId]?.titel) || ''
          }
          onPatch={(fields) => patchNode(modalTask.id, fields)}
          onDelete={() => requestDelete(modalTask.id)}
          onClose={() => setTaskModalId(null)}
        />
      )}

      {/* Sicherheitsabfrage vor dem Löschen */}
      {confirmNode && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmDeleteId(null)}
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
                  {confirmNode.type === 'task' ? 'Task löschen?' : 'Knoten löschen?'}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-dark-textMuted">
                  „{confirmNode.titel}"
                  {confirmDescendants > 0 && (
                    <>
                      {' '}
                      inkl.{' '}
                      <span className="font-semibold text-red-600 dark:text-dark-accentRed">
                        {confirmDescendants} Unterelement
                        {confirmDescendants === 1 ? '' : 'en'}
                      </span>
                    </>
                  )}{' '}
                  wird unwiderruflich gelöscht — für das ganze Team.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-surfaceHover"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  deleteNode(confirmNode.id);
                  setConfirmDeleteId(null);
                }}
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

/** Route-Wrapper: kompletter Remount beim Board-Wechsel */
const Mindmap = () => {
  const { boardId } = useParams<{ boardId: string }>();
  if (!boardId) return null;
  return <BoardAnsicht key={boardId} boardId={boardId} />;
};

export default Mindmap;
