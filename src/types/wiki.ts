// ============ WIKI TYPEN - Enterprise-Level ============

// Kategorien für Wiki-Seiten
export type WikiCategory =
  | 'prozess'           // Unternehmensprozesse
  | 'anleitung'         // How-To Anleitungen
  | 'richtlinie'        // Richtlinien & Policies
  | 'vorlage'           // Vorlagen & Templates
  | 'dokumentation'     // Technische Dokumentation
  | 'sonstiges';        // Sonstiges

export const WIKI_CATEGORIES: Record<WikiCategory, { label: string; icon: string; color: string }> = {
  prozess: { label: 'Prozess', icon: '🔄', color: 'blue' },
  anleitung: { label: 'Anleitung', icon: '📋', color: 'green' },
  richtlinie: { label: 'Richtlinie', icon: '📜', color: 'purple' },
  vorlage: { label: 'Vorlage', icon: '📝', color: 'orange' },
  dokumentation: { label: 'Dokumentation', icon: '📚', color: 'cyan' },
  sonstiges: { label: 'Sonstiges', icon: '📄', color: 'gray' },
};

// Wiki-Seite
export interface WikiPage {
  $id?: string;
  $createdAt?: string;
  $updatedAt?: string;

  // Basis-Informationen
  title: string;
  slug: string;
  content: string; // HTML oder Markdown

  // Metadaten
  description?: string;
  icon?: string;
  category?: WikiCategory;
  tags?: string[]; // Tags als JSON-String in DB gespeichert

  // Hierarchie
  parentId?: string;
  sortOrder: number;

  // Status
  isPublished: boolean;
  isPinned?: boolean; // Angepinnt oben

  // Tracking
  createdBy?: string;
  lastEditedBy?: string;
  viewCount?: number;

  // Für UI: berechnete Felder
  children?: WikiPage[];
  depth?: number;
}

// Wiki-Datei (Anhänge & Bilder)
export interface WikiFile {
  $id?: string;
  $createdAt?: string;

  pageId: string;
  fileName: string;
  fileId: string;
  mimeType: string;
  size: number;

  // Für Bilder: Vorschau-Größe
  width?: number;
  height?: number;

  // Upload-Info
  uploadedBy?: string;
  uploadTime?: string;
}

// Datei-Typ-Kategorien für Icons
export type FileTypeCategory =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'code'
  | 'text'
  | 'other';

// Datei-Typ-Mapping
export const FILE_TYPE_CONFIG: Record<FileTypeCategory, {
  label: string;
  color: string;
  bgColor: string;
  extensions: string[];
}> = {
  pdf: {
    label: 'PDF',
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    extensions: ['.pdf']
  },
  word: {
    label: 'Word',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    extensions: ['.doc', '.docx', '.odt', '.rtf']
  },
  excel: {
    label: 'Excel',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    extensions: ['.xls', '.xlsx', '.csv', '.ods']
  },
  powerpoint: {
    label: 'PowerPoint',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    extensions: ['.ppt', '.pptx', '.odp']
  },
  image: {
    label: 'Bild',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico']
  },
  video: {
    label: 'Video',
    color: 'text-pink-600',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',
    extensions: ['.mp4', '.mov', '.avi', '.mkv', '.webm']
  },
  audio: {
    label: 'Audio',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.flac']
  },
  archive: {
    label: 'Archiv',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz']
  },
  code: {
    label: 'Code',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.html', '.css', '.json']
  },
  text: {
    label: 'Text',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    extensions: ['.txt', '.md', '.log']
  },
  other: {
    label: 'Datei',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    extensions: []
  },
};

// Helper-Funktion um Dateityp zu ermitteln
export const getFileTypeCategory = (fileName: string): FileTypeCategory => {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  for (const [category, config] of Object.entries(FILE_TYPE_CONFIG)) {
    if (config.extensions.includes(ext)) {
      return category as FileTypeCategory;
    }
  }
  return 'other';
};

// Seitenversion für Historie
export interface WikiPageVersion {
  $id?: string;
  $createdAt?: string;

  pageId: string;
  version: number;
  title: string;
  content: string;
  editedBy?: string;
  changeNote?: string;
}

// Favoriten
export interface WikiFavorite {
  $id?: string;
  userId: string;
  pageId: string;
  $createdAt?: string;
}

// Zuletzt besucht
export interface WikiRecentView {
  pageId: string;
  viewedAt: string;
  title: string;
  icon?: string;
}

// Such-Ergebnis
export interface WikiSearchResult {
  page: WikiPage;
  matchType: 'title' | 'content' | 'tag' | 'description' | 'file';
  snippet?: string;
  score: number;
  file?: WikiFile; // gesetzt bei Datei-Treffern
}

