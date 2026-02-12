import { useState, useEffect, useCallback } from 'react';
import {
  Truck,
  Plus,
  X,
  Trash2,
  AlertTriangle,
  Package,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  Navigation,
  User,
  Edit3,
  Check,
} from 'lucide-react';
import { Tour, TourStop, TourFahrzeugTyp, TourKapazitaet, STANDARD_KAPAZITAETEN } from '../../types/tour';
import { Projekt } from '../../types/projekt';
import { tourenService } from '../../services/tourenService';
import { projektService } from '../../services/projektService';

interface TourenManagementProps {
  projekte: Projekt[];
  onProjektUpdate: () => void;
  onTourenChange?: () => void;
}

// Dialog für neue Tour erstellen
interface NeueTourDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (tour: {
    name: string;
    lkwTyp: TourFahrzeugTyp;
    motorwagenTonnen: number;
    haengerTonnen?: number;
  }) => void;
}

const NeueTourDialog = ({ open, onClose, onSave }: NeueTourDialogProps) => {
  const [name, setName] = useState('');
  const [lkwTyp, setLkwTyp] = useState<TourFahrzeugTyp>('motorwagen');
  const [motorwagenTonnen, setMotorwagenTonnen] = useState(STANDARD_KAPAZITAETEN.motorwagen);
  const [haengerTonnen, setHaengerTonnen] = useState(STANDARD_KAPAZITAETEN.haenger);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      lkwTyp,
      motorwagenTonnen,
      haengerTonnen: lkwTyp === 'mit_haenger' ? haengerTonnen : undefined,
    });

    // Reset
    setName('');
    setLkwTyp('motorwagen');
    setMotorwagenTonnen(STANDARD_KAPAZITAETEN.motorwagen);
    setHaengerTonnen(STANDARD_KAPAZITAETEN.haenger);
  };

  if (!open) return null;

  const gesamtKapazitaet = lkwTyp === 'mit_haenger'
    ? motorwagenTonnen + haengerTonnen
    : motorwagenTonnen;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-orange-500 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Truck className="w-6 h-6" />
              Neue Tour erstellen
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/20"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Tour-Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tour-Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Tour 1, Tour Frankfurt, etc."
              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
              autoFocus
              required
            />
          </div>

          {/* LKW-Typ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              LKW-Typ
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLkwTyp('motorwagen')}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  lkwTyp === 'motorwagen'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${
                    lkwTyp === 'motorwagen' ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-slate-700'
                  }`}>
                    <Truck className={`w-5 h-5 ${
                      lkwTyp === 'motorwagen' ? 'text-red-600' : 'text-gray-500'
                    }`} />
                  </div>
                  <span className={`font-semibold ${
                    lkwTyp === 'motorwagen' ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Motorwagen
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Nur LKW ohne Anhänger
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLkwTyp('mit_haenger')}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  lkwTyp === 'mit_haenger'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${
                    lkwTyp === 'mit_haenger' ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-gray-100 dark:bg-slate-700'
                  }`}>
                    <div className="flex items-center">
                      <Truck className={`w-5 h-5 ${
                        lkwTyp === 'mit_haenger' ? 'text-purple-600' : 'text-gray-500'
                      }`} />
                      <div className={`w-3 h-3 rounded-sm ml-0.5 ${
                        lkwTyp === 'mit_haenger' ? 'bg-purple-400' : 'bg-gray-400'
                      }`} />
                    </div>
                  </div>
                  <span className={`font-semibold ${
                    lkwTyp === 'mit_haenger' ? 'text-purple-700 dark:text-purple-400' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Mit Hänger
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  LKW mit Anhänger
                </p>
              </button>
            </div>
          </div>

          {/* Kapazitäten */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Kapazitäten (Tonnen)
            </label>

            <div className={`grid gap-4 ${lkwTyp === 'mit_haenger' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {/* Motorwagen-Kapazität */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {lkwTyp === 'mit_haenger' ? 'Motorwagen' : 'Gesamtkapazität'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="30"
                    value={motorwagenTonnen}
                    onChange={(e) => setMotorwagenTonnen(parseFloat(e.target.value) || 14)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">t</span>
                </div>
              </div>

              {/* Hänger-Kapazität (nur bei mit_haenger) */}
              {lkwTyp === 'mit_haenger' && (
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Hänger
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="20"
                      value={haengerTonnen}
                      onChange={(e) => setHaengerTonnen(parseFloat(e.target.value) || 10)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white pr-12"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">t</span>
                  </div>
                </div>
              )}
            </div>

            {/* Gesamt-Anzeige */}
            <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Gesamtkapazität:</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {gesamtKapazitaet} Tonnen
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-xl font-medium hover:from-red-700 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Tour erstellen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Dialog für Tour bearbeiten (ALLE Felder)
interface TourBearbeitenDialogProps {
  open: boolean;
  tour: Tour | null;
  onClose: () => void;
  onSave: (tourId: string, updates: Partial<Tour>) => void;
}

const TourBearbeitenDialog = ({ open, tour, onClose, onSave }: TourBearbeitenDialogProps) => {
  const [name, setName] = useState('');
  const [lkwTyp, setLkwTyp] = useState<TourFahrzeugTyp>('motorwagen');
  const [motorwagenTonnen, setMotorwagenTonnen] = useState(STANDARD_KAPAZITAETEN.motorwagen);
  const [haengerTonnen, setHaengerTonnen] = useState(STANDARD_KAPAZITAETEN.haenger);
  const [datum, setDatum] = useState('');
  const [fahrerName, setFahrerName] = useState('');
  const [kennzeichen, setKennzeichen] = useState('');

  useEffect(() => {
    if (tour) {
      setName(tour.name || '');
      setLkwTyp(tour.lkwTyp || 'motorwagen');
      setMotorwagenTonnen(tour.kapazitaet?.motorwagenTonnen || STANDARD_KAPAZITAETEN.motorwagen);
      setHaengerTonnen(tour.kapazitaet?.haengerTonnen || STANDARD_KAPAZITAETEN.haenger);
      setDatum(tour.datum || '');
      setFahrerName(tour.fahrerName || '');
      setKennzeichen(tour.kennzeichen || '');
    }
  }, [tour]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tour || !name.trim()) return;

    const gesamtTonnen = lkwTyp === 'mit_haenger'
      ? motorwagenTonnen + haengerTonnen
      : motorwagenTonnen;

    onSave(tour.id, {
      name: name.trim(),
      lkwTyp,
      kapazitaet: {
        motorwagenTonnen,
        haengerTonnen: lkwTyp === 'mit_haenger' ? haengerTonnen : undefined,
        gesamtTonnen,
      },
      datum,
      fahrerName: fahrerName || undefined,
      kennzeichen: kennzeichen || undefined,
    });
    onClose();
  };

  if (!open || !tour) return null;

  const gesamtKapazitaet = lkwTyp === 'mit_haenger'
    ? motorwagenTonnen + haengerTonnen
    : motorwagenTonnen;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-500 px-6 py-4 sticky top-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Edit3 className="w-6 h-6" />
              Tour bearbeiten
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/20"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Tour-Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tour-Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Tour 1, Tour Frankfurt, etc."
              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              required
            />
          </div>

          {/* LKW-Typ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              LKW-Typ
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLkwTyp('motorwagen')}
                className={`p-3 rounded-xl border-2 transition-all text-left ${
                  lkwTyp === 'motorwagen'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚛</span>
                  <span className={`font-semibold text-sm ${
                    lkwTyp === 'motorwagen' ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Motorwagen
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setLkwTyp('mit_haenger')}
                className={`p-3 rounded-xl border-2 transition-all text-left ${
                  lkwTyp === 'mit_haenger'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚛+</span>
                  <span className={`font-semibold text-sm ${
                    lkwTyp === 'mit_haenger' ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Mit Hänger
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Kapazitäten */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Kapazitäten (Tonnen)
            </label>
            <div className={`grid gap-3 ${lkwTyp === 'mit_haenger' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {lkwTyp === 'mit_haenger' ? 'Motorwagen' : 'Gesamtkapazität'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="30"
                    value={motorwagenTonnen}
                    onChange={(e) => setMotorwagenTonnen(parseFloat(e.target.value) || 14)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white pr-10"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">t</span>
                </div>
              </div>
              {lkwTyp === 'mit_haenger' && (
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Hänger</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="20"
                      value={haengerTonnen}
                      onChange={(e) => setHaengerTonnen(parseFloat(e.target.value) || 10)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white pr-10"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">t</span>
                  </div>
                </div>
              )}
            </div>
            <div className="p-2 bg-gray-50 dark:bg-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Gesamtkapazität:</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{gesamtKapazitaet} t</span>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-slate-700 pt-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Fahrzeug & Fahrer</p>

            {/* Datum */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Datum
              </label>
              <input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              />
            </div>

            {/* Fahrer */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                Fahrer
              </label>
              <input
                type="text"
                value={fahrerName}
                onChange={(e) => setFahrerName(e.target.value)}
                placeholder="Name des Fahrers"
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              />
            </div>

            {/* Kennzeichen */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Truck className="w-4 h-4 inline mr-1" />
                Kennzeichen
              </label>
              <input
                type="text"
                value={kennzeichen}
                onChange={(e) => setKennzeichen(e.target.value.toUpperCase())}
                placeholder="z.B. MSP-ZM 123"
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white uppercase"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Kapazitäts-Balken Komponente
interface KapazitaetsBalkenProps {
  tour: Tour;
  beladung: ReturnType<typeof tourenService.berechneBeladung>;
}

const KapazitaetsBalken = ({ tour, beladung }: KapazitaetsBalkenProps) => {
  const { geladenTonnen, motorwagenTonnen, haengerTonnen, auslastungProzent, istUeberladen } = beladung;
  const { motorwagenTonnen: mKap, haengerTonnen: hKap, gesamtTonnen } = tour.kapazitaet;

  // Prozente berechnen
  const motorwagenProzent = mKap > 0 ? (Math.min(motorwagenTonnen, mKap) / gesamtTonnen) * 100 : 0;
  const haengerProzent = (hKap && hKap > 0) ? (Math.min(haengerTonnen, hKap) / gesamtTonnen) * 100 : 0;

  // Farbe basierend auf Auslastung
  const getBalkenFarbe = (prozent: number, istUeberladen: boolean) => {
    if (istUeberladen) return 'bg-red-500';
    if (prozent > 90) return 'bg-orange-500';
    if (prozent > 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-2">
      {/* Balken */}
      <div className="relative h-6 bg-gray-100 dark:bg-slate-700 rounded-lg overflow-hidden">
        {/* Motorwagen-Teil */}
        <div
          className={`absolute left-0 top-0 h-full ${getBalkenFarbe(auslastungProzent, istUeberladen)} transition-all duration-300`}
          style={{ width: `${Math.min(motorwagenProzent, 100)}%` }}
        />
        {/* Hänger-Teil (falls vorhanden) */}
        {tour.lkwTyp === 'mit_haenger' && haengerProzent > 0 && (
          <div
            className={`absolute top-0 h-full bg-purple-500 transition-all duration-300`}
            style={{
              left: `${motorwagenProzent}%`,
              width: `${Math.min(haengerProzent, 100 - motorwagenProzent)}%`
            }}
          />
        )}
        {/* Trennlinie bei Motorwagen/Hänger */}
        {tour.lkwTyp === 'mit_haenger' && (
          <div
            className="absolute top-0 h-full w-0.5 bg-gray-400 dark:bg-gray-500"
            style={{ left: `${(mKap / gesamtTonnen) * 100}%` }}
          />
        )}
        {/* Text-Overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-bold ${
            auslastungProzent > 50 ? 'text-white' : 'text-gray-700 dark:text-gray-300'
          }`}>
            {geladenTonnen.toFixed(1)}t / {gesamtTonnen}t
          </span>
        </div>
      </div>

      {/* Legende bei Hänger */}
      {tour.lkwTyp === 'mit_haenger' && (
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-gray-600 dark:text-gray-400">MW: {motorwagenTonnen.toFixed(1)}t/{mKap}t</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-purple-500" />
            <span className="text-gray-600 dark:text-gray-400">HG: {haengerTonnen.toFixed(1)}t/{hKap}t</span>
          </div>
        </div>
      )}

      {/* Warnung bei Überladung */}
      {istUeberladen && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-medium animate-pulse">
          <AlertTriangle className="w-4 h-4" />
          Tour überladen! ({(geladenTonnen - gesamtTonnen).toFixed(1)}t zu viel)
        </div>
      )}
    </div>
  );
};

// Tour-Zuweisung Dialog
interface TourZuweisungDialogProps {
  open: boolean;
  projekt: Projekt | null;
  touren: Tour[];
  onClose: () => void;
  onZuweisen: (tourId: string, projektId: string, tonnen: number) => void;
}

const TourZuweisungDialog = ({ open, projekt, touren, onClose, onZuweisen }: TourZuweisungDialogProps) => {
  const [selectedTourId, setSelectedTourId] = useState<string>('');
  const [tonnen, setTonnen] = useState(0);

  useEffect(() => {
    if (projekt) {
      setTonnen(projekt.liefergewicht || projekt.angefragteMenge || 0);
    }
  }, [projekt]);

  if (!open || !projekt) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTourId || tonnen <= 0) return;
    onZuweisen(selectedTourId, (projekt as any).$id || projekt.id, tonnen);
    onClose();
  };

  // Prüfe Belieferungsart-Konflikte
  const getWarnung = (tour: Tour) => {
    const { warnung } = tourenService.pruefeBelieferungsartKonflikt(tour, projekt.belieferungsart);
    return warnung;
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-500 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Package className="w-6 h-6" />
              Auftrag zuweisen
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/20"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Auftrag-Info */}
          <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
            <p className="font-medium text-gray-900 dark:text-white">{projekt.kundenname}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{projekt.kundenPlzOrt}</p>
            {projekt.belieferungsart && (
              <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full ${
                projekt.belieferungsart === 'nur_motorwagen'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
              }`}>
                {projekt.belieferungsart === 'nur_motorwagen' ? 'Nur Motorwagen' : projekt.belieferungsart}
              </span>
            )}
          </div>

          {/* Tonnen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Liefermenge (Tonnen)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={tonnen}
              onChange={(e) => setTonnen(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              required
            />
          </div>

          {/* Tour auswählen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tour auswählen
            </label>
            {touren.length === 0 ? (
              <div className="p-4 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl text-center text-gray-500 dark:text-gray-400">
                <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Keine Touren verfügbar</p>
                <p className="text-sm">Erstellen Sie zuerst eine Tour</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {touren.map(tour => {
                  const beladung = tourenService.berechneBeladung(tour);
                  const warnung = getWarnung(tour);
                  const nachZuweisung = beladung.geladenTonnen + tonnen;
                  const wirdUeberladen = nachZuweisung > tour.kapazitaet.gesamtTonnen;

                  return (
                    <button
                      key={tour.id}
                      type="button"
                      onClick={() => setSelectedTourId(tour.id)}
                      className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                        selectedTourId === tour.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                          {tour.lkwTyp === 'mit_haenger' ? (
                            <span className="text-purple-600">🚛+</span>
                          ) : (
                            <span className="text-blue-600">🚛</span>
                          )}
                          {tour.name}
                        </span>
                        <span className="text-sm text-gray-500">
                          {beladung.geladenTonnen.toFixed(1)}t / {tour.kapazitaet.gesamtTonnen}t
                        </span>
                      </div>

                      {/* Mini-Kapazitätsbalken */}
                      <div className="h-2 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            wirdUeberladen ? 'bg-red-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(beladung.auslastungProzent, 100)}%` }}
                        />
                      </div>

                      {/* Warnungen */}
                      {warnung && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                          <AlertCircle className="w-3 h-3" />
                          {warnung}
                        </div>
                      )}
                      {wirdUeberladen && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3" />
                          Tour wird überladen (+{(nachZuweisung - tour.kapazitaet.gesamtTonnen).toFixed(1)}t)
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={!selectedTourId || tonnen <= 0}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Zuweisen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Haupt-Komponente
const TourenManagement = ({ projekte, onProjektUpdate, onTourenChange }: TourenManagementProps) => {
  const [touren, setTouren] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [showNeueTourDialog, setShowNeueTourDialog] = useState(false);
  const [expandedTour, setExpandedTour] = useState<string | null>(null);

  // Tour bearbeiten
  const [bearbeitenTour, setBearbeitenTour] = useState<Tour | null>(null);
  const [showBearbeitenDialog, setShowBearbeitenDialog] = useState(false);

  // Zuweisung
  const [zuweisungProjekt, setZuweisungProjekt] = useState<Projekt | null>(null);
  const [showZuweisungDialog, setShowZuweisungDialog] = useState(false);

  // Touren laden
  const loadTouren = useCallback(async () => {
    setLoading(true);
    try {
      const geladeneTouren = await tourenService.loadAlleTouren();
      setTouren(geladeneTouren);
    } catch (error) {
      console.error('Fehler beim Laden der Touren:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTouren();
  }, [loadTouren]);

  // Neue Tour erstellen
  const handleNeueTourErstellen = async (data: {
    name: string;
    lkwTyp: TourFahrzeugTyp;
    motorwagenTonnen: number;
    haengerTonnen?: number;
  }) => {
    setSaving(true);
    try {
      const kapazitaet: TourKapazitaet = {
        motorwagenTonnen: data.motorwagenTonnen,
        haengerTonnen: data.haengerTonnen,
        gesamtTonnen: data.lkwTyp === 'mit_haenger'
          ? data.motorwagenTonnen + (data.haengerTonnen || 0)
          : data.motorwagenTonnen,
      };

      await tourenService.createTour({
        name: data.name,
        datum: '',
        fahrzeugId: '',
        lkwTyp: data.lkwTyp,
        kapazitaet,
        stops: [],
        routeDetails: tourenService.getLeereRouteDetails(),
        optimierung: tourenService.getLeereOptimierung(),
        status: 'entwurf',
      });

      await loadTouren();
      setShowNeueTourDialog(false);
      onTourenChange?.();
    } catch (error) {
      console.error('Fehler beim Erstellen der Tour:', error);
      alert('Fehler beim Erstellen der Tour');
    } finally {
      setSaving(false);
    }
  };

  // Tour bearbeiten (alle Felder)
  const handleTourBearbeiten = async (
    tourId: string,
    updates: Partial<Tour>
  ) => {
    setSaving(true);
    try {
      await tourenService.updateTour(tourId, updates);
      await loadTouren();
      onTourenChange?.();
    } catch (error) {
      console.error('Fehler beim Bearbeiten der Tour:', error);
      alert('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  // Tour löschen
  const handleTourLoeschen = async (tourId: string) => {
    if (!confirm('Tour wirklich löschen? Alle zugewiesenen Aufträge werden freigegeben.')) return;

    setSaving(true);
    try {
      // Zuerst alle Projekte von dieser Tour lösen
      const tour = touren.find(t => t.id === tourId);
      if (tour) {
        for (const stop of tour.stops) {
          await projektService.updateProjekt(stop.projektId, {
            routeId: undefined,
            dispoStatus: 'offen',
          });
        }
      }

      await tourenService.deleteTour(tourId);
      await loadTouren();
      onProjektUpdate();
      onTourenChange?.();
    } catch (error) {
      console.error('Fehler beim Löschen der Tour:', error);
      alert('Fehler beim Löschen der Tour');
    } finally {
      setSaving(false);
    }
  };

  // Auftrag einer Tour zuweisen
  const handleAuftragZuweisen = async (tourId: string, projektId: string, tonnen: number) => {
    setSaving(true);
    try {
      // Tour laden
      const tour = touren.find(t => t.id === tourId);
      if (!tour) throw new Error('Tour nicht gefunden');

      // Projekt laden
      const projekt = projekte.find(p => ((p as any).$id || p.id) === projektId);
      if (!projekt) throw new Error('Projekt nicht gefunden');

      // Neuen Stop erstellen
      const neuerStop: TourStop = {
        projektId,
        position: tour.stops.length + 1,
        ankunftGeplant: '',
        abfahrtGeplant: '',
        kundenname: projekt.kundenname,
        kundennummer: projekt.kundennummer,
        adresse: {
          strasse: projekt.lieferadresse?.strasse || projekt.kundenstrasse || '',
          plz: projekt.lieferadresse?.plz || projekt.kundenPlzOrt?.split(' ')[0] || '',
          ort: projekt.lieferadresse?.ort || projekt.kundenPlzOrt?.split(' ').slice(1).join(' ') || '',
        },
        tonnen,
        belieferungsart: projekt.belieferungsart || 'mit_haenger',
      };

      // Tour aktualisieren
      const neueStops = [...tour.stops, neuerStop];
      await tourenService.updateTour(tourId, { stops: neueStops });

      // Projekt aktualisieren
      await projektService.updateProjekt(projektId, {
        routeId: tourId,
        dispoStatus: 'geplant',
        liefergewicht: tonnen,
      });

      await loadTouren();
      onProjektUpdate();
      onTourenChange?.();
    } catch (error) {
      console.error('Fehler beim Zuweisen:', error);
      alert('Fehler beim Zuweisen des Auftrags');
    } finally {
      setSaving(false);
    }
  };

  // Auftrag von Tour entfernen
  const handleAuftragEntfernen = async (tourId: string, projektId: string) => {
    setSaving(true);
    try {
      const tour = touren.find(t => t.id === tourId);
      if (!tour) throw new Error('Tour nicht gefunden');

      // Stop entfernen
      const neueStops = tour.stops.filter(s => s.projektId !== projektId);
      // Positionen neu nummerieren
      neueStops.forEach((s, i) => { s.position = i + 1; });

      await tourenService.updateTour(tourId, { stops: neueStops });

      // Projekt aktualisieren
      await projektService.updateProjekt(projektId, {
        routeId: undefined,
        dispoStatus: 'offen',
      });

      await loadTouren();
      onProjektUpdate();
      onTourenChange?.();
    } catch (error) {
      console.error('Fehler beim Entfernen:', error);
      alert('Fehler beim Entfernen des Auftrags');
    } finally {
      setSaving(false);
    }
  };

  // Auftrag-Zuweisung öffnen (von außen aufrufbar)
  const openZuweisung = (projekt: Projekt) => {
    setZuweisungProjekt(projekt);
    setShowZuweisungDialog(true);
  };

  // Exportiere openZuweisung für Parent-Komponente
  (TourenManagement as any).openZuweisung = openZuweisung;
  (TourenManagement as any).touren = touren;

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-red-600" />
              Touren ({touren.length})
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={loadTouren}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                title="Aktualisieren"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowNeueTourDialog(true)}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-lg hover:from-red-700 hover:to-orange-600 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Tour erstellen
              </button>
            </div>
          </div>
        </div>

        {/* Touren-Liste */}
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {touren.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Noch keine Touren erstellt</p>
              <p className="text-sm mt-1">Erstellen Sie eine Tour um Aufträge zuzuweisen</p>
            </div>
          ) : (
            touren.map(tour => {
              const beladung = tourenService.berechneBeladung(tour);
              const isExpanded = expandedTour === tour.id;
              const tourDauer = tourenService.schaetzeTourDauer(tour);

              return (
                <div key={tour.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                  {/* Tour Header */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedTour(isExpanded ? null : tour.id)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          tour.lkwTyp === 'mit_haenger'
                            ? 'bg-purple-100 dark:bg-purple-900/40'
                            : 'bg-blue-100 dark:bg-blue-900/40'
                        }`}>
                          <Truck className={`w-5 h-5 ${
                            tour.lkwTyp === 'mit_haenger' ? 'text-purple-600' : 'text-blue-600'
                          }`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {/* X-Flag wenn kein Fahrer zugewiesen */}
                            {!tour.fahrerName && (
                              <span className="w-5 h-5 flex items-center justify-center bg-red-100 dark:bg-red-900/40 rounded text-red-600 dark:text-red-400" title="Kein Fahrer zugewiesen">
                                <X className="w-3.5 h-3.5" />
                              </span>
                            )}
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {tour.name}
                            </h3>
                            {tour.kennzeichen && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-gray-600 dark:text-gray-400 font-mono">
                                {tour.kennzeichen}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {tour.lkwTyp === 'mit_haenger' ? 'MW + HG' : 'Nur MW'}
                            {' • '}
                            {tour.stops.length} Stopp{tour.stops.length !== 1 ? 's' : ''}
                            {tour.datum && ` • ${new Date(tour.datum).toLocaleDateString('de-DE')}`}
                            {tour.fahrerName && (
                              <>
                                {' • '}
                                <User className="w-3 h-3 inline" /> {tour.fahrerName}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {beladung.istUeberladen && (
                          <span className="p-1 bg-red-100 dark:bg-red-900/50 rounded-full">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setBearbeitenTour(tour);
                            setShowBearbeitenDialog(true);
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                          title="Tour bearbeiten"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTourLoeschen(tour.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                          title="Tour löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Zeit-Informationen (nur bei Stopps) */}
                    {tour.stops.length > 0 && (
                      <div className="flex items-center gap-4 mb-3 text-xs">
                        <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                          <Navigation className="w-3.5 h-3.5" />
                          <span>~{tourDauer.streckeKm} km</span>
                        </div>
                        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Fahrt: {tourenService.formatiereZeit(tourDauer.fahrzeitMinuten)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                          <Package className="w-3.5 h-3.5" />
                          <span>Abladung: {tourenService.formatiereZeit(tourDauer.abladeZeitMinuten)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Gesamt: {tourenService.formatiereZeit(tourDauer.gesamtZeitMinuten)}</span>
                        </div>
                      </div>
                    )}

                    {/* Kapazitäts-Balken */}
                    <KapazitaetsBalken tour={tour} beladung={beladung} />
                  </div>

                  {/* Expandierte Ansicht - Stops */}
                  {isExpanded && tour.stops.length > 0 && (
                    <div className="px-4 pb-4">
                      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 space-y-2">
                        {tour.stops.map((stop, index) => (
                          <div
                            key={stop.projektId}
                            className="flex items-center justify-between p-2 bg-white dark:bg-slate-700 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-slate-600 rounded-full text-xs font-bold">
                                {index + 1}
                              </span>
                              <div>
                                <p className="font-medium text-sm text-gray-900 dark:text-white">
                                  {stop.kundenname}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {stop.adresse.plz} {stop.adresse.ort} • {stop.tonnen}t
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAuftragEntfernen(tour.id, stop.projektId);
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                              title="Auftrag entfernen"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Dialoge */}
      <NeueTourDialog
        open={showNeueTourDialog}
        onClose={() => setShowNeueTourDialog(false)}
        onSave={handleNeueTourErstellen}
      />

      <TourBearbeitenDialog
        open={showBearbeitenDialog}
        tour={bearbeitenTour}
        onClose={() => {
          setShowBearbeitenDialog(false);
          setBearbeitenTour(null);
        }}
        onSave={handleTourBearbeiten}
      />

      <TourZuweisungDialog
        open={showZuweisungDialog}
        projekt={zuweisungProjekt}
        touren={touren}
        onClose={() => {
          setShowZuweisungDialog(false);
          setZuweisungProjekt(null);
        }}
        onZuweisen={handleAuftragZuweisen}
      />

      {/* Saving Overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-lg px-6 py-4 flex items-center gap-3 shadow-xl">
            <Loader2 className="w-6 h-6 animate-spin text-red-600" />
            <span className="text-gray-700 dark:text-gray-300">Speichere...</span>
          </div>
        </div>
      )}
    </>
  );
};

export default TourenManagement;
export { TourZuweisungDialog };
