import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Check, History, TrendingUp, Trash2, Factory, X, Calendar, Clock, Package, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import { produktionService } from '../../services/produktionService';
import type { ProduktionsVerlauf, ProduktionsEintrag } from '../../types/produktion';
import SwipeWheelPicker, { playTickSound, triggerHaptic } from './SwipeWheelPicker';

// Hook für Mobile Detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Prüfe Bildschirmbreite UND Touch-Fähigkeit
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

// Mobile Vollbild-Version
const MobileProduktionsTracker: React.FC<{
  tonnen: number;
  setTonnen: (v: number) => void;
  onSave: () => void;
  saving: boolean;
  success: boolean;
  heuteProduktion: number;
  statistik: { gesamtTonnen: number; durchschnittProTag: number };
}> = ({ tonnen, setTonnen, onSave, saving, success, heuteProduktion, statistik }) => {

  // Verhindere jeden Scroll auf dieser Seite
  useEffect(() => {
    // Body overflow hidden
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalHeight = document.body.style.height;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.height = '100%';
    document.body.style.touchAction = 'none';
    document.body.style.width = '100%';

    // Verhindere Pull-to-Refresh und Bounce
    const preventScroll = (e: TouchEvent) => {
      // Erlaube Touch nur im Wheel-Bereich
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
      style={{
        height: '100dvh', // Dynamic viewport height für Mobile
        touchAction: 'none',
      }}
    >
      {/* Kompakter Header - nur Logo und Statistik */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 safe-area-inset-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg">
              <Factory className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">Produktion</span>
          </div>

          {/* Mini Stats */}
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

      {/* Wheel Picker - nimmt den Rest des Platzes */}
      <div
        className="flex-1 flex flex-col justify-center px-4"
        data-wheel-area="true"
      >
        <SwipeWheelPicker
          value={tonnen}
          onChange={setTonnen}
          min={1}
          max={500}
          step={1}
          unit="Tonnen"
          quickValues={[5, 10, 25, 50]}
          sensitivity={12} // Weniger empfindlich für Mobile
        />
      </div>

      {/* Eintragen Button - fest am unteren Rand */}
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
            ${!saving && !success ? 'shadow-orange-500/40' : ''}
            ${success ? 'shadow-green-500/40' : ''}
          `}
        >
          {/* Shimmer Effect */}
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

      {/* Custom CSS */}
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

// Desktop Version mit Kalender für rückwirkende Einträge
const DesktopProduktionsTracker: React.FC<{
  tonnen: number;
  setTonnen: (v: number) => void;
  onSave: (datum?: string) => void;
  saving: boolean;
  success: boolean;
  verlauf: ProduktionsVerlauf;
  onDelete: (id: string) => void;
  deleteId: string | null;
  statistik: { gesamtTonnen: number; durchschnittProTag: number; tagesProduktionen: { datum: string; tonnen: number }[] };
}> = ({ tonnen, setTonnen, onSave, saving, success, verlauf, onDelete, deleteId, statistik }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showHistory, setShowHistory] = useState(false);

  // Heute's Produktion
  const heuteProduktion = statistik.tagesProduktionen.find(
    t => t.datum === new Date().toISOString().split('T')[0]
  )?.tonnen || 0;

  // Ausgewählter Tag Produktion
  const selectedDayProduktion = statistik.tagesProduktionen.find(
    t => t.datum === selectedDate
  )?.tonnen || 0;

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  // Formatiere Datum
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

  // Letzte 7 Tage für Quick-Navigation
  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  }, []);

  // Einträge für ausgewählten Tag
  const entriesForSelectedDay = verlauf.eintraege.filter(e => e.datum === selectedDate);

  // Group entries by date for history view
  const groupedEntries = verlauf.eintraege.slice(0, 100).reduce((acc, entry) => {
    const date = entry.datum;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, ProduktionsEintrag[]>);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-gray-900 dark:via-gray-850 dark:to-gray-800">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border-b border-orange-200/50 dark:border-gray-700/50 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Ziegelmehl-Produktion erfassen</p>
              </div>
            </div>

            <button
              onClick={() => {
                setShowHistory(!showHistory);
                playTickSound('medium');
                triggerHaptic('tick');
              }}
              className={`
                px-4 py-2.5 rounded-xl font-medium flex items-center gap-2
                transition-all duration-300
                ${showHistory
                  ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-md hover:shadow-lg'
                }
              `}
            >
              {showHistory ? <X className="w-5 h-5" /> : <History className="w-5 h-5" />}
              {showHistory ? 'Schließen' : 'Verlauf'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {/* Today */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-amber-500 rounded-2xl blur-lg opacity-30 group-hover:opacity-40 transition-opacity" />
            <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-orange-200/30 dark:border-orange-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-orange-500" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Heute</p>
              </div>
              <p className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                {heuteProduktion}t
              </p>
            </div>
          </div>

          {/* Selected Day (if not today) */}
          {!isToday && (
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl blur-lg opacity-30 group-hover:opacity-40 transition-opacity" />
              <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-blue-200/30 dark:border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Edit2 className="w-4 h-4 text-blue-500" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{formatDatum(selectedDate)}</p>
                </div>
                <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {selectedDayProduktion}t
                </p>
              </div>
            </div>
          )}

          {/* 30 Days */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-2xl blur-lg opacity-30 group-hover:opacity-40 transition-opacity" />
            <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-amber-200/30 dark:border-amber-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">30 Tage</p>
              </div>
              <p className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent">
                {statistik.gesamtTonnen.toFixed(0)}t
              </p>
            </div>
          </div>

          {/* Average */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl blur-lg opacity-30 group-hover:opacity-40 transition-opacity" />
            <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-green-200/30 dark:border-green-500/20">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ø/Tag</p>
              </div>
              <p className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {statistik.durchschnittProTag.toFixed(1)}t
              </p>
            </div>
          </div>
        </div>

        {showHistory ? (
          /* History View */
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-orange-500" />
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
              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                {Object.entries(groupedEntries).map(([date, entries]) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-orange-300/50 to-transparent" />
                      <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-xs font-semibold">
                        {formatDatum(date)} - {entries.reduce((sum, e) => sum + e.tonnen, 0)}t gesamt
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-l from-orange-300/50 to-transparent" />
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {entries.map((eintrag) => (
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
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold shadow-md">
                              {eintrag.tonnen}t
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                              <Clock className="w-4 h-4" />
                              <span className="font-medium">{formatZeit(eintrag.zeitpunkt)}</span>
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
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Main Entry View */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Date Selection Panel */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-500" />
                Datum auswählen
              </h3>

              {/* Quick Date Buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {last7Days.map((date) => {
                  const dayProd = statistik.tagesProduktionen.find(t => t.datum === date)?.tonnen || 0;
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
                      {dayProd > 0 && (
                        <div className="text-xs opacity-75">{dayProd}t</div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Date Input */}
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

              {/* Entries for selected day */}
              {entriesForSelectedDay.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Einträge für {formatDatum(selectedDate)}
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {entriesForSelectedDay.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-orange-600 dark:text-orange-400">{entry.tonnen}t</span>
                          <span className="text-sm text-gray-500">{formatZeit(entry.zeitpunkt)}</span>
                        </div>
                        <button
                          onClick={() => onDelete(entry.id!)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
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

              {/* Tonnen Quick Select */}
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

              {/* Manual Input */}
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

              {/* Save Button */}
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
                  <>
                    <Check className="w-6 h-6" />
                    <span>Eingetragen!</span>
                  </>
                ) : saving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Speichern...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-6 h-6" />
                    <span>{tonnen}t eintragen</span>
                  </>
                )}
              </button>
            </div>
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
  const [verlauf, setVerlauf] = useState<ProduktionsVerlauf>({ eintraege: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Lade Verlauf beim Start
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

  // Eintrag speichern
  const handleSave = async (datum?: string) => {
    if (saving) return;

    setSaving(true);
    setSuccess(false);

    try {
      await produktionService.addEintrag(tonnen, datum);
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

  // Eintrag löschen
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

  // Statistiken
  const statistik = produktionService.getStatistik(verlauf, 30);

  // Heute's Produktion
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

  // Mobile oder Desktop View
  if (isMobile) {
    return (
      <MobileProduktionsTracker
        tonnen={tonnen}
        setTonnen={setTonnen}
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
      onSave={handleSave}
      saving={saving}
      success={success}
      verlauf={verlauf}
      onDelete={handleDelete}
      deleteId={deleteId}
      statistik={statistik}
    />
  );
};

export default ProduktionsTracker;
