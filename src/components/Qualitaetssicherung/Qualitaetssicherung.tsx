import { useState, useEffect, useMemo } from 'react';
import {
  TestTube2,
  Plus,
  BarChart3,
  TrendingUp,
  Archive,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Factory,
  Hammer,
  Beaker,
} from 'lucide-react';
import { qsService } from '../../services/qsService';
import { Siebanalyse, SiebanalyseFilter, TrendDaten, HammerStatus } from '../../types/qualitaetssicherung';
import SiebanalyseFormular from './SiebanalyseFormular';
import KoernungslinieGraph from './KoernungslinieGraph';
import ProbenListe from './ProbenListe';
import TrendAnalyse from './TrendAnalyse';
import MischKalkulator from './MischKalkulator';

type TabId = 'uebersicht' | 'produktion' | 'trend' | 'archiv';

const tabs: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: 'uebersicht', label: 'Übersicht', icon: BarChart3 },
  { id: 'produktion', label: 'Produktion', icon: Factory },
  { id: 'trend', label: 'Trend', icon: TrendingUp },
  { id: 'archiv', label: 'Archiv', icon: Archive },
];

// Hammer-Status Hilfsfunktionen
const HAMMER_STATUS_CONFIG: Record<HammerStatus, { label: string; color: string; bgColor: string }> = {
  frisch: { label: 'Frisch', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  genutzt: { label: 'Genutzt', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  gedreht: { label: 'Gedreht', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  wechsel_faellig: { label: 'Wechsel fällig', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

export default function Qualitaetssicherung() {
  const [activeTab, setActiveTab] = useState<TabId>('uebersicht');
  const [analysen, setAnalysen] = useState<Siebanalyse[]>([]);
  const [trendDaten, setTrendDaten] = useState<TrendDaten | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [selectedAnalyse, setSelectedAnalyse] = useState<Siebanalyse | null>(null);
  const [filter, setFilter] = useState<SiebanalyseFilter>({ ergebnis: 'alle', zeitraum: 'alle' });
  const [stats, setStats] = useState({ gesamt: 0, bestanden: 0, nichtBestanden: 0, bestandenRate: 0, letzteWoche: 0 });

  // Daten laden
  const loadData = async () => {
    setLoading(true);
    try {
      const [alleAnalysen, trend, statistiken] = await Promise.all([
        qsService.loadAlleSiebanalysen(),
        qsService.getTrendDaten(10),
        qsService.getStatistiken(),
      ]);
      setAnalysen(alleAnalysen);
      setTrendDaten(trend);
      setStats(statistiken);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Gefilterte Analysen für Archiv
  const gefilterteAnalysen = analysen.filter((a) => {
    if (filter.ergebnis && filter.ergebnis !== 'alle' && a.ergebnis !== filter.ergebnis) return false;
    if (filter.suche) {
      const suche = filter.suche.toLowerCase();
      if (
        !a.chargenNummer.toLowerCase().includes(suche) &&
        !a.kundeName?.toLowerCase().includes(suche) &&
        !a.projektName?.toLowerCase().includes(suche)
      ) {
        return false;
      }
    }
    return true;
  });

  // Neue Analyse speichern
  const handleSave = async () => {
    setShowFormular(false);
    setSelectedAnalyse(null);
    await loadData();
  };

  // Analyse löschen
  const handleDelete = async (id: string) => {
    if (!confirm('Siebanalyse wirklich löschen?')) return;
    try {
      await qsService.deleteSiebanalyse(id);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Siebanalyse');
    }
  };

  // Analyse bearbeiten
  const handleEdit = (analyse: Siebanalyse) => {
    setSelectedAnalyse(analyse);
    setShowFormular(true);
  };

  const letzteProben = analysen.slice(0, 5);
  const ausgewaehlteAnalyse = selectedAnalyse || letzteProben[0];

  // Produktions-Proben (Mischproben) und Fertigprodukte getrennt
  const mischproben = useMemo(() =>
    analysen.filter(a => a.probenTyp === 'mischprobe'),
    [analysen]
  );
  const fertigprodukte = useMemo(() =>
    analysen.filter(a => a.probenTyp === 'fertigprodukt'),
    [analysen]
  );

  // Letzter Hammer-Status ermitteln
  const letzterHammerStatus = useMemo(() => {
    const mitHammer = mischproben.filter(a => a.hammerInfo);
    if (mitHammer.length === 0) return null;
    return mitHammer[0].hammerInfo;
  }, [mischproben]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
              <TestTube2 className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-dark-text">
                QS-Tool Tennismehl 0/2
              </h1>
              <p className="text-sm text-gray-600 dark:text-dark-textMuted">
                Siebanalysen nach DIN 18035-5
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Aktualisieren</span>
            </button>
            <button
              onClick={() => {
                setSelectedAnalyse(null);
                setShowFormular(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:from-emerald-600 hover:to-teal-700 transition-colors shadow-lg"
            >
              <Plus className="h-5 w-5" />
              <span>Neue Probe</span>
            </button>
          </div>
        </div>

        {/* Statistik-Karten */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <TestTube2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.gesamt}</p>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted">Proben gesamt</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.bestandenRate}%</p>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted">Bestanden</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.nichtBestanden}</p>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted">Nicht bestanden</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.letzteWoche}</p>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted">Letzte 7 Tage</p>
              </div>
            </div>
          </div>
        </div>

        {/* Warnungen */}
        {trendDaten && trendDaten.warnungen.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-300">Qualitätswarnungen</h3>
                <ul className="mt-1 space-y-1">
                  {trendDaten.warnungen.map((warnung, i) => (
                    <li key={i} className="text-sm text-amber-700 dark:text-amber-400">
                      {warnung}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border mb-6">
          <div className="flex border-b border-gray-200 dark:border-dark-border">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors ${
                    isActive
                      ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'text-gray-600 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab-Inhalt */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'uebersicht' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Letzte Proben */}
                <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-4">Letzte Proben</h3>
                  {letzteProben.length === 0 ? (
                    <p className="text-gray-500 dark:text-dark-textMuted text-center py-8">
                      Noch keine Proben vorhanden
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {letzteProben.map((probe) => (
                        <button
                          key={probe.id}
                          onClick={() => setSelectedAnalyse(probe)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                            selectedAnalyse?.id === probe.id
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700'
                              : 'hover:bg-gray-50 dark:hover:bg-slate-800 border border-transparent'
                          }`}
                        >
                          <div className="text-left">
                            <p className="font-medium text-gray-900 dark:text-dark-text">
                              {probe.chargenNummer}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                              {new Date(probe.pruefDatum).toLocaleDateString('de-DE')}
                            </p>
                          </div>
                          {probe.ergebnis === 'bestanden' ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Körnungslinie Graph */}
                <div className="lg:col-span-2 bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-4">
                    Körnungslinie {ausgewaehlteAnalyse ? `- ${ausgewaehlteAnalyse.chargenNummer}` : ''}
                  </h3>
                  {ausgewaehlteAnalyse ? (
                    <KoernungslinieGraph analyse={ausgewaehlteAnalyse} />
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500 dark:text-dark-textMuted">
                      Wähle eine Probe aus oder erstelle eine neue
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'produktion' && (
              <div className="space-y-6">
                {/* Hammer-Status Übersicht */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Aktueller Hammer-Status */}
                  <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-gray-100 dark:bg-slate-700 rounded-lg">
                        <Hammer className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-dark-text">Aktueller Hammer</span>
                    </div>
                    {letzterHammerStatus ? (
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${HAMMER_STATUS_CONFIG[letzterHammerStatus.status].bgColor}`}>
                        <span className={`font-medium ${HAMMER_STATUS_CONFIG[letzterHammerStatus.status].color}`}>
                          {HAMMER_STATUS_CONFIG[letzterHammerStatus.status].label}
                        </span>
                        {letzterHammerStatus.anzahlDrehungen !== undefined && letzterHammerStatus.anzahlDrehungen > 0 && (
                          <span className="text-sm text-gray-600 dark:text-dark-textMuted">
                            ({letzterHammerStatus.anzahlDrehungen}x gedreht)
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 dark:text-dark-textMuted text-sm">Keine Daten</p>
                    )}
                  </div>

                  {/* Mischproben-Anzahl */}
                  <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                        <Beaker className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-dark-text">Mischproben</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{mischproben.length}</p>
                    <p className="text-sm text-gray-500 dark:text-dark-textMuted">verfügbar zum Mischen</p>
                  </div>

                  {/* Fertigprodukte */}
                  <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-dark-text">Fertigprodukte</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {fertigprodukte.filter(f => f.ergebnis === 'bestanden').length}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-dark-textMuted">bestanden von {fertigprodukte.length}</p>
                  </div>

                  {/* Hammer-Wechsel Warnung */}
                  <div className={`rounded-xl shadow-sm border p-4 ${
                    letzterHammerStatus?.status === 'wechsel_faellig'
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                      : 'bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border'
                  }`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-2 rounded-lg ${
                        letzterHammerStatus?.status === 'wechsel_faellig'
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : 'bg-gray-100 dark:bg-slate-700'
                      }`}>
                        <AlertTriangle className={`h-5 w-5 ${
                          letzterHammerStatus?.status === 'wechsel_faellig'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-400 dark:text-gray-500'
                        }`} />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-dark-text">Hammer-Status</span>
                    </div>
                    {letzterHammerStatus?.status === 'wechsel_faellig' ? (
                      <p className="text-red-700 dark:text-red-400 font-medium">Wechsel erforderlich!</p>
                    ) : (
                      <p className="text-gray-500 dark:text-dark-textMuted text-sm">Alles OK</p>
                    )}
                  </div>
                </div>

                {/* Letzte Produktions-Proben */}
                {mischproben.length > 0 && (
                  <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2">
                      <Beaker className="h-5 w-5 text-amber-600" />
                      Letzte Produktions-Proben
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {mischproben.slice(0, 6).map(probe => (
                        <div
                          key={probe.id}
                          className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-dark-border"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900 dark:text-dark-text">
                              {probe.chargenNummer}
                            </span>
                            {probe.hammerInfo && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${HAMMER_STATUS_CONFIG[probe.hammerInfo.status].bgColor} ${HAMMER_STATUS_CONFIG[probe.hammerInfo.status].color}`}>
                                {HAMMER_STATUS_CONFIG[probe.hammerInfo.status].label}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-dark-textMuted mb-2">
                            {new Date(probe.pruefDatum).toLocaleDateString('de-DE')}
                          </p>
                          <div className="text-xs text-gray-600 dark:text-dark-textMuted">
                            <span>0,063mm: {probe.siebwerte.mm0_063}%</span>
                            <span className="mx-2">|</span>
                            <span>0,125mm: {probe.siebwerte.mm0_125}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Misch-Kalkulator */}
                <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                  <MischKalkulator
                    alleAnalysen={analysen}
                    onMischungSpeichern={() => loadData()}
                  />
                </div>
              </div>
            )}

            {activeTab === 'trend' && trendDaten && (
              <TrendAnalyse trendDaten={trendDaten} analysen={analysen.slice(0, 10)} />
            )}

            {activeTab === 'archiv' && (
              <ProbenListe
                analysen={gefilterteAnalysen}
                filter={filter}
                onFilterChange={setFilter}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onSelect={setSelectedAnalyse}
              />
            )}
          </>
        )}

        {/* Formular Modal */}
        {showFormular && (
          <SiebanalyseFormular
            analyse={selectedAnalyse}
            onSave={handleSave}
            onCancel={() => {
              setShowFormular(false);
              setSelectedAnalyse(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
