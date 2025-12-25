import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, FileCheck, Truck, ArrowLeft, MapPin, Package, Euro, ChevronDown, ChevronUp } from 'lucide-react';
import { DokumentTyp } from '../../types/bestellabwicklung';
import { Projekt } from '../../types/projekt';
import { projektService } from '../../services/projektService';
import AngebotTab from './AngebotTab';
import LieferscheinTab from './LieferscheinTab';
import RechnungTab from './RechnungTab';

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

const Bestellabwicklung = () => {
  const { projektId } = useParams<{ projektId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<DokumentTyp>('angebot');
  const [projekt, setProjekt] = useState<Projekt | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMobileProjektInfo, setShowMobileProjektInfo] = useState(false);

  // Projekt laden
  useEffect(() => {
    const loadProjekt = async () => {
      if (!projektId) {
        alert('Keine Projekt-ID angegeben');
        navigate('/projekt-verwaltung');
        return;
      }

      try {
        setLoading(true);
        const loadedProjekt = await projektService.getProjekt(projektId);
        setProjekt(loadedProjekt);
        
        // Tab basierend auf Projekt-Status setzen
        if (loadedProjekt.status === 'angebot' || loadedProjekt.status === 'angebot_versendet') {
          setActiveTab('angebot');
        } else if (loadedProjekt.status === 'lieferschein') {
          setActiveTab('lieferschein');
        } else if (loadedProjekt.status === 'rechnung') {
          setActiveTab('rechnung');
        }
      } catch (error) {
        console.error('Fehler beim Laden des Projekts:', error);
        alert('Fehler beim Laden des Projekts');
        navigate('/projekt-verwaltung');
      } finally {
        setLoading(false);
      }
    };

    loadProjekt();
  }, [projektId, navigate]);

  const tabs = [
    { id: 'angebot' as DokumentTyp, label: 'Angebot', icon: FileCheck, activeGradient: 'from-blue-600 to-cyan-600 dark:from-blue-500 dark:to-cyan-500', inactiveText: 'text-blue-600 dark:text-blue-400' },
    { id: 'lieferschein' as DokumentTyp, label: 'Lieferschein', icon: Truck, activeGradient: 'from-green-600 to-emerald-600 dark:from-green-500 dark:to-emerald-500', inactiveText: 'text-green-600 dark:text-green-400' },
    { id: 'rechnung' as DokumentTyp, label: 'Rechnung', icon: FileText, activeGradient: 'from-red-600 to-orange-600 dark:from-red-500 dark:to-orange-500', inactiveText: 'text-red-600 dark:text-red-400' },
  ];

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 dark:border-red-400 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-600 dark:text-dark-textMuted">Lade Projekt...</p>
        </div>
      </div>
    );
  }

  if (!projekt) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <p className="text-xl text-gray-600 dark:text-dark-textMuted">Projekt nicht gefunden</p>
          <button
            onClick={() => navigate('/projekt-verwaltung')}
            className="mt-4 px-6 py-3 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 text-white rounded-lg transition-colors shadow-lg dark:shadow-dark-lg font-medium"
          >
            Zurück zur Projektverwaltung
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // MOBILE ANSICHT
  // ==========================================
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 pb-24">
        {/* Mobile Sticky Header */}
        <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 shadow-md dark:shadow-dark-lg">
          {/* Top Bar */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/projekt-verwaltung')}
                className="p-2 bg-gray-100 dark:bg-slate-800 rounded-lg active:scale-95 transition-transform"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  {projekt.kundenname}
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {projekt.kundenPlzOrt}
                </p>
              </div>
              <button
                onClick={() => setShowMobileProjektInfo(!showMobileProjektInfo)}
                className="p-2 bg-gray-100 dark:bg-slate-800 rounded-lg active:scale-95 transition-transform"
              >
                {showMobileProjektInfo ? (
                  <ChevronUp className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Expandable Project Info */}
          {showMobileProjektInfo && (
            <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 border-b border-orange-100 dark:border-orange-900/50">
              <div className="grid grid-cols-2 gap-3">
                {projekt.kundennummer && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Kd.-Nr:</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {projekt.kundennummer}
                    </span>
                  </div>
                )}
                {projekt.angefragteMenge && (
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {projekt.angefragteMenge} t
                    </span>
                  </div>
                )}
                {projekt.preisProTonne && (
                  <div className="flex items-center gap-2">
                    <Euro className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {projekt.preisProTonne.toFixed(2)} €/t
                    </span>
                  </div>
                )}
                {projekt.lieferadresse?.ort && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {projekt.lieferadresse.plz} {projekt.lieferadresse.ort}
                    </span>
                  </div>
                )}
              </div>
              {projekt.angebotsnummer && (
                <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-800/50">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Angebot: </span>
                  <span className="text-sm font-mono font-semibold text-blue-600 dark:text-blue-400">
                    {projekt.angebotsnummer}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab Content with bottom padding for fixed nav */}
        <div className="px-3 py-4">
          {activeTab === 'angebot' && <AngebotTab projekt={projekt} />}
          {activeTab === 'lieferschein' && <LieferscheinTab projekt={projekt} />}
          {activeTab === 'rechnung' && <RechnungTab projekt={projekt} />}
        </div>

        {/* Fixed Bottom Tab Navigation */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 shadow-lg dark:shadow-dark-lg safe-area-bottom">
          <div className="flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all active:scale-95 ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  style={isActive ? {
                    background: tab.id === 'angebot'
                      ? 'linear-gradient(135deg, #2563eb, #0891b2)'
                      : tab.id === 'lieferschein'
                        ? 'linear-gradient(135deg, #16a34a, #059669)'
                        : 'linear-gradient(135deg, #dc2626, #ea580c)'
                  } : {}}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // DESKTOP ANSICHT
  // ==========================================
  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 lg:mb-8 gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/projekt-verwaltung')}
            className="p-2.5 sm:p-2 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-lg transition-colors min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
            title="Zurück zur Projektverwaltung"
          >
            <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600 dark:text-dark-textMuted" />
          </button>
          <div className="p-2 sm:p-3 bg-gradient-to-br from-red-500 to-orange-600 dark:from-red-400 dark:to-orange-500 rounded-lg sm:rounded-xl shadow-lg dark:shadow-dark-glow-red">
            <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-dark-text truncate">Bestellabwicklung</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-dark-textMuted mt-0.5 sm:mt-1 truncate">
              {projekt.kundenname} • {projekt.kundenPlzOrt}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-lg sm:rounded-xl shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-slate-700 mb-4 sm:mb-6 overflow-hidden -mx-3 sm:mx-0">
        <div className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-3 px-2 sm:px-6 py-3 sm:py-4 font-semibold transition-all border-b-2 min-h-[56px] sm:min-h-0 ${
                  isActive
                    ? `bg-gradient-to-r ${tab.activeGradient} text-white shadow-lg dark:shadow-dark-lg border-transparent`
                    : `${tab.inactiveText} bg-transparent dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-dark-elevated border-transparent`
                }`}
              >
                <Icon className="h-5 w-5 sm:h-5 sm:w-5" />
                <span className="text-xs sm:text-base">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'angebot' && <AngebotTab projekt={projekt} />}
        {activeTab === 'lieferschein' && <LieferscheinTab projekt={projekt} />}
        {activeTab === 'rechnung' && <RechnungTab projekt={projekt} />}
      </div>
    </div>
  );
};

export default Bestellabwicklung;
