import { useState, useRef, TouchEvent } from 'react';
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
  Layers,
  Pencil,
  Trash2,
  X,
  Send,
  XCircle,
  ChevronRight,
  Mail,
} from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';

// Alle Status-Tabs für Mobile (inkl. "Alle")
const MOBILE_TABS: { id: ProjektStatus | 'alle'; label: string; shortLabel: string; icon: React.ComponentType<any>; color: string; bgColor: string }[] = [
  { id: 'alle', label: 'Alle', shortLabel: 'Alle', icon: Layers, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/50' },
  { id: 'angebot', label: 'Angebot', shortLabel: 'Ang.', icon: FileCheck, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/50' },
  { id: 'angebot_versendet', label: 'Versendet', shortLabel: 'Vers.', icon: Send, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/50' },
  { id: 'auftragsbestaetigung', label: 'AB', shortLabel: 'AB', icon: FileSignature, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/50' },
  { id: 'lieferschein', label: 'Lieferung', shortLabel: 'Lief.', icon: Truck, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/50' },
  { id: 'rechnung', label: 'Rechnung', shortLabel: 'Rech.', icon: FileText, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/50' },
  { id: 'bezahlt', label: 'Bezahlt', shortLabel: 'Bez.', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/50' },
];

// ==========================================
// MOBILE PROJEKT CARD - Touch-optimiert mit Swipe-Gesten
// ==========================================
interface MobileProjektCardProps {
  projekt: Projekt;
  onTap: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

const MobileProjektCard = ({ projekt, onTap, onEdit, onDelete }: MobileProjektCardProps) => {
  const [swipeX, setSwipeX] = useState(0);
  const [startX, setStartX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Status-Konfiguration
  const getStatusConfig = (status: ProjektStatus) => {
    const configs: Record<ProjektStatus, { label: string; color: string; bgColor: string; icon: React.ComponentType<any> }> = {
      angebot: { label: 'Angebot', color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/50', icon: FileCheck },
      angebot_versendet: { label: 'Versendet', color: 'text-indigo-700 dark:text-indigo-300', bgColor: 'bg-indigo-100 dark:bg-indigo-900/50', icon: Send },
      auftragsbestaetigung: { label: 'AB', color: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-100 dark:bg-orange-900/50', icon: FileSignature },
      lieferschein: { label: 'Lieferung', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-900/50', icon: Truck },
      rechnung: { label: 'Rechnung', color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/50', icon: FileText },
      bezahlt: { label: 'Bezahlt', color: 'text-emerald-700 dark:text-emerald-300', bgColor: 'bg-emerald-100 dark:bg-emerald-900/50', icon: CheckCircle2 },
      verloren: { label: 'Verloren', color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800', icon: XCircle },
    };
    return configs[status];
  };

  const statusConfig = getStatusConfig(projekt.status);
  const StatusIcon = statusConfig.icon;

  // Extrahiere PLZ
  const plzMatch = projekt.kundenPlzOrt?.match(/^(\d{5})/);
  const plz = plzMatch ? plzMatch[1] : '';
  const ort = projekt.kundenPlzOrt?.replace(/^\d{5}\s*/, '') || '';

  // Touch-Handler für Swipe
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!isSwiping) return;
    const diff = e.touches[0].clientX - startX;
    // Nur nach links swipen erlauben (max -100px)
    setSwipeX(Math.max(-100, Math.min(0, diff)));
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    // Snap zurück oder offen halten
    if (swipeX < -50) {
      setSwipeX(-100);
    } else {
      setSwipeX(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-sm">
      {/* Hintergrund-Aktionen (sichtbar beim Swipen) */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          onClick={onEdit}
          className="w-[50px] bg-blue-500 flex items-center justify-center active:bg-blue-600"
        >
          <Pencil className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={onDelete}
          className="w-[50px] bg-red-500 flex items-center justify-center active:bg-red-600"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Haupt-Card */}
      <div
        ref={cardRef}
        className="relative bg-white dark:bg-slate-800 p-4 transition-transform duration-150 touch-pan-y"
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => swipeX === 0 && onTap()}
      >
        {/* Header: Status-Badge + Kunde */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusConfig.bgColor} ${statusConfig.color}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {statusConfig.label}
              </span>
              {projekt.kundennummer && (
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                  #{projekt.kundennummer}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
              {projekt.kundenname}
            </h3>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-2" />
        </div>

        {/* Adresse */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
          <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-semibold text-gray-700 dark:text-gray-300">{plz}</span>
          <span className="truncate">{ort}</span>
        </div>

        {/* Dokument-Nummern & Infos */}
        <div className="flex flex-wrap gap-2 mb-3">
          {projekt.angebotsnummer && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <FileCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{projekt.angebotsnummer}</span>
            </div>
          )}
          {projekt.auftragsbestaetigungsnummer && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
              <FileSignature className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              <span className="text-xs font-medium text-orange-700 dark:text-orange-300">{projekt.auftragsbestaetigungsnummer}</span>
            </div>
          )}
          {projekt.rechnungsnummer && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 rounded-lg">
              <FileText className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <span className="text-xs font-medium text-red-700 dark:text-red-300">{projekt.rechnungsnummer}</span>
            </div>
          )}
        </div>

        {/* Menge & Preis */}
        {(projekt.angefragteMenge || projekt.preisProTonne) && (
          <div className="flex items-center gap-4 pt-3 border-t border-gray-100 dark:border-slate-700">
            {projekt.angefragteMenge && (
              <div className="flex items-center gap-1.5">
                <Package className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-bold text-gray-900 dark:text-white">{projekt.angefragteMenge} t</span>
              </div>
            )}
            {projekt.preisProTonne && (
              <div className="flex items-center gap-1.5">
                <Euro className="w-4 h-4 text-green-500" />
                <span className="text-sm font-bold text-gray-900 dark:text-white">{projekt.preisProTonne.toFixed(2)} €/t</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// MOBILE PROJEKT VIEW - Hauptkomponente
// ==========================================
interface MobileProjektViewProps {
  projekteGruppiert: {
    angebot: Projekt[];
    angebot_versendet: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
    verloren: Projekt[];
  };
  suche: string;
  setSuche: (suche: string) => void;
  loading: boolean;
  saving: boolean;
  loadData: () => void;
  onProjektClick: (projekt: Projekt) => void;
  onEdit: (e: React.MouseEvent, projekt: Projekt) => void;
  onDelete: (e: React.MouseEvent, projekt: Projekt) => void;
  saisonjahr: number;
  filterProjekte: (projekte: Projekt[]) => Projekt[];
  editModal?: React.ReactNode;
  onAnfragenClick?: () => void;
}

const MobileProjektView = ({
  projekteGruppiert,
  suche,
  setSuche,
  loading,
  saving,
  loadData,
  onProjektClick,
  onEdit,
  onDelete,
  saisonjahr,
  filterProjekte,
  editModal,
  onAnfragenClick,
}: MobileProjektViewProps) => {
  const [mobileActiveTab, setMobileActiveTab] = useState<ProjektStatus | 'alle'>('alle');
  const mobileTabsRef = useRef<HTMLDivElement>(null);

  // Berechne Gesamtzahl
  const gesamt = projekteGruppiert.angebot.length +
    projekteGruppiert.angebot_versendet.length +
    projekteGruppiert.auftragsbestaetigung.length +
    projekteGruppiert.lieferschein.length +
    projekteGruppiert.rechnung.length +
    projekteGruppiert.bezahlt.length;

  // Gefilterte Projekte basierend auf aktivem Tab
  const getMobileProjekte = () => {
    let projekte: Projekt[] = [];

    if (mobileActiveTab === 'alle') {
      projekte = [
        ...projekteGruppiert.angebot,
        ...projekteGruppiert.angebot_versendet,
        ...projekteGruppiert.auftragsbestaetigung,
        ...projekteGruppiert.lieferschein,
        ...projekteGruppiert.rechnung,
        ...projekteGruppiert.bezahlt,
      ];
    } else {
      projekte = projekteGruppiert[mobileActiveTab] || [];
    }

    return filterProjekte(projekte);
  };

  const mobileProjekte = getMobileProjekte();

  // Zähler pro Status
  const mobileStatusCounts: Record<string, number> = {
    alle: gesamt,
    angebot: projekteGruppiert.angebot.length,
    angebot_versendet: projekteGruppiert.angebot_versendet.length,
    auftragsbestaetigung: projekteGruppiert.auftragsbestaetigung.length,
    lieferschein: projekteGruppiert.lieferschein.length,
    rechnung: projekteGruppiert.rechnung.length,
    bezahlt: projekteGruppiert.bezahlt.length,
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-950 pb-20">
      {/* Mobile Header - Sticky */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 shadow-md dark:shadow-dark-lg safe-top">
        {/* Top Bar */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg">
                <Layers className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Projekte</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">{gesamt} aktiv • Saison {saisonjahr}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onAnfragenClick && (
                <button
                  onClick={onAnfragenClick}
                  className="p-3 bg-amber-100 dark:bg-amber-900/50 rounded-xl active:scale-95 transition-all"
                >
                  <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </button>
              )}
              <button
                onClick={loadData}
                disabled={loading}
                className="p-3 bg-gray-100 dark:bg-slate-800 rounded-xl active:scale-95 transition-all"
              >
                <RefreshCw className={`w-5 h-5 text-gray-600 dark:text-gray-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Suche */}
          <div className="mt-3 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Suchen: Verein, PLZ, Nummer..."
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="w-full pl-12 pr-12 py-3.5 bg-gray-100 dark:bg-slate-800 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-base"
            />
            {suche && (
              <button
                onClick={() => setSuche('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-gray-300 dark:bg-slate-600 rounded-full active:scale-90"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            )}
          </div>
        </div>

        {/* Status-Tabs - Horizontal scrollbar */}
        <div
          ref={mobileTabsRef}
          className="flex gap-2 px-4 py-3 overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {MOBILE_TABS.map((tab) => {
            const TabIcon = tab.icon;
            const count = mobileStatusCounts[tab.id] || 0;
            const isActive = mobileActiveTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setMobileActiveTab(tab.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm transition-all active:scale-95 ${
                  isActive
                    ? `${tab.bgColor} ${tab.color} shadow-md`
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                <span>{tab.shortLabel}</span>
                <span className={`min-w-[20px] text-center px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  isActive ? 'bg-white/30 dark:bg-black/20' : 'bg-gray-200 dark:bg-slate-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Projekt-Liste */}
      <div className="px-4 py-4 space-y-3">
        {mobileProjekte.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 bg-gray-200 dark:bg-slate-800 rounded-full flex items-center justify-center">
              <Package className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-xl font-medium">Keine Projekte</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
              {suche ? 'Versuche einen anderen Suchbegriff' : 'In dieser Kategorie sind keine Projekte'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 px-1">
              {mobileProjekte.length} {mobileProjekte.length === 1 ? 'Projekt' : 'Projekte'}
              {suche && ' gefunden'}
            </p>
            {mobileProjekte.map((projekt) => (
              <MobileProjektCard
                key={(projekt as any).$id || projekt.id}
                projekt={projekt}
                onTap={() => onProjektClick(projekt)}
                onEdit={(e) => onEdit(e, projekt)}
                onDelete={(e) => onDelete(e, projekt)}
              />
            ))}
          </>
        )}
      </div>

      {/* Saving Overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
            <span className="text-gray-700 dark:text-gray-200 font-semibold text-lg">Speichere...</span>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal}

      {/* CSS for hiding scrollbar */}
      <style>{`
        .safe-top {
          padding-top: env(safe-area-inset-top);
        }
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default MobileProjektView;
