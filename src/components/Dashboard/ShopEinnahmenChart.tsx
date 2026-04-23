import { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ShoppingCart, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { shopBestellungService, ShopBestellung } from '../../services/shopBestellungService';

type Zeitraum = '6m' | '12m' | '24m' | 'all';
type Basis = 'netto' | 'brutto';

interface MonatEintrag {
  monatKey: string; // YYYY-MM
  label: string;    // z.B. "Mär 26"
  umsatz: number;
  anzahl: number;
}

const formatEuro = (betrag: number): string =>
  betrag.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const formatEuroExakt = (betrag: number): string =>
  betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONAT_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const monatKeyFromDatum = (isoDate: string): string | null => {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const labelFromKey = (key: string): string => {
  const [jahr, monat] = key.split('-');
  const m = parseInt(monat, 10) - 1;
  return `${MONAT_KURZ[m]} ${jahr.slice(2)}`;
};

const ShopEinnahmenChart = () => {
  const [bestellungen, setBestellungen] = useState<ShopBestellung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zeitraum, setZeitraum] = useState<Zeitraum>('12m');
  const [basis, setBasis] = useState<Basis>('netto');
  const [inkludiereStornos, setInkludiereStornos] = useState(false);

  const backendVerfuegbar = shopBestellungService.isBackendAvailable();

  const ladeDaten = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await shopBestellungService.ladeBestellungen();
      setBestellungen(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (backendVerfuegbar) {
      ladeDaten();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monatsDaten = useMemo<MonatEintrag[]>(() => {
    if (bestellungen.length === 0) return [];

    const bucket = new Map<string, { umsatz: number; anzahl: number }>();

    for (const b of bestellungen) {
      if (!inkludiereStornos && b.status === 'storniert') continue;
      const key = monatKeyFromDatum(b.bestelldatum);
      if (!key) continue;
      const wert = basis === 'netto' ? (b.summeNetto ?? 0) : (b.summeBrutto ?? 0);
      const existing = bucket.get(key) ?? { umsatz: 0, anzahl: 0 };
      existing.umsatz += wert;
      existing.anzahl += 1;
      bucket.set(key, existing);
    }

    // In den Zeitraum passende fortlaufende Monate erzeugen (auch leere)
    const jetzt = new Date();
    jetzt.setDate(1);
    const startDatum = new Date(jetzt);

    if (zeitraum === '6m') startDatum.setMonth(jetzt.getMonth() - 5);
    else if (zeitraum === '12m') startDatum.setMonth(jetzt.getMonth() - 11);
    else if (zeitraum === '24m') startDatum.setMonth(jetzt.getMonth() - 23);
    else {
      // 'all': ältesten Eintrag ermitteln
      const keys = [...bucket.keys()].sort();
      if (keys.length === 0) return [];
      const [j, m] = keys[0].split('-').map((v) => parseInt(v, 10));
      startDatum.setFullYear(j, m - 1, 1);
    }

    const result: MonatEintrag[] = [];
    const cursor = new Date(startDatum);
    while (cursor.getTime() <= jetzt.getTime()) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const eintrag = bucket.get(key) ?? { umsatz: 0, anzahl: 0 };
      result.push({
        monatKey: key,
        label: labelFromKey(key),
        umsatz: Math.round(eintrag.umsatz * 100) / 100,
        anzahl: eintrag.anzahl,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }, [bestellungen, zeitraum, basis, inkludiereStornos]);

  const statistik = useMemo(() => {
    if (monatsDaten.length === 0) {
      return { gesamt: 0, durchschnitt: 0, aktuell: 0, vormonat: 0, trend: 0, anzahl: 0 };
    }
    const gesamt = monatsDaten.reduce((s, m) => s + m.umsatz, 0);
    const anzahl = monatsDaten.reduce((s, m) => s + m.anzahl, 0);
    const nichtleer = monatsDaten.filter((m) => m.umsatz > 0).length || 1;
    const durchschnitt = gesamt / nichtleer;
    const aktuell = monatsDaten[monatsDaten.length - 1]?.umsatz ?? 0;
    const vormonat = monatsDaten.length >= 2 ? monatsDaten[monatsDaten.length - 2].umsatz : 0;
    const trend = vormonat > 0 ? ((aktuell - vormonat) / vormonat) * 100 : 0;
    return { gesamt, durchschnitt, aktuell, vormonat, trend, anzahl };
  }, [monatsDaten]);

  const getTrendInfo = () => {
    if (statistik.trend > 5) return { icon: TrendingUp, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' };
    if (statistik.trend < -5) return { icon: TrendingDown, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' };
    return { icon: Minus, color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-slate-800' };
  };
  const trendInfo = getTrendInfo();
  const TrendIcon = trendInfo.icon;

  if (!backendVerfuegbar) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-3 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-6 h-6" />
          <div>
            <div className="font-semibold">Onlineshop-Einnahmen nicht verfügbar</div>
            <div className="text-sm">Backend ist nicht aktiv. Bitte <code>VITE_USE_BACKEND=true</code> setzen.</div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Lade Shop-Einnahmen...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border border-red-200 dark:border-red-800">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <ShoppingCart className="w-6 h-6" />
          <span>Fehler beim Laden: {error}</span>
          <button
            onClick={ladeDaten}
            className="ml-auto px-3 py-1 bg-red-100 dark:bg-red-900/30 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-orange-500 to-pink-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Onlineshop-Einnahmen</h3>
              <p className="text-orange-100 text-sm">
                Gambio Shop · tennismehl24.com · monatlicher Umsatz
              </p>
            </div>
          </div>
          <button
            onClick={ladeDaten}
            className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Statistik-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 dark:bg-slate-800/50">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Gesamt ({basis})</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {formatEuro(statistik.gesamt)}
            </span>
            <span className="text-sm text-gray-500">€</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {statistik.anzahl} Bestellung{statistik.anzahl !== 1 ? 'en' : ''}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ø pro Monat</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {formatEuro(statistik.durchschnitt)}
            </span>
            <span className="text-sm text-gray-500">€</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Aktueller Monat</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {formatEuro(statistik.aktuell)}
            </span>
            <span className="text-sm text-gray-500">€</span>
          </div>
        </div>
        <div className={`rounded-xl p-3 shadow-sm ${trendInfo.bg}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">vs. Vormonat</div>
          <div className="flex items-center gap-2">
            <TrendIcon className={`w-5 h-5 ${trendInfo.color}`} />
            <span className={`text-lg sm:text-xl font-bold ${trendInfo.color}`}>
              {statistik.trend >= 0 ? '+' : ''}
              {statistik.trend.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-slate-700">
        <div className="flex gap-1 flex-wrap">
          {(['6m', '12m', '24m', 'all'] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZeitraum(z)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                zeitraum === z
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              {z === '6m' ? '6 Monate' : z === '12m' ? '12 Monate' : z === '24m' ? '24 Monate' : 'Alle'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {(['netto', 'brutto'] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBasis(b)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  basis === b
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                {b === 'netto' ? 'Netto' : 'Brutto'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={inkludiereStornos}
              onChange={(e) => setInkludiereStornos(e.target.checked)}
              className="w-3.5 h-3.5 text-orange-600 rounded focus:ring-orange-500"
            />
            Stornos mitzählen
          </label>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4" style={{ height: 320 }}>
        {monatsDaten.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Keine Bestellungen im gewählten Zeitraum.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monatsDaten} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                labelFormatter={(label) => `Monat ${label}`}
                formatter={(value: number, _name, props) => {
                  const anzahl = (props && (props.payload as MonatEintrag | undefined)?.anzahl) ?? 0;
                  return [
                    `${formatEuroExakt(value)} € · ${anzahl} Bestellung${anzahl !== 1 ? 'en' : ''}`,
                    basis === 'netto' ? 'Umsatz netto' : 'Umsatz brutto',
                  ];
                }}
              />
              <ReferenceLine
                y={statistik.durchschnitt}
                stroke="#f97316"
                strokeDasharray="5 5"
                strokeWidth={1}
              />
              <Bar dataKey="umsatz" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Quelle: Gambio Orders via Backend · Gestrichelte Linie = Monats-Durchschnitt im Zeitraum
        </p>
      </div>
    </div>
  );
};

export default ShopEinnahmenChart;
