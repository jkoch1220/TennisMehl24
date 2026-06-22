import type { WikiPage } from '../../../types/wiki';

// Ein flach ausgerollter Baum-Eintrag (für @dnd-kit Sortable mit Tiefen-Projektion)
export interface FlattenedItem {
  id: string;
  parentId: string | null;
  depth: number;
  page: WikiPage;
  childCount: number;
  collapsed: boolean;
}

/**
 * Rollt den (bereits sortierten) verschachtelten Seitenbaum flach aus.
 * Kinder eingeklappter Ordner werden ausgelassen, damit nur Sichtbares
 * sortierbar ist – außer für das gerade gezogene Element (dessen Kinder
 * werden separat ausgeblendet).
 */
export const flattenTree = (
  tree: WikiPage[],
  expanded: Set<string>,
  parentId: string | null = null,
  depth = 0
): FlattenedItem[] => {
  return tree.reduce<FlattenedItem[]>((acc, page) => {
    const id = page.$id!;
    const children = page.children || [];
    const collapsed = children.length > 0 && !expanded.has(id);

    acc.push({
      id,
      parentId,
      depth,
      page,
      childCount: children.length,
      collapsed,
    });

    if (children.length > 0 && expanded.has(id)) {
      acc.push(...flattenTree(children, expanded, id, depth + 1));
    }
    return acc;
  }, []);
};

// IDs aller Nachfahren der angegebenen Elemente (zum Ausblenden beim Ziehen)
export const getChildrenIds = (items: FlattenedItem[], ids: string[]): string[] => {
  const result = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && result.has(item.parentId) && !result.has(item.id)) {
        result.add(item.id);
        changed = true;
      }
    }
  }
  ids.forEach((id) => result.delete(id));
  return Array.from(result);
};

const getMaxDepth = (previousItem?: FlattenedItem) =>
  previousItem ? previousItem.depth + 1 : 0;

const getMinDepth = (nextItem?: FlattenedItem) => (nextItem ? nextItem.depth : 0);

/**
 * Berechnet die projizierte Tiefe & den neuen Parent anhand des horizontalen
 * Drag-Versatzes – das ist die Notion-artige „nach rechts ziehen = Unterseite".
 */
export const getProjection = (
  items: FlattenedItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentationWidth: number
) => {
  const overItemIndex = items.findIndex(({ id }) => id === overId);
  const activeItemIndex = items.findIndex(({ id }) => id === activeId);
  const activeItem = items[activeItemIndex];

  // Reihenfolge nach gedachtem Verschieben
  const reordered = arrayMoveLocal(items, activeItemIndex, overItemIndex);
  const overIndexInReordered = reordered.findIndex(({ id }) => id === overId);
  const previousItem = reordered[overIndexInReordered - 1];
  const nextItem = reordered[overIndexInReordered + 1];

  const dragDepth = Math.round(dragOffset / indentationWidth);
  const projectedDepth = activeItem.depth + dragDepth;
  const maxDepth = getMaxDepth(previousItem);
  const minDepth = getMinDepth(nextItem);

  let depth = projectedDepth;
  if (projectedDepth >= maxDepth) depth = maxDepth;
  else if (projectedDepth < minDepth) depth = minDepth;

  const getParentId = (): string | null => {
    if (depth === 0 || !previousItem) return null;
    if (depth === previousItem.depth) return previousItem.parentId;
    if (depth > previousItem.depth) return previousItem.id;
    // Tiefer als nächster Vorgänger: passenden Vorfahren suchen
    const newParent = reordered
      .slice(0, overIndexInReordered)
      .reverse()
      .find((item) => item.depth === depth)?.parentId;
    return newParent ?? null;
  };

  return { depth, maxDepth, minDepth, parentId: getParentId() };
};

// Lokale arrayMove-Hilfsfunktion (vermeidet Import-Abhängigkeit hier)
export const arrayMoveLocal = <T>(array: T[], from: number, to: number): T[] => {
  const result = array.slice();
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
};
