import { useState, useEffect, useCallback, DragEvent } from 'react';
import {
  FileCheck,
  FileSignature,
  Truck,
  FileText,
  CheckCircle2,
  RefreshCw,
  Search,
  MapPin,
  Euro,
  Package,
  GripVertical,
  Layers,
} from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';
import { projektService } from '../../services/projektService';
import { useNavigate } from 'react-router-dom';

// Tab-Konfiguration
const TABS: { id: ProjektStatus; label: string; icon: React.ComponentType<any>; color: string; bgColor: string }[] = [
  { id: 'angebot', label: 'Angebot', icon: FileCheck, color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  { id: 'auftragsbestaetigung', label: 'Auftragsbestätigung', icon: FileSignature, color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200' },
  { id: 'lieferschein', label: 'Lieferschein', icon: Truck, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200' },
  { id: 'rechnung', label: 'Rechnung', icon: FileText, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' },
  { id: 'bezahlt', label: 'Bezahlt', icon: CheckCircle2, color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-200' },
];

const ProjektVerwaltung = () => {
  const navigate = useNavigate();
  const [projekteGruppiert, setProjekteGruppiert] = useState<{
    angebot: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
  }>({
    angebot: [],
    auftragsbestaetigung: [],
    lieferschein: [],
    rechnung: [],
    bezahlt: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suche, setSuche] = useState('');
  const [draggedProjekt, setDraggedProjekt] = useState<Projekt | null>(null);
  const [dragOverTab, setDragOverTab] = useState<ProjektStatus | null>(null);
  const [saisonjahr] = useState(new Date().getFullYear());

  // Lade Daten
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const gruppiert = await projektService.loadProjekteGruppiert(saisonjahr);
      setProjekteGruppiert(gruppiert);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, [saisonjahr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter-Funktion
  const filterProjekte = (projekte: Projekt[]) => {
    if (!suche) return projekte;
    const s = suche.toLowerCase();
    return projekte.filter(p => 
      p.kundenname.toLowerCase().includes(s) ||
      p.kundenPlzOrt.toLowerCase().includes(s) ||
      p.kundennummer?.toLowerCase().includes(s) ||
      p.angebotsnummer?.toLowerCase().includes(s) ||
      p.rechnungsnummer?.toLowerCase().includes(s) ||
      p.lieferscheinnummer?.toLowerCase().includes(s)
    );
  };

  // Drag & Drop Handler
  const handleDragStart = (e: DragEvent, projekt: Projekt) => {
    setDraggedProjekt(projekt);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', projekt.id);
  };

  const handleDragEnd = () => {
    setDraggedProjekt(null);
    setDragOverTab(null);
  };

  const handleDragOver = (e: DragEvent, tab: ProjektStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTab(tab);
  };

  const handleDragLeave = () => {
    setDragOverTab(null);
  };

  const handleDrop = async (e: DragEvent, zielTab: ProjektStatus) => {
    e.preventDefault();
    setDragOverTab(null);
    
    if (!draggedProjekt) return;

    await updateStatus(draggedProjekt, zielTab);
    setDraggedProjekt(null);
  };

  // Status Update
  const updateStatus = async (projekt: Projekt, neuerStatus: ProjektStatus) => {
    setSaving(true);
    try {
      await projektService.updateProjektStatus(projekt.id, neuerStatus);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Status-Update:', error);
      alert('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Projekt-Klick Handler - Öffnet Formular
  const handleProjektClick = (projekt: Projekt) => {
    // Je nach Status das entsprechende Formular öffnen
    if (projekt.status === 'angebot') {
      // Zur Bestellabwicklung navigieren und Angebot-Tab öffnen
      navigate('/bestellabwicklung', { state: { projekt, tab: 'angebot' } });
    } else if (projekt.status === 'auftragsbestaetigung') {
      navigate('/bestellabwicklung', { state: { projekt, tab: 'auftragsbestaetigung' } });
    } else if (projekt.status === 'lieferschein') {
      navigate('/bestellabwicklung', { state: { projekt, tab: 'lieferschein' } });
    } else if (projekt.status === 'rechnung') {
      navigate('/bestellabwicklung', { state: { projekt, tab: 'rechnung' } });
    }
    // Bei 'bezahlt' nichts tun, da abgeschlossen
  };

  // Berechne Gesamtzahlen
  const gesamtAngebot = projekteGruppiert.angebot.length;
  const gesamtAuftragsbestaetigung = projekteGruppiert.auftragsbestaetigung.length;
  const gesamtLieferschein = projekteGruppiert.lieferschein.length;
  const gesamtRechnung = projekteGruppiert.rechnung.length;
  const gesamtBezahlt = projekteGruppiert.bezahlt.length;
  const gesamt = gesamtAngebot + gesamtAuftragsbestaetigung + gesamtLieferschein + gesamtRechnung + gesamtBezahlt;

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-600">Lade Projekte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg">
              <Layers className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Projekt-Verwaltung</h1>
              <p className="text-gray-600 mt-1">
                Überblick über alle Projekte • {gesamt} Projekte • Saison {saisonjahr}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Suche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Suche (Kunde, Nummer...)"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                className="pl-10 pr-4 py-2 w-72 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-5 gap-4">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const projekte = filterProjekte(
            tab.id === 'angebot' ? projekteGruppiert.angebot :
            tab.id === 'auftragsbestaetigung' ? projekteGruppiert.auftragsbestaetigung :
            tab.id === 'lieferschein' ? projekteGruppiert.lieferschein :
            tab.id === 'rechnung' ? projekteGruppiert.rechnung :
            projekteGruppiert.bezahlt
          );
          const count = 
            tab.id === 'angebot' ? gesamtAngebot :
            tab.id === 'auftragsbestaetigung' ? gesamtAuftragsbestaetigung :
            tab.id === 'lieferschein' ? gesamtLieferschein :
            tab.id === 'rechnung' ? gesamtRechnung :
            gesamtBezahlt;
          
          return (
            <div
              key={tab.id}
              className={`flex flex-col bg-white rounded-xl shadow-lg border-2 transition-all min-h-[600px] ${
                dragOverTab === tab.id ? 'border-purple-500 ring-4 ring-purple-200' : 'border-gray-200'
              }`}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, tab.id)}
            >
              {/* Tab Header */}
              <div className={`px-4 py-3 border-b-2 ${tab.bgColor} rounded-t-xl`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TabIcon className={`w-5 h-5 ${tab.color}`} />
                    <span className={`font-semibold ${tab.color}`}>{tab.label}</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-sm font-bold ${tab.bgColor} ${tab.color}`}>
                    {count}
                  </span>
                </div>
              </div>

              {/* Projekt-Liste */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {projekte.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <TabIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Keine Projekte</p>
                  </div>
                ) : (
                  projekte.map((projekt) => (
                    <ProjektCard
                      key={projekt.id}
                      projekt={projekt}
                      status={tab.id}
                      onDragStart={(e) => handleDragStart(e, projekt)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleProjektClick(projekt)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Saving Overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-[60] flex items-center justify-center">
          <div className="bg-white rounded-lg px-6 py-4 flex items-center gap-3 shadow-xl">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
            <span className="text-gray-700 font-medium">Speichere...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Projekt-Card Komponente
interface ProjektCardProps {
  projekt: Projekt;
  status: ProjektStatus;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}

const ProjektCard = ({ projekt, status, onDragStart, onDragEnd, onClick }: ProjektCardProps) => {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-all cursor-pointer group"
    >
      {/* Header mit Drag Handle */}
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 truncate">{projekt.kundenname}</h4>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{projekt.kundenPlzOrt}</span>
          </div>
          {projekt.kundennummer && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
              Nr. {projekt.kundennummer}
            </span>
          )}
        </div>
      </div>

      {/* Dokument-Infos */}
      <div className="text-xs text-gray-500 space-y-1 mb-2">
        {projekt.angebotsnummer && (
          <div className="flex items-center gap-1">
            <FileCheck className="w-3 h-3 text-blue-500" />
            Angebot: {projekt.angebotsnummer}
            {projekt.angebotsdatum && (
              <span className="text-gray-400">
                • {new Date(projekt.angebotsdatum).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        )}
        {projekt.auftragsbestaetigungsnummer && (
          <div className="flex items-center gap-1">
            <FileSignature className="w-3 h-3 text-orange-500" />
            AB: {projekt.auftragsbestaetigungsnummer}
            {projekt.auftragsbestaetigungsdatum && (
              <span className="text-gray-400">
                • {new Date(projekt.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        )}
        {projekt.lieferscheinnummer && (
          <div className="flex items-center gap-1">
            <Truck className="w-3 h-3 text-green-500" />
            Lieferschein: {projekt.lieferscheinnummer}
            {projekt.lieferdatum && (
              <span className="text-gray-400">
                • {new Date(projekt.lieferdatum).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        )}
        {projekt.rechnungsnummer && (
          <div className="flex items-center gap-1">
            <FileText className="w-3 h-3 text-red-500" />
            Rechnung: {projekt.rechnungsnummer}
            {projekt.rechnungsdatum && (
              <span className="text-gray-400">
                • {new Date(projekt.rechnungsdatum).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        )}
        {status === 'bezahlt' && projekt.bezahltAm && (
          <div className="flex items-center gap-1 text-green-600 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Bezahlt am {new Date(projekt.bezahltAm).toLocaleDateString('de-DE')}
          </div>
        )}
      </div>

      {/* Mengen- und Preis-Info */}
      {(projekt.angefragteMenge || projekt.preisProTonne) && (
        <div className="text-xs text-gray-500 space-y-0.5 pt-2 border-t border-gray-100">
          {projekt.angefragteMenge && (
            <div className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              {projekt.angefragteMenge}t
            </div>
          )}
          {projekt.preisProTonne && (
            <div className="flex items-center gap-1 font-medium text-gray-700">
              <Euro className="w-3 h-3" />
              {projekt.preisProTonne.toFixed(2)} €/t
            </div>
          )}
        </div>
      )}

      {/* Notiz Preview */}
      {projekt.notizen && (
        <div className="text-xs text-gray-400 mt-2 line-clamp-1 italic">
          "{projekt.notizen}"
        </div>
      )}
    </div>
  );
};

export default ProjektVerwaltung;
