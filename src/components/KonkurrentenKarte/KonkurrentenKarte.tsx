import { useState, useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Search, MapPin, Info } from 'lucide-react';
import { Konkurrent } from '../../types/konkurrent';
import { konkurrentService } from '../../services/konkurrentService';
import { LieferkostenBerechnung } from '../../types/konkurrent';
import DeutschlandKarte from './DeutschlandKarte';

const KonkurrentenKarte = () => {
  const [konkurrenten, setKonkurrenten] = useState<Konkurrent[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedPLZ, setSelectedPLZ] = useState('');
  const [lieferkosten, setLieferkosten] = useState<LieferkostenBerechnung[]>([]);
  const [loadingLieferkosten, setLoadingLieferkosten] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const karteResetRef = useRef<() => void | null>(null);

  useEffect(() => {
    loadKonkurrenten();
  }, []);

  const loadKonkurrenten = async () => {
    try {
      setLoading(true);
      const data = await konkurrentService.loadAlleKonkurrenten();
      setKonkurrenten(data);
    } catch (error) {
      console.error('Fehler beim Laden der Konkurrenten:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePLZSuche = async () => {
    if (!selectedPLZ || selectedPLZ.length < 5) {
      return;
    }

    try {
      setLoadingLieferkosten(true);
      const berechnungen = await konkurrentService.berechneLieferkostenAlleKonkurrenten(selectedPLZ);
      setLieferkosten(berechnungen);
    } catch (error) {
      console.error('Fehler beim Berechnen der Lieferkosten:', error);
    } finally {
      setLoadingLieferkosten(false);
    }
  };

  const handleZoomIn = () => {
    setZoom((prevZoom) => Math.min(5, prevZoom * 1.2));
  };

  const handleZoomOut = () => {
    setZoom((prevZoom) => Math.max(0.5, prevZoom / 1.2));
  };

  const handleReset = () => {
    if (karteResetRef.current) {
      karteResetRef.current();
    }
    setZoom(1);
  };

  const handleFullscreen = () => {
    if (!isFullscreen && mapRef.current) {
      mapRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);


  const konkurrentenMitKoordinaten = konkurrenten.filter((k) => k.adresse.koordinaten);
  const konkurrentenTennisSand = konkurrentenMitKoordinaten.filter((k) => 
    k.produkte.includes('tennissand') || k.produkte.includes('tennismehl')
  );

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Lade Konkurrenten...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PLZ-Suche */}
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2">
          <Search className="w-5 h-5" />
          Lieferkosten nach Postleitzahl
        </h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="plz" className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Postleitzahl eingeben
            </label>
            <input
              id="plz"
              type="text"
              value={selectedPLZ}
              onChange={(e) => setSelectedPLZ(e.target.value.replace(/\D/g, '').slice(0, 5))}
              onKeyPress={(e) => e.key === 'Enter' && handlePLZSuche()}
              placeholder="z.B. 80331"
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              maxLength={5}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handlePLZSuche}
              disabled={!selectedPLZ || selectedPLZ.length < 5 || loadingLieferkosten}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loadingLieferkosten ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Berechne...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Berechnen
                </>
              )}
            </button>
          </div>
        </div>

        {/* Lieferkosten-Ergebnisse */}
        {lieferkosten.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-3">
              Lieferkosten für PLZ {selectedPLZ} (pro Tonne Tennis-Sand)
            </h3>
            <div className="space-y-2">
              {lieferkosten.map((berechnung) => (
                <div
                  key={berechnung.konkurrentId}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-dark-border"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-dark-text">{berechnung.konkurrentName}</div>
                    <div className="text-sm text-gray-600 dark:text-dark-textMuted mt-1">{berechnung.berechnungsgrundlage}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-red-600">
                      {berechnung.kostenProTonne.toFixed(2)} €/t
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Karte */}
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
              Konkurrenten-Karte ({konkurrentenTennisSand.length} Konkurrenten)
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-textMuted mt-1">
              Standorte der Konkurrenten, die Tennis-Mehl/Tennis-Sand herstellen. Marker-Größe = Produktionsmenge
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              title="Zurücksetzen"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-600 dark:text-dark-textMuted min-w-[3rem] text-center">
              {(zoom * 100).toFixed(0)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={handleFullscreen}
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={mapRef}
          className="relative w-full h-[600px] bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden border-2 border-gray-300 dark:border-dark-border"
          style={{ position: 'relative' }}
        >
          {/* Eigene Deutschland-Karte */}
          <DeutschlandKarte
            konkurrenten={konkurrentenTennisSand}
            zoom={zoom}
            onZoomChange={setZoom}
            onReset={() => {
              // Reset function wird intern verwaltet
            }}
            onKonkurrentClick={(konkurrent) => {
              console.log('Konkurrent geklickt:', konkurrent);
            }}
          />

          {/* Legende */}
          <div className="absolute bottom-4 left-4 bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-4 max-w-xs z-30 pointer-events-none">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Legende
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-600" />
                <span className="text-gray-600 dark:text-dark-textMuted">Klein (bis 2.000 t/Jahr)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-red-600" />
                <span className="text-gray-600 dark:text-dark-textMuted">Mittel (2.000-5.000 t/Jahr)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-red-600" />
                <span className="text-gray-600 dark:text-dark-textMuted">Groß (über 5.000 t/Jahr)</span>
              </div>
            </div>
            {konkurrentenTennisSand.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-dark-border">
                <div className="text-xs text-gray-600 dark:text-dark-textMuted">
                  <strong>{konkurrentenTennisSand.length}</strong> Konkurrent(en) gefunden
                </div>
              </div>
            )}
          </div>

          {/* Info-Box */}
          <div className="absolute top-4 right-4 bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-4 max-w-xs z-30 pointer-events-none">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-gray-600 dark:text-dark-textMuted">
                <p className="font-semibold mb-1">Hinweis:</p>
                <p>
                  Marker-Größe zeigt die Produktionsmenge. Zoomen Sie mit dem Mausrad, verschieben Sie die Karte per Drag & Drop.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Konkurrenten-Liste */}
        {konkurrentenTennisSand.length > 0 && (
          <div className="mt-6">
            <h4 className="text-md font-semibold text-gray-900 dark:text-dark-text mb-3">Konkurrenten-Übersicht</h4>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {konkurrentenTennisSand.map((konkurrent) => (
                <div
                  key={konkurrent.id}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-dark-border"
                >
                  <div className="font-semibold text-gray-900 dark:text-dark-text">{konkurrent.name}</div>
                  <div className="text-sm text-gray-600 dark:text-dark-textMuted mt-1">
                    {konkurrent.adresse.plz} {konkurrent.adresse.ort}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-dark-textMuted mt-2">
                    Produkte: {konkurrent.produkte.map(p => p === 'tennissand' ? 'Tennis-Sand' : 'Tennis-Mehl').join(', ')}
                  </div>
                  {konkurrent.produktionsmenge && (
                    <div className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
                      Produktion: {konkurrent.produktionsmenge.toLocaleString()} t/Jahr
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KonkurrentenKarte;
