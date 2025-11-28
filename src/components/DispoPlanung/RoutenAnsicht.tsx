import { useState, useEffect } from 'react';
import { Plus, Truck, MapPin, Clock, Euro, Edit, Trash2 } from 'lucide-react';
import { Route, Lieferung } from '../../types/dispo';
import { routeService } from '../../services/routeService';
import { lieferungService } from '../../services/lieferungService';
import { formatDatumZeit, formatDatum } from '../../utils/kalenderUtils';
import RouteDetails from './RouteDetails';

const RoutenAnsicht = () => {
  const [routen, setRouten] = useState<Route[]>([]);
  const [lieferungen, setLieferungen] = useState<Lieferung[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ausgewaehltesDatum, setAusgewaehltesDatum] = useState(new Date().toISOString().split('T')[0]);
  const [zeigeDetails, setZeigeDetails] = useState<Route | null>(null);

  useEffect(() => {
    ladeDaten();
  }, [ausgewaehltesDatum]);

  const ladeDaten = async () => {
    setIsLoading(true);
    try {
      const [geladeneRouten, alleLieferungen] = await Promise.all([
        routeService.loadRoutenFuerDatum(new Date(ausgewaehltesDatum)),
        lieferungService.loadAlleLieferungen(),
      ]);
      setRouten(geladeneRouten);
      setLieferungen(alleLieferungen);
    } catch (error) {
      console.error('Fehler beim Laden der Routen:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoeschen = async (routeId: string) => {
    if (!confirm('Möchten Sie diese Route wirklich löschen?')) return;
    
    try {
      await routeService.deleteRoute(routeId);
      ladeDaten();
    } catch (error) {
      console.error('Fehler beim Löschen der Route:', error);
      alert('Fehler beim Löschen der Route');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg p-6">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-semibold text-gray-700">Datum:</label>
            <input
              type="date"
              value={ausgewaehltesDatum}
              onChange={(e) => setAusgewaehltesDatum(e.target.value)}
              className="p-2 border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setZeigeDetails({} as Route)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Neue Route
          </button>
        </div>

        {/* Routen Liste */}
        {routen.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Truck className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p>Keine Routen für {formatDatum(new Date(ausgewaehltesDatum))}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {routen.map((route) => {
              const routeLieferungen = route.lieferungen
                .map(id => lieferungen.find(l => l.id === id))
                .filter((l): l is Lieferung => l !== undefined);

              return (
                <div
                  key={route.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {route.name}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Truck className="w-4 h-4" />
                          {route.fahrzeugId}
                        </span>
                        {route.fahrer && (
                          <span>👤 {route.fahrer}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDatumZeit(route.zeitplan.startZeit)} - {formatDatumZeit(route.zeitplan.rueckkehrZeit)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setZeigeDetails(route)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleLoeschen(route.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Lieferungen</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {route.lieferungen.length}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Distanz</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {route.routeDetails.gesamtDistanz.toFixed(1)} km
                      </div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Zeit</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {Math.round(route.routeDetails.gesamtZeit / 60)}h {route.routeDetails.gesamtZeit % 60}m
                      </div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Kosten</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {route.routeDetails.gesamtkosten.toFixed(2)} €
                      </div>
                    </div>
                  </div>

                  {/* Lieferungen in Route */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Lieferungen:
                    </h4>
                    {routeLieferungen.map((lieferung, index) => (
                      <div
                        key={lieferung.id}
                        className="flex items-center justify-between bg-gray-50 rounded-lg p-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-700">
                            {index + 1}.
                          </span>
                          <span className="text-gray-900">{lieferung.kundenname}</span>
                          <span className="text-gray-500">
                            ({lieferung.adresse.plz} {lieferung.adresse.ort})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <span>{lieferung.lieferdetails.paletten} Paletten</span>
                          <span>{lieferung.lieferdetails.tonnen.toFixed(2)} t</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Route Details Modal */}
      {zeigeDetails && (
        <RouteDetails
          route={zeigeDetails.id ? zeigeDetails : null}
          datum={new Date(ausgewaehltesDatum)}
          onClose={() => {
            setZeigeDetails(null);
            ladeDaten();
          }}
        />
      )}
    </>
  );
};

export default RoutenAnsicht;

