import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Undo,
  Redo,
  Code,
  EyeOff,
  Upload,
  Loader2,
} from 'lucide-react';
import { ladebildHoch } from '../../services/bildUploadService';

// Platzhalter-Konfiguration
const PLATZHALTER = [
  { key: '{dokumentNummer}', label: 'Dok-Nr', beschreibung: 'Dokumentnummer' },
  { key: '{kundenname}', label: 'Kunde', beschreibung: 'Kundenname' },
  { key: '{kundennummer}', label: 'Kd-Nr', beschreibung: 'Kundennummer' },
  { key: '{datum}', label: 'Datum', beschreibung: 'Aktuelles Datum' },
];

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  showPlaceholderButtons?: boolean;
  minHeight?: string;
  editable?: boolean;
  className?: string;
}

// Toolbar Button Komponente
const ToolbarButton = ({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-1.5 rounded transition-colors ${
      active
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {children}
  </button>
);

// Toolbar Separator
const ToolbarSeparator = () => (
  <div className="w-px h-6 bg-gray-300 dark:bg-slate-600 mx-1" />
);

// Editor Toolbar
const EditorToolbar = ({
  editor,
  showPlaceholderButtons,
  showHtmlView,
  onToggleHtmlView,
}: {
  editor: Editor | null;
  showPlaceholderButtons?: boolean;
  showHtmlView: boolean;
  onToggleHtmlView: () => void;
}) => {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const setLink = () => {
    if (linkUrl) {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: linkUrl })
        .run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  const addImage = () => {
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
    }
    setShowImageInput(false);
    setImageUrl('');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const url = await ladebildHoch(file);
      editor.chain().focus().setImage({ src: url }).run();
      setShowImageInput(false);
    } catch (error) {
      console.error('Bild-Upload fehlgeschlagen:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload fehlgeschlagen');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const insertPlatzhalter = (platzhalter: string) => {
    editor.chain().focus().insertContent(platzhalter).run();
  };

  return (
    <div className="border-b border-gray-200 dark:border-slate-700 p-2 flex flex-wrap items-center gap-1 bg-gray-50 dark:bg-slate-800 rounded-t-lg">
      {/* Formatierung */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Fett (Strg+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Kursiv (Strg+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Unterstrichen (Strg+U)"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Link */}
      <div className="relative">
        <ToolbarButton
          onClick={() => setShowLinkInput(!showLinkInput)}
          active={editor.isActive('link')}
          title="Link einfügen"
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>

        {showLinkInput && (
          <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-10 flex gap-2">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded w-48 dark:bg-slate-700"
              onKeyDown={(e) => e.key === 'Enter' && setLink()}
            />
            <button
              onClick={setLink}
              className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        )}
      </div>

      {/* Bild */}
      <div className="relative">
        <ToolbarButton
          onClick={() => setShowImageInput(!showImageInput)}
          title="Bild einfügen"
        >
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>

        {/* Versteckter File-Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          onChange={handleImageUpload}
          className="hidden"
        />

        {showImageInput && (
          <div className="absolute top-full left-0 mt-1 p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-10 min-w-[280px]">
            {/* Upload-Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full mb-2 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wird hochgeladen...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Bild hochladen
                </>
              )}
            </button>

            {/* Fehleranzeige */}
            {uploadError && (
              <div className="mb-2 p-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded">
                {uploadError}
              </div>
            )}

            {/* Trennlinie */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-px bg-gray-300 dark:bg-slate-600" />
              <span className="text-xs text-gray-500 dark:text-gray-400">oder URL eingeben</span>
              <div className="flex-1 h-px bg-gray-300 dark:bg-slate-600" />
            </div>

            {/* URL-Eingabe */}
            <div className="flex gap-2">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded dark:bg-slate-700"
                onKeyDown={(e) => e.key === 'Enter' && addImage()}
              />
              <button
                onClick={addImage}
                className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>

      <ToolbarSeparator />

      {/* Ausrichtung */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        active={editor.isActive({ textAlign: 'left' })}
        title="Linksbündig"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        active={editor.isActive({ textAlign: 'center' })}
        title="Zentriert"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        active={editor.isActive({ textAlign: 'right' })}
        title="Rechtsbündig"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Listen */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Aufzählung"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Nummerierte Liste"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Rückgängig (Strg+Z)"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Wiederholen (Strg+Y)"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* HTML-Ansicht */}
      <ToolbarButton
        onClick={onToggleHtmlView}
        active={showHtmlView}
        title="HTML-Quelltext anzeigen"
      >
        {showHtmlView ? <EyeOff className="h-4 w-4" /> : <Code className="h-4 w-4" />}
      </ToolbarButton>

      {/* Platzhalter-Buttons */}
      {showPlaceholderButtons && (
        <>
          <ToolbarSeparator />
          <div className="flex gap-1 flex-wrap">
            {PLATZHALTER.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => insertPlatzhalter(p.key)}
                title={p.beschreibung}
                className="px-2 py-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors font-mono"
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Haupt-Komponente
const TipTapEditor = ({
  content,
  onChange,
  placeholder = 'Schreiben Sie hier...',
  showPlaceholderButtons = false,
  minHeight = '200px',
  editable = true,
  className = '',
}: TipTapEditorProps) => {
  const [showHtmlView, setShowHtmlView] = useState(false);
  const [htmlSource, setHtmlSource] = useState('');
  const isInitialMount = useRef(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // Keine Überschriften in E-Mails
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      Image.configure({
        inline: true,
        HTMLAttributes: {
          style: 'max-width: 100%; height: auto;',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ['paragraph'],
      }),
      Underline,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      setHtmlSource(html);
    },
  });

  // Content aktualisieren wenn sich der prop ändert
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      // Nur beim initialen Laden oder wenn sich content extern ändert
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }
      editor.commands.setContent(content);
      setHtmlSource(content);
    }
  }, [content, editor]);

  // Initial HTML setzen
  useEffect(() => {
    setHtmlSource(content);
  }, []);

  const handleHtmlSourceChange = useCallback(
    (newHtml: string) => {
      setHtmlSource(newHtml);
      if (editor) {
        editor.commands.setContent(newHtml);
        onChange(newHtml);
      }
    },
    [editor, onChange]
  );

  return (
    <div className={`border border-gray-300 dark:border-slate-700 rounded-lg overflow-hidden ${className}`}>
      <EditorToolbar
        editor={editor}
        showPlaceholderButtons={showPlaceholderButtons}
        showHtmlView={showHtmlView}
        onToggleHtmlView={() => setShowHtmlView(!showHtmlView)}
      />

      {showHtmlView ? (
        <textarea
          value={htmlSource}
          onChange={(e) => handleHtmlSourceChange(e.target.value)}
          className="w-full p-4 font-mono text-sm bg-gray-900 text-green-400 dark:bg-slate-900"
          style={{ minHeight }}
        />
      ) : (
        <EditorContent
          editor={editor}
          className="prose prose-sm dark:prose-invert max-w-none p-4 focus:outline-none"
          style={{ minHeight }}
        />
      )}

      <style>{`
        .ProseMirror {
          min-height: ${minHeight};
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror p {
          margin: 0.5em 0;
        }
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          margin: 0.5em 0;
        }
        .dark .ProseMirror {
          color: #e2e8f0;
        }
      `}</style>
    </div>
  );
};

export default TipTapEditor;
