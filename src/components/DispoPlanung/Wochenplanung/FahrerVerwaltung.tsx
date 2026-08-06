import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Pencil, Trash2, Check, Truck, ExternalLink } from 'lucide-react';
import type { Fahrer, NeuerFahrer, WochentagVerfuegbarkeit } from '../../../types/tour';
import { fahrerService } from '../../../services/fahrerService';
import { WOCHENTAGE_KURZ } from '../../../utils/kalenderwoche';

interface FahrerVerwaltungProps {
  open: boolean;
  onClose: () => void;
  /** Wird nach jeder Änderung gerufen, damit das Raster seine Achse neu lädt. */
  onFahrerGeaendert: () => void;
}

const WOCHENTAG_SCHLUESSEL: (keyof WochentagVerfuegbarkeit)[] = [
  'montag',
  'dienstag',
  'mittwoch',
  'donnerstag',
  'freitag',
  'samstag',
];

const leeresFormular = (): Partial<NeuerFahrer> => ({
  name: '',
  telefon: '',
  notizen: '',
  aktiv: true,
  istFremdfahrer: false,
  verfuegbarkeit: fahrerService.getStandardVerfuegbarkeit(),
  fuehrerscheinklassen: ['CE'],
  maxArbeitszeitMinuten: 540,
  pausenregelMinuten: 45,
});

