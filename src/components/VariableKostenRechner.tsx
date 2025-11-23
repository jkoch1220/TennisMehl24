import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Euro, TrendingUp, Settings, Users, ShoppingCart, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { VariableKostenInput } from '../types';
import { berechneVariableKosten } from '../utils/variableKostenCalculations';
import { DEFAULT_VARIABLE_KOSTEN } from '../constants/defaultValues';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const VariableKostenRechner = () => {
  const [input, setInput] = useState<VariableKostenInput>(DEFAULT_VARIABLE_KOSTEN);
  const [fixkostenProJahr, setFixkostenProJahr] = useState<number>(164740.0);

  const ergebnis = berechneVariableKosten(input, fixkostenProJahr);
  
  // Berechne Fixkosten je Tonne aus Jahresfixkosten und geplantem Umsatz
  const fixkostenJeTonne =
    input.geplanterUmsatz > 0
      ? fixkostenProJahr / input.geplanterUmsatz
      : 0;

  // Lohnkosten-Diagramm entfernt, da nur noch ein einheitlicher Stundenlohn verwendet wird

  const pieDataEinkauf = [
    { name: 'Diesel', value: input.geplanterUmsatz * input.einkauf.dieselKostenProTonne },
    { name: 'Ziegelbruch', value: ergebnis.jahreskostenZiegelbruch },
    { name: 'Strom', value: input.geplanterUmsatz * input.einkauf.stromKostenProTonne },
    { name: 'Entsorgung', value: input.geplanterUmsatz * input.einkauf.entsorgungContainerKostenProTonne },
    { name: 'Gasflaschen', value: input.geplanterUmsatz * input.einkauf.gasflaschenKostenProTonne },
  ];

  const pieDataVerschleiss = [
    { name: 'Hämmer', value: ergebnis.jahreskostenHaemmer },
    { name: 'Siebkörbe', value: input.geplanterUmsatz * input.verschleissteile.siebkoerbeKostenProTonne },
    { name: 'Verschleißbleche', value: input.geplanterUmsatz * input.verschleissteile.verschleissblecheKostenProTonne },
    { name: 'Wellenlager', value: input.geplanterUmsatz * input.verschleissteile.wellenlagerKostenProTonne },
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-indigo-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 mb-6">
          <div className="flex items-center gap-3 mb-8">
            <Calculator className="w-10 h-10 text-blue-600" />
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              Variable Kosten Rechner - Ziegelmehl Herstellung 2025
            </h1>
          </div>

          {/* Ergebnis Highlight */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 rounded-xl text-white mb-8">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm opacity-90 mb-2">Variable Kosten je t</p>
                <p className="text-4xl font-bold">{ergebnis.veraenderlicheKostenJeTonne.toFixed(2)} €/t</p>
              </div>
              <div>
                <p className="text-sm opacity-90 mb-2">Fixkosten je t</p>
                <p className="text-4xl font-bold">{fixkostenJeTonne.toFixed(2)} €/t</p>
                <p className="text-xs opacity-75 mt-1">
                  ({fixkostenProJahr.toFixed(2)} € ÷ {input.geplanterUmsatz} t)
                </p>
              </div>
              <div>
                <p className="text-sm opacity-90 mb-2">Herstellkosten je t</p>
                <p className="text-4xl font-bold">{ergebnis.herstellkostenJeTonne.toFixed(2)} €/t</p>
                <p className="text-sm opacity-90 mt-2">bei {input.geplanterUmsatz} t geplantem Umsatz</p>
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
              <input
                type="number"
                value={fixkostenProJahr}
                onChange={(e) => setFixkostenProJahr(parseFloat(e.target.value) || 0)}
                className="w-full p-2 border-2 border-yellow-300 rounded-lg focus:border-yellow-400 focus:outline-none bg-white"
                step="0.01"
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
                    {pieDataEinkauf.map((entry, index) => (
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
                    {pieDataVerschleiss.map((entry, index) => (
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
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Stundenlohn (€/Std)
                  </label>
                  <input
                    type="number"
                    value={input.lohnkosten.stundenlohn}
                    onChange={(e) => updateLohnkosten('stundenlohn', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Einheitlicher Stundenlohn für alle Personen
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Produzierte Tonnen pro Arbeitsstunde
                  </label>
                  <input
                    type="number"
                    value={input.lohnkosten.tonnenProArbeitsstunde}
                    onChange={(e) => updateLohnkosten('tonnenProArbeitsstunde', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Produktivität: Wie viele Tonnen werden pro Arbeitsstunde produziert?
                  </p>
                </div>
              </div>

              {/* Berechnete Ergebnisse */}
              <div className="mt-4 p-4 bg-blue-100 rounded-lg">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Benötigte Arbeitsstunden</p>
                    <p className="text-lg font-semibold text-blue-700">
                      {ergebnis.benoetigteArbeitsstunden.toFixed(1)} Std
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      ({input.geplanterUmsatz} t ÷ {input.lohnkosten.tonnenProArbeitsstunde} t/Std)
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Jahreskosten Lohn gesamt</p>
                    <p className="text-lg font-semibold text-blue-700">
                      {ergebnis.jahreskostenLohn.toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      ({ergebnis.benoetigteArbeitsstunden.toFixed(1)} Std × {input.lohnkosten.stundenlohn.toFixed(2)} €/Std)
                    </p>
                  </div>
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
                  <input
                    type="number"
                    value={input.einkauf.dieselKostenProTonne}
                    onChange={(e) => updateEinkauf('dieselKostenProTonne', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs font-semibold text-green-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.einkauf.dieselKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Ziegelbruch Kosten pro Tonne (€/t)
                  </label>
                  <input
                    type="number"
                    value={input.einkauf.ziegelbruchKostenProTonne}
                    onChange={(e) => updateEinkauf('ziegelbruchKostenProTonne', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step="0.01"
                    min="0"
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
                  <input
                    type="number"
                    value={input.einkauf.stromKostenProTonne}
                    onChange={(e) => updateEinkauf('stromKostenProTonne', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs font-semibold text-green-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.einkauf.stromKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Entsorgung Container Kosten pro Tonne (€/t)
                  </label>
                  <input
                    type="number"
                    value={input.einkauf.entsorgungContainerKostenProTonne}
                    onChange={(e) => updateEinkauf('entsorgungContainerKostenProTonne', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs font-semibold text-green-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.einkauf.entsorgungContainerKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Gasflaschen Kosten pro Tonne (€/t)
                  </label>
                  <input
                    type="number"
                    value={input.einkauf.gasflaschenKostenProTonne}
                    onChange={(e) => updateEinkauf('gasflaschenKostenProTonne', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step="0.01"
                    min="0"
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
                  <input
                    type="number"
                    value={input.verschleissteile.preisProHammer}
                    onChange={(e) => updateVerschleiss('preisProHammer', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Einkaufspreis pro Hammer
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Verbrauch Hämmer pro Tonne
                  </label>
                  <input
                    type="number"
                    value={input.verschleissteile.verbrauchHaemmerProTonne}
                    onChange={(e) => updateVerschleiss('verbrauchHaemmerProTonne', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step="0.01"
                    min="0"
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
                  <input
                    type="number"
                    value={input.verschleissteile.siebkoerbeKostenProTonne}
                    onChange={(e) => updateVerschleiss('siebkoerbeKostenProTonne', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs font-semibold text-yellow-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.verschleissteile.siebkoerbeKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Verschleißbleche Kosten pro Tonne (€/t)
                  </label>
                  <input
                    type="number"
                    value={input.verschleissteile.verschleissblecheKostenProTonne}
                    onChange={(e) => updateVerschleiss('verschleissblecheKostenProTonne', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs font-semibold text-yellow-700 mt-1">
                    Jahreskosten: {(input.geplanterUmsatz * input.verschleissteile.verschleissblecheKostenProTonne).toFixed(2)} €
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Wellenlager Kosten pro Tonne (€/t)
                  </label>
                  <input
                    type="number"
                    value={input.verschleissteile.wellenlagerKostenProTonne}
                    onChange={(e) => updateVerschleiss('wellenlagerKostenProTonne', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                    step="0.01"
                    min="0"
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
                <input
                  type="number"
                  value={input.sackware.palettenProTonne}
                  onChange={(e) => updateSackware('palettenProTonne', parseFloat(e.target.value) || 0)}
                  className="w-full md:w-1/3 p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                  step="0.01"
                  min="0"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Anzahl Paletten pro produzierte Tonne (Standard: 1 Palette = 1 Tonne)
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
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
              <div className="mt-4 p-3 bg-purple-100 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">
                  Anzahl Paletten: <span className="text-purple-700">{ergebnis.anzahlPaletten.toFixed(0)}</span> ({input.geplanterUmsatz} t × {input.sackware.palettenProTonne} Paletten/t)
                </p>
                <p className="text-sm font-semibold text-gray-700 mt-1">
                  Jahreskosten Sackware: <span className="text-purple-700">{ergebnis.jahreskostenSackware.toFixed(2)} €</span>
                </p>
              </div>
            </div>

            {/* Geplanter Umsatz */}
            <div className="bg-red-50 p-6 rounded-xl border-2 border-red-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Umlage auf hergestelltes Ziegelmehl</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Geplanter Umsatz (Tonnen)
                </label>
                <input
                  type="number"
                  value={input.geplanterUmsatz}
                  onChange={(e) => setInput(prev => ({ ...prev, geplanterUmsatz: parseFloat(e.target.value) || 0 }))}
                  className="w-full p-2 border-2 border-red-200 rounded-lg focus:border-red-400 focus:outline-none"
                />
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

