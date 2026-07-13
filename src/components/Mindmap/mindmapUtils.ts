import { format } from 'date-fns';
import { MindmapNode } from '../../types/mindmap';

// Feste Kartenbreite (w-56), damit Verbindungslinien ohne DOM-Messung berechenbar sind
export const NODE_WIDTH = 224;
// Vertikaler Anker der Verbindungslinien (Höhe der Titelzeilen-Mitte)
export const ANCHOR_Y = 24;

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

export const istTaskUeberfaellig = (node: MindmapNode): boolean =>
  node.type === 'task' &&
  !node.erledigt &&
  !!node.faelligAm &&
  node.faelligAm < format(new Date(), 'yyyy-MM-dd');