const FahrerVerwaltung = ({ open, onClose, onFahrerGeaendert }: FahrerVerwaltungProps) => {
  const [fahrer, setFahrer] = useState<Fahrer[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [bearbeitet, setBearbeitet] = useState<Fahrer | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [formular, setFormular] = useState<Partial<NeuerFahrer>>(leeresFormular());
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      setFahrer(await fahrerService.loadFahrer());
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    if (open) void laden();
  }, [open, laden]);

  if (!open) return null;

  const formularOeffnen = (f: Fahrer | null) => {
    setFehler(null);
    setBearbeitet(f);
    setFormular(
      f
        ? {
            name: f.name,
            telefon: f.telefon ?? '',
            notizen: f.notizen ?? '',
            aktiv: f.aktiv,
            istFremdfahrer: f.istFremdfahrer ?? false,
            verfuegbarkeit: f.verfuegbarkeit,
            fuehrerscheinklassen: f.fuehrerscheinklassen,
            maxArbeitszeitMinuten: f.maxArbeitszeitMinuten,
            pausenregelMinuten: f.pausenregelMinuten,
          }
        : leeresFormular()
    );
    setZeigeFormular(true);
  };

  const speichern = async () => {
    const name = (formular.name ?? '').trim();
    if (!name) {
      setFehler('Bitte einen Namen angeben.');
      return;
    }
    const doppelt = fahrer.some(
      (f) => f.id !== bearbeitet?.id && f.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (doppelt) {
      setFehler(`Es gibt bereits einen Fahrer „${name}".`);
      return;
    }

    setSpeichert(true);
    setFehler(null);
    try {
      if (bearbeitet) {
        await fahrerService.updateFahrer(bearbeitet.id, { ...formular, name });
      } else {
        await fahrerService.createFahrer({ ...leeresFormular(), ...formular, name } as NeuerFahrer);
      }
      setZeigeFormular(false);
      setBearbeitet(null);
      await laden();
      onFahrerGeaendert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSpeichert(false);
    }
  };

  const aktivUmschalten = async (f: Fahrer) => {
    try {
      await fahrerService.updateFahrer(f.id, { aktiv: !f.aktiv });
      await laden();
      onFahrerGeaendert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Änderung fehlgeschlagen.');
    }
  };

  const loeschen = async (f: Fahrer) => {
    if (
      !confirm(
        `Fahrer „${f.name}" endgültig löschen?\n\nBereits geplante Touren behalten den Namen, verlieren aber die Verknüpfung. Zum Ausblenden im Raster genügt es, den Fahrer inaktiv zu setzen.`
      )
    ) {
      return;
    }
    try {
      await fahrerService.deleteFahrer(f.id);
      await laden();
      onFahrerGeaendert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    }
  };

  const verfuegbarkeitUmschalten = (tag: keyof WochentagVerfuegbarkeit) => {
    const aktuell = formular.verfuegbarkeit ?? fahrerService.getStandardVerfuegbarkeit();
    setFormular({
      ...formular,
      verfuegbarkeit: { ...aktuell, [tag]: !aktuell[tag] },
    });
  };

  const eigene = fahrer.filter((f) => !f.istFremdfahrer);
  const fremde = fahrer.filter((f) => f.istFremdfahrer);

  const fahrerZeile = (f: Fahrer) => (
    <div
      key={f.id}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
        f.aktiv
          ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
          : 'border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/50 opacity-60'
      }`}
    >
      <button
        onClick={() => void aktivUmschalten(f)}
        title={f.aktiv ? 'Im Raster ausblenden' : 'Im Raster anzeigen'}
        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
          f.aktiv
            ? 'bg-green-600 text-white'
            : 'bg-gray-200 dark:bg-slate-600 text-transparent hover:bg-gray-300'
        }`}
      >
        <Check className="w-3.5 h-3.5" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{f.name}</span>
          {f.istFremdfahrer && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 shrink-0">
              Fremd
            </span>
          )}
        </div>
        <div className="flex gap-1 mt-0.5">
          {WOCHENTAG_SCHLUESSEL.map((tag, i) => (
            <span
              key={tag}
              className={`text-[10px] w-5 text-center rounded ${
                f.verfuegbarkeit?.[tag]
                  ? 'bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-200'
                  : 'text-gray-300 dark:text-slate-600'
              }`}
            >
              {WOCHENTAGE_KURZ[i]}
            </span>
          ))}
          {f.telefon && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-2 truncate">
              {f.telefon}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => formularOeffnen(f)}
        className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
        title="Bearbeiten"
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        onClick={() => void loeschen(f)}
        className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
        title="Löschen"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Fahrer</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {fahrer.filter((f) => f.aktiv).length} aktiv von {fahrer.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex-1">
          {fehler && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
              {fehler}
            </div>
          )}

          {zeigeFormular ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  autoFocus
                  value={formular.name ?? ''}
                  onChange={(e) => setFormular({ ...formular, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  placeholder="z. B. Marco"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Telefon
                </label>
                <input
                  value={formular.telefon ?? ''}
                  onChange={(e) => setFormular({ ...formular, telefon: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Verfügbar an
                </span>
                <div className="flex gap-1.5">
                  {WOCHENTAG_SCHLUESSEL.map((tag, i) => {
                    const an = formular.verfuegbarkeit?.[tag] ?? false;
                    return (
                      <button
                        key={tag}
                        onClick={() => verfuegbarkeitUmschalten(tag)}
                        className={`w-11 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          an
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {WOCHENTAGE_KURZ[i]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formular.istFremdfahrer ?? false}
                  onChange={(e) => setFormular({ ...formular, istFremdfahrer: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Fremdfahrer / Subunternehmer
                </span>
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notiz
                </label>
                <textarea
                  rows={2}
                  value={formular.notizen ?? ''}
                  onChange={(e) => setFormular({ ...formular, notizen: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => void speichern()}
                  disabled={speichert}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium"
                >
                  {speichert ? 'Speichert…' : bearbeitet ? 'Speichern' : 'Anlegen'}
                </button>
                <button
                  onClick={() => {
                    setZeigeFormular(false);
                    setBearbeitet(null);
                    setFehler(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : laedt ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Lädt…</p>
          ) : fahrer.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Noch keine Fahrer angelegt.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Der Fahrerstamm lässt sich auch per{' '}
                <code className="px-1 rounded bg-gray-100 dark:bg-slate-700">
                  node scripts/setup-fahrer-stammdaten.mjs
                </code>{' '}
                befüllen.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {eigene.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Eigene Fahrer
                  </h3>
                  {eigene.map(fahrerZeile)}
                </div>
              )}
              {fremde.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Fremdfahrer
                  </h3>
                  {fremde.map(fahrerZeile)}
                </div>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 pt-1">
                <ExternalLink className="w-3 h-3" />
                Das Häkchen steuert, ob der Fahrer eine Zeile im Wochenraster bekommt.
              </p>
            </div>
          )}
        </div>

        {!zeigeFormular && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={() => formularOeffnen(null)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              <Plus className="w-4 h-4" />
              Fahrer anlegen
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FahrerVerwaltung;
