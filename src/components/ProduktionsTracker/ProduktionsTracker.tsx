import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Check, History, TrendingUp, TrendingDown, Trash2, Factory, Calendar,
  Clock, Package, ChevronLeft, ChevronRight, BarChart3, Target, Award,
  ArrowUpRight, ArrowDownRight, Minus, Activity, Zap, CalendarDays
} from 'lucide-react';
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, ComposedChart, Legend, Cell
} from 'recharts';
import { produktionService } from '../../services/produktionService';
import type { ProduktionsVerlauf, ProduktionsEintrag, Koernung } from '../../types/produktion';
import { KOERNUNGEN } from '../../types/produktion';
import SwipeWheelPicker, { playTickSound, triggerHaptic } from './SwipeWheelPicker';

// Hook für Mobile Detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isSmallScreen = window.innerWidth < 768;
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(isSmallScreen && hasTouch);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};

// Erweiterte Statistik-Berechnung
const calculateExtendedStats = (verlauf: ProduktionsVerlauf) => {
  const heute = new Date();
  const eintraege = verlauf.eintraege;

  // Hilfsfunktionen
  const getDateStr = (date: Date) => date.toISOString().split('T')[0];
  const parseDate = (str: string) => new Date(str);

  const getWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const getMonthStr = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  // Gruppiere nach Tag
  const tagesMap = new Map<string, number>();
  for (const e of eintraege) {
    tagesMap.set(e.datum, (tagesMap.get(e.datum) || 0) + e.tonnen);
  }

  // Letzte 30 Tage für Tagesdiagramm
  const last30Days: { datum: string; tonnen: number; label: string }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(heute);
    d.setDate(d.getDate() - i);
    const dateStr = getDateStr(d);
    last30Days.push({
      datum: dateStr,
      tonnen: tagesMap.get(dateStr) || 0,
      label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
    });
  }

  // Letzte 12 Wochen
  const wochenMap = new Map<string, { tonnen: number; tage: number }>();
  for (const [datum, tonnen] of tagesMap) {
    const date = parseDate(datum);
    const weekKey = `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, '0')}`;
    const existing = wochenMap.get(weekKey) || { tonnen: 0, tage: 0 };
    wochenMap.set(weekKey, { tonnen: existing.tonnen + tonnen, tage: existing.tage + 1 });
  }

  const last12Weeks: { woche: string; tonnen: number; durchschnitt: number; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(heute);
    d.setDate(d.getDate() - i * 7);
    const weekKey = `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, '0')}`;
    const data = wochenMap.get(weekKey) || { tonnen: 0, tage: 0 };
    last12Weeks.push({
      woche: weekKey,
      tonnen: data.tonnen,
      durchschnitt: data.tage > 0 ? data.tonnen / data.tage : 0,
      label: `KW${getWeekNumber(d)}`,
    });
  }

  // Letzte 6 Monate
  const monatsMap = new Map<string, { tonnen: number; tage: number }>();
  for (const [datum, tonnen] of tagesMap) {
    const date = parseDate(datum);
    const monthKey = getMonthStr(date);
    const existing = monatsMap.get(monthKey) || { tonnen: 0, tage: 0 };
    monatsMap.set(monthKey, { tonnen: existing.tonnen + tonnen, tage: existing.tage + 1 });
  }

  const last6Months: { monat: string; tonnen: number; durchschnitt: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(heute.getFullYear(), heute.getMonth() - i, 1);
    const monthKey = getMonthStr(d);
    const data = monatsMap.get(monthKey) || { tonnen: 0, tage: 0 };
    last6Months.push({
      monat: monthKey,
      tonnen: data.tonnen,
      durchschnitt: data.tage > 0 ? data.tonnen / data.tage : 0,
      label: d.toLocaleDateString('de-DE', { month: 'short' }),
    });
  }

  // Heute
  const heuteDatum = getDateStr(heute);
  const heuteProduktion = tagesMap.get(heuteDatum) || 0;

  // Diese Woche (Montag bis heute)
  const montag = new Date(heute);
  montag.setDate(heute.getDate() - ((heute.getDay() + 6) % 7));
  let dieseWoche = 0;
  let dieseWocheTage = 0;
  for (let d = new Date(montag); d <= heute; d.setDate(d.getDate() + 1)) {
    const val = tagesMap.get(getDateStr(d)) || 0;
    if (val > 0) {
      dieseWoche += val;
      dieseWocheTage++;
    }
  }

  // Letzte Woche
  const letzterMontag = new Date(montag);
  letzterMontag.setDate(letzterMontag.getDate() - 7);
  const letzterSonntag = new Date(montag);
  letzterSonntag.setDate(letzterSonntag.getDate() - 1);
  let letzteWoche = 0;
  let letzteWocheTage = 0;
  for (let d = new Date(letzterMontag); d <= letzterSonntag; d.setDate(d.getDate() + 1)) {
    const val = tagesMap.get(getDateStr(d)) || 0;
    if (val > 0) {
      letzteWoche += val;
      letzteWocheTage++;
    }
  }

  // Dieser Monat
  const monatsAnfang = new Date(heute.getFullYear(), heute.getMonth(), 1);
  let dieserMonat = 0;
  let dieserMonatTage = 0;
  for (let d = new Date(monatsAnfang); d <= heute; d.setDate(d.getDate() + 1)) {
    const val = tagesMap.get(getDateStr(d)) || 0;
    if (val > 0) {
      dieserMonat += val;
      dieserMonatTage++;
    }
  }

  // Letzter Monat
  const letzterMonatsAnfang = new Date(heute.getFullYear(), heute.getMonth() - 1, 1);
  const letzterMonatsEnde = new Date(heute.getFullYear(), heute.getMonth(), 0);
  let letzterMonat = 0;
  let letzterMonatTage = 0;
  for (let d = new Date(letzterMonatsAnfang); d <= letzterMonatsEnde; d.setDate(d.getDate() + 1)) {
    const val = tagesMap.get(getDateStr(d)) || 0;
    if (val > 0) {
      letzterMonat += val;
      letzterMonatTage++;
    }
  }

  // Durchschnitte
  const alleTage = Array.from(tagesMap.values());
  const durchschnittProTag = alleTage.length > 0
    ? alleTage.reduce((a, b) => a + b, 0) / alleTage.length
    : 0;

  // Beste/Schlechteste Tage
  const sortedDays = Array.from(tagesMap.entries())
    .map(([datum, tonnen]) => ({ datum, tonnen }))
    .sort((a, b) => b.tonnen - a.tonnen);

  const besterTag = sortedDays[0] || { datum: '-', tonnen: 0 };
  const schlechtesterTag = sortedDays[sortedDays.length - 1] || { datum: '-', tonnen: 0 };

  // Trend berechnen (letzte 7 Tage vs. 7 Tage davor)
  let letzten7Tage = 0;
  let davor7Tage = 0;
  for (let i = 0; i < 7; i++) {
    const d1 = new Date(heute);
    d1.setDate(d1.getDate() - i);
    const d2 = new Date(heute);
    d2.setDate(d2.getDate() - i - 7);
    letzten7Tage += tagesMap.get(getDateStr(d1)) || 0;
    davor7Tage += tagesMap.get(getDateStr(d2)) || 0;
  }
  const trend7Tage = davor7Tage > 0 ? ((letzten7Tage - davor7Tage) / davor7Tage) * 100 : 0;

  // Gleitender Durchschnitt (7 Tage) für Trendlinie
  const trendData = last30Days.map((day, index) => {
    let sum = 0;
    let count = 0;
    for (let i = Math.max(0, index - 6); i <= index; i++) {
      sum += last30Days[i].tonnen;
      count++;
    }
    return {
      ...day,
      gleitenderDurchschnitt: count > 0 ? sum / count : 0,
    };
  });

  // Wochentag-Analyse
  const wochentagMap = new Map<number, { total: number; count: number }>();
  for (const [datum, tonnen] of tagesMap) {
    const day = parseDate(datum).getDay();
    const existing = wochentagMap.get(day) || { total: 0, count: 0 };
    wochentagMap.set(day, { total: existing.total + tonnen, count: existing.count + 1 });
  }

  const wochentagNamen = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const wochentagStats = wochentagNamen.map((name, i) => {
    const data = wochentagMap.get(i) || { total: 0, count: 0 };
    return {
      name,
      durchschnitt: data.count > 0 ? data.total / data.count : 0,
      anzahl: data.count,
    };
  });

  // Prognose für diesen Monat
  const verbleibendeTageMonat = new Date(heute.getFullYear(), heute.getMonth() + 1, 0).getDate() - heute.getDate();
  const prognoseMonat = dieserMonat + (dieserMonatTage > 0 ? (dieserMonat / dieserMonatTage) * verbleibendeTageMonat : 0);

  // Körnung-Statistik für letzte 30 Tage
  const koernungMap = new Map<string, number>();
  const last30DaysStart = new Date(heute);
  last30DaysStart.setDate(last30DaysStart.getDate() - 30);

  for (const e of eintraege) {
    const eintragDatum = new Date(e.datum);
    if (eintragDatum >= last30DaysStart && eintragDatum <= heute) {
      const koernung = e.koernung || 'mittel'; // Fallback für alte Einträge
      koernungMap.set(koernung, (koernungMap.get(koernung) || 0) + e.tonnen);
    }
  }

  const gesamtLast30 = Array.from(koernungMap.values()).reduce((a, b) => a + b, 0);
  const koernungStatistik = Array.from(koernungMap.entries())
    .map(([koernung, tonnen]) => ({
      koernung: koernung as Koernung,
      tonnen,
      anteil: gesamtLast30 > 0 ? (tonnen / gesamtLast30) * 100 : 0,
    }))
    .sort((a, b) => b.tonnen - a.tonnen);

  return {
    heute: heuteProduktion,
    dieseWoche,
    dieseWocheDurchschnitt: dieseWocheTage > 0 ? dieseWoche / dieseWocheTage : 0,
    letzteWoche,
    letzteWocheDurchschnitt: letzteWocheTage > 0 ? letzteWoche / letzteWocheTage : 0,
    wocheVergleich: letzteWoche > 0 ? ((dieseWoche - letzteWoche) / letzteWoche) * 100 : 0,
    dieserMonat,
    dieserMonatDurchschnitt: dieserMonatTage > 0 ? dieserMonat / dieserMonatTage : 0,
    letzterMonat,
    letzterMonatDurchschnitt: letzterMonatTage > 0 ? letzterMonat / letzterMonatTage : 0,
    monatVergleich: letzterMonat > 0 ? ((dieserMonat - letzterMonat) / letzterMonat) * 100 : 0,
    durchschnittProTag,
    besterTag,
    schlechtesterTag,
    trend7Tage,
    last30Days: trendData,
    last12Weeks,
    last6Months,
    wochentagStats,
    prognoseMonat,
    gesamtEintraege: eintraege.length,
    produktiveTage: tagesMap.size,
    koernungStatistik,
  };
};

