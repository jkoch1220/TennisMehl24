/**
 * Planungs-Service (Mindmap/Organigramm + Prozess-Boards)
 * Boards und Knoten/Tasks liegen geteilt in Appwrite (Dokument-ID = Node-ID),
 * damit alle User denselben Stand sehen. Änderungen anderer kommen per
 * Realtime-Subscription rein. Nur die Ansicht (Pan/Zoom) bleibt pro Browser
 * im localStorage.
 */
import { ID, Query } from 'appwrite';
import {
  client,
  databases,
  storage,
  APPWRITE_ENDPOINT,
  PROJECT_ID,
  DATABASE_ID,
  MINDMAP_NODES_COLLECTION_ID,
  MINDMAP_BOARDS_COLLECTION_ID,
  MINDMAP_GERAETE_COLLECTION_ID,
  MINDMAP_DURCHFUEHRUNGEN_COLLECTION_ID,
  MINDMAP_SUBTASKS_COLLECTION_ID,
  MINDMAP_ZEITEN_COLLECTION_ID,
  MINDMAP_BILDER_BUCKET_ID,
} from '../config/appwrite';
import {
  MindmapBoard,
  MindmapBoardTyp,
  MindmapDurchfuehrung,
  MindmapGeraet,
  MindmapNode,
  MindmapSubtask,
  MindmapViewport,
  MindmapZeiteintrag,
} from '../types/mindmap';

const VIEWPORT_STORAGE_KEY = 'tm_mindmap_viewport_v2';

const mapDocument = (doc: Record<string, unknown>): MindmapNode => ({
  id: doc.$id as string,
  boardId: (doc.boardId as string) || '',
  parentId: (doc.parentId as string) || null,
  type:
    doc.type === 'task'
      ? 'task'
      : doc.type === 'entscheidung'
        ? 'entscheidung'
        : doc.type === 'prozess'
          ? 'prozess'
          : doc.type === 'notiz'
            ? 'notiz'
            : 'knoten',
  titel: (doc.titel as string) || '',
  edgeLabel: (doc.edgeLabel as string) || '',
  linkedBoardId: (doc.linkedBoardId as string) || '',
  collapsed: !!doc.collapsed,
  sortOrder: typeof doc.sortOrder === 'number' ? doc.sortOrder : 0,
  verbindungen: Array.isArray(doc.verbindungen) ? (doc.verbindungen as string[]) : [],
  abstandOben: typeof doc.abstandOben === 'number' ? doc.abstandOben : 0,
  posX: typeof doc.posX === 'number' ? doc.posX : 0,
  posY: typeof doc.posY === 'number' ? doc.posY : 0,
  beschreibung: (doc.beschreibung as string) || '',
  faelligAm: (doc.faelligAm as string) || '',
  reviewAm: (doc.reviewAm as string) || '',
  zustaendig: (doc.zustaendig as string) || '',
  erledigt: !!doc.erledigt,
  geschaetztMinuten:
    typeof doc.geschaetztMinuten === 'number' ? doc.geschaetztMinuten : 0,
  bilderIds: Array.isArray(doc.bilderIds) ? (doc.bilderIds as string[]) : [],
});

const toDocumentData = (node: MindmapNode) => ({
  boardId: node.boardId,
  parentId: node.parentId ?? '',
  type: node.type,
  titel: node.titel,
  edgeLabel: node.edgeLabel ?? '',
  linkedBoardId: node.linkedBoardId ?? '',
  collapsed: !!node.collapsed,
  sortOrder: node.sortOrder ?? 0,
  verbindungen: node.verbindungen ?? [],
  abstandOben: node.abstandOben ?? 0,
  posX: Math.round(node.posX ?? 0),
  posY: Math.round(node.posY ?? 0),
  beschreibung: node.beschreibung ?? '',
  faelligAm: node.faelligAm ?? '',
  reviewAm: node.reviewAm ?? '',
  zustaendig: node.zustaendig ?? '',
  erledigt: !!node.erledigt,
  geschaetztMinuten: node.geschaetztMinuten ?? 0,
  bilderIds: node.bilderIds ?? [],
});

