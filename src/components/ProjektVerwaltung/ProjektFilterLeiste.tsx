/**
 * Die Filterleiste des Kanban-Boards.
 *
 * Gestalterische Entscheidungen und ihre Gründe:
 *
 * ZÄHLER AN JEDEM WERT. Gemessen an Saison 2026 treffen manche Achsen fast alles
 * (Schüttgut: 481 von 598) und andere fast nichts (0/3 lose: 3). Ohne Zahl daneben
 * klickt man blind und weiss erst hinterher, ob der Filter etwas gebracht hat.
 *
 * NULL-TREFFER WERDEN AUSGEGRAUT, NICHT VERSTECKT. Dass es in dieser Saison kaum
 * 0/3-Aufträge gibt, ist eine Information. Ein Knopf, der verschwindet, sieht aus
 * wie ein Fehler.
 *
 * GESCHLOSSENE GRUPPEN ZEIGEN IHRE AUSWAHL. Sonst filtert man versehentlich mit
 * einer Einstellung von vorgestern weiter und wundert sich über ein leeres Board.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X, Filter as FilterIcon, Search, Bookmark, Trash2 } from 'lucide-react';
import { Projekt } from '../../types/projekt';
import {
  ProjektFilter,
  FILTER_GRUPPEN,
  LEERER_FILTER,
  istFilterAktiv,
  anzahlAktiverFilter,
  zaehleFuerWert,
  FilterKontext,
} from '../../utils/projektFilter';

/** Im Browser gespeicherte Ansicht — eine benannte Filtereinstellung. */
export interface GespeicherteAnsicht {
  name: string;
  filter: ProjektFilter;
}

interface Props {
  filter: ProjektFilter;
  onChange: (f: ProjektFilter) => void;
  /** Grundgesamtheit für die Zähler — alle Projekte VOR dem Filtern. */
  alleProjekte: Projekt[];
  /** Wie viele bleiben nach dem aktuellen Filter übrig. */
  trefferAnzahl: number;
  kontext?: FilterKontext;
  ansichten: GespeicherteAnsicht[];
  onAnsichtSpeichern: (name: string) => void;
  onAnsichtLaden: (ansicht: GespeicherteAnsicht) => void;
  onAnsichtLoeschen: (name: string) => void;
}

