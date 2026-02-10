import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  OverlayViewF,
  InfoWindowF,
  PolylineF,
  CircleF,
  OVERLAY_MOUSE_TARGET,
} from '@react-google-maps/api';
import {
  MapPin,
  Package,
  Calendar,
  Eye,
  EyeOff,
  Truck,
  Route,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Navigation,
  Layers,
  Search,
  X,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronLeft,
  Phone,
  ExternalLink,
  Target,
  Clock,
  Users,
} from 'lucide-react';
import { Projekt, DispoStatus, Belieferungsart } from '../../types/projekt';
import { SaisonKunde } from '../../types/saisonplanung';
import { Tour } from '../../types/tour';
import { tourenService } from '../../services/tourenService';
import { PLZ_BEREICHE } from '../../data/plz-bereiche';

// === CONSTANTS ===

const WERK_POSITION = { lat: 49.85, lng: 9.60 };

const MAP_STYLE = { width: '100%', height: '100%' };

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  gestureHandling: 'greedy',
  styles: [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#dbeafe' }] },
    { featureType: 'landscape.natural', elementType: 'geometry.fill', stylers: [{ color: '#f0fdf4' }] },
    { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#fef3c7' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#fbbf24' }] },
  ],
};

const STATUS_FARBEN: Record<DispoStatus, { hex: string; light: string; label: string }> = {
  offen:     { hex: '#3b82f6', light: '#dbeafe', label: 'Offen' },
  geplant:   { hex: '#a855f7', light: '#f3e8ff', label: 'Geplant' },
  beladen:   { hex: '#f97316', light: '#ffedd5', label: 'Beladen' },
  unterwegs: { hex: '#eab308', light: '#fef9c3', label: 'Unterwegs' },
  geliefert: { hex: '#22c55e', light: '#dcfce7', label: 'Geliefert' },
};

const BELIEFERUNGSART_LABELS: Partial<Record<Belieferungsart, string>> = {
  nur_motorwagen: 'MW',
  mit_haenger: 'HNG',
  abholung_ab_werk: 'ABH',
  palette_mit_ladekran: 'KRAN',
  bigbag: 'BB',
};

const TOUR_FARBEN = [
  '#ef4444', '#3b82f6', '#22c55e', '#f97316', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1',
];

const DISTANCE_RINGS = [
  { radius: 50000, label: '50 km', color: '#3b82f640', border: '#3b82f6' },
  { radius: 100000, label: '100 km', color: '#6366f120', border: '#6366f180' },
  { radius: 200000, label: '200 km', color: '#8b5cf610', border: '#8b5cf640' },
  { radius: 300000, label: '300 km', color: '#a855f708', border: '#a855f720' },
];

// === TYPES ===

interface ProjektMitKoordinaten {
  projekt: Projekt;
  kunde?: SaisonKunde;
  position: google.maps.LatLngLiteral;
  tonnen: number;
  kw?: number;
}

interface PLZCluster {
  key: string;
  position: google.maps.LatLngLiteral;
  items: ProjektMitKoordinaten[];
  totalTonnen: number;
  primaryStatus: DispoStatus;
}

interface Props {
  projekte: Projekt[];
  kundenMap: Map<string, SaisonKunde>;
  onProjektClick?: (projekt: Projekt) => void;
}

// === HELPERS ===

const extractPLZ = (plzOrt: string): string | null => {
  const match = plzOrt?.match(/(\d{5})/);
  return match ? match[1] : null;
};

const getKoordinaten = (
  projekt: Projekt,
  kunde?: SaisonKunde
): google.maps.LatLngLiteral | null => {
  // Kunde Koordinaten (verschiedene Quellen)
  const sources = [
    kunde?.lieferadresse?.koordinaten,
    kunde?.rechnungsadresse?.koordinaten,
    kunde?.koordinaten,
    kunde?.adresse?.koordinaten,
  ];
  for (const coords of sources) {
    if (coords) {
      const [lon, lat] = coords;
      if (lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16) {
        return { lat, lng: lon };
      }
    }
  }
  // PLZ Fallback
  const plz = projekt.lieferadresse?.plz
    || extractPLZ(projekt.kundenPlzOrt)
    || kunde?.lieferadresse?.plz
    || kunde?.rechnungsadresse?.plz;
  if (plz) {
    const bereich = PLZ_BEREICHE[plz.substring(0, 2)];
    if (bereich) {
      const [lon, lat] = bereich.center;
      const n = parseInt(plz);
      return { lat: lat + ((n % 100) - 50) * 0.002, lng: lon + ((n % 37) - 18) * 0.003 };
    }
  }
  return null;
};

