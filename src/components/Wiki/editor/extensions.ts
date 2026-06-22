import type { Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

/**
 * Baut die TipTap-Extensions für den Wiki-Editor.
 *
 * Hinweis: StarterKit v3 enthält bereits Link und Underline – diese werden hier
 * über die StarterKit-Optionen konfiguriert und NICHT separat geladen
 * (sonst Duplikat-Warnungen). Table/TaskList/Highlight sind zusätzlich nötig,
 * u.a. damit bestehende HTML-Inhalte (Tabellen aus Vorlagen) erhalten bleiben.
 */
export const buildEditorExtensions = (placeholder: string): Extensions => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: {
        class: 'text-red-600 dark:text-red-400 underline cursor-pointer',
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    },
    codeBlock: {
      HTMLAttributes: {
        class: 'bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-2 font-mono text-sm',
      },
    },
  }),
  Image.configure({
    allowBase64: true,
    HTMLAttributes: { class: 'max-w-full h-auto rounded-lg shadow-md my-2' },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({
    HTMLAttributes: { class: 'bg-yellow-200 dark:bg-yellow-500/40 rounded px-0.5' },
  }),
  Table.configure({ resizable: true, HTMLAttributes: { class: 'wiki-table' } }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList.configure({ HTMLAttributes: { class: 'wiki-task-list' } }),
  TaskItem.configure({ nested: true }),
  Placeholder.configure({
    placeholder,
    emptyEditorClass: 'is-editor-empty',
  }),
];
