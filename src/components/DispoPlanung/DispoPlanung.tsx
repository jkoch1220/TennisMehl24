import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Truck,
  Calendar,
  MapPin,
  Package,
  FileText,
  Upload,
  Search,
  RefreshCw,
  ChevronDown,
  Clock,
  Building2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  MessageSquare,
  Paperclip,
  Plus,
  X,
  Download,
  Trash2,
  Navigation,
  Phone,
  User,
  Edit3,
  Check,
  Route,
  Sparkles,
  Image,
  ZoomIn,
  PackageCheck,
  AlertTriangle,
  Boxes,
  ExternalLink,
} from 'lucide-react';
import TourenPlanungTab from './TourenPlanungTab';
import DispoKartenAnsicht from './DispoKartenAnsicht';
import TourenManagement from './TourenManagement';
import {
  SchnellBuchungDialog,
  BuchungsBadge,
  erstelleAuftragMitBuchungen,
  AuftragMitBuchungen,
} from './TourenBuchung';
import { AngebotsDaten } from '../../types/projektabwicklung';
import {
  parseMaterialAufschluesselung,
  getBelieungsartLabel,
  getBelieungsartFarbe,
} from '../../utils/dispoMaterialParser';
import { Projekt, ProjektAnhang, DispoNotiz, DispoStatus } from '../../types/projekt';
import { SaisonKunde } from '../../types/saisonplanung';
import { Fahrzeug } from '../../types/dispo';
import { Tour, TourStop } from '../../types/tour';
import { projektService } from '../../services/projektService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { fahrzeugService } from '../../services/fahrzeugService';
import { tourenService } from '../../services/tourenService';
import { projektAnhangService } from '../../services/projektAnhangService';
import { kundenAktivitaetService } from '../../services/kundenAktivitaetService';
import { KundenAktivitaet } from '../../types/kundenAktivitaet';
import { useNavigate } from 'react-router-dom';
import { ID } from 'appwrite';

// Dispo-relevante Status
const DISPO_RELEVANT_STATUS = ['auftragsbestaetigung', 'lieferschein', 'rechnung'];

