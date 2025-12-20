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
  Minus
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
  let statusIcon = <Minus className="w-8 h-8" />;
  let statusFarbe = 'text-blue-500';
  
  if (wert <= min) {
    status = 'alarm';
    statusIcon = <AlertTriangle className="w-8 h-8" />;
    statusFarbe = 'text-red-500';
  } else if (wert < min + (max - min) * 0.3) {
    status = 'warnung';
    statusIcon = <TrendingDown className="w-8 h-8" />;
    statusFarbe = 'text-orange-500';
  } else if (wert >= max) {
    status = 'optimal';
    statusIcon = <CheckCircle className="w-8 h-8" />;
    statusFarbe = 'text-green-500';
  } else if (wert >= max * 0.8) {
    status = 'gut';
    statusIcon = <TrendingUp className="w-8 h-8" />;
    statusFarbe = 'text-green-400';
  }

  return (
    <div className="group relative">
      {/* Outer glow effect */}
      <div className={`absolute -inset-1 bg-gradient-to-r ${farbe} rounded-3xl blur-lg opacity-25 group-hover:opacity-40 transition duration-300`}></div>
      
      {/* Card */}
      <div className="relative bg-white dark:bg-dark-surface rounded-3xl p-8 shadow-2xl dark:shadow-dark-xl hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-2 border border-transparent dark:border-dark-border">
        
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-5">
            <div className={`p-5 bg-gradient-to-br ${farbe} rounded-2xl shadow-xl`}>
              <Icon className="w-12 h-12 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-500 dark:text-dark-textMuted uppercase tracking-wide mb-2">{titel}</h3>
              <div className="flex items-baseline gap-3">
                <span className="text-6xl font-black text-gray-900 dark:text-dark-text">{wert}</span>
                <span className="text-2xl font-bold text-gray-500 dark:text-dark-textMuted">{einheit}</span>
              </div>
            </div>
          </div>
          <div className={`${statusFarbe} transition-colors duration-300`}>
            {statusIcon}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-3">
          <div className="flex justify-between text-base font-semibold text-gray-600 dark:text-dark-textMuted">
            <span>Min: {min}</span>
            <span className="text-xl font-bold text-gray-900 dark:text-dark-text">{clampedProzent.toFixed(0)}%</span>
            <span>Max: {max}</span>
          </div>

          <div className="relative h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
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
        <div className="mt-6 flex justify-end">
          <span className={`px-5 py-2 rounded-full text-base font-bold transition-colors ${
            status === 'alarm' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
            status === 'warnung' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
            status === 'gut' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
            'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          }`}>
            {status === 'alarm' ? '🚨 ALARM' :
             status === 'warnung' ? '⚠️ Warnung' :
             status === 'gut' ? '✓ Gut' :
             '★ Optimal'}
          </span>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [bearbeitenModus, setBearbeitenModus] = useState(false);
  const [editData, setEditData] = useState<LagerBestand | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await dashboardService.getDashboardStats();
      setStats(data);
      setEditData(data.lagerBestand);
    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Daten:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
    <div className="container mx-auto px-6 py-6 max-w-[98%]">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-6xl font-black text-gray-900 dark:text-dark-text mb-3">
              📊 Unternehmens-Dashboard
            </h1>
            <p className="text-2xl text-gray-600 dark:text-dark-textMuted font-medium">
              Alle wichtigen Kennzahlen auf einen Blick
            </p>
          </div>
          
          <button
            onClick={() => {
              if (bearbeitenModus) {
                setEditData(stats.lagerBestand);
              }
              setBearbeitenModus(!bearbeitenModus);
            }}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl text-lg font-bold shadow-xl transition-all duration-300 transform hover:-translate-y-1 hover:shadow-2xl ${
              bearbeitenModus 
                ? 'bg-gray-500 hover:bg-gray-600 text-white' 
                : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
            }`}
          >
            <Settings className="w-7 h-7" />
            {bearbeitenModus ? 'Abbrechen' : 'Bearbeiten'}
          </button>
        </div>
      </div>

      {bearbeitenModus && editData ? (
        /* Bearbeitungsmodus */
        <div className="bg-white dark:bg-dark-surface rounded-3xl shadow-2xl dark:shadow-dark-xl p-10 mb-10 border border-transparent dark:border-dark-border">
          <h2 className="text-4xl font-black text-gray-900 dark:text-dark-text mb-8">📝 Lagerbestand bearbeiten</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Ziegelschutt */}
            <div className="space-y-5 p-8 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl">
              <h3 className="text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-3">
                <Package className="w-7 h-7 text-purple-600 dark:text-purple-400" />
                Ziegelschutt
              </h3>
              <div>
                <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Aktueller Bestand (Tonnen)</label>
                <input
                  type="number"
                  value={editData.ziegelschutt}
                  onChange={(e) => setEditData({ ...editData, ziegelschutt: Number(e.target.value) })}
                  className="w-full px-5 py-3 text-xl border-2 border-purple-200 dark:border-purple-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Minimum</label>
                  <input
                    type="number"
                    value={editData.ziegelschuttMin}
                    onChange={(e) => setEditData({ ...editData, ziegelschuttMin: Number(e.target.value) })}
                    className="w-full px-5 py-3 text-xl border-2 border-purple-200 dark:border-purple-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Maximum</label>
                  <input
                    type="number"
                    value={editData.ziegelschuttMax}
                    onChange={(e) => setEditData({ ...editData, ziegelschuttMax: Number(e.target.value) })}
                    className="w-full px-5 py-3 text-xl border-2 border-purple-200 dark:border-purple-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Ziegelmehl Schüttware */}
            <div className="space-y-5 p-8 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-2xl">
              <h3 className="text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-3">
                <Boxes className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                Ziegelmehl Schüttware
              </h3>
              <div>
                <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Aktueller Bestand (Tonnen)</label>
                <input
                  type="number"
                  value={editData.ziegelmehlSchuettware}
                  onChange={(e) => setEditData({ ...editData, ziegelmehlSchuettware: Number(e.target.value) })}
                  className="w-full px-5 py-3 text-xl border-2 border-blue-200 dark:border-blue-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Minimum</label>
                  <input
                    type="number"
                    value={editData.ziegelmehlSchuettwareMin}
                    onChange={(e) => setEditData({ ...editData, ziegelmehlSchuettwareMin: Number(e.target.value) })}
                    className="w-full px-5 py-3 text-xl border-2 border-blue-200 dark:border-blue-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Maximum</label>
                  <input
                    type="number"
                    value={editData.ziegelmehlSchuettwareMax}
                    onChange={(e) => setEditData({ ...editData, ziegelmehlSchuettwareMax: Number(e.target.value) })}
                    className="w-full px-5 py-3 text-xl border-2 border-blue-200 dark:border-blue-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Ziegelmehl Sackware */}
            <div className="space-y-5 p-8 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl">
              <h3 className="text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-3">
                <ShoppingBag className="w-7 h-7 text-green-600 dark:text-green-400" />
                Ziegelmehl Sackware
              </h3>
              <div>
                <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Aktueller Bestand (Paletten)</label>
                <input
                  type="number"
                  value={editData.ziegelmehlSackware}
                  onChange={(e) => setEditData({ ...editData, ziegelmehlSackware: Number(e.target.value) })}
                  className="w-full px-5 py-3 text-xl border-2 border-green-200 dark:border-green-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Minimum</label>
                  <input
                    type="number"
                    value={editData.ziegelmehlSackwareMin}
                    onChange={(e) => setEditData({ ...editData, ziegelmehlSackwareMin: Number(e.target.value) })}
                    className="w-full px-5 py-3 text-xl border-2 border-green-200 dark:border-green-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Maximum</label>
                  <input
                    type="number"
                    value={editData.ziegelmehlSackwareMax}
                    onChange={(e) => setEditData({ ...editData, ziegelmehlSackwareMax: Number(e.target.value) })}
                    className="w-full px-5 py-3 text-xl border-2 border-green-200 dark:border-green-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Hammer */}
            <div className="space-y-5 p-8 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-2xl">
              <h3 className="text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-3">
                <Hammer className="w-7 h-7 text-orange-600 dark:text-orange-400" />
                Hammer auf Lager
              </h3>
              <div>
                <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Aktueller Bestand (Stück)</label>
                <input
                  type="number"
                  value={editData.hammerBestand}
                  onChange={(e) => setEditData({ ...editData, hammerBestand: Number(e.target.value) })}
                  className="w-full px-5 py-3 text-xl border-2 border-orange-200 dark:border-orange-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Minimum</label>
                  <input
                    type="number"
                    value={editData.hammerBestandMin}
                    onChange={(e) => setEditData({ ...editData, hammerBestandMin: Number(e.target.value) })}
                    className="w-full px-5 py-3 text-xl border-2 border-orange-200 dark:border-orange-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Maximum</label>
                  <input
                    type="number"
                    value={editData.hammerBestandMax}
                    onChange={(e) => setEditData({ ...editData, hammerBestandMax: Number(e.target.value) })}
                    className="w-full px-5 py-3 text-xl border-2 border-orange-200 dark:border-orange-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Anstehende Auslieferungen */}
            <div className="space-y-5 p-8 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl md:col-span-2">
              <h3 className="text-2xl font-black text-gray-900 dark:text-dark-text flex items-center gap-3">
                <Truck className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                Anstehende Auslieferungen (nächste 7 Tage)
              </h3>
              <div>
                <label className="block text-lg font-bold text-gray-700 dark:text-dark-textMuted mb-3">Anzahl Bestellungen</label>
                <input
                  type="number"
                  value={editData.anstehendeAuslieferungen}
                  onChange={(e) => setEditData({ ...editData, anstehendeAuslieferungen: Number(e.target.value) })}
                  className="w-full px-5 py-3 text-xl border-2 border-indigo-200 dark:border-indigo-700 rounded-xl bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-6 mt-10">
            <button
              onClick={() => {
                setEditData(stats.lagerBestand);
                setBearbeitenModus(false);
              }}
              className="px-8 py-4 text-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-dark-text font-bold rounded-2xl transition-colors shadow-lg"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSpeichern}
              disabled={loading}
              className="px-8 py-4 text-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-2xl shadow-xl transition-all duration-300 transform hover:-translate-y-1 disabled:opacity-50"
            >
              {loading ? 'Speichert...' : '💾 Speichern'}
            </button>
          </div>
        </div>
      ) : (
        /* Ansichtsmodus */
        <>
          {/* Lagerbestand Kennzahlen */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
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

          {/* Anstehende Auslieferungen */}
          <div className="group relative mt-10">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-3xl blur-lg opacity-25 group-hover:opacity-40 transition duration-300"></div>
            <div className="relative bg-white dark:bg-dark-surface rounded-3xl p-10 shadow-2xl dark:shadow-dark-xl hover:shadow-3xl transition-all duration-300 border border-transparent dark:border-dark-border">
              <div className="flex items-center gap-6">
                <div className="p-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-xl">
                  <Truck className="w-16 h-16 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-500 dark:text-dark-textMuted uppercase tracking-wide">
                    Anstehende Auslieferungen
                  </h3>
                  <p className="text-3xl text-gray-600 dark:text-dark-textMuted mt-2 font-semibold">
                    Nächste 7 Tage
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-8xl font-black text-gray-900 dark:text-dark-text">
                    {stats.lagerBestand.anstehendeAuslieferungen}
                  </div>
                  <div className="text-xl text-gray-500 dark:text-dark-textMuted mt-2 font-bold">
                    Bestellungen
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Letzte Aktualisierung */}
          {stats.lagerBestand.letztesUpdate && (
            <div className="mt-8 text-center text-lg text-gray-500 dark:text-dark-textMuted font-medium">
              Letzte Aktualisierung: {new Date(stats.lagerBestand.letztesUpdate).toLocaleString('de-DE')}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
