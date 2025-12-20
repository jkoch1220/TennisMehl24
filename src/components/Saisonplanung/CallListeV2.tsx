import { useState, useEffect, useCallback, DragEvent } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  Clock,
  CheckCircle2,
  X,
  Copy,
  Check,
  RefreshCw,
  Search,
  User,
  MapPin,
  Calendar,
  MessageSquare,
  Package,
  Euro,
  ArrowLeft,
  GripVertical,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import {
  SaisonKundeMitDaten,
  AnrufStatus,
  AnrufErgebnis,
  Bestellabsicht,
  Bezugsweg,
} from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';
import { projektService } from '../../services/projektService';
import { NeuesProjekt } from '../../types/projekt';
import { useNavigate } from 'react-router-dom';
import ProjektDialog from '../Shared/ProjektDialog';

interface CallListeV2Props {
  saisonjahr: number;
  onClose: () => void;
}

// Tab-Konfiguration
const TABS: { id: AnrufStatus; label: string; icon: React.ComponentType<any>; color: string; bgColor: string }[] = [
  { id: 'anrufen', label: 'Anrufen', icon: Phone, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' },
  { id: 'nicht_erreicht', label: 'Nicht Erreicht', icon: PhoneMissed, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700' },
  { id: 'erreicht', label: 'Erreicht', icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700' },
  { id: 'rueckruf', label: 'Rückruf', icon: Clock, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700' },
];

const CallListeV2 = ({ saisonjahr, onClose }: CallListeV2Props) => {
  const navigate = useNavigate();
  const [kundenGruppiert, setKundenGruppiert] = useState<{
    anrufen: SaisonKundeMitDaten[];
    nichtErreicht: SaisonKundeMitDaten[];
    erreicht: SaisonKundeMitDaten[];
    rueckruf: SaisonKundeMitDaten[];
  }>({
    anrufen: [],
    nichtErreicht: [],
    erreicht: [],
    rueckruf: [],
  });
  const [allePlatzbauerKunden, setAllePlatzbauerKunden] = useState<SaisonKundeMitDaten[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suche, setSuche] = useState('');
  const [draggedKunde, setDraggedKunde] = useState<SaisonKundeMitDaten | null>(null);
  const [dragOverTab, setDragOverTab] = useState<AnrufStatus | null>(null);
  const [kundenMitProjekt, setKundenMitProjekt] = useState<Set<string>>(new Set());
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalKunde, setModalKunde] = useState<SaisonKundeMitDaten | null>(null);
  const [modalZielStatus, setModalZielStatus] = useState<AnrufStatus>('erreicht');
  
  // Projekt Dialog State
  const [showProjektDialog, setShowProjektDialog] = useState(false);
  const [projektKunde, setProjektKunde] = useState<SaisonKundeMitDaten | null>(null);
  
  // Form State für Modal
  const [formData, setFormData] = useState<AnrufErgebnis>({
    erreicht: true,
    notizen: '',
  });

  // OPTIMIERT: Lade Daten - nur eine Query statt zwei!
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Nur noch eine Query - gruppierte Liste lädt alle Daten
      const [gruppiert, projekte] = await Promise.all([
        saisonplanungService.loadCallListeGruppiert(saisonjahr),
        projektService.getAllProjekte(saisonjahr),
      ]);
      
      setKundenGruppiert(gruppiert);
      
      // Extrahiere Platzbauer aus der gruppierten Liste (im Speicher, keine DB-Query!)
      const allePlatzbauerAusGruppiert = [
        ...gruppiert.anrufen,
        ...gruppiert.nichtErreicht,
        ...gruppiert.erreicht,
        ...gruppiert.rueckruf,
      ].filter(k => k.kunde.typ === 'platzbauer');
      
      setAllePlatzbauerKunden(allePlatzbauerAusGruppiert);
      
      // Markiere Kunden mit Projekt
      const kundenIdsSet = new Set(projekte.map(p => p.kundeId));
      setKundenMitProjekt(kundenIdsSet);
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
  const filterKunden = (kunden: SaisonKundeMitDaten[]) => {
    if (!suche) return kunden;
    const s = suche.toLowerCase();
    return kunden.filter(k => 
      k.kunde.name.toLowerCase().includes(s) ||
      k.kunde.adresse.ort.toLowerCase().includes(s) ||
      k.kunde.adresse.plz.includes(s) ||
      k.ansprechpartner.some(ap => 
        ap.name.toLowerCase().includes(s) ||
        ap.telefonnummern.some(tel => tel.nummer.includes(s))
      )
    );
  };

  // Drag & Drop Handler
  const handleDragStart = (e: DragEvent, kunde: SaisonKundeMitDaten) => {
    setDraggedKunde(kunde);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', kunde.kunde.id);
  };

  const handleDragEnd = () => {
    setDraggedKunde(null);
    setDragOverTab(null);
  };

  const handleDragOver = (e: DragEvent, tab: AnrufStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTab(tab);
  };

  const handleDragLeave = () => {
    setDragOverTab(null);
  };

  const handleDrop = async (e: DragEvent, zielTab: AnrufStatus) => {
    e.preventDefault();
    setDragOverTab(null);
    
    if (!draggedKunde) return;

    // Bei "erreicht" oder "rueckruf" immer Modal öffnen
    if (zielTab === 'erreicht' || zielTab === 'rueckruf') {
      setModalKunde(draggedKunde);
      setModalZielStatus(zielTab);
      setFormData({
        erreicht: zielTab === 'erreicht',
        notizen: draggedKunde.aktuelleSaison?.gespraechsnotizen || '',
        angefragteMenge: draggedKunde.aktuelleSaison?.angefragteMenge,
        preisProTonne: draggedKunde.aktuelleSaison?.preisProTonne, // Leer lassen, Vorjahrespreis separat anzeigen
        bestellabsicht: draggedKunde.aktuelleSaison?.bestellabsicht,
        bezugsweg: draggedKunde.aktuelleSaison?.bezugsweg || draggedKunde.kunde.standardBezugsweg,
        platzbauerId: draggedKunde.aktuelleSaison?.platzbauerId || draggedKunde.kunde.standardPlatzbauerId,
        lieferfensterFrueh: draggedKunde.aktuelleSaison?.lieferfensterFrueh?.split('T')[0],
        lieferfensterSpaet: draggedKunde.aktuelleSaison?.lieferfensterSpaet?.split('T')[0],
        rueckrufDatum: draggedKunde.aktuelleSaison?.rueckrufDatum?.split('T')[0],
        rueckrufNotiz: draggedKunde.aktuelleSaison?.rueckrufNotiz,
        fruehjahresinstandsetzungUeberUns: draggedKunde.aktuelleSaison?.fruehjahresinstandsetzungUeberUns || false,
        anzahlPlaetze: draggedKunde.aktuelleSaison?.anzahlPlaetze,
        fruehjahresinstandsetzungPlatzbauerId: draggedKunde.aktuelleSaison?.fruehjahresinstandsetzungPlatzbauerId,
      });
      setShowModal(true);
    } else {
      // Direkt verschieben für "anrufen" und "nicht_erreicht"
      await updateStatus(draggedKunde, zielTab);
    }
    
    setDraggedKunde(null);
  };

  // Status Update
  const updateStatus = async (kunde: SaisonKundeMitDaten, neuerStatus: AnrufStatus) => {
    setSaving(true);
    try {
      await saisonplanungService.updateAnrufStatus(kunde.kunde.id, saisonjahr, neuerStatus);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Status-Update:', error);
      alert('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Erreicht Button Handler
  const handleErreichtClick = (kunde: SaisonKundeMitDaten) => {
    setModalKunde(kunde);
    setModalZielStatus('erreicht');
    setFormData({
      erreicht: true,
      notizen: kunde.aktuelleSaison?.gespraechsnotizen || '',
      angefragteMenge: kunde.aktuelleSaison?.angefragteMenge,
      preisProTonne: kunde.aktuelleSaison?.preisProTonne, // Leer lassen, Vorjahrespreis separat anzeigen
      bestellabsicht: kunde.aktuelleSaison?.bestellabsicht,
      bezugsweg: kunde.aktuelleSaison?.bezugsweg || kunde.kunde.standardBezugsweg,
      platzbauerId: kunde.aktuelleSaison?.platzbauerId || kunde.kunde.standardPlatzbauerId,
      lieferfensterFrueh: kunde.aktuelleSaison?.lieferfensterFrueh?.split('T')[0],
      lieferfensterSpaet: kunde.aktuelleSaison?.lieferfensterSpaet?.split('T')[0],
      fruehjahresinstandsetzungUeberUns: kunde.aktuelleSaison?.fruehjahresinstandsetzungUeberUns || false,
      anzahlPlaetze: kunde.aktuelleSaison?.anzahlPlaetze,
      fruehjahresinstandsetzungPlatzbauerId: kunde.aktuelleSaison?.fruehjahresinstandsetzungPlatzbauerId,
    });
    setShowModal(true);
  };

  // Nicht Erreicht Button Handler
  const handleNichtErreichtClick = async (kunde: SaisonKundeMitDaten) => {
    await updateStatus(kunde, 'nicht_erreicht');
  };

  // Projekt erstellen Button Handler
  const handleProjektErstellenClick = async (kunde: SaisonKundeMitDaten) => {
    // Prüfe ob bereits ein Projekt für diesen Kunden existiert
    const bestehendesProjekt = await projektService.getProjektFuerKunde(kunde.kunde.id, saisonjahr);
    
    if (bestehendesProjekt) {
      // Projekt existiert bereits, direkt zur Bestellabwicklung navigieren
      const projektId = (bestehendesProjekt as any).$id || bestehendesProjekt.id;
      navigate(`/bestellabwicklung/${projektId}`);
    } else {
      // Dialog öffnen für neues Projekt
      setProjektKunde(kunde);
      setShowProjektDialog(true);
    }
  };

  const handleSaveProjekt = async (neuesProjekt: NeuesProjekt) => {
    setSaving(true);
    try {
      await projektService.createProjekt(neuesProjekt);
      
      // Dialog schließen
      setShowProjektDialog(false);
      setProjektKunde(null);
      
      // Zur Projektverwaltung navigieren
      navigate('/projekt-verwaltung');
    } catch (error) {
      console.error('Fehler beim Erstellen des Projekts:', error);
      alert('Fehler beim Erstellen des Projekts. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Modal speichern
  const handleModalSave = async () => {
    if (!modalKunde) return;
    
    setSaving(true);
    try {
      await saisonplanungService.erfasseAnrufErgebnis(modalKunde.kunde.id, saisonjahr, formData);
      setShowModal(false);
      setModalKunde(null);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  // Berechne Gesamtzahlen
  const gesamtAnrufen = kundenGruppiert.anrufen.length;
  const gesamtNichtErreicht = kundenGruppiert.nichtErreicht.length;
  const gesamtErreicht = kundenGruppiert.erreicht.length;
  const gesamtRueckruf = kundenGruppiert.rueckruf.length;
  const gesamt = gesamtAnrufen + gesamtNichtErreicht + gesamtErreicht + gesamtRueckruf;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-100 dark:bg-gray-700 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-600 dark:text-slate-400">Lade Call-Liste...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-100 dark:bg-gray-700 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
              <PhoneCall className="w-7 h-7 text-red-600" />
              Call-Liste {saisonjahr}
            </h1>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {gesamt} Kunden • {gesamtErreicht} erreicht ({gesamt > 0 ? Math.round((gesamtErreicht / gesamt) * 100) : 0}%)
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Suche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Suche (Name, Ort, Telefon...)"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="pl-10 pr-4 py-2 w-72 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Tabs / Spalten */}
      <div className="flex-1 p-4 grid grid-cols-4 gap-4 overflow-hidden">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const kunden = filterKunden(
            tab.id === 'anrufen' ? kundenGruppiert.anrufen :
            tab.id === 'nicht_erreicht' ? kundenGruppiert.nichtErreicht :
            tab.id === 'erreicht' ? kundenGruppiert.erreicht :
            kundenGruppiert.rueckruf
          );
          const count = 
            tab.id === 'anrufen' ? gesamtAnrufen :
            tab.id === 'nicht_erreicht' ? gesamtNichtErreicht :
            tab.id === 'erreicht' ? gesamtErreicht :
            gesamtRueckruf;
          
          return (
            <div
              key={tab.id}
              className={`flex flex-col bg-white rounded-xl shadow-lg border-2 transition-all ${
                dragOverTab === tab.id ? 'border-red-500 ring-4 ring-red-200' : 'border-gray-200'
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

              {/* Kunden-Liste */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {kunden.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                    <TabIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Keine Kunden</p>
                  </div>
                ) : (
                  kunden.map((kunde) => (
                    <KundenCard
                      key={kunde.kunde.id}
                      kunde={kunde}
                      status={tab.id}
                      onDragStart={(e) => handleDragStart(e, kunde)}
                      onDragEnd={handleDragEnd}
                      onErreicht={() => handleErreichtClick(kunde)}
                      onNichtErreicht={() => handleNichtErreichtClick(kunde)}
                      onProjektErstellen={() => handleProjektErstellenClick(kunde)}
                      saving={saving}
                      hatProjekt={kundenMitProjekt.has(kunde.kunde.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ergebnis-Modal */}
      {showModal && modalKunde && (
        <ErgebnisModal
          kunde={modalKunde}
          formData={formData}
          setFormData={setFormData}
          zielStatus={modalZielStatus}
          platzbauerKunden={allePlatzbauerKunden}
          onSave={handleModalSave}
          onCancel={() => {
            setShowModal(false);
            setModalKunde(null);
          }}
          saving={saving}
        />
      )}

      {/* Projekt-Dialog */}
      {showProjektDialog && projektKunde && (
        <ProjektDialog
          kundenname={projektKunde.kunde.name}
          kundeId={projektKunde.kunde.id}
          kundennummer={projektKunde.kunde.kundennummer}
          kundenstrasse={projektKunde.kunde.adresse.strasse}
          kundenPlzOrt={`${projektKunde.kunde.adresse.plz} ${projektKunde.kunde.adresse.ort}`}
          angefragteMenge={projektKunde.aktuelleSaison?.angefragteMenge}
          preisProTonne={projektKunde.aktuelleSaison?.preisProTonne || projektKunde.kunde.zuletztGezahlterPreis}
          bezugsweg={projektKunde.aktuelleSaison?.bezugsweg || projektKunde.kunde.standardBezugsweg}
          onSave={handleSaveProjekt}
          onCancel={() => {
            setShowProjektDialog(false);
            setProjektKunde(null);
          }}
          saving={saving}
        />
      )}

      {/* Saving Overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-[60] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-lg px-6 py-4 flex items-center gap-3 shadow-xl">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
            <span className="text-gray-700 dark:text-slate-400 font-medium">Speichere...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Kunden-Card Komponente
interface KundenCardProps {
  kunde: SaisonKundeMitDaten;
  status: AnrufStatus;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onErreicht: () => void;
  onNichtErreicht: () => void;
  onProjektErstellen: () => void;
  saving: boolean;
  hatProjekt: boolean;
}

const KundenCard = ({ kunde, status, onDragStart, onDragEnd, onErreicht, onNichtErreicht, onProjektErstellen, saving, hatProjekt }: KundenCardProps) => {
  const [copiedTel, setCopiedTel] = useState<string | null>(null);

  // Telefonnummer kopieren
  const copyTelefon = async (nummer: string) => {
    try {
      await navigator.clipboard.writeText(nummer);
      setCopiedTel(nummer);
      setTimeout(() => setCopiedTel(null), 2000);
    } catch (error) {
      console.error('Kopieren fehlgeschlagen:', error);
    }
  };

  // Erste Telefonnummer finden
  const ersteTelefonnummer = kunde.ansprechpartner
    .flatMap(ap => ap.telefonnummern)
    .find(tel => tel.nummer);

  // Rückruf-Info
  const rueckrufDatum = kunde.aktuelleSaison?.rueckrufDatum 
    ? new Date(kunde.aktuelleSaison.rueckrufDatum).toLocaleDateString('de-DE')
    : null;

  // Letzte Kontaktzeit
  const letztAngerufen = kunde.aktuelleSaison?.letztAngerufen
    ? new Date(kunde.aktuelleSaison.letztAngerufen).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 hover:shadow-md dark:shadow-dark-md transition-all cursor-grab active:cursor-grabbing group"
    >
      {/* Header mit Drag Handle */}
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 dark:text-slate-400 mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-slate-100 truncate">{kunde.kunde.name}</h4>
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{kunde.kunde.adresse.plz} {kunde.kunde.adresse.ort}</span>
          </div>
          {kunde.kunde.typ === 'platzbauer' && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
              Platzbauer
            </span>
          )}
        </div>
      </div>

      {/* Telefonnummern */}
      {kunde.ansprechpartner.length > 0 && (
        <div className="mb-2 space-y-1">
          {kunde.ansprechpartner.slice(0, 2).map((ap) => (
            <div key={ap.id}>
              {ap.telefonnummern.slice(0, 2).map((tel, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <a
                    href={`tel:${tel.nummer.replace(/\s/g, '')}`}
                    className="flex-1 text-blue-600 hover:text-blue-800 hover:underline font-medium truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    📞 {tel.nummer}
                  </a>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyTelefon(tel.nummer);
                    }}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded transition-colors"
                    title="Kopieren"
                  >
                    {copiedTel === tel.nummer ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                  {ap.name && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-20">
                      {ap.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Keine Telefonnummer Warnung */}
      {!ersteTelefonnummer && (
        <div className="flex items-center gap-1 text-xs text-orange-600 mb-2">
          <AlertCircle className="w-3 h-3" />
          <span>Keine Telefonnummer</span>
        </div>
      )}

      {/* Zusatz-Info */}
      {(rueckrufDatum || letztAngerufen || kunde.aktuelleSaison?.angefragteMenge) && (
        <div className="text-xs text-gray-500 dark:text-slate-400 mb-2 space-y-0.5">
          {rueckrufDatum && status === 'rueckruf' && (
            <div className="flex items-center gap-1 text-purple-600">
              <Calendar className="w-3 h-3" />
              Rückruf: {rueckrufDatum}
            </div>
          )}
          {letztAngerufen && status === 'erreicht' && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Erreicht: {letztAngerufen}
            </div>
          )}
          {kunde.aktuelleSaison?.angefragteMenge && (
            <div className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              {kunde.aktuelleSaison.angefragteMenge}t angefragt
            </div>
          )}
        </div>
      )}

      {/* Notiz Preview */}
      {kunde.aktuelleSaison?.gespraechsnotizen && (
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-2 line-clamp-1 italic">
          "{kunde.aktuelleSaison.gespraechsnotizen}"
        </div>
      )}

      {/* Action Buttons */}
      {(status === 'anrufen' || status === 'nicht_erreicht' || status === 'rueckruf') && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNichtErreicht();
            }}
            disabled={saving}
            className="flex-1 px-2 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 rounded-lg transition-colors flex items-center justify-center gap-1"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            Nicht erreicht
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onErreicht();
            }}
            disabled={saving}
            className="flex-1 px-2 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-lg transition-colors flex items-center justify-center gap-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Erreicht ✓
          </button>
        </div>
      )}
      
      {/* Projekt erstellen / Zum Projekt Button - nur bei Status "erreicht" */}
      {status === 'erreicht' && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onProjektErstellen();
            }}
            disabled={saving}
            className={`w-full px-2 py-2 text-xs font-medium text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
              hatProjekt
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
                : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            {hatProjekt ? 'Zum Projekt' : 'Projekt erstellen'}
          </button>
        </div>
      )}
    </div>
  );
};

// Ergebnis-Modal Komponente
interface ErgebnisModalProps {
  kunde: SaisonKundeMitDaten;
  formData: AnrufErgebnis;
  setFormData: (data: AnrufErgebnis) => void;
  zielStatus: AnrufStatus;
  platzbauerKunden: SaisonKundeMitDaten[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

const ErgebnisModal = ({ 
  kunde, 
  formData, 
  setFormData, 
  zielStatus, 
  platzbauerKunden, 
  onSave, 
  onCancel, 
  saving 
}: ErgebnisModalProps) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[55] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
              {zielStatus === 'erreicht' ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  Kunde erreicht
                </>
              ) : (
                <>
                  <Clock className="w-6 h-6 text-purple-500" />
                  Rückruf planen
                </>
              )}
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{kunde.kunde.name}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Kunden-Info */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-slate-100">{kunde.kunde.name}</h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  {kunde.kunde.adresse.plz} {kunde.kunde.adresse.ort}
                </p>
                {kunde.ansprechpartner[0] && (
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    {kunde.ansprechpartner[0].name}
                    {kunde.ansprechpartner[0].telefonnummern[0] && (
                      <> • {kunde.ansprechpartner[0].telefonnummern[0].nummer}</>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Rückruf-Felder (nur wenn Rückruf) */}
          {zielStatus === 'rueckruf' && (
            <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h4 className="font-medium text-purple-800 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Rückruf-Details
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                    Rückruf-Datum *
                  </label>
                  <input
                    type="date"
                    value={formData.rueckrufDatum || ''}
                    onChange={(e) => setFormData({ ...formData, rueckrufDatum: e.target.value })}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                    Rückruf-Notiz
                  </label>
                  <input
                    type="text"
                    value={formData.rueckrufNotiz || ''}
                    onChange={(e) => setFormData({ ...formData, rueckrufNotiz: e.target.value })}
                    placeholder="z.B. Urlaub bis..."
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mengen und Preise */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                <Package className="w-4 h-4 inline mr-1" />
                Angefragte Menge (Tonnen)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.angefragteMenge || ''}
                onChange={(e) => setFormData({ ...formData, angefragteMenge: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="z.B. 5.0"
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            {/* Tonnen letztes Jahr - nicht editierbar */}
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">
                <Package className="w-4 h-4 inline mr-1" />
                Tonnen letztes Jahr (Referenz)
              </label>
              <div className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-700 dark:text-slate-400 font-medium">
                {kunde.kunde.tonnenLetztesJahr 
                  ? `${kunde.kunde.tonnenLetztesJahr.toFixed(1)} t`
                  : '– keine Angabe –'}
              </div>
            </div>
          </div>

          {/* Vorjahrespreis - nicht editierbar */}
          <div className="grid grid-cols-2 gap-4">
            <div></div>
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">
                <Euro className="w-4 h-4 inline mr-1" />
                Preis Vorjahr (Referenz)
              </label>
              <div className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-700 dark:text-slate-400 font-medium">
                {kunde.kunde.zuletztGezahlterPreis 
                  ? `${kunde.kunde.zuletztGezahlterPreis.toFixed(2)} €/t`
                  : '– kein Vorjahrespreis –'}
              </div>
            </div>
          </div>

          {/* Neuer Preis diese Saison */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
              <Euro className="w-4 h-4 inline mr-1" />
              Preis diese Saison (€/Tonne) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.preisProTonne || ''}
              onChange={(e) => setFormData({ ...formData, preisProTonne: e.target.value ? parseFloat(e.target.value) : undefined })}
              placeholder="Neuen Preis eingeben..."
              className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-lg"
            />
            {kunde.kunde.zuletztGezahlterPreis && formData.preisProTonne && (
              <p className={`text-sm mt-1 ${
                formData.preisProTonne > kunde.kunde.zuletztGezahlterPreis 
                  ? 'text-green-600' 
                  : formData.preisProTonne < kunde.kunde.zuletztGezahlterPreis 
                  ? 'text-red-600' 
                  : 'text-gray-500'
              }`}>
                {formData.preisProTonne > kunde.kunde.zuletztGezahlterPreis 
                  ? `↑ +${(formData.preisProTonne - kunde.kunde.zuletztGezahlterPreis).toFixed(2)} €/t mehr als Vorjahr`
                  : formData.preisProTonne < kunde.kunde.zuletztGezahlterPreis 
                  ? `↓ ${(kunde.kunde.zuletztGezahlterPreis - formData.preisProTonne).toFixed(2)} €/t weniger als Vorjahr`
                  : '= Gleicher Preis wie Vorjahr'}
              </p>
            )}
          </div>

          {/* Bestellabsicht */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
              Bestellabsicht
            </label>
            <div className="flex gap-3">
              {[
                { value: 'bestellt', label: 'Bestellt', color: 'green' },
                { value: 'bestellt_nicht', label: 'Bestellt nicht', color: 'red' },
                { value: 'unklar', label: 'Unklar', color: 'yellow' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, bestellabsicht: option.value as Bestellabsicht })}
                  className={`flex-1 px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                    formData.bestellabsicht === option.value
                      ? option.color === 'green'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : option.color === 'red'
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                      : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 text-gray-600 dark:text-slate-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bezugsweg */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                Bezugsweg
              </label>
              <select
                value={formData.bezugsweg || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  bezugsweg: e.target.value as Bezugsweg || undefined,
                  platzbauerId: e.target.value === 'ueber_platzbauer' ? formData.platzbauerId : undefined 
                })}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Bitte wählen</option>
                <option value="direkt">Direkt</option>
                <option value="direkt_instandsetzung">Direkt Instandsetzung</option>
                <option value="ueber_platzbauer">Platzbauer</option>
              </select>
            </div>
            {formData.bezugsweg === 'ueber_platzbauer' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                  Platzbauer
                </label>
                <select
                  value={formData.platzbauerId || ''}
                  onChange={(e) => setFormData({ ...formData, platzbauerId: e.target.value || undefined })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Bitte wählen</option>
                  {platzbauerKunden.map((pb) => (
                    <option key={pb.kunde.id} value={pb.kunde.id}>
                      {pb.kunde.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Frühjahresinstandsetzung */}
          {kunde.kunde.typ === 'verein' && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700/50 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="fis-checkbox"
                  checked={formData.fruehjahresinstandsetzungUeberUns || false}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    fruehjahresinstandsetzungUeberUns: e.target.checked,
                    anzahlPlaetze: e.target.checked ? formData.anzahlPlaetze : undefined,
                    fruehjahresinstandsetzungPlatzbauerId: e.target.checked ? formData.fruehjahresinstandsetzungPlatzbauerId : undefined
                  })}
                  className="w-5 h-5 text-blue-600 border-gray-300 dark:border-slate-700 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="fis-checkbox" className="font-medium text-blue-900 cursor-pointer select-none">
                  Frühjahresinstandsetzung über uns
                </label>
              </div>

              {formData.fruehjahresinstandsetzungUeberUns && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                      Anzahl Plätze *
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.anzahlPlaetze || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        anzahlPlaetze: e.target.value ? parseInt(e.target.value) : undefined 
                      })}
                      placeholder="z.B. 4"
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                      Tennisbauer *
                    </label>
                    <select
                      value={formData.fruehjahresinstandsetzungPlatzbauerId || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        fruehjahresinstandsetzungPlatzbauerId: e.target.value || undefined 
                      })}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Bitte wählen</option>
                      {platzbauerKunden.map((pb) => (
                        <option key={pb.kunde.id} value={pb.kunde.id}>
                          {pb.kunde.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lieferfenster */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Frühestes Lieferdatum
              </label>
              <input
                type="date"
                value={formData.lieferfensterFrueh || ''}
                onChange={(e) => setFormData({ ...formData, lieferfensterFrueh: e.target.value || undefined })}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Spätestes Lieferdatum
              </label>
              <input
                type="date"
                value={formData.lieferfensterSpaet || ''}
                onChange={(e) => setFormData({ ...formData, lieferfensterSpaet: e.target.value || undefined })}
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Notizen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">
              <MessageSquare className="w-4 h-4 inline mr-1" />
              Gesprächsnotizen
            </label>
            <textarea
              value={formData.notizen || ''}
              onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
              rows={4}
              placeholder="Wichtige Infos aus dem Gespräch..."
              className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-6 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 transition-colors font-medium"
          >
            Abbrechen
          </button>
          <button
            onClick={onSave}
            disabled={saving || (zielStatus === 'rueckruf' && !formData.rueckrufDatum)}
            className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Speichere...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Speichern
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallListeV2;
