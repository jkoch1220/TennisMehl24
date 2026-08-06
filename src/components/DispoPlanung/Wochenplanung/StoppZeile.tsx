import { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, GripVertical } from 'lucide-react';
import type { TourStop } from '../../../types/tour';
import { STOP_MARKIERUNGEN } from '../../../types/tour';

interface StoppZeileProps {
  stop: TourStop;
  tourId: string;
  platzbauer?: string;
  dunkel: boolean;
  onTonnenAendern: (tonnen: number) => void;
  onNotizAendern: (notiz: string) => void;
  /** Öffnet das Farbmenü am Mauszeiger. */
  onFarbMenue: (position: { x: number; y: number }) => void;
  onEntfernen: () => void;
}

/**
 * Verhindert, dass ein Klick in ein Eingabefeld als Ziehen interpretiert wird.
 * Ohne das greift der PointerSensor die ganze Zeile, sobald man ins Feld klickt.
 */
const nichtZiehen = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

/** Zahlenfeld, das erst beim Verlassen oder mit Enter speichert. */
const TonnenFeld = ({ wert, onAendern }: { wert: number; onAendern: (n: number) => void }) => {
  const [text, setText] = useState(String(wert).replace('.', ','));
  const istFokussiert = useRef(false);

  useEffect(() => {
    if (!istFokussiert.current) setText(String(wert).replace('.', ','));
  }, [wert]);

  const uebernehmen = () => {
    const zahl = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(zahl) && zahl >= 0 && zahl !== wert) onAendern(zahl);
    else setText(String(wert).replace('.', ','));
  };

  return (
    <input
      {...nichtZiehen}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => {
        istFokussiert.current = true;
        e.target.select();
      }}
      onBlur={() => {
        istFokussiert.current = false;
        uebernehmen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(String(wert).replace('.', ','));
          e.currentTarget.blur();
        }
      }}
      className="w-14 px-1 py-0.5 text-right text-xs font-semibold rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none"
      title="Tonnage anpassen"
    />
  );
};

/** Textfeld, das erst beim Verlassen speichert. */
const NotizFeld = ({
  wert,
  onAendern,
  platzhalter,
}: {
  wert: string;
  onAendern: (s: string) => void;
  platzhalter: string;
}) => {
  const [text, setText] = useState(wert);
  const istFokussiert = useRef(false);

  useEffect(() => {
    if (!istFokussiert.current) setText(wert);
  }, [wert]);

  return (
    <input
      {...nichtZiehen}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        istFokussiert.current = true;
      }}
      onBlur={() => {
        istFokussiert.current = false;
        if (text !== wert) onAendern(text);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(wert);
          e.currentTarget.blur();
        }
      }}
      placeholder={platzhalter}
      className="w-full px-1.5 py-0.5 text-xs rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 bg-transparent text-gray-700 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-slate-600 focus:outline-none"
    />
  );
};

const StoppZeile = ({
  stop,
  tourId,
  platzbauer,
  dunkel,
  onTonnenAendern,
  onNotizAendern,
  onFarbMenue,
  onEntfernen,
}: StoppZeileProps) => {
  // Die GANZE Zeile ist der Ziehgriff — Eingabefelder klinken sich per
  // stopPropagation aus, damit Tippen nicht als Ziehen gilt.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `stop:${tourId}:${stop.projektId}`,
    data: { type: 'stop', tourId, projektId: stop.projektId, stop },
  });

  const markierung = stop.markierung ? STOP_MARKIERUNGEN[stop.markierung] : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onContextMenu={(e) => {
        e.preventDefault();
        onFarbMenue({ x: e.clientX, y: e.clientY });
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'background-color 150ms ease, color 150ms ease',
        ...(markierung
          ? {
              backgroundColor: dunkel ? markierung.dunkel : markierung.hell,
              color: dunkel ? '#F1F5F9' : markierung.text,
            }
          : {}),
      }}
      className={`group relative flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded cursor-grab active:cursor-grabbing touch-none ${
        isDragging ? 'opacity-40 shadow-lg z-10' : ''
      } ${markierung ? '' : 'hover:bg-gray-50 dark:hover:bg-slate-700/40'}`}
      title="Rechtsklick färbt die Zeile"
    >
      <GripVertical className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-40" />

      <span className="w-32 shrink-0 truncate text-xs font-medium" title={stop.kundenname}>
        {stop.kundenname}
      </span>

      <span className="w-11 shrink-0 text-[11px] opacity-70 tabular-nums">
        {stop.adresse?.plz}
      </span>

      <div className="shrink-0 flex items-baseline">
        <TonnenFeld wert={stop.tonnen} onAendern={onTonnenAendern} />
        <span className="text-[10px] opacity-60">t</span>
      </div>

      <div className="flex-1 min-w-0">
        <NotizFeld
          wert={stop.notiz ?? ''}
          onAendern={onNotizAendern}
          platzhalter="Notiz…"
        />
      </div>

      {platzbauer && (
        <span
          className="w-20 shrink-0 truncate text-[10px] opacity-60 text-right"
          title={platzbauer}
        >
          {platzbauer}
        </span>
      )}

      <button
        {...nichtZiehen}
        onClick={onEntfernen}
        className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-black/10"
        title="Aus der Tour nehmen"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

export default StoppZeile;