const listAlleDokumente = async (
  queries: string[]
): Promise<Record<string, MindmapNode>> => {
  const nodes: Record<string, MindmapNode> = {};
  let cursor: string | undefined;
  for (;;) {
    const seite = [...queries, Query.limit(100)];
    if (cursor) seite.push(Query.cursorAfter(cursor));
    const response = await databases.listDocuments(
      DATABASE_ID,
      MINDMAP_NODES_COLLECTION_ID,
      seite
    );
    for (const doc of response.documents) {
      const node = mapDocument(doc as unknown as Record<string, unknown>);
      nodes[node.id] = node;
    }
    if (response.documents.length < 100) break;
    cursor = response.documents[response.documents.length - 1].$id;
  }
  return nodes;
};

/** Alle Nodes eines Boards laden */
export const loadBoardNodes = (boardId: string): Promise<Record<string, MindmapNode>> =>
  listAlleDokumente([Query.equal('boardId', boardId)]);

/** Alle Nodes über alle Boards (für die Task-Verwaltung) */
export const loadAllMindmapNodes = (): Promise<Record<string, MindmapNode>> =>
  listAlleDokumente([]);

export const createMindmapNode = async (node: MindmapNode): Promise<void> => {
  await databases.createDocument(
    DATABASE_ID,
    MINDMAP_NODES_COLLECTION_ID,
    node.id,
    toDocumentData(node)
  );
};

export const updateMindmapNode = async (node: MindmapNode): Promise<void> => {
  await databases.updateDocument(
    DATABASE_ID,
    MINDMAP_NODES_COLLECTION_ID,
    node.id,
    toDocumentData(node)
  );
};

export const deleteMindmapNodes = async (ids: string[]): Promise<void> => {
  await Promise.all(
    ids.map((id) =>
      databases
        .deleteDocument(DATABASE_ID, MINDMAP_NODES_COLLECTION_ID, id)
        .catch((error) => console.warn(`⚠️ Knoten ${id} nicht gelöscht:`, error))
    )
  );
};

/**
 * Realtime-Subscription auf die Node-Collection. Liefert die Unsubscribe-
 * Funktion zurück; der Aufrufer filtert nach boardId.
 */
export const subscribeMindmap = (
  onChange: (event: 'upsert' | 'delete', node: MindmapNode) => void
): (() => void) => {
  const channel = `databases.${DATABASE_ID}.collections.${MINDMAP_NODES_COLLECTION_ID}.documents`;
  return client.subscribe(channel, (response) => {
    const events: string[] = response.events || [];
    const node = mapDocument(response.payload as Record<string, unknown>);
    if (events.some((e) => e.endsWith('.delete'))) {
      onChange('delete', node);
    } else {
      onChange('upsert', node);
    }
  });
};

// --- Boards ---

const mapBoard = (doc: Record<string, unknown>): MindmapBoard => ({
  id: doc.$id as string,
  name: (doc.name as string) || '',
  typ: doc.typ === 'prozess' ? 'prozess' : 'organigramm',
  beschreibung: (doc.beschreibung as string) || '',
  bilderIds: Array.isArray(doc.bilderIds) ? (doc.bilderIds as string[]) : [],
  zustaendig: (doc.zustaendig as string) || '',
  geraetId: (doc.geraetId as string) || '',
  intervallStunden:
    typeof doc.intervallStunden === 'number' ? doc.intervallStunden : 0,
  faelligBeiStunden:
    typeof doc.faelligBeiStunden === 'number' ? doc.faelligBeiStunden : 0,
});

