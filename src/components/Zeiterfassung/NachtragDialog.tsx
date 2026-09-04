/**
 * Nachtragen und Stornieren durch die Leitung.
 *
 * Beides sind Eingriffe in einen Nachweis, der einer Prüfung standhalten muss.
 * Deshalb: Begründung ist Pflicht (der Server lehnt sonst ab), der Dialog sagt
 * offen, dass der Vorgang mit Name und Uhrzeit protokolliert wird, und ein
 * Zeitpunkt in der Zukunft wird gar nicht erst abgeschickt.
 */
import { useState } from 'react';
import { Ban, FileClock, ShieldAlert, X } from 'lucide-react';
import {
  BETRIEBS_ZEITZONE,
  lokaleUhrzeit,
  type ZeitEvent,
  type ZeitEventTyp,
  type ZeitMitarbeiter,
} from '../../types/zeiterfassung';
import { zeiterfassungService } from '../../services/zeiterfassungService';
import { formatISODatum } from '../../utils/kalenderwoche';

interface NachtragDialogProps {
  modus: 'nachtrag' | 'storno';
  mitarbeiter: ZeitMitarbeiter[];
  /** Vorbelegung im Nachtrag-Modus. */
  vorauswahlMitarbeiterId?: string;
  /** Das zu stornierende Event im Storno-Modus. */
  event?: ZeitEvent;
  onClose: () => void;
  /** Wird nach erfolgreichem Schreiben aufgerufen — der Aufrufer lädt neu. */
  onFertig: () => void;
}

const TYP_TEXT: Record<Exclude<ZeitEventTyp, 'storno'>, string> = {
  kommen: 'Kommen',
  pause_start: 'Pause Beginn',
  pause_ende: 'Pause Ende',
  gehen: 'Gehen',
};

const TYPEN: Exclude<ZeitEventTyp, 'storno'>[] = ['kommen', 'pause_start', 'pause_ende', 'gehen'];

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

