import { useState, useEffect, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical, Trash2, AlertTriangle } from 'lucide-react';
import type { Tour, TourFahrzeugTyp } from '../../../types/tour';
import { STANDARD_KAPAZITAETEN } from '../../../types/tour';
import StoppZeile from './StoppZeile';
import { berechneAuslastung, formatTonnen } from './wochenplanungUtils';

interface TourBlockProps {
  tour: Tour;
  dunkel: boolean;
  /** Namensvorschläge für das Fahrerfeld (aus den Stammdaten, nicht bindend). */
  fahrerVorschlaege: string[];
  /** projektId -> Platzbauer-Name, für die rechte Spalte der Zeile. */
  platzbauerJeProjekt: Map<string, string>;
  onTourAendern: (aenderung: {
    fahrerName?: string;
    lkwTyp?: TourFahrzeugTyp;
    kilometer?: number;
    notiz?: string;
  }) => void;
  onTourLoeschen: () => void;
  onStopTonnen: (projektId: string, tonnen: number) => void;
  onStopNotiz: (projektId: string, notiz: string) => void;
  /** Öffnet das Farbmenü für einen einzelnen Stopp. */
  onStopFarbMenue: (projektId: string, position: { x: number; y: number }) => void;
  /** Öffnet das Farbmenü für die ganze Tour. */
  onTourFarbMenue: (position: { x: number; y: number }) => void;
  onStopEntfernen: (projektId: string) => void;
}

const nichtZiehen = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

const LKW_OPTIONEN: { wert: TourFahrzeugTyp; label: string; kapazitaet: number }[] = [
  { wert: 'motorwagen', label: 'Motor', kapazitaet: STANDARD_KAPAZITAETEN.motorwagen },
  {
    wert: 'mit_haenger',
    label: 'Zug',
    kapazitaet: STANDARD_KAPAZITAETEN.motorwagen + STANDARD_KAPAZITAETEN.haenger,
  },
  { wert: 'spedition', label: 'Spedition', kapazitaet: STANDARD_KAPAZITAETEN.spedition },
];

/** Einzeiliges Textfeld, das beim Verlassen speichert. */
const TextFeld = ({
  wert,
  onAendern,
  platzhalter,
  className,
  liste,
}: {
  wert: string;
  onAendern: (s: string) => void;
  platzhalter: string;
  className: string;
  liste?: string;
}) => {
  const [text, setText] = useState(wert);
  const fokus = useRef(false);

  useEffect(() => {
    if (!fokus.current) setText(wert);
  }, [wert]);

  return (
    <input
      {...nichtZiehen}
      list={liste}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        fokus.current = true;
      }}
      onBlur={() => {
        fokus.current = false;
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
      className={className}
    />
  );
};

