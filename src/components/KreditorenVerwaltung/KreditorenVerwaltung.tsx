import { useState, useEffect } from 'react';
import { Plus, TrendingUp, AlertTriangle, Clock, DollarSign, FileText, RefreshCw, BarChart3, PieChart } from 'lucide-react';
import { OffeneRechnung, KreditorenStatistik } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';
import RechnungsFormular from './RechnungsFormular';
import RechnungsListe from './RechnungsListe';
import FaelligkeitsTimeline from './FaelligkeitsTimeline';

const KreditorenVerwaltung = () => {
  const [rechnungen, setRechnungen] = useState<OffeneRechnung[]>([]);
  const [statistik, setStatistik] = useState<KreditorenStatistik | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [selectedRechnung, setSelectedRechnung] = useState<OffeneRechnung | null>(null);

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
  };

  const handleDelete = async (id: string) => {
    try {
      await kreditorService.deleteRechnung(id);
      loadData();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Rechnung');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade Daten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Kreditoren-Verwaltung</h1>
            <p className="text-gray-600 mt-1">Verwaltung offener Rechnungen und Kreditoren</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadData}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Aktualisieren
            </button>
            <button
              onClick={() => {
                setSelectedRechnung(null);
                setShowFormular(true);
              }}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Neue Rechnung
            </button>
          </div>
        </div>

        {/* Statistik-Karten */}
        {statistik && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatistikKarte
              title="Gesamt offen"
              value={formatCurrency(statistik.gesamtBetrag)}
              subtitle={`${statistik.gesamtOffen} Rechnungen`}
              icon={FileText}
              color="blue"
            />
            <StatistikKarte
              title="Fällig"
              value={formatCurrency(statistik.faelligBetrag)}
              subtitle="Fällige Rechnungen"
              icon={Clock}
              color="yellow"
            />
            <StatistikKarte
              title="Im Verzug"
              value={formatCurrency(statistik.verzugBetrag)}
              subtitle="Überfällige Rechnungen"
              icon={AlertTriangle}
              color="red"
            />
            <StatistikKarte
              title="Gemahnt"
              value={formatCurrency(statistik.gemahntBetrag)}
              subtitle="Gemahnte Rechnungen"
              icon={TrendingUp}
              color="orange"
            />
          </div>
        )}

        {/* Timeline */}
        <FaelligkeitsTimeline rechnungen={rechnungen} tageAnzeigen={60} />

        {/* Diagramme */}
        {statistik && (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Status-Verteilung */}
            <DiagrammKarte title="Verteilung nach Status" icon={PieChart}>
              <StatusDiagramm statistik={statistik} />
            </DiagrammKarte>

            {/* Kategorie-Verteilung */}
            <DiagrammKarte title="Verteilung nach Kategorie" icon={BarChart3}>
              <KategorieDiagramm statistik={statistik} />
            </DiagrammKarte>

            {/* Unternehmen-Verteilung */}
            <DiagrammKarte title="Verteilung nach Unternehmen" icon={BarChart3}>
              <UnternehmenDiagramm statistik={statistik} />
            </DiagrammKarte>
          </div>
        )}

        {/* Kritische Rechnungen */}
        {statistik && statistik.kritischeRechnungen.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h2 className="text-xl font-bold text-red-900">Kritische Rechnungen</h2>
            </div>
            <div className="space-y-2">
              {statistik.kritischeRechnungen.map((rechnung) => {
                const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
                const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
                return (
                  <div
                    key={rechnung.id}
                    className="bg-white rounded-lg p-4 flex justify-between items-center hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleEdit(rechnung)}
                  >
                    <div>
                      <div className="font-semibold text-gray-900">{rechnung.kreditorName}</div>
                      <div className="text-sm text-gray-600">
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
                      <div className="text-sm text-gray-600">
                        Fällig: {new Date(rechnung.faelligkeitsdatum).toLocaleDateString('de-DE')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Nächste Fälligkeiten */}
        {statistik && statistik.naechsteFaelligkeiten.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-6 h-6 text-yellow-600" />
              <h2 className="text-xl font-bold text-yellow-900">Nächste Fälligkeiten (7 Tage)</h2>
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
                    className="bg-white rounded-lg p-4 flex justify-between items-center hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleEdit(rechnung)}
                  >
                    <div>
                      <div className="font-semibold text-gray-900">{rechnung.kreditorName}</div>
                      <div className="text-sm text-gray-600">
                        {rechnung.betreff || rechnung.rechnungsnummer || 'Kein Betreff'}
                      </div>
                      {gesamtBezahlt > 0 && (
                        <div className="text-xs text-green-600 mt-1">
                          Bereits bezahlt: {formatCurrency(gesamtBezahlt)} von {formatCurrency(rechnung.summe)}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">{formatCurrency(offenerBetrag)}</div>
                      <div className="text-sm text-yellow-600 font-medium">
                        {tageBisFaellig === 0
                          ? 'Heute fällig'
                          : tageBisFaellig === 1
                          ? 'Morgen fällig'
                          : `in ${tageBisFaellig} Tagen`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rechnungsliste */}
        <RechnungsListe
          rechnungen={rechnungen}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onRefresh={loadData}
        />

        {/* Formular Modal */}
        {showFormular && (
          <RechnungsFormular
            rechnung={selectedRechnung}
            onSave={handleSave}
            onCancel={() => {
              setShowFormular(false);
              setSelectedRechnung(null);
            }}
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
  color: 'blue' | 'yellow' | 'red' | 'orange' | 'green';
}

const StatistikKarte = ({ title, value, subtitle, icon: Icon, color }: StatistikKarteProps) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    green: 'bg-green-500',
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
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
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Icon className="w-6 h-6 text-red-600" />
        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
};

// Status-Diagramm Komponente
const StatusDiagramm = ({ statistik }: { statistik: KreditorenStatistik }) => {
  const statusLabels: Record<string, string> = {
    offen: 'Offen',
    faellig: 'Fällig',
    gemahnt: 'Gemahnt',
    in_bearbeitung: 'In Bearbeitung',
    verzug: 'Verzug',
    bezahlt: 'Bezahlt',
    storniert: 'Storniert',
  };

  const statusColors: Record<string, string> = {
    offen: 'bg-blue-500',
    faellig: 'bg-yellow-500',
    gemahnt: 'bg-orange-500',
    in_bearbeitung: 'bg-purple-500',
    verzug: 'bg-red-500',
    bezahlt: 'bg-green-500',
    storniert: 'bg-gray-500',
  };

  const maxBetrag = Math.max(...Object.values(statistik.nachStatus).map(s => s.betrag));

  return (
    <div className="space-y-4">
      {Object.entries(statistik.nachStatus)
        .filter(([_, data]) => data.anzahl > 0)
        .map(([status, data]) => {
          const prozent = maxBetrag > 0 ? (data.betrag / maxBetrag) * 100 : 0;
          return (
            <div key={status}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700">{statusLabels[status]}</span>
                <span className="text-sm font-semibold text-gray-900">
                  {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(data.betrag)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`${statusColors[status]} h-4 rounded-full transition-all`}
                  style={{ width: `${prozent}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">{data.anzahl} Rechnungen</div>
            </div>
          );
        })}
    </div>
  );
};

// Kategorie-Diagramm Komponente
const KategorieDiagramm = ({ statistik }: { statistik: KreditorenStatistik }) => {
  const kategorieLabels: Record<string, string> = {
    lieferanten: 'Lieferanten',
    dienstleister: 'Dienstleister',
    energie: 'Energie',
    miete: 'Miete',
    versicherung: 'Versicherung',
    steuern: 'Steuern',
    sonstiges: 'Sonstiges',
  };

  const kategorieColors: Record<string, string> = {
    lieferanten: 'bg-blue-500',
    dienstleister: 'bg-purple-500',
    energie: 'bg-yellow-500',
    miete: 'bg-green-500',
    versicherung: 'bg-indigo-500',
    steuern: 'bg-red-500',
    sonstiges: 'bg-gray-500',
  };

  const maxBetrag = Math.max(...Object.values(statistik.nachKategorie).map(s => s.betrag));

  return (
    <div className="space-y-4">
      {Object.entries(statistik.nachKategorie)
        .filter(([_, data]) => data.anzahl > 0)
        .map(([kategorie, data]) => {
          const prozent = maxBetrag > 0 ? (data.betrag / maxBetrag) * 100 : 0;
          return (
            <div key={kategorie}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700">{kategorieLabels[kategorie]}</span>
                <span className="text-sm font-semibold text-gray-900">
                  {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(data.betrag)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`${kategorieColors[kategorie]} h-4 rounded-full transition-all`}
                  style={{ width: `${prozent}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">{data.anzahl} Rechnungen</div>
            </div>
          );
        })}
    </div>
  );
};

// Unternehmen-Diagramm Komponente
const UnternehmenDiagramm = ({ statistik }: { statistik: KreditorenStatistik }) => {
  const unternehmenLabels: Record<string, string> = {
    TennisMehl: 'TennisMehl',
    'Egner Bau': 'Egner Bau',
  };

  const unternehmenColors: Record<string, string> = {
    TennisMehl: 'bg-red-500',
    'Egner Bau': 'bg-blue-500',
  };

  const maxBetrag = Math.max(...Object.values(statistik.nachUnternehmen).map(s => s.betrag));

  return (
    <div className="space-y-4">
      {Object.entries(statistik.nachUnternehmen)
        .filter(([_, data]) => data.anzahl > 0)
        .map(([unternehmen, data]) => {
          const prozent = maxBetrag > 0 ? (data.betrag / maxBetrag) * 100 : 0;
          return (
            <div key={unternehmen}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700">{unternehmenLabels[unternehmen]}</span>
                <span className="text-sm font-semibold text-gray-900">
                  {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(data.betrag)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`${unternehmenColors[unternehmen]} h-4 rounded-full transition-all`}
                  style={{ width: `${prozent}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">{data.anzahl} Rechnungen</div>
            </div>
          );
        })}
    </div>
  );
};

export default KreditorenVerwaltung;
