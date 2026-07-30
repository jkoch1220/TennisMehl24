import { ScrollText, RotateCcw, FileText } from 'lucide-react';
import { VertragsKlausel } from '../../types/projektabwicklung';
import { KlauselVorlage } from '../../constants/vertragsklauseln';

interface AnfrageKlauselnKarteProps {
  klauseln: VertragsKlausel[];
  agbAnhaengen: boolean;
  vorlagen: KlauselVorlage[];
  onKlauselnChange: (klauseln: VertragsKlausel[]) => void;
  onAgbAnhaengenChange: (agbAnhaengen: boolean) => void;
}

/**
 * Klauseln + AGB-Anhang für das Angebot aus einer Anfrage.
 *
 * Inhaltlich dasselbe wie Projektabwicklung/VertragsklauselnKarte, aber im
 * Layout des Anfrage-Dialogs (graue Sektion, rounded-2xl, h3 mit Icon) und als
 * eine Sektion statt zwei separater Karten.
 */
export default function AnfrageKlauselnKarte({
  klauseln,
  agbAnhaengen,
  vorlagen,
  onKlauselnChange,
  onAgbAnhaengenChange,
}: AnfrageKlauselnKarteProps) {
  const aendereKlausel = (index: number, aenderung: Partial<VertragsKlausel>) => {
    onKlauselnChange(klauseln.map((k, i) => (i === index ? { ...k, ...aenderung } : k)));
  };

  const zuruecksetzen = (index: number) => {
    const vorlage = vorlagen.find((v) => v.id === klauseln[index].id);
    if (vorlage) {
      aendereKlausel(index, { titel: vorlage.titel, text: vorlage.text });
    }
  };

  const anzahlAktiv = klauseln.filter((k) => k.aktiviert).length;

  return (
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-6">
      <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
        <ScrollText className="w-5 h-5 text-amber-600" />
        Klauseln &amp; Bedingungen
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-900 rounded-full px-2 py-0.5">
          {anzahlAktiv + (agbAnhaengen ? 1 : 0)} aktiv
        </span>
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Angehakte Punkte werden im Angebot ausgewiesen. Vorlagen unter Stammdaten → „Klauseln &amp; AGB".
      </p>

      <div className="space-y-2">
        {klauseln.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
            Keine Klausel-Vorlagen vorhanden. Vorlagen unter Stammdaten → „Klauseln &amp; AGB" anlegen.
          </p>
        )}

        {klauseln.map((klausel, index) => (
          <div
            key={klausel.id}
            className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700"
          >
            <div className="flex items-start gap-3">
              <input
                id={`anfrage-klausel-${klausel.id}`}
                type="checkbox"
                checked={klausel.aktiviert}
                onChange={(e) => aendereKlausel(index, { aktiviert: e.target.checked })}
                className="mt-0.5 w-4 h-4 text-amber-600 border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-amber-500 flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`anfrage-klausel-${klausel.id}`}
                  className="block text-sm font-medium text-gray-900 dark:text-white cursor-pointer"
                >
                  {klausel.titel}
                </label>
                {!klausel.aktiviert && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{klausel.text}</p>
                )}
              </div>
            </div>

            {klausel.aktiviert && (
              <div className="mt-2 ml-7">
                <textarea
                  value={klausel.text}
                  onChange={(e) => aendereKlausel(index, { text: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-y"
                />
                <button
                  type="button"
                  onClick={() => zuruecksetzen(index)}
                  disabled={!vorlagen.some((v) => v.id === klausel.id)}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Auf Vorlage zurücksetzen
                </button>
              </div>
            )}
          </div>
        ))}

        {/* AGB-Anhang */}
        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
          <div className="flex items-start gap-3">
            <input
              id="anfrage-agb-anhaengen"
              type="checkbox"
              checked={agbAnhaengen}
              onChange={(e) => onAgbAnhaengenChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-amber-600 border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-amber-500 flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <label
                htmlFor="anfrage-agb-anhaengen"
                className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white cursor-pointer"
              >
                <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
                AGB als Anhang drucken
              </label>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Werden als zweispaltiger Kleintext auf den letzten Seiten angehängt.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
