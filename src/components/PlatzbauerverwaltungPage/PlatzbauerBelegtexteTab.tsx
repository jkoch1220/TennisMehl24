/**
 * Textbausteine der Platzbauer-Belege pflegen (10.09.2026).
 *
 * Anrede, Einleitung, Überschriften, Fußnoten und Grußformel standen fest im
 * PDF-Code — für eine Formulierungsänderung brauchte es einen Entwickler.
 * Hier werden sie gepflegt; gespeichert als JSON im Stammdaten-Feld
 * `platzbauerBelegtexte`, gelesen von `constants/platzbauerBelegtexte.ts`.
 *
 * Ein leeres Feld heißt „Vorlage gilt" — deshalb steht die Vorlage als
 * Platzhalter im Eingabefeld und lässt sich je Zeile zurücksetzen.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, FileText, Loader2, RotateCcw, Save } from 'lucide-react';
import {
  BELEGTEXTE_DEFAULT,
  Belegtext,
  leseBelegtexte,
} from '../../constants/platzbauerBelegtexte';
import {
  getStammdatenOderDefault,
  speicherePlatzbauerBelegtexte,
} from '../../services/stammdatenService';

/** Bausteine, die als mehrzeiliges Feld sinnvoller sind. */
const MEHRZEILIG = new Set(['preislisteFussnote', 'bedarfHinweis', 'grussformel']);

const PlatzbauerBelegtexteTab = () => {
  const [texte, setTexte] = useState<Belegtext[]>([]);
  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stammdaten = await getStammdatenOderDefault();
        setTexte(leseBelegtexte(stammdaten.platzbauerBelegtexte));
      } catch (e) {
        setFehler(e instanceof Error ? e.message : 'Texte konnten nicht geladen werden.');
      } finally {
        setLaden(false);
      }
    })();
  }, []);

  const aendern = (schluessel: string, text: string) => {
    setGespeichert(false);
    setTexte((prev) => prev.map((t) => (t.schluessel === schluessel ? { ...t, text } : t)));
  };

  const speichereTexte = async () => {
    setSpeichern(true);
    setFehler(null);
    try {
      await speicherePlatzbauerBelegtexte(JSON.stringify(texte));
      setGespeichert(true);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSpeichern(false);
    }
  };

  if (laden) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Lade Belegtexte...
      </div>
    );
  }

  const vorlage = new Map(BELEGTEXTE_DEFAULT.map((t) => [t.schluessel, t.text]));

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-500" />
              Belegtexte
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
              Diese Texte stehen auf Angebot, Auftragsbestätigung, Rechnung und Lieferschein der
              Platzbauer. Platzhalter werden beim Drucken ersetzt:{' '}
              <code className="text-xs">{'{platzbauer}'}</code>,{' '}
              <code className="text-xs">{'{saison}'}</code>,{' '}
              <code className="text-xs">{'{projekt}'}</code>,{' '}
              <code className="text-xs">{'{firma}'}</code>.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setTexte(BELEGTEXTE_DEFAULT.map((t) => ({ ...t })));
                setGespeichert(false);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
              title="Alle Texte auf die Vorlage zurücksetzen (noch nicht gespeichert)"
            >
              <RotateCcw className="w-4 h-4" />
              Vorlage
            </button>
            <button
              type="button"
              onClick={speichereTexte}
              disabled={speichern}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg"
            >
              {speichern ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : gespeichert ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {gespeichert ? 'Gespeichert' : 'Speichern'}
            </button>
          </div>
        </div>

        {fehler && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{fehler}</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {texte.map((eintrag) => {
          const standard = vorlage.get(eintrag.schluessel) ?? '';
          const abweichend = eintrag.text !== standard;
          return (
            <div
              key={eintrag.schluessel}
              className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {eintrag.beschreibung}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{eintrag.schluessel}</p>
                </div>
                {abweichend && (
                  <button
                    type="button"
                    onClick={() => aendern(eintrag.schluessel, standard)}
                    className="text-xs px-2 py-1 rounded text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 shrink-0"
                    title="Diesen Text auf die Vorlage zurücksetzen"
                  >
                    zurücksetzen
                  </button>
                )}
              </div>

              {MEHRZEILIG.has(eintrag.schluessel) ? (
                <textarea
                  value={eintrag.text}
                  onChange={(e) => aendern(eintrag.schluessel, e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                />
              ) : (
                <input
                  type="text"
                  value={eintrag.text}
                  onChange={(e) => aendern(eintrag.schluessel, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlatzbauerBelegtexteTab;
