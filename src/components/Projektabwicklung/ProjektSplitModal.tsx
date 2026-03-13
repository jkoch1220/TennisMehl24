import { useState, useMemo } from 'react';
import { X, Scissors, AlertTriangle, ArrowRight, Package, Tag, Droplets, Check, Loader2 } from 'lucide-react';
import { Projekt, TeilprojektTyp } from '../../types/projekt';
import { Position, AuftragsbestaetigungsDaten } from '../../types/projektabwicklung';
import { projektService } from '../../services/projektService';

interface ProjektSplitModalProps {
  projekt: Projekt;
  splitTyp: TeilprojektTyp;
  onClose: () => void;
  onSuccess: (neuesProjekt: Projekt, aktualisiertesQuellProjekt: Projekt) => void;
}

/**
 * Modal zur Bestätigung eines Projekt-Splits.
 * Zeigt Vorschau der ausgelagerten und verbleibenden Positionen.
 */
const ProjektSplitModal = ({ projekt, splitTyp, onClose, onSuccess }: ProjektSplitModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse AB-Daten und teile Positionen auf
  const { auszulagern, verbleibend } = useMemo(() => {
    const auszulagern: Position[] = [];
    const verbleibend: Position[] = [];

    if (projekt.auftragsbestaetigungsDaten) {
      try {
        const abDaten: AuftragsbestaetigungsDaten = JSON.parse(projekt.auftragsbestaetigungsDaten);
        if (abDaten?.positionen) {
          for (const position of abDaten.positionen) {
            const istUniversal = position.istUniversalArtikel === true ||
                                  position.beschreibung?.startsWith('Universal:');
            const istHydrocourt = position.artikelnummer === 'TM-HYC';

            if (splitTyp === 'universal' && istUniversal) {
              auszulagern.push(position);
            } else if (splitTyp === 'hydrocourt' && istHydrocourt) {
              auszulagern.push(position);
            } else {
              verbleibend.push(position);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    return { auszulagern, verbleibend };
  }, [projekt, splitTyp]);

  // Berechne Summen
  const summeAuszulagern = auszulagern.reduce((sum, p) => sum + (p.gesamtpreis || 0), 0);
  const summeVerbleibend = verbleibend.reduce((sum, p) => sum + (p.gesamtpreis || 0), 0);

  // Formatiere Währung
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  // Split durchführen
  const handleSplit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await projektService.splitProjekt(
        projekt.$id || projekt.id,
        splitTyp
      );

      onSuccess(result.neuesProjekt, result.aktualisiertesQuellProjekt);
    } catch (err) {
      console.error('Fehler beim Split:', err);
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler beim Aufteilen des Projekts.');
    } finally {
      setIsLoading(false);
    }
  };

  const typConfig = splitTyp === 'universal'
    ? {
        label: 'Universal-Artikel',
        icon: Tag,
        color: 'orange',
        gradient: 'from-orange-500 to-amber-500',
        hoverGradient: 'hover:from-orange-600 hover:to-amber-600',
        bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        borderColor: 'border-orange-200 dark:border-orange-800',
        textColor: 'text-orange-700 dark:text-orange-300',
        iconBg: 'bg-orange-100 dark:bg-orange-900/50',
      }
    : {
        label: 'Hydrocourt (TM-HYC)',
        icon: Droplets,
        color: 'cyan',
        gradient: 'from-cyan-500 to-blue-500',
        hoverGradient: 'hover:from-cyan-600 hover:to-blue-600',
        bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
        borderColor: 'border-cyan-200 dark:border-cyan-800',
        textColor: 'text-cyan-700 dark:text-cyan-300',
        iconBg: 'bg-cyan-100 dark:bg-cyan-900/50',
      };

  const TypeIcon = typConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`px-6 py-5 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r ${typConfig.bgColor}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 ${typConfig.iconBg} rounded-xl`}>
                <Scissors className={`w-6 h-6 ${typConfig.textColor}`} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {typConfig.label} auslagern
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                  Projekt: {projekt.kundenname}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              disabled={isLoading}
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Zwei-Spalten-Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Linke Seite - Wird ausgelagert */}
            <div className={`rounded-xl border-2 ${typConfig.borderColor} overflow-hidden`}>
              <div className={`px-4 py-3 ${typConfig.bgColor} border-b ${typConfig.borderColor}`}>
                <div className="flex items-center gap-2">
                  <TypeIcon className={`w-5 h-5 ${typConfig.textColor}`} />
                  <h3 className={`font-semibold ${typConfig.textColor}`}>
                    Wird ausgelagert
                  </h3>
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${typConfig.bgColor} ${typConfig.textColor}`}>
                    {auszulagern.length} Position{auszulagern.length !== 1 ? 'en' : ''}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {auszulagern.map((pos, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-sm"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {pos.bezeichnung}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {pos.menge} {pos.einheit} × {formatCurrency(pos.einzelpreis)}
                        </div>
                      </div>
                      <div className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(pos.gesamtpreis)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`mt-4 pt-3 border-t ${typConfig.borderColor} flex items-center justify-between`}>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Summe netto:</span>
                  <span className={`text-lg font-bold ${typConfig.textColor}`}>
                    {formatCurrency(summeAuszulagern)}
                  </span>
                </div>
              </div>
            </div>

            {/* Rechte Seite - Verbleibt */}
            <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-700 dark:text-blue-300" />
                  <h3 className="font-semibold text-blue-700 dark:text-blue-300">
                    Verbleibt im Originalprojekt
                  </h3>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                    {verbleibend.length} Position{verbleibend.length !== 1 ? 'en' : ''}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {verbleibend.map((pos, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-sm"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {pos.bezeichnung}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {pos.menge} {pos.einheit} × {formatCurrency(pos.einzelpreis)}
                        </div>
                      </div>
                      <div className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(pos.gesamtpreis)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-blue-200 dark:border-blue-800 flex items-center justify-between">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Summe netto:</span>
                  <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                    {formatCurrency(summeVerbleibend)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Info-Block */}
          <div className="mt-6 bg-gray-50 dark:bg-slate-800 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-gray-500" />
              Es wird ein neues Projekt erstellt mit:
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Gleicher Kunde:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-white">{projekt.kundenname}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Gleiche Lieferadresse</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Gleiche Zahlungsbedingungen</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Neue AB-Nummer wird generiert</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Status:</span>
                  <span className="ml-1 px-2 py-0.5 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded text-xs font-medium">
                    Auftragsbestätigung
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Verlinkung zum Original bleibt erhalten</span>
                </div>
              </div>
            </div>
          </div>

          {/* Warnung */}
          <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-900 dark:text-amber-200">
                  Diese Aktion kann nicht rückgängig gemacht werden
                </h4>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  Die ausgelagerten Positionen werden aus dem Originalprojekt entfernt und in ein neues Teilprojekt verschoben.
                  Beide Projekte sind danach eigenständig und können separat abgerechnet werden.
                </p>
              </div>
            </div>
          </div>

          {/* Error-Anzeige */}
          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSplit}
            disabled={isLoading || auszulagern.length === 0 || verbleibend.length === 0}
            className={`flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r ${typConfig.gradient} ${typConfig.hoverGradient} text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Wird aufgeteilt...
              </>
            ) : (
              <>
                <Scissors className="w-4 h-4" />
                Projekt aufteilen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjektSplitModal;