export default function NachtragDialog({
  modus,
  mitarbeiter,
  vorauswahlMitarbeiterId,
  event,
  onClose,
  onFertig,
}: NachtragDialogProps) {
  const jetzt = new Date();
  const [mitarbeiterId, setMitarbeiterId] = useState(
    vorauswahlMitarbeiterId || mitarbeiter[0]?.id || ''
  );
  const [typ, setTyp] = useState<Exclude<ZeitEventTyp, 'storno'>>('kommen');
  const [datum, setDatum] = useState(formatISODatum(jetzt));
  const [uhrzeit, setUhrzeit] = useState(
    `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`
  );
  const [begruendung, setBegruendung] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Der Zeitpunkt wird aus der Gerätezeit gebildet. Steht das Gerät in einer
  // anderen Zone als der Betrieb, wäre die gespeicherte Uhrzeit verschoben —
  // deshalb der Hinweis statt einer stillen Umrechnung.
  const geraeteZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zoneAbweichend = geraeteZone !== BETRIEBS_ZEITZONE;

  const gewaehlterZeitpunkt =
    datum && uhrzeit ? new Date(`${datum}T${uhrzeit}:00`) : null;
  const inZukunft = !!gewaehlterZeitpunkt && gewaehlterZeitpunkt.getTime() > Date.now();
  const zeitpunktUngueltig =
    !gewaehlterZeitpunkt || Number.isNaN(gewaehlterZeitpunkt.getTime());

  const begruendungFehlt = begruendung.trim().length === 0;
  const absendenGesperrt =
    busy ||
    begruendungFehlt ||
    (modus === 'nachtrag' && (!mitarbeiterId || zeitpunktUngueltig || inZukunft));

  const speichern = async () => {
    setBusy(true);
    setFehler(null);
    try {
      if (modus === 'storno') {
        if (!event) throw new Error('Kein Event zum Stornieren ausgewählt.');
        await zeiterfassungService.stornieren(event.id, begruendung.trim());
      } else {
        if (!gewaehlterZeitpunkt) throw new Error('Bitte Datum und Uhrzeit angeben.');
        await zeiterfassungService.nachtragen({
          mitarbeiterId,
          typ,
          zeitpunkt: gewaehlterZeitpunkt.toISOString(),
          begruendung: begruendung.trim(),
        });
      }
      onFertig();
      onClose();
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setBusy(false);
    }
  };

  const betroffener = event
    ? mitarbeiter.find((m) => m.id === event.mitarbeiterId)?.name
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-dark-surface w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-full overflow-y-auto">
        {/* Kopf */}
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            {modus === 'storno' ? (
              <Ban className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            ) : (
              <FileClock className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            )}
            {modus === 'storno' ? 'Stempel stornieren' : 'Stempel nachtragen'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surfaceHover transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-dark-textMuted" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Protokoll-Warnung */}
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/25 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              {modus === 'storno'
                ? 'Der Stempel wird nicht gelöscht, sondern mit einem Storno-Vermerk aufgehoben. '
                : 'Der Nachtrag wird als eigener Eintrag gespeichert. '}
              Dein Name, der Zeitpunkt der Erfassung und die Begründung werden dauerhaft
              protokolliert und lassen sich nicht mehr entfernen.
            </p>
          </div>

          {modus === 'storno' && event && (
            <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg px-3 py-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-dark-textMuted mb-1">
                Betroffener Stempel
              </p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {event.typ === 'storno' ? 'Storno' : TYP_TEXT[event.typ]} ·{' '}
                {lokaleUhrzeit(event.zeitpunkt)} Uhr · {event.datum}
              </p>
              <p className="text-gray-600 dark:text-dark-textMuted mt-1">
                {betroffener ? `${betroffener} · ` : ''}Quelle: {event.quelle} · erfasst von{' '}
                {event.erfasstVonName}
              </p>
            </div>
          )}

          {modus === 'nachtrag' && (
            <>
              <div>
                <label
                  htmlFor="zeit-nachtrag-mitarbeiter"
                  className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1"
                >
                  Mitarbeiter
                </label>
                <select
                  id="zeit-nachtrag-mitarbeiter"
                  value={mitarbeiterId}
                  onChange={(e) => setMitarbeiterId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                >
                  {mitarbeiter.length === 0 && <option value="">Keine Mitarbeiter geladen</option>}
                  {mitarbeiter.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">
                  Art des Stempels
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {TYPEN.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTyp(t)}
                      className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        typ === t
                          ? 'bg-sky-600 text-white shadow-md'
                          : 'bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-dark-surfaceHover border border-gray-200 dark:border-dark-border'
                      }`}
                    >
                      {TYP_TEXT[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="zeit-nachtrag-datum"
                    className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1"
                  >
                    Datum
                  </label>
                  <input
                    id="zeit-nachtrag-datum"
                    type="date"
                    value={datum}
                    max={formatISODatum(new Date())}
                    onChange={(e) => setDatum(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="zeit-nachtrag-uhrzeit"
                    className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1"
                  >
                    Uhrzeit
                  </label>
                  <input
                    id="zeit-nachtrag-uhrzeit"
                    type="time"
                    value={uhrzeit}
                    onChange={(e) => setUhrzeit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
              </div>

              {inZukunft && (
                <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                  Der Zeitpunkt liegt in der Zukunft. Nachgetragen wird nur, was bereits
                  stattgefunden hat.
                </p>
              )}
              {zoneAbweichend && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Dein Gerät läuft auf {geraeteZone}, der Betrieb rechnet in{' '}
                  {BETRIEBS_ZEITZONE}. Die eingegebene Uhrzeit wird als Gerätezeit gespeichert
                  — bitte gegenprüfen.
                </p>
              )}
            </>
          )}

          <div>
            <label
              htmlFor="zeit-nachtrag-grund"
              className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1"
            >
              Begründung <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <textarea
              id="zeit-nachtrag-grund"
              value={begruendung}
              onChange={(e) => setBegruendung(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                modus === 'storno'
                  ? 'z. B. Doppelstempel um 07:02 Uhr'
                  : 'z. B. Gehen-Stempel vergessen, Feierabend laut Vorarbeiter 16:30 Uhr'
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-textSubtle focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-textMuted">
              Pflichtfeld — ohne Begründung ist die Korrektur nicht nachvollziehbar.
            </p>
          </div>

          {fehler && (
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2">
              {fehler}
            </p>
          )}
        </div>

        {/* Fuß */}
        <div className="sticky bottom-0 flex gap-3 px-5 py-4 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-surfaceHover transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={speichern}
            disabled={absendenGesperrt}
            className={`flex-1 min-h-[44px] px-4 rounded-lg text-white font-semibold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              modus === 'storno'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {busy ? 'Speichert…' : modus === 'storno' ? 'Storno buchen' : 'Nachtrag buchen'}
          </button>
        </div>
      </div>
    </div>
  );
}
