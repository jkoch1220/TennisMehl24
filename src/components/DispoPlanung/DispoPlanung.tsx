import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { Projekt, ProjektAnhang, DispoNotiz, DispoStatus } from '../../types/projekt';
import { SaisonKunde } from '../../types/saisonplanung';
import { Fahrzeug } from '../../types/dispo';
import { projektService } from '../../services/projektService';
import { saisonplanungService } from '../../services/saisonplanungService';
import { fahrzeugService } from '../../services/fahrzeugService';
import { projektAnhangService } from '../../services/projektAnhangService';
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

const DispoPlanung = () => {
  const navigate = useNavigate();

  // State
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [kundenMap, setKundenMap] = useState<Map<string, SaisonKunde>>(new Map());
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filter & Ansicht
  const [suche, setSuche] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('alle');
  const [filterDatum, setFilterDatum] = useState<string>('');

  // Ausgewähltes Projekt für Detail-Ansicht
  const [selectedProjekt, setSelectedProjekt] = useState<Projekt | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

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
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter-Funktion
  const gefilterteProjekte = projekte.filter(p => {
    // Status-Filter
    if (filterStatus !== 'alle' && p.dispoStatus !== filterStatus) return false;

    // Datum-Filter
    if (filterDatum && p.geplantesDatum !== filterDatum) return false;

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

  // Zur Bestellabwicklung navigieren
  const goToBestellabwicklung = (projekt: Projekt) => {
    const projektId = (projekt as any).$id || projekt.id;
    navigate(`/bestellabwicklung/${projektId}`);
  };

  // Statistiken berechnen
  const stats = {
    gesamt: projekte.length,
    offen: projekte.filter(p => p.dispoStatus === 'offen').length,
    geplant: projekte.filter(p => p.dispoStatus === 'geplant').length,
    unterwegs: projekte.filter(p => p.dispoStatus === 'beladen' || p.dispoStatus === 'unterwegs').length,
    geliefert: projekte.filter(p => p.dispoStatus === 'geliefert').length,
    heute: projekte.filter(p => p.geplantesDatum === new Date().toISOString().split('T')[0]).length,
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
      </div>

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
          {(filterStatus !== 'alle' || filterDatum || suche) && (
            <button
              onClick={() => {
                setFilterStatus('alle');
                setFilterDatum('');
                setSuche('');
              }}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Auftrags-Liste */}
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
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {gefilterteProjekte.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Keine Aufträge gefunden</p>
            </div>
          ) : (
            gefilterteProjekte.map((projekt) => (
              <AuftragsZeile
                key={(projekt as any).$id || projekt.id}
                projekt={projekt}
                kunde={projekt.kundeId ? kundenMap.get(projekt.kundeId) : undefined}
                onStatusChange={(status) => updateDispoStatus(projekt, status)}
                onOpenDetail={() => openProjektDetail(projekt)}
                onGoToBestellabwicklung={() => goToBestellabwicklung(projekt)}
              />
            ))
          )}
        </div>
      </div>

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
  onStatusChange: (status: DispoStatus) => void;
  onOpenDetail: () => void;
  onGoToBestellabwicklung: () => void;
}

const AuftragsZeile = ({ projekt, kunde, onStatusChange, onOpenDetail, onGoToBestellabwicklung }: AuftragsZeileProps) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const status = projekt.dispoStatus || 'offen';
  const statusConfig = DISPO_STATUS_CONFIG[status];

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

        {/* Kunde */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
            <span className="font-semibold text-gray-900 dark:text-white truncate">
              {projekt.kundenname}
            </span>
            {projekt.kundennummer && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-slate-700 rounded-full text-gray-600 dark:text-gray-400">
                {projekt.kundennummer}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {projekt.kundenPlzOrt || kunde?.adresse?.plz + ' ' + kunde?.adresse?.ort}
            </span>
            {projekt.angefragteMenge && (
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                {projekt.angefragteMenge}t
              </span>
            )}
          </div>
        </div>

        {/* DISPO-Ansprechpartner */}
        {(projekt.dispoAnsprechpartner?.name || kunde?.dispoAnsprechpartner?.name) && (
          <div className="min-w-[150px]">
            <div className="text-sm">
              <div className="flex items-center gap-1 text-purple-700 dark:text-purple-400 font-medium">
                <User className="w-3 h-3" />
                {projekt.dispoAnsprechpartner?.name || kunde?.dispoAnsprechpartner?.name}
              </div>
              {(projekt.dispoAnsprechpartner?.telefon || kunde?.dispoAnsprechpartner?.telefon) && (
                <a
                  href={`tel:${projekt.dispoAnsprechpartner?.telefon || kunde?.dispoAnsprechpartner?.telefon}`}
                  className="flex items-center gap-1 text-purple-600 dark:text-purple-300 hover:underline"
                >
                  <Phone className="w-3 h-3" />
                  {projekt.dispoAnsprechpartner?.telefon || kunde?.dispoAnsprechpartner?.telefon}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Lieferdatum & Belieferungsart */}
        <div className="text-center">
          {projekt.lieferKW ? (
            // KW-basierter Liefertermin
            <div className="text-sm">
              <div className={`font-medium ${
                projekt.lieferdatumTyp === 'kw'
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-blue-700 dark:text-blue-400'
              }`}>
                {projekt.lieferdatumTyp === 'kw' ? 'in ' : 'bis '}
                KW {projekt.lieferKW}
              </div>
              {projekt.bevorzugterTag && (
                <div className="text-xs text-gray-500">
                  {projekt.bevorzugterTag === 'montag' && 'Mo'}
                  {projekt.bevorzugterTag === 'dienstag' && 'Di'}
                  {projekt.bevorzugterTag === 'mittwoch' && 'Mi'}
                  {projekt.bevorzugterTag === 'donnerstag' && 'Do'}
                  {projekt.bevorzugterTag === 'freitag' && 'Fr'}
                  {projekt.bevorzugterTag === 'samstag' && 'Sa'}
                </div>
              )}
            </div>
          ) : projekt.geplantesDatum ? (
            // Datums-basierter Liefertermin
            <div className="text-sm">
              <div className="font-medium text-gray-900 dark:text-white">
                {projekt.lieferdatumTyp === 'spaetestens' && <span className="text-orange-600 dark:text-orange-400">bis </span>}
                {new Date(projekt.geplantesDatum).toLocaleDateString('de-DE', {
                  weekday: 'short',
                  day: '2-digit',
                  month: '2-digit',
                })}
              </div>
              {projekt.lieferzeitfenster && (
                <div className="text-xs text-gray-500">
                  {projekt.lieferzeitfenster.von} - {projekt.lieferzeitfenster.bis}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm text-gray-400">Kein Datum</span>
          )}
          {/* Belieferungsart */}
          {projekt.belieferungsart && (
            <div className={`mt-1 text-xs px-2 py-0.5 rounded-full inline-block ${
              projekt.belieferungsart === 'mit_haenger'
                ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                : projekt.belieferungsart === 'nur_motorwagen'
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {projekt.belieferungsart === 'nur_motorwagen' && 'Motorwagen'}
              {projekt.belieferungsart === 'mit_haenger' && 'mit Hänger'}
              {projekt.belieferungsart === 'abholung_ab_werk' && 'Abholung'}
              {projekt.belieferungsart === 'palette_mit_ladekran' && 'Ladekran'}
              {projekt.belieferungsart === 'bigbag' && 'BigBag'}
            </div>
          )}
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
            onClick={onGoToBestellabwicklung}
            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
            title="Zur Bestellabwicklung"
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
  const [activeTab, setActiveTab] = useState<'details' | 'notizen' | 'anhaenge' | 'bemerkungen'>('details');
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
