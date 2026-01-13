import { useState, useEffect, useCallback, DragEvent, useMemo } from 'react';
import {
  FileCheck,
  FileSignature,
  Truck,
  FileText,
  CheckCircle2,
  RefreshCw,
  Search,
  MapPin,
  Euro,
  Package,
  GripVertical,
  Layers,
  Pencil,
  Trash2,
  X,
  Send,
  XCircle,
  ChevronDown,
  ChevronUp,
  List,
  LayoutGrid,
  Ban,
  Filter,
  Building2,
  BarChart3,
} from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';
import { projektService } from '../../services/projektService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { SaisonKunde } from '../../types/saisonplanung';
import { useNavigate } from 'react-router-dom';
import MobileProjektView from './MobileProjektView';
import ProjektStatistik from './ProjektStatistik';

// Hook für Mobile-Erkennung
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};

// Tab-Konfiguration mit Dark Mode Farben (ohne Verloren - wird separat behandelt)
const TABS: { id: ProjektStatus; label: string; icon: React.ComponentType<any>; color: string; darkColor: string; bgColor: string; darkBgColor: string }[] = [
  { id: 'angebot', label: 'Angebot', icon: FileCheck, color: 'text-blue-600', darkColor: 'dark:text-blue-400', bgColor: 'bg-blue-50 border-blue-200', darkBgColor: 'dark:bg-blue-950/50 dark:border-blue-800' },
  { id: 'angebot_versendet', label: 'Angebot versendet', icon: Send, color: 'text-indigo-600', darkColor: 'dark:text-indigo-400', bgColor: 'bg-indigo-50 border-indigo-200', darkBgColor: 'dark:bg-indigo-950/50 dark:border-indigo-800' },
  { id: 'auftragsbestaetigung', label: 'Auftragsbestätigung', icon: FileSignature, color: 'text-orange-600', darkColor: 'dark:text-orange-400', bgColor: 'bg-orange-50 border-orange-200', darkBgColor: 'dark:bg-orange-950/50 dark:border-orange-800' },
  { id: 'lieferschein', label: 'Lieferschein', icon: Truck, color: 'text-green-600', darkColor: 'dark:text-green-400', bgColor: 'bg-green-50 border-green-200', darkBgColor: 'dark:bg-green-950/50 dark:border-green-800' },
  { id: 'rechnung', label: 'Rechnung', icon: FileText, color: 'text-red-600', darkColor: 'dark:text-red-400', bgColor: 'bg-red-50 border-red-200', darkBgColor: 'dark:bg-red-950/50 dark:border-red-800' },
  { id: 'bezahlt', label: 'Bezahlt', icon: CheckCircle2, color: 'text-emerald-600', darkColor: 'dark:text-emerald-400', bgColor: 'bg-emerald-50 border-emerald-200', darkBgColor: 'dark:bg-emerald-950/50 dark:border-emerald-800' },
];

// Verloren-Tab separat (wird versteckt angezeigt)
const VERLOREN_TAB = { id: 'verloren' as ProjektStatus, label: 'Verloren', icon: XCircle, color: 'text-gray-500', darkColor: 'dark:text-gray-400', bgColor: 'bg-gray-100 border-gray-300', darkBgColor: 'dark:bg-gray-800/50 dark:border-gray-600' };

type ViewMode = 'kanban' | 'angebotsliste' | 'statistik';

// Session Storage Keys
const STORAGE_KEYS = {
  viewMode: 'projektverwaltung_viewMode',
  kompakteAnsicht: 'projektverwaltung_kompakteAnsicht',
  showVerlorenSpalte: 'projektverwaltung_showVerlorenSpalte',
};

// Helper: Lade Einstellung aus Session Storage
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

// Helper: Speichere Einstellung in Session Storage
const saveSetting = <T,>(key: string, value: T): void => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Fehler beim Speichern der Einstellung:', e);
  }
};

