import { ScrollText, FileText, RotateCcw } from 'lucide-react';
import { VertragsKlausel } from '../../types/projektabwicklung';
import { KlauselVorlage } from '../../constants/vertragsklauseln';

interface VertragsklauselnKarteProps {
  klauseln?: VertragsKlausel[];
  agbAnhaengen?: boolean;
  disabled: boolean;
  vorlagen: KlauselVorlage[];
  onKlauselnChange: (klauseln: VertragsKlausel[]) => void;
  onAgbAnhaengenChange: (agbAnhaengen: boolean) => void;
}

/**
 * Karte für Angebot/AB: Weitere Vertragsklauseln (Checkbox + editierbarer Text
 * je Klausel, analog zum Dieselpreiszuschlag) sowie der Schalter für den
 * AGB-Kleintext-Anhang. Vorlagen werden unter Stammdaten → „Klauseln & AGB" gepflegt.
 */
const VertragsklauselnKarte = ({
  klauseln,
  agbAnhaengen,
  disabled,
  vorlagen,
  onKlauselnChange,
  onAgbAnhaengenChange,
}: VertragsklauselnKarteProps) => {
  const handleKlauselChange = (index: number, aenderung: Partial<VertragsKlausel>) => {
    if (!klauseln) return;
    onKlauselnChange(klauseln.map((k, i) => (i === index ? { ...k, ...aenderung } : k)));
  };

  const handleZuruecksetzen = (index: number) => {
    if (!klauseln) return;
    const vorlage = vorlagen.find((v) => v.id === klauseln[index].id);
    if (vorlage) {
      handleKlauselChange(index, { titel: vorlage.titel, text: vorlage.text });
    }
  };

  return (
    <>
      {/* Weitere Vertragsklauseln */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-2">
          <ScrollText className="h-5 w-5 text-red-600 dark:text-red-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Weitere Vertragsklauseln</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-dark-textMuted mb-4">
          Aktivierte Klauseln werden auf dem Dokument gedruckt. Vorlagen unter Stammdaten → „Klauseln &amp; AGB" pflegen.
        </p>

        {!klauseln?.length ? (
          <p className="text-sm text-gray-400 dark:text-dark-textSubtle italic">
            Keine Klausel-Vorlagen vorhanden. Vorlagen unter Stammdaten → „Klauseln &amp; AGB" anlegen.
          </p>
        ) : (
          <div className="space-y-4">
            {klauseln.map((klausel, index) => (
              <div key={klausel.id} className="pb-4 border-b border-gray-100 dark:border-slate-800 last:border-b-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <input
                    id={`vertragsklausel-${klausel.id}`}
                    type="checkbox"
                    checked={klausel.aktiviert}
                    onChange={(e) => handleKlauselChange(index, { aktiviert: e.target.checked })}
                    disabled={disabled}
                    className="mt-1 w-4 h-4 text-red-600 border-gray-300 dark:border-slate-700 rounded focus:ring-red-500 disabled:opacity-50"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={`vertragsklausel-${klausel.id}`}
                      className="block text-sm font-medium text-gray-900 dark:text-dark-text"
                    >
                      {klausel.titel}
                    </label>
                    {!klausel.aktiviert && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-dark-textMuted line-clamp-2">{klausel.text}</p>
                    )}
                  </div>
                </div>

                {klausel.aktiviert && (
                  <div className="mt-3 ml-7">
                    <textarea
                      value={klausel.text}
                      onChange={(e) => handleKlauselChange(index, { text: e.target.value })}
                      disabled={disabled}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => handleZuruecksetzen(index)}
                      disabled={disabled || !vorlagen.some((v) => v.id === klausel.id)}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500 dark:text-dark-textMuted hover:text-gray-700 dark:hover:text-dark-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Auf Vorlage zurücksetzen
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AGB-Anhang */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-start gap-3">
          <input
            id="agbAnhaengen"
            type="checkbox"
            checked={agbAnhaengen ?? true}
            onChange={(e) => onAgbAnhaengenChange(e.target.checked)}
            disabled={disabled}
            className="mt-1 w-4 h-4 text-red-600 border-gray-300 dark:border-slate-700 rounded focus:ring-red-500 disabled:opacity-50"
          />
          <div className="flex-1">
            <label htmlFor="agbAnhaengen" className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-dark-text">
              <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
              AGB als Anhang drucken
            </label>
            <p className="mt-1 text-xs text-gray-600 dark:text-dark-textMuted">
              Die Allgemeinen Geschäftsbedingungen werden als zweispaltiger Kleintext auf der/den letzten Seite(n)
              angehängt. Der AGB-Text wird unter Stammdaten → „Klauseln &amp; AGB" gepflegt.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default VertragsklauselnKarte;
