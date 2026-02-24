import { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Navigation,
  MapPinOff,
} from 'lucide-react';
import { Projekt } from '../../types/projekt';
import {
  geocodeAdresseSchnell,
  GeocodingVorschlag,
  extrahiereAdresse,
} from '../../utils/geocoding';
import { getKoordinatenFuerPLZ } from '../../data/plzKoordinaten';

interface AdressKorrekturModalProps {
  isOpen: boolean;
  onClose: () => void;
  projekt: Projekt;
  onSave: (
    projektId: string,
    koordinaten: [number, number],
    quelle: 'exakt' | 'plz' | 'manuell'
  ) => Promise<void>;
}

const CONFIDENCE_LABELS = {
  hoch: { label: 'Hohe Übereinstimmung', color: 'text-green-600 bg-green-50 border-green-200' },
  mittel: { label: 'Mittlere Übereinstimmung', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  niedrig: { label: 'Niedrige Übereinstimmung', color: 'text-red-600 bg-red-50 border-red-200' },
};

export const AdressKorrekturModal = ({
  isOpen,
  onClose,
  projekt,
  onSave,
}: AdressKorrekturModalProps) => {
  // Adress-State
  const [strasse, setStrasse] = useState('');
  const [plz, setPlz] = useState('');
  const [ort, setOrt] = useState('');

  // Geocoding State
  const [isSearching, setIsSearching] = useState(false);
  const [vorschlaege, setVorschlaege] = useState<GeocodingVorschlag[]>([]);
  const [ausgewaehlterVorschlag, setAusgewaehlterVorschlag] = useState<GeocodingVorschlag | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hatGesucht, setHatGesucht] = useState(false);

  // Speichern State
  const [isSaving, setIsSaving] = useState(false);

  // Initialisiere Adressfelder aus Projekt
  useEffect(() => {
    if (isOpen && projekt) {
      const adresse = extrahiereAdresse(projekt);
      if (adresse) {
        setStrasse(adresse.strasse);
        setPlz(adresse.plz);
        setOrt(adresse.ort);
      } else {
        setStrasse(projekt.kundenstrasse || '');
        const plzMatch = projekt.kundenPlzOrt?.match(/(\d{5})/);
        setPlz(plzMatch ? plzMatch[1] : '');
        setOrt(projekt.kundenPlzOrt?.replace(/\d{5}\s*/, '').trim() || '');
      }
      setVorschlaege([]);
      setAusgewaehlterVorschlag(null);
      setFehler(null);
      setHatGesucht(false);
    }
  }, [isOpen, projekt]);

  // Adresse suchen (mit Google Geocoding API)
  const handleSuchen = useCallback(async () => {
    if (!strasse.trim() && !plz.trim()) {
      setFehler('Bitte mindestens Straße oder PLZ eingeben');
      return;
    }

    setIsSearching(true);
    setFehler(null);
    setAusgewaehlterVorschlag(null);

    try {
      // Verwendet Google Geocoding API (schnell, genau)
      const ergebnis = await geocodeAdresseSchnell(strasse, plz, ort);

      setHatGesucht(true);

      if (ergebnis.erfolg) {
        setVorschlaege(ergebnis.vorschlaege);

        // Bei eindeutigem Treffer (hohe Confidence) automatisch auswählen
        if (ergebnis.eindeutig || (ergebnis.vorschlaege[0]?.confidence === 'hoch')) {
          setAusgewaehlterVorschlag(ergebnis.vorschlaege[0]);
        }

        // Info über Quelle anzeigen
        if (ergebnis.quelle === 'plz') {
          setFehler('Nur PLZ-Zentrum gefunden. Für genauere Position prüfen Sie die Straße.');
        }
      } else {
        setVorschlaege([]);
        setFehler('Keine Adresse gefunden. Bitte prüfen Sie die Eingabe.');
      }
    } catch (error) {
      console.error('Geocoding-Fehler:', error);
      setFehler('Fehler bei der Adresssuche. Bitte versuchen Sie es erneut.');
    } finally {
      setIsSearching(false);
    }
  }, [strasse, plz, ort]);

  // Adresse übernehmen (exakt)
  const handleUebernehmen = async () => {
    if (!ausgewaehlterVorschlag) return;

    setIsSaving(true);
    try {
      await onSave(
        (projekt as any).$id || projekt.id,
        ausgewaehlterVorschlag.koordinaten,
        'exakt'
      );
      onClose();
    } catch (error) {
      console.error('Speichern-Fehler:', error);
      setFehler('Fehler beim Speichern. Bitte versuchen Sie es erneut.');
    } finally {
      setIsSaving(false);
    }
  };

  // PLZ-Fallback verwenden
  const handlePlzFallback = async () => {
    const plzClean = plz.trim();
    if (!plzClean) {
      setFehler('PLZ erforderlich für Fallback');
      return;
    }

    const coords = getKoordinatenFuerPLZ(plzClean);
    if (!coords) {
      setFehler('PLZ nicht in der Datenbank gefunden');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(
        (projekt as any).$id || projekt.id,
        [coords.lng, coords.lat], // [lon, lat]
        'plz'
      );
      onClose();
    } catch (error) {
      console.error('Speichern-Fehler:', error);
      setFehler('Fehler beim Speichern. Bitte versuchen Sie es erneut.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full transform transition-all max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-2xl px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-full">
                  <MapPin className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Adresse korrigieren</h2>
                  <p className="text-blue-100 text-sm">{projekt.kundenname}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={isSaving}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Content - scrollbar */}
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {/* Aktuelle Adresse */}
            <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Aktuelle Adresse im Projekt</div>
              <div className="text-gray-900 dark:text-white">
                {projekt.lieferadresse ? (
                  <>
                    <div>{projekt.lieferadresse.strasse}</div>
                    <div>{projekt.lieferadresse.plz} {projekt.lieferadresse.ort}</div>
                  </>
                ) : (
                  <>
                    <div>{projekt.kundenstrasse}</div>
                    <div>{projekt.kundenPlzOrt}</div>
                  </>
                )}
              </div>
              {projekt.koordinatenQuelle && (
                <div className="mt-2 text-xs">
                  <span className={`px-2 py-1 rounded-full ${
                    projekt.koordinatenQuelle === 'exakt'
                      ? 'bg-green-100 text-green-700'
                      : projekt.koordinatenQuelle === 'plz'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    Aktuelle Quelle: {projekt.koordinatenQuelle === 'exakt' ? 'Genaue Adresse' : projekt.koordinatenQuelle === 'plz' ? 'PLZ-Zentrum' : 'Manuell'}
                  </span>
                </div>
              )}
            </div>

            {/* Adress-Eingabe */}
            <div className="space-y-4">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Adresse für Geocoding eingeben oder korrigieren:
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Straße + Hausnummer</label>
                  <input
                    type="text"
                    value={strasse}
                    onChange={(e) => setStrasse(e.target.value)}
                    placeholder="z.B. Musterstraße 123"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">PLZ</label>
                    <input
                      type="text"
                      value={plz}
                      onChange={(e) => setPlz(e.target.value)}
                      placeholder="12345"
                      maxLength={5}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Ort</label>
                    <input
                      type="text"
                      value={ort}
                      onChange={(e) => setOrt(e.target.value)}
                      placeholder="Musterstadt"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSuchen}
                disabled={isSearching || (!strasse.trim() && !plz.trim())}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Search className="h-5 w-5" />
                )}
                {isSearching ? 'Suche...' : 'Adresse suchen'}
              </button>
            </div>

            {/* Fehler-Anzeige */}
            {fehler && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{fehler}</p>
                </div>
              </div>
            )}

            {/* Vorschläge */}
            {vorschlaege.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Gefundene Adressen ({vorschlaege.length}):
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {vorschlaege.map((vorschlag, index) => {
                    const isSelected = ausgewaehlterVorschlag === vorschlag;
                    const confidenceStyle = CONFIDENCE_LABELS[vorschlag.confidence];

                    return (
                      <button
                        key={index}
                        onClick={() => setAusgewaehlterVorschlag(vorschlag)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-gray-200 dark:border-slate-600 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {vorschlag.strasse || 'Straße unbekannt'} {vorschlag.hausnummer || ''}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {vorschlag.plz || ''} {vorschlag.ort || ''}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${confidenceStyle.color}`}>
                                {confidenceStyle.label}
                              </span>
                              <span className="text-xs text-gray-400">
                                <Navigation className="w-3 h-3 inline mr-1" />
                                {vorschlag.koordinaten[1].toFixed(4)}, {vorschlag.koordinaten[0].toFixed(4)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Keine Ergebnisse */}
            {hatGesucht && vorschlaege.length === 0 && !fehler && (
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
                <div className="flex gap-3">
                  <MapPinOff className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Keine Adresse gefunden
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Prüfen Sie die Schreibweise oder verwenden Sie den PLZ-Fallback.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer mit Buttons */}
          <div className="border-t border-gray-200 dark:border-slate-700 p-4 bg-gray-50 dark:bg-slate-800/50 flex-shrink-0">
            <div className="flex flex-col gap-3">
              {/* Hauptaktion: Adresse übernehmen */}
              <button
                onClick={handleUebernehmen}
                disabled={!ausgewaehlterVorschlag || isSaving}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Ausgewählte Adresse übernehmen
              </button>

              {/* PLZ-Fallback */}
              <button
                onClick={handlePlzFallback}
                disabled={!plz.trim() || isSaving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MapPin className="h-5 w-5" />
                PLZ-Zentrum verwenden (ungenau)
              </button>

              {/* Abbrechen */}
              <button
                onClick={onClose}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 font-medium rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdressKorrekturModal;
