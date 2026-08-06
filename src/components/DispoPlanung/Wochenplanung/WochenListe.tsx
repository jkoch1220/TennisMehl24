import { useDroppable } from '@dnd-kit/core';
import { Plus, Inbox, Palette } from 'lucide-react';
import type { Tour, TourFahrzeugTyp } from '../../../types/tour';
import TourBlock from './TourBlock';
import { tourTonnage, formatTonnen } from './wochenplanungUtils';
import {
  WOCHENTAGE_LANG,
  formatISODatum,
  formatTagKurz,
  istHeute,
} from '../../../utils/kalenderwoche';

interface TourAktionen {
  dunkel: boolean;
  fahrerVorschlaege: string[];
  platzbauerJeProjekt: Map<string, string>;
  onTourAendern: (
    tourId: string,
    aenderung: {
      fahrerName?: string;
      lkwTyp?: TourFahrzeugTyp;
      kilometer?: number;
      notiz?: string;
    }
  ) => void;
  onTourLoeschen: (tourId: string) => void;
  onStopTonnen: (tourId: string, projektId: string, tonnen: number) => void;
  onStopNotiz: (tourId: string, projektId: string, notiz: string) => void;
  onStopFarbMenue: (tourId: string, projektId: string, position: { x: number; y: number }) => void;
  onTourFarbMenue: (tourId: string, position: { x: number; y: number }) => void;
  onTagFarbMenue: (datum: string, position: { x: number; y: number }) => void;
  onStopEntfernen: (tourId: string, projektId: string) => void;
}

interface WochenListeProps extends TourAktionen {
  tage: Date[];
  /** Touren je ISO-Datum. */
  tourenJeTag: Map<string, Tour[]>;
  /** Touren ohne Datum. */
  backlog: Tour[];
  onNeueTour: (datum: string) => void;
}

/** Ein Tagesabschnitt: Überschrift, seine Touren, Knopf zum Anlegen. */
const TagesAbschnitt = ({
  datum,
  titel,
  untertitel,
  hervorgehoben,
  touren,
  onNeueTour,
  aktionen,
}: {
  datum: string;
  titel: string;
  untertitel?: string;
  hervorgehoben?: boolean;
  touren: Tour[];
  onNeueTour: () => void;
  aktionen: TourAktionen;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `tag:${datum}`,
    data: { type: 'tag', datum },
  });

  const summe = touren.reduce((s, t) => s + tourTonnage(t), 0);
  const hatStopps = touren.some((t) => t.stops.length > 0);

  return (
    <section
      ref={setNodeRef}
      className={`rounded-lg transition-colors ${
        isOver ? 'bg-blue-50/70 dark:bg-blue-900/20 ring-2 ring-blue-400' : ''
      }`}
    >
      <header
        onContextMenu={(e) => {
          if (!hatStopps) return;
          e.preventDefault();
          aktionen.onTagFarbMenue(datum, { x: e.clientX, y: e.clientY });
        }}
        className={`group flex items-baseline gap-2 px-2 py-1.5 rounded-t-lg ${
          hervorgehoben
            ? 'bg-blue-100/70 dark:bg-blue-900/40'
            : 'bg-gray-100 dark:bg-slate-800'
        }`}
        title={hatStopps ? 'Rechtsklick färbt den ganzen Tag' : undefined}
      >
        <h3
          className={`text-sm font-bold ${
            hervorgehoben
              ? 'text-blue-800 dark:text-blue-200'
              : 'text-gray-800 dark:text-gray-100'
          }`}
        >
          {titel}
        </h3>
        {untertitel && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{untertitel}</span>
        )}
        {hatStopps && (
          <button
            onClick={(e) => aktionen.onTagFarbMenue(datum, { x: e.clientX, y: e.clientY })}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-opacity"
            title="Ganzen Tag färben"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {touren.length > 0 && (
            <>
              {touren.length} {touren.length === 1 ? 'Tour' : 'Touren'} ·{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {formatTonnen(summe)}
              </span>
            </>
          )}
        </span>
      </header>

      <div className="px-1.5 py-1.5 space-y-1.5">
        {touren.map((tour) => (
          <TourBlock
            key={tour.id}
            tour={tour}
            dunkel={aktionen.dunkel}
            fahrerVorschlaege={aktionen.fahrerVorschlaege}
            platzbauerJeProjekt={aktionen.platzbauerJeProjekt}
            onTourAendern={(a) => aktionen.onTourAendern(tour.id, a)}
            onTourLoeschen={() => aktionen.onTourLoeschen(tour.id)}
            onStopTonnen={(p, t) => aktionen.onStopTonnen(tour.id, p, t)}
            onStopNotiz={(p, n) => aktionen.onStopNotiz(tour.id, p, n)}
            onStopFarbMenue={(p, pos) => aktionen.onStopFarbMenue(tour.id, p, pos)}
            onTourFarbMenue={(pos) => aktionen.onTourFarbMenue(tour.id, pos)}
            onStopEntfernen={(p) => aktionen.onStopEntfernen(tour.id, p)}
          />
        ))}

        <button
          onClick={onNeueTour}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-gray-200 dark:border-slate-700 text-xs text-gray-400 dark:text-slate-500 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Tour anlegen
        </button>
      </div>
    </section>
  );
};

const WochenListe = ({
  tage,
  tourenJeTag,
  backlog,
  onNeueTour,
  ...aktionen
}: WochenListeProps) => (
  <div className="space-y-3 p-2">
    {tage.map((tag, i) => {
      const datum = formatISODatum(tag);
      return (
        <TagesAbschnitt
          key={datum}
          datum={datum}
          titel={WOCHENTAGE_LANG[i]}
          untertitel={formatTagKurz(tag)}
          hervorgehoben={istHeute(tag)}
          touren={tourenJeTag.get(datum) ?? []}
          onNeueTour={() => onNeueTour(datum)}
          aktionen={aktionen}
        />
      );
    })}

    {/* Touren ohne Datum */}
    <TagesAbschnitt
      datum=""
      titel="Nicht terminiert"
      untertitel={backlog.length > 0 ? undefined : 'leer'}
      touren={backlog}
      onNeueTour={() => onNeueTour('')}
      aktionen={aktionen}
    />

    {backlog.length === 0 && (
      <p className="flex items-center gap-1.5 px-2 text-[11px] text-gray-400 dark:text-slate-600">
        <Inbox className="w-3 h-3" />
        Touren ohne festen Tag landen hier.
      </p>
    )}
  </div>
);

export default WochenListe;
