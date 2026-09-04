/**
 * Die Stempelkette eines Tages als Zeitleiste.
 *
 * Gezeigt wird die ROHE Kette, nicht die bereinigte: ein Prüfer muss sehen, dass
 * ein Stempel storniert wurde und warum — deshalb bleibt das aufgehobene Event
 * durchgestrichen stehen, statt zu verschwinden. Welche Events in die Stunden
 * eingehen, entscheidet `wirksameEvents()`, nicht diese Komponente.
 */
import { Ban, Coffee, FileClock, Info, LogIn, LogOut, Play, ShieldAlert, TriangleAlert } from 'lucide-react';
import {
  BETRIEBS_ZEITZONE,
  formatiereStunden,
  lokaleUhrzeit,
  type HinweisSchwere,
  type TagesAuswertung,
  type ZeitEvent,
  type ZeitEventTyp,
} from '../../types/zeiterfassung';
import { wirksameEvents } from '../../utils/zeiterfassungBerechnung';

interface TagesDetailProps {
  auswertung: TagesAuswertung;
  /** Rohkette des Tages inklusive Storno-Vermerken. */
  events: ZeitEvent[];
  istLeitung: boolean;
  onStornieren?: (event: ZeitEvent) => void;
  /** Tagessummen ausblenden, wenn sie darüber schon in der Stempelkarte stehen. */
  zeigeSummen?: boolean;
}

const EVENT_ANZEIGE: Record<
  ZeitEventTyp,
  { text: string; icon: typeof LogIn; punkt: string; farbe: string }
> = {
  kommen: {
    text: 'Kommen',
    icon: LogIn,
    punkt: 'bg-emerald-500',
    farbe: 'text-emerald-700 dark:text-emerald-300',
  },
  pause_start: {
    text: 'Pause Beginn',
    icon: Coffee,
    punkt: 'bg-amber-500',
    farbe: 'text-amber-700 dark:text-amber-300',
  },
  pause_ende: {
    text: 'Pause Ende',
    icon: Play,
    punkt: 'bg-sky-500',
    farbe: 'text-sky-700 dark:text-sky-300',
  },
  gehen: {
    text: 'Gehen',
    icon: LogOut,
    punkt: 'bg-rose-500',
    farbe: 'text-rose-700 dark:text-rose-300',
  },
  storno: {
    text: 'Storno',
    icon: Ban,
    punkt: 'bg-gray-500',
    farbe: 'text-gray-600 dark:text-dark-textMuted',
  },
};

const HINWEIS_STIL: Record<HinweisSchwere, { box: string; icon: typeof Info }> = {
  verstoss: {
    box: 'bg-rose-50 dark:bg-rose-900/25 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200',
    icon: ShieldAlert,
  },
  warnung: {
    box: 'bg-amber-50 dark:bg-amber-900/25 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
    icon: TriangleAlert,
  },
  info: {
    box: 'bg-gray-50 dark:bg-dark-bg border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-textMuted',
    icon: Info,
  },
};

