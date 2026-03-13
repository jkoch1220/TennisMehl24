import { useState, useMemo } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Package, Tag, Droplets, Scissors } from 'lucide-react';
import { Projekt } from '../../types/projekt';
import { projektService } from '../../services/projektService';
import { Position } from '../../types/projektabwicklung';

interface ProjektSplitBannerProps {
  projekt: Projekt;
  onSplitClick: (typ: 'universal' | 'hydrocourt') => void;
}

/**
 * Banner für Projekte mit gemischten Artikelgruppen.
 * Zeigt einen Info-Banner wenn ein Projekt sowohl eigene Produkte als auch
 * Universal- und/oder Hydrocourt-Artikel enthält.
 */
const ProjektSplitBanner = ({ projekt, onSplitClick }: ProjektSplitBannerProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Analysiere Positionen des Projekts
  const analyse = useMemo(() => {
    return projektService.analysierePositionen(projekt);
  }, [projekt]);

  // Berechne Summen für jede Gruppe
  const berechneSumme = (positionen: Position[]): number => {
    return positionen.reduce((sum, p) => sum + (p.gesamtpreis || 0), 0);
  };

  const summeEigene = berechneSumme(analyse.eigeneProdukte);
  const summeUniversal = berechneSumme(analyse.universalArtikel);
  const summeHydrocourt = berechneSumme(analyse.hydrocourtArtikel);

  // Nicht anzeigen wenn keine gemischten Gruppen
  if (!analyse.hatGemischteGruppen) {
    return null;
  }

  // Formatiere Währung
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  return (
    <div className="mb-6 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-900/30 dark:via-yellow-900/30 dark:to-orange-900/30 border border-amber-300 dark:border-amber-700 rounded-xl overflow-hidden shadow-sm">
      {/* Header - immer sichtbar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-amber-100/50 dark:hover:bg-amber-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-200 dark:bg-amber-800 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-amber-900 dark:text-amber-200">
              Gemischte Artikelgruppen
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Dieses Projekt enthält Artikel mit unterschiedlichen Workflows
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Kompakte Badges */}
          <div className="hidden md:flex items-center gap-2">
            {analyse.eigeneProdukte.length > 0 && (
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                {analyse.eigeneProdukte.length}× Eigene
              </span>
            )}
            {analyse.universalArtikel.length > 0 && (
              <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-full text-xs font-medium">
                {analyse.universalArtikel.length}× Universal
              </span>
            )}
            {analyse.hydrocourtArtikel.length > 0 && (
              <span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 rounded-full text-xs font-medium">
                {analyse.hydrocourtArtikel.length}× Hydrocourt
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          )}
        </div>
      </button>

      {/* Expandierter Bereich */}
      {isExpanded && (
        <div className="px-5 pb-5 pt-2 border-t border-amber-200 dark:border-amber-700/50 animate-in slide-in-from-top-2 duration-200">
          {/* Artikelgruppen-Übersicht */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {/* Eigene Produkte */}
            {analyse.eigeneProdukte.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded">
                    <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-200">
                    Eigene Produkte
                  </h4>
                </div>
                <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 mb-2">
                  {analyse.eigeneProdukte.slice(0, 3).map((p, i) => (
                    <li key={i} className="truncate">
                      • {p.menge}× {p.bezeichnung}
                    </li>
                  ))}
                  {analyse.eigeneProdukte.length > 3 && (
                    <li className="text-gray-500 dark:text-gray-400">
                      + {analyse.eigeneProdukte.length - 3} weitere...
                    </li>
                  )}
                </ul>
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Summe: {formatCurrency(summeEigene)}
                </div>
                <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                  → Wird über Dispo geliefert
                </div>
              </div>
            )}

            {/* Universal-Artikel */}
            {analyse.universalArtikel.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-orange-200 dark:border-orange-800 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-orange-100 dark:bg-orange-900/50 rounded">
                    <Tag className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h4 className="font-semibold text-orange-900 dark:text-orange-200">
                    Universal-Artikel
                  </h4>
                </div>
                <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 mb-2">
                  {analyse.universalArtikel.slice(0, 3).map((p, i) => (
                    <li key={i} className="truncate">
                      • {p.menge}× {p.bezeichnung}
                    </li>
                  ))}
                  {analyse.universalArtikel.length > 3 && (
                    <li className="text-gray-500 dark:text-gray-400">
                      + {analyse.universalArtikel.length - 3} weitere...
                    </li>
                  )}
                </ul>
                <div className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  Summe: {formatCurrency(summeUniversal)}
                </div>
                <div className="mt-2 text-xs text-orange-600 dark:text-orange-400">
                  → Lieferschein an Schnepper/Universal
                </div>
              </div>
            )}

            {/* Hydrocourt-Artikel */}
            {analyse.hydrocourtArtikel.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-cyan-200 dark:border-cyan-800 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-cyan-100 dark:bg-cyan-900/50 rounded">
                    <Droplets className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <h4 className="font-semibold text-cyan-900 dark:text-cyan-200">
                    Hydrocourt (TM-HYC)
                  </h4>
                </div>
                <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 mb-2">
                  {analyse.hydrocourtArtikel.slice(0, 3).map((p, i) => (
                    <li key={i} className="truncate">
                      • {p.menge}× {p.bezeichnung}
                    </li>
                  ))}
                  {analyse.hydrocourtArtikel.length > 3 && (
                    <li className="text-gray-500 dark:text-gray-400">
                      + {analyse.hydrocourtArtikel.length - 3} weitere...
                    </li>
                  )}
                </ul>
                <div className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                  Summe: {formatCurrency(summeHydrocourt)}
                </div>
                <div className="mt-2 text-xs text-cyan-600 dark:text-cyan-400">
                  → CSV an Schwab senden
                </div>
              </div>
            )}
          </div>

          {/* Aktionsbereich */}
          {analyse.splitMoeglich ? (
            <div className="bg-amber-100/50 dark:bg-amber-900/20 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-amber-900 dark:text-amber-200 mb-1">
                    Projekte aufteilen für saubere Workflows
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Erstelle separate Teilprojekte für Universal/Hydrocourt mit eigenem Lieferschein & Rechnung.
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {analyse.universalArtikel.length > 0 && analyse.eigeneProdukte.length > 0 && (
                    <button
                      onClick={() => onSplitClick('universal')}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
                    >
                      <Scissors className="w-4 h-4" />
                      Universal-Projekt erstellen
                    </button>
                  )}
                  {analyse.hydrocourtArtikel.length > 0 && (analyse.eigeneProdukte.length > 0 || analyse.universalArtikel.length > 0) && (
                    <button
                      onClick={() => onSplitClick('hydrocourt')}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
                    >
                      <Scissors className="w-4 h-4" />
                      Hydrocourt-Projekt erstellen
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : analyse.splitBlockiert ? (
            <div className="bg-gray-100 dark:bg-slate-700/50 rounded-lg p-4 text-center">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {analyse.splitBlockiert}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ProjektSplitBanner;
