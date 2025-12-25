import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  Clock,
  Star,
  StarOff,
  Edit3,
  Trash2,
  Save,
  X,
  Upload,
  File,
  Download,
  Eye,
  MoreVertical,
  Home,
  Menu,
  Pin,
  BookOpen,
  Hash,
  Folder,
  FileText,
  Layout,
  List,
} from 'lucide-react';
import WikiEditor from './WikiEditor';
import WikiFilesPanel from './WikiFilesPanel';
import {
  WikiPage,
  WikiFile,
  CreateWikiPage,
  WikiCategory,
  WIKI_CATEGORIES,
  WIKI_TEMPLATES,
  WIKI_ICONS,
  WikiTocItem,
} from '../../types/wiki';
import {
  wikiPageService,
  wikiFileService,
  buildPageTree,
  buildBreadcrumbs,
  extractToc,
  getRecentViews,
  addRecentView,
  toggleFavorite,
  isFavorite,
  getFavorites,
} from '../../services/wikiService';

// ============ WIKI KOMPONENTE ============

const Wiki = () => {
  // === STATE ===
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [pageTree, setPageTree] = useState<WikiPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Formular
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIcon, setFormIcon] = useState('📄');
  const [formCategory, setFormCategory] = useState<WikiCategory>('sonstiges');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formParentId, setFormParentId] = useState<string | undefined>();
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Dateien
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiPage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showToc, setShowToc] = useState(true);
  const [toc, setToc] = useState<WikiTocItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [currentFavorite, setCurrentFavorite] = useState(false);
  const [showPageMenu, setShowPageMenu] = useState<string | null>(null);

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // === DATA LOADING ===
  const loadPages = useCallback(async () => {
    try {
      const loadedPages = await wikiPageService.getAll();
      setPages(loadedPages);
      setPageTree(buildPageTree(loadedPages));

      if (!selectedPage && loadedPages.length > 0) {
        const pinnedPage = loadedPages.find(p => p.isPinned);
        setSelectedPage(pinnedPage || loadedPages[0]);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Seiten:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedPage]);

  const loadFiles = useCallback(async (pageId: string) => {
    try {
      const loadedFiles = await wikiFileService.getForPage(pageId);
      setFiles(loadedFiles);
    } catch (error) {
      console.error('Fehler beim Laden der Dateien:', error);
    }
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  useEffect(() => {
    if (selectedPage?.$id) {
      loadFiles(selectedPage.$id);
      setToc(extractToc(selectedPage.content || ''));
      setCurrentFavorite(isFavorite(selectedPage.$id));
      addRecentView(selectedPage);
      wikiPageService.incrementViewCount(selectedPage.$id);
    } else {
      setFiles([]);
      setToc([]);
    }
  }, [selectedPage, loadFiles]);

  // === SEARCH ===
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await wikiPageService.search(searchQuery);
      setSearchResults(results.map(r => r.page));
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // === COMPUTED VALUES ===
  const breadcrumbs = useMemo(() => {
    if (!selectedPage?.$id) return [];
    return buildBreadcrumbs(selectedPage.$id, pages);
  }, [selectedPage, pages]);

  const recentViews = useMemo(() => getRecentViews(), [selectedPage]);

  const favoritePages = useMemo(() => {
    const favIds = getFavorites();
    return pages.filter(p => favIds.includes(p.$id!));
  }, [pages, currentFavorite]);

  // === HANDLERS ===
  const handleSelectPage = (page: WikiPage) => {
    setSelectedPage(page);
    setIsEditing(false);
    setIsCreating(false);
    setShowMobileSidebar(false);
    setSearchQuery('');
  };

  const handleStartCreate = (parentId?: string) => {
    setIsCreating(true);
    setIsEditing(true);
    setFormTitle('');
    setFormContent('<p>Neue Wiki-Seite</p>');
    setFormDescription('');
    setFormIcon('📄');
    setFormCategory('sonstiges');
    setFormTags([]);
    setFormParentId(parentId);
    setFormIsPinned(false);
    setSelectedPage(null);
    setShowMobileSidebar(false);
  };

  const handleStartEdit = () => {
    if (selectedPage) {
      setFormTitle(selectedPage.title);
      setFormContent(selectedPage.content);
      setFormDescription(selectedPage.description || '');
      setFormIcon(selectedPage.icon || '📄');
      setFormCategory(selectedPage.category || 'sonstiges');
      setFormTags(selectedPage.tags || []);
      setFormParentId(selectedPage.parentId);
      setFormIsPinned(selectedPage.isPinned || false);
      setIsEditing(true);
      setIsCreating(false);
    }
  };

  const handleUseTemplate = (templateId: string) => {
    const template = WIKI_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setFormContent(template.content);
      setFormCategory(template.category);
      setFormIcon(template.icon);
      setShowTemplateModal(false);
    }
  };

  const handleSave = async () => {
    if (!formTitle.trim()) {
      alert('Bitte gib einen Titel ein.');
      return;
    }

    setSaving(true);

    try {
      if (isCreating) {
        const newPage: CreateWikiPage = {
          title: formTitle,
          content: formContent,
          description: formDescription,
          icon: formIcon,
          category: formCategory,
          tags: formTags,
          parentId: formParentId,
          slug: '',
          sortOrder: pages.length,
          isPublished: true,
          isPinned: formIsPinned,
        };

        const created = await wikiPageService.create(newPage);
        if (created) {
          await loadPages();
          setSelectedPage(created);
        }
      } else if (selectedPage?.$id) {
        const updated = await wikiPageService.update(selectedPage.$id, {
          title: formTitle,
          content: formContent,
          description: formDescription,
          icon: formIcon,
          category: formCategory,
          tags: formTags,
          parentId: formParentId,
          isPinned: formIsPinned,
        });
        if (updated) {
          await loadPages();
          setSelectedPage(updated);
        }
      }

      setIsEditing(false);
      setIsCreating(false);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Seite.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsCreating(false);
    if (pages.length > 0 && !selectedPage) {
      setSelectedPage(pages[0]);
    }
  };

  const handleDelete = async (page: WikiPage) => {
    if (!page.$id) return;
    if (!confirm(`Möchtest du "${page.title}" wirklich löschen?`)) return;

    try {
      await wikiPageService.delete(page.$id);
      await loadPages();
      if (selectedPage?.$id === page.$id) {
        setSelectedPage(pages.filter(p => p.$id !== page.$id)[0] || null);
      }
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Seite.');
    }
    setShowPageMenu(null);
  };

  const handleToggleFavorite = () => {
    if (selectedPage?.$id) {
      const isFav = toggleFavorite(selectedPage.$id);
      setCurrentFavorite(isFav);
    }
  };

  const handleToggleFolder = (pageId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formTags.includes(tagInput.trim())) {
      setFormTags([...formTags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormTags(formTags.filter(t => t !== tag));
  };

  // === FILE HANDLERS ===
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedPage?.$id) return;
    await uploadFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Nur Upload wenn Seite existiert (nicht bei neuen Seiten)
    if (!selectedPage?.$id) {
      if (isCreating) {
        alert('Bitte speichere zuerst die Seite, bevor du Dateien hochlädst.');
      }
      return;
    }
    if (!e.dataTransfer.files.length) return;
    await uploadFiles(Array.from(e.dataTransfer.files));
  };

  const uploadFiles = async (filesToUpload: File[]) => {
    if (!selectedPage?.$id) return;

    setUploadingFile(true);
    try {
      for (const file of filesToUpload) {
        // Wenn es ein Bild ist und wir im Editor sind, füge es inline ein
        if (file.type.startsWith('image/') && isEditing) {
          const url = await wikiFileService.uploadImage(selectedPage.$id, file);
          if (url) {
            setFormContent(prev => prev + `<p><img src="${url}" alt="${file.name}" style="max-width: 100%;" /></p>`);
          }
        } else {
          await wikiFileService.upload(selectedPage.$id, file);
        }
      }
      await loadFiles(selectedPage.$id);
    } catch (error) {
      console.error('Fehler beim Hochladen:', error);
      alert('Fehler beim Hochladen der Datei.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteFile = async (file: WikiFile) => {
    if (!confirm(`"${file.fileName}" löschen?`)) return;

    try {
      await wikiFileService.delete(file);
      if (selectedPage?.$id) {
        await loadFiles(selectedPage.$id);
      }
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  };

  // === RENDER HELPERS ===
  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getCategoryColor = (category?: WikiCategory) => {
    if (!category) return 'gray';
    return WIKI_CATEGORIES[category]?.color || 'gray';
  };

  // === RENDER TREE NODE ===
  const renderTreeNode = (page: WikiPage, depth = 0) => {
    const hasChildren = page.children && page.children.length > 0;
    const isExpanded = expandedFolders.has(page.$id!);
    const isSelected = selectedPage?.$id === page.$id;

    return (
      <div key={page.$id}>
        <div
          className={`
            group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all
            ${isSelected
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-dark-text'
            }
          `}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => handleSelectPage(page)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleFolder(page.$id!); }}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-5" />
          )}

          <span className="text-lg">{page.icon || '📄'}</span>
          <span className="flex-1 truncate text-sm font-medium">{page.title}</span>

          {page.isPinned && <Pin className="w-3 h-3 text-amber-500" />}

          <button
            onClick={(e) => { e.stopPropagation(); setShowPageMenu(showPageMenu === page.$id ? null : page.$id!); }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showPageMenu === page.$id && (
            <div className="absolute right-4 mt-24 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 z-50 min-w-[160px]">
              <button
                onClick={(e) => { e.stopPropagation(); handleStartCreate(page.$id); setShowPageMenu(null); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <Plus className="w-4 h-4" /> Unterseite
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleSelectPage(page); handleStartEdit(); setShowPageMenu(null); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <Edit3 className="w-4 h-4" /> Bearbeiten
              </button>
              <hr className="my-1 border-gray-200 dark:border-slate-700" />
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(page); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" /> Löschen
              </button>
            </div>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {page.children!.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // === LOADING STATE ===
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-dark-textMuted">Wiki wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 dark:bg-dark-bg overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* === SIDEBAR === */}
      <aside
        className={`
          ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          fixed lg:relative inset-y-0 left-0 z-50 lg:z-0
          w-80 bg-white dark:bg-dark-surface border-r border-gray-200 dark:border-dark-border
          flex flex-col transition-transform duration-300 ease-in-out
          ${showSidebar ? 'lg:w-80' : 'lg:w-0 lg:overflow-hidden'}
        `}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-red-600" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">Wiki</h1>
            </div>
            <button
              onClick={() => handleStartCreate()}
              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              title="Neue Seite"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suchen... (Ctrl+K)"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-slate-800 border-0 rounded-lg text-sm
                       focus:ring-2 focus:ring-red-500 focus:bg-white dark:focus:bg-slate-700
                       placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-dark-text"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent"></div>
              </div>
            )}
          </div>
        </div>

        {/* Search Results */}
        {searchQuery && (
          <div className="p-2 border-b border-gray-200 dark:border-dark-border max-h-64 overflow-y-auto">
            {searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.map(page => (
                  <button
                    key={page.$id}
                    onClick={() => handleSelectPage(page)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-slate-800"
                  >
                    <span>{page.icon || '📄'}</span>
                    <span className="flex-1 truncate text-sm text-gray-900 dark:text-dark-text">{page.title}</span>
                  </button>
                ))}
              </div>
            ) : !isSearching ? (
              <p className="text-center text-sm text-gray-500 dark:text-dark-textMuted py-4">
                Keine Ergebnisse
              </p>
            ) : null}
          </div>
        )}

        {/* Quick Access */}
        {!searchQuery && (
          <>
            {/* Favorites */}
            {favoritePages.length > 0 && (
              <div className="p-2 border-b border-gray-200 dark:border-dark-border">
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  <Star className="w-3 h-3" /> Favoriten
                </div>
                {favoritePages.map(page => (
                  <button
                    key={page.$id}
                    onClick={() => handleSelectPage(page)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors
                      ${selectedPage?.$id === page.$id
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-dark-text'
                      }`}
                  >
                    <span>{page.icon || '📄'}</span>
                    <span className="flex-1 truncate text-sm">{page.title}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Recent */}
            {recentViews.length > 0 && (
              <div className="p-2 border-b border-gray-200 dark:border-dark-border">
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  <Clock className="w-3 h-3" /> Zuletzt besucht
                </div>
                {recentViews.slice(0, 5).map(view => (
                  <button
                    key={view.pageId}
                    onClick={() => {
                      const page = pages.find(p => p.$id === view.pageId);
                      if (page) handleSelectPage(page);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-slate-800"
                  >
                    <span>{view.icon || '📄'}</span>
                    <span className="flex-1 truncate text-sm text-gray-700 dark:text-dark-text">{view.title}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Page Tree */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-3 py-1.5 mb-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
              Seiten
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('tree')}
                className={`p-1 rounded ${viewMode === 'tree' ? 'bg-gray-200 dark:bg-slate-700' : 'hover:bg-gray-100 dark:hover:bg-slate-800'}`}
              >
                <Folder className="w-4 h-4 text-gray-500" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1 rounded ${viewMode === 'list' ? 'bg-gray-200 dark:bg-slate-700' : 'hover:bg-gray-100 dark:hover:bg-slate-800'}`}
              >
                <List className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {pageTree.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-dark-textMuted">Noch keine Seiten</p>
              <button
                onClick={() => handleStartCreate()}
                className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Erste Seite erstellen
              </button>
            </div>
          ) : viewMode === 'tree' ? (
            <div className="space-y-0.5">
              {pageTree.map(page => renderTreeNode(page))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {pages.map(page => (
                <button
                  key={page.$id}
                  onClick={() => handleSelectPage(page)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors
                    ${selectedPage?.$id === page.$id
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-dark-text'
                    }`}
                >
                  <span>{page.icon || '📄'}</span>
                  <span className="flex-1 truncate text-sm">{page.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* === MAIN CONTENT === */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="flex items-center gap-4 px-4 lg:px-6 py-3 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setShowMobileSidebar(true)}
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <Menu className="w-5 h-5 text-gray-600 dark:text-dark-text" />
          </button>

          {/* Toggle Sidebar (Desktop) */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="hidden lg:block p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <Layout className="w-5 h-5 text-gray-600 dark:text-dark-text" />
          </button>

          {/* Breadcrumbs */}
          {selectedPage && !isEditing && (
            <nav className="flex items-center gap-1 text-sm overflow-x-auto flex-1 min-w-0">
              <button
                onClick={() => setSelectedPage(null)}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:text-dark-textMuted dark:hover:text-dark-text whitespace-nowrap"
              >
                <Home className="w-4 h-4" />
              </button>
              {breadcrumbs.map((crumb, i) => (
                <div key={crumb.$id} className="flex items-center gap-1">
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <button
                    onClick={() => handleSelectPage(crumb)}
                    className={`whitespace-nowrap ${
                      i === breadcrumbs.length - 1
                        ? 'text-gray-900 dark:text-dark-text font-medium'
                        : 'text-gray-500 hover:text-gray-700 dark:text-dark-textMuted dark:hover:text-dark-text'
                    }`}
                  >
                    {crumb.title}
                  </button>
                </div>
              ))}
            </nav>
          )}

          {isEditing && (
            <div className="flex-1 text-sm font-medium text-gray-900 dark:text-dark-text">
              {isCreating ? 'Neue Seite erstellen' : `"${selectedPage?.title}" bearbeiten`}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {!isEditing && selectedPage && (
              <>
                <button
                  onClick={handleToggleFavorite}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                  title={currentFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                >
                  {currentFavorite ? (
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                  ) : (
                    <StarOff className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                <button
                  onClick={() => setShowFilesPanel(!showFilesPanel)}
                  className={`p-2 rounded-lg ${showFilesPanel ? 'bg-gray-200 dark:bg-slate-700' : 'hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                  title="Dateien"
                >
                  <File className="w-5 h-5 text-gray-600 dark:text-dark-text" />
                </button>
                <button
                  onClick={() => setShowToc(!showToc)}
                  className={`hidden md:block p-2 rounded-lg ${showToc ? 'bg-gray-200 dark:bg-slate-700' : 'hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                  title="Inhaltsverzeichnis"
                >
                  <List className="w-5 h-5 text-gray-600 dark:text-dark-text" />
                </button>
                <button
                  onClick={handleStartEdit}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Bearbeiten</span>
                </button>
              </>
            )}

            {isEditing && (
              <>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-dark-text rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Abbrechen</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Speichern</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Page Content */}
          <div
            ref={contentRef}
            className={`flex-1 overflow-y-auto ${isDragging ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-100/80 dark:bg-blue-900/50 z-10 pointer-events-none">
                <div className="text-center">
                  <Upload className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                  <p className="text-lg font-medium text-blue-700 dark:text-blue-300">Dateien hier ablegen</p>
                </div>
              </div>
            )}

            <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
              {!selectedPage && !isEditing ? (
                /* Welcome Screen */
                <div className="text-center py-16">
                  <BookOpen className="w-20 h-20 text-gray-300 dark:text-gray-600 mx-auto mb-6" />
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-2">TennisMehl Wiki</h2>
                  <p className="text-gray-500 dark:text-dark-textMuted mb-8 max-w-md mx-auto">
                    Dokumentiere alle Prozesse, Anleitungen und Richtlinien deines Unternehmens an einem zentralen Ort.
                  </p>
                  <button
                    onClick={() => handleStartCreate()}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Erste Seite erstellen
                  </button>
                </div>
              ) : isEditing ? (
                /* Editor Mode */
                <div className="space-y-6">
                  {/* Title & Icon */}
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <button
                        onClick={() => setShowIconPicker(!showIconPicker)}
                        className="text-4xl p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                      >
                        {formIcon}
                      </button>
                      {showIconPicker && (
                        <div className="absolute top-full left-0 mt-2 p-3 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 grid grid-cols-8 gap-1 z-50">
                          {WIKI_ICONS.map(icon => (
                            <button
                              key={icon}
                              onClick={() => { setFormIcon(icon); setShowIconPicker(false); }}
                              className="text-2xl p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Seitentitel"
                      className="flex-1 text-3xl lg:text-4xl font-bold bg-transparent border-0 focus:ring-0 text-gray-900 dark:text-dark-text placeholder-gray-300 dark:placeholder-gray-600"
                    />
                  </div>

                  {/* Description */}
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Kurze Beschreibung (optional)"
                    className="w-full text-lg bg-transparent border-0 focus:ring-0 text-gray-500 dark:text-dark-textMuted placeholder-gray-300 dark:placeholder-gray-600"
                  />

                  {/* Meta: Category, Parent, Tags */}
                  <div className="flex flex-wrap gap-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                    {/* Category */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-dark-textMuted mb-1">Kategorie</label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value as WikiCategory)}
                        className="px-3 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm"
                      >
                        {Object.entries(WIKI_CATEGORIES).map(([key, { label, icon }]) => (
                          <option key={key} value={key}>{icon} {label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Parent */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-dark-textMuted mb-1">Übergeordnete Seite</label>
                      <select
                        value={formParentId || ''}
                        onChange={(e) => setFormParentId(e.target.value || undefined)}
                        className="px-3 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm"
                      >
                        <option value="">Keine (Hauptseite)</option>
                        {pages.filter(p => p.$id !== selectedPage?.$id).map(p => (
                          <option key={p.$id} value={p.$id}>{p.icon} {p.title}</option>
                        ))}
                      </select>
                    </div>

                    {/* Pinned */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsPinned}
                        onChange={(e) => setFormIsPinned(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-dark-text">Anpinnen</span>
                    </label>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-2">
                    {formTags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-gray-200 dark:bg-slate-700 rounded-full text-sm"
                      >
                        <Hash className="w-3 h-3" />
                        {tag}
                        <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                        placeholder="Tag hinzufügen..."
                        className="px-3 py-1 bg-transparent border border-dashed border-gray-300 dark:border-slate-600 rounded-full text-sm focus:border-red-500 focus:ring-0"
                      />
                      {tagInput && (
                        <button onClick={handleAddTag} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded">
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Template Button */}
                  {isCreating && (
                    <button
                      onClick={() => setShowTemplateModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg text-sm"
                    >
                      <FileText className="w-4 h-4" />
                      Vorlage verwenden
                    </button>
                  )}

                  {/* Editor */}
                  <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <WikiEditor
                      content={formContent}
                      onChange={setFormContent}
                      onImageUpload={async (file) => {
                        if (selectedPage?.$id) {
                          return await wikiFileService.uploadImage(selectedPage.$id, file);
                        }
                        return null;
                      }}
                    />
                  </div>

                  {/* Files Panel - nur anzeigen wenn Seite bereits existiert */}
                  {selectedPage?.$id ? (
                    <WikiFilesPanel
                      files={files}
                      pageId={selectedPage.$id}
                      onUpload={async (filesToUpload) => {
                        await uploadFiles(filesToUpload);
                      }}
                      onDelete={handleDeleteFile}
                      uploading={uploadingFile}
                    />
                  ) : isCreating ? (
                    <div className="p-8 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-2xl
                                  bg-amber-50/50 dark:bg-amber-900/10 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 dark:bg-amber-900/30 rounded-2xl
                                    flex items-center justify-center">
                        <Upload className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                      </div>
                      <h4 className="text-lg font-semibold text-amber-800 dark:text-amber-300 mb-2">
                        Dateien nach dem Speichern hochladen
                      </h4>
                      <p className="text-amber-700 dark:text-amber-400 text-sm max-w-md mx-auto">
                        Speichere zuerst die neue Wiki-Seite. Danach kannst du Dateien, PDFs und Bilder hochladen.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                /* View Mode */
                <article>
                  {/* Page Header */}
                  <header className="mb-8">
                    <div className="flex items-start gap-4 mb-4">
                      <span className="text-5xl">{selectedPage?.icon || '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-dark-text mb-2">
                          {selectedPage?.title}
                        </h1>
                        {selectedPage?.description && (
                          <p className="text-lg text-gray-500 dark:text-dark-textMuted">
                            {selectedPage.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-dark-textMuted">
                      {selectedPage?.category && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 bg-${getCategoryColor(selectedPage.category)}-100 dark:bg-${getCategoryColor(selectedPage.category)}-900/30 text-${getCategoryColor(selectedPage.category)}-700 dark:text-${getCategoryColor(selectedPage.category)}-300 rounded-full`}>
                          {WIKI_CATEGORIES[selectedPage.category]?.icon}
                          {WIKI_CATEGORIES[selectedPage.category]?.label}
                        </span>
                      )}
                      {selectedPage?.tags?.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 text-gray-600 dark:text-dark-textMuted">
                          <Hash className="w-3 h-3" />{tag}
                        </span>
                      ))}
                      <span className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        {selectedPage?.viewCount || 0} Aufrufe
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDate(selectedPage?.$updatedAt)}
                      </span>
                    </div>
                  </header>

                  {/* Content */}
                  <div
                    className="prose prose-lg dark:prose-invert max-w-none
                             prose-headings:font-bold prose-headings:text-gray-900 dark:prose-headings:text-dark-text
                             prose-p:text-gray-700 dark:prose-p:text-dark-text
                             prose-a:text-red-600 dark:prose-a:text-red-400 prose-a:no-underline hover:prose-a:underline
                             prose-strong:text-gray-900 dark:prose-strong:text-dark-text
                             prose-ul:text-gray-700 dark:prose-ul:text-dark-text
                             prose-ol:text-gray-700 dark:prose-ol:text-dark-text
                             prose-li:text-gray-700 dark:prose-li:text-dark-text
                             prose-table:border-collapse prose-th:bg-gray-100 dark:prose-th:bg-slate-800 prose-th:px-4 prose-th:py-2
                             prose-td:px-4 prose-td:py-2 prose-td:border prose-td:border-gray-200 dark:prose-td:border-slate-700
                             prose-img:rounded-lg prose-img:shadow-lg"
                    dangerouslySetInnerHTML={{ __html: selectedPage?.content || '' }}
                  />

                  {/* Attached Files Section */}
                  {files.length > 0 && (
                    <div className="mt-12 pt-8 border-t border-gray-200 dark:border-slate-700">
                      <WikiFilesPanel
                        files={files}
                        pageId={selectedPage?.$id || ''}
                        onUpload={async (filesToUpload) => {
                          await uploadFiles(filesToUpload);
                        }}
                        onDelete={handleDeleteFile}
                        uploading={uploadingFile}
                      />
                    </div>
                  )}
                </article>
              )}
            </div>
          </div>

          {/* Table of Contents (Desktop) */}
          {showToc && selectedPage && !isEditing && toc.length > 0 && (
            <aside className="hidden lg:block w-64 flex-shrink-0 border-l border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-y-auto">
              <div className="p-4">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider mb-3">
                  Auf dieser Seite
                </h3>
                <nav className="space-y-1">
                  {toc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="block text-sm text-gray-600 hover:text-red-600 dark:text-dark-textMuted dark:hover:text-red-400 transition-colors"
                      style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
                    >
                      {item.text}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          )}

          {/* Files Panel */}
          {showFilesPanel && selectedPage && !isEditing && (
            <aside className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-y-auto">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                    Dateien ({files.length})
                  </h3>
                  <label className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
                    <Upload className="w-4 h-4 text-gray-500" />
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {files.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-dark-textMuted text-center py-8">
                    Keine Dateien
                  </p>
                ) : (
                  <div className="space-y-2">
                    {files.map(file => (
                      <div
                        key={file.$id}
                        className="group flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                      >
                        {file.mimeType?.startsWith('image/') ? (
                          <img
                            src={wikiFileService.getPreviewUrl(file.fileId, 80)}
                            alt={file.fileName}
                            className="w-10 h-10 object-cover rounded"
                          />
                        ) : (
                          <File className="w-10 h-10 text-gray-400 p-2 bg-gray-200 dark:bg-slate-700 rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">
                            {file.fileName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <a
                            href={wikiFileService.getDownloadUrl(file.fileId)}
                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-slate-600 rounded"
                            title="Herunterladen"
                          >
                            <Download className="w-4 h-4 text-gray-500" />
                          </a>
                          <button
                            onClick={() => handleDeleteFile(file)}
                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">Vorlage auswählen</h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh] grid grid-cols-1 md:grid-cols-2 gap-4">
              {WIKI_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleUseTemplate(template.id)}
                  className="p-4 text-left border border-gray-200 dark:border-slate-700 rounded-xl hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <div className="text-3xl mb-2">{template.icon}</div>
                  <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1">{template.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-dark-textMuted">{template.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        multiple
      />
    </div>
  );
};

export default Wiki;
