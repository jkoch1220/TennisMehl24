import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  BarChart3,
  RefreshCw,
  Search,
  HardHat,
  CalendarDays,
  ListPlus,
  Archive,
  ArchiveRestore,
  FileText,
  X,
} from 'lucide-react';
import { PlatzbauermitVereinen, PBVStatistik } from '../../types/platzbauer';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import PlatzbauerlListe from './PlatzbauerlListe';
import PlatzbauerlStatistik from './PlatzbauerlStatistik';
import PlatzbauerlDetailPopup from './PlatzbauerlDetailPopup';
import PlatzbauerStandardartikelTab from './PlatzbauerStandardartikelTab';
import PlatzbauerBelegtexteTab from './PlatzbauerBelegtexteTab';

type ViewMode = 'liste' | 'statistik' | 'standardartikel' | 'belegtexte';

// Session Storage Keys
const STORAGE_KEYS = {
  viewMode: 'pbv_viewMode',
  saisonjahr: 'pbv_saisonjahr',
  archiv: 'pbv_archiv',
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
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    // Gespeicherte Werte validieren (z.B. entferntes 'kanban' aus alten Sessions)
    const stored = loadSetting<string>(STORAGE_KEYS.viewMode, 'liste');
    return ['statistik', 'standardartikel', 'belegtexte'].includes(stored)
      ? (stored as ViewMode)
      : 'liste';
  });
  const [saisonjahr, setSaisonjahrState] = useState(() =>
    loadSetting(STORAGE_KEYS.saisonjahr, new Date().getFullYear())
  );
  const [suche, setSuche] = useState('');
  /**
   * Archivansicht: zeigt AUSSCHLIESSLICH archivierte Platzbauer. Der
   * Kundenstamm führt achtzig; gearbeitet wird mit einer Handvoll. Archivieren
   * löscht nichts — Projekte und Belege bleiben, der Platzbauer verschwindet
   * nur aus Liste, Statistik und Auswertungen.
   */
  const [archivAnsicht, setArchivAnsichtState] = useState(() =>
    loadSetting(STORAGE_KEYS.archiv, false)
  );
  const [loading, setLoading] = useState(true);
  const [platzbauer, setPlatzbauer] = useState<PlatzbauermitVereinen[]>([]);
  const [statistik, setStatistik] = useState<PBVStatistik | null>(null);
  const [showSaisonprojekteDialog, setShowSaisonprojekteDialog] = useState(false);
  /**
   * Projektzahlen der Nachbarsaisons. Die Verwaltung zeigt immer nur EIN Jahr;
   * wer die Vereinbarungen der kommenden Saison anlegt, sucht sie danach im
   * laufenden Jahr und findet nichts. Der Hinweis unter der Kopfzeile nennt
   * die Saison, in der etwas liegt, und schaltet auf Klick um.
   */
  const [projekteJeSaison, setProjekteJeSaison] = useState<Record<number, number>>({});
  const [erstellteSaisonprojekte, setErstellteSaisonprojekte] = useState(0);

  // Wrapper mit Storage
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    saveSetting(STORAGE_KEYS.viewMode, mode);
  }, []);

  const setArchivAnsicht = useCallback((wert: boolean) => {
    setArchivAnsichtState(wert);
    saveSetting(STORAGE_KEYS.archiv, wert);
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
        platzbauerverwaltungService.loadAllePlatzbauermitVereinen(saisonjahr, {
          mitArchivierten: archivAnsicht,
        }),
        platzbauerverwaltungService.berechneStatistik(saisonjahr),
      ]);
      setPlatzbauer(pbData);
      setStatistik(stats);
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setLoading(false);
    }
  }, [saisonjahr, archivAnsicht]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let abgebrochen = false;
    platzbauerverwaltungService
      .zaehleProjekteJeSaison([saisonjahr - 1, saisonjahr, saisonjahr + 1])
      .then((zahlen) => {
        if (!abgebrochen) setProjekteJeSaison(zahlen);
      })
      .catch((error) => console.warn('Projektzahlen nicht ermittelbar:', error));
    return () => {
      abgebrochen = true;
    };
  }, [saisonjahr]);

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

  /** Platzbauer archivieren oder zurückholen — beides mit Rückfrage. */
  /**
   * Archivieren ohne Nachfrage und ohne Neuladen (10.09.2026).
   *
   * Vorher: `window.confirm`, dann `loadData()` — die ganze Seite lud neu,
   * Suchfeld und Scrollposition inklusive. Wer achtzig Platzbauer durchsieht,
   * wartet damit achtzig Mal.
   *
   * Jetzt verschwindet die Karte sofort, der Server erfährt es im Hintergrund,
   * und statt einer Rückfrage VOR der Aktion gibt es „Rückgängig" DANACH.
   * Schlägt das Speichern fehl, kommt die Karte an ihre Stelle zurück.
   */
  const [rueckgaengig, setRueckgaengig] = useState<
    Array<{ eintrag: PlatzbauermitVereinen; index: number; richtung: 'archiviert' | 'zurückgeholt' }>
  >([]);
  const rueckgaengigTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Die Leiste blendet sich nach acht Sekunden aus — Zeit genug für ein Versehen. */
  const merkeFuerRueckgaengig = useCallback(
    (eintrag: PlatzbauermitVereinen, index: number, richtung: 'archiviert' | 'zurückgeholt') => {
      setRueckgaengig((prev) => [...prev, { eintrag, index, richtung }]);
      if (rueckgaengigTimer.current) clearTimeout(rueckgaengigTimer.current);
      rueckgaengigTimer.current = setTimeout(() => setRueckgaengig([]), 8000);
    },
    []
  );

  useEffect(
    () => () => {
      if (rueckgaengigTimer.current) clearTimeout(rueckgaengigTimer.current);
    },
    []
  );

  /** Karte an ihrer alten Stelle wieder einsetzen. */
  const setzeZurueck = (eintrag: PlatzbauermitVereinen, index: number) => {
    setPlatzbauer((prev) => {
      const kopie = [...prev];
      kopie.splice(Math.min(index, kopie.length), 0, eintrag);
      return kopie;
    });
  };

  const handleArchivieren = async (platzbauerId: string) => {
    const index = platzbauer.findIndex((pb) => pb.platzbauer.id === platzbauerId);
    if (index < 0) return;
    const eintrag = platzbauer[index];

    setPlatzbauer((prev) => prev.filter((pb) => pb.platzbauer.id !== platzbauerId));
    setStatistik((prev) =>
      prev ? { ...prev, gesamtPlatzbauer: Math.max(0, prev.gesamtPlatzbauer - 1) } : prev
    );
    merkeFuerRueckgaengig(eintrag, index, 'archiviert');

    try {
      await platzbauerverwaltungService.archivierePlatzbauer(platzbauerId);
    } catch (error) {
      console.error('Archivieren fehlgeschlagen:', error);
      setzeZurueck(eintrag, index);
      setStatistik((prev) =>
        prev ? { ...prev, gesamtPlatzbauer: prev.gesamtPlatzbauer + 1 } : prev
      );
      setRueckgaengig((prev) => prev.filter((r) => r.eintrag.platzbauer.id !== platzbauerId));
      window.alert(`„${eintrag.platzbauer.name}" konnte nicht archiviert werden.`);
    }
  };

  const handleAusArchiv = async (platzbauerId: string) => {
    const index = platzbauer.findIndex((pb) => pb.platzbauer.id === platzbauerId);
    if (index < 0) return;
    const eintrag = platzbauer[index];

    setPlatzbauer((prev) => prev.filter((pb) => pb.platzbauer.id !== platzbauerId));
    // Er zählt ab jetzt wieder zu den aktiven — auch wenn die Archivansicht
    // ihn selbst nicht mehr zeigt.
    setStatistik((prev) =>
      prev ? { ...prev, gesamtPlatzbauer: prev.gesamtPlatzbauer + 1 } : prev
    );
    merkeFuerRueckgaengig(eintrag, index, 'zurückgeholt');

    try {
      await platzbauerverwaltungService.holePlatzbauerAusArchiv(platzbauerId);
    } catch (error) {
      console.error('Zurückholen fehlgeschlagen:', error);
      setzeZurueck(eintrag, index);
      setStatistik((prev) =>
        prev ? { ...prev, gesamtPlatzbauer: Math.max(0, prev.gesamtPlatzbauer - 1) } : prev
      );
      setRueckgaengig((prev) => prev.filter((r) => r.eintrag.platzbauer.id !== platzbauerId));
      window.alert(`„${eintrag.platzbauer.name}" konnte nicht zurückgeholt werden.`);
    }
  };

  /** Den zuletzt archivierten (bzw. zurückgeholten) Platzbauer wiederherstellen. */
  const macheRueckgaengig = async () => {
    const letzter = rueckgaengig[rueckgaengig.length - 1];
    if (!letzter) return;
    setRueckgaengig((prev) => prev.slice(0, -1));
    setzeZurueck(letzter.eintrag, letzter.index);
    setStatistik((prev) =>
      prev
        ? {
            ...prev,
            gesamtPlatzbauer:
              letzter.richtung === 'archiviert'
                ? prev.gesamtPlatzbauer + 1
                : Math.max(0, prev.gesamtPlatzbauer - 1),
          }
        : prev
    );

    try {
      if (letzter.richtung === 'archiviert') {
        await platzbauerverwaltungService.holePlatzbauerAusArchiv(letzter.eintrag.platzbauer.id);
      } else {
        await platzbauerverwaltungService.archivierePlatzbauer(letzter.eintrag.platzbauer.id);
      }
    } catch (error) {
      console.error('Rückgängig fehlgeschlagen:', error);
      window.alert('Das ließ sich nicht rückgängig machen. Bitte die Ansicht neu laden.');
    }
  };

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
            <button
              onClick={() => setViewMode('standardartikel')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'standardartikel'
                  ? 'bg-white dark:bg-dark-bg text-amber-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Standard-Angebotsartikel für alle Platzbauer pflegen"
            >
              <ListPlus className="w-4 h-4" />
              <span className="hidden md:inline">Standardartikel</span>
            </button>
            <button
              onClick={() => setViewMode('belegtexte')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'belegtexte'
                  ? 'bg-white dark:bg-dark-bg text-amber-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Anrede, Einleitung, Überschriften und Grußformel der Belege pflegen"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden md:inline">Belegtexte</span>
            </button>
          </div>

          {/* Archivansicht */}
          <button
            onClick={() => setArchivAnsicht(!archivAnsicht)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              archivAnsicht
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
            title={
              archivAnsicht
                ? 'Zurück zu den aktiven Platzbauern'
                : 'Archivierte Platzbauer anzeigen'
            }
          >
            {archivAnsicht ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            <span className="hidden md:inline">{archivAnsicht ? 'Archiv verlassen' : 'Archiv'}</span>
          </button>
        </div>
      </div>

      {/* Andere Saison hat Projekte: Der häufigste Grund, warum jemand ein eben
          angelegtes Angebot „nicht findet" — es liegt in der Folgesaison. */}
      {(() => {
        const andere = Object.entries(projekteJeSaison)
          .map(([jahr, anzahl]) => ({ jahr: Number(jahr), anzahl }))
          .filter((e) => e.jahr !== saisonjahr && e.anzahl > 0)
          .sort((a, b) => b.jahr - a.jahr);
        if (andere.length === 0) return null;
        return (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span>
              Angezeigt wird <strong>Saison {saisonjahr}</strong>
              {projekteJeSaison[saisonjahr] !== undefined && (
                <> ({projekteJeSaison[saisonjahr]} Projekte)</>
              )}
              .
            </span>
            {andere.map((eintrag) => (
              <button
                key={eintrag.jahr}
                onClick={() => setSaisonjahr(eintrag.jahr)}
                className="underline underline-offset-2 font-medium hover:text-amber-700 dark:hover:text-amber-100"
              >
                Saison {eintrag.jahr} ({eintrag.anzahl}) anzeigen
              </button>
            ))}
          </div>
        );
      })()}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Lade Platzbauer...</span>
        </div>
      ) : viewMode === 'standardartikel' ? (
        <PlatzbauerStandardartikelTab />
      ) : viewMode === 'belegtexte' ? (
        <PlatzbauerBelegtexteTab />
      ) : viewMode === 'liste' ? (
        <PlatzbauerlListe
          platzbauer={gefiltertePlatzbauer}
          onSelectPlatzbauer={setSelectedPlatzbauerId}
          saisonjahr={saisonjahr}
          onRefresh={loadData}
          archivAnsicht={archivAnsicht}
          onArchivieren={handleArchivieren}
          onAusArchiv={handleAusArchiv}
        />
      ) : (
        <PlatzbauerlStatistik
          statistik={statistik}
          platzbauer={platzbauer}
          saisonjahr={saisonjahr}
        />
      )}

      {/* Rückgängig-Leiste: erscheint statt einer Rückfrage vor der Aktion.
          Sie überlagert nichts Wichtiges und verschwindet nach acht Sekunden. */}
      {rueckgaengig.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg bg-gray-900 text-white dark:bg-slate-800">
          <Archive className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-sm">
            {rueckgaengig.length === 1 ? (
              <>
                <strong>{rueckgaengig[0].eintrag.platzbauer.name}</strong>{' '}
                {rueckgaengig[0].richtung}
              </>
            ) : (
              <>
                <strong>{rueckgaengig.length}</strong> Platzbauer{' '}
                {rueckgaengig[rueckgaengig.length - 1].richtung}
              </>
            )}
          </span>
          <button
            onClick={macheRueckgaengig}
            className="text-sm font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2"
          >
            Rückgängig
          </button>
          <button
            onClick={() => setRueckgaengig([])}
            className="text-gray-400 hover:text-white"
            title="Ausblenden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
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