// Inhaltsverzeichnis-Eintrag
export interface WikiTocItem {
  id: string;
  text: string;
  level: number; // h1=1, h2=2, h3=3
}

// Vorlagen
export interface WikiTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: WikiCategory;
  content: string;
}

// Standard-Vorlagen für Prozesse
export const WIKI_TEMPLATES: WikiTemplate[] = [
  {
    id: 'prozess-standard',
    name: 'Standardprozess',
    description: 'Vorlage für Unternehmensprozesse',
    icon: '🔄',
    category: 'prozess',
    content: `<h2>Prozessübersicht</h2>
<p>Kurze Beschreibung des Prozesses.</p>

<h2>Verantwortlichkeiten</h2>
<table>
<thead><tr><th>Rolle</th><th>Aufgabe</th></tr></thead>
<tbody>
<tr><td>Prozessverantwortlicher</td><td>-</td></tr>
<tr><td>Durchführender</td><td>-</td></tr>
</tbody>
</table>

<h2>Ablauf</h2>
<ol>
<li>Schritt 1</li>
<li>Schritt 2</li>
<li>Schritt 3</li>
</ol>

<h2>Dokumente & Vorlagen</h2>
<ul>
<li>Dokument 1</li>
</ul>

<h2>Hinweise</h2>
<p>Wichtige Hinweise zum Prozess.</p>`,
  },
  {
    id: 'anleitung-standard',
    name: 'Schritt-für-Schritt Anleitung',
    description: 'Vorlage für Anleitungen',
    icon: '📋',
    category: 'anleitung',
    content: `<h2>Ziel</h2>
<p>Was soll erreicht werden?</p>

<h2>Voraussetzungen</h2>
<ul>
<li>Voraussetzung 1</li>
<li>Voraussetzung 2</li>
</ul>

<h2>Schritt-für-Schritt</h2>
<h3>Schritt 1: Titel</h3>
<p>Beschreibung...</p>

<h3>Schritt 2: Titel</h3>
<p>Beschreibung...</p>

<h2>Troubleshooting</h2>
<p>Häufige Probleme und Lösungen.</p>`,
  },
  {
    id: 'checkliste',
    name: 'Checkliste',
    description: 'Vorlage für Checklisten',
    icon: '✅',
    category: 'vorlage',
    content: `<h2>Checkliste: [Titel]</h2>

<h3>Vorbereitung</h3>
<ul>
<li>[ ] Punkt 1</li>
<li>[ ] Punkt 2</li>
<li>[ ] Punkt 3</li>
</ul>

<h3>Durchführung</h3>
<ul>
<li>[ ] Punkt 1</li>
<li>[ ] Punkt 2</li>
</ul>

<h3>Nachbereitung</h3>
<ul>
<li>[ ] Punkt 1</li>
</ul>`,
  },
  {
    id: 'meeting-protokoll',
    name: 'Meeting-Protokoll',
    description: 'Vorlage für Besprechungsprotokolle',
    icon: '📝',
    category: 'vorlage',
    content: `<h2>Meeting-Protokoll</h2>

<p><strong>Datum:</strong> [Datum]<br>
<strong>Teilnehmer:</strong> [Namen]<br>
<strong>Protokoll:</strong> [Name]</p>

<h2>Agenda</h2>
<ol>
<li>Punkt 1</li>
<li>Punkt 2</li>
</ol>

<h2>Besprochene Punkte</h2>
<h3>1. [Thema]</h3>
<p>Zusammenfassung...</p>

<h2>Beschlüsse</h2>
<ul>
<li>Beschluss 1</li>
</ul>

<h2>Aufgaben</h2>
<table>
<thead><tr><th>Aufgabe</th><th>Verantwortlich</th><th>Deadline</th></tr></thead>
<tbody>
<tr><td>Aufgabe 1</td><td>Name</td><td>Datum</td></tr>
</tbody>
</table>

<h2>Nächstes Meeting</h2>
<p>[Datum und Uhrzeit]</p>`,
  },
];

// Für das Erstellen einer neuen Seite
export type CreateWikiPage = Omit<WikiPage, '$id' | '$createdAt' | '$updatedAt' | 'children' | 'depth'>;

// Für das Aktualisieren einer Seite
export type UpdateWikiPage = Partial<CreateWikiPage>;

// Emojis für Icons
export const WIKI_ICONS = [
  '📄', '📋', '📝', '📚', '📖', '📜', '📑', '🗂️',
  '🔄', '⚙️', '🛠️', '🔧', '💡', '🎯', '✅', '❗',
  '📊', '📈', '💰', '🏢', '👥', '📞', '📧', '🚚',
  '🏗️', '🔒', '🔑', '📅', '⏰', '🎉', '⭐', '🔥',
];
