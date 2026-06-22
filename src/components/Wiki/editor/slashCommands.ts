import type { Editor } from '@tiptap/react';
import {
  Heading1,
  Heading2,
  Heading3,
  Text,
  List,
  ListOrdered,
  ListChecks,
  Table as TableIcon,
  Code,
  Quote,
  Minus,
  Image as ImageIcon,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';

export interface SlashCommandHelpers {
  triggerImageUpload: () => void;
}

export interface SlashCommandItem {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  // chain wird bereits mit deleteRange + focus vorbereitet übergeben
  run: (editor: Editor, helpers: SlashCommandHelpers) => void;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'paragraph',
    title: 'Text',
    description: 'Normaler Fließtext',
    icon: Text,
    keywords: ['text', 'absatz', 'paragraph', 'normal'],
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    id: 'h1',
    title: 'Überschrift 1',
    description: 'Große Abschnittsüberschrift',
    icon: Heading1,
    keywords: ['h1', 'überschrift', 'titel', 'heading'],
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    title: 'Überschrift 2',
    description: 'Mittlere Abschnittsüberschrift',
    icon: Heading2,
    keywords: ['h2', 'überschrift', 'heading'],
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    title: 'Überschrift 3',
    description: 'Kleine Abschnittsüberschrift',
    icon: Heading3,
    keywords: ['h3', 'überschrift', 'heading'],
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'bulletList',
    title: 'Aufzählung',
    description: 'Einfache Liste mit Punkten',
    icon: List,
    keywords: ['liste', 'aufzählung', 'bullet', 'ul'],
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    title: 'Nummerierte Liste',
    description: 'Liste mit Nummerierung',
    icon: ListOrdered,
    keywords: ['nummeriert', 'liste', 'ordered', 'ol', 'zahlen'],
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'taskList',
    title: 'Aufgabenliste',
    description: 'Checkliste mit Häkchen',
    icon: ListChecks,
    keywords: ['aufgabe', 'todo', 'checkliste', 'task', 'haken'],
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'table',
    title: 'Tabelle',
    description: '3×3-Tabelle mit Kopfzeile',
    icon: TableIcon,
    keywords: ['tabelle', 'table', 'raster'],
    run: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'codeBlock',
    title: 'Code',
    description: 'Codeblock mit Monospace',
    icon: Code,
    keywords: ['code', 'pre', 'monospace'],
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'blockquote',
    title: 'Zitat',
    description: 'Hervorgehobenes Zitat',
    icon: Quote,
    keywords: ['zitat', 'quote', 'blockquote'],
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'callout',
    title: 'Hinweis-Box',
    description: 'Auffällige Info-Box',
    icon: Lightbulb,
    keywords: ['hinweis', 'callout', 'info', 'box', 'achtung'],
    run: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent(
          '<blockquote data-callout="true"><p>💡 Hinweis: </p></blockquote>'
        )
        .run(),
  },
  {
    id: 'hr',
    title: 'Trennlinie',
    description: 'Horizontale Trennlinie',
    icon: Minus,
    keywords: ['trennlinie', 'hr', 'linie', 'divider'],
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    id: 'image',
    title: 'Bild',
    description: 'Bild hochladen und einfügen',
    icon: ImageIcon,
    keywords: ['bild', 'image', 'foto', 'grafik', 'upload'],
    run: (_editor, helpers) => helpers.triggerImageUpload(),
  },
];

// Filtert Befehle nach Suchbegriff (Titel + Keywords)
export const filterSlashCommands = (query: string): SlashCommandItem[] => {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(q) ||
      cmd.keywords.some((k) => k.includes(q))
  );
};
