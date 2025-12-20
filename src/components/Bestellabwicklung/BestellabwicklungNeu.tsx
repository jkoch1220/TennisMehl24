import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, FileCheck, Truck, ArrowLeft } from 'lucide-react';
import { DokumentTyp } from '../../types/bestellabwicklung';
import { Projekt } from '../../types/projekt';
import { projektService } from '../../services/projektService';
import AngebotTab from './AngebotTab';
import LieferscheinTab from './LieferscheinTab';
import RechnungTab from './RechnungTab';

const Bestellabwicklung = () => {
  const { projektId } = useParams<{ projektId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DokumentTyp>('angebot');
  const [projekt, setProjekt] = useState<Projekt | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projekt-verwaltung')}
            className="p-2 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-lg transition-colors"
            title="Zurück zur Projektverwaltung"
          >
            <ArrowLeft className="h-6 w-6 text-gray-600 dark:text-dark-textMuted" />
          </button>
          <div className="p-3 bg-gradient-to-br from-red-500 to-orange-600 dark:from-red-400 dark:to-orange-500 rounded-xl shadow-lg dark:shadow-dark-glow-red">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text">Bestellabwicklung</h1>
            <p className="text-gray-600 dark:text-dark-textMuted mt-1">
              {projekt.kundenname} • {projekt.kundenPlzOrt}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-slate-700 mb-6 overflow-hidden">
        <div className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 font-semibold transition-all border-b-2 ${
                  isActive
                    ? `bg-gradient-to-r ${tab.activeGradient} text-white shadow-lg dark:shadow-dark-lg border-transparent`
                    : `${tab.inactiveText} bg-transparent dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-dark-elevated border-transparent`
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
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
