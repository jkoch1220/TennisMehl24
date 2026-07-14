import { format } from 'date-fns';
import { MindmapNode } from '../../types/mindmap';

// Feste Kartenmaße, damit das Organigramm-Layout ohne DOM-Messung berechenbar ist.
// Tasks werden als Listenzeilen IN der Eltern-Karte gerendert, nicht als eigene
// Karten im Baum — die Kartenhöhe wächst deshalb mit der Anzahl der Tasks.
export const NODE_WIDTH = 240;
export const HEADER_HEIGHT = 40; // Titelzeile (px-2 py-2 + Border)
export const TASK_ROW_HEIGHT = 30; // eine Task-Zeile in der Liste
export const TASK_LIST_PAD = 8; // vertikales Padding der Taskliste

// Abstände im Organigramm
const H_GAP = 32; // horizontal zwischen Geschwister-Teilbäumen
const V_GAP = 56; // vertikal zwischen den Ebenen

// Stabile Geschwister-Reihenfolge: sortOrder, bei Gleichstand die ID
const bySortOrder = (a: MindmapNode, b: MindmapNode): number =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id);

export const getChildren = (
  nodes: Record<string, MindmapNode>,
  parentId: string
): MindmapNode[] =>
  Object.values(nodes)
    .filter((n) => n.parentId === parentId)
    .sort(bySortOrder);

// Baum-Kinder = alles außer Tasks (Knoten/Schritte und Entscheidungen)
export const getKnotenChildren = (
  nodes: Record<string, MindmapNode>,
  parentId: string
): MindmapNode[] =>
  getChildren(nodes, parentId).filter((n) => n.type !== 'task');

/** Wurzelknoten eines Boards (parentId === null) */
export const findRoot = (
  nodes: Record<string, MindmapNode>
): MindmapNode | undefined =>
  Object.values(nodes).find((n) => n.parentId === null);

export const getTasks = (
  nodes: Record<string, MindmapNode>,
  parentId: string
): MindmapNode[] => getChildren(nodes, parentId).filter((n) => n.type === 'task');

export const cardHeight = (
  nodes: Record<string, MindmapNode>,
  id: string
): number => {
  const taskCount = getTasks(nodes, id).length;
  return (
    HEADER_HEIGHT +
    (taskCount > 0 ? TASK_LIST_PAD + taskCount * TASK_ROW_HEIGHT : 0)
  );
};

export const getDescendantIds = (
  nodes: Record<string, MindmapNode>,
  id: string
): string[] => {
  const result: string[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const node of Object.values(nodes)) {
      if (node.parentId === current) {
        result.push(node.id);
        stack.push(node.id);
      }
    }
  }
  return result;
};

/**
 * Sichtbar = kein Vorfahre ist eingeklappt. Verwaiste Knoten (Parent fehlt)
 * gelten als unsichtbar.
 */
export const getVisibleNodes = (
  nodes: Record<string, MindmapNode>
): MindmapNode[] => {
  const memo = new Map<string, boolean>();
  const isVisible = (node: MindmapNode): boolean => {
    if (node.parentId === null) return true;
    const cached = memo.get(node.id);
    if (cached !== undefined) return cached;
    const parent = nodes[node.parentId];
    const result = !!parent && !parent.collapsed && isVisible(parent);
    memo.set(node.id, result);
    return result;
  };
  return Object.values(nodes).filter(isVisible);
};

export interface LayoutPos {
  x: number;
  y: number;
}

/**
 * Klassisches Organigramm-Layout (top-down): Root oben, Kind-Knoten als Gruppe
 * mittig unter dem Eltern-Knoten. Nur Knoten (keine Tasks) sind Baum-Elemente;
 * eingeklappte Teilbäume nehmen keinen Platz ein.
 */
export const layoutTree = (
  nodes: Record<string, MindmapNode>,
  rootId: string
): Record<string, LayoutPos> => {
  const pos: Record<string, LayoutPos> = {};
  if (!nodes[rootId]) return pos;

  const visibleChildren = (node: MindmapNode): MindmapNode[] =>
    node.collapsed ? [] : getKnotenChildren(nodes, node.id);

  const widthCache = new Map<string, number>();
  const subtreeWidth = (id: string): number => {
    const cached = widthCache.get(id);
    if (cached !== undefined) return cached;
    const kids = visibleChildren(nodes[id]);
    const width =
      kids.length === 0
        ? NODE_WIDTH
        : Math.max(
            NODE_WIDTH,
            kids.reduce((sum, k) => sum + subtreeWidth(k.id), 0) +
              H_GAP * (kids.length - 1)
          );
    widthCache.set(id, width);
    return width;
  };

  const place = (id: string, left: number, y: number) => {
    const node = nodes[id];
    pos[id] = { x: left + subtreeWidth(id) / 2 - NODE_WIDTH / 2, y };
    let childLeft = left;
    for (const kid of visibleChildren(node)) {
      place(kid.id, childLeft, y + cardHeight(nodes, id) + V_GAP);
      childLeft += subtreeWidth(kid.id) + H_GAP;
    }
  };

  place(rootId, 0, 0);
  return pos;
};

export const istTaskUeberfaellig = (node: MindmapNode): boolean =>
  node.type === 'task' &&
  !node.erledigt &&
  !!node.faelligAm &&
  node.faelligAm < format(new Date(), 'yyyy-MM-dd');
