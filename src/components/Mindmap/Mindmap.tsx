import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Info,
  Maximize2,
  Network,
  Plus,
  StickyNote,
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
  createBoard,
  createMindmapNode,
  deleteMindmapNodes,
  deleteTaskAnhaenge,
  getBoard,
  loadBoardNodes,
  loadViewport,
  saveViewport,
  subscribeMindmap,
  updateBoard,
  updateMindmapNode,
} from '../../services/mindmapService';
import { getCachedUsersList } from '../../services/userCacheService';
import {
  cardHeight,
  findRoot,
  getDescendantIds,
  getKnotenChildren,
  getNotizen,
  getTasks,
  getVisibleNodes,
  headerHeight,
  LayoutPos,
  layoutTree,
  NODE_WIDTH,
  NOTIZ_WIDTH,
  notizHeight,
  TASK_LIST_PAD,
  TASK_ROW_HEIGHT,
  ZUBEHOER_WIDTH,
} from './mindmapUtils';
import BoardInfoModal from './BoardInfoModal';
import MindmapNodeCard from './MindmapNodeCard';
import NotizCard from './NotizCard';
import SchrittModal from './SchrittModal';
import TaskModal from './TaskModal';
import ZubehoerBlase from './ZubehoerBlase';

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
// Textänderungen werden gebündelt rausgeschrieben (nicht pro Tastendruck)
const WRITE_DEBOUNCE_MS = 600;

interface BoardAnsichtProps {
  boardId: string;
}

