import { ID, Query } from 'appwrite';
import { databases, storage, DATABASE_ID, WIKI_PAGES_COLLECTION_ID, WIKI_FILES_COLLECTION_ID, WIKI_DATEIEN_BUCKET_ID } from '../config/appwrite';
import { WikiPage, WikiFile, CreateWikiPage, UpdateWikiPage } from '../types/wiki';

// Helper um Slug aus Titel zu erstellen
const createSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

// ============ Wiki Pages ============

export const wikiPageService = {
  // Alle Seiten laden
  async getAll(): Promise<WikiPage[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        WIKI_PAGES_COLLECTION_ID,
        [Query.orderAsc('sortOrder'), Query.limit(100)]
      );
      return response.documents as unknown as WikiPage[];
    } catch (error) {
      console.error('Fehler beim Laden der Wiki-Seiten:', error);
      return [];
    }
  },

  // Eine Seite nach ID laden
  async getById(id: string): Promise<WikiPage | null> {
    try {
      const response = await databases.getDocument(
        DATABASE_ID,
        WIKI_PAGES_COLLECTION_ID,
        id
      );
      return response as unknown as WikiPage;
    } catch (error) {
      console.error('Fehler beim Laden der Wiki-Seite:', error);
      return null;
    }
  },

  // Seite nach Slug laden
  async getBySlug(slug: string): Promise<WikiPage | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        WIKI_PAGES_COLLECTION_ID,
        [Query.equal('slug', slug), Query.limit(1)]
      );
      if (response.documents.length > 0) {
        return response.documents[0] as unknown as WikiPage;
      }
      return null;
    } catch (error) {
      console.error('Fehler beim Laden der Wiki-Seite nach Slug:', error);
      return null;
    }
  },

  // Neue Seite erstellen
  async create(page: CreateWikiPage): Promise<WikiPage | null> {
    try {
      // Generiere Slug wenn nicht vorhanden
      const slug = page.slug || createSlug(page.title);
      
      // Finde die höchste sortOrder
      const allPages = await this.getAll();
      const maxSortOrder = allPages.reduce((max, p) => Math.max(max, p.sortOrder || 0), 0);
      
      const response = await databases.createDocument(
        DATABASE_ID,
        WIKI_PAGES_COLLECTION_ID,
        ID.unique(),
        {
          ...page,
          slug,
          sortOrder: page.sortOrder ?? maxSortOrder + 1,
          isPublished: page.isPublished ?? true,
        }
      );
      return response as unknown as WikiPage;
    } catch (error) {
      console.error('Fehler beim Erstellen der Wiki-Seite:', error);
      throw error;
    }
  },

  // Seite aktualisieren
  async update(id: string, updates: UpdateWikiPage): Promise<WikiPage | null> {
    try {
      // Wenn Titel geändert wird, auch Slug aktualisieren
      if (updates.title && !updates.slug) {
        updates.slug = createSlug(updates.title);
      }
      
      const response = await databases.updateDocument(
        DATABASE_ID,
        WIKI_PAGES_COLLECTION_ID,
        id,
        updates
      );
      return response as unknown as WikiPage;
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Wiki-Seite:', error);
      throw error;
    }
  },

  // Seite löschen
  async delete(id: string): Promise<boolean> {
    try {
      // Erst alle zugehörigen Dateien löschen
      await wikiFileService.deleteAllForPage(id);
      
      await databases.deleteDocument(
        DATABASE_ID,
        WIKI_PAGES_COLLECTION_ID,
        id
      );
      return true;
    } catch (error) {
      console.error('Fehler beim Löschen der Wiki-Seite:', error);
      return false;
    }
  },

  // Sortierung aktualisieren
  async updateSortOrder(pages: { id: string; sortOrder: number }[]): Promise<void> {
    try {
      await Promise.all(
        pages.map(({ id, sortOrder }) =>
          databases.updateDocument(
            DATABASE_ID,
            WIKI_PAGES_COLLECTION_ID,
            id,
            { sortOrder }
          )
        )
      );
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Sortierung:', error);
      throw error;
    }
  },
};

// ============ Wiki Files ============

export const wikiFileService = {
  // Alle Dateien für eine Seite laden
  async getForPage(pageId: string): Promise<WikiFile[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        WIKI_FILES_COLLECTION_ID,
        [Query.equal('pageId', [pageId]), Query.limit(50)]
      );
      return response.documents as unknown as WikiFile[];
    } catch (error) {
      console.error('Fehler beim Laden der Wiki-Dateien:', error);
      return [];
    }
  },

  // Datei hochladen
  async upload(pageId: string, file: File): Promise<WikiFile | null> {
    try {
      // Datei in Storage hochladen
      const uploadedFile = await storage.createFile(
        WIKI_DATEIEN_BUCKET_ID,
        ID.unique(),
        file
      );

      // Datei-Referenz in der Collection speichern
      const response = await databases.createDocument(
        DATABASE_ID,
        WIKI_FILES_COLLECTION_ID,
        ID.unique(),
        {
          pageId,
          fileName: file.name,
          fileId: uploadedFile.$id,
          mimeType: file.type,
          size: file.size,
        }
      );
      return response as unknown as WikiFile;
    } catch (error) {
      console.error('Fehler beim Hochladen der Datei:', error);
      throw error;
    }
  },

  // Datei-URL abrufen
  getFileUrl(fileId: string): string {
    return storage.getFileView(WIKI_DATEIEN_BUCKET_ID, fileId).toString();
  },

  // Datei herunterladen
  getDownloadUrl(fileId: string): string {
    return storage.getFileDownload(WIKI_DATEIEN_BUCKET_ID, fileId).toString();
  },

  // Datei löschen
  async delete(wikiFile: WikiFile): Promise<boolean> {
    try {
      // Aus Storage löschen
      await storage.deleteFile(WIKI_DATEIEN_BUCKET_ID, wikiFile.fileId);
      
      // Aus Collection löschen
      if (wikiFile.$id) {
        await databases.deleteDocument(
          DATABASE_ID,
          WIKI_FILES_COLLECTION_ID,
          wikiFile.$id
        );
      }
      return true;
    } catch (error) {
      console.error('Fehler beim Löschen der Datei:', error);
      return false;
    }
  },

  // Alle Dateien einer Seite löschen
  async deleteAllForPage(pageId: string): Promise<void> {
    try {
      const files = await this.getForPage(pageId);
      await Promise.all(files.map(file => this.delete(file)));
    } catch (error) {
      console.error('Fehler beim Löschen aller Dateien:', error);
    }
  },
};





