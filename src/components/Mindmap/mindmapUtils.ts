import { format } from 'date-fns';
import { MindmapNode } from '../../types/mindmap';

// Feste Kartenmaße, damit das Organigramm-Layout ohne DOM-Messung berechenbar ist
export const NODE_WIDTH = 224;
export const KNOTEN_HEIGHT = 40;
export const TASK_HEIGHT = 96;

// Abstände im Organigramm
const H_GAP = 32; // horizontal zwischen Geschwister-Teilbäumen
const V_GAP = 56; // vertikal zwischen den Ebenen

export const nodeHeight = (node: MindmapNode): number =>
  node.type === 'task' ? TASK_HEIGHT : KNOTEN_HEIGHT;

export const getChildren = (
  nodes: Record<string, MindmapNode>,
  parentId: string
): MindmapNode[] => Object.values(nodes).filter((n) => n.parentId === parentId);

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
 * Klassisches Organigramm-Layout (top-down): Root oben, Kinder als Gruppe
 * mittig unter dem Eltern-Knoten. Eingeklappte Teilbäume nehmen keinen
 * Platz ein; das Layout wird bei jeder Änderung komplett neu berechnet.
 */
export const layoutTree = (
  nodes: Record<string, MindmapNode>,
  rootId: string
): Record<string, LayoutPos> => {
  const pos: Record<string, LayoutPos> = {};
  if (!nodes[rootId]) return pos;

  const visibleChildren = (node: MindmapNode): MindmapNode[] =>
    node.collapsed ? [] : getChildren(nodes, node.id);

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
      place(kid.id, childLeft, y + nodeHeight(node) + V_GAP);
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
