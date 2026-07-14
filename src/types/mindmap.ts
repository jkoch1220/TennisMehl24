// Typen für das Mindmap-/Organigramm-Planungstool

export type MindmapNodeType = 'knoten' | 'task';

export interface MindmapNode {
  id: string;
  parentId: string | null; // null = Wurzelknoten ("Tennismehl")
  type: MindmapNodeType;
  titel: string;
  // Eingeklappt = alle Nachfahren ausgeblendet
  collapsed: boolean;
  // Position unter den Geschwistern (0-basiert, per Drag umsortierbar)
  sortOrder?: number;
  // Nur für type === 'task':
  beschreibung?: string;
  faelligAm?: string; // ISO-Datum (yyyy-MM-dd), leer = kein Datum
  zustaendig?: string;
  erledigt?: boolean;
}

export interface MindmapViewport {
  x: number;
  y: number;
  scale: number;
}
