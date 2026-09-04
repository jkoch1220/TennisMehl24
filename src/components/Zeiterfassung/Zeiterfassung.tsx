/**
 * Zeiterfassung — Arbeitszeitnachweis nach ArbZG/MiLoG.
 *
 * Der Container hält genau eine Wahrheit: die Antwort von `status` (wer bin ich,
 * darf ich fremde Zeiten buchen, was ist mein Stempelzustand) plus die Events des
 * angezeigten Tages. Alles Fachliche kommt aus `zeiterfassungBerechnung`, alles
 * Persistente aus `zeiterfassungService`.
 *
 * Nach jedem Stempel wird der Status neu geladen, statt ihn lokal fortzuschreiben:
 * die Knöpfe müssen dem entsprechen, was der Server tatsächlich gebucht hat — sonst
 * bietet die Oberfläche einen Übergang an, den der Server anschließend mit 409
 * ablehnt.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock,
  FileClock,
  Loader2,
  RefreshCw,
  Timer,
  TriangleAlert,
  UserX,
  Users,
} from 'lucide-react';
import {
  type StempelStatus,
  type ZeitEvent,
  type ZeitEventTyp,
  type ZeitMitarbeiter,
} from '../../types/zeiterfassung';
import { ermittleStatus, werteTagAus } from '../../utils/zeiterfassungBerechnung';
import { zeiterfassungService, type StatusAntwort } from '../../services/zeiterfassungService';
import StempelKarte from './StempelKarte';
import TagesDetail from './TagesDetail';
import MonatsUebersicht from './MonatsUebersicht';
import TeamUebersicht from './TeamUebersicht';
import NachtragDialog from './NachtragDialog';

type Ansicht = 'heute' | 'monat' | 'team';

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

export default function Zeiterfassung() {
  const [statusAntwort, setStatusAntwort] = useState<StatusAntwort | null>(null);
  const [mitarbeiterListe, setMitarbeiterListe] = useState<ZeitMitarbeiter[]>([]);
  const [tagEvents, setTagEvents] = useState<ZeitEvent[]>([]);
  const [tagStatus, setTagStatus] = useState<StempelStatus>('abwesend');
  const [zielId, setZielId] = useState('');

  const [laden, setLaden] = useState(true);
  const [aktualisiert, setAktualisiert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [stempelBusy, setStempelBusy] = useState(false);
  const [stempelFehler, setStempelFehler] = useState<string | null>(null);

  const [ansicht, setAnsicht] = useState<Ansicht>('heute');
  const [dialog, setDialog] = useState<{ modus: 'nachtrag' | 'storno'; event?: ZeitEvent } | null>(
    null
  );
  const [korrekturZaehler, setKorrekturZaehler] = useState(0);

  /**
   * Versatz zwischen Server- und Geräteuhr. Die große Uhr zeigt die Zeit, mit der
   * der Server bucht — eine falsch gestellte Handyuhr darf keinen Zweifel an der
   * gestempelten Minute säen.
   */
  const [versatzMs, setVersatzMs] = useState(0);
  const [jetzt, setJetzt] = useState(() => new Date().toISOString());

  useEffect(() => {
    const id = window.setInterval(() => {
      setJetzt(new Date(Date.now() + versatzMs).toISOString());
    }, 1000);
    return () => window.clearInterval(id);
  }, [versatzMs]);

  const ladeAlles = useCallback(async (ziel: string) => {
    setFehler(null);
    try {
      const s = await zeiterfassungService.ladeStatus();
      setStatusAntwort(s);
      setVersatzMs(new Date(s.serverZeit).getTime() - Date.now());

      let liste: ZeitMitarbeiter[] = [];
      if (s.istLeitung) {
        liste = (await zeiterfassungService.ladeMitarbeiter()).mitarbeiter;
        setMitarbeiterListe(liste);
      } else {
        setMitarbeiterListe(s.mitarbeiter ? [s.mitarbeiter] : []);
      }

      const eigenId = s.mitarbeiter?.id ?? '';
      const effektiv = ziel || eigenId;

      if (effektiv && effektiv !== eigenId) {
        const z = await zeiterfassungService.ladeZeitraum(s.datum, s.datum, effektiv);
        const eigeneEvents = z.events.filter((e) => e.mitarbeiterId === effektiv);
        setTagEvents(eigeneEvents);
        setTagStatus(ermittleStatus(eigeneEvents));
      } else {
        setTagEvents(s.heute);
        setTagStatus(s.status);
      }
    } catch (e) {
      setFehler(fehlerText(e));
    }
  }, []);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      await ladeAlles('');
      if (!abgebrochen) setLaden(false);
    })();
    return () => {
      abgebrochen = true;
    };
  }, [ladeAlles]);

  const eigenId = statusAntwort?.mitarbeiter?.id ?? '';
  const effektiveId = zielId || eigenId;
  const zielMitarbeiter: ZeitMitarbeiter | null =
    mitarbeiterListe.find((m) => m.id === effektiveId) ??
    (statusAntwort?.mitarbeiter && statusAntwort.mitarbeiter.id === effektiveId
      ? statusAntwort.mitarbeiter
      : null);
  const fuerFremden = !!effektiveId && effektiveId !== eigenId;
  const istLeitung = statusAntwort?.istLeitung ?? false;

  const auswertung = useMemo(() => {
    if (!statusAntwort || !effektiveId) return null;
    return werteTagAus(statusAntwort.datum, effektiveId, tagEvents, jetzt);
  }, [statusAntwort, effektiveId, tagEvents, jetzt]);

  const wechsleZiel = async (neu: string) => {
    setZielId(neu);
    setStempelFehler(null);
    setAktualisiert(true);
    await ladeAlles(neu);
    setAktualisiert(false);
  };

  const handleAktualisieren = async () => {
    setAktualisiert(true);
    await ladeAlles(zielId);
    setAktualisiert(false);
  };

  const handleStempeln = async (typ: Exclude<ZeitEventTyp, 'storno'>) => {
    if (stempelBusy) return;
    setStempelBusy(true);
    setStempelFehler(null);
    try {
      await zeiterfassungService.stempeln(typ, {
        ...(fuerFremden ? { mitarbeiterId: effektiveId } : {}),
      });
      await ladeAlles(zielId);
      setKorrekturZaehler((z) => z + 1);
    } catch (e) {
      setStempelFehler(fehlerText(e));
    } finally {
      setStempelBusy(false);
    }
  };

  const nachKorrektur = async () => {
    setKorrekturZaehler((z) => z + 1);
    await ladeAlles(zielId);
  };

  /* ---------------- Ladezustand ---------------- */

  if (laden) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 mx-auto animate-spin text-sky-600 dark:text-sky-400" />
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Lade Zeiterfassung…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface pb-safe">
      {/* Kopf */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-dark-surface/80 backdrop-blur-lg border-b border-gray-200 dark:border-dark-border">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-xl shadow-lg shrink-0">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                  Zeiterfassung
                </h1>
                <p className="text-sm text-gray-500 dark:text-dark-textMuted hidden sm:block">
                  Arbeitszeitnachweis nach ArbZG / MiLoG
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {istLeitung && (
                <button
                  type="button"
                  onClick={() => setDialog({ modus: 'nachtrag' })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-900/60 transition-colors"
                >
                  <FileClock className="w-4 h-4" />
                  <span className="hidden sm:inline">Nachtragen</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleAktualisieren}
                disabled={aktualisiert}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-dark-textMuted dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surfaceHover transition-colors"
                aria-label="Aktualisieren"
              >
                <RefreshCw className={`w-5 h-5 ${aktualisiert ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Ansichten */}
        <div className="px-4 pb-2 flex gap-2">
          {(
            [
              { id: 'heute' as const, text: 'Heute', icon: Timer },
              { id: 'monat' as const, text: 'Monat', icon: CalendarDays },
              // Die Team-Auswertung sieht fremde Arbeitszeiten und gehört
              // deshalb ausschließlich der Leitung — der Server setzt dieselbe
              // Grenze noch einmal durch.
              ...(istLeitung ? [{ id: 'team' as const, text: 'Team', icon: Users }] : []),
            ]
          ).map(({ id, text, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAnsicht(id)}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                ansicht === id
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-dark-surfaceHover'
              }`}
            >
              <Icon className="w-4 h-4" />
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 max-w-3xl mx-auto space-y-4">
        {fehler && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
            <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{fehler}</span>
          </div>
        )}

        {/* Mitarbeiterauswahl der Leitung */}
        {istLeitung && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-border p-3 sm:p-4">
            <label
              htmlFor="zeit-ziel-mitarbeiter"
              className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1"
            >
              Erfassung für
            </label>
            <select
              id="zeit-ziel-mitarbeiter"
              value={effektiveId}
              onChange={(e) => wechsleZiel(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            >
              {!effektiveId && <option value="">Bitte Mitarbeiter wählen…</option>}
              {mitarbeiterListe.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.id === eigenId ? ' (ich)' : ''}
                </option>
              ))}
            </select>
            {fuerFremden && (
              <p className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300">
                Achtung: Stempel und Korrekturen laufen auf {zielMitarbeiter?.name ?? 'diesen Mitarbeiter'},
                protokolliert wird dein Name.
              </p>
            )}
          </div>
        )}

        {/* Kein zugeordneter Mitarbeiter — in der Team-Auswertung irrelevant,
            die braucht keine Einzelperson. */}
        {!effektiveId && ansicht !== 'team' && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-border p-6 text-center">
            <UserX className="w-10 h-10 mx-auto text-gray-400 dark:text-dark-textSubtle" />
            <h2 className="mt-3 font-semibold text-gray-900 dark:text-white">
              {istLeitung ? 'Kein Mitarbeiter ausgewählt' : 'Kein Mitarbeiter zugeordnet'}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-dark-textMuted">
              {istLeitung
                ? 'Wähle oben aus, für wen du erfassen möchtest. Deinem eigenen Konto ist kein Mitarbeiter-Datensatz zugeordnet.'
                : 'Dein Portal-Konto ist noch keinem Mitarbeiter-Datensatz zugeordnet. Solange das so ist, kannst du keine Zeiten stempeln — die Stempel hätten sonst keinen Träger. Bitte die Betriebsleitung, dein Konto in der Mitarbeiterverwaltung zu verknüpfen.'}
            </p>
          </div>
        )}

        {/* Heute */}
        {ansicht === 'heute' && effektiveId && auswertung && (
          <>
            <StempelKarte
              mitarbeiterName={zielMitarbeiter?.name ?? 'Unbekannt'}
              fuerFremden={fuerFremden}
              status={tagStatus}
              auswertung={auswertung}
              jetzt={jetzt}
              busy={stempelBusy || aktualisiert}
              fehler={stempelFehler}
              onStempeln={handleStempeln}
            />
            <TagesDetail
              auswertung={auswertung}
              events={tagEvents}
              istLeitung={istLeitung}
              zeigeSummen={false}
              onStornieren={
                istLeitung ? (ev) => setDialog({ modus: 'storno', event: ev }) : undefined
              }
            />
          </>
        )}

        {/* Monat */}
        {ansicht === 'monat' && effektiveId && (
          <MonatsUebersicht
            mitarbeiterId={effektiveId}
            mitarbeiterName={zielMitarbeiter?.name ?? 'Unbekannt'}
            istLeitung={istLeitung}
            onStornieren={
              istLeitung ? (ev) => setDialog({ modus: 'storno', event: ev }) : undefined
            }
            neuLadenSchluessel={korrekturZaehler}
          />
        )}

        {/* Team — Auswertung über alle Mitarbeiter, nur für die Leitung */}
        {ansicht === 'team' && istLeitung && (
          <TeamUebersicht
            neuLadenSchluessel={korrekturZaehler}
            onMitarbeiterWaehlen={(id) => {
              setZielId(id);
              setAnsicht('monat');
            }}
          />
        )}
      </div>

      {dialog && (
        <NachtragDialog
          modus={dialog.modus}
          mitarbeiter={mitarbeiterListe}
          vorauswahlMitarbeiterId={effektiveId || undefined}
          event={dialog.event}
          onClose={() => setDialog(null)}
          onFertig={nachKorrektur}
        />
      )}
    </div>
  );
}
