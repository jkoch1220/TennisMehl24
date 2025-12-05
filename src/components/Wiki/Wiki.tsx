import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  FileText,
  Edit3,
  Trash2,
  Save,
  X,
  Search,
  ChevronRight,
  Clock,
  Upload,
  File,
  Download,
  Eye,
  MoreVertical,
} from 'lucide-react';
import WikiEditor from './WikiEditor';
import { WikiPage, WikiFile, CreateWikiPage } from '../../types/wiki';
import { wikiPageService, wikiFileService } from '../../services/wikiService';

const Wiki = () => {
  // State für Seiten
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // State für Formular
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIcon, setFormIcon] = useState('📄');

  // State für Dateien
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  // State für Suche
  const [searchQuery, setSearchQuery] = useState('');

  // State für Sidebar
  const [sidebarWidth, setSidebarWidth] = useState(280);

  // State für Dropdown-Menü
  const [showPageMenu, setShowPageMenu] = useState<string | null>(null);

  // Seiten laden
  const loadPages = useCallback(async () => {
    try {
      const loadedPages = await wikiPageService.getAll();
      setPages(loadedPages);
      
      // Wenn noch keine Seite ausgewählt ist und Seiten vorhanden sind
      if (!selectedPage && loadedPages.length > 0) {
        setSelectedPage(loadedPages[0]);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Seiten:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedPage]);

  // Dateien für eine Seite laden
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
    } else {
      setFiles([]);
    }
  }, [selectedPage, loadFiles]);

  // Gefilterte Seiten basierend auf Suche
  const filteredPages = pages.filter(page =>
    page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Neue Seite erstellen starten
  const handleStartCreate = () => {
    setIsCreating(true);
    setIsEditing(true);
    setFormTitle('');
    setFormContent('<p>Neue Wiki-Seite</p>');
    setFormDescription('');
    setFormIcon('📄');
    setSelectedPage(null);
  };

  // Seite bearbeiten starten
  const handleStartEdit = () => {
    if (selectedPage) {
      setFormTitle(selectedPage.title);
      setFormContent(selectedPage.content);
      setFormDescription(selectedPage.description || '');
      setFormIcon(selectedPage.icon || '📄');
      setIsEditing(true);
      setIsCreating(false);
    }
  };

  // Speichern (Erstellen oder Aktualisieren)
  const handleSave = async () => {
    if (!formTitle.trim()) {
      alert('Bitte gib einen Titel ein.');
      return;
    }

    setSaving(true);

    try {
      if (isCreating) {
        // Neue Seite erstellen
        const newPage: CreateWikiPage = {
          title: formTitle,
          content: formContent,
          description: formDescription,
          icon: formIcon,
          slug: '',
          sortOrder: pages.length,
          isPublished: true,
        };

        const created = await wikiPageService.create(newPage);
        if (created) {
          await loadPages();
          setSelectedPage(created);
        }
      } else if (selectedPage?.$id) {
        // Bestehende Seite aktualisieren
        const updated = await wikiPageService.update(selectedPage.$id, {
          title: formTitle,
          content: formContent,
          description: formDescription,
          icon: formIcon,
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

  // Abbrechen
  const handleCancel = () => {
    setIsEditing(false);
    setIsCreating(false);
    if (pages.length > 0 && !selectedPage) {
      setSelectedPage(pages[0]);
    }
  };

  // Seite löschen
  const handleDelete = async (page: WikiPage) => {
    if (!page.$id) return;

    if (!confirm(`Möchtest du die Seite "${page.title}" wirklich löschen?`)) {
      return;
    }

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

  // Datei hochladen
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedPage?.$id) return;

    const file = e.target.files[0];
    setUploadingFile(true);

    try {
      await wikiFileService.upload(selectedPage.$id, file);
      await loadFiles(selectedPage.$id);
    } catch (error) {
      console.error('Fehler beim Hochladen:', error);
      alert('Fehler beim Hochladen der Datei.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  // Datei löschen
  const handleDeleteFile = async (file: WikiFile) => {
    if (!confirm(`Möchtest du die Datei "${file.fileName}" wirklich löschen?`)) {
      return;
    }

    try {
      await wikiFileService.delete(file);
      if (selectedPage?.$id) {
        await loadFiles(selectedPage.$id);
      }
    } catch (error) {
      console.error('Fehler beim Löschen der Datei:', error);
    }
  };

  // Formatiere Dateigröße
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Formatiere Datum
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-144px)]">
      {/* Sidebar */}
      <div
        style={{ width: sidebarWidth }}
        className="bg-white border-r border-gray-200 flex flex-col flex-shrink-0"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Wiki</h2>
            <button
              onClick={handleStartCreate}
              className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              title="Neue Seite erstellen"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Suche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Seiten durchsuchen..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Seitenliste */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredPages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? (
                <p className="text-sm">Keine Seiten gefunden</p>
              ) : (
                <>
                  <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Noch keine Seiten vorhanden</p>
                  <button
                    onClick={handleStartCreate}
                    className="mt-2 text-red-600 hover:underline text-sm"
                  >
                    Erste Seite erstellen
                  </button>
                </>
              )}
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredPages.map((page) => (
                <li key={page.$id} className="relative group">
                  <button
                    onClick={() => {
                      setSelectedPage(page);
                      setIsEditing(false);
                      setIsCreating(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                      selectedPage?.$id === page.$id
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <span className="text-lg flex-shrink-0">{page.icon || '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{page.title}</div>
                      {page.description && (
                        <div className="text-xs text-gray-500 truncate">
                          {page.description}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-50" />
                  </button>

                  {/* Seiten-Menü Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPageMenu(showPageMenu === page.$id ? null : page.$id || null);
                    }}
                    className="absolute right-10 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                  </button>

                  {/* Dropdown Menü */}
                  {showPageMenu === page.$id && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                      <button
                        onClick={() => {
                          setSelectedPage(page);
                          handleStartEdit();
                          setShowPageMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Edit3 className="w-4 h-4" />
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(page)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Löschen
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="w-1 bg-gray-200 cursor-col-resize hover:bg-red-400 transition-colors"
        onMouseDown={(e) => {
          const startX = e.clientX;
          const startWidth = sidebarWidth;

          const handleMouseMove = (e: MouseEvent) => {
            const newWidth = startWidth + (e.clientX - startX);
            setSidebarWidth(Math.max(200, Math.min(400, newWidth)));
          };

          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
          };

          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {isEditing || isCreating ? (
          /* Editor Ansicht */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Editor Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  {/* Icon Picker */}
                  <input
                    type="text"
                    value={formIcon}
                    onChange={(e) => setFormIcon(e.target.value)}
                    className="w-12 h-12 text-2xl text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    maxLength={2}
                  />
                  {/* Titel */}
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Seitentitel..."
                    className="flex-1 text-2xl font-bold border-none focus:outline-none focus:ring-0 bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Speichern...' : 'Speichern'}
                  </button>
                </div>
              </div>
              {/* Beschreibung */}
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Kurze Beschreibung (optional)..."
                className="mt-2 w-full text-sm text-gray-500 border-none focus:outline-none focus:ring-0 bg-transparent"
              />
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto">
                <WikiEditor
                  content={formContent}
                  onChange={setFormContent}
                />
              </div>
            </div>
          </div>
        ) : selectedPage ? (
          /* Seiten Ansicht */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{selectedPage.icon || '📄'}</span>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                      {selectedPage.title}
                    </h1>
                    {selectedPage.description && (
                      <p className="text-sm text-gray-500 mt-1">
                        {selectedPage.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStartEdit}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    Bearbeiten
                  </button>
                </div>
              </div>
              {/* Meta Info */}
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                {selectedPage.$updatedAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Zuletzt bearbeitet: {formatDate(selectedPage.$updatedAt)}
                  </span>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto">
                {/* Wiki Content */}
                <div
                  className="prose prose-sm max-w-none mb-8
                    [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6
                    [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5
                    [&_h3]:text-xl [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-4
                    [&_p]:mb-2
                    [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-2
                    [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-2
                    [&_li]:mb-1
                    [&_a]:text-blue-600 [&_a]:underline
                    [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600
                    [&_pre]:bg-gray-800 [&_pre]:text-gray-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto
                    [&_code]:font-mono
                    [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg
                    [&_hr]:my-4 [&_hr]:border-gray-300
                    [&_table]:w-full [&_table]:border-collapse
                    [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-3 [&_th]:py-2
                    [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-2
                  "
                  dangerouslySetInnerHTML={{ __html: selectedPage.content }}
                />

                {/* Dateien Bereich */}
                <div className="mt-8 border-t border-gray-200 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <File className="w-5 h-5" />
                      Anhänge ({files.length})
                    </h3>
                    <label className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" />
                      <span className="text-sm">Datei hochladen</span>
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={uploadingFile}
                      />
                    </label>
                  </div>

                  {uploadingFile && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                      Datei wird hochgeladen...
                    </div>
                  )}

                  {files.length > 0 ? (
                    <div className="grid gap-2">
                      {files.map((file) => (
                        <div
                          key={file.$id}
                          className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                        >
                          <File className="w-8 h-8 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-700 truncate">
                              {file.fileName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatFileSize(file.size)} • {file.mimeType}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <a
                              href={wikiFileService.getFileUrl(file.fileId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 hover:bg-gray-100 rounded transition-colors"
                              title="Anzeigen"
                            >
                              <Eye className="w-4 h-4 text-gray-500" />
                            </a>
                            <a
                              href={wikiFileService.getDownloadUrl(file.fileId)}
                              className="p-2 hover:bg-gray-100 rounded transition-colors"
                              title="Herunterladen"
                            >
                              <Download className="w-4 h-4 text-gray-500" />
                            </a>
                            <button
                              onClick={() => handleDeleteFile(file)}
                              className="p-2 hover:bg-red-50 rounded transition-colors"
                              title="Löschen"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
                      <File className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">Keine Dateien vorhanden</p>
                      <p className="text-xs mt-1">Lade Dateien hoch, um sie hier anzuzeigen</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Keine Seite ausgewählt */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold text-gray-600 mb-2">
                Willkommen im Wiki
              </h2>
              <p className="text-gray-500 mb-4">
                Wähle eine Seite aus der Seitenleiste oder erstelle eine neue.
              </p>
              <button
                onClick={handleStartCreate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Neue Seite erstellen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Click-Outside Handler für Menü */}
      {showPageMenu && (
        <div
          className="fixed inset-0 z-5"
          onClick={() => setShowPageMenu(null)}
        />
      )}
    </div>
  );
};

export default Wiki;


