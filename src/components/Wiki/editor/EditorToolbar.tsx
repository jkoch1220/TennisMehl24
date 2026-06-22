import { Editor, useEditorState } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Code,
  Quote,
  Minus,
  Undo,
  Redo,
  Loader2,
} from 'lucide-react';

interface EditorToolbarProps {
  editor: Editor;
  onImageClick: () => void;
  onLinkClick: () => void;
  uploading: boolean;
}

const EditorToolbar = ({ editor, onImageClick, onLinkClick, uploading }: EditorToolbarProps) => {
  // Reaktive aktive Zustände (Toolbar liegt außerhalb von EditorContent)
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      alignLeft: e.isActive({ textAlign: 'left' }),
      alignCenter: e.isActive({ textAlign: 'center' }),
      alignRight: e.isActive({ textAlign: 'right' }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const Btn = ({
    onClick,
    active = false,
    disabled = false,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`p-2 rounded transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-gray-400'
          : active
            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
      }`}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="w-px h-6 bg-gray-300 dark:bg-slate-600 mx-1" />;

  return (
    <div className="bg-gray-50 dark:bg-slate-900 border-b border-gray-300 dark:border-slate-700 p-2 flex flex-wrap items-center gap-0.5">
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={state.bold} title="Fett (Strg+B)">
        <Bold className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={state.italic} title="Kursiv (Strg+I)">
        <Italic className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={state.underline} title="Unterstrichen (Strg+U)">
        <Underline className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={state.strike} title="Durchgestrichen">
        <Strikethrough className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleHighlight().run()} active={state.highlight} title="Hervorheben">
        <Highlighter className="w-4 h-4" />
      </Btn>

      <Divider />

      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={state.h1} title="Überschrift 1">
        <Heading1 className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={state.h2} title="Überschrift 2">
        <Heading2 className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={state.h3} title="Überschrift 3">
        <Heading3 className="w-4 h-4" />
      </Btn>

      <Divider />

      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={state.bulletList} title="Aufzählung">
        <List className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={state.orderedList} title="Nummerierte Liste">
        <ListOrdered className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleTaskList().run()} active={state.taskList} title="Aufgabenliste">
        <ListChecks className="w-4 h-4" />
      </Btn>

      <Divider />

      <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={state.alignLeft} title="Links">
        <AlignLeft className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={state.alignCenter} title="Zentrieren">
        <AlignCenter className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={state.alignRight} title="Rechts">
        <AlignRight className="w-4 h-4" />
      </Btn>

      <Divider />

      <Btn onClick={onLinkClick} active={state.link} title="Link einfügen">
        <LinkIcon className="w-4 h-4" />
      </Btn>
      <Btn onClick={onImageClick} disabled={uploading} title="Bild hochladen">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
      </Btn>
      <Btn
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Tabelle einfügen"
      >
        <TableIcon className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={state.codeBlock} title="Code-Block">
        <Code className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={state.blockquote} title="Zitat">
        <Quote className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Trennlinie">
        <Minus className="w-4 h-4" />
      </Btn>

      <Divider />

      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!state.canUndo} title="Rückgängig (Strg+Z)">
        <Undo className="w-4 h-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!state.canRedo} title="Wiederholen (Strg+Y)">
        <Redo className="w-4 h-4" />
      </Btn>
    </div>
  );
};

export default EditorToolbar;