const TourBlock = ({
  tour,
  dunkel,
  fahrerVorschlaege,
  platzbauerJeProjekt,
  onTourAendern,
  onTourLoeschen,
  onStopTonnen,
  onStopNotiz,
  onStopFarbMenue,
  onTourFarbMenue,
  onStopEntfernen,
}: TourBlockProps) => {
  const auslastung = berechneAuslastung(tour);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `tour:${tour.id}`,
    data: { type: 'tour', tour },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `tourziel:${tour.id}`,
    data: { type: 'tourziel', tour },
  });

  const kmListe = `fahrer-${tour.id}`;

  return (
    <div
      ref={setDropRef}
      className={`rounded-lg border bg-white dark:bg-slate-800 transition-shadow ${
        isDragging ? 'opacity-40' : ''
      } ${
        isOver
          ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-md'
          : auslastung.istUeberladen
            ? 'border-red-300 dark:border-red-700'
            : 'border-gray-200 dark:border-slate-700'
      }`}
    >
      {/* Kopfzeile der Tour — Rechtsklick färbt alle Stopps auf einmal */}
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          onTourFarbMenue({ x: e.clientX, y: e.clientY });
        }}
        className="flex items-center gap-2 px-1.5 py-1.5 border-b border-gray-100 dark:border-slate-700"
        title="Rechtsklick färbt die ganze Tour"
      >
        <button
          ref={setDragRef}
          {...listeners}
          {...attributes}
          className="shrink-0 text-gray-300 hover:text-gray-600 dark:text-slate-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
          title="Ganze Tour auf einen anderen Tag ziehen"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <TextFeld
          wert={tour.fahrerName ?? ''}
          onAendern={(fahrerName) => onTourAendern({ fahrerName })}
          platzhalter="Fahrer…"
          liste={kmListe}
          className="w-28 px-1.5 py-0.5 text-sm font-semibold rounded border border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent focus:bg-white dark:focus:bg-slate-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-slate-600 placeholder:font-normal focus:outline-none"
        />
        <datalist id={kmListe}>
          {fahrerVorschlaege.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <select
          {...nichtZiehen}
          value={tour.lkwTyp}
          onChange={(e) => {
            const gewaehlt = LKW_OPTIONEN.find((o) => o.wert === e.target.value);
            if (gewaehlt) onTourAendern({ lkwTyp: gewaehlt.wert });
          }}
          className="shrink-0 px-1 py-0.5 text-[11px] rounded border border-gray-200 dark:border-slate-600 bg-transparent text-gray-600 dark:text-gray-300 focus:outline-none focus:border-blue-500"
        >
          {LKW_OPTIONEN.map((o) => (
            <option key={o.wert} value={o.wert}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Tonnage mit Auslastungsbalken */}
        <div className="shrink-0 flex items-center gap-1.5">
          <span
            className={`text-xs font-semibold tabular-nums ${
              auslastung.istUeberladen
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-700 dark:text-gray-200'
            }`}
          >
            {formatTonnen(auslastung.geladen)}
            {auslastung.kapazitaet > 0 && auslastung.kapazitaet < 900 && (
              <span className="font-normal opacity-50"> / {auslastung.kapazitaet}</span>
            )}
          </span>
          {auslastung.kapazitaet > 0 && auslastung.kapazitaet < 900 && (
            <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-slate-600 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  auslastung.istUeberladen
                    ? 'bg-red-500'
                    : auslastung.prozent > 85
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, auslastung.prozent)}%` }}
              />
            </div>
          )}
          {auslastung.istUeberladen && (
            <span
              title={`${formatTonnen(auslastung.geladen - auslastung.kapazitaet)} über der Kapazität`}
              className="flex items-center"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            </span>
          )}
        </div>

        {/* Kilometer */}
        <div className="shrink-0 flex items-baseline">
          <TextFeld
            wert={
              tour.routeDetails?.gesamtDistanzKm
                ? String(Math.round(tour.routeDetails.gesamtDistanzKm))
                : ''
            }
            onAendern={(s) => {
              const zahl = parseFloat(s.replace(',', '.'));
              onTourAendern({ kilometer: Number.isFinite(zahl) ? zahl : 0 });
            }}
            platzhalter="km"
            className="w-12 px-1 py-0.5 text-right text-xs tabular-nums rounded border border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent focus:bg-white dark:focus:bg-slate-900 text-gray-600 dark:text-gray-300 placeholder:text-gray-300 dark:placeholder:text-slate-600 focus:outline-none"
          />
          <span className="text-[10px] text-gray-400">km</span>
        </div>

        {/* Tour-Notiz */}
        <div className="flex-1 min-w-0">
          <TextFeld
            wert={tour.notiz ?? ''}
            onAendern={(notiz) => onTourAendern({ notiz })}
            platzhalter="Notiz zur Tour…"
            className="w-full px-1.5 py-0.5 text-xs rounded border border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent focus:bg-white dark:focus:bg-slate-900 text-gray-600 dark:text-gray-300 placeholder:text-gray-300 dark:placeholder:text-slate-600 focus:outline-none"
          />
        </div>

        <button
          {...nichtZiehen}
          onClick={onTourLoeschen}
          className="shrink-0 p-1 rounded text-gray-300 hover:text-red-600 dark:text-slate-600 dark:hover:text-red-400"
          title="Tour löschen"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stopps */}
      <div className="px-1 py-1 space-y-0.5">
        {tour.stops.length === 0 ? (
          <p
            className={`px-2 py-2 text-[11px] italic rounded border border-dashed ${
              isOver
                ? 'border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600'
            }`}
          >
            Auftrag hierher ziehen
          </p>
        ) : (
          <SortableContext
            items={tour.stops.map((s) => `stop:${tour.id}:${s.projektId}`)}
            strategy={verticalListSortingStrategy}
          >
            {tour.stops.map((stop) => (
              <StoppZeile
                key={stop.projektId}
                stop={stop}
                tourId={tour.id}
                platzbauer={platzbauerJeProjekt.get(stop.projektId)}
                dunkel={dunkel}
                onTonnenAendern={(t) => onStopTonnen(stop.projektId, t)}
                onNotizAendern={(n) => onStopNotiz(stop.projektId, n)}
                onFarbMenue={(pos) => onStopFarbMenue(stop.projektId, pos)}
                onEntfernen={() => onStopEntfernen(stop.projektId)}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
};

export default TourBlock;
