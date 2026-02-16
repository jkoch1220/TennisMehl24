/**
 * ProjektKartenansicht - Zeigt Projekte auf einer Google Maps Karte nach Status farblich markiert
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  OverlayViewF,
  InfoWindowF,
  OVERLAY_MOUSE_TARGET,
} from '@react-google-maps/api';
import {
  MapPin,
  Package,
  Loader2,
  X,
  Building2,
  Euro,
  ChevronRight,
  FileCheck,
  Send,
  FileSignature,
  Truck,
  FileText,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';

// Konstanten
const WERK_POSITION = { lat: 49.85, lng: 9.60 }; // Marktheidenfeld
const MAP_STYLE = { width: '100%', height: '100%', minHeight: '600px' };

// Geocoding Cache
const GEOCODE_CACHE_KEY = 'projekte_geocode_cache_v1';

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  gestureHandling: 'cooperative',
  styles: [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#dbeafe' }] },
    { featureType: 'landscape.natural', elementType: 'geometry.fill', stylers: [{ color: '#f0fdf4' }] },
  ],
};

// Status-Konfiguration mit Farben und Icons
const STATUS_CONFIG: Record<ProjektStatus, { label: string; color: string; fillColor: string; icon: React.ComponentType<any> }> = {
  angebot: { label: 'Angebot', color: '#2563eb', fillColor: '#3b82f6', icon: FileCheck },
  angebot_versendet: { label: 'Angebot versendet', color: '#4f46e5', fillColor: '#6366f1', icon: Send },
  auftragsbestaetigung: { label: 'Auftragsbestätigung', color: '#ea580c', fillColor: '#f97316', icon: FileSignature },
  lieferschein: { label: 'Lieferschein', color: '#16a34a', fillColor: '#22c55e', icon: Truck },
  rechnung: { label: 'Rechnung', color: '#dc2626', fillColor: '#ef4444', icon: FileText },
  bezahlt: { label: 'Bezahlt', color: '#059669', fillColor: '#10b981', icon: CheckCircle2 },
  verloren: { label: 'Verloren', color: '#6b7280', fillColor: '#9ca3af', icon: XCircle },
};

interface ProjektMarker {
  projekt: Projekt;
  position: { lat: number; lng: number };
}

interface ProjektKartenansichtProps {
  projekte: Projekt[];
  onProjektClick: (projekt: Projekt) => void;
  statusFilter?: ProjektStatus[];
}

// Geocode Cache laden/speichern
const loadCache = (): Map<string, { lat: number; lng: number }> => {
  try {
    const cached = localStorage.getItem(GEOCODE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {
    console.warn('Cache-Ladefehler:', e);
  }
  return new Map();
};

const saveCache = (cache: Map<string, { lat: number; lng: number }>) => {
  try {
    const obj = Object.fromEntries(cache);
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn('Cache-Speicherfehler:', e);
  }
};

// Geocoding via Google Maps Geocoder
const geocodeAddress = async (
  plzOrt: string,
  strasse: string | undefined,
  geocoder: google.maps.Geocoder
): Promise<{ lat: number; lng: number } | null> => {
  return new Promise((resolve) => {
    // Versuche erst mit Straße, dann ohne
    const query = strasse ? `${strasse}, ${plzOrt}, Deutschland` : `${plzOrt}, Deutschland`;
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else if (strasse) {
        // Fallback ohne Straße
        geocoder.geocode({ address: `${plzOrt}, Deutschland` }, (results2, status2) => {
          if (status2 === 'OK' && results2 && results2.length > 0) {
            const loc = results2[0].geometry.location;
            resolve({ lat: loc.lat(), lng: loc.lng() });
          } else {
            resolve(null);
          }
        });
      } else {
        resolve(null);
      }
    });
  });
};

const ProjektKartenansicht = ({
  projekte,
  onProjektClick,
  statusFilter,
}: ProjektKartenansichtProps) => {
  const [markers, setMarkers] = useState<ProjektMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<ProjektMarker | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const geocodeCacheRef = useRef<Map<string, { lat: number; lng: number }>>(loadCache());

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  // Filtere Projekte nach Status
  const gefilterteProjekte = statusFilter
    ? projekte.filter(p => statusFilter.includes(p.status))
    : projekte;

  // Geocode alle Projekte
  useEffect(() => {
    if (!isLoaded || gefilterteProjekte.length === 0) return;

    const geocodeAll = async () => {
      setIsGeocoding(true);
      setGeocodedCount(0);

      if (!geocoderRef.current) {
        geocoderRef.current = new google.maps.Geocoder();
      }

      const newMarkers: ProjektMarker[] = [];
      let count = 0;

      for (const projekt of gefilterteProjekte) {
        const plzOrt = projekt.kundenPlzOrt || '';
        const strasse = projekt.kundenstrasse;
        const cacheKey = `${plzOrt}_${strasse || ''}`.toLowerCase().trim();

        if (!plzOrt) {
          count++;
          setGeocodedCount(count);
          continue;
        }

        let position = geocodeCacheRef.current.get(cacheKey);

        if (!position) {
          // Geocode mit Rate-Limiting (100ms zwischen Anfragen)
          await new Promise(r => setTimeout(r, 100));
          position = await geocodeAddress(plzOrt, strasse, geocoderRef.current!) || undefined;

          if (position) {
            geocodeCacheRef.current.set(cacheKey, position);
          }
        }

        if (position) {
          newMarkers.push({
            projekt,
            position,
          });
        }

        count++;
        setGeocodedCount(count);
      }

      // Cache speichern
      saveCache(geocodeCacheRef.current);

      setMarkers(newMarkers);
      setIsGeocoding(false);

      // Karte auf alle Marker anpassen
      if (mapRef.current && newMarkers.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        newMarkers.forEach(m => bounds.extend(m.position));
        mapRef.current.fitBounds(bounds, 50);
      }
    };

    geocodeAll();
  }, [isLoaded, gefilterteProjekte]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Statistik pro Status
  const statusCounts = markers.reduce((acc, m) => {
    acc[m.projekt.status] = (acc[m.projekt.status] || 0) + 1;
    return acc;
  }, {} as Record<ProjektStatus, number>);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 dark:bg-slate-800 rounded-xl">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="h-[70vh] rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 relative">
      {/* Loading Overlay */}
      {isGeocoding && (
        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 z-20 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-2" />
            <p className="text-gray-600 dark:text-gray-400">
              Geocoding... {geocodedCount}/{gefilterteProjekte.length}
            </p>
          </div>
        </div>
      )}

      {/* Legende-Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-white dark:bg-slate-800 rounded-xl shadow-lg p-3 border border-gray-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {Object.entries(STATUS_CONFIG).map(([status, config]) => {
            const count = statusCounts[status as ProjektStatus] || 0;
            if (count === 0 && statusFilter && !statusFilter.includes(status as ProjektStatus)) return null;
            const StatusIcon = config.icon;
            return (
              <div key={status} className="flex items-center gap-1.5">
                <StatusIcon className="w-4 h-4" style={{ color: config.color }} />
                <span className="font-medium" style={{ color: config.color }}>{count}</span>
                <span className="text-gray-500 dark:text-gray-400 text-xs">{config.label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-gray-400">
          {markers.length} Projekte auf Karte
        </div>
      </div>

      <GoogleMap
        mapContainerStyle={MAP_STYLE}
        center={WERK_POSITION}
        zoom={7}
        options={MAP_OPTIONS}
        onLoad={onMapLoad}
      >
        {/* Werk-Marker */}
        <OverlayViewF
          position={WERK_POSITION}
          mapPaneName={OVERLAY_MOUSE_TARGET}
        >
          <div className="transform -translate-x-1/2 -translate-y-1/2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
          </div>
        </OverlayViewF>

        {/* Projekt-Marker */}
        {markers.map((marker) => {
          const config = STATUS_CONFIG[marker.projekt.status];
          const StatusIcon = config.icon;
          return (
            <OverlayViewF
              key={(marker.projekt as any).$id || marker.projekt.id}
              position={marker.position}
              mapPaneName={OVERLAY_MOUSE_TARGET}
            >
              <div
                className="transform -translate-x-1/2 -translate-y-full cursor-pointer transition-all hover:scale-110"
                onClick={() => setSelectedMarker(marker)}
              >
                <div className="relative">
                  <MapPin
                    className="w-8 h-8 drop-shadow-md"
                    style={{ color: config.color }}
                    fill={config.fillColor}
                  />
                  {/* Status-Icon als Badge */}
                  <div
                    className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow border"
                    style={{ borderColor: config.color }}
                  >
                    <StatusIcon className="w-3 h-3" style={{ color: config.color }} />
                  </div>
                </div>
              </div>
            </OverlayViewF>
          );
        })}

        {/* Info Window */}
        {selectedMarker && (
          <InfoWindowF
            position={selectedMarker.position}
            onCloseClick={() => setSelectedMarker(null)}
          >
            <div className="p-2 min-w-[280px] max-w-[350px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-900 text-lg">
                  {selectedMarker.projekt.kundenname}
                </h3>
                <button
                  onClick={() => setSelectedMarker(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="w-4 h-4 text-purple-500" />
                  <span>{selectedMarker.projekt.kundenPlzOrt}</span>
                </div>

                {/* Status Badge */}
                {(() => {
                  const config = STATUS_CONFIG[selectedMarker.projekt.status];
                  const StatusIcon = config.icon;
                  return (
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${config.fillColor}20`,
                        color: config.color,
                      }}
                    >
                      <StatusIcon className="w-3.5 h-3.5" />
                      {config.label}
                    </div>
                  );
                })()}

                {/* Dokument-Nummern */}
                <div className="space-y-1 pt-1">
                  {selectedMarker.projekt.angebotsnummer && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <FileCheck className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs">Angebot: {selectedMarker.projekt.angebotsnummer}</span>
                    </div>
                  )}
                  {selectedMarker.projekt.auftragsbestaetigungsnummer && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <FileSignature className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs">AB: {selectedMarker.projekt.auftragsbestaetigungsnummer}</span>
                    </div>
                  )}
                  {selectedMarker.projekt.rechnungsnummer && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <FileText className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-xs">Rechnung: {selectedMarker.projekt.rechnungsnummer}</span>
                    </div>
                  )}
                </div>

                {/* Menge und Preis */}
                {(selectedMarker.projekt.angefragteMenge || selectedMarker.projekt.preisProTonne) && (
                  <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
                    {selectedMarker.projekt.angefragteMenge && (
                      <div className="flex items-center gap-1">
                        <Package className="w-3.5 h-3.5 text-amber-500" />
                        <span className="font-medium text-amber-700">
                          {selectedMarker.projekt.angefragteMenge}t
                        </span>
                      </div>
                    )}
                    {selectedMarker.projekt.preisProTonne && (
                      <div className="flex items-center gap-1">
                        <Euro className="w-3.5 h-3.5 text-green-500" />
                        <span className="font-medium text-green-700">
                          {selectedMarker.projekt.preisProTonne.toFixed(2)} EUR/t
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Kundennummer */}
                {selectedMarker.projekt.kundennummer && (
                  <div className="text-xs text-gray-500 pt-1">
                    Kunden-Nr.: {selectedMarker.projekt.kundennummer}
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  onProjektClick(selectedMarker.projekt);
                  setSelectedMarker(null);
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Building2 className="w-4 h-4" />
                Projekt anzeigen
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>
    </div>
  );
};

export default ProjektKartenansicht;
