import { format } from 'date-fns';
import { MindmapBoard, MindmapGeraet, MindmapNode } from '../../types/mindmap';

// Feste Kartenbreite, damit das Organigramm-Layout ohne DOM-Messung berechenbar
// ist. Tasks werden als Listenzeilen IN der Eltern-Karte gerendert; die
// Kartenhöhe wächst mit der Anzahl der Tasks UND mit umbrechenden Titelzeilen.
export const NODE_WIDTH = 240;
export const TITLE_LINE_HEIGHT = 18; // muss zum leading des Titel-Spans passen
export const TASK_ROW_HEIGHT = 30; // eine Task-Zeile in der Liste
export const TASK_LIST_PAD = 8; // vertikales Padding der Taskliste

// Titel-Umbruch ohne DOM: Text per Canvas messen und den CSS-Umbruch simulieren
let messContext: CanvasRenderingContext2D | null = null;
const getMessContext = (): CanvasRenderingContext2D | null => {
  if (!messContext) {
    messContext = document.createElement('canvas').getContext('2d');
    if (messContext) {
      // text-sm font-semibold im Tailwind-Default-Font-Stack
      messContext.font =
        '600 14px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    }
  }
  return messContext;
};

/** Anzahl der Zeilen, die der Titel bei gegebener Breite belegt (mit Puffer) */
export const titelZeilen = (titel: string, verfuegbareBreite: number): number => {
  const ctx = getMessContext();
  if (!ctx || !titel) return 1;
  const breite = Math.max(60, verfuegbareBreite);
  let zeilen = 1;
  let aktuelleBreite = 0;
  const leerzeichen = ctx.measureText(' ').width;
  for (const wort of titel.split(/\s+/)) {
    // 8 % Puffer gegen Font-Abweichungen zwischen Canvas und DOM — lieber eine
    // Zeile zu viel einplanen als Karten im Layout überlappen lassen
    const wortBreite = ctx.measureText(wort).width * 1.08;
    if (wortBreite > breite) {
      // Überlanges Wort bricht mitten im Wort um (break-words)
      const rest = breite - aktuelleBreite;
      const uebrig = wortBreite - Math.max(0, rest);
      zeilen += Math.ceil(uebrig / breite);
      aktuelleBreite = uebrig % breite || breite;
      continue;
    }
    const benoetigt = aktuelleBreite === 0 ? wortBreite : aktuelleBreite + leerzeichen + wortBreite;
    if (benoetigt > breite) {
      zeilen += 1;
      aktuelleBreite = wortBreite;
    } else {
      aktuelleBreite = benoetigt;
    }
  }
  return Math.min(zeilen, 12);
};

/** Höhe der Titelzeile einer Karte (wächst mit umbrechendem Titel) */
export const headerHeight = (
  nodes: Record<string, MindmapNode>,
  node: MindmapNode
): number => {
  const hatChevron = getKnotenChildren(nodes, node.id).length > 0;
  // px-2 (16) + Hover-Aktionen (~70, inkl. Details-Button) + optional
  // Chevron/Typ-Icon; Unterprozess: Icon (20) + permanenter Öffnen-Button (24)
  const verfuegbar =
    NODE_WIDTH -
    16 -
    70 -
    (hatChevron ? 21 : 0) -
    (node.type === 'entscheidung' ? 20 : 0) -
    (node.type === 'prozess' ? 44 : 0);
  const zeilen = titelZeilen(node.titel, verfuegbar);
  return Math.max(40, 22 + zeilen * TITLE_LINE_HEIGHT);
};

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

// Baum-Kinder = Knoten/Schritte und Entscheidungen (keine Tasks, keine Notizen —
// Tasks hängen als Liste in der Karte, Notizen schweben frei daneben)
export const getKnotenChildren = (
  nodes: Record<string, MindmapNode>,
  parentId: string
): MindmapNode[] =>
  getChildren(nodes, parentId).filter(
    (n) => n.type !== 'task' && n.type !== 'notiz'
  );

/** Notiz-Blasen, die an einem Knoten hängen */
export const getNotizen = (
  nodes: Record<string, MindmapNode>,
  parentId: string
): MindmapNode[] => getChildren(nodes, parentId).filter((n) => n.type === 'notiz');

/**
 * Wurzelknoten eines Boards (parentId === null). Standalone-Notizen haben
 * ebenfalls parentId null und dürfen hier nicht mitzählen.
 */
export const findRoot = (
  nodes: Record<string, MindmapNode>
): MindmapNode | undefined =>
  Object.values(nodes).find((n) => n.parentId === null && n.type !== 'notiz');

export const getTasks = (
  nodes: Record<string, MindmapNode>,
  parentId: string
): MindmapNode[] => getChildren(nodes, parentId).filter((n) => n.type === 'task');

export const cardHeight = (
  nodes: Record<string, MindmapNode>,
  id: string
): number => {
  const node = nodes[id];
  if (!node) return 40;
  const taskCount = getTasks(nodes, id).length;
  return (
    headerHeight(nodes, node) +
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
      // abstandOben = zusätzlicher, per Drag eingestellter Abstand zum Eltern-Knoten
      place(
        kid.id,
        childLeft,
        y + cardHeight(nodes, id) + V_GAP + (kid.abstandOben ?? 0)
      );
      childLeft += subtreeWidth(kid.id) + H_GAP;
    }
  };

  place(rootId, 0, 0);
  return pos;
};

// Werkzeug-/Material-Blasen an Prozessschritten: feste Breite, Höhe wächst mit
export const ZUBEHOER_WIDTH = 176;

// Notiz-Blasen: feste Breite, Höhe wächst mit dem Text (für die Verbindungslinie)
export const NOTIZ_WIDTH = 200;
export const notizHeight = (titel: string): number => {
  // 13px-Font ist etwas schmaler als die 14px-Messung — als Näherung ausreichend
  const zeilen = titelZeilen(titel, NOTIZ_WIDTH - 24);
  return 20 + zeilen * TITLE_LINE_HEIGHT;
};

export const istTaskUeberfaellig = (node: MindmapNode): boolean =>
  node.type === 'task' &&
  !node.erledigt &&
  !!node.faelligAm &&
  node.faelligAm < format(new Date(), 'yyyy-MM-dd');

export interface ProzessFaelligkeit {
  geraet: MindmapGeraet;
  restStunden: number; // negativ = überfällig
  faellig: boolean;
}

/**
 * Wartungs-Fälligkeit eines Prozess-Boards nach Betriebsstunden.
 * null = keine Wartungsplanung konfiguriert.
 */
export const prozessFaelligkeit = (
  board: MindmapBoard,
  geraete: MindmapGeraet[]
): ProzessFaelligkeit | null => {
  if (board.typ !== 'prozess' || !board.geraetId || !board.faelligBeiStunden) {
    return null;
  }
  const geraet = geraete.find((g) => g.id === board.geraetId);
  if (!geraet) return null;
  const restStunden = board.faelligBeiStunden - geraet.betriebsstunden;
  return { geraet, restStunden, faellig: restStunden <= 0 };
};

/** Review fällig = Review-Datum erreicht/überschritten und Task noch offen */
export const istReviewFaellig = (node: MindmapNode): boolean =>
  node.type === 'task' &&
  !node.erledigt &&
  !!node.reviewAm &&
  node.reviewAm <= format(new Date(), 'yyyy-MM-dd');
