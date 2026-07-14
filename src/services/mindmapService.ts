/**
 * Mindmap Service
 * Knoten/Tasks liegen geteilt in Appwrite (ein Dokument pro Node, Dokument-ID
 * = Node-ID), damit alle User denselben Stand sehen. Änderungen anderer kommen
 * per Realtime-Subscription rein. Nur die Ansicht (Pan/Zoom) bleibt pro
 * Browser im localStorage.
 */
import { Query } from 'appwrite';
import {
  client,
  databases,
  DATABASE_ID,
  MINDMAP_NODES_COLLECTION_ID,
} from '../config/appwrite';
import { MindmapNode, MindmapViewport } from '../types/mindmap';

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
