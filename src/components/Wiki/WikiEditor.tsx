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
} from 'lucide-react';

interface WikiEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

const WikiEditor = ({ content, onChange, placeholder = 'Beginne hier zu schreiben...' }: WikiEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const savedSelectionRef = useRef<Range | null>(null);

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

  // Toolbar Button Komponente
  const ToolbarButton = ({ 
    onClick, 
    title, 
    children, 
    active = false 
  }: { 
    onClick: () => void; 
    title: string; 
    children: React.ReactNode;
    active?: boolean;
  }) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      onMouseDown={(e) => e.preventDefault()}
      title={title}
      className={`p-2 rounded hover:bg-gray-200 transition-colors ${
        active ? 'bg-gray-200 text-blue-600' : 'text-gray-700'
      }`}
    >
      {children}
    </button>
  );

  // Toolbar Trennlinie
  const Divider = () => <div className="w-px h-6 bg-gray-300 mx-1" />;

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

  // Bild URL einfügen
  const handleInsertImage = () => {
    const url = prompt('Bild-URL eingeben:');
    if (url) {
      const imgHtml = `<img src="${url}" alt="Bild" class="max-w-full h-auto rounded-lg my-2" />`;
      document.execCommand('insertHTML', false, imgHtml);
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
    }
  };

  // Horizontale Linie
  const handleInsertHR = () => {
    document.execCommand('insertHTML', false, '<hr class="my-4 border-gray-300" />');
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
    const quoteHtml = `<blockquote class="border-l-4 border-blue-500 pl-4 italic text-gray-600 my-2">${text || 'Zitat'}</blockquote>`;
    document.execCommand('insertHTML', false, quoteHtml);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Highlight
  const handleHighlight = () => {
    execCommand('hiliteColor', '#fef08a');
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-300 p-2 flex flex-wrap items-center gap-1">
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
        <ToolbarButton onClick={handleInsertImage} title="Bild einfügen">
          <Image className="w-4 h-4" />
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
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
          }
        }}
        className="min-h-[400px] p-4 focus:outline-none prose prose-sm max-w-none
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
        "
        data-placeholder={placeholder}
        style={{
          minHeight: '400px',
        }}
      />

      {/* Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Link einfügen</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL
                </label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Anzeigetext (optional)
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Linktext..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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


