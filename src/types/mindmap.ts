// Typen für das Planungstool (Organigramm- und Prozess-Boards)

export type MindmapBoardTyp = 'organigramm' | 'prozess';

export interface MindmapBoard {
  id: string;
  name: string;
  typ: MindmapBoardTyp;
}

// 'knoten' = Gliederung/Schritt, 'entscheidung' = Verzweigung im Prozess
export type MindmapNodeType = 'knoten' | 'task' | 'entscheidung';

export interface MindmapNode {
  id: string;
  boardId: string;
  parentId: string | null; // null = Wurzelknoten des Boards
  type: MindmapNodeType;
  titel: string;
  // Beschriftung der Kante vom Eltern-Knoten (z. B. "Ja"/"Nein" nach Entscheidungen)
  edgeLabel?: string;
  // Eingeklappt = alle Nachfahren ausgeblendet
  collapsed: boolean;
  // Position unter den Geschwistern (0-basiert, per Drag umsortierbar)
  sortOrder?: number;
  // Nur für type === 'task':
  beschreibung?: string;
  faelligAm?: string; // ISO-Datum (yyyy-MM-dd), leer = kein Datum
  reviewAm?: string; // Review-/Wiedervorlage-Datum (yyyy-MM-dd)
  zustaendig?: string;
  erledigt?: boolean;
  geschaetztMinuten?: number; // geschätzter Aufwand für die Zeitmessung
  bilderIds?: string[]; // Datei-IDs im Bucket mindmap-bilder
}

export interface MindmapSubtask {
  id: string;
  taskId: string;
  titel: string;
  erledigt: boolean;
  sortOrder: number;
}

export interface MindmapZeiteintrag {
  id: string;
  taskId: string;
  person: string;
  beschreibung: string;
  datum: string; // ISO-Datum (yyyy-MM-dd)
  minuten: number;
}

export interface MindmapViewport {
  x: number;
  y: number;
  scale: number;
}
