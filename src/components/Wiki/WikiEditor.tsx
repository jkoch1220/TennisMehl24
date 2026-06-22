import { useState, useRef, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { buildEditorExtensions } from './editor/extensions';
import EditorToolbar from './editor/EditorToolbar';
import BubbleToolbar from './editor/BubbleToolbar';
import SlashMenu from './editor/SlashMenu';
import { filterSlashCommands, type SlashCommandItem } from './editor/slashCommands';

interface WikiEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  onImageUpload?: (file: File) => Promise<string | null>;
}

// Imperativer Handle, damit das Datei-Panel Bilder an der Cursor-Position einfügen kann
export interface WikiEditorHandle {
  insertImageUrl: (url: string, alt?: string) => void;
}

// Styling der Bearbeitungs-Oberfläche (auf das contenteditable-Element angewendet)
const EDITOR_CLASS = `wiki-editor-content min-h-[440px] px-5 py-4 focus:outline-none
  [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-gray-900 dark:[&_h1]:text-white
  [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-gray-900 dark:[&_h2]:text-white
  [&_h3]:text-xl [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-gray-900 dark:[&_h3]:text-white
  [&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-gray-700 dark:[&_p]:text-gray-200
  [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:my-2
  [&_li]:my-1 [&_li]:text-gray-700 dark:[&_li]:text-gray-200
  [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:ml-1
  [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2
  [&_ul[data-type=taskList]_li_label]:mt-1
  [&_blockquote]:border-l-4 [&_blockquote]:border-red-400 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 dark:[&_blockquote]:text-gray-300 [&_blockquote]:my-3
  [&_blockquote[data-callout]]:not-italic [&_blockquote[data-callout]]:bg-amber-50 dark:[&_blockquote[data-callout]]:bg-amber-900/20 [&_blockquote[data-callout]]:border-amber-400 [&_blockquote[data-callout]]:rounded-r-lg [&_blockquote[data-callout]]:py-2
  [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-3
  [&_code]:font-mono [&_code]:text-sm
  [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:shadow-md [&_img]:my-2
  [&_hr]:my-5 [&_hr]:border-gray-300 dark:[&_hr]:border-slate-600
  [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_table]:table-fixed
  [&_th]:border [&_th]:border-gray-300 dark:[&_th]:border-slate-600 [&_th]:px-3 [&_th]:py-2 [&_th]:bg-gray-100 dark:[&_th]:bg-slate-700 [&_th]:text-left [&_th]:font-semibold
  [&_td]:border [&_td]:border-gray-300 dark:[&_td]:border-slate-600 [&_td]:px-3 [&_td]:py-2
  [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-gray-400 [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:h-0`;

