import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  LayoutGrid,
  BarChart3,
  RefreshCw,
  Search,
  HardHat,
  CalendarDays,
} from 'lucide-react';
import { PlatzbauermitVereinen, PBVStatistik } from '../../types/platzbauer';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import PlatzbauerlListe from './PlatzbauerlListe';
import PlatzbauerlKanban from './PlatzbauerlKanban';
import PlatzbauerlStatistik from './PlatzbauerlStatistik';
import PlatzbauerlDetailPopup from './PlatzbauerlDetailPopup';

type ViewMode = 'liste' | 'kanban' | 'statistik';

// Session Storage Keys
const STORAGE_KEYS = {
  viewMode: 'pbv_viewMode',
  saisonjahr: 'pbv_saisonjahr',
};

const loadSetting = <T,>(key: string, defaultValue: T): T => {
  try {
    const stored = sessionStorage.getItem(key);
    if (stored !== null) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Fehler beim Laden der Einstellung:', e);
  }
  return defaultValue;
};

const saveSetting = <T,>(key: string, value: T): void => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Fehler beim Speichern der Einstellung:', e);
  }
};

const PlatzbauerverwaltungPage = () => {
  // URL-Parameter für persistente Dialog-Zustände
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPlatzbauerId = searchParams.get('platzbauer');
  const selectedProjektId = searchParams.get('projekt');

  // Setter für URL-Parameter
  const setSelectedPlatzbauerId = useCallback((id: string | null) => {
    setSearchParams(prev => {
      if (id) {
        prev.set('platzbauer', id);
      } else {
        prev.delete('platzbauer');
        prev.delete('projekt'); // Projekt auch schließen wenn Platzbauer geschlossen wird
      }
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const setSelectedProjektId = useCallback((id: string | null) => {
    setSearchParams(prev => {
      if (id) {
        prev.set('projekt', id);
      } else {
        prev.delete('projekt');
      }
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  // State
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    loadSetting(STORAGE_KEYS.viewMode, 'liste')
  );
  const [saisonjahr, setSaisonjahrState] = useState(() =>
    loadSetting(STORAGE_KEYS.saisonjahr, new Date().getFullYear())
  );
  const [suche, setSuche] = useState('');
  const [loading, setLoading] = useState(true);
  const [platzbauer, setPlatzbauer] = useState<PlatzbauermitVereinen[]>([]);
  const [statistik, setStatistik] = useState<PBVStatistik | null>(null);
  const [showSaisonprojekteDialog, setShowSaisonprojekteDialog] = useState(false);
  const [erstellteSaisonprojekte, setErstellteSaisonprojekte] = useState(0);

  // Wrapper mit Storage
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    saveSetting(STORAGE_KEYS.viewMode, mode);
  }, []);

  const setSaisonjahr = useCallback((jahr: number) => {
    setSaisonjahrState(jahr);
    saveSetting(STORAGE_KEYS.saisonjahr, jahr);
  }, []);

  // Daten laden
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pbData, stats] = await Promise.all([
        platzbauerverwaltungService.loadAllePlatzbauermitVereinen(saisonjahr),
        platzbauerverwaltungService.berechneStatistik(saisonjahr),
      ]);
      setPlatzbauer(pbData);
      setStatistik(stats);
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setLoading(false);
    }
  }, [saisonjahr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter nach Suche
  const gefiltertePlatzbauer = platzbauer.filter(pb => {
    if (!suche.trim()) return true;
    const sucheLower = suche.toLowerCase();
    return (
      pb.platzbauer.name.toLowerCase().includes(sucheLower) ||
      pb.platzbauer.lieferadresse?.ort?.toLowerCase().includes(sucheLower) ||
      pb.vereine.some(v => v.kunde.name.toLowerCase().includes(sucheLower))
    );
  });

  // Saisonprojekte erstellen
  const handleErstelleSaisonprojekte = async () => {
    try {
      const erstellt = await platzbauerverwaltungService.erstelleSaisonprojekteFuerAllePlatzbauer(saisonjahr);
      setErstellteSaisonprojekte(erstellt.length);
      setShowSaisonprojekteDialog(true);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Erstellen der Saisonprojekte:', error);
    }
  };

  // Jahre für Dropdown
  const verfuegbareJahre = [2024, 2025, 2026, 2027, 2028];

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
              <HardHat className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                Platzbauer-Verwaltung
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                {statistik ? `${statistik.gesamtPlatzbauer} Platzbauer · ${statistik.gesamtVereine} Vereine` : 'Lädt...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Saisonjahr-Auswahl */}
            <select
              value={saisonjahr}
              onChange={(e) => setSaisonjahr(Number(e.target.value))}
              className="px-3 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:border-amber-500 focus:outline-none"
            >
              {verfuegbareJahre.map(jahr => (
                <option key={jahr} value={jahr}>Saison {jahr}</option>
              ))}
            </select>

            {/* Saisonprojekte erstellen */}
            <button
              onClick={handleErstelleSaisonprojekte}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
              title="Saisonprojekte für alle Platzbauer erstellen"
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden md:inline">Saisonprojekte</span>
            </button>

            {/* Aktualisieren */}
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-dark-surface rounded-lg transition-colors disabled:opacity-50"
              title="Aktualisieren"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Suchleiste und View-Switcher */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mt-4">
          {/* Suche */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Platzbauer oder Verein suchen..."
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* View-Switcher */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-dark-surface rounded-lg">
            <button
              onClick={() => setViewMode('liste')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'liste'
                  ? 'bg-white dark:bg-dark-bg text-amber-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="hidden md:inline">Liste</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-dark-bg text-amber-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden md:inline">Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('statistik')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'statistik'
                  ? 'bg-white dark:bg-dark-bg text-amber-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden md:inline">Statistik</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Lade Platzbauer...</span>
        </div>
      ) : viewMode === 'liste' ? (
        <PlatzbauerlListe
          platzbauer={gefiltertePlatzbauer}
          onSelectPlatzbauer={setSelectedPlatzbauerId}
          saisonjahr={saisonjahr}
          onRefresh={loadData}
        />
      ) : viewMode === 'kanban' ? (
        <PlatzbauerlKanban
          saisonjahr={saisonjahr}
          filter={{ suche }}
          onRefresh={loadData}
        />
      ) : (
        <PlatzbauerlStatistik
          statistik={statistik}
          platzbauer={platzbauer}
          saisonjahr={saisonjahr}
        />
      )}

      {/* Detail-Popup */}
      {selectedPlatzbauerId && (
        <PlatzbauerlDetailPopup
          platzbauerId={selectedPlatzbauerId}
          saisonjahr={saisonjahr}
          onClose={() => setSelectedPlatzbauerId(null)}
          onRefresh={loadData}
          selectedProjektId={selectedProjektId}
          setSelectedProjektId={setSelectedProjektId}
        />
      )}

      {/* Saisonprojekte-Dialog */}
      {showSaisonprojekteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-surface rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarDays className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Saisonprojekte erstellt
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {erstellteSaisonprojekte > 0 ? (
                  <>Es wurden <span className="font-semibold text-green-600">{erstellteSaisonprojekte}</span> neue Saisonprojekte für {saisonjahr} erstellt.</>
                ) : (
                  <>Alle Platzbauer haben bereits Saisonprojekte für {saisonjahr}.</>
                )}
              </p>
              <button
                onClick={() => setShowSaisonprojekteDialog(false)}
                className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
              >
                Verstanden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatzbauerverwaltungPage;