const BoardAnsicht = ({ boardId }: BoardAnsichtProps) => {
  const navigate = useNavigate();
  const [board, setBoard] = useState<MindmapBoard | null>(null);
  const [nodes, setNodes] = useState<Record<string, MindmapNode>>({});
  const [loading, setLoading] = useState(true);
  const [viewport, setViewport] = useState<MindmapViewport>(() =>
    loadViewport(boardId)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [taskModalId, setTaskModalId] = useState<string | null>(null);
  // Detail-Popup für Schritte/Entscheidungen/Unterprozesse
  const [schrittModalId, setSchrittModalId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Verbinden-Modus: Quelle gewählt, nächster Karten-Klick setzt das Ziel
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  // Notiz-Verbinden-Modus: Notiz gewählt, nächster Klick auf Schritt/Task verbindet
  const [noteConnectFromId, setNoteConnectFromId] = useState<string | null>(null);
  // Übersichtsseite des Boards (Beschreibung + Bilder)
  const [boardInfoOpen, setBoardInfoOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ lastX: number; lastY: number } | null>(null);
  // Karten-Drag: seitlich = Geschwister-Reihenfolge, nach unten = Abstand zum
  // Eltern-Knoten. Gestartet erst ab kleinem Schwellwert, damit Klicks und
  // Doppelklicks auf der Karte normal funktionieren.
  const reorderState = useRef<{
    id: string;
    parentId: string;
    pointerStartX: number;
    pointerStartY: number;
    startAbstand: number;
    started: boolean;
    changed: boolean;
    abstandChanged: boolean;
  } | null>(null);
  // Notiz-Blasen frei verschieben (Offset zum Anker bzw. absolute Position)
  const noteDragState = useRef<{
    id: string;
    pointerStartX: number;
    pointerStartY: number;
    // Effektiver Startwert (bei automatischer Platzierung der berechnete Offset)
    origX: number;
    origY: number;
    started: boolean;
  } | null>(null);
  // Zuletzt gerenderte absolute Notiz-Positionen (für den Drag-Start)
  const notizPosRef = useRef<Record<string, LayoutPos>>({});
  // Noch nicht rausgeschriebene lokale Änderungen (Node-ID → Debounce-Timer).
  // Solange ein Write aussteht, überschreiben Realtime-Events diesen Node nicht.
  const pendingWrites = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Nachgeladene Unterprozess-Boards (deren Schritte inline dargestellt werden)
  const geladeneBoardIds = useRef(new Set<string>([boardId]));
  const ladendeBoardIds = useRef(new Set<string>());
  // Verweise, deren Alt-Kinder bereits ins verlinkte Board umgezogen wurden
  const migrierteVerweise = useRef(new Set<string>());
  // Ansicht noch nie benutzt → Root nach dem Laden zentrieren
  const isFresh = useRef(
    viewport.x === 0 && viewport.y === 0 && viewport.scale === 1
  );

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const boardRef = useRef(board);
  boardRef.current = board;
  const boardWriteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const istProzess = board?.typ === 'prozess';

  // Initial laden + Realtime-Subscription für Änderungen anderer User
  useEffect(() => {
    let cancelled = false;
    geladeneBoardIds.current = new Set([boardId]);
    ladendeBoardIds.current.clear();
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
      // Auch Änderungen in eingebundenen Unterprozess-Boards übernehmen
      if (!geladeneBoardIds.current.has(node.boardId)) return;
      if (event === 'delete') {
        setNodes((prev) => {
          if (!prev[node.id]) return prev;
          const next = { ...prev };
          delete next[node.id];
          return next;
        });
        setTaskModalId((current) => (current === node.id ? null : current));
        setSchrittModalId((current) => (current === node.id ? null : current));
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

  // Unterprozess-Boards nachladen, deren Schritte inline eingeblendet werden.
  // Läuft erneut, wenn neue Verweise auftauchen (auch verschachtelt) —
  // geladeneBoardIds schützt vor Doppel-Laden und Zyklen.
  useEffect(() => {
    const fehlend = Object.values(nodes)
      .filter(
        (n) =>
          n.type === 'prozess' &&
          n.linkedBoardId &&
          !geladeneBoardIds.current.has(n.linkedBoardId) &&
          !ladendeBoardIds.current.has(n.linkedBoardId)
      )
      .map((n) => n.linkedBoardId as string);
    if (fehlend.length === 0) return;
    fehlend.forEach((id) => ladendeBoardIds.current.add(id));
    Promise.all(
      fehlend.map((id) =>
        loadBoardNodes(id).catch(() => ({}) as Record<string, MindmapNode>)
      )
    ).then((ergebnisse) => {
      const geladen: Record<string, MindmapNode> = {};
      ergebnisse.forEach((r) => Object.assign(geladen, r));
      fehlend.forEach((id) => {
        ladendeBoardIds.current.delete(id);
        geladeneBoardIds.current.add(id);
      });
      // Lokale (evtl. neuere) Stände nicht überschreiben
      setNodes((prev) => ({ ...geladen, ...prev }));
    });
  }, [nodes]);

  // Selbstheilung für ältere Unterprozess-Verweise: Schritte, die noch als
  // direkte Kinder des Verweises im Eltern-Board hängen, ziehen automatisch
  // in das verlinkte Board um (angeheftete Notizen am Verweis bleiben).
  useEffect(() => {
    for (const p of Object.values(nodes)) {
      if (p.type !== 'prozess' || !p.linkedBoardId) continue;
      if (migrierteVerweise.current.has(p.id)) continue;
      const kinder = Object.values(nodes).filter(
        (k) => k.parentId === p.id && k.type !== 'notiz'
      );
      if (kinder.length === 0) continue;
      const linkedRoot = Object.values(nodes).find(
        (r) =>
          r.boardId === p.linkedBoardId &&
          r.parentId === null &&
          r.type !== 'notiz'
      );
      if (!linkedRoot) continue; // verlinktes Board noch nicht geladen
      migrierteVerweise.current.add(p.id);
      const umzug = getDescendantIds(nodes, p.id)
        .map((dId) => nodes[dId])
        .filter(
          (d): d is MindmapNode =>
            !!d && !(d.type === 'notiz' && d.parentId === p.id)
        )
        .map((d) => ({
          ...d,
          boardId: p.linkedBoardId as string,
          parentId: d.parentId === p.id ? linkedRoot.id : d.parentId,
        }));
      setNodes((prev) => {
        const next = { ...prev };
        for (const m of umzug) next[m.id] = m;
        return next;
      });
      umzug.forEach((m) => scheduleUpsert(m.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Root dieses Boards (der State enthält auch Nodes verlinkter Boards)
  const rootId = useMemo(
    () =>
      Object.values(nodes).find(
        (n) => n.parentId === null && n.boardId === boardId && n.type !== 'notiz'
      )?.id ?? '',
    [nodes, boardId]
  );

  /**
   * Sicht für Layout/Rendering: Unterprozess-Verweise erben die Schritte des
   * verlinkten Boards — dessen Root verschwindet, seine Kinder hängen unter
   * dem Verweis. Die Original-Nodes (echte parentId/boardId) bleiben für alle
   * Writes unangetastet; ein-/ausklappen läuft über collapsed des Verweises.
   */
  const viewNodes = useMemo(() => {
    const view = { ...nodes };
    const bereitsEingebunden = new Set<string>();
    for (const n of Object.values(nodes)) {
      if (n.type !== 'prozess' || !n.linkedBoardId) continue;
      if (bereitsEingebunden.has(n.linkedBoardId)) continue;
      const linkedRoot = Object.values(nodes).find(
        (r) =>
          r.boardId === n.linkedBoardId &&
          r.parentId === null &&
          r.type !== 'notiz'
      );
      if (!linkedRoot) continue;
      bereitsEingebunden.add(n.linkedBoardId);
      delete view[linkedRoot.id];
      for (const kind of Object.values(nodes)) {
        if (kind.parentId === linkedRoot.id) {
          view[kind.id] = { ...kind, parentId: n.id };
        }
      }
    }
    return view;
  }, [nodes]);

  // Organigramm-Layout: Positionen werden komplett aus der Hierarchie berechnet
  const layout = useMemo(() => layoutTree(viewNodes, rootId), [viewNodes, rootId]);
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
      // Notiz-Blase frei verschieben
      const noteDrag = noteDragState.current;
      if (noteDrag) {
        e.preventDefault();
        if (!noteDrag.started) {
          if (
            Math.abs(e.clientX - noteDrag.pointerStartX) < 4 &&
            Math.abs(e.clientY - noteDrag.pointerStartY) < 4
          ) {
            return;
          }
          noteDrag.started = true;
          setDraggingId(noteDrag.id);
        }
        const v = viewportRef.current;
        const posX = Math.round(
          noteDrag.origX + (e.clientX - noteDrag.pointerStartX) / v.scale
        );
        const posY = Math.round(
          noteDrag.origY + (e.clientY - noteDrag.pointerStartY) / v.scale
        );
        setNodes((prev) =>
          prev[noteDrag.id]
            ? { ...prev, [noteDrag.id]: { ...prev[noteDrag.id], posX, posY } }
            : prev
        );
        return;
      }

      // Karte ziehen: seitlich = Reihenfolge, nach unten = Abstand zum Parent
      const drag = reorderState.current;
      if (drag) {
        e.preventDefault();
        if (!drag.started) {
          if (
            Math.abs(e.clientX - drag.pointerStartX) < 6 &&
            Math.abs(e.clientY - drag.pointerStartY) < 6
          ) {
            return;
          }
          drag.started = true;
          setDraggingId(drag.id);
        }
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const v = viewportRef.current;

        // Vertikal: zusätzlichen Abstand zum Eltern-Knoten einstellen
        const dyCanvas = (e.clientY - drag.pointerStartY) / v.scale;
        const neuAbstand = Math.min(
          600,
          Math.max(0, Math.round(drag.startAbstand + dyCanvas))
        );
        if (neuAbstand !== (nodesRef.current[drag.id]?.abstandOben ?? 0)) {
          setNodes((prev) =>
            prev[drag.id]
              ? { ...prev, [drag.id]: { ...prev[drag.id], abstandOben: neuAbstand } }
              : prev
          );
          drag.abstandChanged = true;
        }

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
      const noteDrag = noteDragState.current;
      if (noteDrag) {
        noteDragState.current = null;
        setDraggingId(null);
        if (noteDrag.started) scheduleUpsert(noteDrag.id);
      }
      const drag = reorderState.current;
      if (drag) {
        reorderState.current = null;
        setDraggingId(null);
        if (drag.started && drag.changed) {
          // Neue Reihenfolge aller Geschwister persistieren
          getKnotenChildren(nodesRef.current, drag.parentId).forEach((s) =>
            scheduleUpsert(s.id)
          );
        } else if (drag.started && drag.abstandChanged) {
          scheduleUpsert(drag.id);
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
    let parent = nodes[parentId];
    if (!parent) return;
    // Beim Unterprozess-Verweis landen neue Kinder im verlinkten Board
    // (unter dessen Root), damit beide Ansichten dieselben Schritte zeigen
    if (parent.type === 'prozess' && parent.linkedBoardId) {
      const linkedRoot = Object.values(nodes).find(
        (r) =>
          r.boardId === parent.linkedBoardId &&
          r.parentId === null &&
          r.type !== 'notiz'
      );
      if (linkedRoot) parent = linkedRoot;
    }
    const echteParentId = parent.id;
    const id = crypto.randomUUID();
    // Neue Kinder hinten anstellen
    const siblings =
      type === 'task'
        ? getTasks(nodes, echteParentId)
        : type === 'notiz'
          ? getNotizen(nodes, echteParentId)
          : getKnotenChildren(nodes, echteParentId);
    const sortOrder = siblings.length
      ? Math.max(...siblings.map((s) => s.sortOrder ?? 0)) + 1
      : 0;
    // Nach Entscheidungen die Kanten mit Ja/Nein vorbelegen (Notizen haben keine Kante)
    const edgeLabel =
      type !== 'task' && type !== 'notiz' && parent.type === 'entscheidung'
        ? siblings.length === 0
          ? 'Ja'
          : siblings.length === 1
            ? 'Nein'
            : ''
        : '';
    const titel =
      type === 'task'
        ? 'Neuer Task'
        : type === 'notiz'
          ? 'Neue Notiz'
          : type === 'entscheidung'
            ? 'Entscheidung?'
            : istProzess
              ? 'Neuer Schritt'
              : 'Neuer Knoten';
    const newNode: MindmapNode = {
      id,
      boardId: parent.boardId,
      parentId: echteParentId,
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
      // Eltern (bzw. angeklickten Verweis) aufklappen: neues Kind sofort sichtbar
      [parentId]: { ...prev[parentId], collapsed: false },
      [id]: newNode,
    }));
    if (nodes[parentId]?.collapsed) scheduleUpsert(parentId);
    createMindmapNode(newNode).catch((error) => {
      console.error('❌ Knoten nicht angelegt:', error);
      toast.error('Konnte nicht angelegt werden');
      setNodes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
    // Knoten/Notiz: Titel direkt inline editieren; Task: Detail-Modal öffnen
    if (type === 'task') {
      setTaskModalId(id);
    } else {
      setEditingId(id);
    }
  };

  /** Board-Felder (Beschreibung, Bilder) lokal patchen + debounced speichern */
  const patchBoard = (fields: Partial<MindmapBoard>) => {
    setBoard((prev) => (prev ? { ...prev, ...fields } : prev));
    if (boardWriteTimeout.current) clearTimeout(boardWriteTimeout.current);
    boardWriteTimeout.current = setTimeout(() => {
      const aktuelles = boardRef.current;
      if (!aktuelles) return;
      updateBoard(aktuelles).catch((error) => {
        console.error('❌ Board nicht gespeichert:', error);
        toast.error('Board-Übersicht konnte nicht gespeichert werden');
      });
    }, WRITE_DEBOUNCE_MS);
  };

  /**
   * Schritt als Unterprozess kapseln: legt ein eigenes Prozess-Board mit dem
   * Titel des Schritts an (erscheint automatisch in der Board-Übersicht) und
   * verwandelt den Schritt in einen orangen Verweis. Bereits vorhandene
   * Unterschritte/Tasks ziehen in das neue Board um — sie bleiben hier über
   * die eingebundene Ansicht sichtbar und ein-/ausklappbar.
   */
  const makeUnterprozess = async (nodeId: string) => {
    const node = nodesRef.current[nodeId];
    if (!node || node.type !== 'knoten') return;
    try {
      const neuesBoard = await createBoard(node.titel, 'prozess');
      const boardNodes = await loadBoardNodes(neuesBoard.id);
      const neueRoot = Object.values(boardNodes).find(
        (n) => n.parentId === null && n.type !== 'notiz'
      );
      // Bestehende Nachfahren des Schritts ins neue Board umziehen
      // (direkte Kinder hängen künftig unter dessen Root)
      const umzug: MindmapNode[] = neueRoot
        ? getDescendantIds(nodesRef.current, nodeId)
            .map((dId) => nodesRef.current[dId])
            // Direkt angeheftete Notizen bleiben beim Verweis im Eltern-Board
            .filter(
              (d): d is MindmapNode =>
                !!d && !(d.type === 'notiz' && d.parentId === nodeId)
            )
            .map((d) => ({
              ...d,
              boardId: neuesBoard.id,
              parentId: d.parentId === nodeId ? neueRoot.id : d.parentId,
            }))
        : [];
      migrierteVerweise.current.add(nodeId);
      geladeneBoardIds.current.add(neuesBoard.id);
      setNodes((prev) => {
        const next = { ...prev, ...boardNodes };
        for (const m of umzug) next[m.id] = m;
        return next;
      });
      umzug.forEach((m) => scheduleUpsert(m.id));
      patchNode(nodeId, { type: 'prozess', linkedBoardId: neuesBoard.id });
      toast.success(
        umzug.length > 0
          ? `Unterprozess „${node.titel}" angelegt — ${umzug.length} Schritt(e)/Task(s) umgezogen`
          : `Unterprozess „${node.titel}" angelegt — Klick auf das Pfeil-Symbol öffnet ihn`
      );
    } catch (error) {
      console.error('❌ Unterprozess nicht angelegt:', error);
      toast.error('Unterprozess konnte nicht angelegt werden');
    }
  };

  /** Notiz-Verbinden abschließen: Klick auf Schritt-Karte oder Task-Zeile */
  const completeNoteConnect = (targetId: string) => {
    const noteId = noteConnectFromId;
    setNoteConnectFromId(null);
    if (!noteId || noteId === targetId) return;
    const note = nodesRef.current[noteId];
    const target = nodesRef.current[targetId];
    if (!note || !target) return;
    if (target.type === 'notiz') {
      toast.info('Notizen lassen sich nur mit Schritten oder Tasks verbinden');
      return;
    }
    const vorhandene = note.verbindungen ?? [];
    if (vorhandene.includes(targetId)) {
      toast.info('Verbindung existiert bereits');
      return;
    }
    patchNode(noteId, { verbindungen: [...vorhandene, targetId] });
  };

  /** Standalone-Notiz frei auf der Fläche anlegen (mittig im sichtbaren Bereich) */
  const addStandaloneNotiz = () => {
    const el = containerRef.current;
    const v = viewportRef.current;
    const id = crypto.randomUUID();
    const neu: MindmapNode = {
      id,
      boardId,
      parentId: null,
      type: 'notiz',
      titel: 'Neue Notiz',
      collapsed: false,
      sortOrder: 0,
      posX: Math.round(((el?.clientWidth ?? 800) / 2 - v.x) / v.scale - NOTIZ_WIDTH / 2),
      posY: Math.round((((el?.clientHeight ?? 600) / 3) - v.y) / v.scale),
    };
    setNodes((prev) => ({ ...prev, [id]: neu }));
    createMindmapNode(neu).catch((error) => {
      console.error('❌ Notiz nicht angelegt:', error);
      toast.error('Notiz konnte nicht angelegt werden');
      setNodes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
    setEditingId(id);
  };

  /** Löschen immer mit Sicherheitsabfrage — erst der Dialog, dann deleteNode */
  const requestDelete = (id: string) => {
    const node = nodes[id];
    // Root ist nicht löschbar; Standalone-Notizen (parentId null) schon
    if (!node || (node.parentId === null && node.type !== 'notiz')) return;
    setConfirmDeleteId(id);
  };

  const deleteNode = (id: string) => {
    const node = nodesRef.current[id];
    if (!node || (node.parentId === null && node.type !== 'notiz')) return;
    const doomed = [id, ...getDescendantIds(nodesRef.current, id)];
    const doomedSet = new Set(doomed);
    // Anhänge betroffener Tasks (Subtasks, Zeiten, Bilder) mit aufräumen
    const tasks = doomed
      .map((doomedId) => nodesRef.current[doomedId])
      .filter((n): n is MindmapNode => !!n && n.type === 'task');
    // Freie Verbindungen, die auf gelöschte Knoten zeigen, mit entfernen
    const mitToterVerbindung = Object.values(nodesRef.current)
      .filter(
        (n) =>
          !doomedSet.has(n.id) &&
          n.verbindungen?.some((z) => doomedSet.has(z))
      )
      .map((n) => n.id);
    setNodes((prev) =>
      Object.fromEntries(
        Object.entries(prev)
          .filter(([k]) => !doomedSet.has(k))
          .map(([k, n]) =>
            n.verbindungen?.some((z) => doomedSet.has(z))
              ? [
                  k,
                  {
                    ...n,
                    verbindungen: n.verbindungen.filter((z) => !doomedSet.has(z)),
                  },
                ]
              : [k, n]
          )
      )
    );
    mitToterVerbindung.forEach(scheduleUpsert);
    deleteMindmapNodes(doomed);
    deleteTaskAnhaenge(tasks).catch(() => undefined);
    if (doomed.length > 1) {
      toast.info(`${doomed.length} Knoten gelöscht`);
    }
    setEditingId((current) => (doomedSet.has(current ?? '') ? null : current));
    setTaskModalId((current) => (doomedSet.has(current ?? '') ? null : current));
    setSchrittModalId((current) => (doomedSet.has(current ?? '') ? null : current));
  };

  /**
   * Nur den Knoten selbst löschen: alle direkten Kinder (Schritte, Tasks,
   * Notizen) rücken zum Eltern-Knoten auf. Baum-Kinder übernehmen dabei die
   * Position des gelöschten Knotens in der Geschwisterreihe; Kinder ohne
   * Kantenbeschriftung erben die des gelöschten Knotens (z. B. „Ja"/„Nein").
   */
  const deleteNodeOnly = (id: string) => {
    const node = nodesRef.current[id];
    if (!node || node.parentId === null) return;
    const parentId = node.parentId;
    const kinder = Object.values(nodesRef.current).filter((k) => k.parentId === id);
    const mitToterVerbindung = Object.values(nodesRef.current)
      .filter((n) => n.id !== id && n.verbindungen?.includes(id))
      .map((n) => n.id);
    // Neue Geschwisterreihe: die Baum-Kinder ersetzen den Knoten an seiner Stelle
    const baumKinder = getKnotenChildren(nodesRef.current, id);
    const neueReihe = getKnotenChildren(nodesRef.current, parentId).flatMap((g) =>
      g.id === id ? baumKinder : [g]
    );
    setNodes((prev) => {
      const next = { ...prev };
      for (const kind of kinder) {
        if (!next[kind.id]) continue;
        next[kind.id] = {
          ...next[kind.id],
          parentId,
          edgeLabel: next[kind.id].edgeLabel || node.edgeLabel || '',
        };
      }
      neueReihe.forEach((g, i) => {
        if (next[g.id]) next[g.id] = { ...next[g.id], sortOrder: i };
      });
      for (const mId of mitToterVerbindung) {
        if (!next[mId]) continue;
        next[mId] = {
          ...next[mId],
          verbindungen: (next[mId].verbindungen ?? []).filter((z) => z !== id),
        };
      }
      delete next[id];
      return next;
    });
    kinder.forEach((k) => scheduleUpsert(k.id));
    neueReihe.forEach((g) => scheduleUpsert(g.id));
    mitToterVerbindung.forEach(scheduleUpsert);
    deleteMindmapNodes([id]);
    if (node.type === 'task') deleteTaskAnhaenge([node]).catch(() => undefined);
    toast.info(
      `„${node.titel}" gelöscht — ${kinder.length} Unterelement${
        kinder.length === 1 ? '' : 'e'
      } aufgerückt`
    );
    setEditingId((current) => (current === id ? null : current));
    setTaskModalId((current) => (current === id ? null : current));
    setSchrittModalId((current) => (current === id ? null : current));
  };

  // Global-Toggle: solange irgendein Knoten mit Unterknoten offen ist → alles zuklappen
  // (Tasks zählen nicht — sie hängen als Liste in der Karte und klappen nicht)
  const hatKinder = useMemo(() => {
    const parents = new Set<string>();
    for (const n of Object.values(viewNodes)) {
      if (n.parentId && n.type !== 'task' && n.type !== 'notiz') {
        parents.add(n.parentId);
      }
    }
    return parents;
  }, [viewNodes]);

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
    // Offenes Bearbeitungsfeld per Blur speichern (nicht verwerfen) —
    // preventDefault unterbindet den natürlichen Fokuswechsel
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setEditingId(null);
    setEditingEdgeId(null);
    setConnectFromId(null);
    setNoteConnectFromId(null);
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
      pointerStartY: e.clientY,
      startAbstand: node.abstandOben ?? 0,
      started: false,
      changed: false,
      abstandChanged: false,
    };
  };

  const beginNoteDrag = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, button, textarea, label')) return;
    const notiz = nodesRef.current[id];
    if (!notiz) return;
    // Angehängte Notiz: Offset zum Anker; standalone: absolute Position.
    // Bei automatischer Platzierung (posX/posY 0/0) den gerenderten Wert übernehmen.
    const abs = notizPosRef.current[id];
    const anchor = notiz.parentId ? layoutRef.current[notiz.parentId] : null;
    const origX = abs ? abs.x - (anchor?.x ?? 0) : notiz.posX ?? 0;
    const origY = abs ? abs.y - (anchor?.y ?? 0) : notiz.posY ?? 0;
    noteDragState.current = {
      id,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      origX,
      origY,
      started: false,
    };
  };

  /** Neuen Knoten auf der Kante zwischen Parent und Kind einfügen */
  const insertBetween = (childId: string) => {
    const child = nodesRef.current[childId];
    if (!child?.parentId) return;
    const id = crypto.randomUUID();
    const neu: MindmapNode = {
      id,
      // Beim Einfügen auf einer Kante im eingebundenen Unterprozess muss der
      // neue Schritt in dessen Board landen
      boardId: child.boardId,
      parentId: child.parentId,
      type: 'knoten',
      titel: istProzess ? 'Neuer Schritt' : 'Neuer Knoten',
      // Der neue Knoten übernimmt Platz und Kantenbeschriftung des Kindes
      edgeLabel: child.edgeLabel ?? '',
      collapsed: false,
      sortOrder: child.sortOrder ?? 0,
    };
    setNodes((prev) => ({
      ...prev,
      [id]: neu,
      [childId]: { ...prev[childId], parentId: id, edgeLabel: '', sortOrder: 0 },
    }));
    createMindmapNode(neu).catch((error) => {
      console.error('❌ Knoten nicht angelegt:', error);
      toast.error('Konnte nicht angelegt werden');
      setNodes((prev) => {
        const next = { ...prev };
        delete next[id];
        if (next[childId]) {
          next[childId] = {
            ...next[childId],
            parentId: child.parentId,
            edgeLabel: child.edgeLabel ?? '',
            sortOrder: child.sortOrder ?? 0,
          };
        }
        return next;
      });
    });
    scheduleUpsert(childId);
    setEditingId(id);
  };

  /** Verbinden-Modus abschließen: Klick auf die Ziel-Karte */
  const completeConnect = (targetId: string) => {
    const fromId = connectFromId;
    setConnectFromId(null);
    if (!fromId || fromId === targetId) return;
    const from = nodesRef.current[fromId];
    if (!from) return;
    const vorhandene = from.verbindungen ?? [];
    if (vorhandene.includes(targetId)) {
      toast.info('Verbindung existiert bereits');
      return;
    }
    patchNode(fromId, { verbindungen: [...vorhandene, targetId] });
  };

  const removeVerbindung = (fromId: string, targetId: string) => {
    const from = nodesRef.current[fromId];
    if (!from) return;
    patchNode(fromId, {
      verbindungen: (from.verbindungen ?? []).filter((z) => z !== targetId),
    });
    toast.success('Verbindung entfernt');
  };

  const zustaendige = useMemo(() => getCachedUsersList(), []);

  // Nur Knoten sind Baum-Elemente; Tasks werden als Liste in ihrer Karte gerendert
  const visibleNodes = getVisibleNodes(viewNodes).filter((n) => layout[n.id]);
  const visibleIds = new Set(visibleNodes.map((n) => n.id));

  // Werkzeug- (links, blau) und Material-Blasen (rechts, gelb) an den Schritten
  const zubehoerBlasen = visibleNodes.flatMap((n) => {
    if (n.type === 'task' || n.type === 'notiz') return [];
    const p = layout[n.id];
    const blasen: Array<{
      node: MindmapNode;
      art: 'werkzeuge' | 'materialien';
      pos: LayoutPos;
    }> = [];
    if (n.werkzeuge?.trim()) {
      blasen.push({
        node: n,
        art: 'werkzeuge',
        pos: { x: p.x - ZUBEHOER_WIDTH - 24, y: p.y },
      });
    }
    if (n.materialien?.trim()) {
      blasen.push({
        node: n,
        art: 'materialien',
        pos: { x: p.x + NODE_WIDTH + 24, y: p.y },
      });
    }
    return blasen;
  });

  // Notiz-Blasen: sichtbar, solange ihr Anker sichtbar ist (auch bei
  // eingeklapptem Anker — wie die Task-Liste); standalone nur vom eigenen Board
  const notizen = Object.values(nodes)
    .filter(
      (n) =>
        n.type === 'notiz' &&
        (n.parentId === null ? n.boardId === boardId : !!layout[n.parentId])
    )
    .sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id)
    );
  const notizPos: Record<string, LayoutPos> = {};
  {
    // Automatische Platzierung: rechts neben dem Anker, mehrere untereinander
    const autoIndex = new Map<string, number>();
    for (const notiz of notizen) {
      const auto = !notiz.posX && !notiz.posY;
      if (notiz.parentId) {
        const anchor = layout[notiz.parentId];
        if (auto) {
          const i = autoIndex.get(notiz.parentId) ?? 0;
          autoIndex.set(notiz.parentId, i + 1);
          notizPos[notiz.id] = {
            x: anchor.x + NODE_WIDTH + 56,
            y: anchor.y + i * 96,
          };
        } else {
          notizPos[notiz.id] = {
            x: anchor.x + (notiz.posX ?? 0),
            y: anchor.y + (notiz.posY ?? 0),
          };
        }
      } else {
        notizPos[notiz.id] = { x: notiz.posX ?? 0, y: notiz.posY ?? 0 };
      }
    }
  }
  notizPosRef.current = notizPos;

  // Kürzeste seitliche Verbindung zwischen zwei Rechtecken (nächste Kanten)
  type Rect = { x: number; y: number; w: number; h: number };
  const kantePunkte = (n: Rect, z: Rect) => {
    if (n.x >= z.x + z.w) {
      return { x1: n.x, y1: n.y + n.h / 2, x2: z.x + z.w, y2: z.y + z.h / 2 };
    }
    if (n.x + n.w <= z.x) {
      return { x1: n.x + n.w, y1: n.y + n.h / 2, x2: z.x, y2: z.y + z.h / 2 };
    }
    if (n.y >= z.y + z.h) {
      return { x1: n.x + n.w / 2, y1: n.y, x2: z.x + z.w / 2, y2: z.y + z.h };
    }
    return { x1: n.x + n.w / 2, y1: n.y + n.h, x2: z.x + z.w / 2, y2: z.y };
  };

  // Notiz-Linien: Anker (angeheftete Notizen) + freie Verbindungen zu
  // Schritten und einzelnen Task-Zeilen; letztere per Klick entfernbar
  const notizLinien: Array<{
    key: string;
    notizId: string;
    zielId: string;
    entfernbar: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }> = [];
  for (const notiz of notizen) {
    const p = notizPos[notiz.id];
    if (!p) continue;
    const nRect: Rect = {
      x: p.x,
      y: p.y,
      w: NOTIZ_WIDTH,
      h: notizHeight(notiz.titel),
    };
    if (notiz.parentId && layout[notiz.parentId]) {
      notizLinien.push({
        key: `anker-${notiz.id}`,
        notizId: notiz.id,
        zielId: notiz.parentId,
        entfernbar: false,
        ...kantePunkte(nRect, {
          x: layout[notiz.parentId].x,
          y: layout[notiz.parentId].y,
          w: NODE_WIDTH,
          h: cardHeight(viewNodes, notiz.parentId),
        }),
      });
    }
    for (const zielId of notiz.verbindungen ?? []) {
      const ziel = viewNodes[zielId];
      if (!ziel) continue;
      if (ziel.type === 'task') {
        // Ziel ist eine Task-Zeile in ihrer Eltern-Karte
        const pid = ziel.parentId;
        if (!pid || !viewNodes[pid] || !layout[pid]) continue;
        const idx = getTasks(viewNodes, pid).findIndex((t) => t.id === zielId);
        if (idx < 0) continue;
        const a = layout[pid];
        const rowTop =
          a.y +
          headerHeight(viewNodes, viewNodes[pid]) +
          TASK_LIST_PAD / 2 +
          idx * TASK_ROW_HEIGHT;
        notizLinien.push({
          key: `vb-${notiz.id}-${zielId}`,
          notizId: notiz.id,
          zielId,
          entfernbar: true,
          ...kantePunkte(nRect, {
            x: a.x,
            y: rowTop,
            w: NODE_WIDTH,
            h: TASK_ROW_HEIGHT,
          }),
        });
      } else if (layout[zielId]) {
        notizLinien.push({
          key: `vb-${notiz.id}-${zielId}`,
          notizId: notiz.id,
          zielId,
          entfernbar: true,
          ...kantePunkte(nRect, {
            x: layout[zielId].x,
            y: layout[zielId].y,
            w: NODE_WIDTH,
            h: cardHeight(viewNodes, zielId),
          }),
        });
      }
    }
  }
  const { x: vx, y: vy, scale } = viewport;

  // Orthogonale Kanten: Eltern-Unterkante → Kind-Oberkante
  const edges = visibleNodes
    .filter((n) => n.parentId && visibleIds.has(n.parentId))
    .map((n) => {
      const p = layout[n.parentId!];
      const c = layout[n.id];
      const x1 = p.x + NODE_WIDTH / 2;
      const y1 = p.y + cardHeight(viewNodes, n.parentId!);
      const x2 = c.x + NODE_WIDTH / 2;
      const y2 = c.y;
      const midY = (y1 + y2) / 2;
      const parentIstEntscheidung = nodes[n.parentId!]?.type === 'entscheidung';
      return {
        node: n,
        d: `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`,
        labelX: x2,
        labelY: (midY + y2) / 2,
        // Plus-Button zum Dazwischen-Einfügen auf dem oberen Kantenstück
        insertX: x1,
        insertY: (y1 + midY) / 2,
        // Nach Entscheidungen ist die Kante immer beschriftbar ("Ja"/"Nein"/…)
        zeigeLabel: parentIstEntscheidung || !!n.edgeLabel,
      };
    });

  // Freie Verbindungen (z. B. Rücksprünge): rechts an den Karten vorbeigeführt,
  // jede Verbindung auf einer eigenen "Spur", damit sich Linien nicht überdecken
  let verbindungsSpur = 0;
  const freieVerbindungen = visibleNodes.flatMap((n) =>
    (n.verbindungen ?? [])
      .filter((zielId) => zielId !== n.id && visibleIds.has(zielId) && layout[zielId])
      .map((zielId) => {
        const s = layout[n.id];
        const t = layout[zielId];
        const sy = s.y + cardHeight(viewNodes, n.id) / 2;
        const ty = t.y + cardHeight(viewNodes, zielId) / 2;
        const laneX =
          Math.max(s.x, t.x) + NODE_WIDTH + 28 + (verbindungsSpur++ % 8) * 14;
        return {
          vonId: n.id,
          zielId,
          d: `M ${s.x + NODE_WIDTH} ${sy} H ${laneX} V ${ty} H ${t.x + NODE_WIDTH + 6}`,
          titel: `${n.titel} → ${nodes[zielId]?.titel ?? ''}`,
        };
      })
  );

  const modalTask = taskModalId ? nodes[taskModalId] : null;
  const modalSchritt = schrittModalId ? nodes[schrittModalId] : null;
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
            to="/geschaeftsprozesse"
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
                ? 'Prozess-Diagramm · Plus auf der Kante: Schritt dazwischen · Ketten-Symbol: verbinden · Notizen über das Plus-Menü oder den Notiz-Button · geteilt mit dem Team'
                : 'Organigramm · Doppelklick: umbenennen · Karte ziehen: Reihenfolge/Abstand · Notizen über das Plus-Menü · geteilt mit dem Team'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBoardInfoOpen(true)}
            title="Übersicht: Beschreibung und Bilder zu diesem Prozess"
            className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 shadow-sm hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-900/30 dark:text-dark-accentOrange dark:hover:bg-orange-900/50"
          >
            <Info className="h-4 w-4" />
            Übersicht
          </button>
          <button
            onClick={addStandaloneNotiz}
            title="Freie Notiz-Blase auf der Fläche anlegen"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text dark:hover:bg-dark-surfaceHover"
          >
            <StickyNote className="h-4 w-4" />
            Notiz
          </button>
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
              <defs>
                <marker
                  id="verbindung-pfeil"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    className="fill-blue-400 dark:fill-blue-500"
                  />
                </marker>
              </defs>
              {edges.map((edge) => (
                <path
                  key={edge.node.id}
                  d={edge.d}
                  fill="none"
                  strokeWidth={2}
                  className="stroke-gray-300 transition-[d] duration-200 dark:stroke-dark-border"
                />
              ))}
              {/* Seitliche Notiz-Verbindungen (Anker + Schritte/Tasks) */}
              {notizLinien.map((c) => (
                <g key={c.key}>
                  <line
                    x1={c.x1}
                    y1={c.y1}
                    x2={c.x2}
                    y2={c.y2}
                    strokeWidth={1.5}
                    strokeDasharray="3 4"
                    className="stroke-gray-400 transition-all duration-200 dark:stroke-gray-500"
                  />
                  {c.entfernbar && (
                    <line
                      x1={c.x1}
                      y1={c.y1}
                      x2={c.x2}
                      y2={c.y2}
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onClick={() => removeVerbindung(c.notizId, c.zielId)}
                    >
                      <title>Notiz-Verbindung entfernen (Klick)</title>
                    </line>
                  )}
                </g>
              ))}
              {/* Kurze Anbindung der Werkzeug-/Material-Blasen an ihre Karte */}
              {zubehoerBlasen.map((b) => {
                const karte = layout[b.node.id];
                const y = b.pos.y + 16;
                return (
                  <line
                    key={`zubehoer-${b.node.id}-${b.art}`}
                    x1={b.art === 'werkzeuge' ? b.pos.x + ZUBEHOER_WIDTH : karte.x + NODE_WIDTH}
                    y1={y}
                    x2={b.art === 'werkzeuge' ? karte.x : b.pos.x}
                    y2={y}
                    strokeWidth={1.5}
                    className={`transition-all duration-200 ${
                      b.art === 'werkzeuge'
                        ? 'stroke-blue-400 dark:stroke-blue-600'
                        : 'stroke-amber-400 dark:stroke-amber-600'
                    }`}
                  />
                );
              })}
              {/* Freie Verbindungen (Rücksprünge) mit Pfeil, Klick entfernt sie */}
              {freieVerbindungen.map((v) => (
                <g key={`verbindung-${v.vonId}-${v.zielId}`}>
                  <path
                    d={v.d}
                    fill="none"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    markerEnd="url(#verbindung-pfeil)"
                    className="stroke-blue-400 transition-[d] duration-200 dark:stroke-blue-500"
                  />
                  <path
                    d={v.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={() => removeVerbindung(v.vonId, v.zielId)}
                  >
                    <title>{`Verbindung „${v.titel}" entfernen (Klick)`}</title>
                  </path>
                </g>
              ))}
            </svg>

            {/* Plus-Buttons auf den Kanten: Schritt dazwischen einfügen */}
            {edges.map((edge) => (
              <button
                key={`insert-${edge.node.id}`}
                onClick={() => insertBetween(edge.node.id)}
                title={
                  istProzess
                    ? 'Schritt dazwischen einfügen'
                    : 'Knoten dazwischen einfügen'
                }
                className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-400 opacity-40 shadow-sm transition-[left,top,opacity,transform] duration-200 hover:scale-125 hover:border-blue-400 hover:text-blue-600 hover:opacity-100 dark:border-dark-border dark:bg-dark-surface dark:text-dark-textMuted"
                style={{ left: edge.insertX, top: edge.insertY }}
              >
                <Plus className="h-3 w-3" />
              </button>
            ))}

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
                tasks={getTasks(viewNodes, node.id)}
                isRoot={node.parentId === null}
                istProzess={istProzess}
                childCount={getKnotenChildren(viewNodes, node.id).length}
                isEditing={editingId === node.id}
                isDragging={draggingId === node.id}
                isConnectSource={connectFromId === node.id}
                onPointerDown={(e) => {
                  const target = e.target as HTMLElement;
                  const aufBedienElement = !!target.closest(
                    'input, button, textarea, label, [role="checkbox"]'
                  );
                  if (noteConnectFromId) {
                    if (!aufBedienElement) completeNoteConnect(node.id);
                  } else if (connectFromId) {
                    if (!aufBedienElement) completeConnect(node.id);
                  } else {
                    beginReorder(e, node.id);
                  }
                }}
                onAddChild={(type) => addChild(node.id, type)}
                onStartConnect={
                  istProzess ? () => setConnectFromId(node.id) : undefined
                }
                onMakeUnterprozess={
                  istProzess && node.type === 'knoten' && node.parentId !== null
                    ? () => makeUnterprozess(node.id)
                    : undefined
                }
                onOpenLinkedBoard={
                  node.type === 'prozess' && node.linkedBoardId
                    ? () => navigate(`/geschaeftsprozesse/${node.linkedBoardId}`)
                    : undefined
                }
                onOpenDetails={() => setSchrittModalId(node.id)}
                onToggleCollapse={() =>
                  patchNode(node.id, { collapsed: !node.collapsed })
                }
                onDelete={() => requestDelete(node.id)}
                onChangeTitel={(titel) => patchNode(node.id, { titel })}
                onStartEdit={() => setEditingId(node.id)}
                onStopEdit={() => setEditingId(null)}
                onOpenTask={(taskId) => {
                  // Im Notiz-Verbinden-Modus verbindet der Klick statt zu öffnen
                  if (noteConnectFromId) {
                    completeNoteConnect(taskId);
                  } else {
                    setTaskModalId(taskId);
                  }
                }}
                onToggleTaskErledigt={(task) =>
                  patchNode(task.id, { erledigt: !task.erledigt })
                }
              />
            ))}

            {/* Werkzeug- (blau, links) und Material-Blasen (gelb, rechts) */}
            {zubehoerBlasen.map((b) => (
              <ZubehoerBlase
                key={`blase-${b.node.id}-${b.art}`}
                art={b.art}
                text={(b.art === 'werkzeuge' ? b.node.werkzeuge : b.node.materialien) ?? ''}
                pos={b.pos}
                onChange={(text) =>
                  patchNode(
                    b.node.id,
                    b.art === 'werkzeuge' ? { werkzeuge: text } : { materialien: text }
                  )
                }
              />
            ))}

            {/* Notiz-Blasen (frei oder seitlich am Knoten) */}
            {notizen.map((notiz) => (
              <NotizCard
                key={notiz.id}
                notiz={notiz}
                pos={notizPos[notiz.id]}
                isEditing={editingId === notiz.id}
                isDragging={draggingId === notiz.id}
                isConnectSource={noteConnectFromId === notiz.id}
                onPointerDown={(e) => beginNoteDrag(e, notiz.id)}
                onChangeTitel={(titel) => patchNode(notiz.id, { titel })}
                onStartEdit={() => setEditingId(notiz.id)}
                onStopEdit={() => setEditingId(null)}
                onStartConnect={() => setNoteConnectFromId(notiz.id)}
                onDelete={() => requestDelete(notiz.id)}
              />
            ))}
          </div>
        )}

        {/* Hinweis im Verbinden-Modus */}
        {connectFromId && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-blue-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg">
            Ziel-Karte anklicken, um „{nodes[connectFromId]?.titel}" zu verbinden
            — Klick ins Leere bricht ab
          </div>
        )}
        {noteConnectFromId && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-amber-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg">
            Schritt oder Task anklicken, um die Notiz zu verbinden — Klick ins
            Leere bricht ab
          </div>
        )}

        {/* Vorschläge für Zuständigkeit aus dem User-Cache */}
        <datalist id="mindmap-zustaendige">
          {zustaendige.map((user) => (
            <option key={user.$id} value={user.name} />
          ))}
        </datalist>
      </div>

      {/* Board-Übersicht: Beschreibung + Bilder */}
      {boardInfoOpen && board && (
        <BoardInfoModal
          board={board}
          onPatch={patchBoard}
          onClose={() => setBoardInfoOpen(false)}
        />
      )}

      {/* Detail-Popup für Schritte, Entscheidungen und Unterprozesse */}
      {modalSchritt && (
        <SchrittModal
          node={modalSchritt}
          parentTitel={
            (modalSchritt.parentId && nodes[modalSchritt.parentId]?.titel) || ''
          }
          istProzess={istProzess}
          onPatch={(fields) => patchNode(modalSchritt.id, fields)}
          onDelete={() => requestDelete(modalSchritt.id)}
          onClose={() => setSchrittModalId(null)}
          onOpenLinkedBoard={
            modalSchritt.type === 'prozess' && modalSchritt.linkedBoardId
              ? () => navigate(`/geschaeftsprozesse/${modalSchritt.linkedBoardId}`)
              : undefined
          }
        />
      )}

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
                  {confirmNode.type === 'task'
                    ? 'Task löschen?'
                    : confirmNode.type === 'notiz'
                      ? 'Notiz löschen?'
                      : 'Knoten löschen?'}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-dark-textMuted">
                  {confirmDescendants > 0 ? (
                    <>
                      An „{confirmNode.titel}" hängen{' '}
                      <span className="font-semibold text-red-600 dark:text-dark-accentRed">
                        {confirmDescendants} Unterelement
                        {confirmDescendants === 1 ? '' : 'e'}
                      </span>
                      . Wie soll gelöscht werden? Die Änderung gilt für das
                      ganze Team.
                    </>
                  ) : (
                    <>
                      „{confirmNode.titel}" wird unwiderruflich gelöscht — für
                      das ganze Team.
                    </>
                  )}
                </p>
              </div>
            </div>
            {confirmDescendants > 0 ? (
              <>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      deleteNodeOnly(confirmNode.id);
                      setConfirmDeleteId(null);
                    }}
                    className="w-full rounded-lg border-2 border-red-200 px-4 py-2.5 text-left hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20"
                  >
                    <span className="block text-sm font-semibold text-red-600 dark:text-dark-accentRed">
                      Nur diesen Knoten löschen
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-dark-textMuted">
                      Unterelemente rücken zum übergeordneten Knoten auf
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      deleteNode(confirmNode.id);
                      setConfirmDeleteId(null);
                    }}
                    className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-left hover:bg-red-700"
                  >
                    <span className="block text-sm font-semibold text-white">
                      Alles löschen
                    </span>
                    <span className="block text-xs text-red-100">
                      Gesamter Teilbaum inkl. {confirmDescendants} Unterelement
                      {confirmDescendants === 1 ? '' : 'en'} wird entfernt
                    </span>
                  </button>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-surfaceHover"
                  >
                    Abbrechen
                  </button>
                </div>
              </>
            ) : (
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
            )}
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