const ProjektFilterLeiste = ({
  filter,
  onChange,
  alleProjekte,
  trefferAnzahl,
  kontext,
  ansichten,
  onAnsichtSpeichern,
  onAnsichtLaden,
  onAnsichtLoeschen,
}: Props) => {
  const [offen, setOffen] = useState(false);
  const [speicherName, setSpeicherName] = useState('');
  const [speicherFeldOffen, setSpeicherFeldOffen] = useState(false);

  const aktiv = istFilterAktiv(filter);
  const anzahl = anzahlAktiverFilter(filter);

  // Alle Zähler in einem Durchgang. Bei 600 Projekten und ~20 Werten sind das
  // 12.000 Prüfungen — einmal pro Filteränderung, nicht pro Render.
  const zaehler = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const gruppe of FILTER_GRUPPEN) {
      out[gruppe.schluessel] = {};
      for (const w of gruppe.werte) {
        out[gruppe.schluessel][w.wert] = zaehleFuerWert(
          alleProjekte,
          filter,
          gruppe.schluessel,
          w.wert as never,
          kontext
        );
      }
    }
    return out;
  }, [alleProjekte, filter, kontext]);

  const schalte = (gruppe: keyof Omit<ProjektFilter, 'suche'>, wert: string) => {
    const bisher = filter[gruppe] as string[];
    const neu = bisher.includes(wert) ? bisher.filter((w) => w !== wert) : [...bisher, wert];
    onChange({ ...filter, [gruppe]: neu });
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl mb-3">
      {/* Kopfzeile: immer sichtbar */}
      <div className="flex items-center gap-2 p-3 flex-wrap">
        <button
          onClick={() => setOffen((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100"
        >
          {offen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <FilterIcon className="w-4 h-4" />
          Filter
          {anzahl > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-xs font-semibold tabular-nums">
              {anzahl}
            </span>
          )}
        </button>

        <div className="relative flex-1 min-w-[14rem] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={filter.suche}
            onChange={(e) => onChange({ ...filter, suche: e.target.value })}
            placeholder="Verein, Ort, Kundennr., Belegnummer…"
            className="w-full pl-8 pr-8 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
          />
          {filter.suche && (
            <button
              onClick={() => onChange({ ...filter, suche: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Suche leeren"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <span className="text-sm text-gray-600 dark:text-slate-400 tabular-nums">
          <strong className="text-gray-900 dark:text-slate-100">{trefferAnzahl}</strong>
          {aktiv && <> von {alleProjekte.length}</>} Projekte
        </span>

        {aktiv && (
          <button
            onClick={() => onChange(LEERER_FILTER)}
            className="px-2.5 py-1.5 text-xs text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 border border-gray-300 dark:border-slate-600 rounded-lg inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Zurücksetzen
          </button>
        )}
      </div>

      {/* Zusammenfassung bei geschlossener Leiste — sonst filtert man mit einer
          Einstellung von vorgestern und wundert sich über ein leeres Board. */}
      {!offen && aktiv && (
        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {FILTER_GRUPPEN.flatMap((gruppe) =>
            (filter[gruppe.schluessel] as string[]).map((wert) => {
              const label = gruppe.werte.find((w) => w.wert === wert)?.label ?? wert;
              return (
                <button
                  key={`${gruppe.schluessel}-${wert}`}
                  onClick={() => schalte(gruppe.schluessel, wert)}
                  className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs inline-flex items-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                  title={`${gruppe.titel}: ${label} entfernen`}
                >
                  {label} <X className="w-3 h-3" />
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Aufgeklappt: die Gruppen */}
      {offen && (
        <div className="border-t border-gray-100 dark:border-slate-700 p-3 space-y-3">
          {FILTER_GRUPPEN.map((gruppe) => {
            const gewaehlt = filter[gruppe.schluessel] as string[];
            return (
              <div key={gruppe.schluessel}>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    {gruppe.titel}
                  </span>
                  {gruppe.hinweis && (
                    <span className="text-xs text-gray-400 dark:text-slate-500">{gruppe.hinweis}</span>
                  )}
                  {gewaehlt.length > 0 && (
                    <button
                      onClick={() => onChange({ ...filter, [gruppe.schluessel]: [] })}
                      className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:hover:text-slate-300"
                    >
                      leeren
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {gruppe.werte.map((w) => {
                    const anAus = gewaehlt.includes(w.wert);
                    const n = zaehler[gruppe.schluessel]?.[w.wert] ?? 0;
                    const leer = n === 0 && !anAus;
                    return (
                      <button
                        key={w.wert}
                        onClick={() => schalte(gruppe.schluessel, w.wert)}
                        disabled={leer}
                        title={w.titel}
                        className={`px-2.5 py-1 rounded-lg text-sm border transition-colors inline-flex items-center gap-1.5 ${
                          anAus
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : leer
                            ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600 cursor-not-allowed'
                            : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-gray-400 dark:hover:border-slate-500'
                        }`}
                      >
                        {w.label}
                        <span
                          className={`tabular-nums text-xs ${
                            anAus ? 'text-blue-100' : 'text-gray-400 dark:text-slate-500'
                          }`}
                        >
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Gespeicherte Ansichten */}
          <div className="border-t border-gray-100 dark:border-slate-700 pt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 inline-flex items-center gap-1">
                <Bookmark className="w-3.5 h-3.5" /> Ansichten
              </span>

              {ansichten.map((a) => (
                <span
                  key={a.name}
                  className="inline-flex items-center rounded-lg border border-gray-300 dark:border-slate-600 overflow-hidden"
                >
                  <button
                    onClick={() => onAnsichtLaden(a)}
                    className="px-2.5 py-1 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    {a.name}
                  </button>
                  <button
                    onClick={() => onAnsichtLoeschen(a.name)}
                    className="px-1.5 py-1 text-gray-400 hover:text-red-600 border-l border-gray-200 dark:border-slate-700"
                    title={`„${a.name}" löschen`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}

              {speicherFeldOffen ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    autoFocus
                    value={speicherName}
                    onChange={(e) => setSpeicherName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && speicherName.trim()) {
                        onAnsichtSpeichern(speicherName.trim());
                        setSpeicherName('');
                        setSpeicherFeldOffen(false);
                      }
                      if (e.key === 'Escape') setSpeicherFeldOffen(false);
                    }}
                    placeholder="Name der Ansicht"
                    className="w-40 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm"
                  />
                  <button
                    onClick={() => {
                      if (speicherName.trim()) {
                        onAnsichtSpeichern(speicherName.trim());
                        setSpeicherName('');
                        setSpeicherFeldOffen(false);
                      }
                    }}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                  >
                    Sichern
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setSpeicherFeldOffen(true)}
                  disabled={!aktiv}
                  title={aktiv ? undefined : 'Erst filtern, dann sichern'}
                  className="px-2.5 py-1 text-sm border border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-gray-600 dark:text-slate-400 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Aktuelle sichern
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjektFilterLeiste;
