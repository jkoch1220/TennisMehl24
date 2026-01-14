import { useState, useEffect, useCallback, DragEvent, useRef } from 'react';
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
  TrendingUp,
  Zap,
  ChevronDown,
  ChevronUp,
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
import { client, DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, PROJEKTE_COLLECTION_ID } from '../../config/appwrite';

interface CallListeV2Props {
  saisonjahr: number;
  onClose: () => void;
}

// Tab-Konfiguration mit verbesserten Farben
const TABS: { id: AnrufStatus; label: string; icon: React.ComponentType<any>; color: string; bgColor: string; gradient: string }[] = [
  {
    id: 'anrufen',
    label: 'Anrufen',
    icon: Phone,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700',
    gradient: 'from-blue-500 to-blue-600'
  },
  {
    id: 'nicht_erreicht',
    label: 'Nicht Erreicht',
    icon: PhoneMissed,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700',
    gradient: 'from-amber-500 to-orange-500'
  },
  {
    id: 'erreicht',
    label: 'Erreicht',
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700',
    gradient: 'from-emerald-500 to-green-600'
  },
  {
    id: 'rueckruf',
    label: 'Rückruf',
    icon: Clock,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-700',
    gradient: 'from-violet-500 to-purple-600'
  },
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
  const [showStats, setShowStats] = useState(true);

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

  // Real-time Subscription Ref
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // OPTIMIERT: Lade Daten - nur eine Query statt zwei!
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Parallele Abfragen
      const [gruppiert, projekte] = await Promise.all([
        saisonplanungService.loadCallListeGruppiert(saisonjahr),
        projektService.getAllProjekte(saisonjahr),
      ]);

      // Markiere Kunden mit Projekt
      const kundenIdsSet = new Set(projekte.map(p => p.kundeId));
      setKundenMitProjekt(kundenIdsSet);

      // WICHTIG: Filtere Kunden MIT Projekt aus allen Listen heraus
      const filterOhneProjekt = (kunden: SaisonKundeMitDaten[]) =>
        kunden.filter(k => !kundenIdsSet.has(k.kunde.id));

      setKundenGruppiert({
        anrufen: filterOhneProjekt(gruppiert.anrufen),
        nichtErreicht: filterOhneProjekt(gruppiert.nichtErreicht),
        erreicht: filterOhneProjekt(gruppiert.erreicht),
        rueckruf: filterOhneProjekt(gruppiert.rueckruf),
      });

      // Extrahiere Platzbauer aus der gruppierten Liste (im Speicher, keine DB-Query!)
      const allePlatzbauerAusGruppiert = [
        ...gruppiert.anrufen,
        ...gruppiert.nichtErreicht,
        ...gruppiert.erreicht,
        ...gruppiert.rueckruf,
      ].filter(k => k.kunde.typ === 'platzbauer');

      setAllePlatzbauerKunden(allePlatzbauerAusGruppiert);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, [saisonjahr]);

  // Real-time Subscription Setup
  useEffect(() => {
    // Initial load
    loadData();

    // Subscribe to real-time updates für Kunden und Projekte
    const setupSubscription = () => {
      try {
        const unsubscribe = client.subscribe(
          [
            `databases.${DATABASE_ID}.collections.${SAISON_KUNDEN_COLLECTION_ID}.documents`,
            `databases.${DATABASE_ID}.collections.${PROJEKTE_COLLECTION_ID}.documents`,
          ],
          (response) => {
            // Bei jeder Änderung neu laden
            console.log('📡 Real-time Update empfangen:', response.events);
            loadData();
          }
        );
        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.warn('Real-time Subscription nicht verfügbar:', error);
      }
    };

    setupSubscription();

    // Cleanup
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
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
        preisProTonne: draggedKunde.aktuelleSaison?.preisProTonne,
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
      preisProTonne: kunde.aktuelleSaison?.preisProTonne,
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
      // Projekt existiert bereits, direkt zur Projektabwicklung navigieren
      const projektId = (bestehendesProjekt as any).$id || bestehendesProjekt.id;
      navigate(`/projektabwicklung/${projektId}`);
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

      // Daten neu laden (Kunde wird nun aus der Liste verschwinden)
      await loadData();

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

  // Berechne Gesamtzahlen (nur Kunden OHNE Projekt)
  const gesamtAnrufen = kundenGruppiert.anrufen.length;
  const gesamtNichtErreicht = kundenGruppiert.nichtErreicht.length;
  const gesamtErreicht = kundenGruppiert.erreicht.length;
  const gesamtRueckruf = kundenGruppiert.rueckruf.length;
  const gesamt = gesamtAnrufen + gesamtNichtErreicht + gesamtErreicht + gesamtRueckruf;
  const fortschritt = gesamt > 0 ? Math.round((gesamtErreicht / gesamt) * 100) : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-red-500/30 rounded-full animate-pulse"></div>
            <div className="absolute inset-0 w-20 h-20 border-4 border-transparent border-t-red-500 rounded-full animate-spin"></div>
          </div>
          <p className="mt-6 text-xl text-slate-300 font-medium">Lade Call-Liste...</p>
          <p className="mt-2 text-sm text-slate-500">Synchronisiere Daten</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 z-50 flex flex-col overflow-hidden">
      {/* Header mit Glassmorphism */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all duration-200 group"
            >
              <ArrowLeft className="w-5 h-5 text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200 transition-colors" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg shadow-red-500/25">
                  <PhoneCall className="w-6 h-6 text-white" />
                </div>
                Call-Liste {saisonjahr}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {gesamt} Kunden ohne Projekt
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full transition-all duration-500"
                      style={{ width: `${fortschritt}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {fortschritt}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Suche */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Suche..."
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-64 bg-slate-100 dark:bg-slate-700/50 border-0 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
              />
            </div>

            {/* Stats Toggle */}
            <button
              onClick={() => setShowStats(!showStats)}
              className={`px-3 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm font-medium ${
                showStats
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Stats
              {showStats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>
        </div>

        {/* Statistik-Panel */}
        {showStats && (
          <div className="mt-4 grid grid-cols-4 gap-3 animate-in slide-in-from-top-2 duration-200">
            {TABS.map((tab) => {
              const count =
                tab.id === 'anrufen' ? gesamtAnrufen :
                tab.id === 'nicht_erreicht' ? gesamtNichtErreicht :
                tab.id === 'erreicht' ? gesamtErreicht :
                gesamtRueckruf;
              const TabIcon = tab.icon;

              return (
                <div
                  key={tab.id}
                  className={`p-3 rounded-xl ${tab.bgColor} border transition-all`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TabIcon className={`w-4 h-4 ${tab.color}`} />
                      <span className={`text-sm font-medium ${tab.color}`}>{tab.label}</span>
                    </div>
                    <span className={`text-xl font-bold ${tab.color}`}>{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hauptbereich mit Spalten - SCROLL FIX */}
      <div className="flex-1 p-4 min-h-0 overflow-hidden">
        <div className="h-full grid grid-cols-4 gap-4">
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
                className={`flex flex-col bg-white dark:bg-slate-800/50 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/20 border-2 transition-all duration-300 overflow-hidden ${
                  dragOverTab === tab.id
                    ? 'border-red-400 dark:border-red-500 ring-4 ring-red-500/20 scale-[1.02]'
                    : 'border-slate-200/50 dark:border-slate-700/50'
                }`}
                onDragOver={(e) => handleDragOver(e, tab.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, tab.id)}
              >
                {/* Tab Header mit Gradient */}
                <div className={`px-4 py-3.5 border-b border-slate-100 dark:border-slate-700/50 flex-shrink-0`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-lg bg-gradient-to-br ${tab.gradient} shadow-lg`}>
                        <TabIcon className="w-4 h-4 text-white" />
                      </div>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{tab.label}</span>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${tab.bgColor} ${tab.color}`}>
                      {count}
                    </div>
                  </div>
                </div>

                {/* Kunden-Liste mit Scroll - FIX: flex-1 und overflow-y-auto */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
                  {kunden.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                      <div className={`p-4 rounded-2xl ${tab.bgColor} mb-3`}>
                        <TabIcon className={`w-8 h-8 ${tab.color} opacity-50`} />
                      </div>
                      <p className="text-sm font-medium">Keine Kunden</p>
                      <p className="text-xs mt-1">Ziehe Kunden hierher</p>
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
          ansprechpartner={projektKunde.ansprechpartner?.find(ap => ap.aktiv)?.name}
          angefragteMenge={projektKunde.aktuelleSaison?.angefragteMenge}
          preisProTonne={projektKunde.aktuelleSaison?.preisProTonne || (projektKunde.kunde.zuletztGezahlterPreis ? Math.round(projektKunde.kunde.zuletztGezahlterPreis * 1.04 * 100) / 100 : undefined)}
          bezugsweg={projektKunde.aktuelleSaison?.bezugsweg || projektKunde.kunde.standardBezugsweg}
          onSave={handleSaveProjekt}
          onCancel={() => {
            setShowProjektDialog(false);
            setProjektKunde(null);
          }}
          saving={saving}
        />
      )}

      {/* Saving Overlay mit Animation */}
      {saving && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-2xl px-8 py-6 flex items-center gap-4 shadow-2xl">
            <div className="relative">
              <div className="w-10 h-10 border-4 border-red-500/30 rounded-full"></div>
              <div className="absolute inset-0 w-10 h-10 border-4 border-transparent border-t-red-500 rounded-full animate-spin"></div>
            </div>
            <div>
              <span className="text-slate-700 dark:text-slate-200 font-semibold">Speichere...</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">Bitte warten</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Kunden-Card Komponente mit verbessertem Design
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
      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/30 transition-all duration-200 cursor-grab active:cursor-grabbing group hover:border-slate-300 dark:hover:border-slate-600"
    >
      {/* Header mit Drag Handle */}
      <div className="flex items-start gap-2.5 mb-2.5">
        <GripVertical className="w-4 h-4 text-slate-300 group-hover:text-slate-400 dark:text-slate-600 dark:group-hover:text-slate-500 mt-1 flex-shrink-0 transition-colors" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-800 dark:text-slate-100 truncate leading-tight">{kunde.kunde.name}</h4>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{kunde.kunde.adresse.plz} {kunde.kunde.adresse.ort}</span>
          </div>
          {kunde.kunde.typ === 'platzbauer' && (
            <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium rounded-md">
              <Zap className="w-3 h-3" />
              Platzbauer
            </span>
          )}
        </div>
      </div>

      {/* Telefonnummern */}
      {kunde.ansprechpartner.length > 0 && (
        <div className="mb-2.5 space-y-1.5">
          {kunde.ansprechpartner.slice(0, 2).map((ap) => (
            <div key={ap.id}>
              {ap.telefonnummern.slice(0, 2).map((tel, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm group/tel">
                  <a
                    href={`tel:${tel.nummer.replace(/\s/g, '')}`}
                    className="flex-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium truncate transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Phone className="w-3.5 h-3.5 inline mr-1.5" />
                    {tel.nummer}
                  </a>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyTelefon(tel.nummer);
                    }}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors opacity-0 group-hover/tel:opacity-100"
                    title="Kopieren"
                  >
                    {copiedTel === tel.nummer ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                  {ap.name && (
                    <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-16">
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
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-2.5 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Keine Telefonnummer hinterlegt</span>
        </div>
      )}

      {/* Zusatz-Info */}
      {(rueckrufDatum || letztAngerufen || kunde.aktuelleSaison?.angefragteMenge) && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2.5 space-y-1 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          {rueckrufDatum && status === 'rueckruf' && (
            <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400 font-medium">
              <Calendar className="w-3.5 h-3.5" />
              Rückruf: {rueckrufDatum}
            </div>
          )}
          {letztAngerufen && status === 'erreicht' && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Erreicht: {letztAngerufen}
            </div>
          )}
          {kunde.aktuelleSaison?.angefragteMenge && (
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              {kunde.aktuelleSaison.angefragteMenge}t angefragt
            </div>
          )}
        </div>
      )}

      {/* Notiz Preview */}
      {kunde.aktuelleSaison?.gespraechsnotizen && (
        <div className="text-xs text-slate-400 dark:text-slate-500 mb-2.5 line-clamp-2 italic p-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg border-l-2 border-slate-300 dark:border-slate-600">
          "{kunde.aktuelleSaison.gespraechsnotizen}"
        </div>
      )}

      {/* Action Buttons */}
      {(status === 'anrufen' || status === 'nicht_erreicht' || status === 'rueckruf') && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNichtErreicht();
            }}
            disabled={saving}
            className="flex-1 px-2.5 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 disabled:opacity-50"
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
            className="flex-1 px-2.5 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Erreicht
          </button>
        </div>
      )}

      {/* Projekt erstellen Button - nur bei Status "erreicht" */}
      {status === 'erreicht' && !hatProjekt && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onProjektErstellen();
            }}
            disabled={saving}
            className="w-full px-3 py-2.5 text-xs font-semibold text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:opacity-50"
          >
            <FileCheck className="w-4 h-4" />
            Projekt erstellen
          </button>
        </div>
      )}
    </div>
  );
};

// Ergebnis-Modal Komponente mit verbessertem Design
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${
              zielStatus === 'erreicht'
                ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/25'
                : 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25'
            }`}>
              {zielStatus === 'erreicht' ? (
                <CheckCircle2 className="w-5 h-5 text-white" />
              ) : (
                <Clock className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {zielStatus === 'erreicht' ? 'Kunde erreicht' : 'Rückruf planen'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{kunde.kunde.name}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Kunden-Info */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-slate-200 dark:bg-slate-600 rounded-lg">
                <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">{kunde.kunde.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {kunde.kunde.adresse.plz} {kunde.kunde.adresse.ort}
                </p>
                {kunde.ansprechpartner[0] && (
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
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
            <div className="space-y-4 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-700/50">
              <h4 className="font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Rückruf-Details
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Rückruf-Datum *
                  </label>
                  <input
                    type="date"
                    value={formData.rueckrufDatum || ''}
                    onChange={(e) => setFormData({ ...formData, rueckrufDatum: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Rückruf-Notiz
                  </label>
                  <input
                    type="text"
                    value={formData.rueckrufNotiz || ''}
                    onChange={(e) => setFormData({ ...formData, rueckrufNotiz: e.target.value })}
                    placeholder="z.B. Urlaub bis..."
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mengen und Preise */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Package className="w-4 h-4 inline mr-1.5" />
                Angefragte Menge (t)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.angefragteMenge || ''}
                onChange={(e) => setFormData({ ...formData, angefragteMenge: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="z.B. 5.0"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 dark:text-slate-500 mb-1.5">
                <Package className="w-4 h-4 inline mr-1.5" />
                Tonnen letztes Jahr
              </label>
              <div className="w-full bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium">
                {kunde.kunde.tonnenLetztesJahr
                  ? `${kunde.kunde.tonnenLetztesJahr.toFixed(1)} t`
                  : '– keine Angabe –'}
              </div>
            </div>
          </div>

          {/* Preis */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Euro className="w-4 h-4 inline mr-1.5" />
                Preis diese Saison (€/t)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.preisProTonne || ''}
                onChange={(e) => setFormData({ ...formData, preisProTonne: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="Neuen Preis eingeben..."
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 text-lg font-medium"
              />
              {kunde.kunde.zuletztGezahlterPreis && formData.preisProTonne && (
                <p className={`text-xs mt-1.5 font-medium ${
                  formData.preisProTonne > kunde.kunde.zuletztGezahlterPreis
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : formData.preisProTonne < kunde.kunde.zuletztGezahlterPreis
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-500'
                }`}>
                  {formData.preisProTonne > kunde.kunde.zuletztGezahlterPreis
                    ? `↑ +${(formData.preisProTonne - kunde.kunde.zuletztGezahlterPreis).toFixed(2)} €/t`
                    : formData.preisProTonne < kunde.kunde.zuletztGezahlterPreis
                    ? `↓ ${(kunde.kunde.zuletztGezahlterPreis - formData.preisProTonne).toFixed(2)} €/t`
                    : '= Gleicher Preis'}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 dark:text-slate-500 mb-1.5">
                <Euro className="w-4 h-4 inline mr-1.5" />
                Preis Vorjahr
              </label>
              <div className="w-full bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium">
                {kunde.kunde.zuletztGezahlterPreis
                  ? `${kunde.kunde.zuletztGezahlterPreis.toFixed(2)} €/t`
                  : '– kein Vorjahrespreis –'}
              </div>
            </div>
          </div>

          {/* Bestellabsicht */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Bestellabsicht
            </label>
            <div className="flex gap-3">
              {[
                { value: 'bestellt', label: 'Bestellt', color: 'emerald' },
                { value: 'bestellt_nicht', label: 'Bestellt nicht', color: 'red' },
                { value: 'unklar', label: 'Unklar', color: 'amber' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, bestellabsicht: option.value as Bestellabsicht })}
                  className={`flex-1 px-4 py-2.5 rounded-xl border-2 font-medium transition-all duration-200 ${
                    formData.bestellabsicht === option.value
                      ? option.color === 'emerald'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : option.color === 'red'
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 text-slate-600 dark:text-slate-400'
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Bezugsweg
              </label>
              <select
                value={formData.bezugsweg || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  bezugsweg: e.target.value as Bezugsweg || undefined,
                  platzbauerId: e.target.value === 'ueber_platzbauer' ? formData.platzbauerId : undefined
                })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Bitte wählen</option>
                <option value="direkt">Direkt</option>
                <option value="direkt_instandsetzung">Direkt Instandsetzung</option>
                <option value="ueber_platzbauer">Platzbauer</option>
              </select>
            </div>
            {formData.bezugsweg === 'ueber_platzbauer' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Platzbauer
                </label>
                <select
                  value={formData.platzbauerId || ''}
                  onChange={(e) => setFormData({ ...formData, platzbauerId: e.target.value || undefined })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
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
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-700/50 space-y-4">
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
                  className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="fis-checkbox" className="font-medium text-blue-800 dark:text-blue-300 cursor-pointer select-none">
                  Frühjahresinstandsetzung über uns
                </label>
              </div>

              {formData.fruehjahresinstandsetzungUeberUns && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
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
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Tennisbauer *
                    </label>
                    <select
                      value={formData.fruehjahresinstandsetzungPlatzbauerId || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        fruehjahresinstandsetzungPlatzbauerId: e.target.value || undefined
                      })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                Frühestes Lieferdatum
              </label>
              <input
                type="date"
                value={formData.lieferfensterFrueh || ''}
                onChange={(e) => setFormData({ ...formData, lieferfensterFrueh: e.target.value || undefined })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                Spätestes Lieferdatum
              </label>
              <input
                type="date"
                value={formData.lieferfensterSpaet || ''}
                onChange={(e) => setFormData({ ...formData, lieferfensterSpaet: e.target.value || undefined })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Notizen */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              <MessageSquare className="w-4 h-4 inline mr-1.5" />
              Gesprächsnotizen
            </label>
            <textarea
              value={formData.notizen || ''}
              onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
              rows={3}
              placeholder="Wichtige Infos aus dem Gespräch..."
              className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-medium"
          >
            Abbrechen
          </button>
          <button
            onClick={onSave}
            disabled={saving || (zielStatus === 'rueckruf' && !formData.rueckrufDatum)}
            className={`px-6 py-2.5 text-white rounded-xl transition-all duration-200 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${
              zielStatus === 'erreicht'
                ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-emerald-500/25'
                : 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-violet-500/25'
            }`}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Speichere...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
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
