import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Check, History, TrendingUp, Trash2, Factory, X, Calendar, Clock, Package } from 'lucide-react';
import { produktionService } from '../../services/produktionService';
import type { ProduktionsVerlauf } from '../../types/produktion';
import SwipeWheelPicker, { playTickSound, triggerHaptic } from './SwipeWheelPicker';

const ProduktionsTracker: React.FC = () => {
  const [tonnen, setTonnen] = useState(10);
  const [verlauf, setVerlauf] = useState<ProduktionsVerlauf>({ eintraege: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showVerlauf, setShowVerlauf] = useState(false);
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

  // Handle wheel value change
  const handleValueChange = useCallback((newValue: number) => {
    setTonnen(newValue);
  }, []);

  // Eintrag speichern
  const handleEintragen = async () => {
    if (saving) return;

    setSaving(true);
    setSuccess(false);

    try {
      await produktionService.addEintrag(tonnen);
      setSuccess(true);

      // Premium success feedback
      playTickSound('success');
      triggerHaptic('success');

      // Reload Verlauf
      await loadVerlauf();

      // Reset success nach 2.5 Sekunden
      setTimeout(() => setSuccess(false), 2500);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      playTickSound('limit');
      triggerHaptic('limit');
    } finally {
      setSaving(false);
    }
  };

  // Eintrag löschen mit Animation
  const handleDelete = async (eintragId: string) => {
    try {
      setDeleteId(eintragId);
      await new Promise(resolve => setTimeout(resolve, 300)); // Animation delay

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

  // Group entries by date for better display
  const groupedEntries = verlauf.eintraege.slice(0, 50).reduce((acc, entry) => {
    const date = entry.datum;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, typeof verlauf.eintraege>);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-gray-900 dark:via-gray-850 dark:to-gray-800 pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border-b border-orange-200/50 dark:border-gray-700/50 shadow-sm">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-orange-500/40 rounded-xl blur-md" />
                <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg">
                  <Factory className="w-6 h-6" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Produktion</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ziegelmehl erfassen</p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowVerlauf(!showVerlauf);
                playTickSound('medium');
                triggerHaptic('tick');
              }}
              className={`
                relative p-2.5 rounded-xl transition-all duration-300 transform active:scale-95
                ${showVerlauf
                  ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }
              `}
            >
              {showVerlauf ? <X className="w-5 h-5" /> : <History className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Cards - Premium Design */}
      <div className="px-4 py-5">
        <div className="grid grid-cols-3 gap-3">
          {/* Today */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-amber-500 rounded-2xl blur-lg opacity-30 group-hover:opacity-40 transition-opacity" />
            <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-orange-200/30 dark:border-orange-500/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-orange-500" />
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Heute</p>
              </div>
              <p className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                {heuteProduktion}t
              </p>
            </div>
          </div>

          {/* 30 Days */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-2xl blur-lg opacity-30 group-hover:opacity-40 transition-opacity" />
            <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-amber-200/30 dark:border-amber-500/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Package className="w-3.5 h-3.5 text-amber-500" />
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">30 Tage</p>
              </div>
              <p className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent">
                {statistik.gesamtTonnen.toFixed(0)}t
              </p>
            </div>
          </div>

          {/* Average */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl blur-lg opacity-30 group-hover:opacity-40 transition-opacity" />
            <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-green-200/30 dark:border-green-500/20">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Ø/Tag</p>
              </div>
              <p className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {statistik.durchschnittProTag.toFixed(1)}t
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`relative overflow-hidden ${showVerlauf ? 'min-h-[60vh]' : ''}`}>
        {/* Wheel Picker View */}
        <div
          className={`
            transition-all duration-500 ease-out
            ${showVerlauf ? 'opacity-0 scale-95 pointer-events-none absolute inset-0' : 'opacity-100 scale-100'}
          `}
        >
          <div className="px-4 py-4">
            <SwipeWheelPicker
              value={tonnen}
              onChange={handleValueChange}
              min={1}
              max={500}
              step={1}
              unit="Tonnen"
              quickValues={[5, 10, 25, 50]}
            />

            {/* Submit Button - Premium */}
            <div className="mt-8 px-4">
              <button
                onClick={handleEintragen}
                disabled={saving}
                className={`
                  relative w-full py-5 rounded-2xl font-bold text-xl
                  flex items-center justify-center gap-3
                  transition-all duration-500 transform overflow-hidden
                  ${success
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 scale-[0.98]'
                    : saving
                      ? 'bg-gradient-to-r from-orange-400 to-amber-400'
                      : 'bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 hover:from-orange-600 hover:via-orange-600 hover:to-amber-600 active:scale-[0.98]'
                  }
                  text-white shadow-2xl
                  ${!saving && !success ? 'shadow-orange-500/40 hover:shadow-orange-500/50' : ''}
                  ${success ? 'shadow-green-500/40' : ''}
                `}
              >
                {/* Animated background shine */}
                {!saving && !success && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
                )}

                {/* Success ripple effect */}
                {success && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-full bg-white/20 rounded-full animate-ping" />
                  </div>
                )}

                {success ? (
                  <>
                    <div className="relative">
                      <Check className="w-8 h-8 animate-bounce" />
                    </div>
                    <span className="relative">{tonnen}t eingetragen!</span>
                  </>
                ) : saving ? (
                  <>
                    <div className="relative w-7 h-7">
                      <div className="absolute inset-0 border-3 border-white/30 rounded-full" />
                      <div className="absolute inset-0 border-3 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
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
          </div>
        </div>

        {/* History View */}
        <div
          className={`
            transition-all duration-500 ease-out
            ${showVerlauf ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}
          `}
        >
          <div className="px-4 py-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-orange-500" />
                Verlauf
              </h2>
              <span className="px-3 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-sm font-medium">
                {verlauf.eintraege.length} Einträge
              </span>
            </div>

            {verlauf.eintraege.length === 0 ? (
              <div className="text-center py-16">
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 rounded-full blur-xl opacity-50" />
                  <Factory className="relative w-20 h-20 text-gray-300 dark:text-gray-600 mb-4" />
                </div>
                <p className="text-lg font-medium text-gray-500 dark:text-gray-400">Noch keine Einträge</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Erfasse deine erste Produktion!
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedEntries).map(([date, entries]) => (
                  <div key={date}>
                    {/* Date Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-orange-300/50 to-transparent dark:from-orange-600/30" />
                      <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-xs font-semibold">
                        {formatDatum(date)}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-l from-orange-300/50 to-transparent dark:from-orange-600/30" />
                    </div>

                    {/* Entries for this date */}
                    <div className="space-y-2">
                      {entries.map((eintrag) => (
                        <div
                          key={eintrag.id}
                          className={`
                            bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-4 shadow-lg
                            border border-gray-100 dark:border-gray-700/50
                            flex items-center justify-between
                            transition-all duration-300
                            ${deleteId === eintrag.id ? 'opacity-0 scale-95 translate-x-4' : 'opacity-100'}
                          `}
                        >
                          <div className="flex items-center gap-4">
                            {/* Value Badge */}
                            <div className="relative">
                              <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl blur opacity-40" />
                              <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                {eintrag.tonnen}t
                              </div>
                            </div>

                            {/* Time */}
                            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                              <Clock className="w-4 h-4" />
                              <span className="font-medium">{formatZeit(eintrag.zeitpunkt)} Uhr</span>
                            </div>
                          </div>

                          {/* Delete Button */}
                          <button
                            onClick={() => {
                              if (confirm('Eintrag wirklich löschen? Der Lagerbestand wird entsprechend reduziert.')) {
                                handleDelete(eintrag.id!);
                              }
                            }}
                            className="
                              p-3 rounded-xl
                              text-gray-400 hover:text-red-500 dark:hover:text-red-400
                              hover:bg-red-50 dark:hover:bg-red-900/20
                              transition-all duration-200
                              active:scale-95
                            "
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Back Button */}
            <button
              onClick={() => {
                setShowVerlauf(false);
                playTickSound('medium');
                triggerHaptic('tick');
              }}
              className="
                mt-8 w-full py-4 rounded-2xl
                bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
                shadow-lg border border-gray-100 dark:border-gray-700/50
                font-semibold text-gray-700 dark:text-gray-300
                transition-all duration-200
                active:scale-[0.98] hover:shadow-xl
              "
            >
              ← Zurück zur Erfassung
            </button>
          </div>
        </div>
      </div>

      {/* Custom CSS for animations */}
      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default ProduktionsTracker;