// Dispo-Status Labels und Farben
const DISPO_STATUS_CONFIG: Record<DispoStatus, { label: string; color: string; bgColor: string }> = {
  offen: { label: 'Offen', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/50' },
  geplant: { label: 'Geplant', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/50' },
  beladen: { label: 'Beladen', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/50' },
  unterwegs: { label: 'Unterwegs', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/50' },
  geliefert: { label: 'Geliefert', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/50' },
};

type FilterStatus = 'alle' | DispoStatus;

// Lieferart-Filter für Spedition vs. Eigentransport
type FilterLieferart = 'alle' | 'eigenlager' | 'spedition' | 'gemischt' | 'beiladung';

// Tab-Typen
type DispoTab = 'auftraege' | 'touren' | 'karte';

const DispoPlanung = () => {
  const navigate = useNavigate();

  // Tab-State
  const [activeTab, setActiveTab] = useState<DispoTab>('auftraege');

  // State
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [kundenMap, setKundenMap] = useState<Map<string, SaisonKunde>>(new Map());
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [touren, setTouren] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filter & Ansicht
  const [suche, setSuche] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('alle');
  const [filterDatum, setFilterDatum] = useState<string>('');
  const [filterLieferart, setFilterLieferart] = useState<FilterLieferart>('alle');

  // Ausgewähltes Projekt für Detail-Ansicht
  const [selectedProjekt, setSelectedProjekt] = useState<Projekt | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Buchungs-Dialog State
  const [buchungAuftrag, setBuchungAuftrag] = useState<AuftragMitBuchungen | null>(null);
  const [buchungModus, setBuchungModus] = useState<'neu' | 'umbuchen' | 'teil'>('neu');
  const [buchungVonTourId, setBuchungVonTourId] = useState<string | undefined>(undefined);
  const [showBuchungDialog, setShowBuchungDialog] = useState(false);

  // Daten laden
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Lade alle Projekte (alle Jahre)
      const alleProjekte = await projektService.loadProjekte();

      // Filtere nur Dispo-relevante Projekte
      const dispoProjekte = alleProjekte.filter(p =>
        DISPO_RELEVANT_STATUS.includes(p.status) ||
        (p.status === 'bezahlt' && p.dispoStatus !== 'geliefert')
      );

      // Setze Standard-DispoStatus wenn nicht gesetzt
      const projekteInitialisiert = dispoProjekte.map(p => ({
        ...p,
        dispoStatus: p.dispoStatus || 'offen' as DispoStatus,
      }));

      setProjekte(projekteInitialisiert);

      // Lade Kundendaten für alle Projekte
      const kundeIds = [...new Set(projekteInitialisiert.map(p => p.kundeId).filter(Boolean))];
      const kundenPromises = kundeIds.map(id =>
        saisonplanungService.loadKunde(id).catch(() => null)
      );
      const kunden = await Promise.all(kundenPromises);

      const neueKundenMap = new Map<string, SaisonKunde>();
      kunden.forEach(kunde => {
        if (kunde) neueKundenMap.set(kunde.id, kunde);
      });
      setKundenMap(neueKundenMap);

      // Lade Fahrzeuge
      const geladeneFahrzeuge = await fahrzeugService.loadAlleFahrzeuge();
      setFahrzeuge(geladeneFahrzeuge);

      // Lade Touren
      const geladeneTouren = await tourenService.loadAlleTouren();
      setTouren(geladeneTouren);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Touren separat laden (für Refresh)
  const loadTouren = useCallback(async () => {
    try {
      const geladeneTouren = await tourenService.loadAlleTouren();
      setTouren(geladeneTouren);
    } catch (error) {
      console.error('Fehler beim Laden der Touren:', error);
    }
  }, []);

  // === BUCHUNGS-LOGIK ===

  // Buchung durchführen (neu, umbuchen, teil)
  const handleBuchen = async (tourId: string, tonnen: number, vonTourId?: string) => {
    if (!buchungAuftrag) return;

    setSaving(true);
    try {
      const zielTour = touren.find(t => t.id === tourId);
      if (!zielTour) throw new Error('Ziel-Tour nicht gefunden');

      const projektId = buchungAuftrag.projektId;
      const projekt = buchungAuftrag.projekt;

      // Bei Umbuchen: Erst von alter Tour entfernen
      if (vonTourId) {
        const vonTour = touren.find(t => t.id === vonTourId);
        if (vonTour) {
          const neueStopsVon = vonTour.stops.filter(s => s.projektId !== projektId);
          neueStopsVon.forEach((s, i) => { s.position = i + 1; });
          await tourenService.updateTour(vonTourId, { stops: neueStopsVon });
        }
      }

      // Prüfen ob bereits ein Stop für dieses Projekt existiert
      const existierenderStop = zielTour.stops.find(s => s.projektId === projektId);

      let neueStops: TourStop[];
      if (existierenderStop) {
        // Tonnen addieren (Teilbuchung)
        neueStops = zielTour.stops.map(s =>
          s.projektId === projektId
            ? { ...s, tonnen: s.tonnen + tonnen }
            : s
        );
      } else {
        // Neuen Stop erstellen
        const neuerStop: TourStop = {
          projektId,
          position: zielTour.stops.length + 1,
          ankunftGeplant: '',
          abfahrtGeplant: '',
          kundenname: projekt.kundenname,
          kundennummer: projekt.kundennummer,
          adresse: {
            strasse: projekt.lieferadresse?.strasse || projekt.kundenstrasse || '',
            plz: projekt.lieferadresse?.plz || projekt.kundenPlzOrt?.split(' ')[0] || '',
            ort: projekt.lieferadresse?.ort || projekt.kundenPlzOrt?.split(' ').slice(1).join(' ') || '',
          },
          tonnen,
          belieferungsart: projekt.belieferungsart || 'mit_haenger',
        };
        neueStops = [...zielTour.stops, neuerStop];
      }

      await tourenService.updateTour(tourId, { stops: neueStops });

      // Projekt-Status aktualisieren wenn was gebucht ist
      const alleBuchungen = touren.flatMap(t =>
        t.stops.filter(s => s.projektId === projektId)
      );
      const hatBuchungen = alleBuchungen.length > 0 || tonnen > 0;

      await projektService.updateProjekt(projektId, {
        dispoStatus: hatBuchungen ? 'geplant' : 'offen',
      });

      await loadData();
    } catch (error) {
      console.error('Fehler beim Buchen:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Buchung von Tour entfernen
  const handleBuchungEntfernen = async (projektId: string, tourId: string) => {
    setSaving(true);
    try {
      const tour = touren.find(t => t.id === tourId);
      if (!tour) throw new Error('Tour nicht gefunden');

      // Stop entfernen
      const neueStops = tour.stops.filter(s => s.projektId !== projektId);
      neueStops.forEach((s, i) => { s.position = i + 1; });
      await tourenService.updateTour(tourId, { stops: neueStops });

      // Prüfen ob noch andere Buchungen existieren
      const andereBuchungen = touren
        .filter(t => t.id !== tourId)
        .some(t => t.stops.some(s => s.projektId === projektId));

      if (!andereBuchungen) {
        await projektService.updateProjekt(projektId, {
          dispoStatus: 'offen',
        });
      }

      await loadData();
    } catch (error) {
      console.error('Fehler beim Entfernen:', error);
      alert('Fehler beim Entfernen der Buchung');
    } finally {
      setSaving(false);
    }
  };

  // Dialog-Öffner
  const openBuchungDialog = (projekt: Projekt, modus: 'neu' | 'umbuchen' | 'teil', vonTourId?: string) => {
    const auftrag = erstelleAuftragMitBuchungen(projekt, touren);
    setBuchungAuftrag(auftrag);
    setBuchungModus(modus);
    setBuchungVonTourId(vonTourId);
    setShowBuchungDialog(true);
  };

  // BUCHUNG: Neu buchen, umbuchen, oder Menge ändern
  // OPTIMISTISCH: Kein loadData() - nur gezielte State-Updates für smooth UX
  const handleSchnellUmbuchen = async (
    projektId: string,
    vonTourId: string,
    zuTourId: string,
    tonnen: number
  ) => {
    setSaving(true);
    try {
      // Projekt-Daten holen
      const projekt = projekte.find(p => ((p as any).$id || p.id) === projektId);
      if (!projekt) throw new Error('Projekt nicht gefunden');

      // ROBUST: Tour aus State ODER frisch vom Service holen
      const getTourById = async (tourId: string): Promise<Tour | null> => {
        const fromState = touren.find(t => t.id === tourId);
        if (fromState) return fromState;
        try {
          const freshTour = await tourenService.loadTour(tourId);
          // Tour in State einfügen für spätere Verwendung
          setTouren(prev => [...prev, freshTour]);
          return freshTour;
        } catch {
          return null;
        }
      };

      // Neuen Stop erstellen (wird in mehreren Fällen gebraucht)
      const erstelleNeuenStop = (): TourStop => ({
        projektId,
        position: 0, // Wird später gesetzt
        ankunftGeplant: '',
        abfahrtGeplant: '',
        kundenname: projekt.kundenname,
        kundennummer: projekt.kundennummer,
        adresse: {
          strasse: projekt.lieferadresse?.strasse || projekt.kundenstrasse || '',
          plz: projekt.lieferadresse?.plz || projekt.kundenPlzOrt?.split(' ')[0] || '',
          ort: projekt.lieferadresse?.ort || projekt.kundenPlzOrt?.split(' ').slice(1).join(' ') || '',
        },
        tonnen,
        belieferungsart: projekt.belieferungsart || 'mit_haenger',
      });

      let updatedTouren = [...touren];

      // FALL 1: Gleiche Tour (Menge ändern)
      if (vonTourId && vonTourId === zuTourId) {
        const tour = await getTourById(zuTourId);
        if (!tour) throw new Error('Tour nicht gefunden');

        const neueStops = tour.stops.map(s =>
          s.projektId === projektId ? { ...s, tonnen } : s
        );
        await tourenService.updateTour(zuTourId, { stops: neueStops });

        // Lokales State-Update
        updatedTouren = updatedTouren.map(t =>
          t.id === zuTourId ? { ...t, stops: neueStops } : t
        );
      }
      // FALL 2: Von einer Tour zu einer anderen (Umbuchen)
      else if (vonTourId) {
        const [vonTour, zuTour] = await Promise.all([
          getTourById(vonTourId),
          getTourById(zuTourId),
        ]);
        if (!vonTour || !zuTour) throw new Error('Tour nicht gefunden');

        // Von alter Tour entfernen
        const neueStopsVon = vonTour.stops.filter(s => s.projektId !== projektId);
        neueStopsVon.forEach((s, i) => { s.position = i + 1; });
        await tourenService.updateTour(vonTourId, { stops: neueStopsVon });

        // Bei Ziel-Tour hinzufügen
        const existierenderStop = zuTour.stops.find(s => s.projektId === projektId);
        let neueStopsZu: TourStop[];
        if (existierenderStop) {
          neueStopsZu = zuTour.stops.map(s =>
            s.projektId === projektId ? { ...s, tonnen: s.tonnen + tonnen } : s
          );
        } else {
          const neuerStop = erstelleNeuenStop();
          neuerStop.position = zuTour.stops.length + 1;
          neueStopsZu = [...zuTour.stops, neuerStop];
        }
        await tourenService.updateTour(zuTourId, { stops: neueStopsZu });

        // Lokales State-Update für beide Touren
        updatedTouren = updatedTouren.map(t => {
          if (t.id === vonTourId) return { ...t, stops: neueStopsVon };
          if (t.id === zuTourId) return { ...t, stops: neueStopsZu };
          return t;
        });
      }
      // FALL 3: Neue Buchung (kein vonTourId)
      else {
        const zuTour = await getTourById(zuTourId);
        if (!zuTour) throw new Error('Ziel-Tour nicht gefunden');

        const existierenderStop = zuTour.stops.find(s => s.projektId === projektId);
        let neueStops: TourStop[];
        if (existierenderStop) {
          neueStops = zuTour.stops.map(s =>
            s.projektId === projektId ? { ...s, tonnen: s.tonnen + tonnen } : s
          );
        } else {
          const neuerStop = erstelleNeuenStop();
          neuerStop.position = zuTour.stops.length + 1;
          neueStops = [...zuTour.stops, neuerStop];
        }
        await tourenService.updateTour(zuTourId, { stops: neueStops });

        // Lokales State-Update
        updatedTouren = updatedTouren.map(t =>
          t.id === zuTourId ? { ...t, stops: neueStops } : t
        );
      }

      // Status auf geplant setzen (Backend)
      await projektService.updateProjekt(projektId, {
        dispoStatus: 'geplant',
      });

      // SMOOTH: Nur gezielte State-Updates, KEIN loadData()!
      setTouren(updatedTouren);
      setProjekte(prev => prev.map(p =>
        ((p as any).$id || p.id) === projektId
          ? { ...p, dispoStatus: 'geplant' as DispoStatus }
          : p
      ));

    } catch (error) {
      console.error('Fehler beim Buchen:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter-Funktion
  const gefilterteProjekte = projekte.filter(p => {
    // Status-Filter
    if (filterStatus !== 'alle' && p.dispoStatus !== filterStatus) return false;

    // Datum-Filter
    if (filterDatum && p.geplantesDatum !== filterDatum) return false;

    // Lieferart-Filter (Spedition vs. Eigentransport)
    if (filterLieferart !== 'alle') {
      const material = parseMaterialAufschluesselung(p);
      if (filterLieferart === 'eigenlager' && material.transportTyp !== 'eigenlager') return false;
      if (filterLieferart === 'spedition' && material.transportTyp !== 'spedition') return false;
      if (filterLieferart === 'gemischt' && material.transportTyp !== 'gemischt') return false;
      if (filterLieferart === 'beiladung' && !material.hatBeiladung) return false;
    }

    // Suche
    if (suche) {
      const s = suche.toLowerCase();
      const kunde = p.kundeId ? kundenMap.get(p.kundeId) : null;
      const suchtext = [
        p.kundenname,
        p.projektName,
        p.kundenPlzOrt,
        p.kundennummer,
        kunde?.adresse?.strasse,
        kunde?.adresse?.plz,
        kunde?.adresse?.ort,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!suchtext.includes(s)) return false;
    }

    return true;
  });

  // Dispo-Status aktualisieren
  const updateDispoStatus = async (projekt: Projekt, neuerStatus: DispoStatus) => {
    setSaving(true);
    try {
      const projektId = (projekt as any).$id || projekt.id;
      await projektService.updateProjekt(projektId, { dispoStatus: neuerStatus });
      await loadData();
    } catch (error) {
      console.error('Fehler beim Status-Update:', error);
      alert('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  // Projekt-Detail öffnen
  const openProjektDetail = (projekt: Projekt) => {
    setSelectedProjekt(projekt);
    setShowDetailModal(true);
  };

  // Zur Projektabwicklung navigieren
  const goToProjektabwicklung = (projekt: Projekt) => {
    const projektId = (projekt as any).$id || projekt.id;
    navigate(`/projektabwicklung/${projektId}`);
  };

  // Inline-Update Handler für schnelle Bearbeitung in der Zeile
  const handleInlineUpdate = async (
    projektId: string,
    updates: Partial<Projekt>,
    kundeUpdates?: Partial<SaisonKunde>
  ) => {
    setSaving(true);
    try {
      // Projekt aktualisieren
      await projektService.updateProjekt(projektId, updates);

      // Optional: Kunden-Daten aktualisieren (z.B. ASP-Telefon für nächstes Jahr)
      const projekt = projekte.find(p => ((p as any).$id || p.id) === projektId);
      if (kundeUpdates && projekt?.kundeId) {
        await saisonplanungService.updateKunde(projekt.kundeId, kundeUpdates);
        // Lokale kundenMap aktualisieren
        const aktuellerKunde = kundenMap.get(projekt.kundeId);
        if (aktuellerKunde) {
          const neueKundenMap = new Map(kundenMap);
          neueKundenMap.set(projekt.kundeId, { ...aktuellerKunde, ...kundeUpdates });
          setKundenMap(neueKundenMap);
        }
      }

      // Lokalen State aktualisieren
      setProjekte(prev => prev.map(p =>
        ((p as any).$id || p.id) === projektId ? { ...p, ...updates } : p
      ));
    } catch (error) {
      console.error('Fehler beim Inline-Update:', error);
      alert('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  // Statistiken berechnen (inkl. Lieferart-Stats)
  const projekteMitMaterial = projekte.map(p => ({
    projekt: p,
    material: parseMaterialAufschluesselung(p),
  }));

  const stats = {
    gesamt: projekte.length,
    offen: projekte.filter(p => p.dispoStatus === 'offen').length,
    geplant: projekte.filter(p => p.dispoStatus === 'geplant').length,
    unterwegs: projekte.filter(p => p.dispoStatus === 'beladen' || p.dispoStatus === 'unterwegs').length,
    geliefert: projekte.filter(p => p.dispoStatus === 'geliefert').length,
    heute: projekte.filter(p => p.geplantesDatum === new Date().toISOString().split('T')[0]).length,
    // Lieferart-Stats
    eigenlager: projekteMitMaterial.filter(pm => pm.material.transportTyp === 'eigenlager').length,
    spedition: projekteMitMaterial.filter(pm => pm.material.transportTyp === 'spedition').length,
    gemischt: projekteMitMaterial.filter(pm => pm.material.transportTyp === 'gemischt').length,
    beiladung: projekteMitMaterial.filter(pm => pm.material.hatBeiladung).length,
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-red-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Lade Dispo-Daten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl shadow-lg">
              <Truck className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dispo-Planung</h1>
              <p className="text-gray-600 dark:text-gray-400">
                {stats.gesamt} Aufträge | {stats.offen} offen | {stats.heute} heute geplant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab-Navigation */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setActiveTab('auftraege')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'auftraege'
                ? 'bg-red-600 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            <Package className="w-4 h-4" />
            Aufträge
          </button>
          <button
            onClick={() => setActiveTab('touren')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'touren'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            <Route className="w-4 h-4" />
            <Sparkles className="w-3 h-3" />
            KI-Tourenplanung
          </button>
          <button
            onClick={() => setActiveTab('karte')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'karte'
                ? 'bg-gradient-to-r from-green-600 to-teal-600 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Karte
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'karte' ? (
        <DispoKartenAnsicht
          projekte={projekte}
          kundenMap={kundenMap}
          onProjektClick={(projekt) => {
            const projektId = (projekt as any).$id || projekt.id;
            navigate(`/projektabwicklung/${projektId}`);
          }}
          onBuchen={async (projektId, tourId, tonnen) => {
            // Verwendet handleSchnellUmbuchen mit leerem vonTourId für neue Buchung
            await handleSchnellUmbuchen(projektId, '', tourId, tonnen);
          }}
          onNeueTour={async (name, lkwTyp, kapazitaet) => {
            // Neue Tour erstellen und ID zurückgeben
            const neueTour = await tourenService.createTour({
              name,
              datum: '',
              fahrzeugId: '',
              lkwTyp,
              kapazitaet: {
                motorwagenTonnen: lkwTyp === 'mit_haenger' ? 14 : kapazitaet,
                haengerTonnen: lkwTyp === 'mit_haenger' ? 10 : undefined,
                gesamtTonnen: kapazitaet,
              },
              stops: [],
              routeDetails: tourenService.getLeereRouteDetails(),
              optimierung: tourenService.getLeereOptimierung(),
              status: 'entwurf',
            });
            // SMOOTH: Optimistisches Update - Tour direkt zu State hinzufügen
            setTouren(prev => [...prev, neueTour]);
            return neueTour.id;
          }}
        />
      ) : activeTab === 'touren' ? (
        <TourenPlanungTab
          onNavigateToProjekt={(projektId) => navigate(`/projektabwicklung/${projektId}`)}
        />
      ) : (
        <>
          {/* Statistik-Karten */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard
          label="Offen"
          value={stats.offen}
          icon={<Package className="w-5 h-5" />}
          color="blue"
          onClick={() => setFilterStatus('offen')}
          active={filterStatus === 'offen'}
        />
        <StatCard
          label="Geplant"
          value={stats.geplant}
          icon={<Calendar className="w-5 h-5" />}
          color="purple"
          onClick={() => setFilterStatus('geplant')}
          active={filterStatus === 'geplant'}
        />
        <StatCard
          label="Unterwegs"
          value={stats.unterwegs}
          icon={<Navigation className="w-5 h-5" />}
          color="yellow"
          onClick={() => setFilterStatus('unterwegs')}
          active={filterStatus === 'unterwegs'}
        />
        <StatCard
          label="Geliefert"
          value={stats.geliefert}
          icon={<CheckCircle2 className="w-5 h-5" />}
          color="green"
          onClick={() => setFilterStatus('geliefert')}
          active={filterStatus === 'geliefert'}
        />
        <StatCard
          label="Alle"
          value={stats.gesamt}
          icon={<Truck className="w-5 h-5" />}
          color="gray"
          onClick={() => setFilterStatus('alle')}
          active={filterStatus === 'alle'}
        />
      </div>

      {/* Filter & Suche */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Suche */}
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Kunde, PLZ, Ort, Nummer..."
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>

          {/* Datum-Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={filterDatum}
              onChange={(e) => setFilterDatum(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
            {filterDatum && (
              <button
                onClick={() => setFilterDatum('')}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter-Reset */}
          {(filterStatus !== 'alle' || filterDatum || suche || filterLieferart !== 'alle') && (
            <button
              onClick={() => {
                setFilterStatus('alle');
                setFilterDatum('');
                setSuche('');
                setFilterLieferart('alle');
              }}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        {/* Lieferart-Filter (Spedition vs. Eigentransport) */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-slate-700">
          <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Lieferart:</span>
          <button
            onClick={() => setFilterLieferart('alle')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              filterLieferart === 'alle'
                ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 font-medium'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
            }`}
          >
            Alle
          </button>
          <button
            onClick={() => setFilterLieferart('eigenlager')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              filterLieferart === 'eigenlager'
                ? 'bg-blue-600 text-white font-medium'
                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
            }`}
          >
            <Truck className="w-4 h-4" />
            Eigentransport ({stats.eigenlager})
          </button>
          <button
            onClick={() => setFilterLieferart('spedition')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              filterLieferart === 'spedition'
                ? 'bg-orange-600 text-white font-medium'
                : 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50'
            }`}
          >
            <Boxes className="w-4 h-4" />
            Spedition ({stats.spedition})
          </button>
          <button
            onClick={() => setFilterLieferart('gemischt')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              filterLieferart === 'gemischt'
                ? 'bg-amber-600 text-white font-medium'
                : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Gemischt ({stats.gemischt})
          </button>
          <button
            onClick={() => setFilterLieferart('beiladung')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              filterLieferart === 'beiladung'
                ? 'bg-yellow-500 text-white font-medium'
                : 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/50'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            Mit Beiladung ({stats.beiladung})
          </button>
        </div>
      </div>

      {/* 2-Spalten Layout: Touren links, Aufträge rechts */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Touren-Sidebar (links) */}
        <div className="lg:col-span-1">
          <TourenManagement
            projekte={projekte}
            onProjektUpdate={loadData}
            onTourenChange={loadTouren}
          />
        </div>

        {/* Auftrags-Liste (rechts, breiter) */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-red-600" />
                  Aufträge ({gefilterteProjekte.length})
                </h2>
              </div>
            </div>

            {/* Liste */}
            <div className="divide-y divide-gray-100 dark:divide-slate-700 max-h-[calc(100vh-400px)] overflow-y-auto">
              {gefilterteProjekte.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Keine Aufträge gefunden</p>
                </div>
              ) : (
                gefilterteProjekte.map((projekt) => {
                  const projektId = (projekt as any).$id || projekt.id;
                  const auftragMitBuchungen = erstelleAuftragMitBuchungen(projekt, touren);
                  return (
                    <AuftragsZeile
                      key={projektId}
                      projekt={projekt}
                      kunde={projekt.kundeId ? kundenMap.get(projekt.kundeId) : undefined}
                      auftragMitBuchungen={auftragMitBuchungen}
                      touren={touren}
                      onStatusChange={(status) => updateDispoStatus(projekt, status)}
                      onOpenDetail={() => openProjektDetail(projekt)}
                      onGoToProjektabwicklung={() => goToProjektabwicklung(projekt)}
                      onInlineUpdate={handleInlineUpdate}
                      onBuchen={() => openBuchungDialog(projekt, 'neu')}
                      onSchnellUmbuchen={(vonTourId, zuTourId, tonnen) => handleSchnellUmbuchen(projektId, vonTourId, zuTourId, tonnen)}
                      onTeilbuchen={() => openBuchungDialog(projekt, 'teil')}
                      onBuchungEntfernen={(tourId) => handleBuchungEntfernen(projektId, tourId)}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Saving Overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-lg px-6 py-4 flex items-center gap-3 shadow-xl">
            <Loader2 className="w-6 h-6 animate-spin text-red-600" />
            <span className="text-gray-700 dark:text-gray-300">Speichere...</span>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedProjekt && (
        <AuftragDetailModal
          projekt={selectedProjekt}
          kunde={selectedProjekt.kundeId ? kundenMap.get(selectedProjekt.kundeId) : undefined}
          fahrzeuge={fahrzeuge}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedProjekt(null);
          }}
          onSave={async (updates) => {
            setSaving(true);
            try {
              const projektId = (selectedProjekt as any).$id || selectedProjekt.id;
              await projektService.updateProjekt(projektId, updates);
              await loadData();
              setShowDetailModal(false);
              setSelectedProjekt(null);
            } catch (error) {
              console.error('Fehler beim Speichern:', error);
              alert('Fehler beim Speichern');
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      {/* Schnell-Buchung Dialog */}
      <SchnellBuchungDialog
        open={showBuchungDialog}
        auftrag={buchungAuftrag}
        touren={touren}
        modus={buchungModus}
        vonTourId={buchungVonTourId}
        onClose={() => {
          setShowBuchungDialog(false);
          setBuchungAuftrag(null);
          setBuchungVonTourId(undefined);
        }}
        onBuchen={handleBuchen}
      />
    </div>
  );
};

// Statistik-Karte
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'purple' | 'yellow' | 'green' | 'gray';
  onClick: () => void;
  active: boolean;
}

const StatCard = ({ label, value, icon, color, onClick, active }: StatCardProps) => {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400',
    purple: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400',
    green: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400',
    gray: 'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
  };

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border-2 transition-all ${colors[color]} ${
        active ? 'ring-2 ring-offset-2 ring-red-500' : ''
      } hover:scale-105`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="text-left">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm opacity-80">{label}</p>
        </div>
      </div>
    </button>
  );
};

// Auftrags-Zeile
interface AuftragsZeileProps {
  projekt: Projekt;
  kunde?: SaisonKunde;
  auftragMitBuchungen: AuftragMitBuchungen;
  touren: Tour[];
  onStatusChange: (status: DispoStatus) => void;
  onOpenDetail: () => void;
  onGoToProjektabwicklung: () => void;
  onInlineUpdate: (projektId: string, updates: Partial<Projekt>, kundeUpdates?: Partial<SaisonKunde>) => void;
  onBuchen: () => void;
  onSchnellUmbuchen: (vonTourId: string, zuTourId: string, tonnen: number) => Promise<void>;
  onTeilbuchen: () => void;
  onBuchungEntfernen: (tourId: string) => void;
}

const AuftragsZeile = ({
  projekt,
  kunde,
  auftragMitBuchungen,
  touren,
  onStatusChange,
  onOpenDetail,
  onGoToProjektabwicklung,
  onInlineUpdate,
  onBuchen,
  onSchnellUmbuchen,
  onTeilbuchen,
  onBuchungEntfernen,
}: AuftragsZeileProps) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const status = projekt.dispoStatus || 'offen';
  const statusConfig = DISPO_STATUS_CONFIG[status];
  const projektId = (projekt as any).$id || projekt.id;

  // Inline-Editing States
  const [editingBemerkung, setEditingBemerkung] = useState(false);
  const [editingTelefon, setEditingTelefon] = useState(false);
  const [editingGeplant, setEditingGeplant] = useState(false);
  const [editingKommuniziert, setEditingKommuniziert] = useState(false);

  // Temporäre Werte für Inline-Editing
  const [tempBemerkung, setTempBemerkung] = useState('');
  const [tempTelefon, setTempTelefon] = useState('');
  const [tempGeplant, setTempGeplant] = useState('');
  const [tempKommuniziert, setTempKommuniziert] = useState('');

  // Refs für Auto-Focus
  const bemerkungRef = useRef<HTMLInputElement>(null);
  const telefonRef = useRef<HTMLInputElement>(null);

  // Bemerkung aus AngebotsDaten parsen
  const parsedAngebotsDaten: AngebotsDaten | null = (() => {
    if (!projekt.angebotsDaten) return null;
    try {
      return JSON.parse(projekt.angebotsDaten);
    } catch {
      return null;
    }
  })();
  const bemerkung = parsedAngebotsDaten?.bemerkung || '';

  // Material-Aufschlüsselung aus Positionen berechnen
  const material = parseMaterialAufschluesselung(projekt);
  const belieferungsartLabel = getBelieungsartLabel(projekt.belieferungsart);
  const belieferungsartFarbe = getBelieungsartFarbe(projekt.belieferungsart);

  // ASP-Telefon (Projekt überschreibt Kunde)
  const aspName = projekt.dispoAnsprechpartner?.name || kunde?.dispoAnsprechpartner?.name || '';
  const aspTelefon = projekt.dispoAnsprechpartner?.telefon || kunde?.dispoAnsprechpartner?.telefon || '';

  // Bemerkung speichern
  const saveBemerkung = () => {
    if (tempBemerkung === bemerkung) {
      setEditingBemerkung(false);
      return;
    }
    const updatedAngebotsDaten = { ...(parsedAngebotsDaten || {}), bemerkung: tempBemerkung };
    onInlineUpdate(projektId, {
      angebotsDaten: JSON.stringify(updatedAngebotsDaten)
    });
    setEditingBemerkung(false);
  };

  // Telefon speichern (auch beim Kunden für nächstes Jahr)
  const saveTelefon = () => {
    if (tempTelefon === aspTelefon) {
      setEditingTelefon(false);
      return;
    }
    const kundeUpdates: Partial<SaisonKunde> = {
      dispoAnsprechpartner: {
        name: aspName,
        telefon: tempTelefon
      }
    };
    onInlineUpdate(projektId, {
      dispoAnsprechpartner: {
        name: aspName,
        telefon: tempTelefon
      }
    }, kundeUpdates);
    setEditingTelefon(false);
  };

  // Geplantes Datum speichern
  const saveGeplant = () => {
    if (tempGeplant === (projekt.geplantesDatum || '')) {
      setEditingGeplant(false);
      return;
    }
    onInlineUpdate(projektId, { geplantesDatum: tempGeplant || undefined });
    setEditingGeplant(false);
  };

  // Kommuniziertes Datum speichern
  const saveKommuniziert = () => {
    if (tempKommuniziert === (projekt.kommuniziertesDatum || '')) {
      setEditingKommuniziert(false);
      return;
    }
    onInlineUpdate(projektId, { kommuniziertesDatum: tempKommuniziert || undefined });
    setEditingKommuniziert(false);
  };

  // Hat wichtige Zusatzbemerkungen?
  const hatWichtigeBemerkungen = kunde?.zusatzbemerkungen?.some(z => z.wichtig) || false;

  // Hat Anhänge?
  const hatAnhaenge = (projekt.anhaenge?.length || 0) > 0;

  // Hat Notizen?
  const hatNotizen = (projekt.dispoNotizen?.length || 0) > 0;

  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
      <div className="flex items-center gap-4">
        {/* Status-Badge mit Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color} flex items-center gap-1`}
          >
            {statusConfig.label}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showStatusMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 z-10 min-w-[120px]">
              {(Object.keys(DISPO_STATUS_CONFIG) as DispoStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    onStatusChange(s);
                    setShowStatusMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2 ${
                    s === status ? 'bg-gray-100 dark:bg-slate-700' : ''
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${DISPO_STATUS_CONFIG[s].bgColor}`} />
                  {DISPO_STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Kunde + Bemerkung */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
            <button
              onClick={onGoToProjektabwicklung}
              className="font-semibold text-gray-900 dark:text-white truncate hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1 group"
              title="Projekt öffnen"
            >
              {projekt.kundenname}
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            {projekt.kundennummer && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-slate-700 rounded-full text-gray-600 dark:text-gray-400">
                {projekt.kundennummer}
              </span>
            )}
            {/* Bemerkung aus Angebot - Inline bearbeitbar */}
            {editingBemerkung ? (
              <div className="flex items-center gap-1">
                <input
                  ref={bemerkungRef}
                  type="text"
                  value={tempBemerkung}
                  onChange={(e) => setTempBemerkung(e.target.value)}
                  onBlur={saveBemerkung}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveBemerkung();
                    if (e.key === 'Escape') setEditingBemerkung(false);
                  }}
                  className="px-2 py-0.5 text-xs border border-orange-300 dark:border-orange-700 rounded bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 w-40"
                  placeholder="Bemerkung..."
                  autoFocus
                />
                <button
                  onClick={saveBemerkung}
                  className="p-0.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setTempBemerkung(bemerkung);
                  setEditingBemerkung(true);
                }}
                className={`text-xs px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  bemerkung
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
                title={bemerkung || 'Bemerkung hinzufügen'}
              >
                <Edit3 className="w-2.5 h-2.5" />
                {bemerkung ? (
                  <span className="truncate max-w-[150px]">{bemerkung}</span>
                ) : (
                  <span className="italic">Bemerkung</span>
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {projekt.kundenPlzOrt || kunde?.adresse?.plz + ' ' + kunde?.adresse?.ort}
            </span>
          </div>

          {/* Material-Aufschlüsselung */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Transport-Typ Badge (Spedition / Gemischt) */}
            {material.transportTyp === 'spedition' && (
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-100 border border-orange-400 dark:border-orange-600 flex items-center gap-1">
                <Boxes className="w-3 h-3" />
                SPEDITION
              </span>
            )}
            {material.transportTyp === 'gemischt' && (
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-100 border border-amber-400 dark:border-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                GEMISCHT
              </span>
            )}

            {/* Belieferungsart Badge */}
            {belieferungsartLabel && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${belieferungsartFarbe.bg} ${belieferungsartFarbe.text}`}>
                {belieferungsartLabel}
              </span>
            )}

            {/* 0-2 Lose */}
            {material.lose02 > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                {material.lose02}t 0-2
              </span>
            )}

            {/* 0-3 Lose */}
            {material.lose03 > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                {material.lose03}t 0-3
              </span>
            )}

            {/* Sackware */}
            {material.gesamtGesackt > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                {material.gesamtGesackt.toFixed(1)}t Sack
                {material.hatBeiladung && ' (Beil.)'}
              </span>
            )}

            {/* BigBag Info */}
            {material.gesamtBigBag > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300">
                {material.gesamtBigBag.toFixed(1)}t BigBag
              </span>
            )}

            {/* Gesamt-Tonnage */}
            <span className="px-2 py-0.5 text-xs font-bold rounded bg-gray-200 dark:bg-slate-600 text-gray-800 dark:text-gray-200">
              Σ {material.gesamtTonnen.toFixed(1)}t
            </span>

            {/* Paletten-Info */}
            {material.istPalettenware && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300">
                Palette
              </span>
            )}
          </div>

          {/* BEILADUNGS-HINWEIS - Prominent und auffällig */}
          {material.beiladungsHinweis?.dringend && (
            <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 rounded-lg text-xs font-semibold border-2 border-yellow-400 dark:border-yellow-600 animate-pulse">
              <PackageCheck className="w-4 h-4 flex-shrink-0" />
              <span>SÄCKE MITLADEN: {material.beiladungsHinweis.anzeigeText}</span>
            </div>
          )}
        </div>

        {/* DISPO-Ansprechpartner mit bearbeitbarem Telefon */}
        <div className="min-w-[160px]">
          <div className="text-sm">
            {aspName && (
              <div className="flex items-center gap-1 text-purple-700 dark:text-purple-400 font-medium">
                <User className="w-3 h-3" />
                {aspName}
              </div>
            )}
            {/* Telefon - Inline bearbeitbar */}
            {editingTelefon ? (
              <div className="flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3 text-purple-600" />
                <input
                  ref={telefonRef}
                  type="tel"
                  value={tempTelefon}
                  onChange={(e) => setTempTelefon(e.target.value)}
                  onBlur={saveTelefon}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTelefon();
                    if (e.key === 'Escape') setEditingTelefon(false);
                  }}
                  className="px-2 py-0.5 text-xs border border-purple-300 dark:border-purple-700 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 w-28"
                  placeholder="Telefon..."
                  autoFocus
                />
                <button
                  onClick={saveTelefon}
                  className="p-0.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : aspTelefon ? (
              <div className="flex items-center gap-1 mt-0.5">
                <a
                  href={`tel:${aspTelefon}`}
                  className="flex items-center gap-1 text-purple-600 dark:text-purple-300 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="w-3 h-3" />
                  {aspTelefon}
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setTempTelefon(aspTelefon);
                    setEditingTelefon(true);
                  }}
                  className="p-0.5 text-gray-400 hover:text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded"
                  title="Telefon bearbeiten"
                >
                  <Edit3 className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setTempTelefon('');
                  setEditingTelefon(true);
                }}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 mt-0.5"
                title="Telefon hinzufügen"
              >
                <Phone className="w-3 h-3" />
                <span className="italic">Telefon</span>
                <Edit3 className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Geplantes Datum (intern) - bearbeitbar */}
        <div className="text-center min-w-[100px]">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Geplant</div>
          {editingGeplant ? (
            <div className="flex items-center gap-1 justify-center">
              <input
                type="date"
                value={tempGeplant}
                onChange={(e) => setTempGeplant(e.target.value)}
                onBlur={saveGeplant}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveGeplant();
                  if (e.key === 'Escape') setEditingGeplant(false);
                }}
                className="px-1 py-0.5 text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 w-28"
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={() => {
                setTempGeplant(projekt.geplantesDatum || '');
                setEditingGeplant(true);
              }}
              className={`text-sm px-2 py-0.5 rounded transition-colors ${
                projekt.geplantesDatum
                  ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                  : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
              title="Geplantes Datum bearbeiten"
            >
              {projekt.geplantesDatum ? (
                <span className="font-medium">
                  {new Date(projekt.geplantesDatum).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
              ) : (
                <span className="italic flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  -
                </span>
              )}
            </button>
          )}
          {/* KW-Info falls vorhanden */}
          {projekt.lieferKW && (
            <div className={`text-xs ${
              projekt.lieferdatumTyp === 'kw'
                ? 'text-green-600 dark:text-green-400'
                : 'text-blue-600 dark:text-blue-400'
            }`}>
              {projekt.lieferdatumTyp === 'kw' ? 'in ' : 'bis '}KW {projekt.lieferKW}
            </div>
          )}
        </div>

        {/* Kommuniziertes Datum (mit Kunde abgestimmt) - bearbeitbar */}
        <div className="text-center min-w-[100px]">
          <div className="text-[10px] text-green-600 dark:text-green-400 uppercase tracking-wide mb-0.5">Kommuniziert</div>
          {editingKommuniziert ? (
            <div className="flex items-center gap-1 justify-center">
              <input
                type="date"
                value={tempKommuniziert}
                onChange={(e) => setTempKommuniziert(e.target.value)}
                onBlur={saveKommuniziert}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveKommuniziert();
                  if (e.key === 'Escape') setEditingKommuniziert(false);
                }}
                className="px-1 py-0.5 text-xs border border-green-300 dark:border-green-700 rounded bg-green-50 dark:bg-green-900/30 w-28"
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={() => {
                setTempKommuniziert(projekt.kommuniziertesDatum || '');
                setEditingKommuniziert(true);
              }}
              className={`text-sm px-2 py-0.5 rounded transition-colors ${
                projekt.kommuniziertesDatum
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 font-medium'
                  : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
              title="Kommuniziertes Datum bearbeiten"
            >
              {projekt.kommuniziertesDatum ? (
                new Date(projekt.kommuniziertesDatum).toLocaleDateString('de-DE', {
                  weekday: 'short',
                  day: '2-digit',
                  month: '2-digit',
                })
              ) : (
                <span className="italic flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  -
                </span>
              )}
            </button>
          )}
          {/* Zeitfenster falls vorhanden */}
          {projekt.lieferzeitfenster && projekt.kommuniziertesDatum && (
            <div className="text-xs text-gray-500">
              {projekt.lieferzeitfenster.von} - {projekt.lieferzeitfenster.bis}
            </div>
          )}
        </div>

        {/* Belieferungsart */}
        <div className="text-center min-w-[80px]">
          {projekt.belieferungsart && (
            <div className={`text-xs px-2 py-1 rounded-full inline-block ${
              projekt.belieferungsart === 'mit_haenger'
                ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                : projekt.belieferungsart === 'nur_motorwagen'
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {projekt.belieferungsart === 'nur_motorwagen' && 'Motorwagen'}
              {projekt.belieferungsart === 'mit_haenger' && 'Hänger'}
              {projekt.belieferungsart === 'abholung_ab_werk' && 'Abholung'}
              {projekt.belieferungsart === 'palette_mit_ladekran' && 'Kran'}
              {projekt.belieferungsart === 'bigbag' && 'BigBag'}
            </div>
          )}
        </div>

        {/* Buchungs-Badge mit Aktionen */}
        <div className="min-w-[160px]">
          <BuchungsBadge
            auftrag={auftragMitBuchungen}
            touren={touren}
            onBuchen={onBuchen}
            onSchnellUmbuchen={onSchnellUmbuchen}
            onTeilbuchen={onTeilbuchen}
            onEntfernen={onBuchungEntfernen}
          />
        </div>

        {/* Indikatoren */}
        <div className="flex items-center gap-2">
          {hatWichtigeBemerkungen && (
            <span className="p-1.5 bg-red-100 dark:bg-red-900/50 rounded-full" title="Wichtige Bemerkung">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            </span>
          )}
          {hatAnhaenge && (
            <span className="p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-full" title="Anhänge vorhanden">
              <Paperclip className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </span>
          )}
          {hatNotizen && (
            <span className="p-1.5 bg-yellow-100 dark:bg-yellow-900/50 rounded-full" title="Notizen vorhanden">
              <MessageSquare className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenDetail}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
            title="Details anzeigen"
          >
            <Eye className="w-5 h-5" />
          </button>
          <button
            onClick={onGoToProjektabwicklung}
            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
            title="Zur Projektabwicklung"
          >
            <FileText className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Detail Modal
interface AuftragDetailModalProps {
  projekt: Projekt;
  kunde?: SaisonKunde;
  fahrzeuge: Fahrzeug[];
  onClose: () => void;
  onSave: (updates: Partial<Projekt>) => void;
}

const AuftragDetailModal = ({ projekt, kunde, fahrzeuge, onClose, onSave }: AuftragDetailModalProps) => {
  const [activeTab, setActiveTab] = useState<'details' | 'notizen' | 'anhaenge' | 'bemerkungen' | 'schuettplatzbilder'>('details');
  const [formData, setFormData] = useState({
    geplantesDatum: projekt.geplantesDatum || '',
    lieferzeitfensterVon: projekt.lieferzeitfenster?.von || '08:00',
    lieferzeitfensterBis: projekt.lieferzeitfenster?.bis || '16:00',
    fahrzeugId: projekt.fahrzeugId || '',
    anzahlPaletten: projekt.anzahlPaletten || 0,
    liefergewicht: projekt.liefergewicht || projekt.angefragteMenge || 0,
    dispoStatus: projekt.dispoStatus || 'offen' as DispoStatus,
  });
  const [neueNotiz, setNeueNotiz] = useState('');
  const [notizen, setNotizen] = useState<DispoNotiz[]>(projekt.dispoNotizen || []);
  const [anhaenge, setAnhaenge] = useState<ProjektAnhang[]>(projekt.anhaenge || []);
  const [uploading, setUploading] = useState(false);
  const [schuettplatzbilder, setSchuettplatzbilder] = useState<KundenAktivitaet[]>([]);
  const [loadingBilder, setLoadingBilder] = useState(false);
  const [uploadingBild, setUploadingBild] = useState(false);
  const [bildBeschreibung, setBildBeschreibung] = useState('');
  const [selectedBild, setSelectedBild] = useState<KundenAktivitaet | null>(null);

  // Schüttplatzbilder laden
  useEffect(() => {
    const loadSchuettplatzbilder = async () => {
      if (!kunde?.id) return;
      setLoadingBilder(true);
      try {
        const bilder = await kundenAktivitaetService.listSchuettplatzbilder(kunde.id);
        setSchuettplatzbilder(bilder);
      } catch (error) {
        console.error('Fehler beim Laden der Schüttplatzbilder:', error);
      } finally {
        setLoadingBilder(false);
      }
    };
    loadSchuettplatzbilder();
  }, [kunde?.id]);

  // Notiz hinzufügen
  const addNotiz = () => {
    if (!neueNotiz.trim()) return;
    const notiz: DispoNotiz = {
      id: ID.unique(),
      text: neueNotiz.trim(),
      erstelltAm: new Date().toISOString(),
      wichtig: false,
    };
    setNotizen([...notizen, notiz]);
    setNeueNotiz('');
  };

  // Notiz löschen
  const deleteNotiz = (notizId: string) => {
    setNotizen(notizen.filter(n => n.id !== notizId));
  };

  // Datei hochladen
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const anhang = await projektAnhangService.uploadDatei(file, 'bestellung');
        setAnhaenge(prev => [...prev, anhang]);
      }
    } catch (error) {
      console.error('Fehler beim Hochladen:', error);
      alert('Fehler beim Hochladen der Datei');
    } finally {
      setUploading(false);
    }
  };

  // Anhang löschen
  const deleteAnhang = async (anhang: ProjektAnhang) => {
    try {
      await projektAnhangService.deleteDatei(anhang.appwriteFileId);
      setAnhaenge(prev => prev.filter(a => a.id !== anhang.id));
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  };

  // Speichern
  const handleSave = () => {
    onSave({
      geplantesDatum: formData.geplantesDatum || undefined,
      lieferzeitfenster: formData.geplantesDatum ? {
        von: formData.lieferzeitfensterVon,
        bis: formData.lieferzeitfensterBis,
      } : undefined,
      fahrzeugId: formData.fahrzeugId || undefined,
      anzahlPaletten: formData.anzahlPaletten || undefined,
      liefergewicht: formData.liefergewicht || undefined,
      dispoStatus: formData.dispoStatus,
      dispoNotizen: notizen,
      anhaenge: anhaenge,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-500" />
              {projekt.kundenname}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {projekt.kundenPlzOrt} | {projekt.kundennummer}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-slate-700 px-6">
          <div className="flex gap-6">
            {[
              { id: 'details', label: 'Lieferdetails', icon: Truck },
              { id: 'schuettplatzbilder', label: 'Schüttplatzbilder', icon: Image, count: schuettplatzbilder.length },
              { id: 'notizen', label: 'Notizen', icon: MessageSquare, count: notizen.length },
              { id: 'anhaenge', label: 'Anhänge', icon: Paperclip, count: anhaenge.length },
              { id: 'bemerkungen', label: 'Kundenbemerkungen', icon: AlertCircle, count: kunde?.zusatzbemerkungen?.length || 0 },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-slate-700 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Dispo-Status
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.keys(DISPO_STATUS_CONFIG) as DispoStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFormData({ ...formData, dispoStatus: s })}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.dispoStatus === s
                          ? `${DISPO_STATUS_CONFIG[s].bgColor} ${DISPO_STATUS_CONFIG[s].color} ring-2 ring-offset-2 ring-red-500`
                          : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {DISPO_STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Datum & Zeit */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Lieferdatum
                  </label>
                  <input
                    type="date"
                    value={formData.geplantesDatum}
                    onChange={(e) => setFormData({ ...formData, geplantesDatum: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Von
                  </label>
                  <input
                    type="time"
                    value={formData.lieferzeitfensterVon}
                    onChange={(e) => setFormData({ ...formData, lieferzeitfensterVon: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Bis
                  </label>
                  <input
                    type="time"
                    value={formData.lieferzeitfensterBis}
                    onChange={(e) => setFormData({ ...formData, lieferzeitfensterBis: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Fahrzeug */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fahrzeug
                </label>
                <select
                  value={formData.fahrzeugId}
                  onChange={(e) => setFormData({ ...formData, fahrzeugId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="">Kein Fahrzeug zugewiesen</option>
                  {fahrzeuge.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.kennzeichen} ({f.kapazitaetTonnen}t)
                    </option>
                  ))}
                </select>
              </div>

              {/* Menge */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Liefergewicht (Tonnen)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.liefergewicht}
                    onChange={(e) => setFormData({ ...formData, liefergewicht: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Anzahl Paletten
                  </label>
                  <input
                    type="number"
                    value={formData.anzahlPaletten}
                    onChange={(e) => setFormData({ ...formData, anzahlPaletten: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Lieferadresse */}
              {(projekt.lieferadresse || kunde?.adresse) && (
                <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Lieferadresse
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400">
                    {projekt.lieferadresse?.strasse || kunde?.adresse?.strasse}<br />
                    {projekt.lieferadresse?.plz || kunde?.adresse?.plz} {projekt.lieferadresse?.ort || kunde?.adresse?.ort}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'schuettplatzbilder' && (
            <div className="space-y-4">
              {/* Upload-Bereich */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                <h4 className="font-medium text-green-800 dark:text-green-300 mb-3 flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Neues Schüttplatzbild hochladen
                </h4>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Beschreibung (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="z.B. Zufahrt von links, Schüttstelle hinter Clubhaus..."
                      value={bildBeschreibung}
                      onChange={(e) => setBildBeschreibung(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                    />
                  </div>
                  <label className="cursor-pointer">
                    <div className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                      uploadingBild
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}>
                      {uploadingBild ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Lädt...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Bild hochladen
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !kunde?.id) return;
                        setUploadingBild(true);
                        try {
                          const neuesBild = await kundenAktivitaetService.uploadSchuettplatzbild(
                            kunde.id,
                            file,
                            bildBeschreibung || undefined
                          );
                          setSchuettplatzbilder(prev => [neuesBild, ...prev]);
                          setBildBeschreibung('');
                        } catch (error) {
                          console.error('Fehler beim Hochladen:', error);
                          alert('Fehler beim Hochladen des Bildes');
                        } finally {
                          setUploadingBild(false);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                      disabled={uploadingBild || !kunde?.id}
                    />
                  </label>
                </div>
                {!kunde?.id && (
                  <p className="text-sm text-orange-600 dark:text-orange-400 mt-2">
                    Kein Kunde zugeordnet - Bilder können nicht hochgeladen werden
                  </p>
                )}
              </div>

              {/* Bilder-Galerie */}
              {loadingBilder ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                </div>
              ) : schuettplatzbilder.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Image className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Noch keine Schüttplatzbilder</p>
                  <p className="text-sm mt-1">Laden Sie Bilder hoch, um den Fahrern die Schüttstelle zu zeigen</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {schuettplatzbilder.map((bild) => (
                    <div
                      key={bild.id}
                      className="group relative bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden aspect-video"
                    >
                      <img
                        src={kundenAktivitaetService.getPreviewUrl(bild.dateiId!, 400, 300)}
                        alt={bild.titel}
                        className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                        onClick={() => setSelectedBild(bild)}
                      />
                      {/* Overlay mit Aktionen */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-white text-sm font-medium truncate">
                            {bild.beschreibung || bild.dateiName}
                          </p>
                          <p className="text-white/70 text-xs">
                            {new Date(bild.erstelltAm).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                        <div className="absolute top-2 right-2 flex gap-1">
                          <button
                            onClick={() => setSelectedBild(bild)}
                            className="p-1.5 bg-white/90 rounded-lg text-gray-700 hover:bg-white"
                            title="Vergrößern"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </button>
                          <a
                            href={kundenAktivitaetService.getDownloadUrl(bild.dateiId!)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-white/90 rounded-lg text-blue-600 hover:bg-white"
                            title="Herunterladen"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          <button
                            onClick={async () => {
                              if (!confirm('Bild wirklich löschen?')) return;
                              try {
                                await kundenAktivitaetService.remove(bild.id);
                                setSchuettplatzbilder(prev => prev.filter(b => b.id !== bild.id));
                              } catch (error) {
                                console.error('Fehler beim Löschen:', error);
                              }
                            }}
                            className="p-1.5 bg-white/90 rounded-lg text-red-600 hover:bg-white"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Lightbox für Vollbild-Ansicht */}
              {selectedBild && (
                <div
                  className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
                  onClick={() => setSelectedBild(null)}
                >
                  <button
                    onClick={() => setSelectedBild(null)}
                    className="absolute top-4 right-4 p-2 text-white/70 hover:text-white"
                  >
                    <X className="w-8 h-8" />
                  </button>
                  <img
                    src={kundenAktivitaetService.getDateiUrl(selectedBild.dateiId!)}
                    alt={selectedBild.titel}
                    className="max-w-full max-h-full object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="absolute bottom-4 left-4 right-4 text-center">
                    <p className="text-white font-medium">
                      {selectedBild.beschreibung || selectedBild.dateiName}
                    </p>
                    <p className="text-white/60 text-sm">
                      Hochgeladen am {new Date(selectedBild.erstelltAm).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notizen' && (
            <div className="space-y-4">
              {/* Neue Notiz */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Neue Notiz eingeben..."
                  value={neueNotiz}
                  onChange={(e) => setNeueNotiz(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addNotiz()}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                />
                <button
                  onClick={addNotiz}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Notizen-Liste */}
              <div className="space-y-2">
                {notizen.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Noch keine Notizen</p>
                ) : (
                  notizen.map((notiz) => (
                    <div key={notiz.id} className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-start gap-3">
                      <MessageSquare className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-gray-900 dark:text-white">{notiz.text}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(notiz.erstelltAm).toLocaleString('de-DE')}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteNotiz(notiz.id)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'anhaenge' && (
            <div className="space-y-4">
              {/* Upload */}
              <label className="block">
                <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-red-500 transition-colors">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {uploading ? 'Lädt hoch...' : 'Dateien hier ablegen oder klicken'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">PDF, E-Mail, Bilder</p>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.eml,.msg,.png,.jpg,.jpeg"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>

              {/* Anhänge-Liste */}
              <div className="space-y-2">
                {anhaenge.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Noch keine Anhänge</p>
                ) : (
                  anhaenge.map((anhang) => (
                    <div key={anhang.id} className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg flex items-center gap-3">
                      <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {anhang.dateiname}
                        </p>
                        <p className="text-xs text-gray-500">
                          {projektAnhangService.formatGroesse(anhang.groesse)} | {anhang.kategorie}
                        </p>
                      </div>
                      <a
                        href={projektAnhangService.getDownloadUrl(anhang.appwriteFileId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => deleteAnhang(anhang)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'bemerkungen' && (
            <div className="space-y-4">
              {/* DISPO-Ansprechpartner */}
              {(projekt.dispoAnsprechpartner?.name || kunde?.dispoAnsprechpartner?.name) && (
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h4 className="font-medium text-purple-800 dark:text-purple-300 mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    DISPO-Ansprechpartner (vor Ort)
                  </h4>
                  <div className="flex items-center gap-4">
                    <span className="text-purple-700 dark:text-purple-200 font-medium">
                      {projekt.dispoAnsprechpartner?.name || kunde?.dispoAnsprechpartner?.name}
                    </span>
                    {(projekt.dispoAnsprechpartner?.telefon || kunde?.dispoAnsprechpartner?.telefon) && (
                      <a
                        href={`tel:${projekt.dispoAnsprechpartner?.telefon || kunde?.dispoAnsprechpartner?.telefon}`}
                        className="flex items-center gap-1 px-3 py-1 bg-purple-100 dark:bg-purple-800 rounded-lg text-purple-700 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-700 transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                        {projekt.dispoAnsprechpartner?.telefon || kunde?.dispoAnsprechpartner?.telefon}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Kundenanfahrt */}
              {kunde?.anfahrtshinweise && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                    <Navigation className="w-4 h-4" />
                    Anfahrtshinweise
                  </h4>
                  <p className="text-blue-700 dark:text-blue-200">{kunde.anfahrtshinweise}</p>
                </div>
              )}

              {/* Zusatzbemerkungen */}
              {kunde?.zusatzbemerkungen?.length ? (
                kunde.zusatzbemerkungen.map((bem) => (
                  <div
                    key={bem.id}
                    className={`p-4 rounded-lg ${
                      bem.wichtig
                        ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800'
                        : 'bg-gray-50 dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {bem.wichtig && <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">{bem.titel}</h4>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{bem.text}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {bem.kategorie} | Erstellt: {new Date(bem.erstelltAm).toLocaleDateString('de-DE')}
                        </p>
                      </div>
                      {bem.anhangFileId && (
                        <a
                          href={projektAnhangService.getDownloadUrl(bem.anhangFileId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          title={bem.anhangDateiname}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">Keine Zusatzbemerkungen vorhanden</p>
              )}

              {/* Standard-Lieferzeitfenster */}
              {kunde?.standardLieferzeitfenster && (
                <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Standard-Lieferzeitfenster
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400">
                    {kunde.standardLieferzeitfenster.von} - {kunde.standardLieferzeitfenster.bis}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

export default DispoPlanung;
