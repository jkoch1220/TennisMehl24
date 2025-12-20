import { useState, useEffect } from 'react';
import { X, Save, Sparkles } from 'lucide-react';
import { Route, Lieferung, Fahrzeug, NeueRoute } from '../../types/dispo';
import { routeService } from '../../services/routeService';
import { lieferungService } from '../../services/lieferungService';
import { fahrzeugService } from '../../services/fahrzeugService';
import { optimiereRoute, pruefeKapazitaet } from '../../utils/routeOptimization';
import { formatDatumZeit } from '../../utils/kalenderUtils';

interface RouteDetailsProps {
  route: Route | null;
  datum: Date;
  onClose: () => void;
}

const RouteDetails = ({ route, datum, onClose }: RouteDetailsProps) => {
  const [lieferungen, setLieferungen] = useState<Lieferung[]>([]);
  const [verfuegbareLieferungen, setVerfuegbareLieferungen] = useState<Lieferung[]>([]);
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [formData, setFormData] = useState<Partial<NeueRoute>>({
    name: '',
    datum: datum.toISOString(),
    fahrzeugId: '',
    fahrer: '',
    lieferungen: [],
    routeDetails: {
      startAdresse: 'Wertheimer Str. 30, 97828 Marktheidenfeld',
      endAdresse: 'Wertheimer Str. 30, 97828 Marktheidenfeld',
      gesamtDistanz: 0,
      gesamtFahrzeit: 0,
      gesamtZeit: 0,
      dieselkosten: 0,
      verschleisskosten: 0,
      gesamtkosten: 0,
    },
    zeitplan: {
      startZeit: new Date(datum.setHours(8, 0, 0, 0)).toISOString(),
      rueckkehrZeit: new Date(datum.setHours(17, 0, 0, 0)).toISOString(),
      stops: [],
    },
    status: 'geplant',
    optimiert: false,
  });

  useEffect(() => {
    ladeDaten();
    if (route) {
      setFormData({
        ...route,
        datum: route.datum,
      });
    } else {
      setFormData({
        ...formData,
        name: `Route ${datum.toLocaleDateString('de-DE')}`,
      });
    }
  }, [route]);

  const ladeDaten = async () => {
    setIsLoading(true);
    try {
      const [alleLieferungen, alleFahrzeuge] = await Promise.all([
        lieferungService.loadAlleLieferungen(),
        fahrzeugService.loadVerfuegbareFahrzeuge(datum),
      ]);

      const datumString = datum.toISOString().split('T')[0];
      setVerfuegbareLieferungen(
        alleLieferungen.filter(
          (l) =>
            !l.route &&
            new Date(l.zeitfenster.gewuenscht).toISOString().split('T')[0] === datumString
        )
      );

      if (route) {
        const routeLieferungen = route.lieferungen
          .map((id) => alleLieferungen.find((l) => l.id === id))
          .filter((l): l is Lieferung => l !== undefined);
        setLieferungen(routeLieferungen);
      }

      setFahrzeuge(alleFahrzeuge);
      if (alleFahrzeuge.length > 0 && !formData.fahrzeugId) {
        setFormData({ ...formData, fahrzeugId: alleFahrzeuge[0].id });
      }
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptimieren = async () => {
    if (!formData.fahrzeugId || formData.lieferungen!.length === 0) {
      alert('Bitte wählen Sie ein Fahrzeug und mindestens eine Lieferung aus.');
      return;
    }

    setIsOptimizing(true);
    try {
      const fahrzeug = fahrzeuge.find((f) => f.id === formData.fahrzeugId);
      if (!fahrzeug) {
        throw new Error('Fahrzeug nicht gefunden');
      }

      const zuOptimierendeLieferungen = formData
        .lieferungen!.map((id) => verfuegbareLieferungen.find((l) => l.id === id))
        .filter((l): l is Lieferung => l !== undefined);

      // Prüfe Kapazität
      const kapazitaet = pruefeKapazitaet(zuOptimierendeLieferungen, fahrzeug);
      if (!kapazitaet.passt) {
        alert(
          `Die ausgewählten Lieferungen (${kapazitaet.gesamtTonnen.toFixed(
            2
          )} t) passen nicht in das Fahrzeug (${fahrzeug.kapazitaetTonnen} t).`
        );
        setIsOptimizing(false);
        return;
      }

      const startZeit = new Date(formData.zeitplan!.startZeit);
      const optimierung = await optimiereRoute(
        zuOptimierendeLieferungen,
        fahrzeug,
        startZeit
      );

      setFormData({
        ...formData,
        lieferungen: optimierung.optimierteReihenfolge.map((l) => l.id),
        routeDetails: optimierung.routeDetails,
        zeitplan: optimierung.zeitplan,
        optimiert: true,
      });

      setLieferungen(optimierung.optimierteReihenfolge);
    } catch (error) {
      console.error('Fehler bei der Optimierung:', error);
      alert('Fehler bei der Routenoptimierung');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSpeichern = async () => {
    try {
      if (route) {
        await routeService.updateRoute(route.id, formData as Partial<Route>);
      } else {
        await routeService.createRoute(formData as NeueRoute);
      }
      onClose();
    } catch (error) {
      console.error('Fehler beim Speichern der Route:', error);
      alert('Fehler beim Speichern der Route');
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-dark-surface rounded-lg p-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">
            {route ? 'Route bearbeiten' : 'Neue Route'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formular */}
        <div className="p-6 space-y-6">
          {/* Basis-Informationen */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
                Name
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
                Fahrzeug
              </label>
              <select
                value={formData.fahrzeugId || ''}
                onChange={(e) => setFormData({ ...formData, fahrzeugId: e.target.value })}
                className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
              >
                <option value="">Fahrzeug auswählen...</option>
                {fahrzeuge.map((fahrzeug) => (
                  <option key={fahrzeug.id} value={fahrzeug.id}>
                    {fahrzeug.kennzeichen} ({fahrzeug.kapazitaetTonnen} t)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
              Fahrer
            </label>
            <input
              type="text"
              value={formData.fahrer || ''}
              onChange={(e) => setFormData({ ...formData, fahrer: e.target.value })}
              className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
            />
          </div>

          {/* Verfügbare Lieferungen */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
              Verfügbare Lieferungen
            </label>
            <div className="border border-gray-200 dark:border-dark-border rounded-lg p-4 max-h-64 overflow-y-auto">
              {verfuegbareLieferungen.length === 0 ? (
                <p className="text-gray-500 dark:text-dark-textMuted text-sm">Keine verfügbaren Lieferungen</p>
              ) : (
                <div className="space-y-2">
                  {verfuegbareLieferungen.map((lieferung) => (
                    <label
                      key={lieferung.id}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.lieferungen?.includes(lieferung.id) || false}
                        onChange={(e) => {
                          const aktuelleLieferungen = formData.lieferungen || [];
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              lieferungen: [...aktuelleLieferungen, lieferung.id],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              lieferungen: aktuelleLieferungen.filter((id) => id !== lieferung.id),
                            });
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-dark-text">
                          {lieferung.kundenname}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-dark-textMuted">
                          {lieferung.adresse.plz} {lieferung.adresse.ort} -{' '}
                          {lieferung.lieferdetails.paletten} Paletten -{' '}
                          {lieferung.lieferdetails.tonnen.toFixed(2)} t
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Optimierung */}
          {formData.lieferungen && formData.lieferungen.length > 0 && (
            <div>
              <button
                onClick={handleOptimieren}
                disabled={isOptimizing || !formData.fahrzeugId}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-5 h-5" />
                {isOptimizing ? 'Optimiere...' : 'Route optimieren'}
              </button>
            </div>
          )}

          {/* Route Details */}
          {formData.optimiert && formData.routeDetails && (
            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-gray-900 dark:text-dark-text">Route-Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-dark-textMuted">Distanz:</span>{' '}
                  <span className="font-semibold">
                    {formData.routeDetails.gesamtDistanz.toFixed(1)} km
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-dark-textMuted">Gesamtzeit:</span>{' '}
                  <span className="font-semibold">
                    {Math.round(formData.routeDetails.gesamtZeit / 60)}h{' '}
                    {formData.routeDetails.gesamtZeit % 60}m
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-dark-textMuted">Dieselkosten:</span>{' '}
                  <span className="font-semibold">
                    {formData.routeDetails.dieselkosten.toFixed(2)} €
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-dark-textMuted">Gesamtkosten:</span>{' '}
                  <span className="font-semibold">
                    {formData.routeDetails.gesamtkosten.toFixed(2)} €
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Optimierte Reihenfolge */}
          {lieferungen.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-2">Lieferreihenfolge:</h3>
              <div className="space-y-2">
                {lieferungen.map((lieferung, index) => {
                  const stop = formData.zeitplan?.stops.find(
                    (s) => s.lieferungId === lieferung.id
                  );
                  return (
                    <div
                      key={lieferung.id}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-700 dark:text-dark-textMuted">{index + 1}.</span>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-dark-text">
                            {lieferung.kundenname}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-dark-textMuted">
                            {lieferung.adresse.plz} {lieferung.adresse.ort}
                          </div>
                        </div>
                      </div>
                      {stop && (
                        <div className="text-sm text-gray-600 dark:text-dark-textMuted">
                          {formatDatumZeit(stop.ankunft)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 p-6 border-t border-gray-200 dark:border-dark-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-textMuted bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSpeichern}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Save className="w-5 h-5" />
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

export default RouteDetails;

