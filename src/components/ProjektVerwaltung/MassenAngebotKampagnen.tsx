import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Layers, Package, Wrench, Truck, Calendar, Trash2, ChevronRight, Warehouse,
  CheckCircle2, Send, FileEdit, XCircle, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { massenAngebotKampagnenService } from '../../services/massenAngebotKampagnenService';
import {
  MassenAngebotKampagne, MassenAngebotTyp, KampagnenStatus,
  MASSEN_ANGEBOT_TYP_LABELS, MASSEN_ANGEBOT_TYP_BESCHREIBUNG, KAMPAGNEN_STATUS_LABELS,
} from '../../types/massenAngebot';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Übersicht der Massen-Angebote einer Saison.
 *
 * Ein Massen-Angebot entsteht nicht in einer Sitzung: mehrere hundert Vereine,
 * E-Mails klären, Mengen prüfen, Rückfragen. Diese Liste ist der Einstieg —
 * anlegen, wiederfinden, weiterarbeiten. Pro Saison und Sortiment kann es
 * mehrere geben („Schüttgut Nordbayern", „Schüttgut Rest").
 */

const TYP_SYMBOL: Record<MassenAngebotTyp, typeof Package> = {
  schuettgut: Truck,
  fruehjahrsinstandsetzung: Wrench,
  paletten: Package,
  abholung: Warehouse,
};

const TYP_FARBE: Record<MassenAngebotTyp, string> = {
  schuettgut: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  fruehjahrsinstandsetzung: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  paletten: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  abholung: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
};

