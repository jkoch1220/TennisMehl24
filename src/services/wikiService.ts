import { ID, Query } from 'appwrite';
import { databases, storage, account, DATABASE_ID, WIKI_PAGES_COLLECTION_ID, WIKI_FILES_COLLECTION_ID, WIKI_DATEIEN_BUCKET_ID } from '../config/appwrite';
import { WikiPage, WikiFile, CreateWikiPage, UpdateWikiPage, WikiSearchResult, WikiRecentView, WikiTocItem, WikiCategory } from '../types/wiki';
import { loadAllDocuments } from '../utils/appwritePagination';

// Helper um aktuelle User-ID zu bekommen
const getCurrentUserId = async (): Promise<string> => {
  try {
    const user = await account.get();
    return user.$id;
  } catch {
    return 'anonymous';
  }
};

// ============ HELPER FUNKTIONEN ============

// Slug aus Titel erstellen
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

// HTML zu Text für Suche
const htmlToText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

// Text normalisieren: lowercase + Umlaut-/Akzent-Faltung für tolerante Suche
export const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // diakritische Zeichen entfernen

// Prüft, ob "query" als Subsequenz in "text" vorkommt (einfache Fuzzy-Toleranz für Tippfehler/Lücken)
const isSubsequence = (query: string, text: string): boolean => {
  let i = 0;
  for (let j = 0; j < text.length && i < query.length; j++) {
    if (text[j] === query[i]) i++;
  }
  return i === query.length;
};

// Inhaltsverzeichnis aus HTML extrahieren
export const extractToc = (html: string): WikiTocItem[] => {
  const div = document.createElement('div');
  div.innerHTML = html;
  const headings = div.querySelectorAll('h1, h2, h3, h4');
  const toc: WikiTocItem[] = [];

  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName.charAt(1));
    const text = heading.textContent || '';
    const id = `heading-${index}`;
    toc.push({ id, text, level });
  });

  return toc;
};

// IDs in Überschriften injizieren, damit TOC-Sprungmarken & Scroll-Spy funktionieren.
// Gleiche Reihenfolge/Indexierung wie extractToc → ids passen 1:1 zum Inhaltsverzeichnis.
export const injectHeadingIds = (html: string): string => {
  if (!html) return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  const headings = div.querySelectorAll('h1, h2, h3, h4');
  headings.forEach((heading, index) => {
    heading.id = `heading-${index}`;
    heading.setAttribute('data-toc-id', `heading-${index}`);
  });
  return div.innerHTML;
};

// Seiten in Baumstruktur konvertieren (zyklensicher gegen korrupte parentId-Daten)
export const buildPageTree = (pages: WikiPage[]): WikiPage[] => {
  const pageMap = new Map<string, WikiPage>();
  const roots: WikiPage[] = [];

  // Erst alle Seiten in Map einfügen
  pages.forEach(page => {
    pageMap.set(page.$id!, { ...page, children: [], depth: 0 });
  });

  // Würde das Anhängen an parentId einen Zyklus erzeugen?
  // (Schützt vor Endlosrekursion, falls eine Seite – mittelbar – ihr eigener Vorfahre ist.)
  const createsCycle = (pageId: string, parentId: string): boolean => {
    let current: string | undefined = parentId;
    const seen = new Set<string>();
    while (current) {
      if (current === pageId) return true;
      if (seen.has(current)) return true;
      seen.add(current);
      current = pageMap.get(current)?.parentId;
    }
    return false;
  };

  // Dann Hierarchie aufbauen
  pages.forEach(page => {
    const currentPage = pageMap.get(page.$id!)!;
    const parentId = page.parentId;
    const validParent =
      !!parentId &&
      parentId !== page.$id &&
      pageMap.has(parentId) &&
      !createsCycle(page.$id!, parentId);

    if (validParent) {
      const parent = pageMap.get(parentId!)!;
      currentPage.depth = (parent.depth || 0) + 1;
      parent.children = parent.children || [];
      parent.children.push(currentPage);
    } else {
      // Waise oder aufgebrochener Zyklus → als Root anzeigen (kein Datenverlust, kein Freeze)
      if (parentId && parentId !== page.$id && pageMap.has(parentId)) {
        console.warn(`Wiki: Zyklische Eltern-Beziehung für Seite "${page.title}" aufgebrochen.`);
      }
      roots.push(currentPage);
    }
  });

  // Nach sortOrder sortieren
  const sortPages = (pages: WikiPage[]): WikiPage[] => {
    return pages
      .sort((a, b) => {
        // Angepinnte zuerst
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      })
      .map(page => ({
        ...page,
        children: page.children ? sortPages(page.children) : [],
      }));
  };

  return sortPages(roots);
};

