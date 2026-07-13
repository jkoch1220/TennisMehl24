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
import { MindmapData, MindmapNode, MindmapNodeType } from '../../types/mindmap';
import {
  createInitialData,
  loadMindmap,
  ROOT_NODE_ID,
  saveMindmap,
} from '../../services/mindmapService';
import { getCachedUsersList } from '../../services/userCacheService';
import {
  ANCHOR_Y,
  getChildren,
  getDescendantIds,
  getVisibleNodes,
  NODE_WIDTH,
} from './mindmapUtils';
import MindmapNodeCard from './MindmapNodeCard';

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;

type DragState =
  | { mode: 'node'; ids: string[]; lastX: number; lastY: number }
  | { mode: 'pan'; lastX: number; lastY: number };

const Mindmap = () => {
  const [data, setData] = useState<MindmapData>(() => loadMindmap());
  const [editingId, setEditingId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  // Frische Map (noch nie gespeichert/bewegt) → Root beim ersten Rendern zentrieren
  const isFresh = useRef(
    data.viewport.x === 0 &&
      data.viewport.y === 0 &&
      data.viewport.scale === 1 &&
      Object.keys(data.nodes).length === 1
  );

  // Immer den aktuellen Stand für Unmount-Save vorhalten
  const dataRef = useRef(data);
  dataRef.current = data;

  // Persistenz: debounced bei jeder Änderung + final beim Verlassen
  useEffect(() => {
    const timeout = setTimeout(() => saveMindmap(data), 300);
    return () => clearTimeout(timeout);
  }, [data]);
  useEffect(() => () => saveMindmap(dataRef.current), []);

  // Root beim allerersten Öffnen in die Mitte der Fläche rücken
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isFresh.current) return;
    setData((d) => ({
      ...d,
      viewport: {
        x: el.clientWidth / 2 - NODE_WIDTH / 2,
        y: el.clientHeight / 2 - 60,
        scale: 1,
      },
    }));
  }, []);

  // Drag (Knoten + Pan) über globale Pointer-Events
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const st = dragState.current;
      if (!st) return;
      e.preventDefault();
      const dx = e.clientX - st.lastX;
      const dy = e.clientY - st.lastY;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      if (st.mode === 'pan') {
        setData((d) => ({
          ...d,
          viewport: { ...d.viewport, x: d.viewport.x + dx, y: d.viewport.y + dy },
        }));
      } else {
        setData((d) => {
          const scale = d.viewport.scale;
          const nodes = { ...d.nodes };
          for (const id of st.ids) {
            const n = nodes[id];
            if (n) nodes[id] = { ...n, x: n.x + dx / scale, y: n.y + dy / scale };
          }
          return { ...d, nodes };
        });
      }
    };
    const onUp = () => {
      dragState.current = null;
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
        setData((d) => {
          const { x, y, scale } = d.viewport;
          const next = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, scale * Math.exp(-e.deltaY * 0.01))
          );
          if (next === scale) return d;
          const f = next / scale;
          return {
            ...d,
            viewport: { x: cx - (cx - x) * f, y: cy - (cy - y) * f, scale: next },
          };
        });
      } else {
        setData((d) => ({
          ...d,
          viewport: {
            ...d.viewport,
            x: d.viewport.x - e.deltaX,
            y: d.viewport.y - e.deltaY,
          },
        }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const patchNode = (id: string, patch: Partial<MindmapNode>) =>
    setData((d) =>
      d.nodes[id]
        ? { ...d, nodes: { ...d.nodes, [id]: { ...d.nodes[id], ...patch } } }
        : d
    );

  const addChild = (parentId: string, type: MindmapNodeType) => {
    const id = crypto.randomUUID();
    setData((d) => {
      const parent = d.nodes[parentId];
      if (!parent) return d;
      const children = getChildren(d.nodes, parentId);
      const newNode: MindmapNode = {
        id,
        parentId,
        type,
        titel: type === 'task' ? 'Neuer Task' : 'Neuer Knoten',
        x: parent.x + NODE_WIDTH + 64,
        y: parent.y + children.length * 96,
        collapsed: false,
        ...(type === 'task' ? { faelligAm: '', zustaendig: '', erledigt: false } : {}),
      };
      return {
        ...d,
        nodes: {
          ...d.nodes,
          // Eltern aufklappen, damit das neue Kind sofort sichtbar ist
          [parentId]: { ...parent, collapsed: false },
          [id]: newNode,
        },
      };
    });
    setEditingId(id);
  };

  const deleteNode = (id: string) => {
    if (id === ROOT_NODE_ID) return;
    setData((d) => {
      const doomed = new Set([id, ...getDescendantIds(d.nodes, id)]);
      if (doomed.size > 1) {
        toast.info(`${doomed.size} Knoten gelöscht`);
      }
      const nodes = Object.fromEntries(
        Object.entries(d.nodes).filter(([nodeId]) => !doomed.has(nodeId))
      );
      return { ...d, nodes };
    });
    setEditingId((current) => (current === id ? null : current));
  };

  // Global-Toggle: solange irgendein Knoten mit Kindern offen ist → alles zuklappen
  const hatKinder = useMemo(() => {
    const parents = new Set<string>();
    for (const n of Object.values(data.nodes)) {
      if (n.parentId) parents.add(n.parentId);
    }
    return parents;
  }, [data.nodes]);

  const anyExpanded = Object.values(data.nodes).some(
    (n) => hatKinder.has(n.id) && !n.collapsed
  );

  const toggleAll = () => {
    setData((d) => {
      const nodes = Object.fromEntries(
        Object.entries(d.nodes).map(([id, n]) => [
          id,
          hatKinder.has(id) ? { ...n, collapsed: anyExpanded } : n,
        ])
      );
      return { ...d, nodes };
    });
  };

  const zoomBy = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setData((d) => {
      const { x, y, scale } = d.viewport;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
      const f = next / scale;
      return {
        ...d,
        viewport: { x: cx - (cx - x) * f, y: cy - (cy - y) * f, scale: next },
      };
    });
  };

  const resetView = () => {
    const el = containerRef.current;
    if (!el) return;
    setData((d) => {
      const root = d.nodes[ROOT_NODE_ID] ?? createInitialData().nodes[ROOT_NODE_ID];
      return {
        ...d,
        viewport: {
          x: el.clientWidth / 2 - NODE_WIDTH / 2 - root.x,
          y: el.clientHeight / 2 - 60 - root.y,
          scale: 1,
        },
      };
    });
  };

  const beginNodeDrag = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    // Eingabefelder und Buttons nicht als Drag-Griff verwenden
    if ((e.target as HTMLElement).closest('input, button, textarea, select, label')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragState.current = {
      mode: 'node',
      ids: [id, ...getDescendantIds(data.nodes, id)],
      lastX: e.clientX,
      lastY: e.clientY,
    };
  };

  const beginPan = (e: React.PointerEvent<HTMLDivElement>) => {
    // Nur auf freier Fläche pannen, nicht auf Karten
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    setEditingId(null);
    dragState.current = { mode: 'pan', lastX: e.clientX, lastY: e.clientY };
  };

  const zustaendige = useMemo(() => getCachedUsersList(), []);

  const visibleNodes = getVisibleNodes(data.nodes);
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const { x: vx, y: vy, scale } = data.viewport;

  // Verbindungslinien Eltern → Kind (nur wenn beide sichtbar)
  const edges = visibleNodes
    .filter((n) => n.parentId && visibleIds.has(n.parentId))
    .map((n) => {
      const parent = data.nodes[n.parentId!];
      const fromRight = n.x + NODE_WIDTH / 2 >= parent.x + NODE_WIDTH / 2;
      const x1 = fromRight ? parent.x + NODE_WIDTH : parent.x;
      const y1 = parent.y + ANCHOR_Y;
      const x2 = fromRight ? n.x : n.x + NODE_WIDTH;
      const y2 = n.y + ANCHOR_Y;
      const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (fromRight ? 1 : -1);
      return {
        id: n.id,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      };
    });

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
              Doppelklick: umbenennen · Karte ziehen: verschieben · Scrollen/Fläche
              ziehen: Ansicht bewegen · Pinch oder Ctrl+Scrollen: zoomen
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
        <div
          className="absolute left-0 top-0"
          style={{ transform: `translate(${vx}px, ${vy}px) scale(${scale})`, transformOrigin: '0 0' }}
        >
          <svg width="1" height="1" className="pointer-events-none absolute overflow-visible">
            {edges.map((edge) => (
              <path
                key={edge.id}
                d={edge.d}
                fill="none"
                strokeWidth={2}
                className="stroke-gray-300 dark:stroke-dark-border"
              />
            ))}
          </svg>
          {visibleNodes.map((node) => (
            <MindmapNodeCard
              key={node.id}
              node={node}
              isRoot={node.id === ROOT_NODE_ID}
              childCount={getChildren(data.nodes, node.id).length}
              isEditing={editingId === node.id}
              onPointerDown={(e) => beginNodeDrag(e, node.id)}
              onAddChild={(type) => addChild(node.id, type)}
              onToggleCollapse={() => patchNode(node.id, { collapsed: !node.collapsed })}
              onDelete={() => deleteNode(node.id)}
              onChangeTitel={(titel) => patchNode(node.id, { titel })}
              onUpdateTask={(fields) => patchNode(node.id, fields)}
              onStartEdit={() => setEditingId(node.id)}
              onStopEdit={() => setEditingId(null)}
            />
          ))}
        </div>

        {/* Vorschläge für Zuständigkeit aus dem User-Cache */}
        <datalist id="mindmap-zustaendige">
          {zustaendige.map((user) => (
            <option key={user.$id} value={user.name} />
          ))}
        </datalist>
      </div>
    </div>
  );
};

export default Mindmap;
