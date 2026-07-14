import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Maximize2,
  Network,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { MindmapNode, MindmapNodeType, MindmapViewport } from '../../types/mindmap';
import {
  createMindmapNode,
  deleteMindmapNodes,
  loadMindmapNodes,
  loadViewport,
  ROOT_NODE_ID,
  saveViewport,
  subscribeMindmap,
  updateMindmapNode,
} from '../../services/mindmapService';
import { getCachedUsersList } from '../../services/userCacheService';
import {
  cardHeight,
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

const Mindmap = () => {
  const [nodes, setNodes] = useState<Record<string, MindmapNode>>({});
  const [loading, setLoading] = useState(true);
  const [viewport, setViewport] = useState<MindmapViewport>(() => loadViewport());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [taskModalId, setTaskModalId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ lastX: number; lastY: number } | null>(null);
  // Noch nicht rausgeschriebene lokale Änderungen (Node-ID → Debounce-Timer).
  // Solange ein Write aussteht, überschreiben Realtime-Events diesen Node nicht.
  const pendingWrites = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Ansicht noch nie benutzt → Root nach dem Laden zentrieren
  const isFresh = useRef(
    viewport.x === 0 && viewport.y === 0 && viewport.scale === 1
  );

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Initial laden + Realtime-Subscription für Änderungen anderer User
  useEffect(() => {
    let cancelled = false;
    loadMindmapNodes()
      .then((loaded) => {
        if (cancelled) return;
        setNodes(loaded);
        setLoading(false);
      })
      .catch((error) => {
        console.error('❌ Mindmap konnte nicht geladen werden:', error);
        if (!cancelled) {
          toast.error('Mindmap konnte nicht geladen werden');
          setLoading(false);
        }
      });

    const unsubscribe = subscribeMindmap((event, node) => {
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
  }, []);

  // Ansicht (Pan/Zoom) bleibt pro Browser lokal
  useEffect(() => {
    const timeout = setTimeout(() => saveViewport(viewport), 300);
    return () => clearTimeout(timeout);
  }, [viewport]);

  // Organigramm-Layout: Positionen werden komplett aus der Hierarchie berechnet
  const layout = useMemo(() => layoutTree(nodes, ROOT_NODE_ID), [nodes]);

  // Root nach dem ersten Laden mittig oben platzieren
  useEffect(() => {
    if (loading) return;
    const el = containerRef.current;
    if (!el || !isFresh.current) return;
    isFresh.current = false;
    const rootPos = layoutTree(nodesRef.current, ROOT_NODE_ID)[ROOT_NODE_ID] ?? {
      x: 0,
      y: 0,
    };
    setViewport({
      x: el.clientWidth / 2 - NODE_WIDTH / 2 - rootPos.x,
      y: 48 - rootPos.y,
      scale: 1,
    });
  }, [loading]);

  // Pan über globale Pointer-Events
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
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
      panState.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
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
          console.error('❌ Mindmap-Knoten nicht gespeichert:', error);
          toast.error(`„${node.titel}" konnte nicht gespeichert werden`);
        });
      }, WRITE_DEBOUNCE_MS)
    );
  };

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
    const newNode: MindmapNode = {
      id,
      parentId,
      type,
      titel: type === 'task' ? 'Neuer Task' : 'Neuer Knoten',
      collapsed: false,
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
      console.error('❌ Mindmap-Knoten nicht angelegt:', error);
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

  const deleteNode = (id: string) => {
    if (id === ROOT_NODE_ID) return;
    const doomed = [id, ...getDescendantIds(nodesRef.current, id)];
    const doomedSet = new Set(doomed);
    setNodes((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => !doomedSet.has(k)))
    );
    deleteMindmapNodes(doomed);
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
      if (n.parentId && n.type === 'knoten') parents.add(n.parentId);
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
    const rootPos = layout[ROOT_NODE_ID] ?? { x: 0, y: 0 };
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
    panState.current = { lastX: e.clientX, lastY: e.clientY };
  };

  const zustaendige = useMemo(() => getCachedUsersList(), []);

  // Nur Knoten sind Baum-Elemente; Tasks werden als Liste in ihrer Karte gerendert
  const visibleNodes = getVisibleNodes(nodes).filter((n) => layout[n.id]);
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const { x: vx, y: vy, scale } = viewport;

  // Orthogonale Organigramm-Kanten: Eltern-Unterkante → Kind-Oberkante
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
      return {
        id: n.id,
        d: `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`,
      };
    });

  const modalTask = taskModalId ? nodes[taskModalId] : null;

  return (
    <div className="p-4 sm:p-6">
      {/* Kopfzeile mit Aktionen */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-red-600 to-orange-600 shadow-md">
            <Network className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              Mindmap
            </h1>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted">
              Geteilt mit dem ganzen Team · Doppelklick: umbenennen ·
              Scrollen/Fläche ziehen: Ansicht bewegen · Pinch oder Ctrl+Scrollen:
              zoomen
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
                Lade Mindmap…
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
                  key={edge.id}
                  d={edge.d}
                  fill="none"
                  strokeWidth={2}
                  className="stroke-gray-300 transition-[d] duration-200 dark:stroke-dark-border"
                />
              ))}
            </svg>
            {visibleNodes.map((node) => (
              <MindmapNodeCard
                key={node.id}
                node={node}
                pos={layout[node.id]}
                tasks={getTasks(nodes, node.id)}
                isRoot={node.id === ROOT_NODE_ID}
                childCount={getKnotenChildren(nodes, node.id).length}
                isEditing={editingId === node.id}
                onAddChild={(type) => addChild(node.id, type)}
                onToggleCollapse={() =>
                  patchNode(node.id, { collapsed: !node.collapsed })
                }
                onDelete={() => deleteNode(node.id)}
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
          onDelete={() => deleteNode(modalTask.id)}
          onClose={() => setTaskModalId(null)}
        />
      )}
    </div>
  );
};

export default Mindmap;