// Breadcrumbs für eine Seite erstellen
export const buildBreadcrumbs = (pageId: string, pages: WikiPage[]): WikiPage[] => {
  const breadcrumbs: WikiPage[] = [];
  const pageMap = new Map(pages.map(p => [p.$id!, p]));

  let current = pageMap.get(pageId);
  while (current) {
    breadcrumbs.unshift(current);
    current = current.parentId ? pageMap.get(current.parentId) : undefined;
  }

  return breadcrumbs;
};

// ============ CLIENT-SEITIGE SUCHE (für Cmd+K Befehlspalette) ============

export interface WikiSearchOptions {
  category?: WikiCategory | 'all';
  tag?: string | null;
  onlyFavorites?: boolean;
  favoriteIds?: string[];
}

// Snippet rund um den ersten Treffer erzeugen (Plain-Text, Highlight passiert in der UI)
const buildSnippet = (plainText: string, normQuery: string): string => {
  const normText = normalizeText(plainText);
  const idx = normText.indexOf(normQuery);
  if (idx === -1) {
    return plainText.slice(0, 120).trim() + (plainText.length > 120 ? '…' : '');
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(plainText.length, idx + normQuery.length + 80);
  return (
    (start > 0 ? '…' : '') +
    plainText.slice(start, end).trim() +
    (end < plainText.length ? '…' : '')
  );
};

/**
 * Tolerante, client-seitige Volltextsuche über bereits geladene Seiten.
 * Mehrere Suchbegriffe werden UND-verknüpft; Umlaute werden gefaltet,
 * Subsequenz-Treffer geben eine geringe Fuzzy-Toleranz.
 */
export const searchPagesLocal = (
  pages: WikiPage[],
  query: string,
  options: WikiSearchOptions = {}
): WikiSearchResult[] => {
  const trimmed = query.trim();
  const tokens = normalizeText(trimmed).split(/\s+/).filter(Boolean);
  const favSet = new Set(options.favoriteIds || []);

  const results: WikiSearchResult[] = [];

  for (const page of pages) {
    // Filter: Kategorie / Tag / Favoriten
    if (options.category && options.category !== 'all' && page.category !== options.category) continue;
    if (options.tag && !(page.tags || []).includes(options.tag)) continue;
    if (options.onlyFavorites && !favSet.has(page.$id!)) continue;

    // Ohne Suchbegriff: alle (gefilterten) Seiten zurückgeben, nach Titel sortiert
    if (tokens.length === 0) {
      results.push({ page, matchType: 'title', score: 0, snippet: page.description });
      continue;
    }

    const normTitle = normalizeText(page.title);
    const normDesc = normalizeText(page.description || '');
    const normTags = (page.tags || []).map(normalizeText);
    const plainContent = htmlToText(page.content || '');
    const normContent = normalizeText(plainContent);

    let score = 0;
    let matchType: WikiSearchResult['matchType'] = 'content';
    let allTokensMatch = true;

    for (const token of tokens) {
      let tokenScore = 0;
      if (normTitle.includes(token)) {
        tokenScore = normTitle.startsWith(token) ? 130 : 100;
        matchType = 'title';
      } else if (normTags.some((t) => t.includes(token))) {
        tokenScore = 60;
        if (matchType !== 'title') matchType = 'tag';
      } else if (normDesc.includes(token)) {
        tokenScore = 40;
        if (matchType !== 'title' && matchType !== 'tag') matchType = 'description';
      } else if (normContent.includes(token)) {
        tokenScore = 25;
      } else if (token.length >= 4 && isSubsequence(token, normTitle)) {
        tokenScore = 15; // Fuzzy-Titel-Treffer
        if (matchType === 'content') matchType = 'title';
      } else {
        allTokensMatch = false;
        break;
      }
      score += tokenScore;
    }

    if (!allTokensMatch || score === 0) continue;

    // Bonus: Favorit
    if (favSet.has(page.$id!)) score += 10;

    const snippet =
      matchType === 'description'
        ? page.description
        : buildSnippet(plainContent, tokens[0]);

    results.push({ page, matchType, snippet, score });
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.page.title.localeCompare(b.page.title, 'de');
  });
};

