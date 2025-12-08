export interface WikiPage {
  $id?: string;
  $createdAt?: string;
  $updatedAt?: string;
  
  // Seitentitel
  title: string;
  
  // URL-freundlicher Slug
  slug: string;
  
  // HTML Inhalt der Seite
  content: string;
  
  // Optionale Beschreibung für die Vorschau
  description?: string;
  
  // Optionales Icon (emoji oder Lucide icon name)
  icon?: string;
  
  // Sortierreihenfolge
  sortOrder: number;
  
  // Ob die Seite veröffentlicht ist
  isPublished: boolean;
  
  // Parent-Seite für hierarchische Struktur (optional)
  parentId?: string;
  
  // Autor
  createdBy?: string;
  lastEditedBy?: string;
}

export interface WikiFile {
  $id?: string;
  $createdAt?: string;
  
  // Referenz zur Wiki-Seite
  pageId: string;
  
  // Dateiname
  fileName: string;
  
  // Appwrite Storage File ID
  fileId: string;
  
  // MIME-Type
  mimeType: string;
  
  // Dateigröße in Bytes
  size: number;
}

// Für das Erstellen einer neuen Seite
export type CreateWikiPage = Omit<WikiPage, '$id' | '$createdAt' | '$updatedAt'>;

// Für das Aktualisieren einer Seite
export type UpdateWikiPage = Partial<CreateWikiPage>;



