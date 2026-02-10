import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  OverlayViewF,
  InfoWindowF,
  PolylineF,
  OVERLAY_MOUSE_TARGET,
} from '@react-google-maps/api';
import {
  MapPin,
  Package,
  Calendar,
  Filter,
  Eye,
  EyeOff,
  Truck,
  Route,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Navigation,
  Layers,
  Info,
} from 'lucide-react';
import { Projekt, DispoStatus, Belieferungsart } from '../../types/projekt';
import { SaisonKunde } from '../../types/saisonplanung';
import { Tour } from '../../types/tour';
import { tourenService } from '../../services/tourenService';
import { PLZ_BEREICHE } from '../../data/plz-bereiche';

// === CONSTANTS ===

const WERK_POSITION = { lat: 49.85, lng: 9.60 };
const WERK_LABEL = 'Ziegelwerk Marktheidenfeld';

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '100%',
};

const DEFAULT_MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: true,
  streetViewControl: false,
  fullscreenControl: true,
  styles: [
    {
      featureType: 'poi',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'transit',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
  ],
};

// Status → Farbe
const STATUS_FARBEN: Record<DispoStatus, { bg: string; border: string; text: string; hex: string }> = {
  offen: { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-white', hex: '#3b82f6' },
  geplant: { bg: 'bg-purple-500', border: 'border-purple-600', text: 'text-white', hex: '#a855f7' },
  beladen: { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-white', hex: '#f97316' },
  unterwegs: { bg: 'bg-yellow-500', border: 'border-yellow-600', text: 'text-white', hex: '#eab308' },
  geliefert: { bg: 'bg-green-500', border: 'border-green-600', text: 'text-white', hex: '#22c55e' },
};

const STATUS_LABELS: Record<DispoStatus, string> = {
  offen: 'Offen',
  geplant: 'Geplant',
  beladen: 'Beladen',
  unterwegs: 'Unterwegs',
  geliefert: 'Geliefert',
};

// Tour-Farben (bis zu 10 Touren)
const TOUR_FARBEN = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f97316', // orange
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#6366f1', // indigo
];

// === TYPES ===

interface ProjektMitKoordinaten {
  projekt: Projekt;
  kunde?: SaisonKunde;
  position: google.maps.LatLngLiteral;
  tonnen: number;
  kw?: number;
}

interface Props {
  projekte: Projekt[];
  kundenMap: Map<string, SaisonKunde>;
  onProjektClick?: (projekt: Projekt) => void;
}

// === HELPER FUNCTIONS ===

/**
 * Extrahiert PLZ aus einem "PLZ Ort" String
 */
const extractPLZ = (plzOrt: string): string | null => {
  const match = plzOrt?.match(/(\d{5})/);
  return match ? match[1] : null;
};

/**
 * Ermittelt Koordinaten für ein Projekt:
 * 1. SaisonKunde lieferadresse.koordinaten
 * 2. SaisonKunde rechnungsadresse.koordinaten
 * 3. PLZ-Bereiche Fallback (2-stellige PLZ)
 */
const getKoordinaten = (
  projekt: Projekt,
  kunde?: SaisonKunde
): google.maps.LatLngLiteral | null => {
  // 1. Kunde Lieferadresse Koordinaten
  if (kunde?.lieferadresse?.koordinaten) {
    const [lon, lat] = kunde.lieferadresse.koordinaten;
    if (lat && lon && lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16) {
      return { lat, lng: lon };
    }
  }

  // 2. Kunde Rechnungsadresse Koordinaten
  if (kunde?.rechnungsadresse?.koordinaten) {
    const [lon, lat] = kunde.rechnungsadresse.koordinaten;
    if (lat && lon && lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16) {
      return { lat, lng: lon };
    }
  }

  // 3. Alte Adresse Koordinaten
  if (kunde?.adresse?.koordinaten) {
    const [lon, lat] = kunde.adresse.koordinaten;
    if (lat && lon && lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16) {
      return { lat, lng: lon };
    }
  }

  // 4. PLZ-Bereiche Fallback
  const plz = projekt.lieferadresse?.plz
    || extractPLZ(projekt.kundenPlzOrt)
    || kunde?.lieferadresse?.plz
    || kunde?.rechnungsadresse?.plz;

  if (plz) {
    const prefix = plz.substring(0, 2);
    const bereich = PLZ_BEREICHE[prefix];
    if (bereich) {
      const [lon, lat] = bereich.center;
      // Leichter Offset basierend auf vollständiger PLZ für Streuung
      const plzNum = parseInt(plz);
      const offsetLat = ((plzNum % 100) - 50) * 0.002;
      const offsetLng = ((plzNum % 37) - 18) * 0.003;
      return { lat: lat + offsetLat, lng: lon + offsetLng };
    }
  }

  return null;
};

/**
 * Berechnet die Kalenderwoche für ein Datum
 */
const getKW = (dateStr: string): number => {
  const date = new Date(dateStr);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

// === COMPONENT ===

const DispoKartenAnsicht = ({ projekte, kundenMap, onProjektClick }: Props) => {
  // Google Maps API laden
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    language: 'de',
    region: 'DE',
  });

  // State
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedProjekt, setSelectedProjekt] = useState<ProjektMitKoordinaten | null>(null);
  const [hoveredProjekt, setHoveredProjekt] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Filter State
  const [filterKW, setFilterKW] = useState<number | 'alle'>('alle');
  const [filterStatus, setFilterStatus] = useState<DispoStatus | 'alle'>('alle');
  const [filterBelart, setFilterBelart] = useState<Belieferungsart | 'alle'>('alle');
  const [showFilters, setShowFilters] = useState(true);

  // Tour State
  const [touren, setTouren] = useState<Tour[]>([]);
  const [showTouren, setShowTouren] = useState(true);
  const [tourenDatum, setTourenDatum] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [loadingTouren, setLoadingTouren] = useState(false);
  const [selectedTourIndex, setSelectedTourIndex] = useState<number | null>(null);

  // Ansicht
  const [showWerk] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  // Touren laden
  const loadTouren = useCallback(async () => {
    setLoadingTouren(true);
    try {
      const geladeneTouren = await tourenService.loadTouren({
        datum: tourenDatum,
      });
      setTouren(geladeneTouren);
    } catch (error) {
      console.error('Fehler beim Laden der Touren:', error);
      setTouren([]);
    } finally {
      setLoadingTouren(false);
    }
  }, [tourenDatum]);

  useEffect(() => {
    loadTouren();
  }, [loadTouren]);

  // Projekte mit Koordinaten aufbereiten
  const projekteMitKoordinaten = useMemo(() => {
    const result: ProjektMitKoordinaten[] = [];
    for (const projekt of projekte) {
      const kunde = projekt.kundeId ? kundenMap.get(projekt.kundeId) : undefined;
      const position = getKoordinaten(projekt, kunde);
      if (!position) continue;

      const tonnen = projekt.liefergewicht || projekt.angefragteMenge || 0;
      const kw = projekt.lieferKW || (projekt.geplantesDatum ? getKW(projekt.geplantesDatum) : undefined);

      result.push({ projekt, kunde, position, tonnen, kw });
    }
    return result;
  }, [projekte, kundenMap]);

  // Gefilterte Projekte
  const gefilterteProjekte = useMemo(() => {
    return projekteMitKoordinaten.filter((p) => {
      if (filterKW !== 'alle' && p.kw !== filterKW) return false;
      if (filterStatus !== 'alle' && (p.projekt.dispoStatus || 'offen') !== filterStatus) return false;
      if (filterBelart !== 'alle' && p.projekt.belieferungsart !== filterBelart) return false;
      return true;
    });
  }, [projekteMitKoordinaten, filterKW, filterStatus, filterBelart]);

  // Verfügbare KWs
  const verfuegbareKWs = useMemo(() => {
    const kws = new Set<number>();
    projekteMitKoordinaten.forEach((p) => {
      if (p.kw) kws.add(p.kw);
    });
    return [...kws].sort((a, b) => a - b);
  }, [projekteMitKoordinaten]);

  // Statistiken
  const stats = useMemo(() => {
    const gesamtTonnen = gefilterteProjekte.reduce((sum, p) => sum + p.tonnen, 0);
    const byStatus: Record<string, number> = {};
    gefilterteProjekte.forEach((p) => {
      const s = p.projekt.dispoStatus || 'offen';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    return { count: gefilterteProjekte.length, gesamtTonnen, byStatus };
  }, [gefilterteProjekte]);

  // Tour-Polylines berechnen
  const tourPolylines = useMemo(() => {
    if (!showTouren || touren.length === 0) return [];

    return touren.map((tour, index) => {
      const path: google.maps.LatLngLiteral[] = [WERK_POSITION]; // Start am Werk

      tour.stops.forEach((stop) => {
        if (stop.adresse.koordinaten) {
          const [lon, lat] = stop.adresse.koordinaten;
          path.push({ lat, lng: lon });
        } else {
          // PLZ-Fallback
          const plzPrefix = stop.adresse.plz?.substring(0, 2);
          const bereich = plzPrefix ? PLZ_BEREICHE[plzPrefix] : null;
          if (bereich) {
            path.push({ lat: bereich.center[1], lng: bereich.center[0] });
          }
        }
      });

      path.push(WERK_POSITION); // Zurück zum Werk

      return {
        tour,
        path,
        color: TOUR_FARBEN[index % TOUR_FARBEN.length],
        index,
      };
    });
  }, [touren, showTouren]);

  // Map Bounds berechnen und setzen
  const fitBounds = useCallback(() => {
    if (!map || gefilterteProjekte.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(WERK_POSITION);
    gefilterteProjekte.forEach((p) => bounds.extend(p.position));
    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 380 });
  }, [map, gefilterteProjekte]);

  useEffect(() => {
    if (map && gefilterteProjekte.length > 0) {
      // Leichtes Delay damit Map gerendert ist
      const timeout = setTimeout(fitBounds, 300);
      return () => clearTimeout(timeout);
    }
  }, [map, fitBounds]);

  // Map Callbacks
  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  const onMapUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Marker-Größe basierend auf Tonnen
  const getMarkerSize = (tonnen: number): number => {
    if (tonnen <= 0) return 28;
    if (tonnen <= 10) return 28;
    if (tonnen <= 20) return 34;
    if (tonnen <= 50) return 40;
    return 46;
  };

  // === RENDER ===

  if (loadError) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-8">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Google Maps konnte nicht geladen werden
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Bitte stelle sicher, dass der Google Maps API Key korrekt in der .env Datei hinterlegt ist.
          </p>
          <code className="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 rounded text-sm text-gray-800 dark:text-gray-300">
            VITE_GOOGLE_MAPS_API_KEY=dein-api-key
          </code>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-8">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
          <span className="text-gray-600 dark:text-gray-400">Karte wird geladen...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-red-600" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Kartenansicht
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {stats.count} Aufträge | {stats.gesamtTonnen.toFixed(1)}t Gesamtmenge
                {projekteMitKoordinaten.length < projekte.length && (
                  <span className="text-yellow-600 ml-2">
                    ({projekte.length - projekteMitKoordinaten.length} ohne Koordinaten)
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showFilters
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filter
            </button>

            {/* Labels Toggle */}
            <button
              onClick={() => setShowLabels(!showLabels)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showLabels
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
              }`}
              title="Labels ein-/ausblenden"
            >
              {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            {/* Reset View */}
            <button
              onClick={fitBounds}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              title="Ansicht zurücksetzen"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-4 flex-wrap">
            {/* KW-Filter */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <select
                value={filterKW}
                onChange={(e) => setFilterKW(e.target.value === 'alle' ? 'alle' : parseInt(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
              >
                <option value="alle">Alle KW</option>
                {verfuegbareKWs.map((kw) => (
                  <option key={kw} value={kw}>
                    KW {kw}
                  </option>
                ))}
              </select>
            </div>

            {/* Status-Filter */}
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as DispoStatus | 'alle')}
                className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
              >
                <option value="alle">Alle Status</option>
                {(Object.keys(STATUS_LABELS) as DispoStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            {/* Belieferungsart-Filter */}
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-gray-400" />
              <select
                value={filterBelart}
                onChange={(e) => setFilterBelart(e.target.value as Belieferungsart | 'alle')}
                className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
              >
                <option value="alle">Alle Belieferungsarten</option>
                <option value="nur_motorwagen">Nur Motorwagen (18t)</option>
                <option value="mit_haenger">Mit Hänger (28t)</option>
                <option value="abholung_ab_werk">Abholung ab Werk</option>
                <option value="palette_mit_ladekran">Palette/Ladekran</option>
                <option value="bigbag">BigBag</option>
              </select>
            </div>

            {/* Touren-Datum */}
            <div className="flex items-center gap-2 ml-auto">
              <Route className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={tourenDatum}
                onChange={(e) => setTourenDatum(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
              />
              <button
                onClick={() => setShowTouren(!showTouren)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  showTouren
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Layers className="w-4 h-4" />
                Touren {touren.length > 0 && `(${touren.length})`}
              </button>
            </div>

            {/* Filter Reset */}
            {(filterKW !== 'alle' || filterStatus !== 'alle' || filterBelart !== 'alle') && (
              <button
                onClick={() => {
                  setFilterKW('alle');
                  setFilterStatus('alle');
                  setFilterBelart('alle');
                }}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>
      )}

      {/* Map Container */}
      <div className="relative" style={{ height: '700px' }} ref={mapRef}>
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER_STYLE}
          center={WERK_POSITION}
          zoom={8}
          options={DEFAULT_MAP_OPTIONS}
          onLoad={onMapLoad}
          onUnmount={onMapUnmount}
          onClick={() => setSelectedProjekt(null)}
        >
          {/* Werk-Marker */}
          {showWerk && (
            <OverlayViewF
              position={WERK_POSITION}
              mapPaneName={OVERLAY_MOUSE_TARGET}
              getPixelPositionOffset={() => ({ x: -20, y: -20 })}
            >
              <div className="relative group cursor-pointer">
                <div className="w-10 h-10 bg-red-600 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {WERK_LABEL}
                </div>
              </div>
            </OverlayViewF>
          )}

          {/* Projekt-Marker */}
          {gefilterteProjekte.map((item) => {
            const projektId = (item.projekt as any).$id || item.projekt.id;
            const status = (item.projekt.dispoStatus || 'offen') as DispoStatus;
            const farbe = STATUS_FARBEN[status];
            const size = getMarkerSize(item.tonnen);
            const isSelected = selectedProjekt?.projekt.id === item.projekt.id;
            const isHovered = hoveredProjekt === projektId;

            return (
              <OverlayViewF
                key={projektId}
                position={item.position}
                mapPaneName={OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={() => ({ x: -size / 2, y: -size / 2 })}
              >
                <div
                  className="relative cursor-pointer"
                  onMouseEnter={() => setHoveredProjekt(projektId)}
                  onMouseLeave={() => setHoveredProjekt(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProjekt(item);
                  }}
                >
                  {/* Marker Circle */}
                  <div
                    className={`rounded-full border-2 border-white shadow-lg flex items-center justify-center transition-transform ${
                      isSelected || isHovered ? 'scale-125 z-50' : ''
                    }`}
                    style={{
                      width: size,
                      height: size,
                      backgroundColor: farbe.hex,
                      boxShadow: isSelected
                        ? `0 0 0 3px ${farbe.hex}40, 0 4px 12px rgba(0,0,0,0.3)`
                        : '0 2px 6px rgba(0,0,0,0.3)',
                    }}
                  >
                    <span className="text-white font-bold text-[10px] leading-none select-none">
                      {item.tonnen > 0 ? `${Math.round(item.tonnen)}t` : '?'}
                    </span>
                  </div>

                  {/* Label unter Marker */}
                  {showLabels && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap pointer-events-none">
                      <div className="bg-white/95 dark:bg-slate-900/95 text-[10px] px-1.5 py-0.5 rounded shadow-sm border border-gray-200 dark:border-slate-700 text-center">
                        <div className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[120px]">
                          {item.projekt.kundenname}
                        </div>
                        {item.kw && (
                          <div className="text-gray-500 dark:text-gray-400">
                            KW {item.kw}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Hover-Tooltip (erweitertes Label) */}
                  {(isHovered && !isSelected) && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap pointer-events-none z-50">
                      <div className="bg-white dark:bg-slate-800 text-xs px-3 py-2 rounded-lg shadow-xl border border-gray-200 dark:border-slate-600">
                        <div className="font-bold text-gray-900 dark:text-white">
                          {item.projekt.kundenname}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                          {item.projekt.kundenPlzOrt}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="font-medium" style={{ color: farbe.hex }}>
                            {STATUS_LABELS[status]}
                          </span>
                          {item.tonnen > 0 && (
                            <span className="text-gray-600 dark:text-gray-300">{item.tonnen}t</span>
                          )}
                          {item.kw && (
                            <span className="text-gray-600 dark:text-gray-300">KW {item.kw}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </OverlayViewF>
            );
          })}

          {/* Tour-Polylines */}
          {showTouren && tourPolylines.map(({ tour, path, color, index }) => (
            <PolylineF
              key={tour.id || index}
              path={path}
              options={{
                strokeColor: selectedTourIndex === null || selectedTourIndex === index ? color : `${color}40`,
                strokeOpacity: selectedTourIndex === null || selectedTourIndex === index ? 0.85 : 0.3,
                strokeWeight: selectedTourIndex === index ? 5 : 3,
                geodesic: true,
                icons: [
                  {
                    icon: {
                      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                      scale: 3,
                      strokeColor: color,
                      fillColor: color,
                      fillOpacity: 1,
                    },
                    offset: '50%',
                  },
                ],
                clickable: true,
                zIndex: selectedTourIndex === index ? 10 : 1,
              }}
              onClick={() => setSelectedTourIndex(selectedTourIndex === index ? null : index)}
            />
          ))}

          {/* Info Window für ausgewähltes Projekt */}
          {selectedProjekt && (
            <InfoWindowF
              position={selectedProjekt.position}
              onCloseClick={() => setSelectedProjekt(null)}
              options={{
                pixelOffset: new google.maps.Size(0, -(getMarkerSize(selectedProjekt.tonnen) / 2 + 5)),
                maxWidth: 360,
              }}
            >
              <div className="p-1 min-w-[280px]">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">
                      {selectedProjekt.projekt.kundenname}
                    </h3>
                    {selectedProjekt.projekt.kundennummer && (
                      <span className="text-xs text-gray-500">
                        #{selectedProjekt.projekt.kundennummer}
                      </span>
                    )}
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{
                      backgroundColor: STATUS_FARBEN[(selectedProjekt.projekt.dispoStatus || 'offen') as DispoStatus].hex,
                    }}
                  >
                    {STATUS_LABELS[(selectedProjekt.projekt.dispoStatus || 'offen') as DispoStatus]}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 text-sm">
                  {/* Adresse */}
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      {selectedProjekt.projekt.lieferadresse ? (
                        <>
                          <div>{selectedProjekt.projekt.lieferadresse.strasse}</div>
                          <div>{selectedProjekt.projekt.lieferadresse.plz} {selectedProjekt.projekt.lieferadresse.ort}</div>
                        </>
                      ) : (
                        <div>{selectedProjekt.projekt.kundenPlzOrt}</div>
                      )}
                    </div>
                  </div>

                  {/* Menge */}
                  {selectedProjekt.tonnen > 0 && (
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="font-medium">{selectedProjekt.tonnen} Tonnen</span>
                      {selectedProjekt.projekt.belieferungsart && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                          {selectedProjekt.projekt.belieferungsart === 'nur_motorwagen' && 'Motorwagen'}
                          {selectedProjekt.projekt.belieferungsart === 'mit_haenger' && 'Hänger'}
                          {selectedProjekt.projekt.belieferungsart === 'abholung_ab_werk' && 'Abholung'}
                          {selectedProjekt.projekt.belieferungsart === 'palette_mit_ladekran' && 'Kran'}
                          {selectedProjekt.projekt.belieferungsart === 'bigbag' && 'BigBag'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* KW / Datum */}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex items-center gap-2">
                      {selectedProjekt.kw && (
                        <span className="font-medium">KW {selectedProjekt.kw}</span>
                      )}
                      {selectedProjekt.projekt.kommuniziertesDatum && (
                        <span className="text-green-600 text-xs">
                          Kommuniziert: {new Date(selectedProjekt.projekt.kommuniziertesDatum).toLocaleDateString('de-DE')}
                        </span>
                      )}
                      {selectedProjekt.projekt.geplantesDatum && (
                        <span className="text-gray-500 text-xs">
                          Geplant: {new Date(selectedProjekt.projekt.geplantesDatum).toLocaleDateString('de-DE')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dispo-Ansprechpartner */}
                  {(selectedProjekt.projekt.dispoAnsprechpartner?.name || selectedProjekt.kunde?.dispoAnsprechpartner?.name) && (
                    <div className="flex items-center gap-2 text-purple-600">
                      <Info className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {selectedProjekt.projekt.dispoAnsprechpartner?.name || selectedProjekt.kunde?.dispoAnsprechpartner?.name}
                        {(selectedProjekt.projekt.dispoAnsprechpartner?.telefon || selectedProjekt.kunde?.dispoAnsprechpartner?.telefon) && (
                          <span className="ml-2 text-gray-500">
                            {selectedProjekt.projekt.dispoAnsprechpartner?.telefon || selectedProjekt.kunde?.dispoAnsprechpartner?.telefon}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Button */}
                {onProjektClick && (
                  <button
                    onClick={() => onProjektClick(selectedProjekt.projekt)}
                    className="mt-3 w-full px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Zur Projektabwicklung
                  </button>
                )}
              </div>
            </InfoWindowF>
          )}
        </GoogleMap>

        {/* Legende Overlay (unten links) */}
        <div className="absolute bottom-4 left-4 z-10">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-3 max-w-[200px]">
            <h4 className="text-xs font-semibold text-gray-900 dark:text-white mb-2 uppercase tracking-wider">
              Status
            </h4>
            <div className="space-y-1.5">
              {(Object.keys(STATUS_FARBEN) as DispoStatus[]).map((status) => {
                const count = stats.byStatus[status] || 0;
                return (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(filterStatus === status ? 'alle' : status)}
                    className={`flex items-center gap-2 w-full text-left rounded px-1.5 py-0.5 transition-colors ${
                      filterStatus === status ? 'bg-gray-100 dark:bg-slate-700' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full border border-white shadow-sm flex-shrink-0"
                      style={{ backgroundColor: STATUS_FARBEN[status].hex }}
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Größen-Legende */}
            <div className="mt-3 pt-2 border-t border-gray-200 dark:border-slate-700">
              <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Größe = Tonnage</h4>
              <div className="flex items-end gap-2 justify-center">
                {[10, 20, 50].map((t) => (
                  <div key={t} className="flex flex-col items-center gap-0.5">
                    <div
                      className="rounded-full bg-gray-400"
                      style={{ width: getMarkerSize(t), height: getMarkerSize(t) }}
                    />
                    <span className="text-[9px] text-gray-400">{t}t</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Touren-Panel (unten rechts) */}
        {showTouren && touren.length > 0 && (
          <div className="absolute bottom-4 right-4 z-10">
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-3 max-w-[260px]">
              <h4 className="text-xs font-semibold text-gray-900 dark:text-white mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5" />
                Touren ({touren.length})
              </h4>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {tourPolylines.map(({ tour, color, index }) => (
                  <button
                    key={tour.id || index}
                    onClick={() => setSelectedTourIndex(selectedTourIndex === index ? null : index)}
                    className={`flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                      selectedTourIndex === index
                        ? 'bg-gray-100 dark:bg-slate-700 ring-1 ring-gray-300 dark:ring-slate-500'
                        : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                        {tour.name}
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400">
                        {tour.stops.length} Stops | {tour.routeDetails.gesamtTonnen.toFixed(1)}t
                        {tour.routeDetails.gesamtDistanzKm > 0 && (
                          <> | {Math.round(tour.routeDetails.gesamtDistanzKm)} km</>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {selectedTourIndex !== null && (
                <button
                  onClick={() => setSelectedTourIndex(null)}
                  className="mt-2 w-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Alle Touren anzeigen
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading Overlay für Touren */}
        {loadingTouren && (
          <div className="absolute top-4 right-4 z-10 bg-white/90 dark:bg-slate-800/90 rounded-lg px-3 py-2 flex items-center gap-2 shadow">
            <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
            <span className="text-xs text-gray-600 dark:text-gray-300">Touren laden...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DispoKartenAnsicht;