/**
 * Sucht in Dateinamen (über alle bereits geladenen Dateien).
 * Liefert je Treffer die Datei + zugehörige Seite zum Navigieren.
 */
export const searchFilesLocal = (
  files: WikiFile[],
  pages: WikiPage[],
  query: string
): WikiSearchResult[] => {
  const tokens = normalizeText(query.trim()).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const pageMap = new Map(pages.map((p) => [p.$id!, p]));
  const results: WikiSearchResult[] = [];

  for (const file of files) {
    const normName = normalizeText(file.fileName);
    if (!tokens.every((t) => normName.includes(t))) continue;

    const page = pageMap.get(file.pageId);
    if (!page) continue; // verwaiste Datei ohne Seite überspringen

    results.push({
      page,
      file,
      matchType: 'file',
      snippet: file.fileName,
      score: 50,
    });
  }

  return results;
};

// ============ LOCAL STORAGE HELPERS ============

const RECENT_VIEWS_KEY = 'wiki_recent_views';
const FAVORITES_KEY = 'wiki_favorites';
const MAX_RECENT_VIEWS = 10;

export const getRecentViews = (): WikiRecentView[] => {
  try {
    const stored = localStorage.getItem(RECENT_VIEWS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const addRecentView = (page: WikiPage): void => {
  const views = getRecentViews().filter(v => v.pageId !== page.$id);
  views.unshift({
    pageId: page.$id!,
    viewedAt: new Date().toISOString(),
    title: page.title,
    icon: page.icon,
  });
  localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(views.slice(0, MAX_RECENT_VIEWS)));
};

export const getFavorites = (): string[] => {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const toggleFavorite = (pageId: string): boolean => {
  const favorites = getFavorites();
  const index = favorites.indexOf(pageId);
  if (index > -1) {
    favorites.splice(index, 1);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return false;
  } else {
    favorites.push(pageId);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return true;
  }
};

export const isFavorite = (pageId: string): boolean => {
  return getFavorites().includes(pageId);
};

// ============ Wiki Pages Service ============

export const wikiPageService = {
  // Alle Seiten laden
  async getAll(): Promise<WikiPage[]> {
    try {
      const documents = await loadAllDocuments(DATABASE_ID, WIKI_PAGES_COLLECTION_ID, {
        queries: [Query.orderAsc('sortOrder')],
      });
      return documents.map(doc => ({
        ...doc,
        tags: doc.tags ? (typeof doc.tags === 'string' ? JSON.parse(doc.tags) : doc.tags) : [],
      })) as unknown as WikiPage[];
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
      return {
        ...response,
        tags: response.tags ? (typeof response.tags === 'string' ? JSON.parse(response.tags) : response.tags) : [],
      } as unknown as WikiPage;
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
        const doc = response.documents[0];
        return {
          ...doc,
          tags: doc.tags ? (typeof doc.tags === 'string' ? JSON.parse(doc.tags) : doc.tags) : [],
        } as unknown as WikiPage;
      }
      return null;
    } catch (error) {
      console.error('Fehler beim Laden der Wiki-Seite nach Slug:', error);
      return null;
    }
  },

  // Volltextsuche
  async search(query: string): Promise<WikiSearchResult[]> {
    if (!query.trim()) return [];

    const pages = await this.getAll();
    const queryLower = query.toLowerCase();
    const results: WikiSearchResult[] = [];

    pages.forEach(page => {
      let score = 0;
      let matchType: 'title' | 'content' | 'tag' = 'content';
      let snippet = '';

      // Titel-Match (höchste Priorität)
      if (page.title.toLowerCase().includes(queryLower)) {
        score += 100;
        matchType = 'title';
      }

      // Tag-Match
      if (page.tags?.some(tag => tag.toLowerCase().includes(queryLower))) {
        score += 50;
        if (matchType !== 'title') matchType = 'tag';
      }

      // Content-Match
      const plainText = htmlToText(page.content);
      const contentLower = plainText.toLowerCase();
      const matchIndex = contentLower.indexOf(queryLower);
      if (matchIndex > -1) {
        score += 25;
        // Snippet erstellen
        const start = Math.max(0, matchIndex - 50);
        const end = Math.min(plainText.length, matchIndex + query.length + 50);
        snippet = (start > 0 ? '...' : '') + plainText.slice(start, end) + (end < plainText.length ? '...' : '');
      }

      // Beschreibung-Match
      if (page.description?.toLowerCase().includes(queryLower)) {
        score += 30;
        if (!snippet) snippet = page.description;
      }

      if (score > 0) {
        results.push({ page, matchType, snippet, score });
      }
    });

    return results.sort((a, b) => b.score - a.score);
  },

  // Neue Seite erstellen
  async create(page: CreateWikiPage): Promise<WikiPage | null> {
    try {
      const slug = page.slug || createSlug(page.title);
      const allPages = await this.getAll();
      const maxSortOrder = allPages.reduce((max, p) => Math.max(max, p.sortOrder || 0), 0);

      const data: Record<string, unknown> = {
        title: page.title,
        slug,
        content: page.content || '',
        description: page.description || '',
        icon: page.icon || '📄',
        category: page.category || 'sonstiges',
        tags: JSON.stringify(page.tags || []),
        parentId: page.parentId || null,
        sortOrder: page.sortOrder ?? maxSortOrder + 1,
        isPublished: page.isPublished ?? true,
        isPinned: page.isPinned || false,
        viewCount: 0,
      };

      const response = await databases.createDocument(
        DATABASE_ID,
        WIKI_PAGES_COLLECTION_ID,
        ID.unique(),
        data
      );

      return {
        ...response,
        tags: page.tags || [],
      } as unknown as WikiPage;
    } catch (error) {
      console.error('Fehler beim Erstellen der Wiki-Seite:', error);
      throw error;
    }
  },

  // Seite aktualisieren
  async update(id: string, updates: UpdateWikiPage): Promise<WikiPage | null> {
    try {
      const data: Record<string, unknown> = { ...updates };

      // Slug aktualisieren wenn Titel geändert
      if (updates.title && !updates.slug) {
        data.slug = createSlug(updates.title);
      }

      // Tags als JSON-String
      if (updates.tags) {
        data.tags = JSON.stringify(updates.tags);
      }

      const response = await databases.updateDocument(
        DATABASE_ID,
        WIKI_PAGES_COLLECTION_ID,
        id,
        data
      );

      return {
        ...response,
        tags: updates.tags || (response.tags ? JSON.parse(response.tags as string) : []),
      } as unknown as WikiPage;
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Wiki-Seite:', error);
      throw error;
    }
  },

  // View Count erhöhen (silent fail wenn Feld nicht existiert)
  async incrementViewCount(id: string): Promise<void> {
    try {
      const page = await this.getById(id);
      if (page && typeof page.viewCount === 'number') {
        await databases.updateDocument(
          DATABASE_ID,
          WIKI_PAGES_COLLECTION_ID,
          id,
          { viewCount: page.viewCount + 1 }
        );
      }
    } catch {
      // Silent fail - viewCount ist optional
    }
  },

  // Seite löschen
  async delete(id: string): Promise<boolean> {
    try {
      // Erst alle zugehörigen Dateien löschen
      await wikiFileService.deleteAllForPage(id);

      // Dann die Seite löschen
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

  // Seite im Baum verschieben: neuen Parent setzen + Geschwister neu sortieren.
  // orderedSiblingIds = vollständige, neu geordnete Kinderliste unter newParentId
  // (inkl. der verschobenen Seite).
  async movePage(
    activeId: string,
    newParentId: string | null,
    orderedSiblingIds: string[]
  ): Promise<void> {
    const updates = orderedSiblingIds.map((id, index) => {
      const data: Record<string, unknown> = { sortOrder: index };
      if (id === activeId) data.parentId = newParentId || null;
      return databases.updateDocument(DATABASE_ID, WIKI_PAGES_COLLECTION_ID, id, data);
    });

    // Falls die verschobene Seite (theoretisch) nicht in der Liste steht, Parent separat setzen
    if (!orderedSiblingIds.includes(activeId)) {
      updates.push(
        databases.updateDocument(DATABASE_ID, WIKI_PAGES_COLLECTION_ID, activeId, {
          parentId: newParentId || null,
        })
      );
    }

    await Promise.all(updates);
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

// ============ Wiki Files Service ============

export const wikiFileService = {
  // Alle Dateien für eine Seite laden (nach sortOrder, dann Upload-Zeit)
  async getForPage(pageId: string): Promise<WikiFile[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        WIKI_FILES_COLLECTION_ID,
        [Query.equal('pageId', pageId), Query.limit(100)]
      );
      const files = response.documents as unknown as WikiFile[];
      // Client-seitig sortieren – robust, auch falls das sortOrder-Attribut (noch) fehlt
      return files.sort((a, b) => {
        const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return (a.uploadTime || '').localeCompare(b.uploadTime || '');
      });
    } catch (error) {
      console.error('Fehler beim Laden der Wiki-Dateien:', error);
      return [];
    }
  },

  // Sortierreihenfolge der Dateien speichern (still fehlertolerant, falls Attribut fehlt)
  async updateFilesSortOrder(files: { id: string; sortOrder: number }[]): Promise<void> {
    try {
      await Promise.all(
        files.map(({ id, sortOrder }) =>
          databases.updateDocument(DATABASE_ID, WIKI_FILES_COLLECTION_ID, id, { sortOrder })
        )
      );
    } catch (error) {
      console.error('Fehler beim Speichern der Datei-Sortierung:', error);
    }
  },

  // Alle Dateien laden (für globale Datei-Suche in der Befehlspalette)
  async getAllFiles(): Promise<WikiFile[]> {
    try {
      const documents = await loadAllDocuments(DATABASE_ID, WIKI_FILES_COLLECTION_ID);
      return documents as unknown as WikiFile[];
    } catch (error) {
      console.error('Fehler beim Laden aller Wiki-Dateien:', error);
      return [];
    }
  },

  // Datei hochladen
  async upload(pageId: string, file: File): Promise<WikiFile | null> {
    try {
      // Aktuelle User-ID holen
      const userId = await getCurrentUserId();

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
          uploadedBy: userId,
          uploadTime: new Date().toISOString(),
        }
      );
      return response as unknown as WikiFile;
    } catch (error) {
      console.error('Fehler beim Hochladen der Datei:', error);
      throw error;
    }
  },

  // Bild hochladen und URL zurückgeben (für Inline-Bilder)
  async uploadImage(pageId: string, file: File): Promise<string | null> {
    try {
      const wikiFile = await this.upload(pageId, file);
      if (wikiFile) {
        return this.getFileUrl(wikiFile.fileId);
      }
      return null;
    } catch (error) {
      console.error('Fehler beim Hochladen des Bildes:', error);
      return null;
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

  // Vorschau-URL für Bilder
  getPreviewUrl(fileId: string, width: number = 400): string {
    return storage.getFilePreview(WIKI_DATEIEN_BUCKET_ID, fileId, width).toString();
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
