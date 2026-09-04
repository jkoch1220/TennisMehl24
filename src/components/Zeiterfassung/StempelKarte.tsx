/**
 * Der Stempelbereich — die einzige Fläche, die ein Mitarbeiter im Alltag berührt.
 *
 * Gestaltungsentscheidungen, die nicht Geschmack sind:
 *  - Es erscheinen ausschließlich die Knöpfe aus `erlaubteStempel(status)`. Ein
 *    ausgegrauter „Kommen"-Knopf während der Arbeit wäre eine Einladung, es doch
 *    zu versuchen; ein nicht vorhandener Knopf erzeugt keine kaputte Kette.
 *  - Mindesthöhe 56 px (WCAG-Zielgröße mit Reserve für Arbeitshandschuhe) und
 *    keine Scrollfläche: Stempeln muss ohne Suchen funktionieren.
 *  - Die laufende Zeit wird nicht hier gerechnet, sondern kommt fertig aus
 *    `werteTagAus()`. Anzeige und Abrechnung können so nie auseinanderlaufen.
 */
import { Coffee, LogIn, LogOut, Play, UserCheck } from 'lucide-react';
import {
  BETRIEBS_ZEITZONE,
  formatiereStunden,
  lokaleUhrzeit,
  type StempelStatus,
  type TagesAuswertung,
  type ZeitEventTyp,
} from '../../types/zeiterfassung';
import { erlaubteStempel } from '../../utils/zeiterfassungBerechnung';

interface StempelKarteProps {
  /** Name dessen, für den gestempelt wird. */
  mitarbeiterName: string;
  /** true, wenn die Leitung für jemand anderen bucht — muss sichtbar bleiben. */
  fuerFremden: boolean;
  status: StempelStatus;
  auswertung: TagesAuswertung;
  /** Aktueller Zeitpunkt (ISO, serverkorrigiert) — tickt im Container. */
  jetzt: string;
  busy: boolean;
  fehler: string | null;
  onStempeln: (typ: Exclude<ZeitEventTyp, 'storno'>) => void;
}

const STATUS_ANZEIGE: Record<
  StempelStatus,
  { text: string; punkt: string; box: string; textFarbe: string }
> = {
  abwesend: {
    text: 'Nicht eingestempelt',
    punkt: 'bg-gray-400 dark:bg-gray-500',
    box: 'bg-gray-100 dark:bg-dark-surfaceHover border-gray-200 dark:border-dark-border',
    textFarbe: 'text-gray-600 dark:text-dark-textMuted',
  },
  arbeitet: {
    text: 'Im Dienst',
    punkt: 'bg-emerald-500 animate-pulse',
    box: 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-200 dark:border-emerald-800',
    textFarbe: 'text-emerald-700 dark:text-emerald-300',
  },
  pause: {
    text: 'In Pause',
    punkt: 'bg-amber-500 animate-pulse',
    box: 'bg-amber-50 dark:bg-amber-900/25 border-amber-200 dark:border-amber-800',
    textFarbe: 'text-amber-700 dark:text-amber-300',
  },
};

const KNOPF: Record<
  Exclude<ZeitEventTyp, 'storno'>,
  { text: string; icon: typeof LogIn; klasse: string }
> = {
  kommen: {
    text: 'Kommen',
    icon: LogIn,
    klasse:
      'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 focus-visible:ring-emerald-400',
  },
  pause_start: {
    text: 'Pause beginnen',
    icon: Coffee,
    klasse:
      'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 focus-visible:ring-amber-400',
  },
  pause_ende: {
    text: 'Pause beenden',
    icon: Play,
    klasse:
      'bg-sky-600 hover:bg-sky-700 active:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 focus-visible:ring-sky-400',
  },
  gehen: {
    text: 'Gehen',
    icon: LogOut,
    klasse:
      'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 dark:bg-rose-600 dark:hover:bg-rose-500 focus-visible:ring-rose-400',
  },
};

