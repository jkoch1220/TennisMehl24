import { useState, useEffect } from 'react';
import {
  Package,
  Boxes,
  ShoppingBag,
  Truck,
  Hammer,
  Settings,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Minus,
  Scale,
  FileText,
  Euro,
  Mail,
  ClipboardList,
  Factory,
  ShoppingCart
} from 'lucide-react';
import { dashboardService } from '../../services/dashboardService';
import type { LagerBestand, DashboardStats } from '../../types/dashboard';

interface KennzahlKarteProps {
  titel: string;
  wert: number;
  einheit: string;
  min: number;
  max: number;
  icon: React.ElementType;
  farbe: string;
}

const KennzahlKarte = ({ titel, wert, einheit, min, max, icon: Icon, farbe }: KennzahlKarteProps) => {
  // Berechne Prozentsatz und Status
  const prozent = ((wert - min) / (max - min)) * 100;
  const clampedProzent = Math.max(0, Math.min(100, prozent));

  let status: 'alarm' | 'warnung' | 'gut' | 'optimal' = 'gut';
  let statusIcon = <Minus className="w-6 h-6 sm:w-8 sm:h-8" />;
  let statusFarbe = 'text-blue-500';

  if (wert <= min) {
    status = 'alarm';
    statusIcon = <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8" />;
    statusFarbe = 'text-red-500';
  } else if (wert < min + (max - min) * 0.3) {
    status = 'warnung';
    statusIcon = <TrendingDown className="w-6 h-6 sm:w-8 sm:h-8" />;
    statusFarbe = 'text-orange-500';
  } else if (wert >= max) {
    status = 'optimal';
    statusIcon = <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8" />;
    statusFarbe = 'text-green-500';
  } else if (wert >= max * 0.8) {
    status = 'gut';
    statusIcon = <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8" />;
    statusFarbe = 'text-green-400';
  }

  return (
    <div className="group relative">
      {/* Outer glow effect - versteckt auf Mobile für Performance */}
      <div className={`hidden sm:block absolute -inset-1 bg-gradient-to-r ${farbe} rounded-3xl blur-lg opacity-25 group-hover:opacity-40 transition duration-300`}></div>

      {/* Card */}
      <div className="relative bg-white dark:bg-dark-surface rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-lg sm:shadow-2xl dark:shadow-dark-xl hover:shadow-xl sm:hover:shadow-3xl transition-all duration-300 sm:transform sm:hover:-translate-y-2 border border-gray-100 dark:border-dark-border">

        {/* Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-8">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className={`p-3 sm:p-5 bg-gradient-to-br ${farbe} rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl`}>
              <Icon className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
            </div>
            <div>
              <h3 className="text-xs sm:text-lg font-bold text-gray-500 dark:text-dark-textMuted uppercase tracking-wide mb-1 sm:mb-2">{titel}</h3>
              <div className="flex items-baseline gap-1 sm:gap-3">
                <span className="text-3xl sm:text-6xl font-black text-gray-900 dark:text-dark-text">{wert}</span>
                <span className="text-sm sm:text-2xl font-bold text-gray-500 dark:text-dark-textMuted">{einheit}</span>
              </div>
            </div>
          </div>
          <div className={`${statusFarbe} transition-colors duration-300`}>
            {statusIcon}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2 sm:space-y-3">
          <div className="flex justify-between text-xs sm:text-base font-semibold text-gray-600 dark:text-dark-textMuted">
            <span>Min: {min}</span>
            <span className="text-sm sm:text-xl font-bold text-gray-900 dark:text-dark-text">{clampedProzent.toFixed(0)}%</span>
            <span>Max: {max}</span>
          </div>

          <div className="relative h-4 sm:h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-red-100 dark:from-red-900/30 via-yellow-100 dark:via-yellow-900/30 to-green-100 dark:to-green-900/30"></div>

            {/* Progress fill with animation */}
            <div
              className={`absolute inset-y-0 left-0 bg-gradient-to-r ${
                status === 'alarm' ? 'from-red-500 to-red-600' :
                status === 'warnung' ? 'from-orange-500 to-orange-600' :
                status === 'gut' ? 'from-blue-500 to-blue-600' :
                'from-green-500 to-green-600'
              } shadow-lg transition-all duration-1000 ease-out`}
              style={{ width: `${clampedProzent}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent"></div>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="mt-4 sm:mt-6 flex justify-end">
          <span className={`px-3 sm:px-5 py-1 sm:py-2 rounded-full text-xs sm:text-base font-bold transition-colors ${
            status === 'alarm' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
            status === 'warnung' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
            status === 'gut' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
            'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          }`}>
            {status === 'alarm' ? 'ALARM' :
             status === 'warnung' ? 'Warnung' :
             status === 'gut' ? 'Gut' :
             'Optimal'}
          </span>
        </div>
      </div>
    </div>
  );
};

// Einfache Statistik-Karte für Projekt-Daten
interface StatKarteProps {
  titel: string;
  wert: number | string;
  einheit?: string;
  icon: React.ElementType;
  farbe: string;
  untertitel?: string;
}

const StatKarte = ({ titel, wert, einheit, icon: Icon, farbe, untertitel }: StatKarteProps) => {
  return (
    <div className="group relative">
      <div className={`hidden sm:block absolute -inset-1 bg-gradient-to-r ${farbe} rounded-2xl blur-lg opacity-20 group-hover:opacity-35 transition duration-300`}></div>
      <div className="relative bg-white dark:bg-dark-surface rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg dark:shadow-dark-lg hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-dark-border">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`p-2 sm:p-3 bg-gradient-to-br ${farbe} rounded-lg sm:rounded-xl shadow-lg`}>
            <Icon className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-gray-500 dark:text-dark-textMuted uppercase tracking-wide truncate">{titel}</h3>
            <div className="flex items-baseline gap-1 sm:gap-2 mt-1">
              <span className="text-xl sm:text-3xl font-black text-gray-900 dark:text-dark-text">{wert}</span>
              {einheit && <span className="text-sm sm:text-lg font-bold text-gray-500 dark:text-dark-textMuted">{einheit}</span>}
            </div>
            {untertitel && (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-textMuted mt-1">{untertitel}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Warnung-Komponente für Kapazitätsüberschreitung
interface KapazitaetsWarnungProps {
  verfuegbar: number;
  angeboten: number;
  bestellt: number;
  verkauft: number;
}

const KapazitaetsWarnung = ({ verfuegbar, angeboten, bestellt, verkauft }: KapazitaetsWarnungProps) => {
  const gesamtBedarf = angeboten + bestellt + verkauft;
  const ueberschreitung = gesamtBedarf - verfuegbar;
  const istUeberschritten = ueberschreitung > 0;
  const auslastungProzent = verfuegbar > 0 ? Math.round((gesamtBedarf / verfuegbar) * 100) : 0;

  if (!verfuegbar || verfuegbar <= 0) return null;

  return (
    <div className={`relative rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border-2 ${
      istUeberschritten
        ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
        : auslastungProzent >= 80
          ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
          : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
    }`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl ${
          istUeberschritten
            ? 'bg-red-500'
            : auslastungProzent >= 80
              ? 'bg-orange-500'
              : 'bg-green-500'
        }`}>
          <Factory className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
        </div>
        <div className="flex-1">
          <h3 className={`text-sm sm:text-lg font-bold ${
            istUeberschritten
              ? 'text-red-800 dark:text-red-300'
              : auslastungProzent >= 80
                ? 'text-orange-800 dark:text-orange-300'
                : 'text-green-800 dark:text-green-300'
          }`}>
            {istUeberschritten ? 'Kapazität überschritten!' : auslastungProzent >= 80 ? 'Hohe Auslastung' : 'Kapazität verfügbar'}
          </h3>
          <div className="mt-2 space-y-1 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-dark-textMuted">Verfügbare Tonnen:</span>
              <span className="font-bold text-gray-900 dark:text-dark-text">{verfuegbar.toLocaleString('de-DE')} t</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-dark-textMuted">Gesamtbedarf (Angebot + Bestellt + Verkauft):</span>
              <span className="font-bold text-gray-900 dark:text-dark-text">{gesamtBedarf.toLocaleString('de-DE')} t</span>
            </div>
            {istUeberschritten && (
              <div className="flex justify-between text-red-700 dark:text-red-400 font-bold">
                <span>Mehr produzieren:</span>
                <span>+{ueberschreitung.toLocaleString('de-DE')} t</span>
              </div>
            )}
          </div>
          {/* Progress Bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-gray-500 dark:text-dark-textMuted">Auslastung</span>
              <span className={`font-bold ${
                istUeberschritten ? 'text-red-600 dark:text-red-400' : auslastungProzent >= 80 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'
              }`}>{auslastungProzent}%</span>
            </div>
            <div className="h-2 sm:h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  istUeberschritten ? 'bg-red-500' : auslastungProzent >= 80 ? 'bg-orange-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(auslastungProzent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Geld formatieren
const formatEuro = (betrag: number): string => {
  return betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [bearbeitenModus, setBearbeitenModus] = useState(false);
  const [editData, setEditData] = useState<LagerBestand | null>(null);
  const [saisonjahr, setSaisonjahr] = useState(2026); // Aktuelle Saison

  const loadData = async (jahr?: number) => {
    try {
      setLoading(true);
      const data = await dashboardService.getDashboardStats(jahr || saisonjahr);
      setStats(data);
      setEditData(data.lagerBestand);
    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Daten:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(saisonjahr);
  }, [saisonjahr]);

  const handleJahrWechsel = (neuesJahr: number) => {
    setSaisonjahr(neuesJahr);
  };

  const handleSpeichern = async () => {
    if (!editData) return;
    
    try {
      setLoading(true);
      await dashboardService.updateLagerBestand(editData);
      await loadData();
      setBearbeitenModus(false);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Daten');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600 dark:border-red-400 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-dark-textMuted text-lg">Dashboard wird geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="container mx-auto px-3 sm:px-6 py-4 sm:py-6 max-w-[98%]">
      {/* Header */}
      <div className="mb-6 sm:mb-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl lg:text-6xl font-black text-gray-900 dark:text-dark-text mb-1 sm:mb-3">
              <span className="hidden sm:inline">📊 </span>Dashboard
            </h1>
            <p className="text-sm sm:text-xl lg:text-2xl text-gray-600 dark:text-dark-textMuted font-medium">
              Alle wichtigen Kennzahlen auf einen Blick
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Jahresauswahl */}
            <select
              value={saisonjahr}
              onChange={(e) => handleJahrWechsel(Number(e.target.value))}
              className="px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-lg font-bold bg-white dark:bg-dark-surface border-2 border-gray-200 dark:border-dark-border rounded-xl shadow-lg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value={2024}>Saison 2024</option>
              <option value={2025}>Saison 2025</option>
              <option value={2026}>Saison 2026</option>
              <option value={2027}>Saison 2027</option>
            </select>

            <button
              onClick={() => {
                if (bearbeitenModus) {
                  setEditData(stats.lagerBestand);
                }
                setBearbeitenModus(!bearbeitenModus);
              }}
              className={`flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl text-sm sm:text-lg font-bold shadow-lg sm:shadow-xl transition-all duration-300 sm:transform sm:hover:-translate-y-1 sm:hover:shadow-2xl active:scale-95 ${
                bearbeitenModus
                  ? 'bg-gray-500 hover:bg-gray-600 text-white'
                  : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
              }`}
            >
              <Settings className="w-5 h-5 sm:w-7 sm:h-7" />
              {bearbeitenModus ? 'Abbrechen' : 'Bearbeiten'}
            </button>
          </div>
        </div>
      </div>

      {bearbeitenModus && editData ? (
        /* Bearbeitungsmodus */
        <div className="bg-white dark:bg-dark-surface rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl dark:shadow-dark-xl p-4 sm:p-10 mb-6 sm:mb-10 border border-gray-100 dark:border-dark-border">
          <h2 className="text-xl sm:text-4xl font-black text-gray-900 dark:text-dark-text mb-4 sm:mb-8">Lagerbestand bearbeiten</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-10">
            {/* Ziegelschutt */}
            <div className="space-y-3 sm:space-y-5 p-4 sm:p-8 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl sm:rounded-2xl">
              <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-2 sm:gap-3">
                <Package className="w-5 h-5 sm:w-7 sm:h-7 text-purple-600 dark:text-purple-400" />
                Ziegelschutt
              </h3>
              <div>
                <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Aktueller Bestand (Tonnen)</label>
                <input
                  type="number"
                  value={editData.ziegelschutt}
                  onChange={(e) => setEditData({ ...editData, ziegelschutt: Number(e.target.value) })}
                  className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-purple-200 dark:border-purple-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-5">
                <div>
                  <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Minimum</label>
                  <input
                    type="number"
                    value={editData.ziegelschuttMin}
                    onChange={(e) => setEditData({ ...editData, ziegelschuttMin: Number(e.target.value) })}
                    className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-purple-200 dark:border-purple-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Maximum</label>
                  <input
                    type="number"
                    value={editData.ziegelschuttMax}
                    onChange={(e) => setEditData({ ...editData, ziegelschuttMax: Number(e.target.value) })}
                    className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-purple-200 dark:border-purple-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Ziegelmehl Schüttware */}
            <div className="space-y-3 sm:space-y-5 p-4 sm:p-8 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl sm:rounded-2xl">
              <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-2 sm:gap-3">
                <Boxes className="w-5 h-5 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">Ziegelmehl </span>Schüttware
              </h3>
              <div>
                <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Bestand (Tonnen)</label>
                <input
                  type="number"
                  value={editData.ziegelmehlSchuettware}
                  onChange={(e) => setEditData({ ...editData, ziegelmehlSchuettware: Number(e.target.value) })}
                  className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-blue-200 dark:border-blue-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-5">
                <div>
                  <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Min</label>
                  <input
                    type="number"
                    value={editData.ziegelmehlSchuettwareMin}
                    onChange={(e) => setEditData({ ...editData, ziegelmehlSchuettwareMin: Number(e.target.value) })}
                    className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-blue-200 dark:border-blue-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Max</label>
                  <input
                    type="number"
                    value={editData.ziegelmehlSchuettwareMax}
                    onChange={(e) => setEditData({ ...editData, ziegelmehlSchuettwareMax: Number(e.target.value) })}
                    className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-blue-200 dark:border-blue-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Ziegelmehl Sackware */}
            <div className="space-y-3 sm:space-y-5 p-4 sm:p-8 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl sm:rounded-2xl">
              <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-2 sm:gap-3">
                <ShoppingBag className="w-5 h-5 sm:w-7 sm:h-7 text-green-600 dark:text-green-400" />
                <span className="hidden sm:inline">Ziegelmehl </span>Sackware
              </h3>
              <div>
                <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Bestand (Paletten)</label>
                <input
                  type="number"
                  value={editData.ziegelmehlSackware}
                  onChange={(e) => setEditData({ ...editData, ziegelmehlSackware: Number(e.target.value) })}
                  className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-green-200 dark:border-green-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-5">
                <div>
                  <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Min</label>
                  <input
                    type="number"
                    value={editData.ziegelmehlSackwareMin}
                    onChange={(e) => setEditData({ ...editData, ziegelmehlSackwareMin: Number(e.target.value) })}
                    className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-green-200 dark:border-green-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Max</label>
                  <input
                    type="number"
                    value={editData.ziegelmehlSackwareMax}
                    onChange={(e) => setEditData({ ...editData, ziegelmehlSackwareMax: Number(e.target.value) })}
                    className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-green-200 dark:border-green-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Hammer */}
            <div className="space-y-3 sm:space-y-5 p-4 sm:p-8 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl sm:rounded-2xl">
              <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-2 sm:gap-3">
                <Hammer className="w-5 h-5 sm:w-7 sm:h-7 text-orange-600 dark:text-orange-400" />
                Hammer
              </h3>
              <div>
                <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Bestand (Stück)</label>
                <input
                  type="number"
                  value={editData.hammerBestand}
                  onChange={(e) => setEditData({ ...editData, hammerBestand: Number(e.target.value) })}
                  className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-orange-200 dark:border-orange-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-5">
                <div>
                  <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Min</label>
                  <input
                    type="number"
                    value={editData.hammerBestandMin}
                    onChange={(e) => setEditData({ ...editData, hammerBestandMin: Number(e.target.value) })}
                    className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-orange-200 dark:border-orange-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Max</label>
                  <input
                    type="number"
                    value={editData.hammerBestandMax}
                    onChange={(e) => setEditData({ ...editData, hammerBestandMax: Number(e.target.value) })}
                    className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-orange-200 dark:border-orange-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Anstehende Auslieferungen */}
            <div className="space-y-3 sm:space-y-5 p-4 sm:p-8 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl sm:rounded-2xl">
              <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-2 sm:gap-3">
                <Truck className="w-5 h-5 sm:w-7 sm:h-7 text-indigo-600 dark:text-indigo-400" />
                Auslieferungen <span className="hidden sm:inline">(7 Tage)</span>
              </h3>
              <div>
                <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Anzahl Bestellungen</label>
                <input
                  type="number"
                  value={editData.anstehendeAuslieferungen}
                  onChange={(e) => setEditData({ ...editData, anstehendeAuslieferungen: Number(e.target.value) })}
                  className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-indigo-200 dark:border-indigo-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Verfügbare Tonnen für Kapazitätswarnung */}
            <div className="space-y-3 sm:space-y-5 p-4 sm:p-8 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 rounded-xl sm:rounded-2xl">
              <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-2 sm:gap-3">
                <Factory className="w-5 h-5 sm:w-7 sm:h-7 text-red-600 dark:text-red-400" />
                Kapazität <span className="hidden sm:inline">(Saison)</span>
              </h3>
              <div>
                <label className="block text-sm sm:text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-2 sm:mb-3">Verfügbare Tonnen für aktuelle Saison</label>
                <input
                  type="number"
                  value={editData.verfuegbareTonnen || 0}
                  onChange={(e) => setEditData({ ...editData, verfuegbareTonnen: Number(e.target.value) })}
                  className="w-full px-3 sm:px-5 py-2 sm:py-3 text-base sm:text-xl border-2 border-red-200 dark:border-red-700 rounded-lg sm:rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="z.B. 5000"
                />
                <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-textMuted mt-2">
                  Wird für die Kapazitätswarnung im Dashboard verwendet. Wenn Angebote + Bestellungen + Verkäufe diese Menge überschreiten, erscheint eine Warnung.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-6 mt-6 sm:mt-10">
            <button
              onClick={() => {
                setEditData(stats.lagerBestand);
                setBearbeitenModus(false);
              }}
              className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-dark-text font-bold rounded-xl sm:rounded-2xl transition-colors shadow-lg active:scale-95"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSpeichern}
              disabled={loading}
              className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-xl sm:rounded-2xl shadow-xl transition-all duration-300 sm:transform sm:hover:-translate-y-1 disabled:opacity-50 active:scale-95"
            >
              {loading ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
        </div>
      ) : (
        /* Ansichtsmodus */
        <>
          {/* Kapazitäts-Warnung */}
          {stats.lagerBestand.verfuegbareTonnen && stats.lagerBestand.verfuegbareTonnen > 0 && (
            <div className="mb-6 sm:mb-8">
              <KapazitaetsWarnung
                verfuegbar={stats.lagerBestand.verfuegbareTonnen}
                angeboten={stats.projektStats.angebotTonnen}
                bestellt={stats.projektStats.bestellteTonnen}
                verkauft={stats.projektStats.verkaufteTonnen}
              />
            </div>
          )}

          {/* Saison-Header */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-dark-text mb-2">
              Saison {stats.saisonjahr}
            </h2>
          </div>

          {/* Projekt-Statistiken: Tonnen */}
          <div className="mb-6 sm:mb-10">
            <h3 className="text-sm sm:text-lg font-bold text-gray-600 dark:text-dark-textMuted mb-3 sm:mb-4 flex items-center gap-2">
              <Scale className="w-4 h-4 sm:w-5 sm:h-5" />
              Mengen (Tonnen)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              <StatKarte
                titel="Angefragt"
                wert={stats.projektStats.angebotTonnen.toLocaleString('de-DE')}
                einheit="t"
                icon={FileText}
                farbe="from-blue-500 to-indigo-500"
                untertitel={`${stats.projektStats.anzahlAngebote} Angebote`}
              />
              <StatKarte
                titel="Bestellt"
                wert={stats.projektStats.bestellteTonnen.toLocaleString('de-DE')}
                einheit="t"
                icon={ShoppingCart}
                farbe="from-amber-500 to-orange-500"
                untertitel={`${stats.projektStats.anzahlBestellungen} Bestellungen`}
              />
              <StatKarte
                titel="Verkauft"
                wert={stats.projektStats.verkaufteTonnen.toLocaleString('de-DE')}
                einheit="t"
                icon={CheckCircle}
                farbe="from-green-500 to-emerald-500"
                untertitel={`${stats.projektStats.anzahlBezahlt} bezahlt`}
              />
            </div>
          </div>

          {/* Projekt-Statistiken: Geld */}
          <div className="mb-6 sm:mb-10">
            <h3 className="text-sm sm:text-lg font-bold text-gray-600 dark:text-dark-textMuted mb-3 sm:mb-4 flex items-center gap-2">
              <Euro className="w-4 h-4 sm:w-5 sm:h-5" />
              Umsatz
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              <StatKarte
                titel="In Angeboten"
                wert={formatEuro(stats.projektStats.angebotsSumme)}
                einheit="€"
                icon={FileText}
                farbe="from-blue-400 to-blue-600"
              />
              <StatKarte
                titel="Bestellt"
                wert={formatEuro(stats.projektStats.bestellSumme)}
                einheit="€"
                icon={ClipboardList}
                farbe="from-amber-400 to-amber-600"
              />
              <StatKarte
                titel="Bezahlt"
                wert={formatEuro(stats.projektStats.bezahlteSumme)}
                einheit="€"
                icon={Euro}
                farbe="from-green-400 to-green-600"
              />
            </div>
          </div>

          {/* Projekt-Statistiken: Gewinn (DB1) */}
          <div className="mb-6 sm:mb-10">
            <h3 className="text-sm sm:text-lg font-bold text-gray-600 dark:text-dark-textMuted mb-3 sm:mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
              Gewinn (DB1)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              <StatKarte
                titel="In Angeboten"
                wert={formatEuro(stats.projektStats.angebotDB1)}
                einheit="€"
                icon={FileText}
                farbe="from-indigo-400 to-indigo-600"
                untertitel={stats.projektStats.angebotsSumme > 0 ? `${((stats.projektStats.angebotDB1 / stats.projektStats.angebotsSumme) * 100).toFixed(1)}% Marge` : undefined}
              />
              <StatKarte
                titel="Bestellt"
                wert={formatEuro(stats.projektStats.bestellDB1)}
                einheit="€"
                icon={ClipboardList}
                farbe="from-purple-400 to-purple-600"
                untertitel={stats.projektStats.bestellSumme > 0 ? `${((stats.projektStats.bestellDB1 / stats.projektStats.bestellSumme) * 100).toFixed(1)}% Marge` : undefined}
              />
              <StatKarte
                titel="Bezahlt"
                wert={formatEuro(stats.projektStats.bezahltDB1)}
                einheit="€"
                icon={TrendingUp}
                farbe="from-emerald-400 to-emerald-600"
                untertitel={stats.projektStats.bezahlteSumme > 0 ? `${((stats.projektStats.bezahltDB1 / stats.projektStats.bezahlteSumme) * 100).toFixed(1)}% Marge` : undefined}
              />
            </div>
          </div>

          {/* Anfragen */}
          <div className="mb-6 sm:mb-10">
            <h3 className="text-sm sm:text-lg font-bold text-gray-600 dark:text-dark-textMuted mb-3 sm:mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
              E-Mail Anfragen
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
              <StatKarte
                titel="Gesamt"
                wert={stats.anfragenStats.anzahlGesamt}
                icon={Mail}
                farbe="from-teal-500 to-cyan-500"
              />
              <StatKarte
                titel="Neu"
                wert={stats.anfragenStats.anzahlNeu}
                icon={AlertTriangle}
                farbe="from-red-500 to-pink-500"
              />
              <StatKarte
                titel="Zugeordnet"
                wert={stats.anfragenStats.anzahlZugeordnet}
                icon={CheckCircle}
                farbe="from-yellow-500 to-amber-500"
              />
              <StatKarte
                titel="Angefragt (t)"
                wert={stats.anfragenStats.angefrgteTonnenGesamt.toLocaleString('de-DE')}
                einheit="t"
                icon={Scale}
                farbe="from-purple-500 to-violet-500"
              />
            </div>
          </div>

          {/* Verloren Info */}
          {stats.projektStats.anzahlVerloren > 0 && (
            <div className="mb-6 sm:mb-10 p-4 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-dark-textMuted">
                <span className="font-bold text-gray-900 dark:text-dark-text">{stats.projektStats.anzahlVerloren}</span> Projekte als verloren markiert
              </p>
            </div>
          )}

          {/* Lagerbestand Kennzahlen */}
          <div className="mb-6 sm:mb-10">
            <h3 className="text-sm sm:text-lg font-bold text-gray-600 dark:text-dark-textMuted mb-3 sm:mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 sm:w-5 sm:h-5" />
              Lagerbestand
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
              <KennzahlKarte
                titel="Ziegelschutt"
                wert={stats.lagerBestand.ziegelschutt}
                einheit="Tonnen"
                min={stats.lagerBestand.ziegelschuttMin}
                max={stats.lagerBestand.ziegelschuttMax}
                icon={Package}
                farbe="from-purple-500 to-pink-500"
              />

              <KennzahlKarte
                titel="Ziegelmehl Schüttware"
                wert={stats.lagerBestand.ziegelmehlSchuettware}
                einheit="Tonnen"
                min={stats.lagerBestand.ziegelmehlSchuettwareMin}
                max={stats.lagerBestand.ziegelmehlSchuettwareMax}
                icon={Boxes}
                farbe="from-blue-500 to-cyan-500"
              />

              <KennzahlKarte
                titel="Ziegelmehl Sackware"
                wert={stats.lagerBestand.ziegelmehlSackware}
                einheit="Paletten"
                min={stats.lagerBestand.ziegelmehlSackwareMin}
                max={stats.lagerBestand.ziegelmehlSackwareMax}
                icon={ShoppingBag}
                farbe="from-green-500 to-emerald-500"
              />

              <KennzahlKarte
                titel="Hammer auf Lager"
                wert={stats.lagerBestand.hammerBestand}
                einheit="Stück"
                min={stats.lagerBestand.hammerBestandMin}
                max={stats.lagerBestand.hammerBestandMax}
                icon={Hammer}
                farbe="from-orange-500 to-red-500"
              />
            </div>
          </div>

          {/* Anstehende Auslieferungen */}
          <div className="group relative mt-6 sm:mt-10">
            <div className="hidden sm:block absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-3xl blur-lg opacity-25 group-hover:opacity-40 transition duration-300"></div>
            <div className="relative bg-white dark:bg-dark-surface rounded-2xl sm:rounded-3xl p-4 sm:p-10 shadow-lg sm:shadow-2xl dark:shadow-dark-xl hover:shadow-xl sm:hover:shadow-3xl transition-all duration-300 border border-gray-100 dark:border-dark-border">
              <div className="flex items-center gap-3 sm:gap-6">
                <div className="p-3 sm:p-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl">
                  <Truck className="w-8 h-8 sm:w-16 sm:h-16 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs sm:text-xl font-bold text-gray-500 dark:text-dark-textMuted uppercase tracking-wide">
                    <span className="hidden sm:inline">Anstehende </span>Auslieferungen
                  </h3>
                  <p className="text-sm sm:text-3xl text-gray-600 dark:text-dark-textMuted mt-1 sm:mt-2 font-semibold">
                    Nächste 7 Tage
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-4xl sm:text-8xl font-black text-gray-900 dark:text-dark-text">
                    {stats.lagerBestand.anstehendeAuslieferungen}
                  </div>
                  <div className="text-xs sm:text-xl text-gray-500 dark:text-dark-textMuted mt-1 sm:mt-2 font-bold">
                    Bestellungen
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Letzte Aktualisierung */}
          {stats.lagerBestand.letztesUpdate && (
            <div className="mt-4 sm:mt-8 text-center text-xs sm:text-lg text-gray-500 dark:text-dark-textMuted font-medium">
              Aktualisiert: {new Date(stats.lagerBestand.letztesUpdate).toLocaleString('de-DE')}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
