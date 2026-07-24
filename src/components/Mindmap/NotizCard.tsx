import { useEffect, useRef, useState } from 'react';
import { Link2, StickyNote, Trash2 } from 'lucide-react';
import AutoGrowTextarea from './AutoGrowTextarea';
import { MindmapNode } from '../../types/mindmap';
import { LayoutPos, NOTIZ_WIDTH } from './mindmapUtils';

interface NotizCardProps {
  notiz: MindmapNode;
  pos: LayoutPos;
  isEditing: boolean;
  isDragging: boolean;
  // Diese Notiz ist gerade Quelle im Verbinden-Modus
  isConnectSource?: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onChangeTitel: (titel: string) => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  // Verbinden-Modus starten: nächster Klick auf Schritt/Task setzt das Ziel
  onStartConnect: () => void;
  onDelete: () => void;
}

/**
 * Notiz-Blase: frei verschiebbarer Zettel auf der Zeichenfläche, wahlweise
 * seitlich mit einem Knoten/Schritt verbunden. Doppelklick = bearbeiten,
 * Blur/Enter = speichern, Ziehen = verschieben.
 */
const NotizCard = ({
  notiz,
  pos,
  isEditing,
  isDragging,
  isConnectSource,
  onPointerDown,
  onChangeTitel,
  onStartEdit,
  onStopEdit,
  onStartConnect,
  onDelete,
}: NotizCardProps) => {
  const [draft, setDraft] = useState(notiz.titel);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(notiz.titel);
      textRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const commit = () => {
    const titel = draft.trim();
    if (titel && titel !== notiz.titel) {
      onChangeTitel(titel);
    }
    onStopEdit();
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onStartEdit}
      title={isEditing ? undefined : 'Doppelklick: bearbeiten · Ziehen: verschieben'}
      className={`group absolute select-none rounded-lg border border-gray-300 bg-white/95 p-2 shadow-md transition-[left,top] duration-200 dark:border-dark-border dark:bg-dark-surface ${
        isDragging
          ? 'z-10 cursor-grabbing shadow-2xl ring-2 ring-gray-400'
          : 'cursor-grab'
      } ${isConnectSource ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}
      style={{ left: pos.x, top: pos.y, width: NOTIZ_WIDTH }}
    >
      <div className="flex items-start gap-1.5">
        <StickyNote className="mt-px h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-dark-textMuted" />
        {isEditing ? (
          <AutoGrowTextarea
            ref={textRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Escape') onStopEdit();
            }}
            placeholder="Notiz…"
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-[13px] leading-[18px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:border-dark-border dark:bg-dark-input dark:text-dark-text"
          />
        ) : (
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-gray-800 dark:text-dark-text">
            {notiz.titel}
          </span>
        )}
        <button
          onClick={onStartConnect}
          title="Mit Schritt oder Task verbinden (danach Ziel anklicken)"
          className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100 dark:hover:bg-blue-900/30"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          title="Notiz löschen"
          className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default NotizCard;
