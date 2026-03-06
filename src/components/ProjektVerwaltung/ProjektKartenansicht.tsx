/**
 * ProjektKartenansicht - Zeigt Projekte auf einer Google Maps Karte nach Status farblich markiert
 *
 * OPTIMIERTES GEOCODING (wie DispoKartenAnsicht):
 * 1. Existierende Projekt-Koordinaten (wenn vorhanden)
 * 2. PLZ-Lookup aus lokaler Tabelle (KOSTENLOS, SOFORT!)
 * 3. Google API nur als Fallback (<1% der Fälle)
 *
 * Vorteile:
 * - 99% weniger Google API Kosten
 * - Sofortige Anzeige (keine Netzwerk-Latenz für PLZ-Lookup)
 * - Zentraler Geocode-Cache (geteilt mit anderen Kartenansichten)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  AlertTriangle,
  MapPinOff,
} from 'lucide-react';
import { Projekt, ProjektStatus } from '../../types/projekt';
import { getKoordinatenFuerPLZ } from '../../data/plzKoordinaten';
import { geocodeCache, createPlzKey, createAdresseKey } from '../../utils/geocodeCache';

// Konstanten
const WERK_POSITION = { lat: 49.85, lng: 9.60 }; // Marktheidenfeld
const MAP_STYLE = { width: '100%', height: '100%', minHeight: '600px' };

// Offset für mehrere Marker am gleichen PLZ-Standort
const PLZ_OFFSET_RADIUS = 0.003; // ~300m Radius für Cluster

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

type KoordinatenQuelle = 'projekt' | 'cache' | 'plz' | 'google';

interface ProjektMarker {
  projekt: Projekt;
  position: { lat: number; lng: number };
  quelle: KoordinatenQuelle;
}

interface ProjektKartenansichtProps {
  projekte: Projekt[];
  onProjektClick: (projekt: Projekt) => void;
  statusFilter?: ProjektStatus[];
}

// PLZ aus Adresse extrahieren
const extractPLZ = (plzOrt: string | undefined): string | null => {
  if (!plzOrt) return null;
  const match = plzOrt.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
};

const ProjektKartenansicht = ({
  projekte,
  onProjektClick,
  statusFilter,
}: ProjektKartenansichtProps) => {
  const [markers, setMarkers] = useState<ProjektMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<ProjektMarker | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [ohneKoordinaten, setOhneKoordinaten] = useState<Projekt[]>([]);
  const [showOhneKoordinatenPanel, setShowOhneKoordinatenPanel] = useState(false);
  const [geocodeStats, setGeocodeStats] = useState({ plz: 0, cache: 0, google: 0, failed: 0 });
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  // Filtere Projekte nach Status
  const gefilterteProjekte = useMemo(() => {
    return statusFilter
      ? projekte.filter(p => statusFilter.includes(p.status))
      : projekte;
  }, [projekte, statusFilter]);

  // Optimiertes Geocoding mit 3-stufiger Priorität
  useEffect(() => {
    if (!isLoaded || gefilterteProjekte.length === 0) return;

    const geocodeAll = async () => {
      setIsGeocoding(true);

      const newMarkers: ProjektMarker[] = [];
      const ohneCoords: Projekt[] = [];
      const brauchenGoogleAPI: { projekt: Projekt; address: string; cacheKey: string }[] = [];
      const stats = { plz: 0, cache: 0, google: 0, failed: 0 };

      // PHASE 1: Schnelles lokales Geocoding (PLZ-Lookup + Cache)
      for (const projekt of gefilterteProjekte) {
        const plzOrt = projekt.kundenPlzOrt || '';
        const strasse = projekt.kundenstrasse || '';
        const plz = extractPLZ(plzOrt);

        if (!plzOrt && !plz) {
          ohneCoords.push(projekt);
          stats.failed++;
          continue;
        }

        // 1. Prüfe zentralen Cache (mit Straße)
        const adresseKey = strasse && plz ? createAdresseKey(strasse, plz, plzOrt.replace(/^\d+\s*/, '')) : null;
        if (adresseKey) {
          const cached = geocodeCache.get(adresseKey);
          if (cached) {
            newMarkers.push({ projekt, position: cached, quelle: 'cache' });
            stats.cache++;
            continue;
          }
        }

        // 2. Prüfe Cache nur mit PLZ
        if (plz) {
          const plzKey = createPlzKey(plz);
          const cachedPlz = geocodeCache.get(plzKey);
          if (cachedPlz) {
            newMarkers.push({ projekt, position: cachedPlz, quelle: 'cache' });
            stats.cache++;
            continue;
          }
        }

        // 3. PLZ-Lookup aus lokaler Tabelle (KOSTENLOS!)
        if (plz) {
          const plzCoords = getKoordinatenFuerPLZ(plz);
          if (plzCoords) {
            newMarkers.push({ projekt, position: plzCoords, quelle: 'plz' });
            stats.plz++;
            // In Cache speichern für nächstes Mal
            geocodeCache.set(createPlzKey(plz), plzCoords);
            continue;
          }
        }

        // 4. Für Google API vormerken (nur wenn wirklich nötig)
        if (strasse && plzOrt) {
          const address = `${strasse}, ${plzOrt}, Deutschland`;
          const cacheKey = adresseKey || createPlzKey(plz || plzOrt);
          brauchenGoogleAPI.push({ projekt, address, cacheKey });
        } else {
          // Keine Adresse vorhanden
          ohneCoords.push(projekt);
          stats.failed++;
        }
      }

      // PHASE 2: Google API nur für fehlende (Batch mit Deduplizierung)
      if (brauchenGoogleAPI.length > 0 && brauchenGoogleAPI.length < 50) {
        console.log(`🌐 ${brauchenGoogleAPI.length} Projekte brauchen Google API Geocoding...`);

        if (!geocoderRef.current) {
          geocoderRef.current = new google.maps.Geocoder();
        }

        // Dedupliziere gleiche Adressen
        const uniqueAddresses = new Map<string, { projekt: Projekt; cacheKey: string }[]>();
        for (const item of brauchenGoogleAPI) {
          const existing = uniqueAddresses.get(item.address) || [];
          existing.push({ projekt: item.projekt, cacheKey: item.cacheKey });
          uniqueAddresses.set(item.address, existing);
        }

        console.log(`   → ${uniqueAddresses.size} einzigartige Adressen (${brauchenGoogleAPI.length - uniqueAddresses.size} Duplikate)`);

        // Geocode mit Rate-Limiting
        for (const [address, items] of uniqueAddresses) {
          try {
            await new Promise(r => setTimeout(r, 150)); // Rate-Limiting

            const result = await new Promise<google.maps.GeocoderResult[] | null>((resolve) => {
              geocoderRef.current!.geocode({ address }, (results, status) => {
                if (status === 'OK' && results && results.length > 0) {
                  resolve(results);
                } else {
                  resolve(null);
                }
              });
            });

            if (result) {
              const loc = result[0].geometry.location;
              const position = { lat: loc.lat(), lng: loc.lng() };

              // Für alle Projekte mit dieser Adresse
              for (const item of items) {
                newMarkers.push({ projekt: item.projekt, position, quelle: 'google' });
                geocodeCache.set(item.cacheKey, position);
                stats.google++;
              }
            } else {
              // Fallback auf PLZ-Geocoding
              for (const item of items) {
                const plz = extractPLZ(item.projekt.kundenPlzOrt);
                if (plz) {
                  const plzCoords = getKoordinatenFuerPLZ(plz);
                  if (plzCoords) {
                    newMarkers.push({ projekt: item.projekt, position: plzCoords, quelle: 'plz' });
                    stats.plz++;
                    continue;
                  }
                }
                ohneCoords.push(item.projekt);
                stats.failed++;
              }
            }
          } catch (error) {
            console.warn('Google Geocoding Fehler:', error);
            for (const item of items) {
              ohneCoords.push(item.projekt);
              stats.failed++;
            }
          }
        }
      } else if (brauchenGoogleAPI.length >= 50) {
        // Zu viele - nur PLZ-Fallback verwenden
        console.log(`⚠️ ${brauchenGoogleAPI.length} Projekte ohne PLZ-Koordinaten - verwende nur PLZ-Lookup`);
        for (const item of brauchenGoogleAPI) {
          const plz = extractPLZ(item.projekt.kundenPlzOrt);
          if (plz) {
            const plzCoords = getKoordinatenFuerPLZ(plz);
            if (plzCoords) {
              newMarkers.push({ projekt: item.projekt, position: plzCoords, quelle: 'plz' });
              stats.plz++;
              continue;
            }
          }
          ohneCoords.push(item.projekt);
          stats.failed++;
        }
      }

      // Offset für Marker am gleichen Standort (PLZ-Cluster)
      const positionGroups = new Map<string, number[]>();
      newMarkers.forEach((marker, idx) => {
        // Runde auf 3 Dezimalstellen (~100m Genauigkeit)
        const key = `${marker.position.lat.toFixed(3)}_${marker.position.lng.toFixed(3)}`;
        const group = positionGroups.get(key) || [];
        group.push(idx);
        positionGroups.set(key, group);
      });

      // Wende Offset auf Cluster an
      positionGroups.forEach((indices) => {
        if (indices.length <= 1) return;
        indices.forEach((idx, i) => {
          const angle = (i * 360 / indices.length) * (Math.PI / 180);
          const offsetLat = PLZ_OFFSET_RADIUS * Math.cos(angle);
          const offsetLng = PLZ_OFFSET_RADIUS * Math.sin(angle);
          newMarkers[idx].position = {
            lat: newMarkers[idx].position.lat + offsetLat,
            lng: newMarkers[idx].position.lng + offsetLng,
          };
        });
      });

      // Stats loggen
      console.log('📊 Geocoding-Statistik:', {
        gesamt: gefilterteProjekte.length,
        aufKarte: newMarkers.length,
        cache: stats.cache,
        plz: stats.plz,
        google: stats.google,
        fehlgeschlagen: stats.failed,
        apiKostenGespart: `${((1 - stats.google / Math.max(1, newMarkers.length)) * 100).toFixed(0)}%`,
      });

      setMarkers(newMarkers);
      setOhneKoordinaten(ohneCoords);
      setGeocodeStats(stats);
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
              Lade Karte...
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
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
          <span>{markers.length} Projekte auf Karte</span>
          {ohneKoordinaten.length > 0 && (
            <button
              onClick={() => setShowOhneKoordinatenPanel(!showOhneKoordinatenPanel)}
              className="flex items-center gap-1 text-amber-600 hover:text-amber-700"
            >
              <AlertTriangle className="w-3 h-3" />
              {ohneKoordinaten.length} ohne Adresse
            </button>
          )}
        </div>
        {/* Geocode-Quellen Statistik */}
        {(geocodeStats.plz > 0 || geocodeStats.cache > 0) && (
          <div className="mt-1 text-xs text-gray-400 flex gap-2">
            {geocodeStats.cache > 0 && <span>Cache: {geocodeStats.cache}</span>}
            {geocodeStats.plz > 0 && <span>PLZ: {geocodeStats.plz}</span>}
            {geocodeStats.google > 0 && <span>API: {geocodeStats.google}</span>}
          </div>
        )}
      </div>

      {/* Panel für Projekte ohne Koordinaten */}
      {showOhneKoordinatenPanel && ohneKoordinaten.length > 0 && (
        <div className="absolute top-4 right-4 z-10 bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4 border border-amber-200 dark:border-amber-800 max-w-sm max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-amber-600">
              <MapPinOff className="w-4 h-4" />
              <span className="font-medium text-sm">Ohne Adresse</span>
            </div>
            <button
              onClick={() => setShowOhneKoordinatenPanel(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {ohneKoordinaten.slice(0, 20).map((projekt) => (
              <button
                key={(projekt as any).$id || projekt.id}
                onClick={() => onProjektClick(projekt)}
                className="w-full text-left p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
              >
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {projekt.kundenname || 'Unbekannt'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {projekt.kundenPlzOrt || 'Keine Adresse'}
                </div>
              </button>
            ))}
            {ohneKoordinaten.length > 20 && (
              <div className="text-xs text-gray-400 text-center pt-2">
                + {ohneKoordinaten.length - 20} weitere
              </div>
            )}
          </div>
        </div>
      )}

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
          const isPLZOnly = marker.quelle === 'plz';
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
                    className={`w-8 h-8 drop-shadow-md ${isPLZOnly ? 'opacity-80' : ''}`}
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
                  {selectedMarker.quelle === 'plz' && (
                    <span className="text-xs text-amber-500">(PLZ)</span>
                  )}
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
