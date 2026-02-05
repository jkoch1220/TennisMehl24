import { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertTriangle, Mail, FileText } from 'lucide-react';
import {
  MahnwesenTextVorlagen,
  STANDARD_MAHNWESEN_VORLAGEN,
  MAHNWESEN_PLATZHALTER,
} from '../../types/mahnwesen';
import { ladeTextVorlagen, speichereTextVorlagen } from '../../services/mahnwesenService';

const MahnwesenEinstellungen = () => {
  const [vorlagen, setVorlagen] = useState<MahnwesenTextVorlagen>(STANDARD_MAHNWESEN_VORLAGEN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'zahlungserinnerung' | 'mahnung_1' | 'mahnung_2'>('zahlungserinnerung');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const loadVorlagen = async () => {
      setLoading(true);
      try {
        const geladeneVorlagen = await ladeTextVorlagen();
        setVorlagen(geladeneVorlagen);
      } catch (error) {
        console.error('Fehler beim Laden der Vorlagen:', error);
      } finally {
        setLoading(false);
      }
    };
    loadVorlagen();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await speichereTextVorlagen(vorlagen);
      setHasChanges(false);
      alert('Einstellungen wurden gespeichert!');
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Einstellungen.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Möchten Sie wirklich alle Texte auf die Standardwerte zurücksetzen?')) {
      setVorlagen(STANDARD_MAHNWESEN_VORLAGEN);
      setHasChanges(true);
    }
  };

  const updateVorlage = (
    typ: 'zahlungserinnerung' | 'mahnung_1' | 'mahnung_2',
    field: string,
    value: string | number
  ) => {
    setVorlagen((prev) => ({
      ...prev,
      [typ]: {
        ...prev[typ],
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  const tabs = [
    { id: 'zahlungserinnerung' as const, label: 'Zahlungserinnerung', icon: Mail, color: 'blue' },
    { id: 'mahnung_1' as const, label: '1. Mahnung', icon: AlertTriangle, color: 'amber' },
    { id: 'mahnung_2' as const, label: '2. Mahnung', icon: AlertTriangle, color: 'red' },
  ];

  const currentVorlage = vorlagen[activeTab];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
            Mahnwesen-Einstellungen
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Texte für Zahlungserinnerungen und Mahnungen anpassen
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Zurücksetzen
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Speichern
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700 overflow-x-auto pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium text-sm rounded-t-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? `bg-${tab.color}-100 dark:bg-${tab.color}-900/30 text-${tab.color}-700 dark:text-${tab.color}-400 border-b-2 border-${tab.color}-500`
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Platzhalter-Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
        <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
          Verfügbare Platzhalter
        </h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(MAHNWESEN_PLATZHALTER).map(([key, placeholder]) => (
            <code
              key={key}
              className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded text-xs"
            >
              {placeholder}
            </code>
          ))}
        </div>
      </div>

      {/* Formular */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-6">
        {/* Betreff */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Betreff
          </label>
          <input
            type="text"
            value={currentVorlage.betreff}
            onChange={(e) => updateVorlage(activeTab, 'betreff', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Anrede */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Anrede
          </label>
          <input
            type="text"
            value={currentVorlage.anrede}
            onChange={(e) => updateVorlage(activeTab, 'anrede', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Haupttext */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Haupttext
          </label>
          <textarea
            value={currentVorlage.haupttext}
            onChange={(e) => updateVorlage(activeTab, 'haupttext', e.target.value)}
            rows={6}
            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Schlusstext */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Schlusstext
          </label>
          <textarea
            value={currentVorlage.schlusstext}
            onChange={(e) => updateVorlage(activeTab, 'schlusstext', e.target.value)}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Inkasso-Hinweis (nur bei 2. Mahnung) */}
        {activeTab === 'mahnung_2' && 'inkassoHinweis' in vorlagen.mahnung_2 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Inkasso-Hinweis
            </label>
            <textarea
              value={vorlagen.mahnung_2.inkassoHinweis}
              onChange={(e) => updateVorlage(activeTab, 'inkassoHinweis', e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500"
            />
          </div>
        )}

        {/* Zahlungsziel & Mahngebühren */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Neue Zahlungsfrist (Tage)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={currentVorlage.fristTage}
              onChange={(e) => updateVorlage(activeTab, 'fristTage', parseInt(e.target.value, 10))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500"
            />
          </div>

          {(activeTab === 'mahnung_1' || activeTab === 'mahnung_2') && 'mahngebuehren' in currentVorlage && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Mahngebühren (EUR)
              </label>
              <input
                type="number"
                min="0"
                step="0.50"
                value={(currentVorlage as typeof vorlagen.mahnung_1).mahngebuehren}
                onChange={(e) => updateVorlage(activeTab, 'mahngebuehren', parseFloat(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Vorschau */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Vorschau
        </h3>
        <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-6 text-sm text-gray-700 dark:text-slate-300 space-y-4">
          <p className="font-bold text-lg">{currentVorlage.betreff}</p>
          <p>{currentVorlage.anrede}</p>
          <div className="whitespace-pre-wrap">{currentVorlage.haupttext}</div>
          {activeTab === 'mahnung_2' && 'inkassoHinweis' in vorlagen.mahnung_2 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
              {vorlagen.mahnung_2.inkassoHinweis}
            </div>
          )}
          <div className="whitespace-pre-wrap">{currentVorlage.schlusstext}</div>
        </div>
      </div>
    </div>
  );
};

export default MahnwesenEinstellungen;