const getKW = (dateStr: string): number => {
  const d = new Date(Date.UTC(new Date(dateStr).getFullYear(), new Date(dateStr).getMonth(), new Date(dateStr).getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d.getTime() - new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).getTime()) / 86400000 + 1) / 7);
};

/** Decode Google's encoded polyline format */
const decodePolyline = (encoded: string): google.maps.LatLngLiteral[] => {
  const points: google.maps.LatLngLiteral[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    for (const coord of ['lat', 'lng'] as const) {
      let shift = 0, result = 0, byte;
      do {
        byte = encoded.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (coord === 'lat') lat += delta; else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
};

const getMarkerSize = (tonnen: number): number => {
  if (tonnen <= 10) return 30;
  if (tonnen <= 20) return 36;
  if (tonnen <= 50) return 42;
  return 48;
};

// === COMPONENT ===

const DispoKartenAnsicht = ({ projekte, kundenMap, onProjektClick }: Props) => {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    language: 'de',
    region: 'DE',
  });

  // Core State
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [zoom, setZoom] = useState(8);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showDistanceRings, setShowDistanceRings] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Filter
  const [filterKW, setFilterKW] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<DispoStatus | null>(null);

  // Tour State
  const [touren, setTouren] = useState<Tour[]>([]);
  const [showTouren, setShowTouren] = useState(true);
  const [tourenDatum, setTourenDatum] = useState(new Date().toISOString().split('T')[0]);
  const [loadingTouren, setLoadingTouren] = useState(false);
  const [activeTourId, setActiveTourId] = useState<string | null>(null);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // === DATA PROCESSING ===

  const projekteMitKoordinaten = useMemo(() => {
    const result: ProjektMitKoordinaten[] = [];
    for (const projekt of projekte) {
      const kunde = projekt.kundeId ? kundenMap.get(projekt.kundeId) : undefined;
      const position = getKoordinaten(projekt, kunde);
      if (!position) continue;
      result.push({
        projekt,
        kunde,
        position,
        tonnen: projekt.liefergewicht || projekt.angefragteMenge || 0,
        kw: projekt.lieferKW || (projekt.geplantesDatum ? getKW(projekt.geplantesDatum) : undefined),
      });
    }
    return result;
  }, [projekte, kundenMap]);

  const gefilterteProjekte = useMemo(() => {
    return projekteMitKoordinaten.filter((p) => {
      if (filterKW !== null && p.kw !== filterKW) return false;
      if (filterStatus !== null && (p.projekt.dispoStatus || 'offen') !== filterStatus) return false;
      if (sidebarSearch) {
        const s = sidebarSearch.toLowerCase();
        const text = `${p.projekt.kundenname} ${p.projekt.kundenPlzOrt} ${p.projekt.kundennummer || ''} ${p.kunde?.lieferadresse?.ort || ''}`.toLowerCase();
        if (!text.includes(s)) return false;
      }
      return true;
    });
  }, [projekteMitKoordinaten, filterKW, filterStatus, sidebarSearch]);

  // KW-Statistiken
  const kwStats = useMemo(() => {
    const map = new Map<number, { count: number; tonnen: number }>();
    projekteMitKoordinaten.forEach((p) => {
      if (!p.kw) return;
      const existing = map.get(p.kw) || { count: 0, tonnen: 0 };
      map.set(p.kw, { count: existing.count + 1, tonnen: existing.tonnen + p.tonnen });
    });
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [projekteMitKoordinaten]);

  // Status-Statistiken
  const statusStats = useMemo(() => {
    const map = new Map<DispoStatus, { count: number; tonnen: number }>();
    gefilterteProjekte.forEach((p) => {
      const s = (p.projekt.dispoStatus || 'offen') as DispoStatus;
      const existing = map.get(s) || { count: 0, tonnen: 0 };
      map.set(s, { count: existing.count + 1, tonnen: existing.tonnen + p.tonnen });
    });
    return map;
  }, [gefilterteProjekte]);

  // Gesamt-Stats
  const totalStats = useMemo(() => ({
    count: gefilterteProjekte.length,
    tonnen: gefilterteProjekte.reduce((s, p) => s + p.tonnen, 0),
    ohneKoordinaten: projekte.length - projekteMitKoordinaten.length,
  }), [gefilterteProjekte, projekte.length, projekteMitKoordinaten.length]);

  // Clustering bei niedrigem Zoom
  const clusters = useMemo<PLZCluster[]>(() => {
    if (zoom >= 9 || gefilterteProjekte.length <= 30) return [];
    const groups = new Map<string, ProjektMitKoordinaten[]>();
    gefilterteProjekte.forEach((p) => {
      const plz = p.projekt.lieferadresse?.plz || extractPLZ(p.projekt.kundenPlzOrt) || '';
      const key = plz.substring(0, 2);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });
    return [...groups.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => {
        const avgLat = items.reduce((s, i) => s + i.position.lat, 0) / items.length;
        const avgLng = items.reduce((s, i) => s + i.position.lng, 0) / items.length;
        const totalTonnen = items.reduce((s, i) => s + i.tonnen, 0);
        // Meisten Status bestimmt Farbe
        const statusCount = new Map<DispoStatus, number>();
        items.forEach((i) => {
          const s = (i.projekt.dispoStatus || 'offen') as DispoStatus;
          statusCount.set(s, (statusCount.get(s) || 0) + 1);
        });
        const primaryStatus = [...statusCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
        return { key, position: { lat: avgLat, lng: avgLng }, items, totalTonnen, primaryStatus };
      });
  }, [gefilterteProjekte, zoom]);

  // IDs die in einem Cluster sind (für Einzelmarker-Filterung)
  const clusteredIds = useMemo(() => {
    const set = new Set<string>();
    clusters.forEach((c) => c.items.forEach((i) => set.add((i.projekt as any).$id || i.projekt.id)));
    return set;
  }, [clusters]);

  // Projekte nach KW gruppiert für Sidebar
  const projekteNachKW = useMemo(() => {
    const groups = new Map<number | 'ohne', ProjektMitKoordinaten[]>();
    gefilterteProjekte.forEach((p) => {
      const key = p.kw || 'ohne';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === 'ohne') return 1;
      if (b === 'ohne') return -1;
      return (a as number) - (b as number);
    });
  }, [gefilterteProjekte]);

  // Tour Polylines
  const tourPolylines = useMemo(() => {
    if (!showTouren || touren.length === 0) return [];
    return touren.map((tour, idx) => {
      // Encoded Polyline bevorzugen (echte Straßengeometrie)
      if (tour.encodedPolyline) {
        return {
          tour, idx,
          path: decodePolyline(tour.encodedPolyline),
          color: TOUR_FARBEN[idx % TOUR_FARBEN.length],
          isReal: true,
        };
      }
      // Fallback: Luftlinie über Stops
      const path: google.maps.LatLngLiteral[] = [WERK_POSITION];
      tour.stops.forEach((stop) => {
        if (stop.adresse.koordinaten) {
          path.push({ lat: stop.adresse.koordinaten[1], lng: stop.adresse.koordinaten[0] });
        } else if (stop.adresse.plz) {
          const b = PLZ_BEREICHE[stop.adresse.plz.substring(0, 2)];
          if (b) path.push({ lat: b.center[1], lng: b.center[0] });
        }
      });
      path.push(WERK_POSITION);
      return { tour, idx, path, color: TOUR_FARBEN[idx % TOUR_FARBEN.length], isReal: false };
    });
  }, [touren, showTouren]);

  // === EFFECTS ===

  // Touren laden
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingTouren(true);
      try {
        const result = await tourenService.loadTouren({ datum: tourenDatum });
        if (!cancelled) setTouren(result);
      } catch { if (!cancelled) setTouren([]); }
      finally { if (!cancelled) setLoadingTouren(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [tourenDatum]);

  // Fit bounds on data change
  const fitBounds = useCallback(() => {
    if (!map || gefilterteProjekte.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(WERK_POSITION);
    gefilterteProjekte.forEach((p) => bounds.extend(p.position));
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: showSidebar ? 400 : 60 });
  }, [map, gefilterteProjekte, showSidebar]);

  useEffect(() => {
    if (map && gefilterteProjekte.length > 0) {
      const t = setTimeout(fitBounds, 300);
      return () => clearTimeout(t);
    }
  }, [map, gefilterteProjekte.length, fitBounds]);

  // Zoom tracking
  const onZoomChanged = useCallback(() => {
    if (map) setZoom(map.getZoom() || 8);
  }, [map]);

  // === HANDLERS ===

  const selectProjekt = useCallback((item: ProjektMitKoordinaten | null) => {
    if (!item) { setSelectedId(null); return; }
    const id = (item.projekt as any).$id || item.projekt.id;
    setSelectedId(id);
    if (map) {
      map.panTo(item.position);
      if (zoom < 10) map.setZoom(10);
    }
  }, [map, zoom]);

  const scrollToCard = useCallback((id: string) => {
    const el = cardRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const getSelectedItem = useCallback(() => {
    if (!selectedId) return null;
    return gefilterteProjekte.find((p) => ((p.projekt as any).$id || p.projekt.id) === selectedId) || null;
  }, [selectedId, gefilterteProjekte]);

  // === RENDER ===

  if (loadError) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
        <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Google Maps nicht verfügbar</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">API Key in .env hinterlegen:</p>
        <code className="px-4 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm">VITE_GOOGLE_MAPS_API_KEY=...</code>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-red-500" />
          <span className="text-gray-500 dark:text-gray-400 font-medium">Karte wird geladen...</span>
        </div>
      </div>
    );
  }

  const selectedItem = getSelectedItem();

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col ${
      isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : ''
    }`}>

      {/* ===== HEADER ===== */}
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center gap-4 flex-shrink-0">
        {/* Title + Stats */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-sm">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 dark:text-white text-sm">Dispo-Karte</h2>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-700 dark:text-gray-200">{totalStats.count} Aufträge</span>
              <span>{totalStats.tonnen.toFixed(0)}t</span>
              {totalStats.ohneKoordinaten > 0 && (
                <span className="text-amber-500">{totalStats.ohneKoordinaten} ohne Position</span>
              )}
            </div>
          </div>
        </div>

        {/* Touren Datum */}
        <div className="flex items-center gap-2 border-l border-gray-200 dark:border-slate-700 pl-4">
          <Route className="w-4 h-4 text-purple-500" />
          <input
            type="date"
            value={tourenDatum}
            onChange={(e) => setTourenDatum(e.target.value)}
            className="px-2 py-1 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs text-gray-700 dark:text-gray-300 w-[130px]"
          />
          <button
            onClick={() => setShowTouren(!showTouren)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              showTouren
                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Layers className="w-3.5 h-3.5 inline mr-1" />
            {touren.length > 0 ? `${touren.length} Touren` : 'Touren'}
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 border-l border-gray-200 dark:border-slate-700 pl-4">
          <button onClick={() => setShowDistanceRings(!showDistanceRings)} title="Entfernungsringe"
            className={`p-1.5 rounded-lg transition-all ${showDistanceRings ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
            <Target className="w-4 h-4" />
          </button>
          <button onClick={() => setShowLabels(!showLabels)} title="Labels"
            className={`p-1.5 rounded-lg transition-all ${showLabels ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
            {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button onClick={fitBounds} title="Ansicht zurücksetzen"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} title="Vollbild"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex flex-1" style={{ height: isFullscreen ? 'calc(100vh - 49px)' : '750px' }}>

        {/* ===== SIDEBAR ===== */}
        {showSidebar && (
          <div className="w-[360px] border-r border-gray-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-900 flex-shrink-0" ref={sidebarRef}>

            {/* KW Chips */}
            <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  onClick={() => setFilterKW(null)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    filterKW === null
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Alle KW
                </button>
                {kwStats.map(([kw, stat]) => (
                  <button
                    key={kw}
                    onClick={() => setFilterKW(filterKW === kw ? null : kw)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                      filterKW === kw
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>KW {kw}</span>
                    <span className="ml-1 opacity-70">{stat.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Status Chips */}
            <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(Object.keys(STATUS_FARBEN) as DispoStatus[]).map((status) => {
                  const stat = statusStats.get(status);
                  if (!stat) return null;
                  const isActive = filterStatus === status;
                  return (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(isActive ? null : status)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        isActive
                          ? 'text-white shadow-sm'
                          : 'hover:opacity-80'
                      }`}
                      style={{
                        backgroundColor: isActive ? STATUS_FARBEN[status].hex : STATUS_FARBEN[status].light,
                        color: isActive ? 'white' : STATUS_FARBEN[status].hex,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? 'white' : STATUS_FARBEN[status].hex }} />
                      {STATUS_FARBEN[status].label}
                      <span className="opacity-70">{stat.count}</span>
                    </button>
                  );
                })}
                {(filterKW !== null || filterStatus !== null) && (
                  <button
                    onClick={() => { setFilterKW(null); setFilterStatus(null); setSidebarSearch(''); }}
                    className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Kunde, PLZ, Ort..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                />
                {sidebarSearch && (
                  <button onClick={() => setSidebarSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Project List */}
            <div className="flex-1 overflow-y-auto">
              {projekteNachKW.map(([kw, items]) => (
                <div key={String(kw)}>
                  {/* KW Header */}
                  <div className="sticky top-0 z-10 px-3 py-1.5 bg-gray-50 dark:bg-slate-800/80 backdrop-blur-sm border-b border-gray-100 dark:border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {kw === 'ohne' ? 'Ohne KW' : `KW ${kw}`}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span>{items.length} Aufträge</span>
                        <span className="font-semibold">{items.reduce((s, i) => s + i.tonnen, 0).toFixed(0)}t</span>
                      </div>
                    </div>
                  </div>

                  {/* Cards */}
                  {items.map((item) => {
                    const id = (item.projekt as any).$id || item.projekt.id;
                    const status = (item.projekt.dispoStatus || 'offen') as DispoStatus;
                    const isActive = selectedId === id;
                    const isHover = hoveredId === id;

                    return (
                      <div
                        key={id}
                        ref={(el) => { if (el) cardRefs.current.set(id, el); }}
                        className={`mx-2 my-1 rounded-lg border cursor-pointer transition-all duration-150 ${
                          isActive
                            ? 'border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-900/20 shadow-md ring-1 ring-red-400/30'
                            : isHover
                            ? 'border-gray-300 dark:border-slate-500 bg-gray-50 dark:bg-slate-800/50 shadow-sm'
                            : 'border-transparent hover:border-gray-200 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/30'
                        }`}
                        onClick={() => selectProjekt(item)}
                        onMouseEnter={() => setHoveredId(id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <div className="px-3 py-2">
                          <div className="flex items-start gap-2">
                            {/* Status Dot */}
                            <div className="mt-1.5 flex-shrink-0">
                              <div
                                className={`w-2.5 h-2.5 rounded-full ${status === 'offen' ? 'animate-pulse' : ''}`}
                                style={{ backgroundColor: STATUS_FARBEN[status].hex }}
                              />
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                                  {item.projekt.kundenname}
                                </span>
                                {item.projekt.kundennummer && (
                                  <span className="text-[10px] text-gray-400 flex-shrink-0">#{item.projekt.kundennummer}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                <span className="truncate">{item.projekt.kundenPlzOrt}</span>
                              </div>
                            </div>
                            {/* Tonnage Badge */}
                            <div className="flex-shrink-0 text-right">
                              <div className="text-sm font-bold text-gray-900 dark:text-white">{item.tonnen > 0 ? `${Math.round(item.tonnen)}t` : '-'}</div>
                              {item.projekt.belieferungsart && (
                                <div className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                                  {BELIEFERUNGSART_LABELS[item.projekt.belieferungsart] || ''}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {gefilterteProjekte.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Keine Aufträge gefunden</p>
                </div>
              )}
            </div>

            {/* Tour List */}
            {showTouren && touren.length > 0 && (
              <div className="border-t border-gray-200 dark:border-slate-700 max-h-[200px] overflow-y-auto flex-shrink-0">
                <div className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 sticky top-0">
                  <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Route className="w-3 h-3" />
                    Touren ({touren.length})
                    {loadingTouren && <Loader2 className="w-3 h-3 animate-spin" />}
                  </span>
                </div>
                {tourPolylines.map(({ tour, color, idx }) => (
                  <div
                    key={tour.id || idx}
                    className={`mx-2 my-1 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      activeTourId === tour.id
                        ? 'border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/30 shadow-sm'
                        : 'border-transparent hover:border-gray-200 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/30'
                    }`}
                    onClick={() => setActiveTourId(activeTourId === tour.id ? null : tour.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{tour.name}</div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-2">
                          <span>{tour.stops.length} Stops</span>
                          <span>{tour.routeDetails.gesamtTonnen.toFixed(0)}t</span>
                          {tour.routeDetails.gesamtDistanzKm > 0 && <span>{Math.round(tour.routeDetails.gesamtDistanzKm)} km</span>}
                          {tour.routeDetails.gesamtZeitMinuten > 0 && (
                            <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{Math.round(tour.routeDetails.gesamtZeitMinuten / 60)}h</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sidebar Toggle */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-r-lg shadow-md px-1 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
          style={{ left: showSidebar ? '360px' : '0' }}
        >
          {showSidebar ? <ChevronLeft className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </button>

        {/* ===== MAP ===== */}
        <div className="flex-1 relative">
          <GoogleMap
            mapContainerStyle={MAP_STYLE}
            center={WERK_POSITION}
            zoom={8}
            options={MAP_OPTIONS}
            onLoad={setMap}
            onUnmount={() => setMap(null)}
            onClick={() => setSelectedId(null)}
            onZoomChanged={onZoomChanged}
          >
            {/* Distance Rings */}
            {showDistanceRings && DISTANCE_RINGS.map((ring) => (
              <CircleF
                key={ring.radius}
                center={WERK_POSITION}
                radius={ring.radius}
                options={{
                  fillColor: ring.color,
                  fillOpacity: 0.15,
                  strokeColor: ring.border,
                  strokeOpacity: 0.4,
                  strokeWeight: 1,
                  clickable: false,
                }}
              />
            ))}

            {/* Werk Marker */}
            <OverlayViewF position={WERK_POSITION} mapPaneName={OVERLAY_MOUSE_TARGET} getPixelPositionOffset={() => ({ x: -18, y: -18 })}>
              <div className="relative group cursor-default">
                <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-red-700 rounded-xl border-2 border-white shadow-lg flex items-center justify-center transform -rotate-12">
                  <Navigation className="w-4 h-4 text-white rotate-12" />
                </div>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Werk Marktheidenfeld
                </div>
              </div>
            </OverlayViewF>

            {/* Distance Ring Labels */}
            {showDistanceRings && DISTANCE_RINGS.map((ring) => (
              <OverlayViewF
                key={`label-${ring.radius}`}
                position={{ lat: WERK_POSITION.lat + ring.radius / 111320, lng: WERK_POSITION.lng }}
                mapPaneName="overlayLayer"
                getPixelPositionOffset={() => ({ x: -16, y: -8 })}
              >
                <div className="text-[10px] font-medium text-blue-500/60 bg-white/70 px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap">
                  {ring.label}
                </div>
              </OverlayViewF>
            ))}

            {/* Cluster Markers */}
            {clusters.map((cluster) => (
              <OverlayViewF
                key={`cluster-${cluster.key}`}
                position={cluster.position}
                mapPaneName={OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={() => ({ x: -28, y: -28 })}
              >
                <div
                  className="w-14 h-14 rounded-full border-3 border-white shadow-xl flex flex-col items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                  style={{ backgroundColor: STATUS_FARBEN[cluster.primaryStatus].hex }}
                  onClick={() => {
                    if (map) {
                      const bounds = new google.maps.LatLngBounds();
                      cluster.items.forEach((i) => bounds.extend(i.position));
                      map.fitBounds(bounds, 80);
                    }
                  }}
                >
                  <span className="text-white font-bold text-sm leading-none">{cluster.items.length}</span>
                  <span className="text-white/80 text-[9px] leading-none mt-0.5">{Math.round(cluster.totalTonnen)}t</span>
                </div>
              </OverlayViewF>
            ))}

            {/* Individual Markers */}
            {gefilterteProjekte.map((item) => {
              const id = (item.projekt as any).$id || item.projekt.id;
              if (clusteredIds.has(id)) return null; // In einem Cluster → nicht einzeln zeigen

              const status = (item.projekt.dispoStatus || 'offen') as DispoStatus;
              const farbe = STATUS_FARBEN[status];
              const size = getMarkerSize(item.tonnen);
              const isActive = selectedId === id;
              const isHover = hoveredId === id;

              return (
                <OverlayViewF
                  key={id}
                  position={item.position}
                  mapPaneName={OVERLAY_MOUSE_TARGET}
                  getPixelPositionOffset={() => ({ x: -size / 2, y: -size - 6 })}
                >
                  <div
                    className="cursor-pointer"
                    onMouseEnter={() => { setHoveredId(id); scrollToCard(id); }}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => { e.stopPropagation(); selectProjekt(item); }}
                  >
                    {/* Pin Shape */}
                    <div className={`relative transition-all duration-150 ${isActive || isHover ? 'z-50 -translate-y-2' : 'z-10'}`}>
                      {/* Bubble */}
                      <div
                        className={`rounded-xl flex items-center justify-center border-2 border-white ${status === 'offen' && !isActive ? 'animate-pulse' : ''}`}
                        style={{
                          width: size,
                          height: size,
                          backgroundColor: farbe.hex,
                          boxShadow: isActive
                            ? `0 0 0 3px ${farbe.hex}50, 0 8px 25px rgba(0,0,0,0.3)`
                            : isHover
                            ? `0 4px 15px rgba(0,0,0,0.25)`
                            : '0 2px 8px rgba(0,0,0,0.2)',
                          transform: isActive ? 'scale(1.2)' : isHover ? 'scale(1.1)' : 'scale(1)',
                          transition: 'all 150ms ease',
                        }}
                      >
                        <span className="text-white font-bold text-[11px] leading-none select-none drop-shadow-sm">
                          {item.tonnen > 0 ? `${Math.round(item.tonnen)}t` : '?'}
                        </span>
                      </div>
                      {/* Pin tail */}
                      <div className="flex justify-center -mt-[1px]">
                        <div style={{
                          width: 0, height: 0,
                          borderLeft: '6px solid transparent',
                          borderRight: '6px solid transparent',
                          borderTop: `6px solid ${farbe.hex}`,
                          filter: isActive ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.2))' : undefined,
                        }} />
                      </div>

                      {/* Label */}
                      {showLabels && !isHover && !isActive && (
                        <div className="absolute left-1/2 -translate-x-1/2 mt-0.5 whitespace-nowrap pointer-events-none">
                          <div className="text-[10px] font-semibold text-gray-700 dark:text-gray-200 bg-white/90 dark:bg-slate-900/90 px-1.5 py-0.5 rounded shadow-sm text-center truncate max-w-[110px]">
                            {item.projekt.kundenname}
                          </div>
                        </div>
                      )}

                      {/* Hover Card */}
                      {isHover && !isActive && (
                        <div className="absolute left-1/2 -translate-x-1/2 mt-1 pointer-events-none z-50">
                          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-600 p-2.5 min-w-[180px]">
                            <div className="font-bold text-sm text-gray-900 dark:text-white">{item.projekt.kundenname}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">{item.projekt.kundenPlzOrt}</div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: farbe.hex }}>
                                {farbe.label}
                              </span>
                              {item.tonnen > 0 && <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{item.tonnen}t</span>}
                              {item.kw && <span className="text-xs text-gray-500">KW {item.kw}</span>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </OverlayViewF>
              );
            })}

            {/* Tour Polylines */}
            {showTouren && tourPolylines.map(({ tour, path, color, idx, isReal }) => {
              const isActive = activeTourId === null || activeTourId === tour.id;
              return (
                <PolylineF
                  key={tour.id || idx}
                  path={path}
                  options={{
                    strokeColor: isActive ? color : `${color}30`,
                    strokeOpacity: isActive ? 0.9 : 0.2,
                    strokeWeight: activeTourId === tour.id ? 5 : 3,
                    geodesic: !isReal,
                    icons: [{
                      icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillColor: color, fillOpacity: isActive ? 1 : 0.3, strokeWeight: 0 },
                      repeat: '120px',
                    }],
                    zIndex: activeTourId === tour.id ? 10 : 1,
                    clickable: true,
                  }}
                  onClick={() => setActiveTourId(activeTourId === tour.id ? null : tour.id)}
                />
              );
            })}

            {/* Tour Stop Numbers */}
            {showTouren && tourPolylines.map(({ tour, color, idx }) => {
              if (activeTourId !== null && activeTourId !== tour.id) return null;
              return tour.stops.map((stop, stopIdx) => {
                const pos = stop.adresse.koordinaten
                  ? { lat: stop.adresse.koordinaten[1], lng: stop.adresse.koordinaten[0] }
                  : null;
                if (!pos) return null;
                return (
                  <OverlayViewF
                    key={`stop-${tour.id || idx}-${stopIdx}`}
                    position={pos}
                    mapPaneName={OVERLAY_MOUSE_TARGET}
                    getPixelPositionOffset={() => ({ x: -10, y: -10 })}
                  >
                    <div
                      className="w-5 h-5 rounded-full border-2 border-white shadow-md flex items-center justify-center cursor-default"
                      style={{ backgroundColor: color }}
                      title={`Stop ${stopIdx + 1}: ${stop.kundenname} (${stop.tonnen}t)`}
                    >
                      <span className="text-white text-[9px] font-bold">{stopIdx + 1}</span>
                    </div>
                  </OverlayViewF>
                );
              });
            })}

            {/* Selected InfoWindow */}
            {selectedItem && (
              <InfoWindowF
                position={selectedItem.position}
                onCloseClick={() => setSelectedId(null)}
                options={{
                  pixelOffset: new google.maps.Size(0, -(getMarkerSize(selectedItem.tonnen) + 14)),
                  maxWidth: 380,
                }}
              >
                <div className="min-w-[300px] p-1">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg leading-tight">{selectedItem.projekt.kundenname}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {selectedItem.projekt.kundennummer && (
                          <span className="text-xs text-gray-400">#{selectedItem.projekt.kundennummer}</span>
                        )}
                      </div>
                    </div>
                    <span
                      className="px-2.5 py-1 rounded-full text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: STATUS_FARBEN[(selectedItem.projekt.dispoStatus || 'offen') as DispoStatus].hex }}
                    >
                      {STATUS_FARBEN[(selectedItem.projekt.dispoStatus || 'offen') as DispoStatus].label}
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2.5">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="text-gray-700">
                        {selectedItem.projekt.lieferadresse ? (
                          <>{selectedItem.projekt.lieferadresse.strasse}, {selectedItem.projekt.lieferadresse.plz} {selectedItem.projekt.lieferadresse.ort}</>
                        ) : selectedItem.projekt.kundenPlzOrt}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {selectedItem.tonnen > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="font-bold text-gray-800">{selectedItem.tonnen}t</span>
                        </div>
                      )}
                      {selectedItem.projekt.belieferungsart && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600 font-medium">
                          {selectedItem.projekt.belieferungsart === 'nur_motorwagen' && 'Motorwagen (18t)'}
                          {selectedItem.projekt.belieferungsart === 'mit_haenger' && 'Hänger (28t)'}
                          {selectedItem.projekt.belieferungsart === 'abholung_ab_werk' && 'Abholung'}
                          {selectedItem.projekt.belieferungsart === 'palette_mit_ladekran' && 'Ladekran'}
                          {selectedItem.projekt.belieferungsart === 'bigbag' && 'BigBag'}
                        </span>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="flex items-center gap-2.5">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedItem.kw && <span className="font-semibold text-gray-800">KW {selectedItem.kw}</span>}
                        {selectedItem.projekt.kommuniziertesDatum && (
                          <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
                            Komm: {new Date(selectedItem.projekt.kommuniziertesDatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                        {selectedItem.projekt.geplantesDatum && (
                          <span className="text-xs text-gray-500">
                            Gepl: {new Date(selectedItem.projekt.geplantesDatum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dispo ASP */}
                    {(selectedItem.projekt.dispoAnsprechpartner?.name || selectedItem.kunde?.dispoAnsprechpartner?.name) && (
                      <div className="flex items-center gap-2.5 p-2 bg-purple-50 rounded-lg">
                        <Phone className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        <div>
                          <span className="text-purple-700 font-medium text-xs">
                            {selectedItem.projekt.dispoAnsprechpartner?.name || selectedItem.kunde?.dispoAnsprechpartner?.name}
                          </span>
                          {(selectedItem.projekt.dispoAnsprechpartner?.telefon || selectedItem.kunde?.dispoAnsprechpartner?.telefon) && (
                            <a href={`tel:${selectedItem.projekt.dispoAnsprechpartner?.telefon || selectedItem.kunde?.dispoAnsprechpartner?.telefon}`}
                              className="text-purple-500 text-xs ml-2 hover:underline">
                              {selectedItem.projekt.dispoAnsprechpartner?.telefon || selectedItem.kunde?.dispoAnsprechpartner?.telefon}
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Anfahrtshinweise */}
                    {selectedItem.kunde?.anfahrtshinweise && (
                      <div className="flex items-start gap-2.5 p-2 bg-amber-50 rounded-lg">
                        <Truck className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-amber-800">{selectedItem.kunde.anfahrtshinweise}</span>
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  {onProjektClick && (
                    <button
                      onClick={() => onProjektClick(selectedItem.projekt)}
                      className="mt-3 w-full px-4 py-2 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg text-sm font-semibold hover:from-red-700 hover:to-red-600 transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Zur Projektabwicklung
                    </button>
                  )}
                </div>
              </InfoWindowF>
            )}
          </GoogleMap>

          {/* Map Zoom Controls */}
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
            <button onClick={() => map?.setZoom((map.getZoom() || 8) + 1)}
              className="w-9 h-9 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-lg font-bold transition-colors">+</button>
            <button onClick={() => map?.setZoom((map.getZoom() || 8) - 1)}
              className="w-9 h-9 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-lg font-bold transition-colors">-</button>
          </div>

          {/* Map Type Selector */}
          <div className="absolute top-4 right-16 z-10">
            <select
              onChange={(e) => map?.setMapTypeId(e.target.value as google.maps.MapTypeId)}
              className="bg-white dark:bg-slate-800 text-xs text-gray-600 dark:text-gray-300 px-2.5 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 cursor-pointer"
              defaultValue="roadmap"
            >
              <option value="roadmap">Karte</option>
              <option value="satellite">Satellit</option>
              <option value="hybrid">Hybrid</option>
              <option value="terrain">Gelände</option>
            </select>
          </div>

          {/* Loading Overlay */}
          {loadingTouren && (
            <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center gap-2 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Touren laden...</span>
            </div>
          )}

          {/* Legend (compact, bottom right) */}
          <div className="absolute bottom-4 right-4 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 px-3 py-2">
            <div className="flex items-center gap-3">
              {(Object.keys(STATUS_FARBEN) as DispoStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_FARBEN[s].hex }} />
                  <span className="text-[10px] text-gray-500">{STATUS_FARBEN[s].label}</span>
                </div>
              ))}
              <div className="border-l border-gray-200 dark:border-slate-700 pl-3 flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded bg-gray-300" />
                <span className="text-[10px] text-gray-400">Größe = Tonnen</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DispoKartenAnsicht;
