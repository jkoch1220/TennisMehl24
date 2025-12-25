import { useState, useEffect } from 'react';
import { Plus, TrendingUp, AlertTriangle, Clock, FileText, RefreshCw, BarChart3, PieChart as PieChartIcon, Building2, Phone } from 'lucide-react';
import { OffeneRechnung, KreditorenStatistik, Unternehmen } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';
import { aktivitaetService } from '../../services/aktivitaetService';
import RechnungsFormular from './RechnungsFormular';
import RechnungsListe from './RechnungsListe';
import RechnungsDetail from './RechnungsDetail';
import FaelligkeitsTimeline from './FaelligkeitsTimeline';
import TelefonnummernSchnellerfassung from './TelefonnummernSchnellerfassung';
import RatenzahlungsVereinbarung from './RatenzahlungsVereinbarung';
import UeberfaelligeRatenWarnung from './UeberfaelligeRatenWarnung';

const KreditorenVerwaltung = () => {
  const [rechnungen, setRechnungen] = useState<OffeneRechnung[]>([]);
  const [statistik, setStatistik] = useState<KreditorenStatistik | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [selectedRechnung, setSelectedRechnung] = useState<OffeneRechnung | null>(null);
  const [activeTab, setActiveTab] = useState<'offen' | 'bezahlt'>('offen');
  const [showDetail, setShowDetail] = useState(false);
  const [showTelefonErfassung, setShowTelefonErfassung] = useState(false);
  const [showUeberfaelligeRatenWarnung, setShowUeberfaelligeRatenWarnung] = useState(false);
  
  // Default-Firma aus localStorage laden oder 'Egner Bau' als Fallback
  const [defaultFirma, setDefaultFirma] = useState<Unternehmen>(() => {
    const saved = localStorage.getItem('kreditor_default_firma');
    return (saved as Unternehmen) || 'Egner Bau';
  });

  useEffect(() => {
    loadData();
  }, []);

  // Prüfe überfällige Raten nach dem Laden
  useEffect(() => {
    if (!loading && rechnungen.length > 0) {
      // Importiere die Funktion dynamisch
      import('../../utils/ratenzahlungCalculations').then(({ istRateUeberfaellig }) => {
        const hatUeberfaelligeRaten = rechnungen.some(r => istRateUeberfaellig(r));
        if (hatUeberfaelligeRaten) {
          // Verzögere Popup um 500ms damit die Seite vollständig geladen ist
          setTimeout(() => {
            setShowUeberfaelligeRatenWarnung(true);
          }, 500);
        }
      });
    }
  }, [loading, rechnungen]);

  // Speichere Default-Firma in localStorage
  useEffect(() => {
    localStorage.setItem('kreditor_default_firma', defaultFirma);
  }, [defaultFirma]);

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
    // Rechnung neu laden für aktualisierte Daten
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
      // Erst alle Aktivitäten löschen
      await aktivitaetService.deleteAktivitaetenFuerRechnung(id);
      // Dann die Rechnung löschen
      await kreditorService.deleteRechnung(id);
      loadData();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Rechnung');
    }
  };

  const handleRateBezahlen = (_rechnung: OffeneRechnung) => {
    // Öffne RatenzahlungsVereinbarung Bereich (scrolle dorthin)
    const element = document.getElementById('ratenzahlungsvereinbarung');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToNaechsteFaelligkeiten = () => {
    const element = document.getElementById('naechste-faelligkeiten');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  // Teile Rechnungen in offen und bezahlt auf
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-slate-400">Lade Daten...</p>
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
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">Kreditoren-Verwaltung</h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">Verwaltung offener Rechnungen und Kreditoren</p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            {/* Default-Firma Auswahl */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg px-4 py-2">
              <Building2 className="w-5 h-5 text-gray-500 dark:text-slate-400" />
              <label className="text-sm font-medium text-gray-700 dark:text-slate-400">Standard:</label>
              <select
                value={defaultFirma}
                onChange={(e) => setDefaultFirma(e.target.value as Unternehmen)}
                className="border-none bg-transparent text-sm font-semibold text-gray-900 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="Egner Bau">Egner Bau</option>
                <option value="TennisMehl">TennisMehl</option>
              </select>
            </div>
            
            <button
              onClick={loadData}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Aktualisieren
            </button>
            <button
              onClick={() => setShowTelefonErfassung(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              title="Telefonnummern schnell erfassen"
            >
              <Phone className="w-5 h-5" />
              📞 Telefon-Erfassung
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
          <div className="grid md:grid-cols-3 gap-6">
            {/* Status-Verteilung */}
            <DiagrammKarte title="Verteilung nach Status" icon={PieChartIcon}>
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

        {/* Ratenzahlungsvereinbarungen */}
        <div id="ratenzahlungsvereinbarung">
          <RatenzahlungsVereinbarung 
            rechnungen={rechnungen}
            onUpdate={loadData}
            onOpenDetail={handleOpenDetail}
          />
        </div>

        {/* Nächste Fälligkeiten */}
        {statistik && statistik.naechsteFaelligkeiten.length > 0 && (
          <div id="naechste-faelligkeiten" className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg p-6">
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
                    ? 'text-red-600 border-b-2 border-red-600'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span>Offene Rechnungen</span>
                  <span className="bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 px-2 py-1 rounded-full text-xs font-semibold">
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
              <RechnungsListe
                rechnungen={offeneRechnungen}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRefresh={loadData}
                onOpenDetail={handleOpenDetail}
              />
            ) : (
              <RechnungsListe
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
        <FaelligkeitsTimeline rechnungen={rechnungen} tageAnzeigen={60} onOpenDetail={handleOpenDetail} />

        {/* Formular Modal */}
        {showFormular && (
          <RechnungsFormular
            rechnung={selectedRechnung}
            defaultFirma={defaultFirma}
            onSave={handleSave}
            onCancel={() => {
              setShowFormular(false);
              setSelectedRechnung(null);
            }}
          />
        )}

        {/* Detail Modal */}
        {showDetail && selectedRechnung && (
          <RechnungsDetail
            rechnung={selectedRechnung}
            onClose={handleCloseDetail}
            onEdit={() => handleEdit(selectedRechnung)}
            onUpdate={handleDetailUpdate}
          />
        )}

        {/* Telefonnummern-Schnellerfassung */}
        {showTelefonErfassung && (
          <TelefonnummernSchnellerfassung
            rechnungen={offeneRechnungen}
            onClose={() => setShowTelefonErfassung(false)}
            onUpdate={loadData}
          />
        )}

        {/* Überfällige Raten Warnung */}
        {showUeberfaelligeRatenWarnung && (
          <UeberfaelligeRatenWarnung
            rechnungen={rechnungen}
            onClose={() => setShowUeberfaelligeRatenWarnung(false)}
            onRateBezahlen={handleRateBezahlen}
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
  onClick?: () => void;
}

const StatistikKarte = ({ title, value, subtitle, icon: Icon, color, onClick }: StatistikKarteProps) => {
  const colorClasses = {
    blue: 'bg-blue-500',
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
        <Icon className="w-6 h-6 text-red-600" />
        <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">{title}</h3>
      </div>
      {children}
    </div>
  );
};

// Pie Chart Komponente
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
  
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500 text-sm">
        Keine Daten verfügbar
      </div>
    );
  }

  // Auch bei nur einem Eintrag anzeigen
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500 text-sm">
        Keine Daten verfügbar
      </div>
    );
  }

  // Berechne Segmente
  let currentAngle = -90; // Start bei 12 Uhr
  const segments = data.map((item) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    return {
      ...item,
      percentage,
      startAngle,
      endAngle,
      angle,
    };
  });

  // SVG Path für Donut-Segment erstellen
  const createArc = (startAngle: number, endAngle: number, outerRadius: number, innerRadius: number) => {
    const start = polarToCartesian(100, 100, outerRadius, endAngle);
    const end = polarToCartesian(100, 100, outerRadius, startAngle);
    const innerStart = polarToCartesian(100, 100, innerRadius, endAngle);
    const innerEnd = polarToCartesian(100, 100, innerRadius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', start.x, start.y,
      'A', outerRadius, outerRadius, 0, largeArcFlag, 0, end.x, end.y,
      'L', innerEnd.x, innerEnd.y,
      'A', innerRadius, innerRadius, 0, largeArcFlag, 1, innerStart.x, innerStart.y,
      'Z'
    ].join(' ');
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const hoveredSegment = hoveredIndex !== null ? segments[hoveredIndex] : null;

  return (
    <div className="space-y-6">
      {/* Donut Chart mit externem Tooltip */}
      <div className="relative flex justify-center items-center">
        <div className="relative">
          <svg viewBox="0 0 200 200" className="w-56 h-56">
            {segments.map((segment, index) => {
              const isHovered = hoveredIndex === index;
              const outerRadius = isHovered ? 82 : 80;
              const innerRadius = 50;
              
              return (
                <path
                  key={index}
                  d={createArc(segment.startAngle, segment.endAngle, outerRadius, innerRadius)}
                  fill={segment.color}
                  className="transition-all duration-300 cursor-pointer"
                  style={{
                    opacity: hoveredIndex === null || isHovered ? 1 : 0.4,
                    filter: isHovered ? 'brightness(1.1) drop-shadow(0 2px 4px rgba(0,0,0,0.1))' : 'none',
                  }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })}
            
            {/* Mittig: Gesamt */}
            <text
              x="100"
              y="95"
              textAnchor="middle"
              className="text-xs fill-gray-500 font-medium"
            >
              Gesamt
            </text>
            <text
              x="100"
              y="110"
              textAnchor="middle"
              className="text-sm fill-gray-900 font-bold"
            >
              {formatCurrency(total)}
            </text>
          </svg>
          
          {/* Externer Tooltip bei Hover */}
          {hoveredSegment && (
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 translate-y-full z-10 animate-in fade-in duration-200">
              <div className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-xl min-w-[200px]">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: hoveredSegment.color }}
                  />
                  <span className="text-sm font-semibold">{hoveredSegment.label}</span>
                </div>
                <div className="text-lg font-bold mb-1">
                  {formatCurrency(hoveredSegment.value)}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-300">
                  <span>{hoveredSegment.percentage.toFixed(1)}% vom Gesamt</span>
                  <span>{hoveredSegment.count} Rechnung{hoveredSegment.count !== 1 ? 'en' : ''}</span>
                </div>
              </div>
              {/* Pfeil nach oben */}
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-gray-900"></div>
            </div>
          )}
        </div>
      </div>

      {/* Kompakte Legende */}
      <div className="space-y-1.5">
        {segments.map((segment, index) => (
          <div
            key={index}
            className={`flex items-center justify-between px-3 py-2 rounded-md transition-all duration-200 cursor-pointer ${
              hoveredIndex === index
                ? 'bg-gray-100 dark:bg-slate-700 shadow-sm scale-[1.02]'
                : 'hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 transition-transform duration-200"
                style={{ 
                  backgroundColor: segment.color,
                  transform: hoveredIndex === index ? 'scale(1.2)' : 'scale(1)'
                }}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-slate-400 truncate">
                {segment.label}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                {segment.percentage.toFixed(0)}%
              </span>
            </div>
            <div className="text-right flex-shrink-0 ml-3">
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                {formatCurrency(segment.value)}
              </div>
            </div>
          </div>
        ))}
      </div>
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
    inkasso: 'Inkasso',
    bezahlt: 'Bezahlt',
    storniert: 'Storniert',
  };

  const statusColors: Record<string, string> = {
    offen: '#3b82f6',
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
const KategorieDiagramm = ({ statistik }: { statistik: KreditorenStatistik }) => {
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
    lieferanten: '#3b82f6',
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

// Unternehmen-Diagramm Komponente
const UnternehmenDiagramm = ({ statistik }: { statistik: KreditorenStatistik }) => {
  const unternehmenLabels: Record<string, string> = {
    TennisMehl: 'TennisMehl',
    'Egner Bau': 'Egner Bau',
  };

  const unternehmenColors: Record<string, string> = {
    TennisMehl: '#dc2626',
    'Egner Bau': '#2563eb',
  };

  const data = Object.entries(statistik.nachUnternehmen)
    .filter(([_, data]) => data.anzahl > 0)
    .map(([unternehmen, data]) => ({
      label: unternehmenLabels[unternehmen],
      value: data.betrag,
      count: data.anzahl,
      color: unternehmenColors[unternehmen],
    }));

  return <PieChart data={data} />;
};

export default KreditorenVerwaltung;
