// Typen für das Planungstool (Organigramm- und Prozess-Boards)

export type MindmapBoardTyp = 'organigramm' | 'prozess';

export interface MindmapBoard {
  id: string;
  name: string;
  typ: MindmapBoardTyp;
  // Übersichtsseite: Beschreibung + Bilder (wie bei Tasks)
  beschreibung?: string;
  bilderIds?: string[]; // Datei-IDs im Bucket mindmap-bilder
  // Wartungsplanung (nur Prozess-Boards): Fälligkeit nach Betriebsstunden
  zustaendig?: string;
  geraetId?: string; // verknüpftes Gerät (mindmap_geraete)
  intervallStunden?: number; // z. B. alle 250 Betriebsstunden
  faelligBeiStunden?: number; // fällig, sobald das Gerät diesen Stand erreicht
}

/** Gerät mit Betriebsstunden-Zähler (z. B. Radlader) */
export interface MindmapGeraet {
  id: string;
  name: string;
  betriebsstunden: number;
  aktualisiertAm: string; // ISO-Datum der letzten Stunden-Aktualisierung
}

/** Dokumentierte Durchführung eines Prozesses */
export interface MindmapDurchfuehrung {
  id: string;
  boardId: string;
  geraetId: string;
  datum: string;
  person: string;
  notizen: string;
  minuten: number; // Zeitaufwand
  stundenBeiDurchfuehrung: number; // Betriebsstunden-Stand bei Durchführung
  bilderIds: string[];
}

// 'knoten' = Gliederung/Schritt, 'entscheidung' = Verzweigung,
// 'prozess' = Verweis auf ein anderes Prozess-Board (linkedBoardId),
// 'notiz' = Notiz-Blase (frei auf der Fläche oder seitlich an einem Knoten)
export type MindmapNodeType = 'knoten' | 'task' | 'entscheidung' | 'prozess' | 'notiz';

export interface MindmapNode {
  id: string;
  boardId: string;
  parentId: string | null; // null = Wurzelknoten des Boards
  type: MindmapNodeType;
  titel: string;
  // Beschriftung der Kante vom Eltern-Knoten (z. B. "Ja"/"Nein" nach Entscheidungen)
  edgeLabel?: string;
  // Nur für type === 'prozess': das eingebundene Prozess-Board
  linkedBoardId?: string;
  // Eingeklappt = alle Nachfahren ausgeblendet
  collapsed: boolean;
  // Position unter den Geschwistern (0-basiert, per Drag umsortierbar)
  sortOrder?: number;
  // Freie Verbindungen zu anderen Knoten (z. B. Rücksprung im Prozess-Diagramm)
  verbindungen?: string[];
  // Zusätzlicher vertikaler Abstand zum Eltern-Knoten (per Drag nach unten)
  abstandOben?: number;
  // Nur für type === 'notiz': Position (angehängt = Offset zum Anker-Knoten,
  // standalone = absolute Canvas-Koordinaten). 0/0 = automatische Platzierung.
  posX?: number;
  posY?: number;
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