const ProjektVerwaltung = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [projekteGruppiert, setProjekteGruppiert] = useState<{
    angebot: Projekt[];
    angebot_versendet: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
    verloren: Projekt[];
  }>({
    angebot: [],
    angebot_versendet: [],
    auftragsbestaetigung: [],
    lieferschein: [],
    rechnung: [],
    bezahlt: [],
    verloren: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suche, setSuche] = useState('');
  const [draggedProjekt, setDraggedProjekt] = useState<Projekt | null>(null);
  const [dragOverTab, setDragOverTab] = useState<ProjektStatus | null>(null);
  const [saisonjahr] = useState(2026); // Aktuelle Saison
  const [editingProjekt, setEditingProjekt] = useState<Projekt | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showVerlorenSpalte, setShowVerlorenSpalteState] = useState(() =>
    loadSetting(STORAGE_KEYS.showVerlorenSpalte, false)
  );
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    loadSetting(STORAGE_KEYS.viewMode, 'kanban')
  );
  const [kompakteAnsicht, setKompakteAnsichtState] = useState(() =>
    loadSetting(STORAGE_KEYS.kompakteAnsicht, false)
  );
  const [kundenMap, setKundenMap] = useState<Map<string, SaisonKunde>>(new Map());

  // Wrapper-Funktionen die auch in Session Storage speichern
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    saveSetting(STORAGE_KEYS.viewMode, mode);
  }, []);

  const setKompakteAnsicht = useCallback((value: boolean) => {
    setKompakteAnsichtState(value);
    saveSetting(STORAGE_KEYS.kompakteAnsicht, value);
  }, []);

  const setShowVerlorenSpalte = useCallback((value: boolean) => {
    setShowVerlorenSpalteState(value);
    saveSetting(STORAGE_KEYS.showVerlorenSpalte, value);
  }, []);

  // Lade Daten inkl. Kundendaten für die Suche
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const gruppiert = await projektService.loadProjekteGruppiert(saisonjahr);
      setProjekteGruppiert(gruppiert);

      // Sammle alle einzigartigen kundeIds
      const alleProjekte = [
        ...gruppiert.angebot,
        ...gruppiert.angebot_versendet,
        ...gruppiert.auftragsbestaetigung,
        ...gruppiert.lieferschein,
        ...gruppiert.rechnung,
        ...gruppiert.bezahlt,
        ...gruppiert.verloren,
      ];
      const kundeIds = [...new Set(alleProjekte.map(p => p.kundeId).filter(Boolean))];

      // Lade alle Kunden parallel
      const kundenPromises = kundeIds.map(id =>
        saisonplanungService.loadKunde(id).catch(() => null)
      );
      const kunden = await Promise.all(kundenPromises);

      // Erstelle Map für schnellen Zugriff
      const neueKundenMap = new Map<string, SaisonKunde>();
      kunden.forEach(kunde => {
        if (kunde) {
          neueKundenMap.set(kunde.id, kunde);
        }
      });
      setKundenMap(neueKundenMap);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, [saisonjahr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter-Funktion - durchsucht Projekt UND verknüpften Kunden
  const filterProjekte = useCallback((projekte: Projekt[]) => {
    if (!suche) return projekte;
    const suchbegriffe = suche.toLowerCase().trim().split(/\s+/);

    return projekte.filter(p => {
      // Hole verknüpften Kunden aus der Map
      const kunde = p.kundeId ? kundenMap.get(p.kundeId) : null;

      // Alle durchsuchbaren Felder sammeln (Projekt + Kunde)
      const felder = [
        // Projekt-Felder
        p.kundenname || '',
        p.projektName || '',
        p.kundenstrasse || '',
        p.kundenPlzOrt || '',
        p.kundennummer ? String(p.kundennummer) : '',
        p.angebotsnummer || '',
        p.auftragsbestaetigungsnummer || '',
        p.rechnungsnummer || '',
        p.lieferscheinnummer || '',
        p.lieferadresse?.strasse || '',
        p.lieferadresse?.plz || '',
        p.lieferadresse?.ort || '',
        // Kunden-Felder (aus SaisonKunde)
        kunde?.name || '',
        kunde?.kundennummer || '',
        kunde?.adresse?.strasse || '',
        kunde?.adresse?.plz || '',
        kunde?.adresse?.ort || '',
        kunde?.email || '',
      ].map(f => f.toLowerCase());

      // Kombinierter Suchtext
      const suchtext = felder.join(' ');

      // Alle Suchbegriffe müssen gefunden werden (AND-Verknüpfung)
      return suchbegriffe.every(begriff => suchtext.includes(begriff));
    });
  }, [suche, kundenMap]);

  // Alle Projekte mit Angebot für die Angebotsliste
  const angebotsProjekte = useMemo(() => {
    const alleProjekte = [
      ...projekteGruppiert.angebot,
      ...projekteGruppiert.angebot_versendet,
      ...projekteGruppiert.auftragsbestaetigung,
      ...projekteGruppiert.lieferschein,
      ...projekteGruppiert.rechnung,
      ...projekteGruppiert.bezahlt,
      ...projekteGruppiert.verloren,
    ].filter(p => p.angebotsnummer);

    // Sortiere nach Angebotsnummer (neueste zuerst)
    return filterProjekte(alleProjekte).sort((a, b) => {
      const numA = a.angebotsnummer || '';
      const numB = b.angebotsnummer || '';
      return numB.localeCompare(numA);
    });
  }, [projekteGruppiert, filterProjekte]);

  // Drag & Drop Handler
  const handleDragStart = (e: DragEvent, projekt: Projekt) => {
    setDraggedProjekt(projekt);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', projekt.id);
  };

  const handleDragEnd = () => {
    setDraggedProjekt(null);
    setDragOverTab(null);
  };

  const handleDragOver = (e: DragEvent, tab: ProjektStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTab(tab);
  };

  const handleDragLeave = () => {
    setDragOverTab(null);
  };

  const handleDrop = async (e: DragEvent, zielTab: ProjektStatus) => {
    e.preventDefault();
    setDragOverTab(null);

    if (!draggedProjekt) return;

    await updateStatus(draggedProjekt, zielTab);
    setDraggedProjekt(null);
  };

  // Status Update
  const updateStatus = async (projekt: Projekt, neuerStatus: ProjektStatus) => {
    setSaving(true);
    try {
      const documentId = (projekt as any).$id || projekt.id;
      await projektService.updateProjektStatus(documentId, neuerStatus);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Status-Update:', error);
      alert('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Projekt als verloren markieren
  const handleMarkAsLost = async (e: React.MouseEvent, projekt: Projekt) => {
    e.stopPropagation();
    const bestaetigung = window.confirm(
      `Möchtest du das Projekt "${projekt.kundenname}" als verloren markieren?`
    );
    if (!bestaetigung) return;
    await updateStatus(projekt, 'verloren');
  };

  // Projekt-Klick Handler - Öffnet Formular
  const handleProjektClick = (projekt: Projekt) => {
    const projektId = (projekt as any).$id || projekt.id;
    navigate(`/bestellabwicklung/${projektId}`);
  };

  // Edit-Handler
  const handleEdit = (e: React.MouseEvent, projekt: Projekt) => {
    e.stopPropagation();
    setEditingProjekt(projekt);
    setShowEditModal(true);
  };

  // Speichern der bearbeiteten Projektdaten
  const handleSaveEdit = async (updatedProjekt: Partial<Projekt>) => {
    if (!editingProjekt) return;

    setSaving(true);
    try {
      const projektId = (editingProjekt as any).$id || editingProjekt.id;
      await projektService.updateProjekt(projektId, updatedProjekt);
      setShowEditModal(false);
      setEditingProjekt(null);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      alert('Fehler beim Speichern des Projekts. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Delete-Handler
  const handleDelete = async (e: React.MouseEvent, projekt: Projekt) => {
    e.stopPropagation();

    const bestaetigung = window.confirm(
      `Möchtest du das Projekt "${projekt.kundenname}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`
    );

    if (!bestaetigung) return;

    setSaving(true);
    try {
      await projektService.deleteProjekt(projekt);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Projekts. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Berechne Gesamtzahlen
  const gesamtAngebot = projekteGruppiert.angebot.length;
  const gesamtAngebotVersendet = projekteGruppiert.angebot_versendet.length;
  const gesamtAuftragsbestaetigung = projekteGruppiert.auftragsbestaetigung.length;
  const gesamtLieferschein = projekteGruppiert.lieferschein.length;
  const gesamtRechnung = projekteGruppiert.rechnung.length;
  const gesamtBezahlt = projekteGruppiert.bezahlt.length;
  const gesamtVerloren = projekteGruppiert.verloren.length;
  const gesamt = gesamtAngebot + gesamtAngebotVersendet + gesamtAuftragsbestaetigung + gesamtLieferschein + gesamtRechnung + gesamtBezahlt;

  // Helper für Count pro Status
  const getCount = (status: ProjektStatus) => {
    switch (status) {
      case 'angebot': return gesamtAngebot;
      case 'angebot_versendet': return gesamtAngebotVersendet;
      case 'auftragsbestaetigung': return gesamtAuftragsbestaetigung;
      case 'lieferschein': return gesamtLieferschein;
      case 'rechnung': return gesamtRechnung;
      case 'bezahlt': return gesamtBezahlt;
      case 'verloren': return gesamtVerloren;
      default: return 0;
    }
  };

  // Helper für Projekte pro Status
  const getProjekte = (status: ProjektStatus) => {
    return projekteGruppiert[status] || [];
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-600 dark:text-dark-textMuted">Lade Projekte...</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // MOBILE ANSICHT - Komplett neues UX-Konzept
  // ==========================================
  if (isMobile) {
    return (
      <MobileProjektView
        projekteGruppiert={projekteGruppiert}
        suche={suche}
        setSuche={setSuche}
        loading={loading}
        saving={saving}
        loadData={loadData}
        onProjektClick={handleProjektClick}
        onEdit={handleEdit}
        onDelete={handleDelete}
        saisonjahr={saisonjahr}
        filterProjekte={filterProjekte}
        editModal={
          showEditModal && editingProjekt ? (
            <ProjektEditModal
              projekt={editingProjekt}
              onSave={handleSaveEdit}
              onCancel={() => {
                setShowEditModal(false);
                setEditingProjekt(null);
              }}
            />
          ) : undefined
        }
      />
    );
  }

  // ==========================================
  // DESKTOP ANSICHT - Originales Kanban-Board
  // ==========================================
  return (
    <div className="p-6 max-w-[1900px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg dark:shadow-dark-lg">
              <Layers className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text">Projekt-Verwaltung</h1>
              <p className="text-gray-600 dark:text-dark-textMuted mt-1">
                {gesamt} aktive Projekte {gesamtVerloren > 0 && `• ${gesamtVerloren} verloren`} • Saison {saisonjahr}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Suche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-dark-textMuted" />
              <input
                type="text"
                placeholder="Verein, PLZ, Straße, Nummer..."
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                className="pl-10 pr-4 py-2 w-80 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent"
              />
              {suche && (
                <button
                  onClick={() => setSuche('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Ansicht umschalten */}
            <div className="flex border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-2 flex items-center gap-2 transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('angebotsliste')}
                className={`px-3 py-2 flex items-center gap-2 transition-colors ${
                  viewMode === 'angebotsliste'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Angebote</span>
              </button>
              <button
                onClick={() => setViewMode('statistik')}
                className={`px-3 py-2 flex items-center gap-2 transition-colors ${
                  viewMode === 'statistik'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Statistik</span>
              </button>
            </div>

            {/* Kompakte Ansicht Toggle (nur im Kanban) */}
            {viewMode === 'kanban' && (
              <button
                onClick={() => setKompakteAnsicht(!kompakteAnsicht)}
                className={`px-3 py-2 border rounded-lg flex items-center gap-2 transition-colors ${
                  kompakteAnsicht
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                    : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
                title="Kompakte Ansicht für viele Projekte"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Kompakt</span>
              </button>
            )}

            {/* Verloren-Spalte Toggle (nur im Kanban) */}
            {viewMode === 'kanban' && (
              <button
                onClick={() => setShowVerlorenSpalte(!showVerlorenSpalte)}
                className={`px-3 py-2 border rounded-lg flex items-center gap-2 transition-colors ${
                  showVerlorenSpalte
                    ? 'border-gray-500 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <XCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Verloren</span>
                {gesamtVerloren > 0 && (
                  <span className="text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                    {gesamtVerloren}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Aktualisieren</span>
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      {viewMode === 'kanban' && (
        <div className={`grid gap-3 ${showVerlorenSpalte ? 'grid-cols-7' : 'grid-cols-6'}`}>
          {TABS.map((tab) => {
            const projekte = filterProjekte(getProjekte(tab.id));
            const count = getCount(tab.id);

            return (
              <KanbanSpalte
                key={tab.id}
                tab={tab}
                projekte={projekte}
                count={count}
                dragOverTab={dragOverTab}
                kompakteAnsicht={kompakteAnsicht}
                kundenMap={kundenMap}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onProjektClick={handleProjektClick}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onMarkAsLost={handleMarkAsLost}
              />
            );
          })}

          {/* Verloren-Spalte (versteckt bis Toggle aktiviert) */}
          {showVerlorenSpalte && (
            <KanbanSpalte
              tab={VERLOREN_TAB}
              projekte={filterProjekte(getProjekte('verloren'))}
              count={gesamtVerloren}
              dragOverTab={dragOverTab}
              kompakteAnsicht={kompakteAnsicht}
              kundenMap={kundenMap}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onProjektClick={handleProjektClick}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onMarkAsLost={handleMarkAsLost}
              isVerloren
            />
          )}
        </div>
      )}

      {/* Angebotsliste */}
      {viewMode === 'angebotsliste' && (
        <AngebotListeView
          projekte={angebotsProjekte}
          onProjektClick={handleProjektClick}
        />
      )}

      {/* Statistik */}
      {viewMode === 'statistik' && (
        <ProjektStatistik projekteGruppiert={projekteGruppiert} />
      )}

      {/* Saving Overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-[60] flex items-center justify-center">
          <div className="bg-white dark:bg-dark-surface rounded-lg px-6 py-4 flex items-center gap-3 shadow-xl">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
            <span className="text-gray-700 dark:text-dark-textMuted font-medium">Speichere...</span>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingProjekt && (
        <ProjektEditModal
          projekt={editingProjekt}
          onSave={handleSaveEdit}
          onCancel={() => {
            setShowEditModal(false);
            setEditingProjekt(null);
          }}
        />
      )}
    </div>
  );
};

// Kanban-Spalte Komponente
interface KanbanSpalteProps {
  tab: { id: ProjektStatus; label: string; icon: React.ComponentType<any>; color: string; darkColor: string; bgColor: string; darkBgColor: string };
  projekte: Projekt[];
  count: number;
  dragOverTab: ProjektStatus | null;
  kompakteAnsicht: boolean;
  kundenMap: Map<string, SaisonKunde>;
  onDragOver: (e: DragEvent, tab: ProjektStatus) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent, tab: ProjektStatus) => void;
  onDragStart: (e: DragEvent, projekt: Projekt) => void;
  onDragEnd: () => void;
  onProjektClick: (projekt: Projekt) => void;
  onEdit: (e: React.MouseEvent, projekt: Projekt) => void;
  onDelete: (e: React.MouseEvent, projekt: Projekt) => void;
  onMarkAsLost: (e: React.MouseEvent, projekt: Projekt) => void;
  isVerloren?: boolean;
}

const KanbanSpalte = ({
  tab,
  projekte,
  count,
  dragOverTab,
  kompakteAnsicht,
  kundenMap,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  onProjektClick,
  onEdit,
  onDelete,
  onMarkAsLost,
  isVerloren,
}: KanbanSpalteProps) => {
  const TabIcon = tab.icon;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-lg dark:shadow-xl border-2 transition-all ${
        collapsed ? 'min-h-[100px]' : 'min-h-[600px]'
      } ${
        dragOverTab === tab.id
          ? 'border-purple-500 ring-4 ring-purple-200 dark:ring-purple-800/50'
          : 'border-gray-200 dark:border-slate-700'
      } ${isVerloren ? 'opacity-75' : ''}`}
      onDragOver={(e) => onDragOver(e, tab.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, tab.id)}
    >
      {/* Tab Header */}
      <div
        className={`px-3 py-2 border-b-2 ${tab.bgColor} ${tab.darkBgColor} rounded-t-xl cursor-pointer`}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <TabIcon className={`w-4 h-4 flex-shrink-0 ${tab.color} ${tab.darkColor}`} />
            <span className={`font-semibold text-sm truncate ${tab.color} ${tab.darkColor}`}>{tab.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tab.bgColor} ${tab.darkBgColor} ${tab.color} ${tab.darkColor}`}>
              {count}
            </span>
            {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
          </div>
        </div>
      </div>

      {/* Projekt-Liste */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {projekte.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-dark-textMuted">
              <TabIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-xs">Keine Projekte</p>
            </div>
          ) : (
            projekte.map((projekt) => (
              <ProjektCard
                key={(projekt as any).$id || projekt.id}
                projekt={projekt}
                status={tab.id}
                kompakt={kompakteAnsicht}
                aktuellerKundenname={projekt.kundeId ? kundenMap.get(projekt.kundeId)?.name : undefined}
                onDragStart={(e) => onDragStart(e, projekt)}
                onDragEnd={onDragEnd}
                onClick={() => onProjektClick(projekt)}
                onEdit={onEdit}
                onDelete={onDelete}
                onMarkAsLost={onMarkAsLost}
                isVerloren={isVerloren}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// Projekt-Card Komponente - REDESIGNED für bessere Lesbarkeit
interface ProjektCardProps {
  projekt: Projekt;
  status: ProjektStatus;
  kompakt: boolean;
  aktuellerKundenname?: string;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
  onEdit: (e: React.MouseEvent, projekt: Projekt) => void;
  onDelete: (e: React.MouseEvent, projekt: Projekt) => void;
  onMarkAsLost: (e: React.MouseEvent, projekt: Projekt) => void;
  isVerloren?: boolean;
}

const ProjektCard = ({ projekt, status, kompakt, aktuellerKundenname, onDragStart, onDragEnd, onClick, onEdit, onDelete, onMarkAsLost, isVerloren }: ProjektCardProps) => {
  // Extrahiere PLZ aus kundenPlzOrt
  const plzMatch = projekt.kundenPlzOrt?.match(/^(\d{5})/);
  const plz = plzMatch ? plzMatch[1] : '';
  const ort = projekt.kundenPlzOrt?.replace(/^\d{5}\s*/, '') || '';
  // Verwende aktuellen Kundennamen aus Kundendaten, falls vorhanden
  const kundenname = aktuellerKundenname || projekt.kundenname;

  if (kompakt) {
    // Kompakte Ansicht - mit vollständigem Namen
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        title={kundenname}
        className={`bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 hover:shadow-md dark:hover:shadow-lg hover:border-gray-300 dark:hover:border-slate-500 transition-all cursor-pointer group ${
          isVerloren ? 'opacity-60' : ''
        }`}
      >
        <div className="flex items-start gap-2">
          <GripVertical className="w-3 h-3 text-gray-300 dark:text-dark-textSubtle group-hover:text-gray-500 dark:group-hover:text-dark-textMuted flex-shrink-0 mt-0.5" />
          <Building2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-gray-900 dark:text-dark-text leading-tight block">
              {kundenname}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {plz}
            </span>
            {projekt.kundennummer && (
              <span className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 px-1.5 rounded">
                {projekt.kundennummer}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Normale Ansicht - Vereinsname prominenter und vollständig sichtbar
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg p-2.5 hover:shadow-md dark:hover:shadow-lg hover:border-gray-300 dark:hover:border-slate-500 transition-all cursor-pointer group ${
        isVerloren ? 'opacity-60' : ''
      }`}
    >
      {/* Header mit Vereinsname - PROMINENTER */}
      <div className="flex items-start gap-2 mb-1.5">
        <GripVertical className="w-4 h-4 text-gray-300 dark:text-dark-textSubtle group-hover:text-gray-500 dark:group-hover:text-dark-textMuted mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {/* Vereinsname - Hauptelement (vollständig sichtbar) */}
          <div className="flex items-start gap-1.5 mb-1">
            <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
            <h4 className="font-bold text-gray-900 dark:text-white text-base leading-tight">
              {kundenname}
            </h4>
          </div>

          {/* PLZ & Ort - vollständig */}
          <div className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400 ml-[22px]">
            <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>
              <span className="font-medium">{plz}</span> {ort}
            </span>
          </div>

          {/* Kundennummer falls vorhanden */}
          {projekt.kundennummer && (
            <span className="inline-block mt-1 ml-[22px] px-2 py-0.5 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 text-xs rounded-full border border-purple-200 dark:border-purple-800">
              Nr. {projekt.kundennummer}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => onEdit(e, projekt)}
            className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
            title="Bearbeiten"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {!isVerloren && status !== 'bezahlt' && (
            <button
              onClick={(e) => onMarkAsLost(e, projekt)}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors"
              title="Als verloren markieren"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => onDelete(e, projekt)}
            className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
            title="Löschen"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dokument-Infos - kompakter */}
      <div className="text-xs text-gray-500 dark:text-dark-textMuted space-y-0.5 ml-6">
        {projekt.angebotsnummer && (
          <div className="flex items-center gap-1">
            <FileCheck className="w-3 h-3 text-blue-500 dark:text-blue-400" />
            <span>{projekt.angebotsnummer}</span>
          </div>
        )}
        {projekt.auftragsbestaetigungsnummer && (
          <div className="flex items-center gap-1">
            <FileSignature className="w-3 h-3 text-orange-500 dark:text-orange-400" />
            <span>{projekt.auftragsbestaetigungsnummer}</span>
          </div>
        )}
        {projekt.lieferscheinnummer && (
          <div className="flex items-center gap-1">
            <Truck className="w-3 h-3 text-green-500 dark:text-green-400" />
            <span>{projekt.lieferscheinnummer}</span>
          </div>
        )}
        {projekt.rechnungsnummer && (
          <div className="flex items-center gap-1">
            <FileText className="w-3 h-3 text-red-500 dark:text-red-400" />
            <span>{projekt.rechnungsnummer}</span>
          </div>
        )}
      </div>

      {/* Mengen- und Preis-Info */}
      {(projekt.angefragteMenge || projekt.preisProTonne) && (
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-dark-textMuted mt-1.5 ml-6 pt-1.5 border-t border-gray-100 dark:border-slate-700">
          {projekt.angefragteMenge && (
            <div className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              <span>{projekt.angefragteMenge}t</span>
            </div>
          )}
          {projekt.preisProTonne && (
            <div className="flex items-center gap-1 font-medium text-gray-700 dark:text-dark-text">
              <Euro className="w-3 h-3" />
              <span>{projekt.preisProTonne.toFixed(2)} €/t</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Angebotsliste View
interface AngebotListeViewProps {
  projekte: Projekt[];
  onProjektClick: (projekt: Projekt) => void;
}

const AngebotListeView = ({ projekte, onProjektClick }: AngebotListeViewProps) => {
  const getStatusBadge = (status: ProjektStatus) => {
    const configs: Record<ProjektStatus, { label: string; color: string }> = {
      angebot: { label: 'Angebot', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
      angebot_versendet: { label: 'Versendet', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300' },
      auftragsbestaetigung: { label: 'AB', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
      lieferschein: { label: 'Lieferung', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
      rechnung: { label: 'Rechnung', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
      bezahlt: { label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
      verloren: { label: 'Verloren', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
    };
    return configs[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg dark:shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Angebotsliste
          </h2>
          <span className="text-sm text-gray-600 dark:text-gray-400">{projekte.length} Angebote</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-600 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Angebots-Nr.</th>
              <th className="px-4 py-3 text-left font-semibold">Tennisverein</th>
              <th className="px-4 py-3 text-left font-semibold">PLZ / Ort</th>
              <th className="px-4 py-3 text-left font-semibold">Kunden-Nr.</th>
              <th className="px-4 py-3 text-left font-semibold">Datum</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Menge</th>
              <th className="px-4 py-3 text-right font-semibold">Preis/t</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {projekte.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  Keine Angebote gefunden
                </td>
              </tr>
            ) : (
              projekte.map((projekt) => {
                const badge = getStatusBadge(projekt.status);
                return (
                  <tr
                    key={(projekt as any).$id || projekt.id}
                    onClick={() => onProjektClick(projekt)}
                    className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {projekt.angebotsnummer}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {projekt.kundenname}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {projekt.kundenPlzOrt}
                    </td>
                    <td className="px-4 py-3">
                      {projekt.kundennummer && (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {projekt.kundennummer}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {projekt.angebotsdatum
                        ? new Date(projekt.angebotsdatum).toLocaleDateString('de-DE')
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                      {projekt.angefragteMenge ? `${projekt.angefragteMenge}t` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                      {projekt.preisProTonne ? `${projekt.preisProTonne.toFixed(2)} €` : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Projekt-Edit-Modal Komponente
interface ProjektEditModalProps {
  projekt: Projekt;
  onSave: (updatedData: Partial<Projekt>) => void;
  onCancel: () => void;
}

const ProjektEditModal = ({ projekt, onSave, onCancel }: ProjektEditModalProps) => {
  const [formData, setFormData] = useState({
    projektName: projekt.projektName || projekt.kundenname,
    kundenname: projekt.kundenname,
    kundenstrasse: projekt.kundenstrasse,
    kundenPlzOrt: projekt.kundenPlzOrt,
    kundennummer: projekt.kundennummer || '',
    angefragteMenge: projekt.angefragteMenge || 0,
    preisProTonne: projekt.preisProTonne || 0,
    bezugsweg: projekt.bezugsweg || '',
    notizen: projekt.notizen || '',
  });
  const [loadingKundennummer, setLoadingKundennummer] = useState(false);

  useEffect(() => {
    const ladeKundennummer = async () => {
      if (!projekt.kundeId) return;

      if (!formData.kundennummer || formData.kundenname !== projekt.kundenname) {
        setLoadingKundennummer(true);
        try {
          const kunde = await saisonplanungService.loadKunde(projekt.kundeId);
          if (kunde && kunde.kundennummer) {
            setFormData(prev => ({ ...prev, kundennummer: kunde.kundennummer || prev.kundennummer }));
          }
        } catch (error) {
          console.warn('Konnte Kundennummer nicht laden:', error);
        } finally {
          setLoadingKundennummer(false);
        }
      }
    };

    ladeKundennummer();
  }, [projekt.kundeId, formData.kundenname]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      projektName: formData.projektName,
      kundenname: formData.kundenname,
      kundenstrasse: formData.kundenstrasse,
      kundenPlzOrt: formData.kundenPlzOrt,
      kundennummer: formData.kundennummer || undefined,
      angefragteMenge: formData.angefragteMenge || undefined,
      preisProTonne: formData.preisProTonne || undefined,
      bezugsweg: formData.bezugsweg || undefined,
      notizen: formData.notizen || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl dark:shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-slate-700">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">Projekt bearbeiten</h2>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 dark:text-dark-textMuted hover:text-gray-600 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-elevated rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Projektname */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Projektname *
            </label>
            <input
              type="text"
              value={formData.projektName}
              onChange={(e) => setFormData({ ...formData, projektName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 text-lg font-medium"
              required
            />
          </div>

          {/* Kundenname */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Kundenname *
            </label>
            <input
              type="text"
              value={formData.kundenname}
              onChange={(e) => setFormData({ ...formData, kundenname: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
              required
            />
          </div>

          {/* Kundennummer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Kundennummer <span className="text-xs text-gray-500 dark:text-dark-textSubtle">(Verknüpfung zum Projekt)</span>
            </label>
            <input
              type="text"
              value={formData.kundennummer}
              onChange={(e) => setFormData({ ...formData, kundennummer: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-dark-textSubtle focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
              placeholder={loadingKundennummer ? 'Lade...' : 'Wird automatisch aus Kunden-Datensatz geladen'}
            />
            {formData.kundennummer && (
              <p className="text-xs text-gray-500 dark:text-dark-textSubtle mt-1">
                Die Kundennummer dient als Verknüpfung zum Projekt.
              </p>
            )}
          </div>

          {/* Straße */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Straße
            </label>
            <input
              type="text"
              value={formData.kundenstrasse}
              onChange={(e) => setFormData({ ...formData, kundenstrasse: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
            />
          </div>

          {/* PLZ & Ort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              PLZ & Ort *
            </label>
            <input
              type="text"
              value={formData.kundenPlzOrt}
              onChange={(e) => setFormData({ ...formData, kundenPlzOrt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-dark-textSubtle focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
              placeholder="12345 Musterstadt"
              required
            />
          </div>

          {/* Angefragte Menge */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Angefragte Menge (Tonnen)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.angefragteMenge}
              onChange={(e) => setFormData({ ...formData, angefragteMenge: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
            />
          </div>

          {/* Preis pro Tonne */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Preis pro Tonne (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.preisProTonne}
              onChange={(e) => setFormData({ ...formData, preisProTonne: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
            />
          </div>

          {/* Bezugsweg */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Bezugsweg
            </label>
            <select
              value={formData.bezugsweg}
              onChange={(e) => setFormData({ ...formData, bezugsweg: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
            >
              <option value="">Bitte wählen</option>
              <option value="direkt">Direkt</option>
              <option value="ueber_platzbauer">Über Platzbauer</option>
            </select>
          </div>

          {/* Notizen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Notizen
            </label>
            <textarea
              value={formData.notizen}
              onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500 text-white rounded-lg transition-colors font-medium shadow-lg dark:shadow-dark-lg"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjektVerwaltung;