export const listBoards = async (): Promise<MindmapBoard[]> => {
  const response = await databases.listDocuments(
    DATABASE_ID,
    MINDMAP_BOARDS_COLLECTION_ID,
    [Query.limit(100)]
  );
  return response.documents
    .map((doc) => mapBoard(doc as unknown as Record<string, unknown>))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const getBoard = async (boardId: string): Promise<MindmapBoard | null> => {
  try {
    const doc = await databases.getDocument(
      DATABASE_ID,
      MINDMAP_BOARDS_COLLECTION_ID,
      boardId
    );
    return mapBoard(doc as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
};

/** Board anlegen inkl. Wurzelknoten */
export const createBoard = async (
  name: string,
  typ: MindmapBoardTyp
): Promise<MindmapBoard> => {
  const doc = await databases.createDocument(
    DATABASE_ID,
    MINDMAP_BOARDS_COLLECTION_ID,
    ID.unique(),
    { name, typ }
  );
  const board = mapBoard(doc as unknown as Record<string, unknown>);
  await createMindmapNode({
    id: crypto.randomUUID(),
    boardId: board.id,
    parentId: null,
    type: 'knoten',
    titel: typ === 'prozess' ? `Start: ${name}` : name,
    collapsed: false,
    sortOrder: 0,
  });
  return board;
};

export const updateBoard = async (board: MindmapBoard): Promise<void> => {
  await databases.updateDocument(DATABASE_ID, MINDMAP_BOARDS_COLLECTION_ID, board.id, {
    name: board.name,
    typ: board.typ,
    beschreibung: board.beschreibung ?? '',
    bilderIds: board.bilderIds ?? [],
    zustaendig: board.zustaendig ?? '',
    geraetId: board.geraetId ?? '',
    intervallStunden: board.intervallStunden ?? 0,
    faelligBeiStunden: board.faelligBeiStunden ?? 0,
  });
};

/** Board inkl. aller Knoten, Tasks, Task-Anhänge und Durchführungen löschen */
export const deleteBoard = async (boardId: string): Promise<void> => {
  const nodes = await loadBoardNodes(boardId);
  const tasks = Object.values(nodes).filter((n) => n.type === 'task');
  await deleteTaskAnhaenge(tasks);
  const durchfuehrungen = await listDurchfuehrungen(boardId).catch(
    () => [] as MindmapDurchfuehrung[]
  );
  await Promise.all(
    durchfuehrungen.map((d) => deleteDurchfuehrung(d).catch(() => undefined))
  );
  await deleteMindmapNodes(Object.keys(nodes));
  await databases.deleteDocument(DATABASE_ID, MINDMAP_BOARDS_COLLECTION_ID, boardId);
};

export const subscribeBoards = (onChange: () => void): (() => void) => {
  const channel = `databases.${DATABASE_ID}.collections.${MINDMAP_BOARDS_COLLECTION_ID}.documents`;
  return client.subscribe(channel, () => onChange());
};

// --- Geräte mit Betriebsstunden (z. B. Radlader) ---

const mapGeraet = (doc: Record<string, unknown>): MindmapGeraet => ({
  id: doc.$id as string,
  name: (doc.name as string) || '',
  betriebsstunden:
    typeof doc.betriebsstunden === 'number' ? doc.betriebsstunden : 0,
  aktualisiertAm: (doc.aktualisiertAm as string) || '',
});

export const listGeraete = async (): Promise<MindmapGeraet[]> => {
  const response = await databases.listDocuments(
    DATABASE_ID,
    MINDMAP_GERAETE_COLLECTION_ID,
    [Query.limit(100)]
  );
  return response.documents
    .map((doc) => mapGeraet(doc as unknown as Record<string, unknown>))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const createGeraet = async (
  name: string,
  betriebsstunden: number,
  aktualisiertAm: string
): Promise<MindmapGeraet> => {
  const doc = await databases.createDocument(
    DATABASE_ID,
    MINDMAP_GERAETE_COLLECTION_ID,
    ID.unique(),
    { name, betriebsstunden, aktualisiertAm }
  );
  return mapGeraet(doc as unknown as Record<string, unknown>);
};

export const updateGeraet = async (geraet: MindmapGeraet): Promise<void> => {
  await databases.updateDocument(
    DATABASE_ID,
    MINDMAP_GERAETE_COLLECTION_ID,
    geraet.id,
    {
      name: geraet.name,
      betriebsstunden: geraet.betriebsstunden,
      aktualisiertAm: geraet.aktualisiertAm,
    }
  );
};

export const deleteGeraet = async (id: string): Promise<void> => {
  await databases.deleteDocument(DATABASE_ID, MINDMAP_GERAETE_COLLECTION_ID, id);
};

export const subscribeGeraete = (onChange: () => void): (() => void) => {
  const channel = `databases.${DATABASE_ID}.collections.${MINDMAP_GERAETE_COLLECTION_ID}.documents`;
  return client.subscribe(channel, () => onChange());
};

// --- Dokumentierte Durchführungen eines Prozesses ---

const mapDurchfuehrung = (doc: Record<string, unknown>): MindmapDurchfuehrung => ({
  id: doc.$id as string,
  boardId: (doc.boardId as string) || '',
  geraetId: (doc.geraetId as string) || '',
  datum: (doc.datum as string) || '',
  person: (doc.person as string) || '',
  notizen: (doc.notizen as string) || '',
  minuten: typeof doc.minuten === 'number' ? doc.minuten : 0,
  stundenBeiDurchfuehrung:
    typeof doc.stundenBeiDurchfuehrung === 'number' ? doc.stundenBeiDurchfuehrung : 0,
  bilderIds: Array.isArray(doc.bilderIds) ? (doc.bilderIds as string[]) : [],
});

export const listDurchfuehrungen = async (
  boardId: string
): Promise<MindmapDurchfuehrung[]> => {
  const response = await databases.listDocuments(
    DATABASE_ID,
    MINDMAP_DURCHFUEHRUNGEN_COLLECTION_ID,
    [Query.equal('boardId', boardId), Query.limit(200)]
  );
  return response.documents
    .map((doc) => mapDurchfuehrung(doc as unknown as Record<string, unknown>))
    .sort((a, b) => b.datum.localeCompare(a.datum) || b.id.localeCompare(a.id));
};

export const createDurchfuehrung = async (
  durchfuehrung: Omit<MindmapDurchfuehrung, 'id'>
): Promise<MindmapDurchfuehrung> => {
  const doc = await databases.createDocument(
    DATABASE_ID,
    MINDMAP_DURCHFUEHRUNGEN_COLLECTION_ID,
    ID.unique(),
    durchfuehrung
  );
  return mapDurchfuehrung(doc as unknown as Record<string, unknown>);
};

export const deleteDurchfuehrung = async (
  durchfuehrung: MindmapDurchfuehrung
): Promise<void> => {
  await Promise.all(
    (durchfuehrung.bilderIds ?? []).map((fileId) =>
      deleteTaskBild(fileId).catch(() => undefined)
    )
  );
  await databases.deleteDocument(
    DATABASE_ID,
    MINDMAP_DURCHFUEHRUNGEN_COLLECTION_ID,
    durchfuehrung.id
  );
};

// --- Subtasks (Checkliste pro Task) ---

const mapSubtask = (doc: Record<string, unknown>): MindmapSubtask => ({
  id: doc.$id as string,
  taskId: (doc.taskId as string) || '',
  titel: (doc.titel as string) || '',
  erledigt: !!doc.erledigt,
  sortOrder: typeof doc.sortOrder === 'number' ? doc.sortOrder : 0,
});

export const listSubtasks = async (taskId: string): Promise<MindmapSubtask[]> => {
  const response = await databases.listDocuments(
    DATABASE_ID,
    MINDMAP_SUBTASKS_COLLECTION_ID,
    [Query.equal('taskId', taskId), Query.limit(100)]
  );
  return response.documents
    .map((doc) => mapSubtask(doc as unknown as Record<string, unknown>))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
};

export const createSubtask = async (
  taskId: string,
  titel: string,
  sortOrder: number
): Promise<MindmapSubtask> => {
  const doc = await databases.createDocument(
    DATABASE_ID,
    MINDMAP_SUBTASKS_COLLECTION_ID,
    ID.unique(),
    { taskId, titel, erledigt: false, sortOrder }
  );
  return mapSubtask(doc as unknown as Record<string, unknown>);
};

export const updateSubtask = async (subtask: MindmapSubtask): Promise<void> => {
  await databases.updateDocument(
    DATABASE_ID,
    MINDMAP_SUBTASKS_COLLECTION_ID,
    subtask.id,
    {
      titel: subtask.titel,
      erledigt: subtask.erledigt,
      sortOrder: subtask.sortOrder,
    }
  );
};

export const deleteSubtask = async (id: string): Promise<void> => {
  await databases.deleteDocument(DATABASE_ID, MINDMAP_SUBTASKS_COLLECTION_ID, id);
};

// --- Zeiterfassung (Einträge pro Task) ---

const mapZeiteintrag = (doc: Record<string, unknown>): MindmapZeiteintrag => ({
  id: doc.$id as string,
  taskId: (doc.taskId as string) || '',
  person: (doc.person as string) || '',
  beschreibung: (doc.beschreibung as string) || '',
  datum: (doc.datum as string) || '',
  minuten: typeof doc.minuten === 'number' ? doc.minuten : 0,
});

export const listZeiteintraege = async (
  taskId: string
): Promise<MindmapZeiteintrag[]> => {
  const response = await databases.listDocuments(
    DATABASE_ID,
    MINDMAP_ZEITEN_COLLECTION_ID,
    [Query.equal('taskId', taskId), Query.limit(200)]
  );
  return response.documents
    .map((doc) => mapZeiteintrag(doc as unknown as Record<string, unknown>))
    .sort((a, b) => b.datum.localeCompare(a.datum) || b.id.localeCompare(a.id));
};

export const createZeiteintrag = async (
  eintrag: Omit<MindmapZeiteintrag, 'id'>
): Promise<MindmapZeiteintrag> => {
  const doc = await databases.createDocument(
    DATABASE_ID,
    MINDMAP_ZEITEN_COLLECTION_ID,
    ID.unique(),
    eintrag
  );
  return mapZeiteintrag(doc as unknown as Record<string, unknown>);
};

export const deleteZeiteintrag = async (id: string): Promise<void> => {
  await databases.deleteDocument(DATABASE_ID, MINDMAP_ZEITEN_COLLECTION_ID, id);
};

// --- Task-Bilder (Appwrite Storage) ---

export const uploadTaskBild = async (file: File): Promise<string> => {
  const erlaubt = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  if (!erlaubt.includes(file.type)) {
    throw new Error('Nur PNG, JPEG, GIF oder WebP erlaubt');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Datei zu groß (max. 10 MB)');
  }
  const result = await storage.createFile(MINDMAP_BILDER_BUCKET_ID, ID.unique(), file);
  return result.$id;
};

export const getTaskBildUrl = (fileId: string, preview = false): string => {
  const base = `${APPWRITE_ENDPOINT}/storage/buckets/${MINDMAP_BILDER_BUCKET_ID}/files/${fileId}`;
  return preview
    ? `${base}/preview?width=400&project=${PROJECT_ID}`
    : `${base}/view?project=${PROJECT_ID}`;
};

export const deleteTaskBild = async (fileId: string): Promise<void> => {
  await storage.deleteFile(MINDMAP_BILDER_BUCKET_ID, fileId);
};

/**
 * Aufräumen beim Löschen von Tasks: Subtasks, Zeiteinträge und Bilder der
 * betroffenen Tasks entfernen (fire-and-forget vom Aufrufer).
 */
export const deleteTaskAnhaenge = async (tasks: MindmapNode[]): Promise<void> => {
  for (const task of tasks) {
    try {
      const [subtasks, zeiten] = await Promise.all([
        listSubtasks(task.id),
        listZeiteintraege(task.id),
      ]);
      await Promise.all([
        ...subtasks.map((s) => deleteSubtask(s.id)),
        ...zeiten.map((z) => deleteZeiteintrag(z.id)),
        ...(task.bilderIds ?? []).map((fileId) =>
          deleteTaskBild(fileId).catch(() => undefined)
        ),
      ]);
    } catch (error) {
      console.warn(`⚠️ Anhänge von Task "${task.titel}" nicht aufgeräumt:`, error);
    }
  }
};

// --- Ansicht (Pan/Zoom) bleibt pro Browser und Board lokal ---

export const loadViewport = (boardId: string): MindmapViewport => {
  try {
    const stored = localStorage.getItem(`${VIEWPORT_STORAGE_KEY}_${boardId}`);
    if (stored) {
      const viewport = JSON.parse(stored) as MindmapViewport;
      if (typeof viewport?.scale === 'number') return viewport;
    }
  } catch (error) {
    console.warn('⚠️ Board-Ansicht konnte nicht geladen werden:', error);
  }
  return { x: 0, y: 0, scale: 1 };
};

export const saveViewport = (boardId: string, viewport: MindmapViewport): void => {
  try {
    localStorage.setItem(
      `${VIEWPORT_STORAGE_KEY}_${boardId}`,
      JSON.stringify(viewport)
    );
  } catch (error) {
    console.warn('⚠️ Board-Ansicht konnte nicht gespeichert werden:', error);
  }
};
