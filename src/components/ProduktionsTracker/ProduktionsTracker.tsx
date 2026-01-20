import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Check, History, TrendingUp, Trash2, Factory, ChevronUp, ChevronDown } from 'lucide-react';
import { produktionService } from '../../services/produktionService';
import type { ProduktionsVerlauf } from '../../types/produktion';

const ProduktionsTracker: React.FC = () => {
  const [tonnen, setTonnen] = useState(10);
  const [verlauf, setVerlauf] = useState<ProduktionsVerlauf>({ eintraege: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showVerlauf, setShowVerlauf] = useState(false);

  // Touch/Drag state
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startValueRef = useRef(0);
  const wheelRef = useRef<HTMLDivElement>(null);

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

  // Handle Wheel Scroll
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    setTonnen(prev => Math.max(1, Math.min(500, prev + delta)));

    // Haptic feedback on mobile
    if (navigator.vibrate) {
      navigator.vibrate(5);
    }
  }, []);

  useEffect(() => {
    const wheel = wheelRef.current;
    if (wheel) {
      wheel.addEventListener('wheel', handleWheel, { passive: false });
      return () => wheel.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    startYRef.current = e.touches[0].clientY;
    startValueRef.current = tonnen;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const currentY = e.touches[0].clientY;
    const diff = startYRef.current - currentY;
    const sensitivity = 3; // Pixel pro Tonne
    const delta = Math.round(diff / sensitivity);

    const newValue = Math.max(1, Math.min(500, startValueRef.current + delta));

    if (newValue !== tonnen) {
      setTonnen(newValue);
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(3);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Mouse handlers (for desktop)
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValueRef.current = tonnen;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    const diff = startYRef.current - e.clientY;
    const sensitivity = 3;
    const delta = Math.round(diff / sensitivity);

    const newValue = Math.max(1, Math.min(500, startValueRef.current + delta));
    setTonnen(newValue);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Increment/Decrement
  const increment = (amount: number) => {
    setTonnen(prev => Math.max(1, Math.min(500, prev + amount)));
    if (navigator.vibrate) navigator.vibrate(10);
  };

  // Eintrag speichern
  const handleEintragen = async () => {
    if (saving) return;

    setSaving(true);
    setSuccess(false);

    try {
      await produktionService.addEintrag(tonnen);
      setSuccess(true);

      // Vibration feedback
      if (navigator.vibrate) {
        navigator.vibrate([50, 50, 50]);
      }

      // Reload Verlauf
      await loadVerlauf();

      // Reset success nach 2 Sekunden
      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    } finally {
      setSaving(false);
    }
  };

  // Eintrag löschen
  const handleDelete = async (eintragId: string) => {
    if (!confirm('Eintrag wirklich löschen? Der Lagerbestand wird entsprechend reduziert.')) return;

    try {
      await produktionService.deleteEintrag(eintragId);
      await loadVerlauf();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  };

  // Statistiken
  const statistik = produktionService.getStatistik(verlauf, 30);

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

  // Generiere Wheel-Nummern
  const generateWheelNumbers = () => {
    const numbers = [];
    for (let i = -3; i <= 3; i++) {
      const value = tonnen + i;
      if (value >= 1 && value <= 500) {
        numbers.push({ value, offset: i });
      } else {
        numbers.push({ value: null, offset: i });
      }
    }
    return numbers;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-pulse text-orange-600 dark:text-orange-400">
          <Factory className="w-16 h-16 animate-bounce" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 dark:from-gray-900 dark:to-gray-800 pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-orange-200 dark:border-gray-700">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg">
                <Factory className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">Produktion</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ziegelmehl erfassen</p>
              </div>
            </div>
            <button
              onClick={() => setShowVerlauf(!showVerlauf)}
              className={`p-2 rounded-xl transition-all ${
                showVerlauf
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              <History className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Statistik-Karten */}
      <div className="px-4 py-4 grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 shadow-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">Heute</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
            {statistik.tagesProduktionen.find(t => t.datum === new Date().toISOString().split('T')[0])?.tonnen || 0}t
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 shadow-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">30 Tage</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{statistik.gesamtTonnen.toFixed(0)}t</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 shadow-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">Ø/Tag</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{statistik.durchschnittProTag.toFixed(1)}t</p>
        </div>
      </div>

      {/* Hauptbereich: Wheel Picker */}
      {!showVerlauf ? (
        <div className="px-4 py-6 flex flex-col items-center">
          {/* Quick-Buttons */}
          <div className="flex gap-2 mb-6">
            {[5, 10, 25, 50].map(v => (
              <button
                key={v}
                onClick={() => setTonnen(v)}
                className={`px-4 py-2 rounded-xl font-medium transition-all ${
                  tonnen === v
                    ? 'bg-orange-500 text-white shadow-lg scale-105'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow'
                }`}
              >
                {v}t
              </button>
            ))}
          </div>

          {/* Wheel Container */}
          <div className="relative w-full max-w-xs">
            {/* Up Button */}
            <button
              onClick={() => increment(1)}
              onMouseDown={(e) => e.preventDefault()}
              className="w-full flex justify-center py-2 text-gray-400 dark:text-gray-500 active:text-orange-500 transition-colors"
            >
              <ChevronUp className="w-8 h-8" />
            </button>

            {/* Wheel */}
            <div
              ref={wheelRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              className={`
                relative h-64 overflow-hidden select-none cursor-grab
                ${isDragging ? 'cursor-grabbing' : ''}
              `}
            >
              {/* Gradient Overlays */}
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-orange-50 dark:from-gray-900 to-transparent z-10 pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-orange-50 dark:from-gray-900 to-transparent z-10 pointer-events-none" />

              {/* Center Highlight */}
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 bg-gradient-to-r from-orange-500/20 via-orange-500/30 to-orange-500/20 dark:from-orange-500/30 dark:via-orange-500/40 dark:to-orange-500/30 rounded-2xl border-2 border-orange-500/50 z-5" />

              {/* Numbers */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {generateWheelNumbers().map((item, index) => {
                  const isCenter = item.offset === 0;
                  const opacity = 1 - Math.abs(item.offset) * 0.25;
                  const scale = isCenter ? 1 : 1 - Math.abs(item.offset) * 0.1;
                  const translateY = item.offset * 36;

                  return (
                    <div
                      key={index}
                      className="absolute transition-all duration-100"
                      style={{
                        transform: `translateY(${translateY}px) scale(${scale})`,
                        opacity: item.value ? opacity : 0,
                      }}
                    >
                      <span
                        className={`
                          text-5xl font-bold tabular-nums
                          ${isCenter
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-gray-400 dark:text-gray-500'
                          }
                        `}
                      >
                        {item.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Down Button */}
            <button
              onClick={() => increment(-1)}
              onMouseDown={(e) => e.preventDefault()}
              className="w-full flex justify-center py-2 text-gray-400 dark:text-gray-500 active:text-orange-500 transition-colors"
            >
              <ChevronDown className="w-8 h-8" />
            </button>

            {/* Unit Label */}
            <div className="text-center mt-2">
              <span className="text-2xl font-semibold text-gray-500 dark:text-gray-400">Tonnen</span>
            </div>
          </div>

          {/* Eintragen Button */}
          <button
            onClick={handleEintragen}
            disabled={saving}
            className={`
              mt-8 w-full max-w-xs py-5 rounded-2xl font-bold text-xl
              flex items-center justify-center gap-3
              transition-all duration-300 transform
              ${success
                ? 'bg-green-500 text-white scale-95'
                : saving
                  ? 'bg-orange-400 text-white'
                  : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-xl shadow-orange-500/30 active:scale-95'
              }
            `}
          >
            {success ? (
              <>
                <Check className="w-7 h-7" />
                Eingetragen!
              </>
            ) : saving ? (
              <>
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                Speichern...
              </>
            ) : (
              <>
                <Plus className="w-7 h-7" />
                Eintragen
              </>
            )}
          </button>

          {/* Hinweis */}
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Swipe hoch/runter oder scroll um Tonnen anzupassen
          </p>
        </div>
      ) : (
        /* Verlauf Ansicht */
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              Produktionsverlauf
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {verlauf.eintraege.length} Einträge
            </span>
          </div>

          {verlauf.eintraege.length === 0 ? (
            <div className="text-center py-12">
              <Factory className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Noch keine Einträge</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Erfasse deine erste Produktion!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {verlauf.eintraege.slice(0, 50).map((eintrag) => (
                <div
                  key={eintrag.id}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-lg flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg">
                      {eintrag.tonnen}t
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatDatum(eintrag.datum)}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatZeit(eintrag.zeitpunkt)} Uhr
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(eintrag.id!)}
                    className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Zurück Button */}
          <button
            onClick={() => setShowVerlauf(false)}
            className="mt-6 w-full py-4 rounded-2xl bg-white dark:bg-gray-800 shadow-lg font-semibold text-gray-700 dark:text-gray-300"
          >
            Zurück zur Erfassung
          </button>
        </div>
      )}
    </div>
  );
};

export default ProduktionsTracker;
