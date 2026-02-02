/**
 * Platzbauer-Projektabwicklung (Fullscreen)
 *
 * Genau wie die reguläre Projektabwicklung für Vereine,
 * aber für Platzbauer-Projekte.
 */

import { useState, useEffect } from 'react';
import { FileText, FileCheck, Truck, FileSignature, AlertCircle, ArrowLeft, Hammer } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlatzbauerProjekt } from '../../types/platzbauer';
import { SaisonKunde, SaisonKundeMitDaten } from '../../types/saisonplanung';
import { platzbauerverwaltungService } from '../../services/platzbauerverwaltungService';
import PlatzbauerAngebotTab from './PlatzbauerAngebotTab';

// Status-Konfiguration
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  angebot: { label: 'Angebot', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  angebot_versendet: { label: 'Angebot versendet', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300' },
  auftragsbestaetigung: { label: 'Auftragsbestätigung', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
  lieferschein: { label: 'Lieferung', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
  rechnung: { label: 'Rechnung', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
  bezahlt: { label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
  verloren: { label: 'Verloren', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
};

type TabId = 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung';

const PlatzbauerProjektabwicklung = () => {
  const { projektId } = useParams<{ projektId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('angebot');
  const [projekt, setProjekt] = useState<PlatzbauerProjekt | null>(null);
  const [platzbauer, setPlatzbauer] = useState<SaisonKunde | null>(null);
  const [vereine, setVereine] = useState<SaisonKundeMitDaten[]>([]);
  const [loading, setLoading] = useState(true);

  // Projekt und Platzbauer-Daten laden
  useEffect(() => {
    const loadProjekt = async () => {
      if (!projektId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Projekt laden
        const loadedProjekt = await platzbauerverwaltungService.getPlatzbauerprojekt(projektId);
        setProjekt(loadedProjekt);

        // Platzbauer-Daten und zugehörige Vereine laden
        if (loadedProjekt?.platzbauerId) {
          const pbData = await platzbauerverwaltungService.loadPlatzbauer(loadedProjekt.platzbauerId);
          setPlatzbauer(pbData);

          // Vereine für diesen Platzbauer laden
          const vereineListe = await platzbauerverwaltungService.loadVereineFuerPlatzbauer(loadedProjekt.platzbauerId);
          setVereine(vereineListe);
        }

        // Tab basierend auf Projekt-Status setzen
        if (loadedProjekt) {
          if (loadedProjekt.status === 'angebot' || loadedProjekt.status === 'angebot_versendet') {
            setActiveTab('angebot');
          } else if (loadedProjekt.status === 'auftragsbestaetigung') {
            setActiveTab('auftragsbestaetigung');
          } else if (loadedProjekt.status === 'lieferschein') {
            setActiveTab('lieferschein');
          } else if (loadedProjekt.status === 'rechnung' || loadedProjekt.status === 'bezahlt') {
            setActiveTab('rechnung');
          } else {
            // Default: Angebot-Tab
            setActiveTab('angebot');
          }
        }
      } catch (error) {
        console.error('Fehler beim Laden des Projekts:', error);
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
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-amber-600 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-600 dark:text-dark-textMuted">Lade Platzbauer-Projekt...</p>
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-2">Kein Projekt ausgewählt</h2>
          <p className="text-gray-600 dark:text-dark-textMuted mb-6">
            Die Platzbauer-Projektabwicklung kann nur über ein Projekt geöffnet werden.
          </p>
          <button
            onClick={() => navigate('/platzbauer-verwaltung')}
            className="px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg hover:from-amber-700 hover:to-orange-700 transition-all shadow-lg"
          >
            Zur Platzbauer-Verwaltung
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'angebot' as TabId, label: 'Angebot', icon: FileCheck, color: 'from-blue-600 to-cyan-600' },
    { id: 'auftragsbestaetigung' as TabId, label: 'Auftragsbestätigung', icon: FileSignature, color: 'from-orange-600 to-amber-600' },
    { id: 'lieferschein' as TabId, label: 'Lieferscheine', icon: Truck, color: 'from-green-600 to-emerald-600' },
    { id: 'rechnung' as TabId, label: 'Rechnung', icon: FileText, color: 'from-red-600 to-orange-600' },
  ];

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Hauptinhalt */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/platzbauer-verwaltung')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-600 dark:bg-slate-700 rounded-lg transition-colors"
                title="Zurück zur Platzbauer-Verwaltung"
              >
                <ArrowLeft className="h-6 w-6 text-gray-600 dark:text-dark-textMuted" />
              </button>
              <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg dark:shadow-dark-lg">
                <Hammer className="h-8 w-8 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text">Platzbauer-Projektabwicklung</h1>
                  {/* Status-Badge */}
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${STATUS_CONFIG[projekt.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                    {STATUS_CONFIG[projekt.status]?.label || projekt.status}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-dark-textMuted mt-1">
                  {platzbauer?.name || 'Platzbauer'} • Saison {projekt.saisonjahr}
                </p>
              </div>
            </div>
          </div>

          {/* Platzbauer-Info */}
          {platzbauer && (
            <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <Hammer className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-amber-900 dark:text-amber-200">{platzbauer.name}</h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {platzbauer.rechnungsadresse?.strasse}, {platzbauer.rechnungsadresse?.plz} {platzbauer.rechnungsadresse?.ort}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-amber-600 dark:text-amber-400">{vereine.length} Vereine</p>
                  {projekt.gesamtMenge !== undefined && projekt.gesamtMenge > 0 && (
                    <p className="font-bold text-amber-900 dark:text-amber-200">
                      {projekt.gesamtMenge.toFixed(1)} t gesamt
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 mb-6 overflow-hidden">
            <div className="flex border-b border-gray-200 dark:border-slate-700">
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
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-slate-800'
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
            {activeTab === 'angebot' && (
              <PlatzbauerAngebotTab
                projekt={projekt}
                platzbauer={platzbauer}
              />
            )}
            {activeTab === 'auftragsbestaetigung' && (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
                <FileSignature className="h-16 w-16 text-orange-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Auftragsbestätigung</h3>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Kommt als nächstes...</p>
              </div>
            )}
            {activeTab === 'lieferschein' && (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
                <Truck className="h-16 w-16 text-green-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Lieferscheine</h3>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Kommt als nächstes...</p>
              </div>
            )}
            {activeTab === 'rechnung' && (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
                <FileText className="h-16 w-16 text-red-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Rechnung</h3>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Kommt als nächstes...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatzbauerProjektabwicklung;
