import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Euro, TrendingUp, Settings, Users, ShoppingCart, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { VariableKostenInput } from '../types';
import { berechneVariableKosten } from '../utils/variableKostenCalculations';
import { DEFAULT_VARIABLE_KOSTEN } from '../constants/defaultValues';
import { variableKostenService } from '../services/variableKostenService';
import { NumberInput } from './NumberInput';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// Formatierung für Zahlen mit Tausendertrennzeichen
const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const VariableKostenRechner = () => {
  const [input, setInput] = useState<VariableKostenInput | null>(null);
  const [fixkostenProJahr, setFixkostenProJahr] = useState<number>(164740.0);
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
        const savedData = await variableKostenService.loadVariableKosten();
        if (savedData) {
          setInput(savedData);
        } else {
          // Nur wenn keine Daten vorhanden sind, Default-Werte verwenden
          setInput(DEFAULT_VARIABLE_KOSTEN);
        }
      } catch (error) {
        console.error('Fehler beim Laden der Variable Kosten:', error);
        // Bei Fehler auch Default-Werte verwenden
        setInput(DEFAULT_VARIABLE_KOSTEN);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Berechne Ergebnis nur wenn input vorhanden ist
  const ergebnis = input ? berechneVariableKosten(input, fixkostenProJahr) : null;

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
        console.log('💾 Speichere Variable Kosten...', input);
        await variableKostenService.saveVariableKosten(input);
        console.log('✅ Variable Kosten erfolgreich gespeichert');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000); // Nach 3 Sekunden ausblenden
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler beim Speichern';
        console.error('❌ Fehler beim Speichern der Variable Kosten:', error);
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

  // Jahresfixkosten aus localStorage laden (automatisch vom Fixkosten-Rechner)
  useEffect(() => {
    const loadFixkosten = () => {
      const savedFixkosten = localStorage.getItem('fixkostenProJahr');
      if (savedFixkosten) {
        setFixkostenProJahr(parseFloat(savedFixkosten));
      }
    };

    // Beim Mount laden
    loadFixkosten();

    // Event Listener für Änderungen im localStorage (wenn Fixkosten-Rechner aktualisiert wird)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'fixkostenProJahr' && e.newValue) {
        setFixkostenProJahr(parseFloat(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Polling für localStorage-Änderungen (für gleichen Tab)
    const interval = setInterval(loadFixkosten, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Speichere Herstellkosten je Tonne (Abwerkspreis) für Speditionskosten-Rechner
  useEffect(() => {
    if (ergebnis) {
      localStorage.setItem('herstellkostenJeTonne', ergebnis.herstellkostenJeTonne.toString());
    }
  }, [ergebnis]);

  // Berechne kostenProSack und kostenJeTonne automatisch
  useEffect(() => {
    if (!input) return;
    
    // Verwende Durchschnitts-Stundenlohn für Absacken
    const durchschnittsStundenlohn = (input.lohnkosten.stundenlohnHelfer + input.lohnkosten.stundenlohnFacharbeiter) / 2;
    const kostenProSack = input.sackware.sackpreis + (input.sackware.arbeitszeitAbsackenJeSack * durchschnittsStundenlohn);
    
    // Berechne kostenJeTonne basierend auf aktuellen Werten
    const geplanterUmsatz = ergebnis?.geplanterUmsatzBerechnet || input.geplanterUmsatz;
    const anzahlPaletten = geplanterUmsatz * input.sackware.palettenProTonne;
    const anzahlSaecke = anzahlPaletten * input.sackware.saeckeProPalette;
    const arbeitsstundenAbsacken = anzahlSaecke * input.sackware.arbeitszeitAbsackenJeSack;
    const jahreskostenLohnAbsacken = arbeitsstundenAbsacken * durchschnittsStundenlohn;
    const jahreskostenPaletten = anzahlPaletten * input.sackware.palettenKostenProPalette;
    const jahreskostenSaecke = anzahlPaletten * input.sackware.saeckeKostenProPalette;
    const jahreskostenSchrumpfhauben = anzahlPaletten * input.sackware.schrumpfhaubenKostenProPalette;
    const jahreskostenSackwareMaterial = jahreskostenPaletten + jahreskostenSaecke + jahreskostenSchrumpfhauben;
    const jahreskostenSaeckeNeu = anzahlSaecke * kostenProSack;
    const jahreskostenSackware = jahreskostenSackwareMaterial + jahreskostenSaeckeNeu;
    const kostenJeTonne = geplanterUmsatz > 0 ? jahreskostenSackware / geplanterUmsatz : 0;
    
    setInput(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sackware: {
          ...prev.sackware,
          kostenProSack,
          kostenJeTonne,
        }
      };
    });
  }, [input?.sackware.sackpreis, input?.sackware.arbeitszeitAbsackenJeSack, input?.lohnkosten.stundenlohnHelfer, input?.lohnkosten.stundenlohnFacharbeiter, input?.sackware.palettenProTonne, input?.sackware.saeckeProPalette, input?.geplanterUmsatz, ergebnis?.geplanterUmsatzBerechnet]);

  // Zeige Loading-Screen während Daten geladen werden (NACH allen Hooks!)
  if (isLoading || !input || !ergebnis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade Daten aus der Datenbank...</p>
        </div>
      </div>
    );
  }
  
  // Verwende berechneten Umsatz für Fixkosten je Tonne
  const geplanterUmsatz = ergebnis.geplanterUmsatzBerechnet > 0 ? ergebnis.geplanterUmsatzBerechnet : input.geplanterUmsatz;
  const fixkostenJeTonne =
    geplanterUmsatz > 0
      ? fixkostenProJahr / geplanterUmsatz
      : 0;
  
  // Berechne Jahresumsatz: Gesamtzahl Tonnen × Durchschnittlicher Verkaufspreis
  const jahresumsatz = geplanterUmsatz * ergebnis.durchschnittlicherVerkaufspreisProTonne;

  // Lohnkosten-Diagramm entfernt, da nur noch ein einheitlicher Stundenlohn verwendet wird

  const pieDataEinkauf = [
    { name: 'Diesel', value: geplanterUmsatz * input.einkauf.dieselKostenProTonne },
    { name: 'Ziegelbruch', value: ergebnis.jahreskostenZiegelbruch },
    { name: 'Strom', value: geplanterUmsatz * input.einkauf.stromKostenProTonne },
    { name: 'Entsorgung', value: geplanterUmsatz * input.einkauf.entsorgungContainerKostenProTonne },
    { name: 'Gasflaschen', value: geplanterUmsatz * input.einkauf.gasflaschenKostenProTonne },
  ];

  const pieDataVerschleiss = [
    { name: 'Hämmer', value: ergebnis.jahreskostenHaemmer },
    { name: 'Siebkörbe', value: geplanterUmsatz * input.verschleissteile.siebkoerbeKostenProTonne },
    { name: 'Verschleißbleche', value: geplanterUmsatz * input.verschleissteile.verschleissblecheKostenProTonne },
    { name: 'Wellenlager', value: geplanterUmsatz * input.verschleissteile.wellenlagerKostenProTonne },
  ];

  const barData = [
    { name: 'Lohnkosten', Wert: ergebnis.jahreskostenLohn },
    { name: 'Verbrauchsmaterial', Wert: ergebnis.jahreskostenVerbrauchsmaterial },
    { name: 'Verschleißteile', Wert: ergebnis.jahreskostenVerschleiss },
    { name: 'Sackware', Wert: ergebnis.jahreskostenSackware },
  ];

  const kostenProTonneData = [
    { name: 'Fixkosten', Wert: fixkostenJeTonne },
    { name: 'Variable Kosten', Wert: ergebnis.veraenderlicheKostenJeTonne },
    { name: 'Gesamt', Wert: ergebnis.herstellkostenJeTonne },
  ];

  const updateLohnkosten = (field: keyof VariableKostenInput['lohnkosten'], value: number) => {
    setInput(prev => ({
      ...prev,
      lohnkosten: { ...prev.lohnkosten, [field]: value }
    }));
  };

  const updateEinkauf = (field: keyof VariableKostenInput['einkauf'], value: number) => {
    setInput(prev => ({
      ...prev,
      einkauf: { ...prev.einkauf, [field]: value }
    }));
  };

  const updateVerschleiss = (field: keyof VariableKostenInput['verschleissteile'], value: number) => {
    setInput(prev => ({
      ...prev,
      verschleissteile: { ...prev.verschleissteile, [field]: value }
    }));
  };

  const updateSackware = (field: keyof VariableKostenInput['sackware'], value: number) => {
    setInput(prev => ({
      ...prev,
      sackware: { ...prev.sackware, [field]: value }
    }));
  };

  const updateVerkaufspreis = (index: number, field: 'tonnen' | 'preisProTonne', value: number) => {
    setInput(prev => {
      if (!prev) return prev;
      const neueVerkaufspreise = [...prev.verkaufspreise] as [typeof prev.verkaufspreise[0], typeof prev.verkaufspreise[1], typeof prev.verkaufspreise[2]];
      neueVerkaufspreise[index] = { ...neueVerkaufspreise[index], [field]: value };
      return {
        ...prev,
        verkaufspreise: neueVerkaufspreise,
        geplanterUmsatz: neueVerkaufspreise.reduce((sum, v) => sum + v.tonnen, 0), // Aktualisiere auch geplanterUmsatz für Fallback
      };
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-indigo-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 mb-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
            <Calculator className="w-10 h-10 text-blue-600" />
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              Variable Kosten Rechner - Ziegelmehl Herstellung 2025
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
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 rounded-xl text-white mb-8">
            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm opacity-90 mb-2">Variable Kosten je t</p>
                <p className="text-4xl font-bold">{ergebnis.veraenderlicheKostenJeTonne.toFixed(2)} €/t</p>
              </div>
              <div>
                <p className="text-sm opacity-90 mb-2">Fixkosten je t</p>
                <p className="text-4xl font-bold">{fixkostenJeTonne.toFixed(2)} €/t</p>
                <p className="text-xs opacity-75 mt-1">
                  ({fixkostenProJahr.toFixed(2)} € ÷ {geplanterUmsatz.toFixed(0)} t)
                </p>
              </div>
              <div>
                <p className="text-sm opacity-90 mb-2">Herstellkosten je t</p>
                <p className="text-4xl font-bold">{ergebnis.herstellkostenJeTonne.toFixed(2)} €/t</p>
              </div>
              <div>
                <p className="text-sm opacity-90 mb-2">Jahresgewinn</p>
                <p className="text-4xl font-bold">{formatNumber(ergebnis.jahresgewinn)} €</p>
                <p className="text-sm opacity-90 mt-2">Umsatz: {formatNumber(jahresumsatz)} €</p>
              </div>
            </div>
          </div>

          {/* Jahresfixkosten Input - Automatisch vom Fixkosten-Rechner übernommen */}
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-xl border-2 border-yellow-300 mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                Jahresfixkosten (automatisch übernommen)
              </label>
              <Link
                to="/fixkosten"
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Zum Fixkosten-Rechner
              </Link>
            </div>
            <div className="relative">
              <NumberInput
                value={fixkostenProJahr}
                onChange={(value) => setFixkostenProJahr(value)}
                className="w-full p-2 border-2 border-yellow-300 rounded-lg focus:border-yellow-400 focus:outline-none bg-white"
                step={0.01}
                readOnly
                title="Dieser Wert wird automatisch vom Fixkosten-Rechner übernommen"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">
                  Auto
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
              Diese Jahresfixkosten werden automatisch vom{' '}
              <Link to="/fixkosten" className="text-blue-600 hover:underline font-semibold">
                Fixkosten-Rechner
              </Link>{' '}
              übernommen. Die Fixkosten je Tonne werden mit der Umlage unten berechnet.
            </p>
          </div>

          {/* Diagramme */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Einkauf-Verteilung
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieDataEinkauf}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieDataEinkauf.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} €`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Verschleißteile-Verteilung
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieDataVerschleiss}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieDataVerschleiss.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} €`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Jahreskosten-Verteilung
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} €`} />
                  <Legend />
                  <Bar dataKey="Wert" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Euro className="w-5 h-5" />
                Kosten je Tonne
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={kostenProTonneData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} €/t`} />
                  <Legend />
                  <Bar dataKey="Wert" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Eingabefelder */}
          <div className="space-y-6">
            {/* Lohnkosten */}
            <div className="bg-blue-50 p-6 rounded-xl border-2 border-blue-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Users className="w-6 h-6" />
                Lohnkosten
              </h2>
              
              {/* Eingabefelder */}
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Lohn Helfer (€/Std)
                  </label>
                  <NumberInput
                    value={input.lohnkosten.stundenlohnHelfer}
                    onChange={(value) => updateLohnkosten('stundenlohnHelfer', value)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Stundenlohn für Helfer
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Lohn Facharbeiter (€/Std)
                  </label>
                  <NumberInput
                    value={input.lohnkosten.stundenlohnFacharbeiter}
                    onChange={(value) => updateLohnkosten('stundenlohnFacharbeiter', value)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Stundenlohn für Facharbeiter
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Produzierte Tonnen pro Arbeitsstunde
                  </label>
                  <NumberInput
                    value={input.lohnkosten.tonnenProArbeitsstunde}
                    onChange={(value) => updateLohnkosten('tonnenProArbeitsstunde', value)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Produktivität: Wie viele Tonnen werden pro Arbeitsstunde produziert?
                  </p>
                </div>
              </div>

              {/* Berechnete Ergebnisse */}
              <div className="mt-4 p-4 bg-blue-100 rounded-lg">
                <div className="grid md:grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Benötigte Arbeitsstunden</p>
                    <p className="text-lg font-semibold text-blue-700">
                      {ergebnis.benoetigteArbeitsstunden.toFixed(1)} Std
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      ({geplanterUmsatz.toFixed(0)} t ÷ {input.lohnkosten.tonnenProArbeitsstunde} t/Std)
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Jahreskosten Lohn Helfer</p>
                    <p className="text-lg font-semibold text-blue-700">
                      {(ergebnis.benoetigteArbeitsstunden * input.lohnkosten.stundenlohnHelfer).toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      ({ergebnis.benoetigteArbeitsstunden.toFixed(1)} Std × {input.lohnkosten.stundenlohnHelfer.toFixed(2)} €/Std)
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Jahreskosten Lohn Facharbeiter</p>
                    <p className="text-lg font-semibold text-blue-700">
                      {(ergebnis.benoetigteArbeitsstunden * input.lohnkosten.stundenlohnFacharbeiter).toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      ({ergebnis.benoetigteArbeitsstunden.toFixed(1)} Std × {input.lohnkosten.stundenlohnFacharbeiter.toFixed(2)} €/Std)
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t-2 border-blue-200">
                  <p className="text-xs text-gray-600 mb-1">Jahreskosten Lohn gesamt</p>
                  <p className="text-xl font-bold text-blue-800">
                    {ergebnis.jahreskostenLohn.toFixed(2)} €
                  </p>
                </div>
              </div>
            </div>

            {/* Einkauf */}
            <div className="bg-green-50 p-6 rounded-xl border-2 border-green-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-6 h-6" />
                Einkauf / Verbrauchsmaterial
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Diesel Kosten pro Tonne (€/t)
                  </label>
                  <NumberInput
                    value={input.einkauf.dieselKostenProTonne}
                    onChange={(value) => updateEinkauf('dieselKostenProTonne', value)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs font-semibold text-green-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.einkauf.dieselKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Ziegelbruch Kosten pro Tonne (€/t)
                  </label>
                  <NumberInput
                    value={input.einkauf.ziegelbruchKostenProTonne}
                    onChange={(value) => updateEinkauf('ziegelbruchKostenProTonne', value)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Benötigte Menge: {ergebnis.benoetigteMengeZiegelbruch.toFixed(1)} t ({input.geplanterUmsatz} t Output × 0.75)
                  </p>
                  <p className="text-xs font-semibold text-green-700 mt-1">
                    Jahreskosten Ziegelbruch: {ergebnis.jahreskostenZiegelbruch.toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Strom Kosten pro Tonne (€/t)
                  </label>
                  <NumberInput
                    value={input.einkauf.stromKostenProTonne}
                    onChange={(value) => updateEinkauf('stromKostenProTonne', value)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs font-semibold text-green-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.einkauf.stromKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Entsorgung Container Kosten pro Tonne (€/t)
                  </label>
                  <NumberInput
                    value={input.einkauf.entsorgungContainerKostenProTonne}
                    onChange={(value) => updateEinkauf('entsorgungContainerKostenProTonne', value)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs font-semibold text-green-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.einkauf.entsorgungContainerKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Gasflaschen Kosten pro Tonne (€/t)
                  </label>
                  <NumberInput
                    value={input.einkauf.gasflaschenKostenProTonne}
                    onChange={(value) => updateEinkauf('gasflaschenKostenProTonne', value)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs font-semibold text-green-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.einkauf.gasflaschenKostenProTonne).toFixed(2)} €
                  </p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-green-100 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">
                  Jahreskosten Verbrauchsmaterial: <span className="text-green-700">{ergebnis.jahreskostenVerbrauchsmaterial.toFixed(2)} €</span>
                </p>
              </div>
            </div>

            {/* Verschleißteile */}
            <div className="bg-yellow-50 p-6 rounded-xl border-2 border-yellow-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Settings className="w-6 h-6" />
                Verschleißteile
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Preis pro Hammer (€/Stück)
                  </label>
                  <NumberInput
                    value={input.verschleissteile.preisProHammer}
                    onChange={(value) => updateVerschleiss('preisProHammer', value)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Einkaufspreis pro Hammer
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Verbrauch Hämmer pro Tonne
                  </label>
                  <NumberInput
                    value={input.verschleissteile.verbrauchHaemmerProTonne}
                    onChange={(value) => updateVerschleiss('verbrauchHaemmerProTonne', value)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Benötigte Hämmer: {ergebnis.benoetigteHaemmer.toFixed(0)} Stück ({input.geplanterUmsatz} t × {input.verschleissteile.verbrauchHaemmerProTonne})
                  </p>
                  <p className="text-xs font-semibold text-yellow-700 mt-1">
                    Jahreskosten Hämmer: {ergebnis.jahreskostenHaemmer.toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Siebkörbe Kosten pro Tonne (€/t)
                  </label>
                  <NumberInput
                    value={input.verschleissteile.siebkoerbeKostenProTonne}
                    onChange={(value) => updateVerschleiss('siebkoerbeKostenProTonne', value)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs font-semibold text-yellow-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.verschleissteile.siebkoerbeKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Verschleißbleche Kosten pro Tonne (€/t)
                  </label>
                  <NumberInput
                    value={input.verschleissteile.verschleissblecheKostenProTonne}
                    onChange={(value) => updateVerschleiss('verschleissblecheKostenProTonne', value)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs font-semibold text-yellow-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.verschleissteile.verschleissblecheKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Wellenlager Kosten pro Tonne (€/t)
                  </label>
                  <NumberInput
                    value={input.verschleissteile.wellenlagerKostenProTonne}
                    onChange={(value) => updateVerschleiss('wellenlagerKostenProTonne', value)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs font-semibold text-yellow-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.verschleissteile.wellenlagerKostenProTonne).toFixed(2)} €
                  </p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-yellow-100 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">
                  Jahreskosten Verschleiß: <span className="text-yellow-700">{ergebnis.jahreskostenVerschleiss.toFixed(2)} €</span>
                </p>
              </div>
            </div>

            {/* Sackware */}
            <div className="bg-purple-50 p-6 rounded-xl border-2 border-purple-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Settings className="w-6 h-6" />
                Nur für Sackware
              </h2>
              <div className="mb-4 p-3 bg-purple-100 rounded-lg">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Paletten pro Tonne
                </label>
                <NumberInput
                  value={input.sackware.palettenProTonne}
                  onChange={(value) => updateSackware('palettenProTonne', value)}
                  className="w-full md:w-1/3 p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                  step={0.01}
                  min={0}
                />
                <p className="text-xs text-gray-600 mt-1">
                  Anzahl Paletten pro produzierte Tonne (Standard: 1 Palette = 1 Tonne)
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Paletten Kosten pro Palette (€/Palette)
                  </label>
                  <input
                    type="number"
                    value={input.sackware.palettenKostenProPalette}
                    onChange={(e) => updateSackware('palettenKostenProPalette', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs font-semibold text-purple-700 mt-1">
                    Jahreskosten: {(ergebnis.anzahlPaletten * input.sackware.palettenKostenProPalette).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Säcke Kosten pro Palette (€/Palette)
                  </label>
                  <input
                    type="number"
                    value={input.sackware.saeckeKostenProPalette}
                    onChange={(e) => updateSackware('saeckeKostenProPalette', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs font-semibold text-purple-700 mt-1">
                    Jahreskosten: {(ergebnis.anzahlPaletten * input.sackware.saeckeKostenProPalette).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Schrumpfhauben Kosten pro Palette (€/Palette)
                  </label>
                  <input
                    type="number"
                    value={input.sackware.schrumpfhaubenKostenProPalette}
                    onChange={(e) => updateSackware('schrumpfhaubenKostenProPalette', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs font-semibold text-purple-700 mt-1">
                    Jahreskosten: {(ergebnis.anzahlPaletten * input.sackware.schrumpfhaubenKostenProPalette).toFixed(2)} €
                  </p>
                </div>
              </div>
              
              {/* Neue Felder für abgepacktes TennisMehl */}
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Säcke pro Palette
                  </label>
                  <input
                    type="number"
                    value={input.sackware.saeckeProPalette}
                    onChange={(e) => updateSackware('saeckeProPalette', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step="1"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Sackpreis (€/Sack)
                  </label>
                  <input
                    type="number"
                    value={input.sackware.sackpreis}
                    onChange={(e) => updateSackware('sackpreis', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Arbeitszeit Absacken je Sack (Stunden)
                  </label>
                  <input
                    type="number"
                    value={input.sackware.arbeitszeitAbsackenJeSack}
                    onChange={(e) => updateSackware('arbeitszeitAbsackenJeSack', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Kosten pro Sack (€/Sack) - Berechnet
                  </label>
                  <input
                    type="number"
                    value={input.sackware.kostenProSack}
                    readOnly
                    className="w-full p-2 border-2 border-purple-300 rounded-lg bg-purple-50 focus:outline-none"
                    step="0.01"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Sackpreis + (Arbeitszeit × Stundenlohn)
                  </p>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Kosten je Tonne (€/t) - Berechnet
                </label>
                <input
                  type="number"
                  value={input.sackware.kostenJeTonne}
                  readOnly
                  className="w-full md:w-1/3 p-2 border-2 border-purple-300 rounded-lg bg-purple-50 focus:outline-none"
                  step="0.01"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Gesamtkosten Sackware / Geplanter Umsatz
                </p>
              </div>
              <div className="mt-4 p-3 bg-purple-100 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">
                  Anzahl Paletten: <span className="text-purple-700">{ergebnis.anzahlPaletten.toFixed(0)}</span> ({geplanterUmsatz.toFixed(0)} t × {input.sackware.palettenProTonne} Paletten/t)
                </p>
                <p className="text-sm font-semibold text-gray-700 mt-1">
                  Anzahl Säcke: <span className="text-purple-700">{(ergebnis.anzahlPaletten * input.sackware.saeckeProPalette).toFixed(0)}</span> ({ergebnis.anzahlPaletten.toFixed(0)} Paletten × {input.sackware.saeckeProPalette} Säcke/Palette)
                </p>
                <p className="text-sm font-semibold text-gray-700 mt-1">
                  Jahreskosten Sackware: <span className="text-purple-700">{ergebnis.jahreskostenSackware.toFixed(2)} €</span>
                </p>
              </div>
            </div>

            {/* Verkaufspreise und Umlage */}
            <div className="bg-red-50 p-6 rounded-xl border-2 border-red-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Verkaufspreise und Umlage auf hergestelltes Ziegelmehl</h2>
              
              {/* Berechnete Felder */}
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg border-2 border-red-300">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Geplanter Umsatz (Tonnen) - Berechnet
                  </label>
                  <input
                    type="number"
                    value={ergebnis.geplanterUmsatzBerechnet.toFixed(0)}
                    readOnly
                    className="w-full p-2 border-2 border-red-200 rounded-lg bg-gray-50 text-lg font-bold text-red-700"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Summe aller Verkaufspreis-Tonnen
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg border-2 border-red-300">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Durchschnittlicher Verkaufspreis (€/t) - Berechnet
                  </label>
                  <input
                    type="number"
                    value={ergebnis.durchschnittlicherVerkaufspreisProTonne.toFixed(2)}
                    readOnly
                    className="w-full p-2 border-2 border-red-200 rounded-lg bg-gray-50 text-lg font-bold text-red-700"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Gewichteter Durchschnitt aus allen Verkaufspreisen
                  </p>
                </div>
              </div>

              {/* Verkaufspreis-Eingaben */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Verkaufspreis-Eingaben (3 Stück)</h3>
                {input.verkaufspreise.map((verkaufspreis, index) => (
                  <div key={index} className="bg-white p-4 rounded-lg border-2 border-red-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Verkaufspreis {index + 1}</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Tonnen
                        </label>
                        <input
                          type="number"
                          value={verkaufspreis.tonnen}
                          onChange={(e) => updateVerkaufspreis(index, 'tonnen', parseFloat(e.target.value) || 0)}
                          className="w-full p-2 border-2 border-red-200 rounded-lg focus:border-red-400 focus:outline-none"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Preis pro Tonne (€/t)
                        </label>
                        <input
                          type="number"
                          value={verkaufspreis.preisProTonne}
                          onChange={(e) => updateVerkaufspreis(index, 'preisProTonne', parseFloat(e.target.value) || 0)}
                          className="w-full p-2 border-2 border-red-200 rounded-lg focus:border-red-400 focus:outline-none"
                          min="0"
                          step="0.01"
                        />
                        <p className="text-xs text-gray-600 mt-1">
                          Gesamt: {(verkaufspreis.tonnen * verkaufspreis.preisProTonne).toFixed(2)} €
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-red-100 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">
                  Jahreskosten veränderlich ohne Sackware: <span className="text-red-700">{ergebnis.jahreskostenVeraenderlichOhneSackware.toFixed(2)} €</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VariableKostenRechner;

