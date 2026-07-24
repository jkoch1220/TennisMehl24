import { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  FileText,
  Package,
  Split,
  Trash2,
  Workflow,
  Wrench,
  X,
} from 'lucide-react';
import { MindmapNode } from '../../types/mindmap';
import AutoGrowTextarea from './AutoGrowTextarea';

interface SchrittModalProps {
  node: MindmapNode;
  // Titel des Eltern-Knotens (Kontext im Modal-Kopf), leer beim Hauptknoten
  parentTitel: string;
  istProzess: boolean;
  onPatch: (
    fields: Partial<
      Pick<MindmapNode, 'titel' | 'beschreibung' | 'werkzeuge' | 'materialien'>
    >
  ) => void;
  onDelete: () => void;
  onClose: () => void;
  // Nur für Unterprozess-Verweise: das verlinkte Board öffnen
  onOpenLinkedBoard?: () => void;
}

const typInfo = (node: MindmapNode, istProzess: boolean) => {
  if (node.type === 'prozess') {
    return {
      icon: Workflow,
      label: 'Unterprozess',
      iconKlasse: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
    };
  }
  if (node.type === 'entscheidung') {
    return {
      icon: Split,
      label: 'Entscheidung',
      iconKlasse: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
    };
  }
  if (node.parentId === null) {
    return {
      icon: Workflow,
      label: istProzess ? 'Hauptprozess' : 'Hauptknoten',
      iconKlasse: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
    };
  }
  return {
    icon: FileText,
    label: istProzess ? 'Prozessschritt' : 'Knoten',
    iconKlasse: 'bg-gray-100 text-gray-600 dark:bg-dark-elevated dark:text-dark-textMuted',
  };
};

/**
 * Detail-Popup für Prozessschritte, Entscheidungen und Unterprozesse — wie das
 * Task-Modal: Beschreibung plus benötigte Werkzeuge (blau) und Materialien
 * (gelb), die als Blasen an der Karte erscheinen. Änderungen werden live in den
 * State übernommen (Persistenz debounced im Mindmap-Container).
 */
const SchrittModal = ({
  node,
  parentTitel,
  istProzess,
  onPatch,
  onDelete,
  onClose,
  onOpenLinkedBoard,
}: SchrittModalProps) => {
  const [titelDraft, setTitelDraft] = useState(node.titel);
  const titelRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitelDraft(node.titel);
  }, [node.id, node.titel]);

  const commitTitel = () => {
    const titel = titelDraft.trim();
    if (titel && titel !== node.titel) onPatch({ titel });
    else setTitelDraft(node.titel);
  };

  // Beim Schließen (Backdrop, X, Escape) offene Titel-Änderung mitspeichern
  const handleCloseRef = useRef(() => {});
  handleCloseRef.current = () => {
    commitTitel();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const info = typInfo(node, istProzess);
  const TypIcon = info.icon;
  const istRoot = node.parentId === null;

  const inputClasses =
    'w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 dark:text-dark-text';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => handleCloseRef.current()}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-dark-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kopf */}
        <div className="flex items-start gap-3 border-b border-gray-100 p-5 dark:border-dark-border">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${info.iconKlasse}`}
          >
            <TypIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 dark:text-dark-textSubtle">
              {info.label}
              {parentTitel && ` in „${parentTitel}"`}
            </p>
            <AutoGrowTextarea
              ref={titelRef}
              value={titelDraft}
              onChange={(e) => setTitelDraft(e.target.value)}
              onBlur={commitTitel}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitTitel();
                  titelRef.current?.blur();
                }
              }}
              placeholder="Titel"
              className="w-full border-0 bg-transparent p-0 text-lg font-bold text-gray-900 focus:outline-none focus:ring-0 dark:text-dark-text"
            />
          </div>
          {onOpenLinkedBoard && (
            <button
              onClick={onOpenLinkedBoard}
              title="Unterprozess-Board öffnen"
              className="rounded-lg p-1.5 text-orange-500 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-900/30"
            >
              <ExternalLink className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={onClose}
            title="Schließen"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-surfaceHover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Felder */}
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-dark-textMuted">
              Beschreibung
            </label>
            <AutoGrowTextarea
              value={node.beschreibung ?? ''}
              onChange={(e) => onPatch({ beschreibung: e.target.value })}
              placeholder="Worum geht es bei diesem Schritt? Was ist zu beachten?"
              className={`${inputClasses} min-h-24 max-h-[40vh] overflow-y-auto border-gray-300 bg-white focus:ring-red-500 dark:border-dark-border dark:bg-dark-input`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                <Wrench className="h-3.5 w-3.5" />
                Werkzeuge
              </label>
              <AutoGrowTextarea
                value={node.werkzeuge ?? ''}
                onChange={(e) => onPatch({ werkzeuge: e.target.value })}
                placeholder={'Ein Werkzeug pro Zeile…'}
                className={`${inputClasses} min-h-20 max-h-[30vh] overflow-y-auto border-blue-200 bg-blue-50/50 focus:ring-blue-500 dark:border-blue-800 dark:bg-blue-900/20`}
              />
              <p className="mt-1 text-[11px] text-gray-400 dark:text-dark-textSubtle">
                Erscheint als blaue Blase links am Schritt
              </p>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Package className="h-3.5 w-3.5" />
                Material
              </label>
              <AutoGrowTextarea
                value={node.materialien ?? ''}
                onChange={(e) => onPatch({ materialien: e.target.value })}
                placeholder={'Ein Material pro Zeile…'}
                className={`${inputClasses} min-h-20 max-h-[30vh] overflow-y-auto border-amber-300 bg-amber-50 focus:ring-amber-500 dark:border-amber-800 dark:bg-amber-900/20`}
              />
              <p className="mt-1 text-[11px] text-gray-400 dark:text-dark-textSubtle">
                Erscheint als gelbe Blase rechts am Schritt
              </p>
            </div>
          </div>
        </div>

        {/* Fußzeile */}
        {!istRoot && (
          <div className="flex items-center justify-end border-t border-gray-100 p-5 dark:border-dark-border">
            <button
              onClick={onDelete}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-dark-accentRed dark:hover:bg-red-900/30"
            >
              <Trash2 className="h-4 w-4" />
              {info.label} löschen
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchrittModal;