// KPI Card Component
const KPICard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  color: string;
}> = ({ title, value, subtitle, icon, trend, trendLabel, color }) => {
  const getTrendIcon = () => {
    if (trend === undefined) return null;
    if (trend > 0) return <ArrowUpRight className="w-4 h-4 text-green-500" />;
    if (trend < 0) return <ArrowDownRight className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getTrendColor = () => {
    if (trend === undefined) return '';
    if (trend > 0) return 'text-green-600 dark:text-green-400';
    if (trend < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-500';
  };

  return (
    <div className="relative group">
      <div className={`absolute inset-0 bg-gradient-to-br ${color} rounded-2xl blur-lg opacity-30 group-hover:opacity-40 transition-opacity`} />
      <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-white/50 dark:border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className={`p-2 rounded-xl bg-gradient-to-br ${color} text-white shadow-lg`}>
            {icon}
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-sm font-medium ${getTrendColor()}`}>
              {getTrendIcon()}
              <span>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          )}
        </div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-3">{title}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        {(subtitle || trendLabel) && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {subtitle || trendLabel}
          </p>
        )}
      </div>
    </div>
  );
};

// Chart Tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">
        <p className="font-medium text-gray-900 dark:text-white">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-sm" style={{ color: p.color }}>
            {p.name}: <span className="font-bold">{p.value?.toFixed(1)}t</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Mobile Vollbild-Version
const MobileProduktionsTracker: React.FC<{
  tonnen: number;
  setTonnen: (v: number) => void;
  koernung: Koernung;
  setKoernung: (v: Koernung) => void;
  onSave: () => void;
  saving: boolean;
  success: boolean;
  heuteProduktion: number;
  statistik: { gesamtTonnen: number; durchschnittProTag: number };
}> = ({ tonnen, setTonnen, koernung, setKoernung, onSave, saving, success, heuteProduktion, statistik }) => {

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalHeight = document.body.style.height;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.height = '100%';
    document.body.style.touchAction = 'none';
    document.body.style.width = '100%';

    const preventScroll = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-wheel-area]')) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.height = originalHeight;
      document.body.style.touchAction = originalTouchAction;
      document.body.style.width = '';
      document.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-gray-900 dark:via-gray-850 dark:to-gray-800 flex flex-col overflow-hidden"
      style={{ height: '100dvh', touchAction: 'none' }}
    >
      <div className="flex-shrink-0 px-4 pt-4 pb-2 safe-area-inset-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg">
              <Factory className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">Produktion</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400">Heute</div>
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">{heuteProduktion}t</div>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400">Ø/Tag</div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">{statistik.durchschnittProTag.toFixed(0)}t</div>
            </div>
          </div>
        </div>
      </div>

      {/* Körnung Auswahl */}
      <div className="flex-shrink-0 px-4 py-3">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-2 font-medium">Körnung</div>
        <div className="flex gap-2 justify-center">
          {KOERNUNGEN.map((k) => (
            <button
              key={k.value}
              onClick={() => {
                setKoernung(k.value);
                playTickSound('medium');
                triggerHaptic('tick');
              }}
              className={`
                px-4 py-2 rounded-xl font-semibold text-sm transition-all
                ${koernung === k.value
                  ? `bg-gradient-to-br ${k.color} text-white shadow-lg scale-105`
                  : 'bg-white/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 shadow'
                }
              `}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center px-4" data-wheel-area="true">
        <SwipeWheelPicker
          value={tonnen}
          onChange={setTonnen}
          min={1}
          max={500}
          step={1}
          unit="Tonnen"
          quickValues={[5, 10, 25, 50]}
          sensitivity={18}
        />
      </div>

      <div className="flex-shrink-0 px-4 pb-4 safe-area-inset-bottom">
        <button
          onClick={onSave}
          disabled={saving}
          className={`
            relative w-full py-5 rounded-2xl font-bold text-xl
            flex items-center justify-center gap-3
            transition-all duration-300 transform overflow-hidden
            ${success
              ? 'bg-gradient-to-r from-green-500 to-emerald-500'
              : saving
                ? 'bg-gradient-to-r from-orange-400 to-amber-400'
                : 'bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 active:scale-[0.98]'
            }
            text-white shadow-2xl
          `}
        >
          {!saving && !success && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
          )}
          {success ? (
            <>
              <Check className="w-7 h-7 animate-bounce" />
              <span>{tonnen}t eingetragen!</span>
            </>
          ) : saving ? (
            <>
              <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Speichern...</span>
            </>
          ) : (
            <>
              <Plus className="w-7 h-7" />
              <span>{tonnen}t eintragen</span>
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer { animation: shimmer 2s infinite; }
        .safe-area-inset-top { padding-top: max(1rem, env(safe-area-inset-top)); }
        .safe-area-inset-bottom { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
      `}</style>
    </div>
  );
};

// Desktop Version mit vollem Statistik-Dashboard
const DesktopProduktionsTracker: React.FC<{
  tonnen: number;
  setTonnen: (v: number) => void;
  koernung: Koernung;
  setKoernung: (v: Koernung) => void;
  onSave: (datum?: string) => void;
  saving: boolean;
  success: boolean;
  verlauf: ProduktionsVerlauf;
  onDelete: (id: string) => void;
  deleteId: string | null;
}> = ({ tonnen, setTonnen, koernung, setKoernung, onSave, saving, success, verlauf, onDelete, deleteId }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'erfassen' | 'statistik' | 'verlauf'>('erfassen');

  // Erweiterte Statistiken berechnen
  const stats = useMemo(() => calculateExtendedStats(verlauf), [verlauf]);

  const formatDatum = (datum: string) => {
    const d = new Date(datum);
    const heute = new Date();
    const gestern = new Date(heute);
    gestern.setDate(gestern.getDate() - 1);

    if (d.toDateString() === heute.toDateString()) return 'Heute';
    if (d.toDateString() === gestern.toDateString()) return 'Gestern';
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  };

  const formatZeit = (zeitpunkt: string) => {
    return new Date(zeitpunkt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  }, []);

  const entriesForSelectedDay = verlauf.eintraege.filter(e => e.datum === selectedDate);

  const groupedEntries = verlauf.eintraege.slice(0, 100).reduce((acc, entry) => {
    const date = entry.datum;
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, ProduktionsEintrag[]>);

  // Chart Farben
  const COLORS = ['#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-gray-900 dark:via-gray-850 dark:to-gray-800">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border-b border-orange-200/50 dark:border-gray-700/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-orange-500/40 rounded-xl blur-md" />
                <div className="relative p-3 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg">
                  <Factory className="w-7 h-7" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Produktion</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ziegelmehl-Produktion erfassen & analysieren</p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
              {[
                { id: 'erfassen', label: 'Erfassen', icon: Plus },
                { id: 'statistik', label: 'Statistik', icon: BarChart3 },
                { id: 'verlauf', label: 'Verlauf', icon: History },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id as any);
                    playTickSound('medium');
                  }}
                  className={`
                    px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all
                    ${activeTab === id
                      ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-orange-400 shadow-md'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* KPI Cards - immer sichtbar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
          <KPICard
            title="Heute"
            value={`${stats.heute}t`}
            icon={<Calendar className="w-5 h-5" />}
            color="from-orange-400 to-orange-600"
          />
          <KPICard
            title="Diese Woche"
            value={`${stats.dieseWoche.toFixed(0)}t`}
            subtitle={`Ø ${stats.dieseWocheDurchschnitt.toFixed(1)}t/Tag`}
            icon={<CalendarDays className="w-5 h-5" />}
            trend={stats.wocheVergleich}
            color="from-amber-400 to-amber-600"
          />
          <KPICard
            title="Dieser Monat"
            value={`${stats.dieserMonat.toFixed(0)}t`}
            subtitle={`Ø ${stats.dieserMonatDurchschnitt.toFixed(1)}t/Tag`}
            icon={<Package className="w-5 h-5" />}
            trend={stats.monatVergleich}
            color="from-yellow-400 to-yellow-600"
          />
          <KPICard
            title="Ø pro Tag"
            value={`${stats.durchschnittProTag.toFixed(1)}t`}
            subtitle={`${stats.produktiveTage} Produktionstage`}
            icon={<Activity className="w-5 h-5" />}
            color="from-green-400 to-green-600"
          />
          <KPICard
            title="Bester Tag"
            value={`${stats.besterTag.tonnen}t`}
            subtitle={formatDatum(stats.besterTag.datum)}
            icon={<Award className="w-5 h-5" />}
            color="from-emerald-400 to-emerald-600"
          />
          <KPICard
            title="7-Tage Trend"
            value={`${stats.trend7Tage > 0 ? '+' : ''}${stats.trend7Tage.toFixed(1)}%`}
            icon={stats.trend7Tage >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            color={stats.trend7Tage >= 0 ? "from-green-400 to-emerald-600" : "from-red-400 to-red-600"}
          />
        </div>

        {/* Tab Content */}
        {activeTab === 'erfassen' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Date Selection Panel */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-500" />
                Datum auswählen
              </h3>

              <div className="flex flex-wrap gap-2 mb-4">
                {last7Days.map((date) => {
                  const dayProd = stats.last30Days.find(d => d.datum === date)?.tonnen || 0;
                  return (
                    <button
                      key={date}
                      onClick={() => {
                        setSelectedDate(date);
                        playTickSound('medium');
                      }}
                      className={`
                        px-3 py-2 rounded-xl text-sm font-medium transition-all
                        ${selectedDate === date
                          ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }
                      `}
                    >
                      <div>{formatDatum(date)}</div>
                      {dayProd > 0 && <div className="text-xs opacity-75">{dayProd}t</div>}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }}
                  className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <input
                  type="date"
                  value={selectedDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center font-medium"
                />

                <button
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + 1);
                    const max = new Date().toISOString().split('T')[0];
                    if (d.toISOString().split('T')[0] <= max) {
                      setSelectedDate(d.toISOString().split('T')[0]);
                    }
                  }}
                  disabled={selectedDate >= new Date().toISOString().split('T')[0]}
                  className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {entriesForSelectedDay.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Einträge für {formatDatum(selectedDate)}
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {entriesForSelectedDay.map((entry) => {
                      const koernungInfo = KOERNUNGEN.find(k => k.value === entry.koernung) || KOERNUNGEN[2];
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-orange-600 dark:text-orange-400">{entry.tonnen}t</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${koernungInfo.color} text-white`}>
                              {koernungInfo.label}
                            </span>
                            <span className="text-sm text-gray-500">{formatZeit(entry.zeitpunkt)}</span>
                          </div>
                          <button
                            onClick={() => onDelete(entry.id!)}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Entry Panel */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-orange-500" />
                Eintrag für {formatDatum(selectedDate)}
              </h3>

              {/* Körnung Auswahl */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Körnung</label>
                <div className="flex flex-wrap gap-2">
                  {KOERNUNGEN.map((k) => (
                    <button
                      key={k.value}
                      onClick={() => {
                        setKoernung(k.value);
                        playTickSound('medium');
                      }}
                      className={`
                        px-4 py-2 rounded-xl font-semibold transition-all
                        ${koernung === k.value
                          ? `bg-gradient-to-br ${k.color} text-white shadow-lg`
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                        }
                      `}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tonnen Auswahl */}
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Menge</label>
              <div className="flex flex-wrap gap-2 mb-6">
                {[5, 10, 15, 20, 25, 30, 40, 50].map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setTonnen(v);
                      playTickSound('medium');
                    }}
                    className={`
                      px-4 py-2 rounded-xl font-semibold transition-all
                      ${tonnen === v
                        ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                      }
                    `}
                  >
                    {v}t
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={() => setTonnen(Math.max(1, tonnen - 1))}
                  className="p-3 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <input
                  type="number"
                  value={tonnen}
                  onChange={(e) => setTonnen(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                  className="flex-1 px-6 py-4 rounded-xl border-2 border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-700 text-4xl font-bold text-center text-orange-600 dark:text-orange-400"
                />

                <button
                  onClick={() => setTonnen(Math.min(500, tonnen + 1))}
                  className="p-3 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              <div className="text-center text-gray-500 dark:text-gray-400 mb-6">Tonnen</div>

              <button
                onClick={() => onSave(selectedDate)}
                disabled={saving}
                className={`
                  w-full py-4 rounded-2xl font-bold text-lg
                  flex items-center justify-center gap-3
                  transition-all duration-300
                  ${success
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                    : saving
                      ? 'bg-gradient-to-r from-orange-400 to-amber-400'
                      : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600'
                  }
                  text-white shadow-xl
                `}
              >
                {success ? (
                  <><Check className="w-6 h-6" /><span>Eingetragen!</span></>
                ) : saving ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Speichern...</span></>
                ) : (
                  <><Plus className="w-6 h-6" /><span>{tonnen}t eintragen</span></>
                )}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'statistik' && (
          <div className="space-y-6">
            {/* Tägliche Produktion Chart */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-orange-500" />
                Tägliche Produktion (letzte 30 Tage)
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats.last30Days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="tonnen" name="Produktion" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="gleitenderDurchschnitt"
                      name="Ø 7 Tage"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Wochen-Vergleich */}
              <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-500" />
                  Wochenübersicht (letzte 12 Wochen)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.last12Weeks}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="tonnen" name="Wochensumme" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                        {stats.last12Weeks.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={index === stats.last12Weeks.length - 1 ? '#f97316' : '#f59e0b'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monats-Vergleich */}
              <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-green-500" />
                  Monatsübersicht (letzte 6 Monate)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.last6Months}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="tonnen"
                        name="Monatssumme"
                        stroke="#22c55e"
                        fill="#22c55e"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Wochentag-Analyse */}
              <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-purple-500" />
                  Produktion nach Wochentag
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.wochentagStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="durchschnitt" name="Ø Produktion" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                        {stats.wochentagStats.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Körnung-Verteilung */}
              <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-500" />
                  Körnung-Verteilung (letzte 30 Tage)
                </h3>
                <div className="space-y-3">
                  {stats.koernungStatistik && stats.koernungStatistik.length > 0 ? (
                    stats.koernungStatistik.map((k) => {
                      const koernungInfo = KOERNUNGEN.find(ki => ki.value === k.koernung) || KOERNUNGEN[2];
                      return (
                        <div key={k.koernung} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-700 dark:text-gray-300">{koernungInfo.label}</span>
                            <span className="text-gray-600 dark:text-gray-400">
                              {k.tonnen.toFixed(0)}t ({k.anteil.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${koernungInfo.color}`}
                              style={{ width: `${k.anteil}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Noch keine Daten vorhanden</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Kennzahlen-Übersicht */}
              <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-red-500" />
                  Kennzahlen & Prognose
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Monatsprognose</p>
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                        ~{stats.prognoseMonat.toFixed(0)}t
                      </p>
                    </div>
                    <Zap className="w-8 h-8 text-orange-500" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                      <p className="text-xs text-green-600 dark:text-green-400">Bester Tag</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">{stats.besterTag.tonnen}t</p>
                      <p className="text-xs text-green-500">{formatDatum(stats.besterTag.datum)}</p>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                      <p className="text-xs text-amber-600 dark:text-amber-400">Letzte Woche</p>
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{stats.letzteWoche.toFixed(0)}t</p>
                      <p className="text-xs text-amber-500">Ø {stats.letzteWocheDurchschnitt.toFixed(1)}t/Tag</p>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <p className="text-xs text-blue-600 dark:text-blue-400">Letzter Monat</p>
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{stats.letzterMonat.toFixed(0)}t</p>
                      <p className="text-xs text-blue-500">Ø {stats.letzterMonatDurchschnitt.toFixed(1)}t/Tag</p>
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                      <p className="text-xs text-purple-600 dark:text-purple-400">Produktionstage</p>
                      <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{stats.produktiveTage}</p>
                      <p className="text-xs text-purple-500">{stats.gesamtEintraege} Einträge</p>
                    </div>
                  </div>

                  {/* Vergleichsbalken */}
                  <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Diese vs. letzte Woche</span>
                      <span className={`font-medium ${stats.wocheVergleich >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stats.wocheVergleich > 0 ? '+' : ''}{stats.wocheVergleich.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${stats.wocheVergleich >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, Math.abs(stats.wocheVergleich) + 50)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-sm mt-3">
                      <span className="text-gray-600 dark:text-gray-400">Dieser vs. letzter Monat</span>
                      <span className={`font-medium ${stats.monatVergleich >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stats.monatVergleich > 0 ? '+' : ''}{stats.monatVergleich.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${stats.monatVergleich >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, Math.abs(stats.monatVergleich) + 50)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'verlauf' && (
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <History className="w-6 h-6 text-orange-500" />
                Produktionsverlauf
              </h2>
              <span className="px-3 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-sm font-medium">
                {verlauf.eintraege.length} Einträge
              </span>
            </div>

            {verlauf.eintraege.length === 0 ? (
              <div className="text-center py-16">
                <Factory className="w-20 h-20 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-500 dark:text-gray-400">Noch keine Einträge</p>
              </div>
            ) : (
              <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                {Object.entries(groupedEntries).map(([date, entries]) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-orange-300/50 to-transparent" />
                      <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-xs font-semibold">
                        {formatDatum(date)} - {entries.reduce((sum, e) => sum + e.tonnen, 0)}t gesamt
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-l from-orange-300/50 to-transparent" />
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {entries.map((eintrag) => {
                        const koernungInfo = KOERNUNGEN.find(k => k.value === eintrag.koernung) || KOERNUNGEN[2]; // Fallback zu Mittel
                        return (
                          <div
                            key={eintrag.id}
                            className={`
                              bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4
                              flex items-center justify-between
                              transition-all duration-300
                              ${deleteId === eintrag.id ? 'opacity-0 scale-95' : 'opacity-100'}
                            `}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${koernungInfo.color} flex items-center justify-center text-white font-bold shadow-md`}>
                                {eintrag.tonnen}t
                              </div>
                              <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-300">{koernungInfo.label}</div>
                                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-sm">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatZeit(eintrag.zeitpunkt)}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                if (confirm('Eintrag löschen?')) {
                                  onDelete(eintrag.id!);
                                }
                              }}
                              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Main Component
const ProduktionsTracker: React.FC = () => {
  const isMobile = useIsMobile();
  const [tonnen, setTonnen] = useState(10);
  const [koernung, setKoernung] = useState<Koernung>('mittel');
  const [verlauf, setVerlauf] = useState<ProduktionsVerlauf>({ eintraege: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadVerlauf();
  }, []);

  const loadVerlauf = async () => {
    try {
      setLoading(true);
      const data = await produktionService.getVerlauf();
      setVerlauf(data);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (datum?: string) => {
    if (saving) return;

    setSaving(true);
    setSuccess(false);

    try {
      await produktionService.addEintrag(tonnen, koernung, datum);
      setSuccess(true);

      playTickSound('success');
      triggerHaptic('success');

      await loadVerlauf();
      setTimeout(() => setSuccess(false), 2500);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      playTickSound('limit');
      triggerHaptic('limit');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eintragId: string) => {
    try {
      setDeleteId(eintragId);
      await new Promise(resolve => setTimeout(resolve, 300));

      await produktionService.deleteEintrag(eintragId);
      playTickSound('medium');
      triggerHaptic('heavy');

      await loadVerlauf();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    } finally {
      setDeleteId(null);
    }
  };

  const statistik = produktionService.getStatistik(verlauf, 30);

  const heuteProduktion = statistik.tagesProduktionen.find(
    t => t.datum === new Date().toISOString().split('T')[0]
  )?.tonnen || 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-gray-900 dark:via-gray-850 dark:to-gray-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500/30 rounded-full blur-xl animate-pulse" />
            <div className="relative p-4 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-2xl">
              <Factory className="w-12 h-12 animate-bounce" />
            </div>
          </div>
          <div className="text-orange-600 dark:text-orange-400 font-medium animate-pulse">
            Lade Produktionsdaten...
          </div>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <MobileProduktionsTracker
        tonnen={tonnen}
        setTonnen={setTonnen}
        koernung={koernung}
        setKoernung={setKoernung}
        onSave={() => handleSave()}
        saving={saving}
        success={success}
        heuteProduktion={heuteProduktion}
        statistik={statistik}
      />
    );
  }

  return (
    <DesktopProduktionsTracker
      tonnen={tonnen}
      setTonnen={setTonnen}
      koernung={koernung}
      setKoernung={setKoernung}
      onSave={handleSave}
      saving={saving}
      success={success}
      verlauf={verlauf}
      onDelete={handleDelete}
      deleteId={deleteId}
    />
  );
};

export default ProduktionsTracker;
