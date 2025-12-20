import { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import { Bestellung } from '../../types/bestellung';

const START_COORDS: [number, number] = [49.85, 9.60]; // Marktheidenfeld [lat, lon] für Google Maps

interface BestellungsKarteProps {
  bestellungen: Bestellung[];
  onBestellungClick?: (bestellung: Bestellung) => void;
}

const BestellungsKarte = ({ bestellungen }: BestellungsKarteProps) => {
  const [zoom, setZoom] = useState(10);
  const [center, setCenter] = useState<[number, number]>(START_COORDS);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  // Berechne minimale und maximale Tonnen für Skalierung
  const tonnenWerte = bestellungen
    .filter((b) => b.adresse.koordinaten)
    .map((b) => b.bestelldetails.tonnen);
  const minTonnen = tonnenWerte.length > 0 ? Math.min(...tonnenWerte, 1) : 1;
  const maxTonnen = tonnenWerte.length > 0 ? Math.max(...tonnenWerte, 10) : 10;

  // Berechne Punktgröße basierend auf Tonnen (für zukünftige Verwendung)
  // const getPunktGroesse = (tonnen: number): number => {
  //   if (tonnenWerte.length === 0) return 20;
  //   const faktor = (tonnen - minTonnen) / (maxTonnen - minTonnen || 1);
  //   return 15 + faktor * 35; // Mindestgröße 15px, Maximum 50px
  // };

  // Berechne Farbe basierend auf Status
  const getPunktFarbe = (status: Bestellung['status']): string => {
    const farben: Record<Bestellung['status'], string> = {
      offen: '#3b82f6', // blue
      geplant: '#eab308', // yellow
      in_produktion: '#a855f7', // purple
      bereit: '#22c55e', // green
      geliefert: '#6b7280', // gray
      storniert: '#ef4444', // red
    };
    return farben[status] || '#6b7280';
  };

  const handleZoomIn = () => {
    setZoom((prevZoom) => Math.min(18, prevZoom + 1));
  };

  const handleZoomOut = () => {
    setZoom((prevZoom) => Math.max(3, prevZoom - 1));
  };

  const handleReset = () => {
    setCenter(START_COORDS);
    setZoom(10);
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

  const bestellungenMitKoordinaten = bestellungen.filter((b) => b.adresse.koordinaten);

  // Auto-Zoom auf Bestellungen beim ersten Laden
  useEffect(() => {
    if (bestellungenMitKoordinaten.length > 0 && center[0] === START_COORDS[0] && center[1] === START_COORDS[1]) {
      const avgLat = bestellungenMitKoordinaten.reduce((sum, b) => sum + (b.adresse.koordinaten?.[1] || 0), 0) / bestellungenMitKoordinaten.length;
      const avgLon = bestellungenMitKoordinaten.reduce((sum, b) => sum + (b.adresse.koordinaten?.[0] || 0), 0) / bestellungenMitKoordinaten.length;
      setCenter([avgLat, avgLon]);
      
      // Berechne passenden Zoom-Level basierend auf Ausdehnung
      const lats = bestellungenMitKoordinaten.map(b => b.adresse.koordinaten![1]);
      const lons = bestellungenMitKoordinaten.map(b => b.adresse.koordinaten![0]);
      const latRange = Math.max(...lats) - Math.min(...lats);
      const lonRange = Math.max(...lons) - Math.min(...lons);
      const maxRange = Math.max(latRange, lonRange);
      const calculatedZoom = Math.max(8, Math.min(15, 12 - Math.log2(maxRange * 2)));
      setZoom(calculatedZoom);
    }
  }, [bestellungenMitKoordinaten.length]);

  // Erstelle Marker-URLs für Google Maps (für zukünftige Verwendung)
  // const markerUrls = bestellungenMitKoordinaten.map((bestellung, index) => {
  //   if (!bestellung.adresse.koordinaten) return '';
  //   const [lon, lat] = bestellung.adresse.koordinaten;
  //   const farbe = getPunktFarbe(bestellung.status).replace('#', '');
  //   // Google Maps Marker mit Farbe
  //   return `&markers=color:0x${farbe}|label:${index + 1}|${lat},${lon}`;
  // }).join('');

  // Google Maps Embed URL (funktioniert auch ohne API Key für einfache Embed-Karten)
  // Verwende die einfache Google Maps URL mit q-Parameter für mehrere Marker
  const allMarkers = bestellungenMitKoordinaten
    .map(b => b.adresse.koordinaten ? `${b.adresse.koordinaten[1]},${b.adresse.koordinaten[0]}` : '')
    .filter(Boolean)
    .join('/');
  
  const googleMapsUrl = allMarkers
    ? `https://www.google.com/maps?q=${allMarkers}&z=${Math.floor(zoom)}&output=embed`
    : `https://www.google.com/maps?q=${center[0]},${center[1]}&z=${Math.floor(zoom)}&output=embed`;

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
            Kartenansicht ({bestellungenMitKoordinaten.length} von {bestellungen.length} Bestellungen)
          </h3>
          {bestellungen.length > bestellungenMitKoordinaten.length && (
            <p className="text-xs text-yellow-600 mt-1">
              ⚠️ {bestellungen.length - bestellungenMitKoordinaten.length} Bestellung(en) ohne Koordinaten - werden nicht angezeigt
            </p>
          )}
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
            {zoom.toFixed(1)}x
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
        {/* Google Maps Embed */}
        <iframe
          src={googleMapsUrl}
          className="absolute inset-0 w-full h-full"
          style={{ border: 'none' }}
          title="Karte"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />


        {/* Legende */}
        <div className="absolute bottom-4 left-4 bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-4 max-w-xs z-30 pointer-events-none">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">Legende</h4>
          <div className="space-y-1 text-xs">
            {(['offen', 'geplant', 'in_produktion', 'bereit', 'geliefert', 'storniert'] as const).map((status) => (
              <div key={status} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: getPunktFarbe(status) }}
                />
                <span className="text-gray-600 dark:text-dark-textMuted capitalize">{status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-dark-border">
            <div className="text-xs text-gray-600 dark:text-dark-textMuted mb-2">
              Punktgröße = Bestellmenge
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-gray-600 dark:text-dark-textMuted">{minTonnen.toFixed(1)} t</span>
              <div className="flex-1 border-t border-gray-300 dark:border-dark-border mx-2" />
              <div className="w-6 h-6 rounded-full bg-blue-500" />
              <span className="text-xs text-gray-600 dark:text-dark-textMuted">{maxTonnen.toFixed(1)} t</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BestellungsKarte;

