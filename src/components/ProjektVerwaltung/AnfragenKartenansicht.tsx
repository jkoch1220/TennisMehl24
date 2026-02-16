/**
 * AnfragenKartenansicht - Zeigt Anfragen auf einer Google Maps Karte
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
  Mail,
  Phone,
  ChevronRight,
} from 'lucide-react';
import { VerarbeiteteAnfrage } from '../../types/anfragen';

// Konstanten
const WERK_POSITION = { lat: 49.85, lng: 9.60 }; // Marktheidenfeld
const MAP_STYLE = { width: '100%', height: '100%', minHeight: '600px' };

// Geocoding Cache
const GEOCODE_CACHE_KEY = 'anfragen_geocode_cache_v1';

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

interface AnfrageMarker {
  anfrage: VerarbeiteteAnfrage;
  position: { lat: number; lng: number };
  istBeantwortet: boolean;
}

interface AnfragenKartenansichtProps {
  anfragen: VerarbeiteteAnfrage[];
  istBeantwortet: (email: string, datum: string) => boolean;
  onAnfrageClick: (anfrage: VerarbeiteteAnfrage) => void;
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
  plz: string,
  ort: string,
  geocoder: google.maps.Geocoder
): Promise<{ lat: number; lng: number } | null> => {
  return new Promise((resolve) => {
    const query = `${plz} ${ort}, Deutschland`;
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        resolve(null);
      }
    });
  });
};

const AnfragenKartenansicht = ({
  anfragen,
  istBeantwortet,
  onAnfrageClick,
}: AnfragenKartenansichtProps) => {
  const [markers, setMarkers] = useState<AnfrageMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<AnfrageMarker | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const geocodeCacheRef = useRef<Map<string, { lat: number; lng: number }>>(loadCache());

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  // Geocode alle Anfragen
  useEffect(() => {
    if (!isLoaded || anfragen.length === 0) return;

    const geocodeAll = async () => {
      setIsGeocoding(true);
      setGeocodedCount(0);

      if (!geocoderRef.current) {
        geocoderRef.current = new google.maps.Geocoder();
      }

      const newMarkers: AnfrageMarker[] = [];
      let count = 0;

      for (const anfrage of anfragen) {
        const plz = anfrage.analysiert.plz || '';
        const ort = anfrage.analysiert.ort || '';
        const cacheKey = `${plz}_${ort}`.toLowerCase();

        let position = geocodeCacheRef.current.get(cacheKey);

        if (!position && plz) {
          // Geocode mit Rate-Limiting (100ms zwischen Anfragen)
          await new Promise(r => setTimeout(r, 100));
          position = await geocodeAddress(plz, ort, geocoderRef.current!) || undefined;

          if (position) {
            geocodeCacheRef.current.set(cacheKey, position);
          }
        }

        if (position) {
          newMarkers.push({
            anfrage,
            position,
            istBeantwortet: istBeantwortet(
              anfrage.analysiert.email || anfrage.emailAbsender,
              anfrage.emailDatum
            ),
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
  }, [isLoaded, anfragen, istBeantwortet]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Statistik
  const offeneAnfragen = markers.filter(m => !m.istBeantwortet).length;
  const beantwortetAnfragen = markers.filter(m => m.istBeantwortet).length;

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
              Geocoding... {geocodedCount}/{anfragen.length}
            </p>
          </div>
        </div>
      )}

      {/* Statistik-Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-white dark:bg-slate-800 rounded-xl shadow-lg p-3 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="font-medium">{offeneAnfragen} offen</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-500">{beantwortetAnfragen} beantwortet</span>
          </div>
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

        {/* Anfrage-Marker */}
        {markers.map((marker) => (
          <OverlayViewF
            key={marker.anfrage.id}
            position={marker.position}
            mapPaneName={OVERLAY_MOUSE_TARGET}
          >
            <div
              className="transform -translate-x-1/2 -translate-y-full cursor-pointer transition-all hover:scale-110"
              onClick={() => setSelectedMarker(marker)}
            >
              <div className={`relative ${marker.istBeantwortet ? 'opacity-50' : ''}`}>
                <MapPin
                  className={`w-8 h-8 drop-shadow-md ${
                    marker.istBeantwortet
                      ? 'text-green-500'
                      : 'text-orange-500'
                  }`}
                  fill={marker.istBeantwortet ? '#22c55e' : '#f97316'}
                />
                {/* Tonnen-Badge */}
                {marker.anfrage.analysiert.menge && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-purple-600 text-white text-xs font-bold rounded-full flex items-center justify-center shadow">
                    {marker.anfrage.analysiert.menge}
                  </div>
                )}
              </div>
            </div>
          </OverlayViewF>
        ))}

        {/* Info Window */}
        {selectedMarker && (
          <InfoWindowF
            position={selectedMarker.position}
            onCloseClick={() => setSelectedMarker(null)}
          >
            <div className="p-2 min-w-[250px] max-w-[320px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-900 text-lg">
                  {selectedMarker.anfrage.analysiert.kundenname}
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
                  <span>
                    {selectedMarker.anfrage.analysiert.plz} {selectedMarker.anfrage.analysiert.ort}
                  </span>
                </div>

                {selectedMarker.anfrage.analysiert.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4 text-blue-500" />
                    <span className="truncate">{selectedMarker.anfrage.analysiert.email}</span>
                  </div>
                )}

                {selectedMarker.anfrage.analysiert.telefon && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 text-green-500" />
                    <span>{selectedMarker.anfrage.analysiert.telefon}</span>
                  </div>
                )}

                {selectedMarker.anfrage.analysiert.menge && (
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-500" />
                    <span className="font-medium text-amber-700">
                      {selectedMarker.anfrage.analysiert.menge}t Tennismehl
                    </span>
                  </div>
                )}

                {/* Status Badge */}
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                  selectedMarker.istBeantwortet
                    ? 'bg-green-100 text-green-700'
                    : 'bg-orange-100 text-orange-700'
                }`}>
                  {selectedMarker.istBeantwortet ? 'Beantwortet' : 'Offen'}
                </div>
              </div>

              <button
                onClick={() => {
                  onAnfrageClick(selectedMarker.anfrage);
                  setSelectedMarker(null);
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Building2 className="w-4 h-4" />
                Anfrage bearbeiten
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>
    </div>
  );
};

export default AnfragenKartenansicht;
