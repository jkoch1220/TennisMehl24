import { useState, useEffect, useRef } from 'react';
import { Calculator, Euro, TrendingUp, Settings } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FixkostenInput } from '../types';
import { berechneFixkosten } from '../utils/fixkostenCalculations';
import { DEFAULT_FIXKOSTEN } from '../constants/defaultValues';
import { fixkostenService } from '../services/fixkostenService';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];

const FixkostenRechner = () => {
  const [input, setInput] = useState<FixkostenInput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Formatierungsfunktion für Zahlen mit Tausendertrenner (Leerzeichen)
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(value).replace(/\./g, ' '); // Punkt durch Leerzeichen ersetzen für Tausendertrenner
  };

  // Lade Daten beim Mount - KEINE Default-Werte anzeigen
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const savedData = await fixkostenService.loadFixkosten();
        if (savedData) {
          setInput(savedData);
        } else {
          // Nur wenn keine Daten vorhanden sind, Default-Werte verwenden
          setInput(DEFAULT_FIXKOSTEN);
        }
      } catch (error) {
        console.error('Fehler beim Laden der Fixkosten:', error);
        // Bei Fehler auch Default-Werte verwenden
        setInput(DEFAULT_FIXKOSTEN);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Berechne Ergebnis nur wenn input vorhanden ist
  const ergebnis = input ? berechneFixkosten(input) : null;

  // Auto-Save mit kurzem Debouncing (speichere 500ms nach letzter Änderung)
  useEffect(() => {
    if (isLoading || !input) return; // Nicht speichern während des Ladens oder wenn keine Daten

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        console.log('💾 Speichere Fixkosten...', input);
        await fixkostenService.saveFixkosten(input);
        console.log('✅ Fixkosten erfolgreich gespeichert');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000); // Nach 3 Sekunden ausblenden
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler beim Speichern';
        console.error('❌ Fehler beim Speichern der Fixkosten:', error);
        setSaveError(errorMessage);
        // Fehler nach 5 Sekunden ausblenden
        setTimeout(() => setSaveError(null), 5000);
      } finally {
        setIsSaving(false);
      }
    }, 500); // 500ms Debounce für schnelleres Speichern

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [input, isLoading]);

  // Jahresfixkosten im localStorage speichern für Variable-Kosten-Rechner
  useEffect(() => {
    if (ergebnis) {
      localStorage.setItem('fixkostenProJahr', ergebnis.fixkostenProJahr.toString());
    }
  }, [ergebnis]);

  // Zeige Loading-Screen während Daten geladen werden (NACH allen Hooks!)
  if (isLoading || !input || !ergebnis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade Daten aus der Datenbank...</p>
        </div>
      </div>
    );
  }

  const pieData = [
    { name: 'Grundstück', value: ergebnis.jahreskostenGrundstueck },
    { name: 'Maschinen', value: ergebnis.jahreskostenMaschinen },
    { name: 'Rücklagen', value: ergebnis.ruecklagenErsatzkauf },
    { name: 'Sonstiges', value: ergebnis.sonstiges },
    { name: 'Verwaltung', value: ergebnis.grundkostenVerwaltung },
  ];

  const barData = [
    { name: 'Grundstück', Wert: ergebnis.jahreskostenGrundstueck },
    { name: 'Maschinen', Wert: ergebnis.jahreskostenMaschinen },
    { name: 'Rücklagen', Wert: ergebnis.ruecklagenErsatzkauf },
    { name: 'Sonstiges', Wert: ergebnis.sonstiges },
    { name: 'Verwaltung', Wert: ergebnis.grundkostenVerwaltung },
  ];

  const updateGrundstueck = (field: keyof FixkostenInput['grundstueck'], value: number) => {
    setInput(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        grundstueck: { ...prev.grundstueck, [field]: value }
      };
    });
  };

  const updateMaschinen = (field: keyof FixkostenInput['maschinen'], value: number) => {
    setInput(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        maschinen: { ...prev.maschinen, [field]: value }
      };
    });
  };

  const updateVerwaltung = (field: keyof FixkostenInput['verwaltung'], value: number) => {
    setInput(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        verwaltung: { ...prev.verwaltung, [field]: value }
      };
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_40px_rgb(0,0,0,0.16)] transition-all duration-300 p-6 md:p-8 mb-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-red-500 to-orange-500 p-3 rounded-2xl shadow-lg">
                <Calculator className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
                  Fixkosten Rechner
                </h1>
                <p className="text-sm text-gray-500 mt-1">Ziegelmehl Herstellung 2026</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {isSaving && (
                <div className="text-sm text-gray-500 flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full shadow-sm">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  Speichere...
                </div>
              )}
              {!isSaving && !isLoading && saveSuccess && (
                <div className="text-sm text-green-600 flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full shadow-sm animate-in fade-in duration-300">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Gespeichert
                </div>
              )}
              {saveError && (
                <div className="text-sm text-red-600 flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-full shadow-sm">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  Fehler: {saveError}
                </div>
              )}
            </div>
          </div>

          {/* Ergebnis Highlight */}
          <div className="relative bg-gradient-to-r from-red-600 via-red-500 to-orange-600 p-8 rounded-2xl text-white mb-8 shadow-[0_10px_40px_-10px_rgba(239,68,68,0.5)] hover:shadow-[0_15px_50px_-10px_rgba(239,68,68,0.6)] transition-all duration-300 overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
            <div className="relative text-center">
              <p className="text-sm opacity-90 mb-2 font-medium tracking-wide uppercase">Fixkosten pro Jahr</p>
              <p className="text-5xl md:text-6xl font-bold mb-1 drop-shadow-lg">{formatNumber(ergebnis.fixkostenProJahr)} €</p>
              <p className="text-sm opacity-90 mt-3 max-w-2xl mx-auto">
                Diese Jahresfixkosten werden automatisch an den Variable-Kosten-Rechner übergeben
              </p>
            </div>
          </div>

          {/* Diagramme */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_30px_rgba(0,0,0,0.12)] transition-all duration-300 border border-gray-100 group">
              <div className="flex items-center gap-2 mb-6">
                <div className="bg-gradient-to-br from-orange-500 to-red-500 p-2 rounded-xl shadow-md group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">
                  Kostenverteilung (Kreisdiagramm)
                </h3>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-inner">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `${formatNumber(value)} €`}
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: 'none',
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        padding: '12px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_30px_rgba(0,0,0,0.12)] transition-all duration-300 border border-gray-100 group">
              <div className="flex items-center gap-2 mb-6">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-500 p-2 rounded-xl shadow-md group-hover:scale-110 transition-transform duration-300">
                  <Euro className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">
                  Kostenverteilung (Balkendiagramm)
                </h3>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-inner">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => `${formatNumber(value)} €`}
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: 'none',
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        padding: '12px'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Wert" fill="#f97316" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Eingabefelder */}
          <div className="space-y-6">
            {/* Grundstück */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50/50 p-6 rounded-2xl border border-green-200 shadow-[0_4px_20px_rgba(34,197,94,0.15)] hover:shadow-[0_6px_30px_rgba(34,197,94,0.2)] transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-2.5 rounded-xl shadow-md group-hover:scale-110 transition-transform duration-300">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">
                  Grundstück
                </h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pacht (€)
                  </label>
                  <input
                    type="number"
                    value={input.grundstueck.pacht}
                    onChange={(e) => updateGrundstueck('pacht', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-green-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Steuer (€)
                  </label>
                  <input
                    type="number"
                    value={input.grundstueck.steuer}
                    onChange={(e) => updateGrundstueck('steuer', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-green-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pflege (€)
                  </label>
                  <input
                    type="number"
                    value={input.grundstueck.pflege}
                    onChange={(e) => updateGrundstueck('pflege', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-green-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Bürocontainer (€)
                  </label>
                  <input
                    type="number"
                    value={input.grundstueck.buerocontainer}
                    onChange={(e) => updateGrundstueck('buerocontainer', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-green-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
              </div>
              <div className="mt-6 p-4 bg-gradient-to-r from-green-100 to-emerald-100 rounded-xl shadow-inner border border-green-200">
                <p className="text-sm font-semibold text-gray-700 flex items-center justify-between">
                  <span>Jahreskosten Grundstück:</span>
                  <span className="text-lg text-green-700 font-bold">{formatNumber(ergebnis.jahreskostenGrundstueck)} €</span>
                </p>
              </div>
            </div>

            {/* Maschinen */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-6 rounded-2xl border border-blue-200 shadow-[0_4px_20px_rgba(59,130,246,0.15)] hover:shadow-[0_6px_30px_rgba(59,130,246,0.2)] transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl shadow-md group-hover:scale-110 transition-transform duration-300">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">
                  Maschinen
                </h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Wartung Radlader (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungRadlader}
                    onChange={(e) => updateMaschinen('wartungRadlader', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Wartung Stapler (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungStapler}
                    onChange={(e) => updateMaschinen('wartungStapler', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Wartung Mühle (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungMuehle}
                    onChange={(e) => updateMaschinen('wartungMuehle', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Wartung Siebanlage (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungSiebanlage}
                    onChange={(e) => updateMaschinen('wartungSiebanlage', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Wartung Absackanlage (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungAbsackanlage}
                    onChange={(e) => updateMaschinen('wartungAbsackanlage', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Sonstige Wartung (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.sonstigeWartung}
                    onChange={(e) => updateMaschinen('sonstigeWartung', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Grundkosten Maschinen (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.grundkostenMaschinen}
                    onChange={(e) => updateMaschinen('grundkostenMaschinen', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
              </div>
              <div className="mt-6 p-4 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-xl shadow-inner border border-blue-200">
                <p className="text-sm font-semibold text-gray-700 flex items-center justify-between">
                  <span>Jahreskosten Maschinen:</span>
                  <span className="text-lg text-blue-700 font-bold">{formatNumber(ergebnis.jahreskostenMaschinen)} €</span>
                </p>
              </div>
            </div>

            {/* Rücklagen */}
            <div className="bg-gradient-to-br from-purple-50 to-violet-50/50 p-6 rounded-2xl border border-purple-200 shadow-[0_4px_20px_rgba(139,92,246,0.15)] hover:shadow-[0_6px_30px_rgba(139,92,246,0.2)] transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-gradient-to-br from-purple-500 to-violet-600 p-2.5 rounded-xl shadow-md group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Rücklagen für Ersatzkäufe</h2>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Rücklagen (€)
                </label>
                <input
                  type="number"
                  value={input.ruecklagenErsatzkauf}
                  onChange={(e) => setInput(prev => prev ? ({ ...prev, ruecklagenErsatzkauf: parseFloat(e.target.value) || 0 }) : prev)}
                  className="w-full p-3 bg-white border-2 border-purple-200 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                />
              </div>
            </div>

            {/* Sonstiges */}
            <div className="bg-gradient-to-br from-gray-50 to-slate-50/50 p-6 rounded-2xl border border-gray-200 shadow-[0_4px_20px_rgba(107,114,128,0.15)] hover:shadow-[0_6px_30px_rgba(107,114,128,0.2)] transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-gradient-to-br from-gray-500 to-slate-600 p-2.5 rounded-xl shadow-md group-hover:scale-110 transition-transform duration-300">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Sonstiges</h2>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Sonstige Kosten (€) - Versicherungen, Ämter, Prüfung Anlage
                </label>
                <input
                  type="number"
                  value={input.sonstiges}
                  onChange={(e) => setInput(prev => prev ? ({ ...prev, sonstiges: parseFloat(e.target.value) || 0 }) : prev)}
                  className="w-full p-3 bg-white border-2 border-gray-200 rounded-xl focus:border-gray-500 focus:ring-2 focus:ring-gray-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                />
              </div>
            </div>

            {/* Verwaltung */}
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50/50 p-6 rounded-2xl border border-indigo-200 shadow-[0_4px_20px_rgba(99,102,241,0.15)] hover:shadow-[0_6px_30px_rgba(99,102,241,0.2)] transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-2.5 rounded-xl shadow-md group-hover:scale-110 transition-transform duration-300">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">
                  Grundkosten Verwaltung
                </h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    BRZ, Steuerberater (€)
                  </label>
                  <input
                    type="number"
                    value={input.verwaltung.brzSteuerberater}
                    onChange={(e) => updateVerwaltung('brzSteuerberater', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-indigo-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Telefon, Cloud, Server (€)
                  </label>
                  <input
                    type="number"
                    value={input.verwaltung.telefonCloudServer}
                    onChange={(e) => updateVerwaltung('telefonCloudServer', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-indigo-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    GF Gehalt (€)
                  </label>
                  <input
                    type="number"
                    value={input.verwaltung.gfGehalt}
                    onChange={(e) => updateVerwaltung('gfGehalt', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-indigo-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Grundsteuer (€)
                  </label>
                  <input
                    type="number"
                    value={input.verwaltung.grundsteuer}
                    onChange={(e) => updateVerwaltung('grundsteuer', parseFloat(e.target.value) || 0)}
                    className="w-full p-3 bg-white border-2 border-indigo-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all duration-200 shadow-sm hover:shadow-md"
                  />
                </div>
              </div>
              <div className="mt-6 p-4 bg-gradient-to-r from-indigo-100 to-blue-100 rounded-xl shadow-inner border border-indigo-200">
                <p className="text-sm font-semibold text-gray-700 flex items-center justify-between">
                  <span>Grundkosten Verwaltung:</span>
                  <span className="text-lg text-indigo-700 font-bold">{formatNumber(ergebnis.grundkostenVerwaltung)} €</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FixkostenRechner;

