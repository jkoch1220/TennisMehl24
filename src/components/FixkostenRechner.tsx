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
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 mb-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Calculator className="w-10 h-10 text-red-600" />
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
                Fixkosten Rechner - Ziegelmehl Herstellung 2025
              </h1>
            </div>
            <div className="flex flex-col items-end gap-1">
              {isSaving && (
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  Speichere...
                </div>
              )}
              {!isSaving && !isLoading && saveSuccess && (
                <div className="text-sm text-green-600 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Gespeichert
                </div>
              )}
              {saveError && (
                <div className="text-sm text-red-600 flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  Fehler: {saveError}
                </div>
              )}
            </div>
          </div>

          {/* Ergebnis Highlight */}
          <div className="bg-gradient-to-r from-red-600 to-orange-600 p-6 rounded-xl text-white mb-8">
            <div className="text-center">
              <p className="text-sm opacity-90 mb-2">Fixkosten pro Jahr</p>
              <p className="text-5xl font-bold">{ergebnis.fixkostenProJahr.toFixed(2)} €</p>
              <p className="text-sm opacity-90 mt-3">
                Diese Jahresfixkosten werden automatisch an den Variable-Kosten-Rechner übergeben
              </p>
            </div>
          </div>

          {/* Diagramme */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Kostenverteilung (Kreisdiagramm)
              </h3>
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
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} €`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Euro className="w-5 h-5" />
                Kostenverteilung (Balkendiagramm)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} €`} />
                  <Legend />
                  <Bar dataKey="Wert" fill="#f97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Eingabefelder */}
          <div className="space-y-6">
            {/* Grundstück */}
            <div className="bg-green-50 p-6 rounded-xl border-2 border-green-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Settings className="w-6 h-6" />
                Grundstück
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Pacht (€)
                  </label>
                  <input
                    type="number"
                    value={input.grundstueck.pacht}
                    onChange={(e) => updateGrundstueck('pacht', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Steuer (€)
                  </label>
                  <input
                    type="number"
                    value={input.grundstueck.steuer}
                    onChange={(e) => updateGrundstueck('steuer', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Pflege (€)
                  </label>
                  <input
                    type="number"
                    value={input.grundstueck.pflege}
                    onChange={(e) => updateGrundstueck('pflege', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Bürocontainer (€)
                  </label>
                  <input
                    type="number"
                    value={input.grundstueck.buerocontainer}
                    onChange={(e) => updateGrundstueck('buerocontainer', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 p-3 bg-green-100 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">
                  Jahreskosten Grundstück: <span className="text-green-700">{ergebnis.jahreskostenGrundstueck.toFixed(2)} €</span>
                </p>
              </div>
            </div>

            {/* Maschinen */}
            <div className="bg-blue-50 p-6 rounded-xl border-2 border-blue-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Settings className="w-6 h-6" />
                Maschinen
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Wartung Radlader (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungRadlader}
                    onChange={(e) => updateMaschinen('wartungRadlader', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Wartung Stapler (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungStapler}
                    onChange={(e) => updateMaschinen('wartungStapler', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Wartung Mühle (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungMuehle}
                    onChange={(e) => updateMaschinen('wartungMuehle', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Wartung Siebanlage (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungSiebanlage}
                    onChange={(e) => updateMaschinen('wartungSiebanlage', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Wartung Absackanlage (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.wartungAbsackanlage}
                    onChange={(e) => updateMaschinen('wartungAbsackanlage', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Sonstige Wartung (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.sonstigeWartung}
                    onChange={(e) => updateMaschinen('sonstigeWartung', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Grundkosten Maschinen (€)
                  </label>
                  <input
                    type="number"
                    value={input.maschinen.grundkostenMaschinen}
                    onChange={(e) => updateMaschinen('grundkostenMaschinen', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">
                  Jahreskosten Maschinen: <span className="text-blue-700">{ergebnis.jahreskostenMaschinen.toFixed(2)} €</span>
                </p>
              </div>
            </div>

            {/* Rücklagen */}
            <div className="bg-purple-50 p-6 rounded-xl border-2 border-purple-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Rücklagen für Ersatzkäufe</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Rücklagen (€)
                </label>
                <input
                  type="number"
                  value={input.ruecklagenErsatzkauf}
                  onChange={(e) => setInput(prev => prev ? ({ ...prev, ruecklagenErsatzkauf: parseFloat(e.target.value) || 0 }) : prev)}
                  className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Sonstiges */}
            <div className="bg-gray-50 p-6 rounded-xl border-2 border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Sonstiges</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Sonstige Kosten (€) - Versicherungen, Ämter, Prüfung Anlage
                </label>
                <input
                  type="number"
                  value={input.sonstiges}
                  onChange={(e) => setInput(prev => prev ? ({ ...prev, sonstiges: parseFloat(e.target.value) || 0 }) : prev)}
                  className="w-full p-2 border-2 border-gray-200 rounded-lg focus:border-gray-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Verwaltung */}
            <div className="bg-indigo-50 p-6 rounded-xl border-2 border-indigo-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Settings className="w-6 h-6" />
                Grundkosten Verwaltung
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    BRZ, Steuerberater (€)
                  </label>
                  <input
                    type="number"
                    value={input.verwaltung.brzSteuerberater}
                    onChange={(e) => updateVerwaltung('brzSteuerberater', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-indigo-200 rounded-lg focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Telefon, Cloud, Server (€)
                  </label>
                  <input
                    type="number"
                    value={input.verwaltung.telefonCloudServer}
                    onChange={(e) => updateVerwaltung('telefonCloudServer', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-indigo-200 rounded-lg focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    GF Gehalt (€)
                  </label>
                  <input
                    type="number"
                    value={input.verwaltung.gfGehalt}
                    onChange={(e) => updateVerwaltung('gfGehalt', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-indigo-200 rounded-lg focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Grundsteuer (€)
                  </label>
                  <input
                    type="number"
                    value={input.verwaltung.grundsteuer}
                    onChange={(e) => updateVerwaltung('grundsteuer', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-indigo-200 rounded-lg focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 p-3 bg-indigo-100 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">
                  Grundkosten Verwaltung: <span className="text-indigo-700">{ergebnis.grundkostenVerwaltung.toFixed(2)} €</span>
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

