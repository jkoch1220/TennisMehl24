import { useState, useEffect } from 'react';
import { FileText, FileCheck, Truck, FileSignature, AlertCircle, ArrowLeft } from 'lucide-react';
import { DokumentTyp } from '../../types/bestellabwicklung';
import { useParams, useNavigate } from 'react-router-dom';
import { Projekt } from '../../types/projekt';
import { projektService } from '../../services/projektService';
import AngebotTab from './AngebotTab';
import AuftragsbestaetigungTab from './AuftragsbestaetigungTab';
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
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const loadedProjekt = await projektService.getProjekt(projektId);
        setProjekt(loadedProjekt);
        
        // Tab basierend auf Projekt-Status setzen
        if (loadedProjekt.status === 'angebot') {
          setActiveTab('angebot');
        } else if (loadedProjekt.status === 'auftragsbestaetigung') {
          setActiveTab('auftragsbestaetigung');
        } else if (loadedProjekt.status === 'lieferschein') {
          setActiveTab('lieferschein');
        } else if (loadedProjekt.status === 'rechnung') {
          setActiveTab('rechnung');
        }
      } catch (error) {
        console.error('Fehler beim Laden des Projekts:', error);
        alert('Fehler beim Laden des Projekts');
      } finally {
        setLoading(false);
      }
    };

    loadProjekt();
  }, [projektId]);

  // Loading state
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-600">Lade Projekt...</p>
        </div>
      </div>
    );
  }

  // Wenn kein Projekt vorhanden
  if (!projekt) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-8 text-center">
          <AlertCircle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Kein Projekt ausgewählt</h2>
          <p className="text-gray-600 mb-6">
            Die Bestellabwicklung kann nur über ein Projekt geöffnet werden.
          </p>
          <button
            onClick={() => navigate('/projekt-verwaltung')}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg"
          >
            Zur Projekt-Verwaltung
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'angebot' as DokumentTyp, label: 'Angebot', icon: FileCheck, color: 'from-blue-600 to-cyan-600' },
    { id: 'auftragsbestaetigung' as DokumentTyp, label: 'Auftragsbestätigung', icon: FileSignature, color: 'from-orange-600 to-amber-600' },
    { id: 'lieferschein' as DokumentTyp, label: 'Lieferschein', icon: Truck, color: 'from-green-600 to-emerald-600' },
    { id: 'rechnung' as DokumentTyp, label: 'Rechnung', icon: FileText, color: 'from-red-600 to-orange-600' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projekt-verwaltung')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Zurück zur Projektverwaltung"
          >
            <ArrowLeft className="h-6 w-6 text-gray-600" />
          </button>
          <div className="p-3 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl shadow-lg">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Bestellabwicklung</h1>
            <p className="text-gray-600 mt-1">
              {projekt.kundenname} • {projekt.kundenPlzOrt}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r ' + tab.color + ' text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-50'
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
        {activeTab === 'auftragsbestaetigung' && <AuftragsbestaetigungTab projekt={projekt} />}
        {activeTab === 'lieferschein' && <LieferscheinTab projekt={projekt} />}
        {activeTab === 'rechnung' && <RechnungTab projekt={projekt} />}
      </div>
    </div>
  );
};

export default Bestellabwicklung;
