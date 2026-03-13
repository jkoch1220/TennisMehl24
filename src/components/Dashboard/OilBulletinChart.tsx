import { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Fuel, RefreshCw, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';

// Datenstruktur für Oil Bulletin
interface OilBulletinEntry {
  date: string;
  price: number;
}

// CSV URL vom GitHub Repository
const OIL_BULLETIN_CSV_URL = 'https://raw.githubusercontent.com/the-Hull/weekly_oil_bulletin/main/data/db/wob_full.csv';

// Cache für CSV-Daten (5 Minuten)
let csvCache: { data: OilBulletinEntry[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 Minuten

/**
 * Lädt und parsed die Oil Bulletin CSV-Daten
 */
const ladeOilBulletinDaten = async (): Promise<OilBulletinEntry[]> => {
  // Cache prüfen
  if (csvCache && Date.now() - csvCache.timestamp < CACHE_DURATION) {
    return csvCache.data;
  }

  try {
    const response = await fetch(OIL_BULLETIN_CSV_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const csvText = await response.text();
    const lines = csvText.split('\n');

    // Header parsen (Semikolon-getrennt)
    const header = lines[0].split(';').map(h => h.replace(/"/g, '').trim());

    // Spalten-Indizes finden
    const dateIndex = header.findIndex(h => h.includes('Prices in force on'));
    const countryIndex = header.findIndex(h => h.includes('Country Name'));
    const productIndex = header.findIndex(h => h.includes('Product Name'));
    const priceIndex = header.findIndex(h => h.includes('Weekly price with taxes'));

    if (dateIndex === -1 || countryIndex === -1 || productIndex === -1 || priceIndex === -1) {
      console.error('CSV-Spalten nicht gefunden:', { dateIndex, countryIndex, productIndex, priceIndex });
      throw new Error('CSV-Format nicht erkannt');
    }

    // Daten filtern (Deutschland + Diesel)
    const deutschlandDiesel: OilBulletinEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const values = line.split(';').map(v => v.replace(/"/g, '').trim());

      const country = values[countryIndex];
      const product = values[productIndex];
      const date = values[dateIndex];
      const priceStr = values[priceIndex];

      // Filter: Deutschland + Automotive gas oil (Diesel)
      if (country === 'Germany' && product === 'Automotive gas oil') {
        const price = parseFloat(priceStr);
        if (!isNaN(price) && date) {
          deutschlandDiesel.push({
            date,
            price: price / 1000, // Umrechnung auf €/Liter (Daten sind in €/1000L)
          });
        }
      }
    }

    // Nach Datum sortieren (älteste zuerst)
    deutschlandDiesel.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Cache speichern
    csvCache = { data: deutschlandDiesel, timestamp: Date.now() };

    return deutschlandDiesel;
  } catch (error) {
    console.error('Fehler beim Laden der Oil Bulletin Daten:', error);
    throw error;
  }
};

/**
 * Oil Bulletin Dieselpreis Chart Komponente
 */
const OilBulletinChart = () => {
  const [daten, setDaten] = useState<OilBulletinEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zeitraum, setZeitraum] = useState<'1y' | '2y' | '5y' | 'all'>('2y');

  // Daten laden
  const ladeDaten = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ladeOilBulletinDaten();
      setDaten(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    ladeDaten();
  }, []);

  // Gefilterte Daten nach Zeitraum
  const gefilterteDaten = useMemo(() => {
    if (daten.length === 0) return [];

    const jetzt = new Date();
    let startDatum: Date;

    switch (zeitraum) {
      case '1y':
        startDatum = new Date(jetzt.getFullYear() - 1, jetzt.getMonth(), jetzt.getDate());
        break;
      case '2y':
        startDatum = new Date(jetzt.getFullYear() - 2, jetzt.getMonth(), jetzt.getDate());
        break;
      case '5y':
        startDatum = new Date(jetzt.getFullYear() - 5, jetzt.getMonth(), jetzt.getDate());
        break;
      case 'all':
      default:
        return daten;
    }

    return daten.filter(d => new Date(d.date) >= startDatum);
  }, [daten, zeitraum]);

  // Statistiken berechnen
  const statistiken = useMemo(() => {
    if (gefilterteDaten.length === 0) {
      return { aktuell: 0, min: 0, max: 0, durchschnitt: 0, trend: 0 };
    }

    const preise = gefilterteDaten.map(d => d.price);
    const aktuell = preise[preise.length - 1];
    const min = Math.min(...preise);
    const max = Math.max(...preise);
    const durchschnitt = preise.reduce((a, b) => a + b, 0) / preise.length;

    // Trend: Vergleich letzter Wert mit Wert vor 4 Wochen
    const vorVierWochen = preise.length > 4 ? preise[preise.length - 5] : preise[0];
    const trend = aktuell - vorVierWochen;

    return { aktuell, min, max, durchschnitt, trend };
  }, [gefilterteDaten]);

  // Letzte Aktualisierung
  const letzteAktualisierung = useMemo(() => {
    if (daten.length === 0) return null;
    return daten[daten.length - 1].date;
  }, [daten]);

  // Trend-Icon und Farbe
  const getTrendInfo = () => {
    if (statistiken.trend > 0.02) {
      return { icon: TrendingUp, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' };
    } else if (statistiken.trend < -0.02) {
      return { icon: TrendingDown, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' };
    }
    return { icon: Minus, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' };
  };

  const trendInfo = getTrendInfo();
  const TrendIcon = trendInfo.icon;

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Lade Dieselpreise...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border border-red-200 dark:border-red-800">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <Fuel className="w-6 h-6" />
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
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Fuel className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">EU Oil Bulletin - Diesel Deutschland</h3>
              <p className="text-amber-100 text-sm">Wöchentliche Preise inkl. Steuern</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/the-Hull/weekly_oil_bulletin"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              title="Datenquelle"
            >
              <ExternalLink className="w-4 h-4 text-white" />
            </a>
            <button
              onClick={() => { csvCache = null; ladeDaten(); }}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              title="Aktualisieren"
            >
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Statistik-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 dark:bg-slate-800/50">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Aktuell</div>
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {statistiken.aktuell.toFixed(3)}
            </span>
            <span className="text-sm text-gray-500">€/L</span>
          </div>
        </div>
        <div className={`rounded-xl p-3 shadow-sm ${trendInfo.bg}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">4-Wochen Trend</div>
          <div className="flex items-center gap-2">
            <TrendIcon className={`w-5 h-5 ${trendInfo.color}`} />
            <span className={`text-lg sm:text-xl font-bold ${trendInfo.color}`}>
              {statistiken.trend >= 0 ? '+' : ''}{(statistiken.trend * 100).toFixed(1)} ct
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Min / Max</div>
          <div className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300">
            {statistiken.min.toFixed(2)} - {statistiken.max.toFixed(2)} €
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Durchschnitt</div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            {statistiken.durchschnitt.toFixed(3)} €/L
          </div>
        </div>
      </div>

      {/* Zeitraum-Auswahl */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-slate-700">
        <div className="flex gap-1">
          {(['1y', '2y', '5y', 'all'] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZeitraum(z)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                zeitraum === z
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              {z === '1y' ? '1 Jahr' : z === '2y' ? '2 Jahre' : z === '5y' ? '5 Jahre' : 'Alle'}
            </button>
          ))}
        </div>
        {letzteAktualisierung && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Stand: {new Date(letzteAktualisierung).toLocaleDateString('de-DE')}
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="p-4" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={gefilterteDaten} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(date) => {
                const d = new Date(date);
                return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
              }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              domain={['auto', 'auto']}
              tickFormatter={(value) => `${value.toFixed(2)}€`}
              width={55}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              labelFormatter={(date) => new Date(date).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
              formatter={(value: number) => [`${value.toFixed(3)} €/L`, 'Diesel']}
            />
            <ReferenceLine
              y={statistiken.durchschnitt}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, fill: '#f59e0b' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Datenquelle: EU Weekly Oil Bulletin • Gestrichelte Linie = Durchschnitt im gewählten Zeitraum
        </p>
      </div>
    </div>
  );
};

export default OilBulletinChart;
