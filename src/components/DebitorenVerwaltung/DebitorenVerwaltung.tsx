import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
  Euro,
  Search,
  Filter,
  Settings,
} from 'lucide-react';
import { DebitorView, DebitorenStatistik, DebitorFilter, DebitorStatus } from '../../types/debitor';
import { debitorService } from '../../services/debitorService';
import DebitorenListe from './DebitorenListe';
import DebitorDetail from './DebitorDetail';
import MahnwesenEinstellungen from './MahnwesenEinstellungen';

type TabId = 'dashboard' | 'offen' | 'ueberfaellig' | 'bezahlt' | 'einstellungen';

const DebitorenVerwaltung = () => {
  const [debitoren, setDebitoren] = useState<DebitorView[]>([]);
  const [statistik, setStatistik] = useState<DebitorenStatistik | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [selectedDebitor, setSelectedDebitor] = useState<DebitorView | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [saisonjahrFilter, setSaisonjahrFilter] = useState<number>(new Date().getFullYear());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const filter: DebitorFilter = {
        saisonjahr: saisonjahrFilter || undefined,
      };

      const [debitorenData, statistikData] = await Promise.all([
        debitorService.loadAlleDebitoren(filter),
        debitorService.berechneStatistik(saisonjahrFilter || undefined),
      ]);

      setDebitoren(debitorenData);
      setStatistik(statistikData);
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setLoading(false);
    }
  }, [saisonjahrFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenDetail = (debitor: DebitorView) => {
    setSelectedDebitor(debitor);
    setShowDetail(true);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedDebitor(null);
  };

  const handleDetailUpdate = async () => {
    if (selectedDebitor) {
      const updated = await debitorService.loadDebitorFuerProjekt(selectedDebitor.projektId);
      if (updated) {
        setSelectedDebitor(updated);
      }
    }
    loadData();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  // Gefilterte Debitoren nach Tab
  const getFilteredDebitoren = (): DebitorView[] => {
    let filtered = debitoren;

    // Suchfilter
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.kundenname.toLowerCase().includes(search) ||
          d.rechnungsnummer?.toLowerCase().includes(search) ||
          d.kundennummer?.toLowerCase().includes(search)
      );
    }

    // Tab-Filter
    switch (activeTab) {
      case 'offen':
        return filtered.filter((d) => d.status !== 'bezahlt');
      case 'ueberfaellig':
        return filtered.filter(
          (d) => d.status === 'ueberfaellig' || d.status === 'faellig' || d.tageUeberfaellig > 0
        );
      case 'bezahlt':
        return filtered.filter((d) => d.status === 'bezahlt');
      default:
        return filtered;
    }
  };

  // Saisonjahre für Filter
  const verfuegbareSaisonjahre = Array.from(
    new Set(debitoren.map((d) => d.saisonjahr))
  ).sort((a, b) => b - a);

  if (!verfuegbareSaisonjahre.includes(new Date().getFullYear())) {
    verfuegbareSaisonjahre.unshift(new Date().getFullYear());
  }

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-slate-400">Lade Debitoren...</p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; count?: number; color: string; icon?: typeof Settings }[] = [
    { id: 'dashboard', label: 'Dashboard', color: 'blue' },
    {
      id: 'offen',
      label: 'Offene Forderungen',
      count: statistik?.anzahlOffen || 0,
      color: 'amber',
    },
    {
      id: 'ueberfaellig',
      label: 'Überfällig',
      count: statistik?.ueberfaelligAnzahl || 0,
      color: 'red',
    },
    {
      id: 'bezahlt',
      label: 'Bezahlt',
      count: statistik?.anzahlBezahlt || 0,
      color: 'green',
    },
    {
      id: 'einstellungen',
      label: 'Einstellungen',
      color: 'gray',
      icon: Settings,
    },
  ];

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">
              Debitoren-Verwaltung
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">
              Offene Forderungen von Vereinen verwalten
            </p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            {/* Saisonjahr Filter */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg px-4 py-2">
              <Filter className="w-5 h-5 text-gray-500 dark:text-slate-400" />
              <select
                value={saisonjahrFilter}
                onChange={(e) => setSaisonjahrFilter(Number(e.target.value))}
                className="border-none bg-transparent text-sm font-semibold text-gray-900 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value={0}>Alle Jahre</option>
                {verfuegbareSaisonjahre.map((jahr) => (
                  <option key={jahr} value={jahr}>
                    Saison {jahr}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={loadData}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Aktualisieren
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700 overflow-x-auto pb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? `bg-${tab.color}-100 dark:bg-${tab.color}-900/30 text-${tab.color}-700 dark:text-${tab.color}-400 border-b-2 border-${tab.color}-500`
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab.icon && <tab.icon className="w-4 h-4" />}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id
                      ? `bg-${tab.color}-200 dark:bg-${tab.color}-800 text-${tab.color}-800 dark:text-${tab.color}-200`
                      : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && statistik && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Gesamtforderungen */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Gesamtforderungen</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 mt-1">
                      {formatCurrency(statistik.gesamtForderungen)}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <Euro className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </div>

              {/* Offen */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Noch offen</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                      {formatCurrency(statistik.gesamtOffen)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {statistik.anzahlOffen} Rechnungen
                    </p>
                  </div>
                  <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                    <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
              </div>

              {/* Überfällig */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Überfällig</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                      {formatCurrency(statistik.ueberfaelligBetrag)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {statistik.ueberfaelligAnzahl} Rechnungen
                    </p>
                  </div>
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </div>

              {/* Bezahlt */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Bezahlt</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                      {formatCurrency(statistik.gesamtBezahlt)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {statistik.anzahlBezahlt} Rechnungen
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Kritische Debitoren */}
            {statistik.kritischeDebitoren.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    Kritische Debitoren (Top 10)
                  </h2>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-slate-700">
                  {statistik.kritischeDebitoren.map((debitor) => (
                    <div
                      key={debitor.projektId}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                      onClick={() => handleOpenDetail(debitor)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-100">
                            {debitor.kundenname}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {debitor.rechnungsnummer} • {debitor.tageUeberfaellig} Tage überfällig
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600 dark:text-red-400">
                            {formatCurrency(debitor.offenerBetrag)}
                          </p>
                          <StatusBadge status={debitor.status} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nächste Fälligkeiten */}
            {statistik.naechsteFaelligkeiten.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-500" />
                    Nächste Fälligkeiten (7 Tage)
                  </h2>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-slate-700">
                  {statistik.naechsteFaelligkeiten.map((debitor) => (
                    <div
                      key={debitor.projektId}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                      onClick={() => handleOpenDetail(debitor)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-100">
                            {debitor.kundenname}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {debitor.rechnungsnummer} • Fällig am{' '}
                            {new Date(debitor.faelligkeitsdatum).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-amber-600 dark:text-amber-400">
                            {formatCurrency(debitor.offenerBetrag)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mahnstufen Übersicht */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
              <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                  Mahnstufen Übersicht
                </h2>
              </div>
              <div className="p-4 grid grid-cols-5 gap-4">
                {[0, 1, 2, 3, 4].map((stufe) => {
                  const data = statistik.nachMahnstufe[stufe as 0 | 1 | 2 | 3 | 4];
                  const labels = ['Keine', 'Erinnerung', '1. Mahnung', '2. Mahnung', 'Inkasso'];
                  const colors = ['gray', 'blue', 'amber', 'orange', 'red'];
                  return (
                    <div
                      key={stufe}
                      className={`p-4 rounded-lg bg-${colors[stufe]}-50 dark:bg-${colors[stufe]}-900/20 border border-${colors[stufe]}-200 dark:border-${colors[stufe]}-800`}
                    >
                      <p
                        className={`text-sm font-medium text-${colors[stufe]}-700 dark:text-${colors[stufe]}-400`}
                      >
                        {labels[stufe]}
                      </p>
                      <p
                        className={`text-xl font-bold text-${colors[stufe]}-800 dark:text-${colors[stufe]}-300 mt-1`}
                      >
                        {data.anzahl}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        {formatCurrency(data.betrag)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Einstellungen Tab */}
        {activeTab === 'einstellungen' && (
          <MahnwesenEinstellungen />
        )}

        {/* Andere Tabs: Liste */}
        {activeTab !== 'dashboard' && activeTab !== 'einstellungen' && (
          <div className="space-y-4">
            {/* Suche */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Suche nach Kundenname, Rechnungsnummer..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Liste */}
            <DebitorenListe
              debitoren={getFilteredDebitoren()}
              onOpenDetail={handleOpenDetail}
            />
          </div>
        )}

        {/* Detail Modal */}
        {showDetail && selectedDebitor && (
          <DebitorDetail
            debitor={selectedDebitor}
            onClose={handleCloseDetail}
            onUpdate={handleDetailUpdate}
          />
        )}
      </div>
    </div>
  );
};

// Status Badge Komponente
const StatusBadge = ({ status }: { status: DebitorStatus }) => {
  const config: Record<DebitorStatus, { label: string; color: string }> = {
    offen: { label: 'Offen', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    faellig: { label: 'Fällig', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    ueberfaellig: { label: 'Überfällig', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    gemahnt: { label: 'Gemahnt', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    teilbezahlt: { label: 'Teilbezahlt', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    bezahlt: { label: 'Bezahlt', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  };

  const { label, color } = config[status];

  return <span className={`px-2 py-1 text-xs font-medium rounded-full ${color}`}>{label}</span>;
};

export default DebitorenVerwaltung;
