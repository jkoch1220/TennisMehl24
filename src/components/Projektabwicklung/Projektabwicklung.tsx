import { useState, useEffect } from 'react';
import { FileText, FileCheck, Truck, FileSignature, AlertCircle, ArrowLeft, User, MapPin, ChevronDown, ChevronUp, Hammer, ExternalLink } from 'lucide-react';
import { DokumentTyp } from '../../types/projektabwicklung';
import { ProjektStatus } from '../../types/projekt';
import { useParams, useNavigate } from 'react-router-dom';
import { Projekt } from '../../types/projekt';
import { SaisonKunde } from '../../types/saisonplanung';
import { projektService } from '../../services/projektService';
import { saisonplanungService } from '../../services/saisonplanungService';
import AngebotTab from './AngebotTab';
import AuftragsbestaetigungTab from './AuftragsbestaetigungTab';
import LieferscheinTab from './LieferscheinTab';
import RechnungTab from './RechnungTab';
import KundenDetailPopup from '../Shared/KundenDetailPopup';
import KundenAdressenEditor from './KundenAdressenEditor';
import ProjektChat from './ProjektChat';

// Status-Konfiguration für das Kanban-Board
const STATUS_CONFIG: Record<ProjektStatus, { label: string; color: string }> = {
  angebot: { label: 'Angebot', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  angebot_versendet: { label: 'Angebot versendet', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300' },
  auftragsbestaetigung: { label: 'Auftragsbestätigung', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
  lieferschein: { label: 'Lieferung', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
  rechnung: { label: 'Rechnung', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
  bezahlt: { label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
  verloren: { label: 'Verloren', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
};

const Projektabwicklung = () => {
  const { projektId } = useParams<{ projektId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DokumentTyp>('angebot');
  const [projekt, setProjekt] = useState<Projekt | null>(null);
  const [kunde, setKunde] = useState<SaisonKunde | null>(null);
  const [platzbauer, setPlatzbauer] = useState<SaisonKunde | null>(null);
  const [loading, setLoading] = useState(true);
  const [showKundenPopup, setShowKundenPopup] = useState(false);
  const [showAdressenEditor, setShowAdressenEditor] = useState(false);

  // Kunde laden (separate Funktion für Reload)
  const loadKunde = async (kundeId: string) => {
    try {
      const loadedKunde = await saisonplanungService.loadKunde(kundeId);
      if (loadedKunde) {
        setKunde(loadedKunde);
      }
    } catch (error) {
      console.warn('Konnte Kundendaten nicht laden:', error);
    }
  };

  // Projekt und Kundendaten laden
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

        // Kundendaten vollständig laden, falls kundeId vorhanden
        if (loadedProjekt.kundeId) {
          await loadKunde(loadedProjekt.kundeId);
        }

        // Platzbauer laden, falls Projekt einem Platzbauer zugeordnet ist
        if (loadedProjekt.platzbauerId) {
          try {
            const loadedPlatzbauer = await saisonplanungService.loadKunde(loadedProjekt.platzbauerId);
            if (loadedPlatzbauer) {
              setPlatzbauer(loadedPlatzbauer);
            }
          } catch (error) {
            console.warn('Konnte Platzbauer nicht laden:', error);
          }
        }

        // Tab basierend auf Projekt-Status setzen
        if (loadedProjekt.status === 'angebot' || loadedProjekt.status === 'angebot_versendet') {
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

  // Handler für Adressen-Update
  const handleAdressenUpdate = () => {
    if (projekt?.kundeId) {
      loadKunde(projekt.kundeId);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-600 dark:text-dark-textMuted">Lade Projekt...</p>
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
            Die Projektabwicklung kann nur über ein Projekt geöffnet werden.
          </p>
          <button
            onClick={() => navigate('/projekt-verwaltung')}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg dark:shadow-dark-lg"
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
    <div className="flex h-[calc(100vh-64px)]">
      {/* Hauptinhalt */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projekt-verwaltung')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-600 dark:bg-slate-700 rounded-lg transition-colors"
            title="Zurück zur Projektverwaltung"
          >
            <ArrowLeft className="h-6 w-6 text-gray-600 dark:text-dark-textMuted" />
          </button>
          <div className="p-3 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl shadow-lg dark:shadow-dark-lg">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text">Projektabwicklung</h1>
              {/* Status-Badge */}
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${STATUS_CONFIG[projekt.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                {STATUS_CONFIG[projekt.status]?.label || projekt.status}
              </span>
            </div>
            <p className="text-gray-600 dark:text-dark-textMuted mt-1">
              {kunde?.name || projekt.kundenname} • {projekt.kundenPlzOrt}
            </p>
          </div>
        </div>

        {/* Kunden-Button */}
        {projekt.kundeId && (
          <button
            onClick={() => setShowKundenPopup(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
            title="Kundendaten anzeigen"
          >
            <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <span className="text-gray-700 dark:text-gray-300 font-medium">Kunde</span>
          </button>
        )}
      </div>

      {/* PLATZBAUER-BANNER - Wenn Kunde ein Platzbauer ist oder Projekt über Platzbauer läuft */}
      {(projekt.istPlatzbauerprojekt || projekt.platzbauerId || kunde?.typ === 'platzbauer') && (
        <div className="mb-6 bg-gradient-to-r from-amber-100 via-yellow-100 to-orange-100 dark:from-amber-900/60 dark:via-yellow-900/60 dark:to-orange-900/60 border-4 border-amber-400 dark:border-amber-600 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-xl">
                <Hammer className="h-8 w-8 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-lg font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                    Platzbauer
                  </span>
                  <span className="px-3 py-1 bg-amber-500 text-white text-sm font-bold rounded-full shadow-md">
                    Partner-Projekt
                  </span>
                </div>
                <p className="text-2xl font-bold text-amber-950 dark:text-amber-100">
                  {kunde?.typ === 'platzbauer' ? kunde.name : (platzbauer?.name || projekt.kundenname)}
                </p>
                <p className="text-amber-800 dark:text-amber-300 mt-1">
                  {kunde?.typ === 'platzbauer'
                    ? 'Direktes Projekt mit Platzbauer-Partner'
                    : 'Vereinsprojekt über Platzbauer-Partner'}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/platzbauer-verwaltung')}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl transition-all shadow-lg hover:shadow-xl font-semibold text-lg"
            >
              <span>Platzbauer-Verwaltung</span>
              <ExternalLink className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Adressen-Section - Immer sichtbar wenn Kunde vorhanden */}
      {projekt.kundeId && kunde && (
        <div className="mb-6">
          {/* Kompakte Adress-Übersicht mit Bearbeiten-Buttons */}
          <div className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800/50 dark:to-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <MapPin className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold">Adressen</h3>
              </div>
              <button
                onClick={() => setShowAdressenEditor(!showAdressenEditor)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
              >
                {showAdressenEditor ? 'Schließen' : 'Erweitert'}
                {showAdressenEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {/* Kompakte Adress-Anzeige */}
            {!showAdressenEditor && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Lieferadresse */}
                <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-green-200 dark:border-green-900/50">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <Truck className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Lieferadresse</div>
                    <div className="text-sm text-gray-900 dark:text-white font-medium truncate">
                      {kunde.lieferadresse.strasse}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {kunde.lieferadresse.plz} {kunde.lieferadresse.ort}
                    </div>
                  </div>
                </div>

                {/* Rechnungsadresse */}
                <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-blue-900/50">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                      Rechnungsadresse
                      {kunde.rechnungsadresse.strasse === kunde.lieferadresse.strasse &&
                       kunde.rechnungsadresse.plz === kunde.lieferadresse.plz && (
                        <span className="ml-2 text-gray-500 dark:text-gray-400">(= Lieferadresse)</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-900 dark:text-white font-medium truncate">
                      {kunde.rechnungsadresse.strasse}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {kunde.rechnungsadresse.plz} {kunde.rechnungsadresse.ort}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Erweiterter Editor */}
            {showAdressenEditor && (
              <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
                <KundenAdressenEditor
                  kundeId={projekt.kundeId}
                  kundeName={kunde.name}
                  rechnungsadresse={kunde.rechnungsadresse}
                  lieferadresse={kunde.lieferadresse}
                  onUpdate={handleAdressenUpdate}
                />
              </div>
            )}
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
        {activeTab === 'angebot' && <AngebotTab projekt={projekt} kunde={kunde} />}
        {activeTab === 'auftragsbestaetigung' && <AuftragsbestaetigungTab projekt={projekt} kunde={kunde} />}
        {activeTab === 'lieferschein' && <LieferscheinTab projekt={projekt} kunde={kunde} />}
        {activeTab === 'rechnung' && <RechnungTab projekt={projekt} kunde={kunde} />}
      </div>

      {/* Kunden-Detail-Popup */}
      {showKundenPopup && projekt.kundeId && (
        <KundenDetailPopup
          kundeId={projekt.kundeId}
          onClose={() => setShowKundenPopup(false)}
        />
      )}
        </div>
      </div>

      {/* Chat-Seitenleiste */}
      <ProjektChat
        projektId={projekt.id}
        projektName={projekt.projektName || projekt.kundenname}
      />
    </div>
  );
};

export default Projektabwicklung;
