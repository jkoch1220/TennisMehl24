import { useState, useEffect } from 'react';
import {
  Phone,
  ChevronDown,
  ChevronUp,
  Check,
  Pencil,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  X,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import {
  LeitfadenAbschnitt,
  DEFAULT_LEITFADEN,
  parseLeitfaden,
} from '../../constants/salesLeitfaden';
import {
  getStammdatenOderDefault,
  speichereSalesLeitfaden,
} from '../../services/stammdatenService';
import { verschiebeInListe as verschiebe } from '../../utils/listeVerschieben';

interface AnfrageSalesLeitfadenProps {
  /** Notizen aus dem Telefonat – landen als Kundennotiz im Projekt. */
  notizen?: string;
  onNotizenChange?: (notizen: string) => void;
}

function neueId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function AnfrageSalesLeitfaden({ notizen, onNotizenChange }: AnfrageSalesLeitfadenProps) {
  const [offen, setOffen] = useState(true);
  const [abschnitte, setAbschnitte] = useState<LeitfadenAbschnitt[]>(DEFAULT_LEITFADEN);
  const [entwurf, setEntwurf] = useState<LeitfadenAbschnitt[] | null>(null);
  const [erledigt, setErledigt] = useState<Record<string, boolean>>({});
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Solange die gespeicherte Vorlage nicht geladen ist, darf nicht bearbeitet
  // werden — sonst würde Speichern die Firmenvorlage mit dem Default überschreiben.
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    let aktiv = true;
    getStammdatenOderDefault()
      .then((stammdaten) => {
        if (aktiv) setAbschnitte(parseLeitfaden(stammdaten));
      })
      .catch(() => {
        if (aktiv) setAbschnitte(DEFAULT_LEITFADEN);
      })
      .finally(() => {
        if (aktiv) setGeladen(true);
      });
    return () => {
      aktiv = false;
    };
  }, []);

  const bearbeitet = entwurf !== null;
  const anzeige = entwurf ?? abschnitte;
  const gesamtFragen = anzeige.reduce((sum, a) => sum + a.fragen.length, 0);
  const gesamtErledigt = Object.values(erledigt).filter(Boolean).length;

  const patchAbschnitt = (index: number, patch: Partial<LeitfadenAbschnitt>) => {
    setEntwurf((prev) => (prev ?? abschnitte).map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const patchFrage = (aIndex: number, fIndex: number, patch: { frage?: string; ziel?: string }) => {
    setEntwurf((prev) =>
      (prev ?? abschnitte).map((a, i) =>
        i !== aIndex ? a : { ...a, fragen: a.fragen.map((f, j) => (j === fIndex ? { ...f, ...patch } : f)) }
      )
    );
  };

  const speichern = async () => {
    if (!entwurf) return;
    if (
      !window.confirm(
        'Der Leitfaden ist eine gemeinsame Vorlage: Die Änderung gilt ab sofort für alle Nutzer. Speichern?'
      )
    ) {
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      await speichereSalesLeitfaden(JSON.stringify(entwurf));
      setAbschnitte(entwurf);
      setEntwurf(null);
    } catch (error) {
      setFehler('Speichern fehlgeschlagen: ' + (error as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl overflow-hidden">
      <div className="flex items-start justify-between gap-2 p-4 flex-wrap">
        <button
          type="button"
          onClick={() => setOffen((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1"
        >
          <Phone className="w-5 h-5 text-indigo-600 flex-shrink-0" />
          <h4 className="font-bold text-indigo-800 dark:text-indigo-300 text-left min-w-0">
            Sales-Leitfaden fürs Telefonat
          </h4>
          <span className="text-xs font-medium text-indigo-500 dark:text-indigo-400 bg-white dark:bg-slate-900 rounded-full px-2 py-0.5 flex-shrink-0">
            {gesamtErledigt}/{gesamtFragen}
          </span>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!bearbeitet ? (
            <button
              type="button"
              disabled={!geladen}
              onClick={() => {
                setEntwurf(abschnitte);
                setOffen(true);
              }}
              title={
                geladen
                  ? 'Leitfaden bearbeiten (gemeinsame Vorlage für alle Nutzer)'
                  : 'Vorlage wird geladen …'
              }
              className="p-1.5 rounded-lg text-indigo-600 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-40"
            >
              <Pencil className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEntwurf(DEFAULT_LEITFADEN)}
                title="Auf Standardvorlage zurücksetzen"
                className="p-1.5 rounded-lg text-indigo-600 hover:bg-white dark:hover:bg-slate-900"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntwurf(null);
                  setFehler(null);
                }}
                title="Änderungen verwerfen"
                className="p-1.5 rounded-lg text-gray-500 hover:bg-white dark:hover:bg-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={speichern}
                disabled={speichert}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {speichert ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Speichern
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOffen((v) => !v)}
            className="p-1.5 rounded-lg text-indigo-600 hover:bg-white dark:hover:bg-slate-900"
          >
            {offen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {offen && (
        <div className="px-4 pb-4 space-y-4">
          {fehler && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg p-2">
              {fehler}
            </p>
          )}

          {anzeige.map((abschnitt, aIndex) => (
            <div key={abschnitt.id}>
              <div className="flex items-start gap-2 mb-1.5">
                <span className="text-sm font-bold text-indigo-400 dark:text-indigo-500 mt-0.5">
                  {aIndex + 1}.
                </span>
                {bearbeitet ? (
                  <div className="flex-1 space-y-1">
                    <input
                      value={abschnitt.titel}
                      onChange={(e) => patchAbschnitt(aIndex, { titel: e.target.value })}
                      placeholder="Titel des Abschnitts"
                      className="w-full px-2 py-1 text-sm font-bold rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-100"
                    />
                    <input
                      value={abschnitt.technik}
                      onChange={(e) => patchAbschnitt(aIndex, { technik: e.target.value })}
                      placeholder="Verkaufstechnik (z. B. Situationsfragen)"
                      className="w-full px-2 py-1 text-xs italic rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-500 dark:text-indigo-400"
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-2 flex-1">
                    <span className="text-sm font-bold text-indigo-800 dark:text-indigo-300">
                      {abschnitt.titel}
                    </span>
                    <span className="text-xs text-indigo-400 dark:text-indigo-500 italic">
                      {abschnitt.technik}
                    </span>
                  </div>
                )}
                {bearbeitet && (
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setEntwurf(verschiebe(anzeige, aIndex, -1))}
                      disabled={aIndex === 0}
                      title="Abschnitt nach oben"
                      className="p-1 rounded text-indigo-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntwurf(verschiebe(anzeige, aIndex, 1))}
                      disabled={aIndex === anzeige.length - 1}
                      title="Abschnitt nach unten"
                      className="p-1 rounded text-indigo-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntwurf(anzeige.filter((_, i) => i !== aIndex))}
                      title="Abschnitt löschen"
                      className="p-1 rounded text-red-500 hover:bg-white dark:hover:bg-slate-900"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                {abschnitt.fragen.map((f, fIndex) => {
                  if (bearbeitet) {
                    return (
                      <div
                        key={f.id}
                        className="flex items-start gap-1.5 p-2 rounded-lg bg-white/70 dark:bg-slate-900/40"
                      >
                        <div className="flex-1 space-y-1">
                          <textarea
                            value={f.frage}
                            onChange={(e) => patchFrage(aIndex, fIndex, { frage: e.target.value })}
                            rows={2}
                            placeholder="Frage, die Ronnie stellt"
                            className="w-full px-2 py-1 text-sm rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-100 resize-none"
                          />
                          <textarea
                            value={f.ziel}
                            onChange={(e) => patchFrage(aIndex, fIndex, { ziel: e.target.value })}
                            rows={2}
                            placeholder="Ziel / Hinweis zur Frage"
                            className="w-full px-2 py-1 text-xs rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-500 dark:text-indigo-400 resize-none"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              patchAbschnitt(aIndex, { fragen: verschiebe(abschnitt.fragen, fIndex, -1) })
                            }
                            disabled={fIndex === 0}
                            title="Frage nach oben"
                            className="p-1 rounded text-indigo-500 hover:bg-indigo-50 dark:hover:bg-slate-800 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              patchAbschnitt(aIndex, { fragen: verschiebe(abschnitt.fragen, fIndex, 1) })
                            }
                            disabled={fIndex === abschnitt.fragen.length - 1}
                            title="Frage nach unten"
                            className="p-1 rounded text-indigo-500 hover:bg-indigo-50 dark:hover:bg-slate-800 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              patchAbschnitt(aIndex, {
                                fragen: abschnitt.fragen.filter((_, j) => j !== fIndex),
                              })
                            }
                            title="Frage löschen"
                            className="p-1 rounded text-red-500 hover:bg-indigo-50 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const isErledigt = !!erledigt[f.id];
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setErledigt((prev) => ({ ...prev, [f.id]: !prev[f.id] }))}
                      className="w-full flex items-start gap-2 text-left p-2 rounded-lg hover:bg-white/60 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                          isErledigt
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {isErledigt && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span>
                        <span
                          className={`text-sm ${
                            isErledigt
                              ? 'text-indigo-400 dark:text-indigo-600 line-through'
                              : 'text-indigo-900 dark:text-indigo-100'
                          }`}
                        >
                          {f.frage}
                        </span>
                        {f.ziel && (
                          <span className="block text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">
                            {f.ziel}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}

                {bearbeitet && (
                  <button
                    type="button"
                    onClick={() =>
                      patchAbschnitt(aIndex, {
                        fragen: [...abschnitt.fragen, { id: neueId('frage'), frage: '', ziel: '' }],
                      })
                    }
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-900"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Frage hinzufügen
                  </button>
                )}
              </div>
            </div>
          ))}

          {bearbeitet && (
            <button
              type="button"
              onClick={() =>
                setEntwurf([
                  ...anzeige,
                  { id: neueId('abschnitt'), titel: '', technik: '', fragen: [{ id: neueId('frage'), frage: '', ziel: '' }] },
                ])
              }
              className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900"
            >
              <Plus className="w-4 h-4" />
              Abschnitt hinzufügen
            </button>
          )}

          {!bearbeitet && onNotizenChange && (
            <div className="pt-3 border-t border-indigo-200 dark:border-indigo-800">
              <label className="block text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-1.5">
                Notizen aus dem Telefonat
              </label>
              <textarea
                value={notizen ?? ''}
                onChange={(e) => onNotizenChange(e.target.value)}
                rows={4}
                placeholder="Antworten des Kunden, Konkurrenzpreis, Wechselgrund, vereinbarter Folgetermin …"
                className="w-full px-3 py-2 text-sm rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-100 resize-y"
              />
              <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-1">
                Wird als Kundennotiz ins Projekt übernommen.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
