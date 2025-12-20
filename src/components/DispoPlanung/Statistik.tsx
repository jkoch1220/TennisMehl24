import { useState, useEffect } from 'react';
import { TrendingUp, Package, Truck, Euro } from 'lucide-react';
import { Lieferung, Route } from '../../types/dispo';
import { lieferungService } from '../../services/lieferungService';
import { routeService } from '../../services/routeService';
import { formatDatum } from '../../utils/kalenderUtils';

const Statistik = () => {
  const [lieferungen, setLieferungen] = useState<Lieferung[]>([]);
  const [routen, setRouten] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zeitraum, setZeitraum] = useState<'woche' | 'monat' | 'jahr'>('monat');

  useEffect(() => {
    ladeDaten();
  }, [zeitraum]);

  const ladeDaten = async () => {
    setIsLoading(true);
    try {
      const jetzt = new Date();
      let von: Date;
      let bis: Date;

      if (zeitraum === 'woche') {
        von = new Date(jetzt);
        von.setDate(von.getDate() - 7);
        bis = jetzt;
      } else if (zeitraum === 'monat') {
        von = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
        bis = jetzt;
      } else {
        von = new Date(jetzt.getFullYear(), 0, 1);
        bis = jetzt;
      }

      const [geladeneLieferungen, alleRouten] = await Promise.all([
        lieferungService.loadLieferungenVonBis(von, bis),
        routeService.loadAlleRouten(),
      ]);

      setLieferungen(geladeneLieferungen);
      setRouten(alleRouten.filter((r) => {
        const routeDatum = new Date(r.datum);
        return routeDatum >= von && routeDatum <= bis;
      }));
    } catch (error) {
      console.error('Fehler beim Laden der Statistiken:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const statistik = {
    gesamtLieferungen: lieferungen.length,
    gelieferteLieferungen: lieferungen.filter((l) => l.status === 'geliefert' || l.status === 'abgerechnet').length,
    gesamtTonnen: lieferungen.reduce((sum, l) => sum + l.lieferdetails.tonnen, 0),
    gesamtPaletten: lieferungen.reduce((sum, l) => sum + l.lieferdetails.paletten, 0),
    gesamtRouten: routen.length,
    gesamtKilometer: routen.reduce((sum, r) => sum + r.routeDetails.gesamtDistanz, 0),
    gesamtKosten: routen.reduce((sum, r) => sum + r.routeDetails.gesamtkosten, 0),
    durchschnittlicheRouteKosten: routen.length > 0
      ? routen.reduce((sum, r) => sum + r.routeDetails.gesamtkosten, 0) / routen.length
      : 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Zeitraum Auswahl */}
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-semibold text-gray-700 dark:text-dark-textMuted">Zeitraum:</label>
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {(['woche', 'monat', 'jahr'] as const).map((z) => (
              <button
                key={z}
                onClick={() => setZeitraum(z)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  zeitraum === z
                    ? 'bg-white text-red-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {z === 'woche' ? 'Letzte Woche' : z === 'monat' ? 'Dieser Monat' : 'Dieses Jahr'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Statistik Karten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-8 h-8 text-blue-500" />
            <span className="text-2xl font-bold text-gray-900 dark:text-dark-text">
              {statistik.gesamtLieferungen}
            </span>
          </div>
          <div className="text-sm text-gray-600 dark:text-dark-textMuted">Gesamt Lieferungen</div>
          <div className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
            {statistik.gelieferteLieferungen} geliefert
          </div>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-green-500" />
            <span className="text-2xl font-bold text-gray-900 dark:text-dark-text">
              {statistik.gesamtTonnen.toFixed(1)}
            </span>
          </div>
          <div className="text-sm text-gray-600 dark:text-dark-textMuted">Gesamt Tonnen</div>
          <div className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
            {statistik.gesamtPaletten} Paletten
          </div>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <Truck className="w-8 h-8 text-orange-500" />
            <span className="text-2xl font-bold text-gray-900 dark:text-dark-text">
              {statistik.gesamtRouten}
            </span>
          </div>
          <div className="text-sm text-gray-600 dark:text-dark-textMuted">Routen</div>
          <div className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
            {statistik.gesamtKilometer.toFixed(0)} km gefahren
          </div>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <Euro className="w-8 h-8 text-red-500" />
            <span className="text-2xl font-bold text-gray-900 dark:text-dark-text">
              {statistik.gesamtKosten.toFixed(0)} €
            </span>
          </div>
          <div className="text-sm text-gray-600 dark:text-dark-textMuted">Gesamtkosten</div>
          <div className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
            Ø {statistik.durchschnittlicheRouteKosten.toFixed(2)} € pro Route
          </div>
        </div>
      </div>

      {/* Status Übersicht */}
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4">Status-Übersicht</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {(['geplant', 'bestaetigt', 'beladen', 'unterwegs', 'geliefert', 'abgerechnet'] as const).map((status) => {
            const anzahl = lieferungen.filter((l) => l.status === status).length;
            return (
              <div key={status} className="text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-dark-text">{anzahl}</div>
                <div className="text-xs text-gray-600 dark:text-dark-textMuted capitalize">{status}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Letzte Routen */}
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4">Letzte Routen</h3>
        {routen.length === 0 ? (
          <p className="text-gray-500 dark:text-dark-textMuted text-sm">Keine Routen im ausgewählten Zeitraum</p>
        ) : (
          <div className="space-y-2">
            {routen.slice(0, 5).map((route) => (
              <div
                key={route.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-dark-text">{route.name}</div>
                  <div className="text-sm text-gray-600 dark:text-dark-textMuted">
                    {formatDatum(new Date(route.datum))} - {route.lieferungen.length} Lieferungen
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900 dark:text-dark-text">
                    {route.routeDetails.gesamtkosten.toFixed(2)} €
                  </div>
                  <div className="text-xs text-gray-600 dark:text-dark-textMuted">
                    {route.routeDetails.gesamtDistanz.toFixed(1)} km
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Statistik;

