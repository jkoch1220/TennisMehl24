import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, BarChart3, TrendingUp, AlertTriangle, Wrench, X, ChevronRight, Circle, ChevronDown, ChevronUp, Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Loader2, Boxes, CheckCircle, Calendar, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { filterAllowedTools } from '../services/permissionsService';
import { ALL_TOOLS } from '../constants/tools';
import { instandhaltungService } from '../services/instandhaltungService';
import { OverdueInfo, FREQUENZ_CONFIG, InstandhaltungFrequenz, InstandhaltungChecklistItem } from '../types/instandhaltung';
import { dashboardService } from '../services/dashboardService';
import type { DashboardStats } from '../types/dashboard';
import { terminService } from '../services/terminService';
import type { Termin } from '../types/termin';

// Erinnerungs-Einstellungen Typ
interface ReminderSettings {
  instandhaltungEnabled: boolean;
  kalenderEnabled: boolean;
}

// Standard-Einstellungen
const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  instandhaltungEnabled: true,
  kalenderEnabled: true,
};

// Erinnerungs-Einstellungen aus localStorage laden
const loadReminderSettings = (): ReminderSettings => {
  try {
    const stored = localStorage.getItem('tm_reminder_settings_v1');
    if (stored) {
      return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignoriere Parsing-Fehler
  }
  return DEFAULT_REMINDER_SETTINGS;
};

// Wetter-Icon basierend auf WMO Weather Code
const getWeatherIcon = (code: number) => {
  if (code === 0) return <Sun className="w-6 h-6 text-yellow-500" />;
  if (code <= 3) return <Cloud className="w-6 h-6 text-gray-400" />;
  if (code <= 49) return <Cloud className="w-6 h-6 text-gray-500" />;
  if (code <= 69) return <CloudRain className="w-6 h-6 text-blue-500" />;
  if (code <= 79) return <CloudSnow className="w-6 h-6 text-blue-300" />;
  if (code <= 99) return <CloudLightning className="w-6 h-6 text-yellow-600" />;
  return <Cloud className="w-6 h-6 text-gray-400" />;
};

interface WeatherDay {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  weatherCode: number;
}

interface WeatherData {
  daily: WeatherDay[];
  location: string;
}

const Home = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [overdueInfos, setOverdueInfos] = useState<OverdueInfo[]>([]);
  const [showReminderPopup, setShowReminderPopup] = useState(false);
  const [checklistItems, setChecklistItems] = useState<Record<InstandhaltungFrequenz, InstandhaltungChecklistItem[]>>({
    taeglich: [],
    woechentlich: [],
    monatlich: [],
  });
  const [expandedFrequenz, setExpandedFrequenz] = useState<InstandhaltungFrequenz | null>(null);

  // Kalender-Termine State
  const [upcomingTermine, setUpcomingTermine] = useState<Termin[]>([]);
  const [expandedTermine, setExpandedTermine] = useState(false);

  // Erinnerungs-Einstellungen
  const [reminderSettings] = useState<ReminderSettings>(() => loadReminderSettings());

  // Wetter-State
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  // Dashboard-Stats State
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Wetter laden (Open-Meteo API - kostenlos, kein API-Key nötig)
  useEffect(() => {
    const loadWeather = async () => {
      try {
        // Koordinaten für Altfeld/Marktheidenfeld (Unterfranken)
        const lat = 49.85;
        const lon = 9.60;

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Europe/Berlin&forecast_days=10`
        );

        if (!response.ok) throw new Error('Wetter konnte nicht geladen werden');

        const data = await response.json();

        const daily: WeatherDay[] = data.daily.time.map((date: string, i: number) => ({
          date,
          tempMax: Math.round(data.daily.temperature_2m_max[i]),
          tempMin: Math.round(data.daily.temperature_2m_min[i]),
          precipitation: data.daily.precipitation_sum[i],
          weatherCode: data.daily.weathercode[i],
        }));

        setWeatherData({
          daily,
          location: 'Altfeld/Marktheidenfeld',
        });
      } catch (error) {
        console.error('Fehler beim Laden des Wetters:', error);
      } finally {
        setWeatherLoading(false);
      }
    };

    loadWeather();
  }, []);

  // Dashboard-Stats laden
  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await dashboardService.getDashboardStats();
        setDashboardStats(stats);
      } catch (error) {
        console.error('Fehler beim Laden der Dashboard-Stats:', error);
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();
  }, []);

  // Prüfe Erinnerungen beim Laden der Seite (Instandhaltung + Kalender)
  useEffect(() => {
    const checkReminders = async () => {
      // Prüfen ob Popup heute schon dismissed wurde (Session-basiert)
      const dismissedToday = sessionStorage.getItem('reminder_popup_dismissed');
      if (dismissedToday === new Date().toDateString()) {
        return;
      }

      let hasInstandhaltungReminders = false;
      let hasKalenderReminders = false;

      // Instandhaltung prüfen (wenn aktiviert)
      if (reminderSettings.instandhaltungEnabled) {
        const hasAccess = filterAllowedTools(user, ALL_TOOLS).some(t => t.id === 'instandhaltung');
        if (hasAccess) {
          try {
            const infos = await instandhaltungService.pruefeUeberfaellig();
            const ueberfaellige = infos.filter(info => info.istUeberfaellig);
            setOverdueInfos(ueberfaellige);

            if (ueberfaellige.length > 0) {
              hasInstandhaltungReminders = true;
              // Lade Checklist-Items für alle überfälligen Frequenzen
              const itemsMap: Record<InstandhaltungFrequenz, InstandhaltungChecklistItem[]> = {
                taeglich: [],
                woechentlich: [],
                monatlich: [],
              };

              for (const info of ueberfaellige) {
                const items = await instandhaltungService.ladeChecklistItemsNachFrequenz(info.frequenz);
                itemsMap[info.frequenz] = items;
              }

              setChecklistItems(itemsMap);
              // Erste überfällige Frequenz automatisch expandieren
              setExpandedFrequenz(ueberfaellige[0].frequenz);
            }
          } catch (error) {
            console.error('Fehler beim Prüfen der Instandhaltung:', error);
          }
        }
      }

      // Kalender-Termine prüfen (wenn aktiviert)
      if (reminderSettings.kalenderEnabled) {
        const hasKalenderAccess = filterAllowedTools(user, ALL_TOOLS).some(t => t.id === 'kalender');
        if (hasKalenderAccess) {
          try {
            // Lade Termine für die nächsten 7 Tage
            const heute = new Date();
            heute.setHours(0, 0, 0, 0);
            const inSiebenTagen = new Date(heute);
            inSiebenTagen.setDate(inSiebenTagen.getDate() + 7);
            inSiebenTagen.setHours(23, 59, 59, 999);

            const termine = await terminService.loadTermineImZeitraum(
              heute.toISOString(),
              inSiebenTagen.toISOString()
            );

            // Filtere nur zukünftige Termine (ab jetzt)
            const jetzt = new Date();
            const zukuenftigeTermine = termine.filter(t => new Date(t.startDatum) >= jetzt);

            setUpcomingTermine(zukuenftigeTermine);
            if (zukuenftigeTermine.length > 0) {
              hasKalenderReminders = true;
            }
          } catch (error) {
            console.error('Fehler beim Laden der Kalendertermine:', error);
          }
        }
      }

      // Popup anzeigen wenn es Erinnerungen gibt
      if (hasInstandhaltungReminders || hasKalenderReminders) {
        setShowReminderPopup(true);
      }
    };

    checkReminders();
  }, [user, reminderSettings]);

  const handleDismissPopup = () => {
    setShowReminderPopup(false);
    sessionStorage.setItem('reminder_popup_dismissed', new Date().toDateString());
  };

  const handleGoToInstandhaltung = () => {
    setShowReminderPopup(false);
    navigate('/instandhaltung');
  };

  const handleGoToKalender = () => {
    setShowReminderPopup(false);
    navigate('/kalender');
  };

  // Formatiere Termin-Datum
  const formatTerminDatum = (termin: Termin): string => {
    const startDate = new Date(termin.startDatum);
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    const morgen = new Date(heute);
    morgen.setDate(morgen.getDate() + 1);

    const terminTag = new Date(startDate);
    terminTag.setHours(0, 0, 0, 0);

    if (terminTag.getTime() === heute.getTime()) {
      if (termin.ganztaegig) return 'Heute (ganztägig)';
      return `Heute, ${startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    }
    if (terminTag.getTime() === morgen.getTime()) {
      if (termin.ganztaegig) return 'Morgen (ganztägig)';
      return `Morgen, ${startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    }

    const wochentag = startDate.toLocaleDateString('de-DE', { weekday: 'short' });
    const datum = startDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    if (termin.ganztaegig) return `${wochentag}, ${datum} (ganztägig)`;
    return `${wochentag}, ${datum}, ${startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
  };

  const formatLetzteBegehung = (info: OverdueInfo): string => {
    if (!info.letzteBegehung || !info.letzteBegehung.abschlussDatum) {
      return 'Noch nie durchgeführt';
    }
    const datum = new Date(info.letzteBegehung.abschlussDatum);
    const jetzt = new Date();
    const diffMs = jetzt.getTime() - datum.getTime();
    const diffTage = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffTage === 0) return 'Heute';
    if (diffTage === 1) return 'Gestern';
    return `Vor ${diffTage} Tagen`;
  };
  
  // Tools basierend auf User-Berechtigungen filtern
  const enabledTools = filterAllowedTools(user, ALL_TOOLS);
  
  // Zusätzlich lokale Visibility-Settings beachten
  const localVisibility = (() => {
    try {
      const stored = localStorage.getItem('tm_local_tool_visibility_v1');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  })();
  
  // Nur Tools anzeigen die sowohl erlaubt als auch lokal nicht ausgeblendet sind
  const visibleTools = enabledTools.filter(tool => localVisibility[tool.id] !== false);

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-8 mt-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-dark-text mb-4 transition-colors duration-300">
            TennisMehl24 Kalkulationstools
          </h1>
          <p className="text-xl text-gray-600 dark:text-dark-textMuted max-w-2xl mx-auto transition-colors duration-300">
            Professionelle Tools für Preisberechnungen, Kalkulationen und
            Analysen
          </p>
        </div>

        {/* Wetter und Statistiken */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* 10-Tage Wetterbericht */}
          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-6 border border-transparent dark:border-dark-border">
            <div className="flex items-center gap-2 mb-4">
              <Cloud className="w-6 h-6 text-blue-500" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
                10-Tage Wetterbericht
              </h2>
              {weatherData && (
                <span className="text-sm text-gray-500 dark:text-dark-textMuted ml-auto">
                  {weatherData.location}
                </span>
              )}
            </div>

            {weatherLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : weatherData ? (
              <div className="overflow-x-auto -mx-2">
                <div className="flex gap-2 pb-2 px-2" style={{ minWidth: 'max-content' }}>
                  {weatherData.daily.map((day, index) => {
                    const date = new Date(day.date);
                    const isToday = index === 0;
                    const dayName = isToday ? 'Heute' : date.toLocaleDateString('de-DE', { weekday: 'short' });
                    const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

                    return (
                      <div
                        key={day.date}
                        className={`flex flex-col items-center p-3 rounded-lg min-w-[80px] ${
                          isToday
                            ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-300 dark:border-blue-700'
                            : 'bg-gray-50 dark:bg-dark-border'
                        }`}
                      >
                        <span className={`text-xs font-semibold ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-dark-textMuted'}`}>
                          {dayName}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-dark-textMuted">{dateStr}</span>
                        <div className="my-2">{getWeatherIcon(day.weatherCode)}</div>
                        <div className="flex gap-1 text-sm">
                          <span className="font-bold text-red-500">{day.tempMax}°</span>
                          <span className="text-gray-400">/</span>
                          <span className="text-blue-500">{day.tempMin}°</span>
                        </div>
                        {day.precipitation > 0 && (
                          <span className="text-xs text-blue-500 mt-1">
                            {day.precipitation.toFixed(1)}mm
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-dark-textMuted text-center py-4">
                Wetter konnte nicht geladen werden
              </p>
            )}
          </div>

          {/* Dashboard Statistiken */}
          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-6 border border-transparent dark:border-dark-border">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-6 h-6 text-green-500" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
                Saison {dashboardStats?.saisonjahr || new Date().getFullYear()}
              </h2>
            </div>

            {statsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-green-500" />
              </div>
            ) : dashboardStats ? (
              <div className="grid grid-cols-2 gap-4">
                {/* Verkaufte Tonnen */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-dark-textMuted">Verkauft</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {dashboardStats.projektStats.verkaufteTonnen.toLocaleString('de-DE')} t
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
                    {dashboardStats.projektStats.anzahlBezahlt} Projekte bezahlt
                  </p>
                </div>

                {/* Bestellt */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-dark-textMuted">Bestellt</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {dashboardStats.projektStats.bestellteTonnen.toLocaleString('de-DE')} t
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
                    {dashboardStats.projektStats.anzahlBestellungen} Bestellungen
                  </p>
                </div>

                {/* Lager Ziegelmehl */}
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Boxes className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-dark-textMuted">Lager (Schütt)</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {dashboardStats.lagerBestand.ziegelmehlSchuettware.toLocaleString('de-DE')} t
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
                    Ziegelmehl Schüttware
                  </p>
                </div>

                {/* Kapazität */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-dark-textMuted">Kapazität</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {(dashboardStats.lagerBestand.verfuegbareTonnen || 0).toLocaleString('de-DE')} t
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
                    Verfügbar diese Saison
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-dark-textMuted text-center py-4">
                Statistiken konnten nicht geladen werden
              </p>
            )}
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {visibleTools.map((tool) => {
            const Icon = tool.icon;
            const content = (
              <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-6 hover:shadow-xl dark:hover:shadow-dark-xl transition-all duration-300 cursor-pointer hover:scale-105 border border-transparent dark:border-dark-border">
                <div
                  className={`w-16 h-16 rounded-lg bg-gradient-to-r ${tool.color} flex items-center justify-center mb-4 shadow-md`}
                >
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-dark-text mb-2 transition-colors duration-300">
                  {tool.name}
                </h3>
                <p className="text-gray-600 dark:text-dark-textMuted mb-4 transition-colors duration-300">{tool.description}</p>
              </div>
            );

            return (
              <Link key={tool.name} to={tool.href}>
                {content}
              </Link>
            );
          })}
        </div>

        {/* Info Section */}
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg p-8 border border-transparent dark:border-dark-border transition-all duration-300">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-4 transition-colors duration-300">
            Über diese Tools
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <Package className="w-6 h-6 text-red-600 dark:text-dark-accent flex-shrink-0 mt-1 transition-colors duration-300" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
                  Präzise Kalkulationen
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted transition-colors duration-300">
                  Alle Berechnungen basieren auf aktuellen Herstellungskosten
                  und Preismodellen.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="w-6 h-6 text-red-600 dark:text-dark-accent flex-shrink-0 mt-1 transition-colors duration-300" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
                  Aktuelle Daten
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted transition-colors duration-300">
                  Preise und Kalkulationen werden regelmäßig aktualisiert.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BarChart3 className="w-6 h-6 text-red-600 dark:text-dark-accent flex-shrink-0 mt-1 transition-colors duration-300" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-1 transition-colors duration-300">
                  Erweiterbar
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-textMuted transition-colors duration-300">
                  Weitere Tools können einfach hinzugefügt werden.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Erinnerungs-Popup (Instandhaltung + Kalender) */}
      {showReminderPopup && (overdueInfos.length > 0 || upcomingTermine.length > 0) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-dark-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white/20 rounded-xl">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-white">
                    Erinnerungen
                  </h2>
                  <p className="text-white/90 mt-1">
                    {overdueInfos.length > 0 && upcomingTermine.length > 0
                      ? `${overdueInfos.length} Instandhaltung${overdueInfos.length > 1 ? 'en' : ''} & ${upcomingTermine.length} Termin${upcomingTermine.length > 1 ? 'e' : ''}`
                      : overdueInfos.length > 0
                      ? `${overdueInfos.length} überfällige Begehung${overdueInfos.length > 1 ? 'en' : ''}`
                      : `${upcomingTermine.length} anstehende${upcomingTermine.length > 1 ? ' Termine' : 'r Termin'}`}
                  </p>
                </div>
                <button
                  onClick={handleDismissPopup}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Inhalt */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Instandhaltung Sektion */}
              {overdueInfos.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Wrench className="w-5 h-5 text-amber-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Überfällige Instandhaltung
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {overdueInfos.map((info) => {
                      const config = FREQUENZ_CONFIG[info.frequenz];
                      const items = checklistItems[info.frequenz] || [];
                      const isExpanded = expandedFrequenz === info.frequenz;

                      return (
                        <div
                          key={info.frequenz}
                          className="bg-amber-50 dark:bg-amber-900/20 rounded-xl overflow-hidden border border-amber-200 dark:border-amber-800"
                        >
                          <button
                            onClick={() => setExpandedFrequenz(isExpanded ? null : info.frequenz)}
                            className="w-full flex items-center justify-between p-3 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-r ${config.color} flex items-center justify-center flex-shrink-0`}>
                                <Wrench className="w-4 h-4 text-white" />
                              </div>
                              <div className="text-left">
                                <p className="font-medium text-gray-900 dark:text-white text-sm">
                                  {config.label}e Begehung
                                </p>
                                <p className="text-xs text-gray-500 dark:text-dark-textMuted">
                                  {formatLetzteBegehung(info)}
                                  {info.tageUeberfaellig > 0 && (
                                    <span className="text-red-500 ml-1">
                                      ({info.tageUeberfaellig} {info.tageUeberfaellig === 1 ? 'Tag' : 'Tage'} überfällig)
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {items.length > 0 && (
                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
                                  {items.length}
                                </span>
                              )}
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          </button>

                          {isExpanded && items.length > 0 && (
                            <div className="px-3 pb-3 space-y-1.5 border-t border-amber-200 dark:border-amber-800 pt-2">
                              {items.map((item) => (
                                <div key={item.id} className="flex items-start gap-2 text-xs">
                                  <Circle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                                  <span className="text-gray-700 dark:text-gray-300">{item.titel}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Kalender-Termine Sektion */}
              {upcomingTermine.length > 0 && (
                <div>
                  <button
                    onClick={() => setExpandedTermine(!expandedTermine)}
                    className="flex items-center justify-between w-full mb-3"
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-500" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Anstehende Termine
                      </h3>
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">
                        {upcomingTermine.length}
                      </span>
                    </div>
                    {expandedTermine ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>

                  {expandedTermine && (
                    <div className="space-y-2">
                      {upcomingTermine.slice(0, 5).map((termin) => (
                        <div
                          key={termin.id}
                          className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800"
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: termin.farbe || '#3b82f6' }}
                            >
                              <Clock className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                {termin.titel}
                              </p>
                              <p className="text-xs text-blue-600 dark:text-blue-400">
                                {formatTerminDatum(termin)}
                              </p>
                              {termin.ort && (
                                <p className="text-xs text-gray-500 dark:text-dark-textMuted truncate">
                                  {termin.ort}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {upcomingTermine.length > 5 && (
                        <p className="text-xs text-center text-gray-500 dark:text-dark-textMuted">
                          +{upcomingTermine.length - 5} weitere Termine
                        </p>
                      )}
                    </div>
                  )}

                  {!expandedTermine && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: upcomingTermine[0].farbe || '#3b82f6' }}
                        >
                          <Clock className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                            {upcomingTermine[0].titel}
                          </p>
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            {formatTerminDatum(upcomingTermine[0])}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-100 dark:border-dark-border space-y-2">
              {overdueInfos.length > 0 && (
                <button
                  onClick={handleGoToInstandhaltung}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:shadow-lg active:scale-98 transition-all"
                >
                  <Wrench className="w-5 h-5" />
                  <span>Zur Instandhaltung</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              {upcomingTermine.length > 0 && (
                <button
                  onClick={handleGoToKalender}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-xl hover:shadow-lg active:scale-98 transition-all"
                >
                  <Calendar className="w-5 h-5" />
                  <span>Zum Kalender</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handleDismissPopup}
                className="w-full px-4 py-3 text-gray-600 dark:text-dark-textMuted font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-dark-border transition-colors"
              >
                Später erinnern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;

