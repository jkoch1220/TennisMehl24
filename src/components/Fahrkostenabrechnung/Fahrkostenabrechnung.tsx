import React, { useState, useEffect, useCallback } from 'react';
import {
  Car, Plus, MapPin, Calendar,
  Trash2, Edit3, Zap, Route, Download,
  X, Check, ArrowRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fahrkostenService } from '../../services/fahrkostenService';
import { Fahrt, DefaultStrecke, NeueFahrt, DEFAULT_KILOMETER_PAUSCHALE } from '../../types/fahrtkosten';

export default function Fahrkostenabrechnung() {
  const { user } = useAuth();
  const [fahrten, setFahrten] = useState<Fahrt[]>([]);
  const [defaultStrecken, setDefaultStrecken] = useState<DefaultStrecke[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormular, setShowFormular] = useState(false);
  const [bearbeitungsFahrt, setBearbeitungsFahrt] = useState<Fahrt | null>(null);
  const [showStreckenVerwaltung, setShowStreckenVerwaltung] = useState(false);
  const [selectedMonat, setSelectedMonat] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Formular State
  const [formData, setFormData] = useState<Partial<NeueFahrt>>({
    datum: new Date().toISOString().split('T')[0],
    startort: '',
    startAdresse: '',
    zielort: '',
    zielAdresse: '',
    kilometer: 0,
    hinpirsUndZurueck: false,
    zweck: '',
  });

  const ladeDaten = useCallback(async () => {
    setLoading(true);
    try {
      const [fahrtenData, streckenData] = await Promise.all([
        fahrkostenService.ladeAlleFahrten(),
        fahrkostenService.ladeDefaultStrecken(),
      ]);
      setFahrten(fahrtenData);
      setDefaultStrecken(streckenData);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    ladeDaten();
  }, [ladeDaten]);

  // Quick-Add: Sofort eine Favorit-Strecke erfassen
  const handleQuickAdd = async (strecke: DefaultStrecke) => {
    if (!user) return;

    const neueFahrt: NeueFahrt = {
      datum: new Date().toISOString().split('T')[0],
      fahrer: user.$id,
      fahrerName: user.name,
      startort: strecke.startort,
      startAdresse: strecke.startAdresse,
      zielort: strecke.zielort,
      zielAdresse: strecke.zielAdresse,
      kilometer: strecke.kilometer,
      kilometerPauschale: DEFAULT_KILOMETER_PAUSCHALE,
      hinpirsUndZurueck: strecke.name.includes('↔'),
      defaultStreckeId: strecke.id,
    };

    try {
      const erstellteFahrt = await fahrkostenService.erstelleFahrt(neueFahrt);
      setFahrten(prev => [erstellteFahrt, ...prev]);
    } catch (error) {
      console.error('Fehler beim Erstellen:', error);
    }
  };

  // Formular mit Default-Strecke füllen
  const handleStreckeAuswahl = (strecke: DefaultStrecke) => {
    setFormData({
      ...formData,
      startort: strecke.startort,
      startAdresse: strecke.startAdresse,
      zielort: strecke.zielort,
      zielAdresse: strecke.zielAdresse,
      kilometer: strecke.kilometer,
      hinpirsUndZurueck: strecke.name.includes('↔'),
    });
  };

  // Formular absenden
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.startort || !formData.zielort || !formData.kilometer) return;

    const fahrtDaten: NeueFahrt = {
      datum: formData.datum || new Date().toISOString().split('T')[0],
      fahrer: user.$id,
      fahrerName: user.name,
      startort: formData.startort,
      startAdresse: formData.startAdresse || formData.startort,
      zielort: formData.zielort,
      zielAdresse: formData.zielAdresse || formData.zielort,
      kilometer: formData.kilometer,
      kilometerPauschale: DEFAULT_KILOMETER_PAUSCHALE,
      hinpirsUndZurueck: formData.hinpirsUndZurueck,
      zweck: formData.zweck,
    };

    try {
      if (bearbeitungsFahrt) {
        const aktualisiert = await fahrkostenService.aktualisiereFahrt(bearbeitungsFahrt.id, fahrtDaten);
        setFahrten(prev => prev.map(f => f.id === bearbeitungsFahrt.id ? aktualisiert : f));
      } else {
        const erstellteFahrt = await fahrkostenService.erstelleFahrt(fahrtDaten);
        setFahrten(prev => [erstellteFahrt, ...prev]);
      }
      resetFormular();
    } catch (error) {
      console.error('Fehler:', error);
    }
  };

  const handleLoeschen = async (id: string) => {
    if (!confirm('Fahrt wirklich löschen?')) return;
    try {
      await fahrkostenService.loescheFahrt(id);
      setFahrten(prev => prev.filter(f => f.id !== id));
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  };

  const handleBearbeiten = (fahrt: Fahrt) => {
    setBearbeitungsFahrt(fahrt);
    setFormData({
      datum: fahrt.datum,
      startort: fahrt.startort,
      startAdresse: fahrt.startAdresse,
      zielort: fahrt.zielort,
      zielAdresse: fahrt.zielAdresse,
      kilometer: fahrt.hinpirsUndZurueck ? fahrt.kilometer / 2 : fahrt.kilometer,
      hinpirsUndZurueck: fahrt.hinpirsUndZurueck,
      zweck: fahrt.zweck,
    });
    setShowFormular(true);
  };

  const resetFormular = () => {
    setShowFormular(false);
    setBearbeitungsFahrt(null);
    setFormData({
      datum: new Date().toISOString().split('T')[0],
      startort: '',
      startAdresse: '',
      zielort: '',
      zielAdresse: '',
      kilometer: 0,
      hinpirsUndZurueck: false,
      zweck: '',
    });
  };

  // Zusammenfassung berechnen
  const monatsSummary = fahrkostenService.berechneMonatsZusammenfassung(fahrten, selectedMonat);
  const alleMonatsSummaries = fahrkostenService.gruppiereNachMonat(fahrten);

  // Favorit-Strecken (für Quick-Add)
  const favoritStrecken = defaultStrecken.filter(s => s.istFavorit);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg pb-24 sm:pb-8">
      {/* Header */}
      <div className="bg-white dark:bg-dark-surface shadow-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                <Car className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Fahrtkosten</h1>
                <p className="text-sm text-gray-500 dark:text-dark-textMuted">Schnell & einfach erfassen</p>
              </div>
            </div>
            <button
              onClick={() => setShowStreckenVerwaltung(true)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400"
            >
              <Route className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick-Add Buttons - Das Herzstück! */}
      {favoritStrecken.length > 0 && (
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick-Add</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {favoritStrecken.map(strecke => (
              <button
                key={strecke.id}
                onClick={() => handleQuickAdd(strecke)}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl shadow-lg hover:from-red-600 hover:to-red-700 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 opacity-80" />
                  <span className="font-medium">{strecke.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm opacity-90">
                  <span>{strecke.kilometer} km</span>
                  <span>•</span>
                  <span>{(strecke.kilometer * DEFAULT_KILOMETER_PAUSCHALE).toFixed(2)} €</span>
                  <Plus className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monats-Übersicht */}
      <div className="px-4 sm:px-6 py-2">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <select
              value={selectedMonat}
              onChange={(e) => setSelectedMonat(e.target.value)}
              className="text-lg font-semibold bg-transparent border-none text-gray-900 dark:text-white focus:ring-0 cursor-pointer"
            >
              {alleMonatsSummaries.map(summary => (
                <option key={summary.monat} value={summary.monat}>
                  {new Date(summary.monat + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                </option>
              ))}
              {alleMonatsSummaries.length === 0 && (
                <option value={selectedMonat}>
                  {new Date(selectedMonat + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                </option>
              )}
            </select>
            <button className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <Download className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{monatsSummary.anzahlFahrten}</p>
              <p className="text-xs text-gray-500 dark:text-dark-textMuted">Fahrten</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{monatsSummary.gesamtKilometer}</p>
              <p className="text-xs text-gray-500 dark:text-dark-textMuted">Kilometer</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{monatsSummary.gesamtBetrag.toFixed(2)} €</p>
              <p className="text-xs text-gray-500 dark:text-dark-textMuted">Gesamt</p>
            </div>
          </div>
        </div>
      </div>

      {/* Fahrten-Liste */}
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">Letzte Fahrten</h2>
        </div>

        {monatsSummary.fahrten.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-xl">
            <Car className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-dark-textMuted">Noch keine Fahrten in diesem Monat</p>
            <p className="text-sm text-gray-400 mt-1">Nutze Quick-Add oben!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {monatsSummary.fahrten.map(fahrt => (
              <FahrtKarte
                key={fahrt.id}
                fahrt={fahrt}
                onEdit={() => handleBearbeiten(fahrt)}
                onDelete={() => handleLoeschen(fahrt.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB - Neue Fahrt */}
      <button
        onClick={() => setShowFormular(true)}
        className="fixed bottom-24 sm:bottom-8 right-4 sm:left-8 sm:right-auto w-14 h-14 bg-red-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-red-700 active:scale-95 transition-all z-20"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Formular Modal */}
      {showFormular && (
        <FahrtFormular
          formData={formData}
          setFormData={setFormData}
          defaultStrecken={defaultStrecken}
          onStreckeAuswahl={handleStreckeAuswahl}
          onSubmit={handleSubmit}
          onClose={resetFormular}
          isBearbeitung={!!bearbeitungsFahrt}
        />
      )}

      {/* Strecken-Verwaltung Modal */}
      {showStreckenVerwaltung && (
        <StreckenVerwaltung
          strecken={defaultStrecken}
          onClose={() => setShowStreckenVerwaltung(false)}
          onUpdate={ladeDaten}
        />
      )}
    </div>
  );
}

// Fahrt-Karte Komponente
function FahrtKarte({ fahrt, onEdit, onDelete }: { fahrt: Fahrt; onEdit: () => void; onDelete: () => void }) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="bg-white dark:bg-dark-surface rounded-xl shadow-sm overflow-hidden"
      onClick={() => setShowActions(!showActions)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-textMuted mb-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(fahrt.datum).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
              {fahrt.hinpirsUndZurueck && (
                <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">↔ Hin+Rück</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
              <span className="truncate">{fahrt.startort}</span>
              <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="truncate">{fahrt.zielort}</span>
            </div>
            {fahrt.zweck && (
              <p className="text-sm text-gray-500 dark:text-dark-textMuted mt-1 truncate">{fahrt.zweck}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-red-600">{fahrt.betrag.toFixed(2)} €</p>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted">{fahrt.kilometer} km</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="flex border-t dark:border-dark-border divide-x dark:divide-dark-border">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex-1 py-3 flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Edit3 className="w-4 h-4" />
            <span className="text-sm">Bearbeiten</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex-1 py-3 flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm">Löschen</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Formular Modal
function FahrtFormular({
  formData,
  setFormData,
  defaultStrecken,
  onStreckeAuswahl,
  onSubmit,
  onClose,
  isBearbeitung,
}: {
  formData: Partial<NeueFahrt>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<NeueFahrt>>>;
  defaultStrecken: DefaultStrecke[];
  onStreckeAuswahl: (s: DefaultStrecke) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  isBearbeitung: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[90vh] overflow-hidden">
        {/* Mobile Drag Handle */}
        <div className="sm:hidden flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isBearbeitung ? 'Fahrt bearbeiten' : 'Neue Fahrt'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Strecken-Vorauswahl */}
          {!isBearbeitung && defaultStrecken.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Vorlage wählen
              </label>
              <div className="flex flex-wrap gap-2">
                {defaultStrecken.map(strecke => (
                  <button
                    key={strecke.id}
                    type="button"
                    onClick={() => onStreckeAuswahl(strecke)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                      formData.startort === strecke.startort && formData.zielort === strecke.zielort
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : 'border-gray-200 dark:border-dark-border hover:border-gray-300'
                    }`}
                  >
                    {strecke.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Datum */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Datum
            </label>
            <input
              type="date"
              value={formData.datum || ''}
              onChange={(e) => setFormData({ ...formData, datum: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
          </div>

          {/* Start & Ziel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Start
              </label>
              <input
                type="text"
                value={formData.startort || ''}
                onChange={(e) => setFormData({ ...formData, startort: e.target.value })}
                placeholder="z.B. Giebelstadt"
                className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Ziel
              </label>
              <input
                type="text"
                value={formData.zielort || ''}
                onChange={(e) => setFormData({ ...formData, zielort: e.target.value })}
                placeholder="z.B. Produktion"
                className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Kilometer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Kilometer (einfach)
            </label>
            <input
              type="number"
              value={formData.kilometer || ''}
              onChange={(e) => setFormData({ ...formData, kilometer: Number(e.target.value) })}
              placeholder="45"
              min="0"
              step="0.1"
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
          </div>

          {/* Hin + Zurück Toggle */}
          <label className="flex items-center gap-3 p-4 border border-gray-200 dark:border-dark-border rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="checkbox"
              checked={formData.hinpirsUndZurueck || false}
              onChange={(e) => setFormData({ ...formData, hinpirsUndZurueck: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Hin- und Rückfahrt</p>
              <p className="text-sm text-gray-500 dark:text-dark-textMuted">Kilometer werden verdoppelt</p>
            </div>
          </label>

          {/* Zweck (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Zweck <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.zweck || ''}
              onChange={(e) => setFormData({ ...formData, zweck: e.target.value })}
              placeholder="z.B. Produktion abholen"
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
          </div>

          {/* Vorschau */}
          {formData.kilometer && formData.kilometer > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Berechnung</span>
                <div className="text-right">
                  <p className="font-bold text-lg text-red-600">
                    {((formData.hinpirsUndZurueck ? formData.kilometer * 2 : formData.kilometer) * DEFAULT_KILOMETER_PAUSCHALE).toFixed(2)} €
                  </p>
                  <p className="text-xs text-gray-500">
                    {formData.hinpirsUndZurueck ? formData.kilometer * 2 : formData.kilometer} km × {DEFAULT_KILOMETER_PAUSCHALE.toFixed(2)} €
                  </p>
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Submit Button */}
        <div className="p-4 border-t dark:border-dark-border">
          <button
            type="submit"
            onClick={onSubmit}
            disabled={!formData.startort || !formData.zielort || !formData.kilometer}
            className="w-full py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            {isBearbeitung ? 'Speichern' : 'Fahrt erfassen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Strecken-Verwaltung Modal
function StreckenVerwaltung({
  strecken,
  onClose,
  onUpdate,
}: {
  strecken: DefaultStrecke[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [showNeueStrecke, setShowNeueStrecke] = useState(false);
  const [neueStrecke, setNeueStrecke] = useState({
    name: '',
    startort: '',
    startAdresse: '',
    zielort: '',
    zielAdresse: '',
    kilometer: 0,
    istFavorit: false,
    sortierung: strecken.length,
  });

  const handleHinzufuegen = async () => {
    if (!neueStrecke.name || !neueStrecke.startort || !neueStrecke.zielort) return;
    try {
      await fahrkostenService.erstelleDefaultStrecke(neueStrecke);
      onUpdate();
      setShowNeueStrecke(false);
      setNeueStrecke({
        name: '',
        startort: '',
        startAdresse: '',
        zielort: '',
        zielAdresse: '',
        kilometer: 0,
        istFavorit: false,
        sortierung: strecken.length + 1,
      });
    } catch (error) {
      console.error('Fehler:', error);
    }
  };

  const handleLoeschen = async (id: string) => {
    if (!confirm('Strecke wirklich löschen?')) return;
    try {
      await fahrkostenService.loescheDefaultStrecke(id);
      onUpdate();
    } catch (error) {
      console.error('Fehler:', error);
    }
  };

  const handleFavoritToggle = async (strecke: DefaultStrecke) => {
    try {
      await fahrkostenService.aktualisiereDefaultStrecke(strecke.id, {
        istFavorit: !strecke.istFavorit,
      });
      onUpdate();
    } catch (error) {
      console.error('Fehler:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[90vh] overflow-hidden">
        {/* Mobile Drag Handle */}
        <div className="sm:hidden flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Strecken verwalten</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)] space-y-3">
          {/* Bestehende Strecken */}
          {strecken.map(strecke => (
            <div
              key={strecke.id}
              className="flex items-center gap-3 p-3 border border-gray-200 dark:border-dark-border rounded-xl"
            >
              <button
                onClick={() => handleFavoritToggle(strecke)}
                className={`p-2 rounded-lg ${strecke.istFavorit ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}
              >
                <Zap className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{strecke.name}</p>
                <p className="text-sm text-gray-500 dark:text-dark-textMuted">{strecke.kilometer} km</p>
              </div>
              <button
                onClick={() => handleLoeschen(strecke.id)}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Neue Strecke Form */}
          {showNeueStrecke ? (
            <div className="p-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl space-y-3">
              <input
                type="text"
                value={neueStrecke.name}
                onChange={(e) => setNeueStrecke({ ...neueStrecke, name: e.target.value })}
                placeholder="Name (z.B. Büro → Kunde)"
                className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={neueStrecke.startort}
                  onChange={(e) => setNeueStrecke({ ...neueStrecke, startort: e.target.value })}
                  placeholder="Start"
                  className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface"
                />
                <input
                  type="text"
                  value={neueStrecke.zielort}
                  onChange={(e) => setNeueStrecke({ ...neueStrecke, zielort: e.target.value })}
                  placeholder="Ziel"
                  className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface"
                />
              </div>
              <input
                type="number"
                value={neueStrecke.kilometer || ''}
                onChange={(e) => setNeueStrecke({ ...neueStrecke, kilometer: Number(e.target.value) })}
                placeholder="Kilometer"
                className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface"
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={neueStrecke.istFavorit}
                  onChange={(e) => setNeueStrecke({ ...neueStrecke, istFavorit: e.target.checked })}
                  className="rounded border-gray-300 text-red-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Als Quick-Add Favorit</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNeueStrecke(false)}
                  className="flex-1 py-2 border border-gray-200 dark:border-dark-border rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleHinzufuegen}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg"
                >
                  Speichern
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNeueStrecke(true)}
              className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Neue Strecke hinzufügen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
