import { useState, useEffect } from 'react';
import { Plus, TrendingUp, AlertTriangle, Clock, FileText, RefreshCw, BarChart3, PieChart as PieChartIcon, User } from 'lucide-react';
import { OffeneRechnung } from '../../types/kreditor';
import { PrivatKreditorenStatistik } from '../../services/privatKreditorService';
import { usePrivatKreditor } from '../../contexts/PrivatKreditorContext';
import PrivatRechnungsFormular from './PrivatRechnungsFormular';
import PrivatRechnungsListe from './PrivatRechnungsListe';
import PrivatRechnungsDetail from './PrivatRechnungsDetail';
import PrivatFaelligkeitsTimeline from './PrivatFaelligkeitsTimeline';

interface PrivatKreditorenVerwaltungProps {
  hideHeader?: boolean;
}

const PrivatKreditorenVerwaltung = ({ hideHeader = false }: PrivatKreditorenVerwaltungProps) => {
  const { kreditorService, aktivitaetService, ownerName } = usePrivatKreditor();

  const [rechnungen, setRechnungen] = useState<OffeneRechnung[]>([]);
  const [statistik, setStatistik] = useState<PrivatKreditorenStatistik | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [selectedRechnung, setSelectedRechnung] = useState<OffeneRechnung | null>(null);
  const [activeTab, setActiveTab] = useState<'offen' | 'bezahlt'>('offen');
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rechnungenData, statistikData] = await Promise.all([
        kreditorService.loadAlleRechnungen(),
        kreditorService.berechneStatistik(),
      ]);
      setRechnungen(rechnungenData);
      setStatistik(statistikData);
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    setShowFormular(false);
    setSelectedRechnung(null);
    loadData();
  };

  const handleEdit = (rechnung: OffeneRechnung) => {
    setSelectedRechnung(rechnung);
    setShowFormular(true);
    setShowDetail(false);
  };

  const handleOpenDetail = (rechnung: OffeneRechnung) => {
    setSelectedRechnung(rechnung);
    setShowDetail(true);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedRechnung(null);
  };

  const handleDetailUpdate = async () => {
    if (selectedRechnung) {
      const updated = await kreditorService.loadRechnung(selectedRechnung.id);
      if (updated) {
        setSelectedRechnung(updated);
      }
    }
    loadData();
  };

  const handleDelete = async (id: string) => {
    try {
      await aktivitaetService.deleteAktivitaetenFuerRechnung(id);
      await kreditorService.deleteRechnung(id);
      loadData();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Rechnung');
    }
  };

  const scrollToNaechsteFaelligkeiten = () => {
    const element = document.getElementById('naechste-faelligkeiten-privat');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const offeneRechnungen = rechnungen.filter(r =>
    r.status !== 'bezahlt' && r.status !== 'storniert'
  );
  const bezahlteRechnungen = rechnungen.filter(r =>
    r.status === 'bezahlt' || r.status === 'storniert'
  );

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-slate-400">Lade Daten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        {!hideHeader && (
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                  <User className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">
                    Private Kreditoren - {ownerName}
                  </h1>
                  <p className="text-gray-600 dark:text-slate-400 mt-1">
                    Persönliche Rechnungsverwaltung
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 items-center flex-wrap">
              <button
                onClick={loadData}
                className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                Aktualisieren
              </button>
              <button
                onClick={() => {
                  setSelectedRechnung(null);
                  setShowFormular(true);
                }}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Neue Rechnung
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons wenn Header versteckt */}
        {hideHeader && (
          <div className="flex gap-3 items-center justify-end flex-wrap">
            <button
              onClick={loadData}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Aktualisieren
            </button>
            <button
              onClick={() => {
                setSelectedRechnung(null);
                setShowFormular(true);
              }}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Neue Rechnung
            </button>
          </div>
        )}

        {/* Statistik-Karten */}
        {statistik && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatistikKarte
              title="Gesamt offen"
              value={formatCurrency(statistik.gesamtBetrag)}
              subtitle={`${statistik.gesamtOffen} Rechnungen`}
              icon={FileText}
              color="purple"
            />
            <StatistikKarte
              title="Fällig (7 Tage)"
              value={formatCurrency(statistik.faelligBetrag)}
              subtitle="Nächste 7 Tage"
              icon={Clock}
              color="yellow"
              onClick={scrollToNaechsteFaelligkeiten}
            />
            <StatistikKarte
              title="Heute"
              value={formatCurrency(statistik.heuteBetrag)}
              subtitle="Heute fällig"
              icon={TrendingUp}
              color="orange"
            />
            <StatistikKarte
              title="Im Verzug"
              value={formatCurrency(statistik.verzugBetrag)}
              subtitle="Überfällige Rechnungen"
              icon={AlertTriangle}
              color="red"
            />
          </div>
        )}

        {/* Diagramme */}
        {statistik && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Status-Verteilung */}
            <DiagrammKarte title="Verteilung nach Status" icon={PieChartIcon}>
              <StatusDiagramm statistik={statistik} />
            </DiagrammKarte>

            {/* Kategorie-Verteilung */}
            <DiagrammKarte title="Verteilung nach Kategorie" icon={BarChart3}>
              <KategorieDiagramm statistik={statistik} />
            </DiagrammKarte>
          </div>
        )}

        {/* Nächste Fälligkeiten */}
        {statistik && statistik.naechsteFaelligkeiten.length > 0 && (
          <div id="naechste-faelligkeiten-privat" className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              <h2 className="text-xl font-bold text-yellow-900 dark:text-yellow-300">Nächste Fälligkeiten (7 Tage)</h2>
            </div>
            <div className="space-y-2">
              {statistik.naechsteFaelligkeiten.map((rechnung) => {
                const tageBisFaellig = Math.floor(
                  (new Date(rechnung.faelligkeitsdatum).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                );
                const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
                const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
                return (
                  <div
                    key={rechnung.id}
                    className="bg-white dark:bg-slate-800 rounded-lg p-4 flex justify-between items-center hover:shadow-md dark:shadow-slate-900/40 transition-shadow cursor-pointer"
                    onClick={() => handleOpenDetail(rechnung)}
                  >
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-slate-100">{rechnung.kreditorName}</div>
                      <div className="text-sm text-gray-600 dark:text-slate-400">
                        {rechnung.betreff || rechnung.rechnungsnummer || 'Kein Betreff'}
                      </div>
                      {gesamtBezahlt > 0 && (
                        <div className="text-xs text-green-600 mt-1">
                          Bereits bezahlt: {formatCurrency(gesamtBezahlt)} von {formatCurrency(rechnung.summe)}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900 dark:text-slate-100">{formatCurrency(offenerBetrag)}</div>
                      <div className="text-sm text-yellow-600 font-medium">
                        {tageBisFaellig === -1
                          ? 'Heute fällig'
                          : tageBisFaellig === 0
                          ? 'Morgen fällig'
                          : `in ${tageBisFaellig + 1} Tagen`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Kritische Rechnungen */}
        {statistik && statistik.kritischeRechnungen.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              <h2 className="text-xl font-bold text-red-900 dark:text-red-300">Kritische Rechnungen</h2>
            </div>
            <div className="space-y-2">
              {statistik.kritischeRechnungen.map((rechnung) => {
                const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
                const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
                return (
                  <div
                    key={rechnung.id}
                    className="bg-white dark:bg-slate-800 rounded-lg p-4 flex justify-between items-center hover:shadow-md dark:shadow-slate-900/40 transition-shadow cursor-pointer"
                    onClick={() => handleOpenDetail(rechnung)}
                  >
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-slate-100">{rechnung.kreditorName}</div>
                      <div className="text-sm text-gray-600 dark:text-slate-400">
                        {rechnung.betreff || rechnung.rechnungsnummer || 'Kein Betreff'}
                      </div>
                      {gesamtBezahlt > 0 && (
                        <div className="text-xs text-green-600 mt-1">
                          Bereits bezahlt: {formatCurrency(gesamtBezahlt)} von {formatCurrency(rechnung.summe)}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-600">{formatCurrency(offenerBetrag)}</div>
                      <div className="text-sm text-gray-600 dark:text-slate-400">
                        Fällig: {new Date(rechnung.faelligkeitsdatum).toLocaleDateString('de-DE')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabs für Offene/Bezahlte Rechnungen */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-slate-900/50">
          <div className="border-b border-gray-200 dark:border-slate-700">
            <div className="flex">
              <button
                onClick={() => setActiveTab('offen')}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors relative ${
                  activeTab === 'offen'
                    ? 'text-purple-600 border-b-2 border-purple-600'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span>Offene Rechnungen</span>
                  <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 px-2 py-1 rounded-full text-xs font-semibold">
                    {offeneRechnungen.length}
                  </span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('bezahlt')}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors relative ${
                  activeTab === 'bezahlt'
                    ? 'text-green-600 border-b-2 border-green-600'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span>Bezahlte Rechnungen</span>
                  <span className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-2 py-1 rounded-full text-xs font-semibold">
                    {bezahlteRechnungen.length}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Rechnungsliste */}
          <div className="p-6">
            {activeTab === 'offen' ? (
              <PrivatRechnungsListe
                rechnungen={offeneRechnungen}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRefresh={loadData}
                onOpenDetail={handleOpenDetail}
              />
            ) : (
              <PrivatRechnungsListe
                rechnungen={bezahlteRechnungen}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRefresh={loadData}
                onOpenDetail={handleOpenDetail}
              />
            )}
          </div>
        </div>

        {/* Timeline */}
        <PrivatFaelligkeitsTimeline rechnungen={rechnungen} tageAnzeigen={60} onOpenDetail={handleOpenDetail} />

        {/* Formular Modal */}
        {showFormular && (
          <PrivatRechnungsFormular
            rechnung={selectedRechnung}
            onSave={handleSave}
            onCancel={() => {
              setShowFormular(false);
              setSelectedRechnung(null);
            }}
          />
        )}

        {/* Detail Modal */}
        {showDetail && selectedRechnung && (
          <PrivatRechnungsDetail
            rechnung={selectedRechnung}
            onClose={handleCloseDetail}
            onEdit={() => handleEdit(selectedRechnung)}
            onUpdate={handleDetailUpdate}
          />
        )}
      </div>
    </div>
  );
};

// Statistik-Karte Komponente
interface StatistikKarteProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'purple' | 'yellow' | 'red' | 'orange' | 'green';
  onClick?: () => void;
}

const StatistikKarte = ({ title, value, subtitle, icon: Icon, color, onClick }: StatistikKarteProps) => {
  const colorClasses = {
    purple: 'bg-purple-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    green: 'bg-green-500',
  };

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-slate-900/50 p-6 hover:shadow-xl transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-slate-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 mt-2">{value}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{subtitle}</p>
        </div>
        <div className={`${colorClasses[color]} rounded-lg p-3`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
};

// Diagramm-Karte Komponente
interface DiagrammKarteProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

const DiagrammKarte = ({ title, icon: Icon, children }: DiagrammKarteProps) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-slate-900/50 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Icon className="w-6 h-6 text-purple-600" />
        <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">{title}</h3>
      </div>
      {children}
    </div>
  );
};

// Pie Chart Komponente (vereinfacht)
interface PieChartProps {
  data: Array<{
    label: string;
    value: number;
    count: number;
    color: string;
  }>;
}

const PieChart = ({ data }: PieChartProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0 || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
        Keine Daten verfügbar
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  return (
    <div className="space-y-4">
      {/* Einfache Balkendiagramm-Darstellung */}
      <div className="space-y-3">
        {data.map((item, index) => {
          const percentage = (item.value / total) * 100;
          return (
            <div
              key={index}
              className={`p-3 rounded-lg transition-all cursor-pointer ${
                hoveredIndex === index ? 'bg-gray-100 dark:bg-slate-700' : 'hover:bg-gray-50 dark:hover:bg-slate-750'
              }`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                    {item.label}
                  </span>
                  <span className="text-xs text-gray-400">({item.count})</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {formatCurrency(item.value)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: item.color
                  }}
                />
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-1 text-right">
                {percentage.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Gesamt */}
      <div className="pt-3 border-t border-gray-200 dark:border-slate-700 flex justify-between items-center">
        <span className="text-sm font-medium text-gray-600 dark:text-slate-400">Gesamt</span>
        <span className="text-lg font-bold text-gray-900 dark:text-slate-100">{formatCurrency(total)}</span>
      </div>
    </div>
  );
};

// Status-Diagramm Komponente
const StatusDiagramm = ({ statistik }: { statistik: PrivatKreditorenStatistik }) => {
  const statusLabels: Record<string, string> = {
    offen: 'Offen',
    faellig: 'Fällig',
    gemahnt: 'Gemahnt',
    in_bearbeitung: 'In Bearbeitung',
    verzug: 'Verzug',
    inkasso: 'Inkasso',
    bezahlt: 'Bezahlt',
    storniert: 'Storniert',
  };

  const statusColors: Record<string, string> = {
    offen: '#8b5cf6',
    faellig: '#eab308',
    gemahnt: '#f97316',
    in_bearbeitung: '#a855f7',
    verzug: '#ef4444',
    inkasso: '#dc2626',
    bezahlt: '#22c55e',
    storniert: '#6b7280',
  };

  const data = Object.entries(statistik.nachStatus)
    .filter(([_, data]) => data.anzahl > 0)
    .map(([status, data]) => ({
      label: statusLabels[status],
      value: data.betrag,
      count: data.anzahl,
      color: statusColors[status],
    }));

  return <PieChart data={data} />;
};

// Kategorie-Diagramm Komponente
const KategorieDiagramm = ({ statistik }: { statistik: PrivatKreditorenStatistik }) => {
  const kategorieLabels: Record<string, string> = {
    lieferanten: 'Lieferanten',
    dienstleister: 'Dienstleister',
    energie: 'Energie',
    miete: 'Miete',
    versicherung: 'Versicherung',
    steuern: 'Steuern',
    darlehen: 'Darlehen',
    sonstiges: 'Sonstiges',
  };

  const kategorieColors: Record<string, string> = {
    lieferanten: '#8b5cf6',
    dienstleister: '#a855f7',
    energie: '#eab308',
    miete: '#22c55e',
    versicherung: '#6366f1',
    steuern: '#ef4444',
    darlehen: '#f97316',
    sonstiges: '#6b7280',
  };

  const data = Object.entries(statistik.nachKategorie)
    .filter(([_, data]) => data.anzahl > 0)
    .map(([kategorie, data]) => ({
      label: kategorieLabels[kategorie],
      value: data.betrag,
      count: data.anzahl,
      color: kategorieColors[kategorie],
    }));

  return <PieChart data={data} />;
};

export default PrivatKreditorenVerwaltung;
