import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Link,
  Image,
  Code,
  Quote,
  Minus,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Table,
  Upload,
  Loader2,
} from 'lucide-react';

interface WikiEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  onImageUpload?: (file: File) => Promise<string | null>;
}

const WikiEditor = ({
  content,
  onChange,
  placeholder = 'Beginne hier zu schreiben...',
  onImageUpload
}: WikiEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const savedSelectionRef = useRef<Range | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Content initial setzen
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
  }, [content]);

  // Speichere die aktuelle Selektion
  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  // Stelle die Selektion wieder her
  const restoreSelection = () => {
    if (savedSelectionRef.current) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedSelectionRef.current);
      }
    }
  };

  // Formatierung ausführen
  const execCommand = useCallback((command: string, value: string = '') => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    editorRef.current?.focus();
  }, [onChange]);

  // Bild hochladen und einfügen
  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Bitte nur Bilddateien hochladen');
      return;
    }

    if (!onImageUpload) {
      // Fallback: Als Data URL einfügen
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const imgHtml = `<img src="${dataUrl}" alt="${file.name}" class="max-w-full h-auto rounded-lg my-2" />`;
        document.execCommand('insertHTML', false, imgHtml);
        if (editorRef.current) {
          onChange(editorRef.current.innerHTML);
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    setIsUploading(true);
    try {
      const url = await onImageUpload(file);
      if (url) {
        const imgHtml = `<img src="${url}" alt="${file.name}" class="max-w-full h-auto rounded-lg my-2" />`;
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, imgHtml);
        if (editorRef.current) {
          onChange(editorRef.current.innerHTML);
        }
      }
    } catch (error) {
      console.error('Fehler beim Hochladen des Bildes:', error);
      alert('Fehler beim Hochladen des Bildes');
    } finally {
      setIsUploading(false);
    }
  }, [onImageUpload, onChange]);

  // Drag & Drop Handler
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Nur setzen wenn wir wirklich den Editor verlassen
    const rect = editorRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsDragging(false);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    for (const file of imageFiles) {
      await handleImageFile(file);
    }
  }, [handleImageFile]);

  // Paste Handler für Bilder
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          await handleImageFile(file);
        }
      }
    }
  }, [handleImageFile]);

  // File Input Handler
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => handleImageFile(file));
    // Input zurücksetzen
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleImageFile]);

  // Toolbar Button Komponente
  const ToolbarButton = ({
    onClick,
    title,
    children,
    active = false,
    disabled = false,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    active?: boolean;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      onMouseDown={(e) => e.preventDefault()}
      title={title}
      disabled={disabled}
      className={`p-2 rounded transition-colors ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : active
            ? 'bg-gray-200 dark:bg-gray-600 text-blue-600 dark:text-blue-400'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  );

  // Toolbar Trennlinie
  const Divider = () => <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />;

  // Link einfügen
  const handleInsertLink = () => {
    if (linkUrl) {
      restoreSelection();
      const text = linkText || linkUrl;
      const linkHtml = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${text}</a>`;
      document.execCommand('insertHTML', false, linkHtml);
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
    }
    setShowLinkModal(false);
    setLinkUrl('');
    setLinkText('');
  };

  // Bild einfügen (via Button)
  const handleInsertImage = () => {
    if (onImageUpload) {
      // Öffne Datei-Dialog
      fileInputRef.current?.click();
    } else {
      // Fallback: URL-Prompt
      const url = prompt('Bild-URL eingeben:');
      if (url) {
        const imgHtml = `<img src="${url}" alt="Bild" class="max-w-full h-auto rounded-lg my-2" />`;
        document.execCommand('insertHTML', false, imgHtml);
        if (editorRef.current) {
          onChange(editorRef.current.innerHTML);
        }
      }
    }
  };

  // Horizontale Linie
  const handleInsertHR = () => {
    document.execCommand('insertHTML', false, '<hr class="my-4 border-gray-300 dark:border-dark-border" />');
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Code Block einfügen
  const handleInsertCode = () => {
    const selection = window.getSelection();
    if (selection && selection.toString()) {
      const codeHtml = `<pre class="bg-gray-800 text-gray-100 p-4 rounded-lg overflow-x-auto my-2"><code>${selection.toString()}</code></pre>`;
      document.execCommand('insertHTML', false, codeHtml);
    } else {
      const codeHtml = `<pre class="bg-gray-800 text-gray-100 p-4 rounded-lg overflow-x-auto my-2"><code>// Code hier einfügen</code></pre>`;
      document.execCommand('insertHTML', false, codeHtml);
    }
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Blockquote
  const handleBlockquote = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : '';
    const quoteHtml = `<blockquote class="border-l-4 border-blue-500 pl-4 italic text-gray-600 dark:text-gray-400 my-2">${text || 'Zitat'}</blockquote>`;
    document.execCommand('insertHTML', false, quoteHtml);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Tabelle einfügen
  const handleInsertTable = () => {
    const tableHtml = `
      <table class="w-full border-collapse my-4">
        <thead>
          <tr class="bg-gray-100 dark:bg-gray-700">
            <th class="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Spalte 1</th>
            <th class="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Spalte 2</th>
            <th class="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">Spalte 3</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="border border-gray-300 dark:border-gray-600 px-4 py-2">Zeile 1</td>
            <td class="border border-gray-300 dark:border-gray-600 px-4 py-2">-</td>
            <td class="border border-gray-300 dark:border-gray-600 px-4 py-2">-</td>
          </tr>
          <tr>
            <td class="border border-gray-300 dark:border-gray-600 px-4 py-2">Zeile 2</td>
            <td class="border border-gray-300 dark:border-gray-600 px-4 py-2">-</td>
            <td class="border border-gray-300 dark:border-gray-600 px-4 py-2">-</td>
          </tr>
        </tbody>
      </table>
    `;
    document.execCommand('insertHTML', false, tableHtml);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Highlight
  const handleHighlight = () => {
    execCommand('hiliteColor', '#fef08a');
  };

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Toolbar */}
      <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-600 p-2 flex flex-wrap items-center gap-1">
        {/* Text Formatierung */}
        <ToolbarButton onClick={() => execCommand('bold')} title="Fett (Strg+B)">
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('italic')} title="Kursiv (Strg+I)">
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('underline')} title="Unterstrichen (Strg+U)">
          <Underline className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('strikeThrough')} title="Durchgestrichen">
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleHighlight} title="Hervorheben">
          <Highlighter className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Überschriften */}
        <ToolbarButton onClick={() => execCommand('formatBlock', '<h1>')} title="Überschrift 1">
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('formatBlock', '<h2>')} title="Überschrift 2">
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('formatBlock', '<h3>')} title="Überschrift 3">
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('formatBlock', '<p>')} title="Normal">
          <span className="text-xs font-medium">P</span>
        </ToolbarButton>

        <Divider />

        {/* Listen */}
        <ToolbarButton onClick={() => execCommand('insertUnorderedList')} title="Aufzählung">
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('insertOrderedList')} title="Nummerierte Liste">
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Ausrichtung */}
        <ToolbarButton onClick={() => execCommand('justifyLeft')} title="Links ausrichten">
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('justifyCenter')} title="Zentrieren">
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('justifyRight')} title="Rechts ausrichten">
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Einfügen */}
        <ToolbarButton
          onClick={() => {
            saveSelection();
            const selection = window.getSelection();
            if (selection) {
              setLinkText(selection.toString());
            }
            setShowLinkModal(true);
          }}
          title="Link einfügen"
        >
          <Link className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={handleInsertImage}
          title={onImageUpload ? "Bild hochladen" : "Bild einfügen (URL)"}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Image className="w-4 h-4" />
          )}
        </ToolbarButton>
        <ToolbarButton onClick={handleInsertTable} title="Tabelle einfügen">
          <Table className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleInsertCode} title="Code Block">
          <Code className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleBlockquote} title="Zitat">
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleInsertHR} title="Horizontale Linie">
          <Minus className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Undo/Redo */}
        <ToolbarButton onClick={() => execCommand('undo')} title="Rückgängig (Strg+Z)">
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('redo')} title="Wiederholen (Strg+Y)">
          <Redo className="w-4 h-4" />
        </ToolbarButton>

        {/* Upload Hinweis wenn onImageUpload verfügbar */}
        {onImageUpload && (
          <>
            <Divider />
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 px-2">
              <Upload className="w-3 h-3" />
              <span className="hidden sm:inline">Bilder per Drag & Drop</span>
            </div>
          </>
        )}
      </div>

      {/* Editor mit Drag & Drop */}
      <div
        className="relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-blue-500/20 dark:bg-blue-400/20 border-2 border-dashed border-blue-500 dark:border-blue-400 rounded flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-white dark:bg-gray-800 rounded-lg px-6 py-4 shadow-lg flex items-center gap-3">
              <Upload className="w-8 h-8 text-blue-500" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Bild hier ablegen</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">JPG, PNG, GIF, WebP</p>
              </div>
            </div>
          </div>
        )}

        {/* Upload Spinner Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 flex items-center justify-center z-10">
            <div className="bg-white dark:bg-gray-800 rounded-lg px-6 py-4 shadow-lg flex items-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              <span className="text-gray-700 dark:text-gray-300">Bild wird hochgeladen...</span>
            </div>
          </div>
        )}

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => {
            if (editorRef.current) {
              onChange(editorRef.current.innerHTML);
            }
          }}
          onPaste={handlePaste}
          className="min-h-[400px] p-4 focus:outline-none prose prose-sm max-w-none
            dark:text-gray-100 dark:prose-invert
            [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-gray-900 dark:[&_h1]:text-white
            [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-gray-900 dark:[&_h2]:text-white
            [&_h3]:text-xl [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-gray-900 dark:[&_h3]:text-white
            [&_p]:mb-2 [&_p]:text-gray-700 dark:[&_p]:text-gray-300
            [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-2
            [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-2
            [&_li]:mb-1 [&_li]:text-gray-700 dark:[&_li]:text-gray-300
            [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline
            [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 dark:[&_blockquote]:text-gray-400
            [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto
            [&_code]:font-mono [&_code]:text-sm
            [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:shadow-md
            [&_hr]:my-4 [&_hr]:border-gray-300 dark:[&_hr]:border-gray-600
            [&_table]:w-full [&_table]:border-collapse
            [&_th]:border [&_th]:border-gray-300 dark:[&_th]:border-gray-600 [&_th]:px-4 [&_th]:py-2 [&_th]:bg-gray-100 dark:[&_th]:bg-gray-700 [&_th]:text-left
            [&_td]:border [&_td]:border-gray-300 dark:[&_td]:border-gray-600 [&_td]:px-4 [&_td]:py-2
          "
          data-placeholder={placeholder}
          style={{
            minHeight: '400px',
          }}
        />
      </div>

      {/* Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Link einfügen</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  URL
                </label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Anzeigetext (optional)
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Linktext..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowLinkModal(false);
                  setLinkUrl('');
                  setLinkText('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleInsertLink}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Einfügen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WikiEditor;
