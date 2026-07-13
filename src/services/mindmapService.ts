/**
 * Mindmap Service
 * Persistenz vorerst im localStorage (später ggf. Appwrite-Collection).
 */
import { MindmapData } from '../types/mindmap';

const STORAGE_KEY = 'tm_mindmap_v1';

export const ROOT_NODE_ID = 'root';

export const createInitialData = (): MindmapData => ({
  version: 1,
  nodes: {
    [ROOT_NODE_ID]: {
      id: ROOT_NODE_ID,
      parentId: null,
      type: 'knoten',
      titel: 'Tennismehl',
      x: 0,
      y: 0,
      collapsed: false,
    },
  },
  viewport: { x: 0, y: 0, scale: 1 },
});

export const loadMindmap = (): MindmapData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as MindmapData;
      // Minimale Validierung: Root-Knoten muss existieren, sonst frisch starten
      if (data?.nodes?.[ROOT_NODE_ID]) {
        return {
          ...createInitialData(),
          ...data,
          viewport: { ...createInitialData().viewport, ...data.viewport },
        };
      }
    }
  } catch (error) {
    console.warn('⚠️ Mindmap konnte nicht geladen werden, starte leer:', error);
  }
  return createInitialData();
};

export const saveMindmap = (data: MindmapData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('⚠️ Mindmap konnte nicht gespeichert werden:', error);
  }
};
