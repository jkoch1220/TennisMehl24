/**
 * Mindmap Service
 * Knoten/Tasks liegen geteilt in Appwrite (ein Dokument pro Node, Dokument-ID
 * = Node-ID), damit alle User denselben Stand sehen. Änderungen anderer kommen
 * per Realtime-Subscription rein. Nur die Ansicht (Pan/Zoom) bleibt pro
 * Browser im localStorage.
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
  MINDMAP_SUBTASKS_COLLECTION_ID,
  MINDMAP_ZEITEN_COLLECTION_ID,
  MINDMAP_BILDER_BUCKET_ID,
} from '../config/appwrite';
import {
  MindmapNode,
  MindmapSubtask,
  MindmapViewport,
  MindmapZeiteintrag,
} from '../types/mindmap';

export const ROOT_NODE_ID = 'root';

const VIEWPORT_STORAGE_KEY = 'tm_mindmap_viewport_v1';
// Alter Schlüssel der reinen localStorage-Phase — wird einmalig migriert
const LEGACY_STORAGE_KEY = 'tm_mindmap_v1';

const ROOT_NODE: MindmapNode = {
  id: ROOT_NODE_ID,
  parentId: null,
  type: 'knoten',
  titel: 'Tennismehl',
  collapsed: false,
};

const mapDocument = (doc: Record<string, unknown>): MindmapNode => ({
  id: doc.$id as string,
  parentId: (doc.parentId as string) || null,
  type: doc.type === 'task' ? 'task' : 'knoten',
  titel: (doc.titel as string) || '',
  collapsed: !!doc.collapsed,
  sortOrder: typeof doc.sortOrder === 'number' ? doc.sortOrder : 0,
  beschreibung: (doc.beschreibung as string) || '',
  faelligAm: (doc.faelligAm as string) || '',
  zustaendig: (doc.zustaendig as string) || '',
  erledigt: !!doc.erledigt,
  geschaetztMinuten:
    typeof doc.geschaetztMinuten === 'number' ? doc.geschaetztMinuten : 0,
  bilderIds: Array.isArray(doc.bilderIds) ? (doc.bilderIds as string[]) : [],
});

const toDocumentData = (node: MindmapNode) => ({
  parentId: node.parentId ?? '',
  type: node.type,
  titel: node.titel,
  collapsed: !!node.collapsed,
  sortOrder: node.sortOrder ?? 0,
  beschreibung: node.beschreibung ?? '',
  faelligAm: node.faelligAm ?? '',
  zustaendig: node.zustaendig ?? '',
  erledigt: !!node.erledigt,
  geschaetztMinuten: node.geschaetztMinuten ?? 0,
  bilderIds: node.bilderIds ?? [],
});

/**
 * Alle Nodes laden (paginiert). Stellt sicher, dass der Root-Knoten existiert,
 * und migriert beim allerersten Lauf die alten localStorage-Daten.
 */
export const loadMindmapNodes = async (): Promise<Record<string, MindmapNode>> => {
  const nodes: Record<string, MindmapNode> = {};
  let cursor: string | undefined;

  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const response = await databases.listDocuments(
      DATABASE_ID,
      MINDMAP_NODES_COLLECTION_ID,
      queries
    );
    for (const doc of response.documents) {
      const node = mapDocument(doc as unknown as Record<string, unknown>);
      nodes[node.id] = node;
    }
    if (response.documents.length < 100) break;
    cursor = response.documents[response.documents.length - 1].$id;
  }

  // Einmalige Migration: alte lokale Map hochladen, wenn die Collection leer ist
  if (Object.keys(nodes).length === 0) {
    const migrated = await migrateLegacyLocalStorage();
    Object.assign(nodes, migrated);
  }

  // Root sicherstellen
  if (!nodes[ROOT_NODE_ID]) {
    await createMindmapNode(ROOT_NODE);
    nodes[ROOT_NODE_ID] = ROOT_NODE;
  }

  return nodes;
};

const migrateLegacyLocalStorage = async (): Promise<Record<string, MindmapNode>> => {
  const migrated: Record<string, MindmapNode> = {};
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return migrated;
    const legacy = JSON.parse(stored) as { nodes?: Record<string, MindmapNode> };
    const legacyNodes = Object.values(legacy?.nodes ?? {});
    if (legacyNodes.length === 0) return migrated;

    console.log(`📦 Migriere ${legacyNodes.length} Mindmap-Knoten aus localStorage → Appwrite...`);
    for (const node of legacyNodes) {
      try {
        await createMindmapNode(node);
        migrated[node.id] = node;
      } catch (error) {
        // z. B. 409, wenn ein anderer Browser parallel migriert hat
        console.warn(`⚠️ Knoten "${node.titel}" nicht migriert:`, error);
      }
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    console.log('✅ Mindmap-Migration abgeschlossen');
  } catch (error) {
    console.warn('⚠️ Mindmap-Migration fehlgeschlagen:', error);
  }
  return migrated;
};

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
 * Realtime-Subscription auf die Mindmap-Collection. Liefert die Unsubscribe-
 * Funktion zurück.
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

// --- Ansicht (Pan/Zoom) bleibt pro Browser lokal ---

export const loadViewport = (): MindmapViewport => {
  try {
    const stored = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (stored) {
      const viewport = JSON.parse(stored) as MindmapViewport;
      if (typeof viewport?.scale === 'number') return viewport;
    }
  } catch (error) {
    console.warn('⚠️ Mindmap-Ansicht konnte nicht geladen werden:', error);
  }
  return { x: 0, y: 0, scale: 1 };
};

export const saveViewport = (viewport: MindmapViewport): void => {
  try {
    localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
  } catch (error) {
    console.warn('⚠️ Mindmap-Ansicht konnte nicht gespeichert werden:', error);
  }
};