/** Zeitpunkt der Erfassung — Datum und Uhrzeit, immer Betriebszeitzone. */
function zeitstempel(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: BETRIEBS_ZEITZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default function TagesDetail({
  auswertung,
  events,
  istLeitung,
  onStornieren,
  zeigeSummen = true,
}: TagesDetailProps) {
  const sortiert = [...events].sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt));
  const wirksamIds = new Set(wirksameEvents(events).map((e) => e.id));

  return (
    <div className="space-y-4">
      {/* Zeitleiste */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-border p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Stempelkette</h3>

        {sortiert.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-dark-textMuted py-4 text-center">
            Für diesen Tag ist kein Stempel erfasst.
          </p>
        ) : (
          <ol className="relative space-y-3 pl-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-gray-200 dark:before:bg-dark-border">
            {sortiert.map((e) => {
              const a = EVENT_ANZEIGE[e.typ];
              const Icon = a.icon;
              const aufgehoben = e.typ !== 'storno' && !wirksamIds.has(e.id);
              const bezug = e.bezugEventId
                ? sortiert.find((x) => x.id === e.bezugEventId)
                : undefined;

              return (
                <li key={e.id} className="relative">
                  <span
                    className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-dark-surface ${
                      aufgehoben ? 'bg-gray-300 dark:bg-dark-border' : a.punkt
                    }`}
                  />
                  <div
                    className={`rounded-xl border px-3 py-2 ${
                      e.typ === 'storno'
                        ? 'border-dashed border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg'
                        : e.quelle === 'nachtrag'
                          ? 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20'
                          : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={`tabular-nums font-semibold ${
                              aufgehoben
                                ? 'line-through text-gray-400 dark:text-dark-textSubtle'
                                : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {lokaleUhrzeit(e.zeitpunkt)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-sm font-medium ${
                              aufgehoben ? 'line-through text-gray-400 dark:text-dark-textSubtle' : a.farbe
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {a.text}
                          </span>

                          {e.quelle === 'nachtrag' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-violet-200 dark:bg-violet-800 text-violet-900 dark:text-violet-100">
                              <FileClock className="w-3 h-3" />
                              Nachtrag
                            </span>
                          )}
                          {e.quelle === 'kiosk' && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-gray-200 dark:bg-dark-border text-gray-700 dark:text-dark-text">
                              Terminal
                            </span>
                          )}
                          {aufgehoben && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100">
                              storniert
                            </span>
                          )}
                        </div>

                        {e.typ === 'storno' && (
                          <p className="mt-1 text-xs text-gray-600 dark:text-dark-textMuted">
                            Hebt den Stempel
                            {bezug
                              ? ` „${EVENT_ANZEIGE[bezug.typ].text} ${lokaleUhrzeit(bezug.zeitpunkt)}"`
                              : ''}{' '}
                            auf.
                          </p>
                        )}

                        {(e.quelle === 'nachtrag' || e.typ === 'storno') && (
                          <p className="mt-1 text-xs text-gray-600 dark:text-dark-textMuted">
                            Erfasst von {e.erfasstVonName} am {zeitstempel(e.erfasstAm)}
                          </p>
                        )}
                        {e.begruendung && (
                          <p className="mt-1 text-xs text-gray-700 dark:text-dark-text">
                            <span className="font-semibold">Grund:</span> {e.begruendung}
                          </p>
                        )}
                        {e.notiz && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-dark-textMuted">
                            Notiz: {e.notiz}
                          </p>
                        )}
                      </div>

                      {istLeitung && onStornieren && e.typ !== 'storno' && !aufgehoben && (
                        <button
                          type="button"
                          onClick={() => onStornieren(e)}
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30 border border-rose-200 dark:border-rose-800 transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Stornieren
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Tagessumme */}
        {zeigeSummen && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-dark-border grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <SummenZelle label="Anwesend" wert={formatiereStunden(auswertung.bruttoMinuten)} />
            <SummenZelle label="Pause" wert={formatiereStunden(auswertung.pausenMinuten)} />
            <SummenZelle
              label="Ges. Abzug"
              wert={formatiereStunden(auswertung.gesetzlicherPausenabzug)}
            />
            <SummenZelle label="Netto" wert={formatiereStunden(auswertung.nettoMinuten)} betont />
          </div>
        )}
      </div>

      {/* Hinweise */}
      {auswertung.hinweise.length > 0 && (
        <div className="space-y-2">
          {auswertung.hinweise.map((h, i) => {
            const stil = HINWEIS_STIL[h.schwere];
            const HIcon = stil.icon;
            return (
              <div
                key={`${h.schwere}-${i}`}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${stil.box}`}
              >
                <HIcon className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{h.text}</p>
                  {h.grundlage && (
                    <p className="text-xs opacity-80 mt-0.5">Rechtsgrundlage: {h.grundlage}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummenZelle({ label, wert, betont }: { label: string; wert: string; betont?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-dark-textMuted">
        {label}
      </div>
      <div
        className={`tabular-nums ${
          betont
            ? 'font-bold text-gray-900 dark:text-white'
            : 'font-medium text-gray-700 dark:text-dark-text'
        }`}
      >
        {wert}
      </div>
    </div>
  );
}
