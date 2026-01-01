import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Filter, Plus, X, ChevronRight, ChevronLeft,
  Building2, MapPin, Phone, Mail, Globe, Star, TrendingUp,
  AlertTriangle, Eye, Edit, Trash2, Upload, FileText, Image,
  BarChart3, Users, Factory, Target
} from 'lucide-react';
import { Konkurrent, KonkurrentFilter, MarktStatistiken, NeuerKonkurrent } from '../../types/konkurrent';
import { konkurrentService } from '../../services/konkurrentService';
import DeutschlandKartePro from './DeutschlandKartePro';

// Bundesländer für Filter
const BUNDESLAENDER = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen',
  'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
  'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen',
  'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'
];

// Tab-Typen für Detail-Panel
type DetailTab = 'uebersicht' | 'bewertung' | 'preise' | 'bilder' | 'dokumente' | 'notizen';
type ViewMode = 'karte' | 'liste' | 'dashboard';

const MarktAnalyse = () => {
  // State
  const [konkurrenten, setKonkurrenten] = useState<Konkurrent[]>([]);
  const [gefilterteKonkurrenten, setGefilterteKonkurrenten] = useState<Konkurrent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKonkurrent, setSelectedKonkurrent] = useState<Konkurrent | null>(null);
  const [hoveredKonkurrent, setHoveredKonkurrent] = useState<Konkurrent | null>(null);
  const [showFormular, setShowFormular] = useState(false);
  const [editingKonkurrent, setEditingKonkurrent] = useState<Konkurrent | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('uebersicht');
  const [viewMode, setViewMode] = useState<ViewMode>('karte');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Filter State
  const [filter, setFilter] = useState<KonkurrentFilter>({});
  const [suchbegriff, setSuchbegriff] = useState('');

  // Statistiken
  const statistiken = useMemo(() => {
    return konkurrentService.berechneMarktStatistiken(konkurrenten);
  }, [konkurrenten]);

  // Lade Konkurrenten
  useEffect(() => {
    loadKonkurrenten();
  }, []);

  // Filtere Konkurrenten bei Änderung
  useEffect(() => {
    const vollstaendigerFilter: KonkurrentFilter = {
      ...filter,
      suchbegriff
    };
    const gefiltert = konkurrentService.filterKonkurrenten(konkurrenten, vollstaendigerFilter);
    setGefilterteKonkurrenten(gefiltert);
  }, [konkurrenten, filter, suchbegriff]);

  const loadKonkurrenten = async () => {
    try {
      setLoading(true);
      const data = await konkurrentService.loadAlleKonkurrenten();
      setKonkurrenten(data);
    } catch (error) {
      console.error('Fehler beim Laden der Konkurrenten:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handler
  const handleKonkurrentClick = (konkurrent: Konkurrent) => {
    setSelectedKonkurrent(konkurrent);
    setDetailTab('uebersicht');
  };

  const handleEdit = (konkurrent: Konkurrent) => {
    setEditingKonkurrent(konkurrent);
    setShowFormular(true);
  };

  const handleDelete = async () => {
    if (!selectedKonkurrent) return;
    try {
      await konkurrentService.deleteKonkurrent(selectedKonkurrent.id);
      setShowDeleteModal(false);
      setSelectedKonkurrent(null);
      loadKonkurrenten();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  };

  const handleFilterReset = () => {
    setFilter({});
    setSuchbegriff('');
  };

  // Berechne aktive Filter-Anzahl
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filter.produkte?.length) count++;
    if (filter.bundeslaender?.length) count++;
    if (filter.status?.length) count++;
    if (filter.bedrohungsstufe?.length) count++;
    if (filter.produktionsmengeMin || filter.produktionsmengeMax) count++;
    if (filter.bewertungMin) count++;
    return count;
  }, [filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-dark-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-red-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-lg text-gray-600 dark:text-dark-textMuted">Lade Marktanalyse...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-dark-bg overflow-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <Target className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text">Marktanalyse</h1>
              <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                {gefilterteKonkurrenten.length} von {konkurrenten.length} Konkurrenten
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Suche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={suchbegriff}
                onChange={(e) => setSuchbegriff(e.target.value)}
                placeholder="Suchen..."
                className="pl-10 pr-4 py-2 w-64 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                showFilterPanel || activeFilterCount > 0
                  ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                  : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Filter className="w-5 h-5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-red-600 text-white rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('karte')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'karte'
                    ? 'bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text shadow-sm'
                    : 'text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text'
                }`}
              >
                Karte
              </button>
              <button
                onClick={() => setViewMode('liste')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'liste'
                    ? 'bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text shadow-sm'
                    : 'text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text'
                }`}
              >
                Liste
              </button>
              <button
                onClick={() => setViewMode('dashboard')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'dashboard'
                    ? 'bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text shadow-sm'
                    : 'text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text'
                }`}
              >
                Dashboard
              </button>
            </div>

            {/* Neuer Konkurrent */}
            <button
              onClick={() => {
                setEditingKonkurrent(null);
                setShowFormular(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Konkurrent
            </button>
          </div>
        </div>
      </header>

      {/* Filter Panel (Slide-Down) */}
      {showFilterPanel && (
        <div className="bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border px-6 py-4 flex-shrink-0">
          <FilterPanel
            filter={filter}
            setFilter={setFilter}
            onReset={handleFilterReset}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Karten-Ansicht */}
        {viewMode === 'karte' && (
          <>
            {/* Karte */}
            <div className={`flex-1 relative transition-all duration-300 ${sidebarCollapsed ? '' : 'mr-0'}`}>
              <DeutschlandKartePro
                konkurrenten={gefilterteKonkurrenten}
                selectedKonkurrent={selectedKonkurrent}
                hoveredKonkurrent={hoveredKonkurrent}
                onKonkurrentClick={handleKonkurrentClick}
                onKonkurrentHover={setHoveredKonkurrent}
              />
            </div>

            {/* Sidebar mit Details */}
            <aside
              className={`bg-white dark:bg-dark-surface border-l border-gray-200 dark:border-dark-border transition-all duration-300 flex flex-col ${
                sidebarCollapsed ? 'w-12' : 'w-[420px]'
              }`}
            >
              {/* Collapse Toggle */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 p-1.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-full shadow-md hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {sidebarCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {!sidebarCollapsed && (
                <>
                  {selectedKonkurrent ? (
                    <KonkurrentDetail
                      konkurrent={selectedKonkurrent}
                      activeTab={detailTab}
                      onTabChange={setDetailTab}
                      onEdit={() => handleEdit(selectedKonkurrent)}
                      onDelete={() => setShowDeleteModal(true)}
                      onClose={() => setSelectedKonkurrent(null)}
                      onRefresh={loadKonkurrenten}
                    />
                  ) : (
                    <KonkurrentenListe
                      konkurrenten={gefilterteKonkurrenten}
                      onSelect={handleKonkurrentClick}
                      hoveredKonkurrent={hoveredKonkurrent}
                      onHover={setHoveredKonkurrent}
                    />
                  )}
                </>
              )}
            </aside>
          </>
        )}

        {/* Listen-Ansicht */}
        {viewMode === 'liste' && (
          <div className="flex-1 overflow-auto p-6">
            <KonkurrentenTabelle
              konkurrenten={gefilterteKonkurrenten}
              onSelect={handleKonkurrentClick}
              onEdit={handleEdit}
            />
          </div>
        )}

        {/* Dashboard-Ansicht */}
        {viewMode === 'dashboard' && (
          <div className="flex-1 overflow-auto p-6">
            <MarktDashboard
              statistiken={statistiken}
            />
          </div>
        )}
      </div>

      {/* Formular Modal */}
      {showFormular && (
        <KonkurrentFormular
          konkurrent={editingKonkurrent}
          onClose={() => {
            setShowFormular(false);
            setEditingKonkurrent(null);
          }}
          onSave={async (data) => {
            try {
              if (editingKonkurrent) {
                await konkurrentService.updateKonkurrent(editingKonkurrent.id, data);
              } else {
                await konkurrentService.createKonkurrent(data as NeuerKonkurrent);
              }
              setShowFormular(false);
              setEditingKonkurrent(null);
              loadKonkurrenten();
            } catch (error) {
              console.error('Fehler beim Speichern:', error);
            }
          }}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedKonkurrent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
                  Konkurrent löschen?
                </h3>
                <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                  {selectedKonkurrent.name}
                </p>
              </div>
            </div>
            <p className="text-gray-600 dark:text-dark-textMuted mb-6">
              Diese Aktion kann nicht rückgängig gemacht werden. Alle zugehörigen Daten, Bilder und Dokumente werden ebenfalls gelöscht.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-dark-textMuted bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ========== Filter Panel ==========
interface FilterPanelProps {
  filter: KonkurrentFilter;
  setFilter: (filter: KonkurrentFilter) => void;
  onReset: () => void;
}

const FilterPanel = ({ filter, setFilter, onReset }: FilterPanelProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {/* Produkte */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">Produkte</label>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filter.produkte?.includes('tennissand') || false}
              onChange={(e) => {
                const produkte = filter.produkte || [];
                setFilter({
                  ...filter,
                  produkte: e.target.checked
                    ? [...produkte, 'tennissand']
                    : produkte.filter(p => p !== 'tennissand')
                });
              }}
              className="rounded text-red-600"
            />
            <span className="text-gray-700 dark:text-dark-text">Tennis-Sand</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filter.produkte?.includes('tennismehl') || false}
              onChange={(e) => {
                const produkte = filter.produkte || [];
                setFilter({
                  ...filter,
                  produkte: e.target.checked
                    ? [...produkte, 'tennismehl']
                    : produkte.filter(p => p !== 'tennismehl')
                });
              }}
              className="rounded text-red-600"
            />
            <span className="text-gray-700 dark:text-dark-text">Tennis-Mehl</span>
          </label>
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">Status</label>
        <select
          multiple
          value={filter.status || []}
          onChange={(e) => setFilter({
            ...filter,
            status: Array.from(e.target.selectedOptions, o => o.value as any)
          })}
          className="w-full h-20 text-sm border border-gray-300 dark:border-dark-border rounded-lg"
        >
          <option value="aktiv">Aktiv</option>
          <option value="beobachten">Beobachten</option>
          <option value="inaktiv">Inaktiv</option>
          <option value="aufgeloest">Aufgelöst</option>
        </select>
      </div>

      {/* Bedrohungsstufe */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">Bedrohung</label>
        <select
          multiple
          value={filter.bedrohungsstufe || []}
          onChange={(e) => setFilter({
            ...filter,
            bedrohungsstufe: Array.from(e.target.selectedOptions, o => o.value as any)
          })}
          className="w-full h-20 text-sm border border-gray-300 dark:border-dark-border rounded-lg"
        >
          <option value="niedrig">Niedrig</option>
          <option value="mittel">Mittel</option>
          <option value="hoch">Hoch</option>
          <option value="kritisch">Kritisch</option>
        </select>
      </div>

      {/* Produktionsmenge */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">Produktion (t/Jahr)</label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filter.produktionsmengeMin || ''}
            onChange={(e) => setFilter({
              ...filter,
              produktionsmengeMin: e.target.value ? parseInt(e.target.value) : undefined
            })}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded"
          />
          <input
            type="number"
            placeholder="Max"
            value={filter.produktionsmengeMax || ''}
            onChange={(e) => setFilter({
              ...filter,
              produktionsmengeMax: e.target.value ? parseInt(e.target.value) : undefined
            })}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded"
          />
        </div>
      </div>

      {/* Bundesland */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">Bundesland</label>
        <select
          multiple
          value={filter.bundeslaender || []}
          onChange={(e) => setFilter({
            ...filter,
            bundeslaender: Array.from(e.target.selectedOptions, o => o.value)
          })}
          className="w-full h-20 text-sm border border-gray-300 dark:border-dark-border rounded-lg"
        >
          {BUNDESLAENDER.map(bl => (
            <option key={bl} value={bl}>{bl}</option>
          ))}
        </select>
      </div>

      {/* Reset */}
      <div className="flex items-end">
        <button
          onClick={onReset}
          className="w-full px-4 py-2 text-sm text-gray-700 dark:text-dark-textMuted bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Filter zurücksetzen
        </button>
      </div>
    </div>
  );
};

// ========== Konkurrenten Liste (Sidebar) ==========
interface KonkurrentenListeProps {
  konkurrenten: Konkurrent[];
  onSelect: (k: Konkurrent) => void;
  hoveredKonkurrent: Konkurrent | null;
  onHover: (k: Konkurrent | null) => void;
}

const KonkurrentenListe = ({ konkurrenten, onSelect, hoveredKonkurrent, onHover }: KonkurrentenListeProps) => {
  // Sortiere nach Produktionsmenge (absteigend)
  const sortiert = useMemo(() => {
    return [...konkurrenten].sort((a, b) => (b.produktionsmenge || 0) - (a.produktionsmenge || 0));
  }, [konkurrenten]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-dark-border">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
          Konkurrenten ({konkurrenten.length})
        </h2>
        <p className="text-sm text-gray-500 dark:text-dark-textMuted">
          Sortiert nach Produktionsmenge
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sortiert.map(k => (
          <div
            key={k.id}
            onClick={() => onSelect(k)}
            onMouseEnter={() => onHover(k)}
            onMouseLeave={() => onHover(null)}
            className={`p-4 border-b border-gray-100 dark:border-dark-border cursor-pointer transition-colors ${
              hoveredKonkurrent?.id === k.id
                ? 'bg-red-50 dark:bg-red-900/20'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Produktions-Indikator */}
              <div
                className="flex-shrink-0 rounded-full flex items-center justify-center text-white font-bold text-xs"
                style={{
                  width: getMarkerSizePixels(k.produktionsmenge),
                  height: getMarkerSizePixels(k.produktionsmenge),
                  backgroundColor: konkurrentService.getBedrohungsfarbe(k.bedrohungsstufe),
                  minWidth: 24,
                  minHeight: 24
                }}
              >
                {k.produktionsmenge ? Math.round(k.produktionsmenge / 1000) : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-dark-text truncate">
                    {k.name}
                  </span>
                  {k.bedrohungsstufe === 'kritisch' && (
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  )}
                </div>
                <div className="text-sm text-gray-500 dark:text-dark-textMuted">
                  {k.adresse.plz} {k.adresse.ort}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-dark-textMuted">
                    {k.produktionsmenge?.toLocaleString() || '?'} t/Jahr
                  </span>
                  {k.produkte.map(p => (
                    <span
                      key={p}
                      className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-700 dark:text-blue-400"
                    >
                      {p === 'tennissand' ? 'Sand' : 'Mehl'}
                    </span>
                  ))}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ========== Konkurrent Detail Panel ==========
interface KonkurrentDetailProps {
  konkurrent: Konkurrent;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onRefresh: () => void;
}

const KonkurrentDetail = ({ konkurrent, activeTab, onTabChange, onEdit, onDelete, onClose, onRefresh }: KonkurrentDetailProps) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await konkurrentService.uploadBild(konkurrent.id, file, 'sonstiges');
      }
      onRefresh();
    } catch (error) {
      console.error('Fehler beim Upload:', error);
    } finally {
      setUploading(false);
    }
  };

  const durchschnittsBewertung = konkurrentService.berechneDurchschnittsBewertung(konkurrent.bewertung);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Logo oder Produktions-Indikator */}
            {konkurrent.bilder?.find(b => b.typ === 'logo') ? (
              <img
                src={konkurrent.bilder.find(b => b.typ === 'logo')!.thumbnail}
                alt={konkurrent.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: konkurrentService.getBedrohungsfarbe(konkurrent.bedrohungsstufe) }}
              >
                {konkurrent.name.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">{konkurrent.name}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-textMuted">
                <MapPin className="w-4 h-4" />
                {konkurrent.adresse.plz} {konkurrent.adresse.ort}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-lg font-bold text-gray-900 dark:text-dark-text">
              {konkurrent.produktionsmenge?.toLocaleString() || '—'}
            </div>
            <div className="text-xs text-gray-500 dark:text-dark-textMuted">t/Jahr</div>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center justify-center gap-1">
              <Star className="w-4 h-4 text-yellow-500" />
              <span className="text-lg font-bold text-gray-900 dark:text-dark-text">
                {durchschnittsBewertung.toFixed(1)}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-dark-textMuted">Bewertung</div>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div
              className="text-lg font-bold capitalize"
              style={{ color: konkurrentService.getBedrohungsfarbe(konkurrent.bedrohungsstufe) }}
            >
              {konkurrent.bedrohungsstufe || '—'}
            </div>
            <div className="text-xs text-gray-500 dark:text-dark-textMuted">Bedrohung</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-dark-textMuted rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm"
          >
            <Edit className="w-4 h-4" />
            Bearbeiten
          </button>
          <button
            onClick={onDelete}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 text-sm"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-dark-border px-4 overflow-x-auto">
        {[
          { id: 'uebersicht', label: 'Übersicht', icon: Building2 },
          { id: 'bewertung', label: 'Bewertung', icon: Star },
          { id: 'preise', label: 'Preise', icon: TrendingUp },
          { id: 'bilder', label: 'Bilder', icon: Image },
          { id: 'notizen', label: 'Notizen', icon: FileText }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id as DetailTab)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 dark:text-dark-textMuted hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'uebersicht' && (
          <div className="space-y-4">
            {/* Adresse */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">Adresse</h3>
              <div className="text-sm text-gray-600 dark:text-dark-textMuted">
                {konkurrent.adresse.strasse && <div>{konkurrent.adresse.strasse}</div>}
                <div>{konkurrent.adresse.plz} {konkurrent.adresse.ort}</div>
                {konkurrent.adresse.bundesland && <div>{konkurrent.adresse.bundesland}</div>}
              </div>
            </div>

            {/* Kontakt */}
            {konkurrent.kontakt && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">Kontakt</h3>
                <div className="space-y-1 text-sm">
                  {konkurrent.kontakt.telefon && (
                    <a href={`tel:${konkurrent.kontakt.telefon}`} className="flex items-center gap-2 text-gray-600 dark:text-dark-textMuted hover:text-red-600">
                      <Phone className="w-4 h-4" />
                      {konkurrent.kontakt.telefon}
                    </a>
                  )}
                  {konkurrent.kontakt.email && (
                    <a href={`mailto:${konkurrent.kontakt.email}`} className="flex items-center gap-2 text-gray-600 dark:text-dark-textMuted hover:text-red-600">
                      <Mail className="w-4 h-4" />
                      {konkurrent.kontakt.email}
                    </a>
                  )}
                  {konkurrent.kontakt.website && (
                    <a href={konkurrent.kontakt.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 dark:text-dark-textMuted hover:text-red-600">
                      <Globe className="w-4 h-4" />
                      {konkurrent.kontakt.website}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Produkte */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">Produkte</h3>
              <div className="flex flex-wrap gap-2">
                {konkurrent.produkte.map(p => (
                  <span key={p} className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-sm">
                    {p === 'tennissand' ? 'Tennis-Sand' : 'Tennis-Mehl'}
                  </span>
                ))}
              </div>
            </div>

            {/* Unternehmensdaten */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">Unternehmen</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500 dark:text-dark-textMuted">Produktion</div>
                  <div className="font-medium text-gray-900 dark:text-dark-text">
                    {konkurrent.produktionsmenge?.toLocaleString() || '—'} t/Jahr
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-dark-textMuted">Kapazität</div>
                  <div className="font-medium text-gray-900 dark:text-dark-text">
                    {konkurrent.produktionskapazitaet?.toLocaleString() || '—'} t/Jahr
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-dark-textMuted">Größe</div>
                  <div className="font-medium text-gray-900 dark:text-dark-text">
                    {konkurrentService.getUnternehmensgroesseLabel(konkurrent.unternehmensgroesse)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-dark-textMuted">Mitarbeiter</div>
                  <div className="font-medium text-gray-900 dark:text-dark-text">
                    {konkurrent.mitarbeiteranzahl || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-dark-textMuted">Gründung</div>
                  <div className="font-medium text-gray-900 dark:text-dark-text">
                    {konkurrent.gruendungsjahr || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-dark-textMuted">Marktanteil</div>
                  <div className="font-medium text-gray-900 dark:text-dark-text">
                    {konkurrent.marktanteil ? `${konkurrent.marktanteil}%` : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            {konkurrent.tags && konkurrent.tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1">
                  {konkurrent.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-dark-textMuted rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'bewertung' && (
          <div className="space-y-4">
            {konkurrent.bewertung ? (
              <>
                {[
                  { key: 'qualitaet', label: 'Qualität' },
                  { key: 'preisLeistung', label: 'Preis-Leistung' },
                  { key: 'lieferzeit', label: 'Lieferzeit' },
                  { key: 'service', label: 'Service' },
                  { key: 'zuverlaessigkeit', label: 'Zuverlässigkeit' }
                ].map(item => (
                  <div key={item.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 dark:text-dark-text">{item.label}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-dark-text">
                        {(konkurrent.bewertung as any)[item.key] || 0}/5
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className={`w-5 h-5 ${
                            star <= ((konkurrent.bewertung as any)[item.key] || 0)
                              ? 'text-yellow-500 fill-yellow-500'
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-dark-textMuted">
                Keine Bewertung vorhanden
              </div>
            )}
          </div>
        )}

        {activeTab === 'preise' && (
          <div className="space-y-4">
            {konkurrent.preise ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-sm text-gray-500 dark:text-dark-textMuted">Tennis-Sand</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-dark-text">
                      {konkurrent.preise.grundpreisTennisSand
                        ? `${konkurrent.preise.grundpreisTennisSand.toFixed(2)} €/t`
                        : '—'}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-sm text-gray-500 dark:text-dark-textMuted">Tennis-Mehl</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-dark-text">
                      {konkurrent.preise.grundpreisTennisMehl
                        ? `${konkurrent.preise.grundpreisTennisMehl.toFixed(2)} €/t`
                        : '—'}
                    </div>
                  </div>
                </div>
                {konkurrent.preise.mindestbestellmenge && (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-dark-textMuted">Mindestbestellmenge: </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      {konkurrent.preise.mindestbestellmenge} t
                    </span>
                  </div>
                )}
                {konkurrent.preise.zahlungsbedingungen && (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-dark-textMuted">Zahlungsbedingungen: </span>
                    <span className="text-sm text-gray-900 dark:text-dark-text">
                      {konkurrent.preise.zahlungsbedingungen}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-dark-textMuted">
                Keine Preisinformationen vorhanden
              </div>
            )}
          </div>
        )}

        {activeTab === 'bilder' && (
          <div className="space-y-4">
            {/* Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full p-4 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg text-center hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
            >
              {uploading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-red-600 border-t-transparent mx-auto" />
              ) : (
                <>
                  <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600 dark:text-dark-textMuted">Bilder hochladen</span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* Bilder Grid */}
            {konkurrent.bilder && konkurrent.bilder.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {konkurrent.bilder.map(bild => (
                  <div key={bild.id} className="relative group">
                    <img
                      src={bild.thumbnail || bild.url}
                      alt={bild.titel || 'Bild'}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                      <a
                        href={bild.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-white/20 rounded-full hover:bg-white/40"
                      >
                        <Eye className="w-4 h-4 text-white" />
                      </a>
                      <button
                        onClick={async () => {
                          await konkurrentService.deleteBild(konkurrent.id, bild.id);
                          onRefresh();
                        }}
                        className="p-2 bg-white/20 rounded-full hover:bg-red-500"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/50 text-white text-xs truncate rounded-b-lg">
                      {bild.titel}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-dark-textMuted">
                Keine Bilder vorhanden
              </div>
            )}
          </div>
        )}

        {activeTab === 'notizen' && (
          <div className="space-y-4">
            {konkurrent.notizen ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">Notizen</h4>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted whitespace-pre-wrap">
                  {konkurrent.notizen}
                </p>
              </div>
            ) : null}
            {konkurrent.interneNotizen ? (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-400 mb-2">Interne Notizen</h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 whitespace-pre-wrap">
                  {konkurrent.interneNotizen}
                </p>
              </div>
            ) : null}
            {!konkurrent.notizen && !konkurrent.interneNotizen && (
              <div className="text-center py-8 text-gray-500 dark:text-dark-textMuted">
                Keine Notizen vorhanden
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ========== Konkurrenten Tabelle ==========
interface KonkurrentenTabelleProps {
  konkurrenten: Konkurrent[];
  onSelect: (k: Konkurrent) => void;
  onEdit: (k: Konkurrent) => void;
}

const KonkurrentenTabelle = ({ konkurrenten, onSelect, onEdit }: KonkurrentenTabelleProps) => {
  const sortiert = useMemo(() => {
    return [...konkurrenten].sort((a, b) => (b.produktionsmenge || 0) - (a.produktionsmenge || 0));
  }, [konkurrenten]);

  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">Konkurrent</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">Standort</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">Produkte</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">Produktion</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">Bewertung</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">Bedrohung</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
          {sortiert.map(k => {
            const durchschnitt = konkurrentService.berechneDurchschnittsBewertung(k.bewertung);
            return (
              <tr
                key={k.id}
                onClick={() => onSelect(k)}
                className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: konkurrentService.getBedrohungsfarbe(k.bedrohungsstufe) }}
                    >
                      {k.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-dark-text">{k.name}</div>
                      {k.kontakt?.website && (
                        <div className="text-xs text-gray-500 dark:text-dark-textMuted truncate max-w-[200px]">
                          {k.kontakt.website}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900 dark:text-dark-text">{k.adresse.ort}</div>
                  <div className="text-xs text-gray-500 dark:text-dark-textMuted">{k.adresse.plz}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {k.produkte.map(p => (
                      <span
                        key={p}
                        className="px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      >
                        {p === 'tennissand' ? 'Sand' : 'Mehl'}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-sm font-medium text-gray-900 dark:text-dark-text">
                    {k.produktionsmenge?.toLocaleString() || '—'} t
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-900 dark:text-dark-text">{durchschnitt.toFixed(1)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className="px-2 py-1 text-xs rounded-full font-medium capitalize"
                    style={{
                      backgroundColor: `${konkurrentService.getBedrohungsfarbe(k.bedrohungsstufe)}20`,
                      color: konkurrentService.getBedrohungsfarbe(k.bedrohungsstufe)
                    }}
                  >
                    {k.bedrohungsstufe || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    k.status === 'aktiv' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    k.status === 'beobachten' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    k.status === 'inaktiv' ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {konkurrentService.getStatusLabel(k.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(k);
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ========== Markt Dashboard ==========
interface MarktDashboardProps {
  statistiken: MarktStatistiken;
}

const MarktDashboard = ({ statistiken }: MarktDashboardProps) => {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-surface rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                {statistiken.anzahlKonkurrenten}
              </div>
              <div className="text-sm text-gray-500 dark:text-dark-textMuted">Aktive Konkurrenten</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Factory className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                {statistiken.gesamtProduktion.toLocaleString()} t
              </div>
              <div className="text-sm text-gray-500 dark:text-dark-textMuted">Gesamtproduktion/Jahr</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <BarChart3 className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                {Math.round(statistiken.durchschnittlicheProduktion).toLocaleString()} t
              </div>
              <div className="text-sm text-gray-500 dark:text-dark-textMuted">Durchschnitt/Konkurrent</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                {statistiken.bedrohungsVerteilung.kritisch + statistiken.bedrohungsVerteilung.hoch}
              </div>
              <div className="text-sm text-gray-500 dark:text-dark-textMuted">Hohe Bedrohung</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Produktions-Verteilung */}
        <div className="bg-white dark:bg-dark-surface rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4">Produktions-Verteilung</h3>
          <div className="space-y-4">
            {[
              { label: 'Klein (<2.000 t)', value: statistiken.produktionsVerteilung.klein, color: 'bg-blue-500' },
              { label: 'Mittel (2.000-5.000 t)', value: statistiken.produktionsVerteilung.mittel, color: 'bg-yellow-500' },
              { label: 'Groß (>5.000 t)', value: statistiken.produktionsVerteilung.gross, color: 'bg-red-500' }
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-dark-textMuted">{item.label}</span>
                  <span className="font-medium text-gray-900 dark:text-dark-text">{item.value}</span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full`}
                    style={{ width: `${(item.value / statistiken.anzahlKonkurrenten) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bedrohungs-Verteilung */}
        <div className="bg-white dark:bg-dark-surface rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4">Bedrohungs-Analyse</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Niedrig', value: statistiken.bedrohungsVerteilung.niedrig, color: '#22c55e' },
              { label: 'Mittel', value: statistiken.bedrohungsVerteilung.mittel, color: '#eab308' },
              { label: 'Hoch', value: statistiken.bedrohungsVerteilung.hoch, color: '#f97316' },
              { label: 'Kritisch', value: statistiken.bedrohungsVerteilung.kritisch, color: '#ef4444' }
            ].map(item => (
              <div key={item.label} className="text-center p-4 rounded-lg" style={{ backgroundColor: `${item.color}15` }}>
                <div className="text-3xl font-bold" style={{ color: item.color }}>{item.value}</div>
                <div className="text-sm text-gray-600 dark:text-dark-textMuted">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Konkurrenten */}
      <div className="bg-white dark:bg-dark-surface rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4">Top 5 Konkurrenten nach Produktion</h3>
        <div className="space-y-3">
          {statistiken.topKonkurrenten.map((k, i) => (
            <div key={k.id} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 font-bold">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-dark-text">{k.name}</div>
                <div className="text-sm text-gray-500 dark:text-dark-textMuted">{k.adresse.ort}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-gray-900 dark:text-dark-text">
                  {k.produktionsmenge?.toLocaleString()} t/Jahr
                </div>
                <div className="text-xs text-gray-500 dark:text-dark-textMuted">
                  {((k.produktionsmenge || 0) / statistiken.gesamtProduktion * 100).toFixed(1)}% Marktanteil
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ========== Konkurrent Formular ==========
interface KonkurrentFormularProps {
  konkurrent: Konkurrent | null;
  onClose: () => void;
  onSave: (data: Partial<NeuerKonkurrent>) => Promise<void>;
}

const KonkurrentFormular = ({ konkurrent, onClose, onSave }: KonkurrentFormularProps) => {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<NeuerKonkurrent>>({
    name: konkurrent?.name || '',
    produkte: konkurrent?.produkte || [],
    adresse: konkurrent?.adresse || { plz: '', ort: '' },
    kontakt: konkurrent?.kontakt || {},
    lieferkostenModell: konkurrent?.lieferkostenModell || { typ: 'fest', festerPreisProTonne: 0 },
    produktionsmenge: konkurrent?.produktionsmenge,
    produktionskapazitaet: konkurrent?.produktionskapazitaet,
    marktanteil: konkurrent?.marktanteil,
    unternehmensgroesse: konkurrent?.unternehmensgroesse,
    mitarbeiteranzahl: konkurrent?.mitarbeiteranzahl,
    gruendungsjahr: konkurrent?.gruendungsjahr,
    bewertung: konkurrent?.bewertung,
    preise: konkurrent?.preise,
    notizen: konkurrent?.notizen,
    interneNotizen: konkurrent?.interneNotizen,
    tags: konkurrent?.tags || [],
    status: konkurrent?.status || 'aktiv',
    bedrohungsstufe: konkurrent?.bedrohungsstufe || 'mittel'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  const handleProduktToggle = (produkt: 'tennissand' | 'tennismehl') => {
    const produkte = formData.produkte || [];
    setFormData({
      ...formData,
      produkte: produkte.includes(produkt)
        ? produkte.filter(p => p !== produkt)
        : [...produkte, produkt]
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto my-8">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
              {konkurrent ? 'Konkurrent bearbeiten' : 'Neuer Konkurrent'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Grunddaten */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3 uppercase tracking-wider">Grunddaten</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Status</label>
                  <select
                    value={formData.status || 'aktiv'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  >
                    <option value="aktiv">Aktiv</option>
                    <option value="beobachten">Beobachten</option>
                    <option value="inaktiv">Inaktiv</option>
                    <option value="aufgeloest">Aufgelöst</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Bedrohungsstufe</label>
                  <select
                    value={formData.bedrohungsstufe || 'mittel'}
                    onChange={(e) => setFormData({ ...formData, bedrohungsstufe: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  >
                    <option value="niedrig">Niedrig</option>
                    <option value="mittel">Mittel</option>
                    <option value="hoch">Hoch</option>
                    <option value="kritisch">Kritisch</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Produkte *</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.produkte?.includes('tennissand') || false}
                        onChange={() => handleProduktToggle('tennissand')}
                        className="rounded text-red-600"
                      />
                      <span className="text-gray-700 dark:text-dark-text">Tennis-Sand</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.produkte?.includes('tennismehl') || false}
                        onChange={() => handleProduktToggle('tennismehl')}
                        className="rounded text-red-600"
                      />
                      <span className="text-gray-700 dark:text-dark-text">Tennis-Mehl</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Adresse */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3 uppercase tracking-wider">Adresse</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Straße</label>
                  <input
                    type="text"
                    value={formData.adresse?.strasse || ''}
                    onChange={(e) => setFormData({ ...formData, adresse: { ...formData.adresse!, strasse: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">PLZ *</label>
                  <input
                    type="text"
                    value={formData.adresse?.plz || ''}
                    onChange={(e) => setFormData({ ...formData, adresse: { ...formData.adresse!, plz: e.target.value.replace(/\D/g, '').slice(0, 5) } })}
                    required
                    maxLength={5}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Ort *</label>
                  <input
                    type="text"
                    value={formData.adresse?.ort || ''}
                    onChange={(e) => setFormData({ ...formData, adresse: { ...formData.adresse!, ort: e.target.value } })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Bundesland</label>
                  <select
                    value={formData.adresse?.bundesland || ''}
                    onChange={(e) => setFormData({ ...formData, adresse: { ...formData.adresse!, bundesland: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  >
                    <option value="">Auswählen...</option>
                    {BUNDESLAENDER.map(bl => (
                      <option key={bl} value={bl}>{bl}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Unternehmensdaten */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3 uppercase tracking-wider">Unternehmensdaten</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Produktion (t/Jahr)</label>
                  <input
                    type="number"
                    value={formData.produktionsmenge || ''}
                    onChange={(e) => setFormData({ ...formData, produktionsmenge: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Kapazität (t/Jahr)</label>
                  <input
                    type="number"
                    value={formData.produktionskapazitaet || ''}
                    onChange={(e) => setFormData({ ...formData, produktionskapazitaet: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Marktanteil (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.marktanteil || ''}
                    onChange={(e) => setFormData({ ...formData, marktanteil: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Unternehmensgröße</label>
                  <select
                    value={formData.unternehmensgroesse || ''}
                    onChange={(e) => setFormData({ ...formData, unternehmensgroesse: e.target.value as any || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  >
                    <option value="">Auswählen...</option>
                    <option value="klein">Klein (&lt;10 MA)</option>
                    <option value="mittel">Mittel (10-50 MA)</option>
                    <option value="gross">Groß (50-250 MA)</option>
                    <option value="enterprise">Enterprise (&gt;250 MA)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Mitarbeiter</label>
                  <input
                    type="number"
                    value={formData.mitarbeiteranzahl || ''}
                    onChange={(e) => setFormData({ ...formData, mitarbeiteranzahl: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Gründungsjahr</label>
                  <input
                    type="number"
                    value={formData.gruendungsjahr || ''}
                    onChange={(e) => setFormData({ ...formData, gruendungsjahr: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Kontakt */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3 uppercase tracking-wider">Kontakt</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={formData.kontakt?.telefon || ''}
                    onChange={(e) => setFormData({ ...formData, kontakt: { ...formData.kontakt, telefon: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">E-Mail</label>
                  <input
                    type="email"
                    value={formData.kontakt?.email || ''}
                    onChange={(e) => setFormData({ ...formData, kontakt: { ...formData.kontakt, email: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Website</label>
                  <input
                    type="url"
                    value={formData.kontakt?.website || ''}
                    onChange={(e) => setFormData({ ...formData, kontakt: { ...formData.kontakt, website: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Ansprechpartner</label>
                  <input
                    type="text"
                    value={formData.kontakt?.ansprechpartner || ''}
                    onChange={(e) => setFormData({ ...formData, kontakt: { ...formData.kontakt, ansprechpartner: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Notizen */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3 uppercase tracking-wider">Notizen</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Notizen</label>
                  <textarea
                    value={formData.notizen || ''}
                    onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">Interne Notizen</label>
                  <textarea
                    value={formData.interneNotizen || ''}
                    onChange={(e) => setFormData({ ...formData, interneNotizen: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                    placeholder="Nur für interne Zwecke..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-dark-border px-6 py-4 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-dark-textMuted bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Speichern...
                </>
              ) : (
                konkurrent ? 'Aktualisieren' : 'Erstellen'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Helper Funktion für Marker-Größe
function getMarkerSizePixels(produktionsmenge?: number): number {
  if (!produktionsmenge) return 24;
  if (produktionsmenge < 2000) return 24;
  if (produktionsmenge < 5000) return 32;
  if (produktionsmenge < 10000) return 40;
  return 48;
}

export default MarktAnalyse;