/** Uhrzeit mit Sekunden in der Betriebszeitzone — bewusst nicht in Gerätezeit. */
function uhrzeitMitSekunden(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: BETRIEBS_ZEITZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

export default function StempelKarte({
  mitarbeiterName,
  fuerFremden,
  status,
  auswertung,
  jetzt,
  busy,
  fehler,
  onStempeln,
}: StempelKarteProps) {
  const anzeige = STATUS_ANZEIGE[status];
  const knoepfe = erlaubteStempel(status).filter(
    (t): t is Exclude<ZeitEventTyp, 'storno'> => t !== 'storno'
  );

  const laufenderAbschnitt = auswertung.abschnitte.find((a) => a.laeuft);
  const laufendePause = auswertung.pausen.find((p) => p.laeuft);

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-border shadow-sm dark:shadow-dark-md overflow-hidden">
      {fuerFremden && (
        <div className="flex items-center gap-2 px-4 py-2 bg-violet-100 dark:bg-violet-900/40 border-b border-violet-200 dark:border-violet-800">
          <UserCheck className="w-4 h-4 text-violet-700 dark:text-violet-300 shrink-0" />
          <span className="text-sm font-semibold text-violet-800 dark:text-violet-200">
            Erfassung für {mitarbeiterName}
          </span>
        </div>
      )}

      <div className="p-4 sm:p-6">
        {/* Uhr + Status */}
        <div className="flex flex-col items-center gap-3">
          <div className="font-mono tabular-nums text-5xl sm:text-6xl font-bold tracking-tight text-gray-900 dark:text-white">
            {uhrzeitMitSekunden(jetzt)}
          </div>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${anzeige.box}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${anzeige.punkt}`} />
            <span className={`text-sm font-semibold ${anzeige.textFarbe}`}>{anzeige.text}</span>
          </div>
          {!fuerFremden && (
            <div className="text-sm text-gray-500 dark:text-dark-textMuted">{mitarbeiterName}</div>
          )}
        </div>

        {/* Stempelknöpfe */}
        <div
          className={`mt-6 grid gap-3 ${knoepfe.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}
        >
          {knoepfe.map((typ) => {
            const k = KNOPF[typ];
            const Icon = k.icon;
            return (
              <button
                key={typ}
                type="button"
                onClick={() => onStempeln(typ)}
                disabled={busy}
                className={`min-h-[56px] w-full flex items-center justify-center gap-3 px-5 rounded-xl text-white text-lg font-semibold shadow-md transition-colors focus:outline-none focus-visible:ring-4 disabled:opacity-50 disabled:cursor-not-allowed ${k.klasse}`}
              >
                <Icon className="w-6 h-6 shrink-0" />
                {k.text}
              </button>
            );
          })}
        </div>

        {fehler && (
          <p className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2">
            {fehler}
          </p>
        )}

        {/* Tageszahlen */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Kennzahl
            label="Heute netto"
            wert={formatiereStunden(auswertung.nettoMinuten)}
            betont
          />
          <Kennzahl label="Anwesend" wert={formatiereStunden(auswertung.bruttoMinuten)} />
          <Kennzahl label="Pause" wert={formatiereStunden(auswertung.pausenMinuten)} />
          <Kennzahl
            label="Ges. Abzug"
            wert={formatiereStunden(auswertung.gesetzlicherPausenabzug)}
          />
        </div>

        {/* Laufende Zeit */}
        {laufendePause ? (
          <p className="mt-4 text-center text-sm text-amber-700 dark:text-amber-300">
            Pause läuft seit {lokaleUhrzeit(laufendePause.von)} —{' '}
            <span className="font-semibold tabular-nums">
              {formatiereStunden(laufendePause.minuten)}
            </span>
          </p>
        ) : laufenderAbschnitt ? (
          <p className="mt-4 text-center text-sm text-emerald-700 dark:text-emerald-300">
            Im Dienst seit {lokaleUhrzeit(laufenderAbschnitt.von)} —{' '}
            <span className="font-semibold tabular-nums">
              {formatiereStunden(laufenderAbschnitt.minuten)}
            </span>
          </p>
        ) : (
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-dark-textMuted">
            {auswertung.events.length === 0
              ? 'Heute noch kein Stempel erfasst.'
              : 'Kein laufender Abschnitt.'}
          </p>
        )}
      </div>
    </div>
  );
}

function Kennzahl({ label, wert, betont }: { label: string; wert: string; betont?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border px-2 py-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-dark-textMuted">
        {label}
      </div>
      <div
        className={`mt-0.5 tabular-nums font-semibold ${
          betont
            ? 'text-lg text-gray-900 dark:text-white'
            : 'text-base text-gray-700 dark:text-dark-text'
        }`}
      >
        {wert}
      </div>
    </div>
  );
}
