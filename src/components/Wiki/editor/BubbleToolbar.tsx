import { Editor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Underline, Strikethrough, Highlighter, Link as LinkIcon } from 'lucide-react';

interface BubbleToolbarProps {
  editor: Editor;
  onLinkClick: () => void;
}

const BubbleToolbar = ({ editor, onLinkClick }: BubbleToolbarProps) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
    }),
  });

  const Btn = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-red-500 text-white'
          : 'text-gray-200 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, from, to }) => {
        // Nur bei echter Textauswahl zeigen (nicht in Codeblöcken)
        if (from === to) return false;
        if (e.isActive('codeBlock')) return false;
        return e.isEditable;
      }}
    >
      <div className="flex items-center gap-0.5 bg-slate-800 dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-700 p-1">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={state.bold} title="Fett">
          <Bold className="w-4 h-4" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={state.italic} title="Kursiv">
          <Italic className="w-4 h-4" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={state.underline} title="Unterstrichen">
          <Underline className="w-4 h-4" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={state.strike} title="Durchgestrichen">
          <Strikethrough className="w-4 h-4" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleHighlight().run()} active={state.highlight} title="Hervorheben">
          <Highlighter className="w-4 h-4" />
        </Btn>
        <div className="w-px h-5 bg-slate-600 mx-0.5" />
        <Btn onClick={onLinkClick} active={state.link} title="Link">
          <LinkIcon className="w-4 h-4" />
        </Btn>
      </div>
    </BubbleMenu>
  );
};

export default BubbleToolbar;