const STATUS_STIL: Record<KampagnenStatus, { klasse: string; icon: typeof FileEdit }> = {
  entwurf: { klasse: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300', icon: FileEdit },
  in_bearbeitung: { klasse: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300', icon: RefreshCw },
  versendet: { klasse: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300', icon: Send },
  abgebrochen: { klasse: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300', icon: XCircle },
};

interface Props {
  saisonjahr: number;
  onOeffnen: (kampagne: MassenAngebotKampagne) => void;
}

export default function MassenAngebotKampagnen({ saisonjahr, onOeffnen }: Props) {
  const { user } = useAuth();
  const [kampagnen, setKampagnen] = useState<MassenAngebotKampagne[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [zeigeNeu, setZeigeNeu] = useState(false);
  const [neuTyp, setNeuTyp] = useState<MassenAngebotTyp>('schuettgut');
  const [neuName, setNeuName] = useState('');
  const [speichert, setSpeichert] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true);
    setKampagnen(await massenAngebotKampagnenService.ladeKampagnen(saisonjahr));
    setLaedt(false);
  }, [saisonjahr]);

  useEffect(() => { void laden(); }, [laden]);

  const anlegen = async () => {
    setSpeichert(true);
    try {
      const neu = await massenAngebotKampagnenService.erstelleKampagne({
        typ: neuTyp,
        saisonjahr,
        name: neuName,
        benutzer: user?.name || user?.email,
      });
      toast.success(`„${neu.name}" angelegt`);
      setZeigeNeu(false);
      setNeuName('');
      await laden();
      onOeffnen(neu);
    } catch (error) {
      toast.error(`Anlegen fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      setSpeichert(false);
    }
  };

  const [loescht, setLoescht] = useState<{ id: string; erledigt: number; gesamt: number } | null>(null);

  const loeschen = async (k: MassenAngebotKampagne) => {
    // Bewusst mit Zahl im Text: „Wirklich löschen?" verschweigt, wie viel Arbeit
    // daran hängt. 340 geprüfte Zeilen sind mehrere Tage.
    const frage = k.anzahlZeilen > 0
      ? `„${k.name}" mit ${k.anzahlZeilen} Zeilen unwiderruflich löschen?`
      : `„${k.name}" löschen?`;
    if (!window.confirm(frage)) return;
    setLoescht({ id: k.id, erledigt: 0, gesamt: k.anzahlZeilen });
    try {
      await massenAngebotKampagnenService.loescheKampagne(k.id, {
        onFortschritt: (erledigt, gesamt) => setLoescht({ id: k.id, erledigt, gesamt }),
      });
      toast.success('Gelöscht');
      await laden();
    } catch (error) {
      // Teilweise gelöscht: Der Rest lässt sich durch erneutes Löschen
      // aufräumen — bereits entfernte Zeilen werden dabei übersprungen.
      toast.error(
        `${error instanceof Error ? error.message : 'Löschen fehlgeschlagen'} — erneut versuchen, der Rest wird nachgeholt.`
      );
      await laden();
    } finally {
      setLoescht(null);
    }
  };

  const fortschritt = (k: MassenAngebotKampagne) =>
    k.anzahlZeilen > 0 ? Math.round((k.anzahlGeprueft / k.anzahlZeilen) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            Massen-Angebote · Saison {saisonjahr}
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Jedes Sortiment bekommt einen eigenen Lauf — Schüttgut, Frühjahrsinstandsetzung und
            Palettenware werden unterschiedlich kalkuliert und disponiert.
          </p>
        </div>
        <button
          onClick={() => setZeigeNeu(true)}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Neues Massen-Angebot
        </button>
      </div>

      {zeigeNeu && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Sortiment</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(MASSEN_ANGEBOT_TYP_LABELS) as MassenAngebotTyp[]).map((typ) => {
                const Icon = TYP_SYMBOL[typ];
                const aktiv = neuTyp === typ;
                return (
                  <button
                    key={typ}
                    onClick={() => setNeuTyp(typ)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      aktiv
                        ? 'border-emerald-500 bg-white dark:bg-slate-800 ring-2 ring-emerald-500/30'
                        : 'border-gray-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50 hover:border-gray-300'
                    }`}
                  >
                    <span className={`inline-flex items-center gap-2 font-semibold text-sm px-2 py-1 rounded ${TYP_FARBE[typ]}`}>
                      <Icon className="w-4 h-4" /> {MASSEN_ANGEBOT_TYP_LABELS[typ]}
                    </span>
                    <p className="text-xs text-gray-600 dark:text-slate-400 mt-2 leading-snug">
                      {MASSEN_ANGEBOT_TYP_BESCHREIBUNG[typ]}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Name <span className="font-normal text-gray-400">— optional</span>
            </label>
            <input
              value={neuName}
              onChange={(e) => setNeuName(e.target.value)}
              placeholder={`${MASSEN_ANGEBOT_TYP_LABELS[neuTyp]} ${saisonjahr}`}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void anlegen()}
              disabled={speichert}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {speichert ? 'Wird angelegt…' : 'Anlegen und öffnen'}
            </button>
            <button
              onClick={() => setZeigeNeu(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {laedt ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-8 text-center">Lade Massen-Angebote…</p>
      ) : kampagnen.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-slate-700">
          <Calendar className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-slate-400">
            Für Saison {saisonjahr} ist noch kein Massen-Angebot angelegt.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {kampagnen.map((k) => {
            const Icon = TYP_SYMBOL[k.typ];
            const St = STATUS_STIL[k.status];
            const gesperrt = k.status === 'versendet';
            return (
              <div
                key={k.id}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center gap-4 flex-wrap">
                  <button onClick={() => onOeffnen(k)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <span className={`p-2 rounded-lg ${TYP_FARBE[k.typ]}`}><Icon className="w-5 h-5" /></span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-gray-900 dark:text-dark-text truncate">{k.name}</span>
                      <span className="block text-xs text-gray-500 dark:text-slate-400">
                        {MASSEN_ANGEBOT_TYP_LABELS[k.typ]} · angelegt {k.erstelltAm.slice(0, 10).split('-').reverse().join('.')}
                        {k.erstelltVon ? ` von ${k.erstelltVon}` : ''}
                      </span>
                    </span>
                  </button>

                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${St.klasse}`}>
                    <St.icon className="w-3.5 h-3.5" /> {KAMPAGNEN_STATUS_LABELS[k.status]}
                  </span>

                  {k.anzahlZeilen > 0 && (
                    <span className="text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                      {k.anzahlGeprueft}/{k.anzahlZeilen} geprüft
                      {k.anzahlKompliziert > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" /> {k.anzahlKompliziert}
                        </span>
                      )}
                      {k.anzahlVersendet > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {k.anzahlVersendet} versendet
                        </span>
                      )}
                    </span>
                  )}

                  <div className="flex items-center gap-1">
                    {!gesperrt && (
                      <button
                        onClick={() => void loeschen(k)}
                        disabled={loescht !== null}
                        title="Massen-Angebot löschen"
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onOeffnen(k)}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"
                      title="Öffnen"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {loescht?.id === k.id ? (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Wird gelöscht… {loescht.erledigt} von {loescht.gesamt} Zeilen
                    </p>
                    <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 transition-all"
                        style={{ width: `${Math.round((loescht.erledigt / Math.max(1, loescht.gesamt)) * 100)}%` }} />
                    </div>
                  </div>
                ) : k.anzahlZeilen > 0 ? (
                  <div className="mt-3 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${fortschritt(k)}%` }} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