const WikiEditor = forwardRef<WikiEditorHandle, WikiEditorProps>(({
  content,
  onChange,
  placeholder = 'Beginne hier zu schreiben oder tippe „/" für Befehle…',
  onImageUpload,
}, ref) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const onImageUploadRef = useRef(onImageUpload);
  onChangeRef.current = onChange;
  onImageUploadRef.current = onImageUpload;

  const [uploading, setUploading] = useState(false);

  // Slash-Menü-Status
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashRange, setSlashRange] = useState<{ from: number; to: number } | null>(null);
  const [slashPos, setSlashPos] = useState({ x: 0, y: 0 });

  // Link-Modal
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const slashItems = useMemo(() => filterSlashCommands(slashQuery), [slashQuery]);

  // Ref-Spiegel des Slash-Status für den (einmalig registrierten) Keydown-Handler
  const dataRef = useRef<{ open: boolean; items: SlashCommandItem[]; index: number; range: { from: number; to: number } | null }>(
    { open: false, items: [], index: 0, range: null }
  );
  dataRef.current = { open: slashOpen, items: slashItems, index: slashIndex, range: slashRange };

  const closeSlash = useCallback(() => {
    setSlashOpen(false);
    setSlashQuery('');
    setSlashRange(null);
    setSlashIndex(0);
  }, []);

  const triggerImageUpload = useCallback(() => fileInputRef.current?.click(), []);

  const selectSlash = useCallback(
    (item: SlashCommandItem) => {
      const ed = editorRef.current;
      const range = dataRef.current.range;
      if (!ed || !range) return;
      ed.chain().focus().deleteRange(range).run();
      item.run(ed, { triggerImageUpload });
      closeSlash();
    },
    [closeSlash, triggerImageUpload]
  );

  const moveSlash = useCallback((delta: number) => {
    setSlashIndex((i) => {
      const len = dataRef.current.items.length;
      if (len === 0) return 0;
      return (i + delta + len) % len;
    });
  }, []);

  // Slash-Trigger erkennen: „/" am Wortanfang innerhalb eines Text-Blocks
  const detectSlash = useCallback((editor: Editor) => {
    const { selection } = editor.state;
    if (!selection.empty) return closeSlash();

    const $from = selection.$from;
    if ($from.parent.type.name === 'codeBlock') return closeSlash();

    const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '￼');
    const match = /(?:^|\s)\/([\wäöüß]*)$/i.exec(textBefore);
    if (!match) return closeSlash();

    const query = match[1];
    const slashLen = query.length + 1;
    const from = selection.from - slashLen;
    const to = selection.from;

    let coords;
    try {
      coords = editor.view.coordsAtPos(from);
    } catch {
      return closeSlash();
    }

    setSlashRange({ from, to });
    setSlashQuery(query);
    setSlashPos({ x: coords.left, y: coords.bottom + 6 });
    setSlashOpen(true);
    setSlashIndex(0);
  }, [closeSlash]);

  const editor = useEditor({
    extensions: buildEditorExtensions(placeholder),
    content,
    editorProps: {
      // Whitespace zu einzelnen Leerzeichen kollabieren – ProseMirror übergibt den
      // String an classList.add(), das Zeilenumbrüche als ungültige Tokens ablehnt.
      attributes: { class: EDITOR_CLASS.replace(/\s+/g, ' ').trim() },
      handleKeyDown: (_view, event) => {
        const s = dataRef.current;
        if (!s.open || s.items.length === 0) return false;
        if (event.key === 'ArrowDown') {
          moveSlash(1);
          return true;
        }
        if (event.key === 'ArrowUp') {
          moveSlash(-1);
          return true;
        }
        if (event.key === 'Enter') {
          selectSlash(s.items[Math.min(s.index, s.items.length - 1)]);
          return true;
        }
        if (event.key === 'Escape') {
          closeSlash();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const images = items.filter((it) => it.type.startsWith('image/'));
        if (images.length === 0) return false; // normalen (Rich-)Paste zulassen
        event.preventDefault();
        images.forEach((it) => {
          const file = it.getAsFile();
          if (file) void uploadAndInsert(file);
        });
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files || []);
        const images = files.filter((f) => f.type.startsWith('image/'));
        if (images.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({
          left: (event as DragEvent).clientX,
          top: (event as DragEvent).clientY,
        });
        images.forEach((f) => void uploadAndInsert(f, coords?.pos));
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getHTML());
      detectSlash(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      detectSlash(editor);
    },
  });

  editorRef.current = editor;

  // Imperativer Handle: Bild-URL an aktueller Cursor-Position einfügen
  useImperativeHandle(ref, () => ({
    insertImageUrl: (url: string, alt?: string) => {
      editorRef.current?.chain().focus().setImage({ src: url, alt: alt || '' }).run();
    },
  }), []);

  // Bild hochladen und an Position (oder am Cursor) einfügen
  const uploadAndInsert = useCallback(async (file: File, pos?: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    const upload = onImageUploadRef.current;

    const insert = (src: string) => {
      const chain = ed.chain().focus();
      if (typeof pos === 'number') {
        chain.insertContentAt(pos, { type: 'image', attrs: { src, alt: file.name } });
      } else {
        chain.setImage({ src, alt: file.name });
      }
      chain.run();
    };

    setUploading(true);
    try {
      if (upload) {
        const url = await upload(file);
        if (url) {
          insert(url);
          setUploading(false);
          return;
        }
      }
      // Fallback: als Data-URL einbetten (z.B. Seite noch nicht gespeichert)
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) insert(dataUrl);
        setUploading(false);
      };
      reader.onerror = () => setUploading(false);
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Fehler beim Hochladen des Bildes:', err);
      setUploading(false);
    }
  }, []);

  // Externe Inhaltsänderung (Seitenwechsel, Vorlage) in den Editor übernehmen –
  // nur wenn der Inhalt wirklich abweicht, sonst Cursor-Sprünge/Schleifen.
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  // Datei-Auswahl über versteckten Input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach((file) => {
      if (file.type.startsWith('image/')) void uploadAndInsert(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Link setzen/entfernen
  const openLinkModal = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    setLinkUrl(ed.getAttributes('link').href || '');
    setLinkOpen(true);
  }, []);

  const applyLink = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const url = linkUrl.trim();
    if (url) {
      ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    } else {
      ed.chain().focus().extendMarkRange('link').unsetLink().run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  };

  if (!editor) {
    return (
      <div className="min-h-[440px] flex items-center justify-center bg-white dark:bg-slate-800">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-red-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative bg-white dark:bg-slate-800">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <EditorToolbar
        editor={editor}
        onImageClick={triggerImageUpload}
        onLinkClick={openLinkModal}
        uploading={uploading}
      />

      <BubbleToolbar editor={editor} onLinkClick={openLinkModal} />

      <EditorContent editor={editor} />

      {/* Slash-Menü */}
      {slashOpen && (
        <SlashMenu
          items={slashItems}
          activeIndex={slashIndex}
          position={slashPos}
          onSelect={selectSlash}
          onHover={setSlashIndex}
        />
      )}

      {/* Upload-Overlay */}
      {uploading && (
        <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 flex items-center justify-center z-20 pointer-events-none">
          <div className="bg-white dark:bg-slate-800 rounded-lg px-4 py-2 shadow-lg flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-500 border-t-transparent" />
            Bild wird hochgeladen…
          </div>
        </div>
      )}

      {/* Link-Modal */}
      {linkOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[130] p-4"
          onClick={() => setLinkOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-3 text-gray-900 dark:text-white">Link</h3>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
              }}
              placeholder="https://…  (leer lassen zum Entfernen)"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setLinkOpen(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
              >
                Abbrechen
              </button>
              <button
                onClick={applyLink}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Übernehmen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

WikiEditor.displayName = 'WikiEditor';

export default WikiEditor;
