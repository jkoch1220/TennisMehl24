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
  Search,
  X,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronLeft,
  Phone,
  ExternalLink,
  Target,
  Users,
  Plus,
} from 'lucide-react';
import { Projekt, DispoStatus, Belieferungsart } from '../../types/projekt';
import { SaisonKunde } from '../../types/saisonplanung';
import { Tour } from '../../types/tour';
import { tourenService } from '../../services/tourenService';
import { projektService } from '../../services/projektService';
import { parseMaterialAufschluesselung } from '../../utils/dispoMaterialParser';
import { geocodeBatchMitGoogle, extrahiereAdresse } from '../../utils/geocoding';
import { AdressKorrekturModal } from './AdressKorrekturModal';
// ZERO API COST - PLZ-basiertes Geocoding!
import { getKoordinatenFuerPLZ } from '../../data/plzKoordinaten';

// === CONSTANTS ===

const WERK_POSITION = { lat: 49.85, lng: 9.60 };

const MAP_STYLE = { width: '100%', height: '100%', minHeight: '500px' };

// Geocoding Cache (localStorage)
const GEOCODE_CACHE_KEY = 'dispo_geocode_cache_v2';

// Map Options als Konstante außerhalb der Komponente, um Rerenders zu vermeiden
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  // WICHTIG: cooperative = Ctrl+Scroll zum Zoomen, normales Scrollen scrollt die Seite
  gestureHandling: 'cooperative',
  // Scroll-Verhalten optimieren
  scrollwheel: false,
  keyboardShortcuts: false,
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
  mit_haenger: 'HG',
  abholung_ab_werk: 'ABH',
  palette_mit_ladekran: 'KRAN',
  bigbag: 'BB',
};

// Farben für Belieferungsart (Hauptfarbe des Markers)
const BELIEFERUNGSART_FARBEN: Record<string, { hex: string; label: string }> = {
  nur_motorwagen: { hex: '#ef4444', label: 'Motorwagen' }, // Rot
  mit_haenger: { hex: '#22c55e', label: 'Hänger' }, // Grün
  default: { hex: '#3b82f6', label: 'Nicht definiert' }, // Blau
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
  // NEU: Koordinaten-Quelle für visuelle Unterscheidung
  koordinatenQuelle: 'exakt' | 'manuell' | 'plz' | 'unbekannt';
  plz?: string; // Die PLZ des Projekts (für Offset-Berechnung)
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
  onProjektClick?: (projekt: Projekt, newTab?: boolean) => void;
  onBuchen?: (projektId: string, tourId: string, tonnen: number) => Promise<void>;
  onNeueTour?: (name: string, lkwTyp: 'motorwagen' | 'mit_haenger', kapazitaet: number) => Promise<string>;
  onProjektUpdate?: (projekt: Projekt) => void; // Callback wenn Projekt aktualisiert wurde
}

interface GeocodeCache {
  [address: string]: { lat: number; lng: number; timestamp: number };
}

// === OPTIMIERTES GEOCODING (ZERO API COST!) ===
// Strategie:
// 1. Existierende Koordinaten vom Kunden (SOFORT)
// 2. PLZ-Lookup aus lokaler Tabelle (SOFORT, KOSTENLOS!)
// 3. Google API NUR als letzter Fallback (mit Cache)

// Cache für Google API Fallback (wird selten gebraucht)
const loadGeocodeCache = (): GeocodeCache => {
  try {
    const cached = localStorage.getItem(GEOCODE_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const saveGeocodeCache = (cache: GeocodeCache) => {
  try {
    // Alte Einträge entfernen (älter als 90 Tage - seltener gebraucht)
    const maxAge = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const cleaned: GeocodeCache = {};
    for (const [key, value] of Object.entries(cache)) {
      if (now - value.timestamp < maxAge) {
        cleaned[key] = value;
      }
    }
    // Nur speichern wenn sich was geändert hat
    if (Object.keys(cleaned).length > 0) {
      localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cleaned));
    }
  } catch {
    // Ignore localStorage errors
  }
};

// PLZ aus verschiedenen Quellen extrahieren
const extractPLZFromProjekt = (projekt: Projekt, kunde?: SaisonKunde): string | null => {
  // Projekt Lieferadresse
  if (projekt.lieferadresse?.plz) return projekt.lieferadresse.plz;
  // Kunde Lieferadresse
  if (kunde?.lieferadresse?.plz) return kunde.lieferadresse.plz;
  // Kunde Rechnungsadresse
  if (kunde?.rechnungsadresse?.plz) return kunde.rechnungsadresse.plz;
  // Aus PLZ/Ort String extrahieren
  const match = projekt.kundenPlzOrt?.match(/(\d{5})/);
  return match ? match[1] : null;
};

// Bestehende Koordinaten aus Kunde holen (höchste Priorität)
const getExistingCoordinates = (
  _projekt: Projekt,
  kunde?: SaisonKunde
): google.maps.LatLngLiteral | null => {
  const sources = [
    kunde?.lieferadresse?.koordinaten,
    kunde?.rechnungsadresse?.koordinaten,
    kunde?.koordinaten,
    kunde?.adresse?.koordinaten,
  ];

  for (const coords of sources) {
    if (coords && Array.isArray(coords) && coords.length >= 2) {
      const [lon, lat] = coords;
      // Prüfen ob in Deutschland
      if (typeof lat === 'number' && typeof lon === 'number' &&
          lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16) {
        return { lat, lng: lon };
      }
    }
  }

  return null;
};

// KOMBINIERTE Geocoding-Strategie (optimiert für Performance)
// Gibt jetzt auch die Quelle der Koordinaten zurück
interface SmartGeocodeResult {
  position: google.maps.LatLngLiteral;
  quelle: 'exakt' | 'manuell' | 'plz';
  plz?: string;
}

const smartGeocode = (
  projekt: Projekt,
  kunde?: SaisonKunde
): SmartGeocodeResult | null => {
  const plzRaw = extractPLZFromProjekt(projekt, kunde);
  const plz = plzRaw ?? undefined; // Convert null to undefined for TypeScript

  // PRIORITÄT 1: Gespeicherte Koordinaten vom PROJEKT mit koordinatenQuelle 'exakt' oder 'manuell'
  // NUR diese sind zuverlässig!
  if (projekt.koordinaten && Array.isArray(projekt.koordinaten) && projekt.koordinaten.length >= 2) {
    const [lon, lat] = projekt.koordinaten;
    // Validiere: In Deutschland?
    if (typeof lat === 'number' && typeof lon === 'number' &&
        lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16) {
      // Prüfe ob die Koordinaten exakt oder manuell sind
      if (projekt.koordinatenQuelle === 'exakt' || projekt.koordinatenQuelle === 'manuell') {
        return { position: { lat, lng: lon }, quelle: projekt.koordinatenQuelle, plz };
      }
      // Wenn koordinatenQuelle 'plz' ist, nutze trotzdem die gespeicherten Koordinaten
      // aber markiere sie als PLZ-Fallback
      if (projekt.koordinatenQuelle === 'plz') {
        return { position: { lat, lng: lon }, quelle: 'plz', plz };
      }
    }
  }

  // Priorität 2: Existierende Koordinaten vom Kunden (mit Adresse = wahrscheinlich exakt)
  const existing = getExistingCoordinates(projekt, kunde);
  if (existing) {
    return { position: existing, quelle: 'exakt', plz };
  }

  // Priorität 3: PLZ-Lookup (Fallback, ungenau)
  // WICHTIG: Nutze die PLZ des PROJEKTS, nicht irgendeine Standard-Position!
  if (plzRaw) {
    const plzCoords = getKoordinatenFuerPLZ(plzRaw);
    if (plzCoords) {
      return { position: { lat: plzCoords.lat, lng: plzCoords.lng }, quelle: 'plz', plz };
    }
  }

  // Keine Koordinaten gefunden - NICHT auf WERK_POSITION fallen lassen!
  return null;
};

// Google API Fallback (NUR wenn PLZ-Lookup fehlschlägt - sehr selten!)
const geocodeAddressWithGoogleAPI = async (
  address: string,
  cache: GeocodeCache
): Promise<google.maps.LatLngLiteral | null> => {
  // Zuerst im Cache schauen
  const cached = cache[address];
  if (cached) {
    return { lat: cached.lat, lng: cached.lng };
  }

  // Google API aufrufen (teuer, daher nur als Fallback)
  try {
    const geocoder = new google.maps.Geocoder();
    const result = await new Promise<google.maps.GeocoderResult[] | null>((resolve) => {
      geocoder.geocode(
        { address: `${address}, Deutschland`, region: 'DE' },
        (results, status) => {
          if (status === 'OK' && results && results.length > 0) {
            resolve(results);
          } else {
            resolve(null);
          }
        }
      );
    });

    if (result && result[0]) {
      const location = result[0].geometry.location;
      const coords = { lat: location.lat(), lng: location.lng() };

      // In Deutschland?
      if (coords.lat >= 47 && coords.lat <= 56 && coords.lng >= 5 && coords.lng <= 16) {
        // Cache speichern
        cache[address] = { ...coords, timestamp: Date.now() };
        saveGeocodeCache(cache);
        return coords;
      }
    }
  } catch (error) {
    console.warn('[DispoKarte] Google Geocoding Fehler für:', address, error);
  }

  return null;
};

// Adresse für Google API Fallback erstellen
const getAddressForGoogleFallback = (projekt: Projekt, kunde?: SaisonKunde): string | null => {
  if (projekt.lieferadresse?.strasse && projekt.lieferadresse?.plz && projekt.lieferadresse?.ort) {
    return `${projekt.lieferadresse.strasse}, ${projekt.lieferadresse.plz} ${projekt.lieferadresse.ort}`;
  }
  if (kunde?.lieferadresse?.strasse && kunde?.lieferadresse?.plz && kunde?.lieferadresse?.ort) {
    return `${kunde.lieferadresse.strasse}, ${kunde.lieferadresse.plz} ${kunde.lieferadresse.ort}`;
  }
  if (projekt.kundenPlzOrt && projekt.kundenstrasse) {
    return `${projekt.kundenstrasse}, ${projekt.kundenPlzOrt}`;
  }
  if (projekt.kundenPlzOrt) {
    return projekt.kundenPlzOrt;
  }
  return null;
};

// === HELPERS ===

const extractPLZ = (plzOrt: string): string | null => {
  const match = plzOrt?.match(/(\d{5})/);
  return match ? match[1] : null;
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

const DispoKartenAnsicht = ({ projekte, kundenMap, onProjektClick, onBuchen, onNeueTour, onProjektUpdate }: Props) => {
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
  const [filterVereine, setFilterVereine] = useState<Set<string>>(new Set());
  const [showVereineFilter, setShowVereineFilter] = useState(false);
  const [vereineFilterSearch, setVereineFilterSearch] = useState('');

  // Tour State
  const [touren, setTouren] = useState<Tour[]>([]);
  const [showTouren, setShowTouren] = useState(false); // Standardmäßig ausgeblendet
  const [tourenDatum, setTourenDatum] = useState(new Date().toISOString().split('T')[0]);
  const [tourenFilterModus, setTourenFilterModus] = useState<'alle' | 'datum'>('alle');
  const [loadingTouren, setLoadingTouren] = useState(false);
  const [activeTourId, setActiveTourId] = useState<string | null>(null);

  // Buchungs-State
  const [buchungsModus, setBuchungsModus] = useState(false);
  const [buchungsTonnen, setBuchungsTonnen] = useState(0);
  const [buchungsSaving, setBuchungsSaving] = useState(false);

  // Neue Tour erstellen State
  const [showNeueTourForm, setShowNeueTourForm] = useState(false);
  const [neueTourName, setNeueTourName] = useState('');
  const [neueTourTyp, setNeueTourTyp] = useState<'motorwagen' | 'mit_haenger'>('motorwagen');

  // Geocoding State
  const [geocodedPositions, setGeocodedPositions] = useState<Map<string, google.maps.LatLngLiteral>>(new Map());
  const [geocodingInProgress, setGeocodingInProgress] = useState(false);
  const geocodeCacheRef = useRef<GeocodeCache>(loadGeocodeCache());

  // Adress-Korrektur Modal State
  const [adressModalOpen, setAdressModalOpen] = useState(false);
  const [adressModalProjekt, setAdressModalProjekt] = useState<Projekt | null>(null);
  const [problemAdressen, setProblemAdressen] = useState<Projekt[]>([]);
  const [showProblemAdressenPanel, setShowProblemAdressenPanel] = useState(false);
  const [hintergrundGeocodingFortschritt, setHintergrundGeocodingFortschritt] = useState<{ done: number; total: number } | null>(null);
  const [showOhneAdressePanel, setShowOhneAdressePanel] = useState(false);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const initialFitDoneRef = useRef(false);

  // === OPTIMIERTES GEOCODING EFFECT (ZERO API COST!) ===
  // Verarbeitet ALLE Projekte SOFORT mit lokaler PLZ-Lookup.
  // Google API wird NUR als Fallback für <1% der Fälle gebraucht.

  useEffect(() => {
    if (!isLoaded) return;

    // PHASE 1: Sofortige lokale Verarbeitung (ZERO COST, <1ms pro Projekt)
    const sofortGeocoded = new Map<string, google.maps.LatLngLiteral>();
    const brauchenGoogleAPI: { id: string; address: string }[] = [];

    for (const projekt of projekte) {
      const id = (projekt as any).$id || projekt.id;

      // Bereits verarbeitet?
      if (geocodedPositions.has(id)) continue;

      const kunde = projekt.kundeId ? kundenMap.get(projekt.kundeId) : undefined;

      // SCHNELL: Lokales Geocoding (existierende Koordinaten ODER PLZ-Lookup)
      const geocodeResult = smartGeocode(projekt, kunde);
      if (geocodeResult) {
        sofortGeocoded.set(id, geocodeResult.position);
      } else {
        // Fallback: Google API wird gebraucht (sehr selten!)
        const address = getAddressForGoogleFallback(projekt, kunde);
        if (address) {
          brauchenGoogleAPI.push({ id, address });
        }
      }
    }

    // SOFORT alle lokal gefundenen Koordinaten setzen
    if (sofortGeocoded.size > 0) {
      setGeocodedPositions(prev => {
        const next = new Map(prev);
        sofortGeocoded.forEach((coords, id) => next.set(id, coords));
        return next;
      });
    }

    // PHASE 2: Google API Fallback (nur für Projekte OHNE PLZ - sehr selten!)
    // Deduplizierung: Gleiche Adressen nur einmal anfragen
    if (brauchenGoogleAPI.length > 0 && !geocodingInProgress) {
      setGeocodingInProgress(true);

      const geocodeFallback = async () => {
        // Deduplizieren nach Adresse
        const uniqueAddresses = new Map<string, string[]>(); // address -> [ids]
        for (const { id, address } of brauchenGoogleAPI) {
          const normalizedAddr = address.toLowerCase().trim();
          if (!uniqueAddresses.has(normalizedAddr)) {
            uniqueAddresses.set(normalizedAddr, []);
          }
          uniqueAddresses.get(normalizedAddr)!.push(id);
        }

        console.log(`[DispoKarte] ${uniqueAddresses.size} einzigartige Adressen brauchen Google API (von ${brauchenGoogleAPI.length} Projekten)`);

        const results = new Map<string, google.maps.LatLngLiteral>();

        // Batch-Verarbeitung mit Rate-Limiting (max 5 parallel)
        const addresses = [...uniqueAddresses.entries()];
        for (let i = 0; i < addresses.length; i += 5) {
          const batch = addresses.slice(i, i + 5);
          await Promise.all(batch.map(async ([address, ids]) => {
            const coords = await geocodeAddressWithGoogleAPI(address, geocodeCacheRef.current);
            if (coords) {
              ids.forEach(id => results.set(id, coords));
            }
          }));
          // Kurze Pause zwischen Batches
          if (i + 5 < addresses.length) {
            await new Promise(r => setTimeout(r, 200));
          }
        }

        if (results.size > 0) {
          setGeocodedPositions(prev => {
            const next = new Map(prev);
            results.forEach((coords, id) => next.set(id, coords));
            return next;
          });
        }

        setGeocodingInProgress(false);
      };

      geocodeFallback();
    }
  }, [isLoaded, projekte, kundenMap]); // Entfernt: geocodedPositions, geocodingInProgress (verhindert Endlosschleife)

  // === DATA PROCESSING ===

  // OPTIMIERT: Nutzt smartGeocode direkt für sofortige Anzeige,
  // geocodedPositions wird nur für Google API Fallback-Ergebnisse gebraucht
  // NEU: Berechnet PLZ-basierte Offsets für gestapelte Marker
  const projekteMitKoordinaten = useMemo(() => {
    const tempResult: Array<{
      projekt: Projekt;
      kunde?: SaisonKunde;
      position: google.maps.LatLngLiteral;
      tonnen: number;
      kw?: number;
      koordinatenQuelle: 'exakt' | 'manuell' | 'plz' | 'unbekannt';
      plz?: string;
    }> = [];

    for (const projekt of projekte) {
      const id = (projekt as any).$id || projekt.id;
      const kunde = projekt.kundeId ? kundenMap.get(projekt.kundeId) : undefined;

      // SCHNELL: Zuerst Cache, dann lokales Geocoding
      const cachedPosition = geocodedPositions.get(id);
      let position: google.maps.LatLngLiteral | undefined;
      let koordinatenQuelle: 'exakt' | 'manuell' | 'plz' | 'unbekannt' = 'unbekannt';
      let plz: string | undefined;

      if (cachedPosition) {
        position = cachedPosition;
        // Koordinatenquelle aus dem Projekt übernehmen
        koordinatenQuelle = (projekt.koordinatenQuelle as 'exakt' | 'manuell' | 'plz') || 'exakt';
        plz = extractPLZFromProjekt(projekt, kunde) || undefined;
      } else {
        const geocodeResult = smartGeocode(projekt, kunde);
        if (geocodeResult) {
          position = geocodeResult.position;
          koordinatenQuelle = geocodeResult.quelle;
          plz = geocodeResult.plz;
        }
      }

      if (!position) continue;

      // Material-Aufschlüsselung für korrekte Tonnenzahl
      const material = parseMaterialAufschluesselung(projekt);

      tempResult.push({
        projekt,
        kunde,
        position,
        tonnen: material.gesamtTonnen,
        kw: projekt.lieferKW || (projekt.geplantesDatum ? getKW(projekt.geplantesDatum) : undefined),
        koordinatenQuelle,
        plz,
      });
    }

    // PHASE 2: PLZ-basierte Offsets für gestapelte Marker berechnen
    // Gruppiere Projekte mit PLZ-Fallback nach ihrer Position (gerundet auf 3 Dezimalstellen)
    const positionGroups = new Map<string, number[]>(); // "lat,lng" -> [indices]

    tempResult.forEach((item, index) => {
      if (item.koordinatenQuelle === 'plz') {
        // Runde auf 3 Dezimalstellen (~100m Genauigkeit) um Cluster zu finden
        const key = `${item.position.lat.toFixed(3)},${item.position.lng.toFixed(3)}`;
        if (!positionGroups.has(key)) {
          positionGroups.set(key, []);
        }
        positionGroups.get(key)!.push(index);
      }
    });

    // Wende Offsets auf gestapelte PLZ-Marker an
    const PLZ_OFFSET_RADIUS = 0.002; // ~200m in Grad
    positionGroups.forEach((indices) => {
      if (indices.length <= 1) return; // Kein Offset nötig für einzelne Marker

      indices.forEach((idx, i) => {
        const item = tempResult[idx];
        // Berechne Position im Kreis um das PLZ-Zentrum
        const angle = (i * 360 / indices.length) * (Math.PI / 180);
        const offsetLat = PLZ_OFFSET_RADIUS * Math.cos(angle);
        const offsetLng = PLZ_OFFSET_RADIUS * Math.sin(angle);

        tempResult[idx] = {
          ...item,
          position: {
            lat: item.position.lat + offsetLat,
            lng: item.position.lng + offsetLng,
          },
        };
      });
    });

    return tempResult;
  }, [projekte, kundenMap, geocodedPositions]);

  const gefilterteProjekte = useMemo(() => {
    return projekteMitKoordinaten.filter((p) => {
      if (filterKW !== null && p.kw !== filterKW) return false;
      if (filterStatus !== null && (p.projekt.dispoStatus || 'offen') !== filterStatus) return false;
      // Vereine-Filter: Wenn Vereine ausgewählt sind, nur diese anzeigen
      if (filterVereine.size > 0) {
        const projektId = (p.projekt as any).$id || p.projekt.id;
        if (!filterVereine.has(projektId)) return false;
      }
      if (sidebarSearch) {
        const s = sidebarSearch.toLowerCase();
        const text = `${p.projekt.kundenname} ${p.projekt.kundenPlzOrt} ${p.projekt.kundennummer || ''} ${p.kunde?.lieferadresse?.ort || ''}`.toLowerCase();
        if (!text.includes(s)) return false;
      }
      return true;
    });
  }, [projekteMitKoordinaten, filterKW, filterStatus, filterVereine, sidebarSearch]);

  // Alle Vereine für Multi-Select Filter (sortiert nach Name, mit Suche)
  const alleVereineFuerFilter = useMemo(() => {
    const vereine = projekteMitKoordinaten.map(p => ({
      id: (p.projekt as any).$id || p.projekt.id,
      name: p.projekt.kundenname,
      ort: p.kunde?.lieferadresse?.ort || p.projekt.kundenPlzOrt?.split(' ').slice(1).join(' ') || '',
      tonnen: p.tonnen,
      kw: p.kw,
    }));

    // Nach Name sortieren
    vereine.sort((a, b) => a.name.localeCompare(b.name, 'de'));

    // Suchfilter anwenden
    if (vereineFilterSearch) {
      const s = vereineFilterSearch.toLowerCase();
      return vereine.filter(v =>
        v.name.toLowerCase().includes(s) ||
        v.ort.toLowerCase().includes(s)
      );
    }

    return vereine;
  }, [projekteMitKoordinaten, vereineFilterSearch]);

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
  const totalStats = useMemo(() => {
    // Zähle PLZ-Fallback Positionen (aus dem Item, nicht vom Projekt-Feld!)
    const plzFallbackAnzahl = gefilterteProjekte.filter(p => p.koordinatenQuelle === 'plz').length;

    return {
      count: gefilterteProjekte.length,
      tonnen: gefilterteProjekte.reduce((s, p) => s + p.tonnen, 0),
      ohneKoordinaten: projekte.length - projekteMitKoordinaten.length,
      plzFallback: plzFallbackAnzahl,
      problemAdressen: problemAdressen.length,
      geocoding: geocodingInProgress,
      hintergrundGeocoding: hintergrundGeocodingFortschritt,
    };
  }, [gefilterteProjekte, projekte.length, projekteMitKoordinaten.length, geocodingInProgress, problemAdressen.length, hintergrundGeocodingFortschritt]);

  // Projekte ohne Koordinaten (werden nicht auf Karte angezeigt)
  const projekteOhneAdresse = useMemo(() => {
    const projektIdsAufKarte = new Set(projekteMitKoordinaten.map(p => (p.projekt as any).$id || p.projekt.id));
    return projekte.filter(p => !projektIdsAufKarte.has((p as any).$id || p.id));
  }, [projekte, projekteMitKoordinaten]);

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
        const statusCount = new Map<DispoStatus, number>();
        items.forEach((i) => {
          const s = (i.projekt.dispoStatus || 'offen') as DispoStatus;
          statusCount.set(s, (statusCount.get(s) || 0) + 1);
        });
        const primaryStatus = [...statusCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
        return { key, position: { lat: avgLat, lng: avgLng }, items, totalTonnen, primaryStatus };
      });
  }, [gefilterteProjekte, zoom]);

  // IDs die in einem Cluster sind
  const clusteredIds = useMemo(() => {
    const set = new Set<string>();
    clusters.forEach((c) => c.items.forEach((i) => set.add((i.projekt as any).$id || i.projekt.id)));
    return set;
  }, [clusters]);

  // Projekte nach KW gruppiert
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
      if (tour.encodedPolyline) {
        return {
          tour, idx,
          path: decodePolyline(tour.encodedPolyline),
          color: TOUR_FARBEN[idx % TOUR_FARBEN.length],
          isReal: true,
          stopPositions: [] as { position: google.maps.LatLngLiteral; stop: typeof tour.stops[0] }[],
        };
      }

      const path: google.maps.LatLngLiteral[] = [WERK_POSITION];
      const stopPositions: { position: google.maps.LatLngLiteral; stop: typeof tour.stops[0] }[] = [];

      tour.stops.forEach((stop) => {
        let position: google.maps.LatLngLiteral | null = null;

        // 1. Stop hat Koordinaten
        if (stop.adresse?.koordinaten) {
          position = { lat: stop.adresse.koordinaten[1], lng: stop.adresse.koordinaten[0] };
        }
        // 2. Projekt finden
        else {
          const projektItem = projekteMitKoordinaten.find(p =>
            ((p.projekt as any).$id || p.projekt.id) === stop.projektId
          );
          if (projektItem) {
            position = projektItem.position;
          }
        }

        if (position) {
          path.push(position);
          stopPositions.push({ position, stop });
        }
      });

      path.push(WERK_POSITION);
      return { tour, idx, path, color: TOUR_FARBEN[idx % TOUR_FARBEN.length], isReal: false, stopPositions };
    });
  }, [touren, showTouren, projekteMitKoordinaten]);

  // === EFFECTS ===

  // Touren laden (ohne abgeschlossene Touren)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingTouren(true);
      try {
        let result: Tour[];
        if (tourenFilterModus === 'alle') {
          result = await tourenService.loadAlleTouren();
        } else {
          result = await tourenService.loadTouren({ datum: tourenDatum });
        }
        // Abgeschlossene Touren nicht auf der Karte anzeigen
        const aktiveTouren = result.filter(t => t.status !== 'abgeschlossen');
        if (!cancelled) setTouren(aktiveTouren);
      } catch { if (!cancelled) setTouren([]); }
      finally { if (!cancelled) setLoadingTouren(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [tourenDatum, tourenFilterModus]);

  // Fit bounds
  const fitBounds = useCallback(() => {
    if (!map || gefilterteProjekte.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(WERK_POSITION);
    gefilterteProjekte.forEach((p) => bounds.extend(p.position));
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: showSidebar ? 400 : 60 });
  }, [map, gefilterteProjekte, showSidebar]);

  // Nur einmal initial fitBounds aufrufen, nicht bei jedem Filter-Wechsel
  useEffect(() => {
    if (map && gefilterteProjekte.length > 0 && !initialFitDoneRef.current) {
      const t = setTimeout(() => {
        fitBounds();
        initialFitDoneRef.current = true;
      }, 300);
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

  // === ADRESS-KORREKTUR HANDLERS ===

  // Öffnet das Modal für ein Projekt
  const openAdressKorrekturModal = useCallback((projekt: Projekt) => {
    setAdressModalProjekt(projekt);
    setAdressModalOpen(true);
  }, []);

  // Speichert Koordinaten für ein Projekt
  const handleSaveKoordinaten = useCallback(async (
    projektId: string,
    koordinaten: [number, number],
    quelle: 'exakt' | 'plz' | 'manuell'
  ) => {
    try {
      const aktualisiertesProjekt = await projektService.updateProjektKoordinaten(projektId, koordinaten, quelle);

      // Aktualisiere die lokalen Positionen
      setGeocodedPositions(prev => {
        const next = new Map(prev);
        next.set(projektId, { lat: koordinaten[1], lng: koordinaten[0] });
        return next;
      });

      // Entferne aus Problem-Adressen
      setProblemAdressen(prev => prev.filter(p => ((p as any).$id || p.id) !== projektId));

      // Callback für Parent-Komponente
      if (onProjektUpdate) {
        onProjektUpdate(aktualisiertesProjekt);
      }

      console.log(`✅ Koordinaten für ${projektId} gespeichert:`, koordinaten, quelle);
    } catch (error) {
      console.error('Fehler beim Speichern der Koordinaten:', error);
      throw error;
    }
  }, [onProjektUpdate]);

  // ALLE Projekte neu geocoden (für Migration von alten PLZ-Koordinaten)
  const [reGeocodingInProgress, setReGeocodingInProgress] = useState(false);

  const reGeocodeAlleProjekte = useCallback(async () => {
    if (reGeocodingInProgress) return;

    // Finde alle Projekte mit vollständiger Adresse (inkl. Kunde!)
    const mitAdresse = projekte.filter(p => {
      const kunde = p.kundeId ? kundenMap.get(p.kundeId) : undefined;
      const adresse = extrahiereAdresse(p, kunde);
      return adresse && adresse.strasse && adresse.plz;
    });

    if (mitAdresse.length === 0) {
      alert('Keine Projekte mit Adresse gefunden!');
      return;
    }

    const bestaetigt = window.confirm(
      `ALLE ${mitAdresse.length} Projekte neu geocoden?\n\n` +
      `Dies überschreibt alle bestehenden Koordinaten mit neuen Google-Geocoding-Ergebnissen.\n\n` +
      `Fortfahren?`
    );

    if (!bestaetigt) return;

    setReGeocodingInProgress(true);
    setHintergrundGeocodingFortschritt({ done: 0, total: mitAdresse.length });

    try {
      // Bereite Batch vor (mit Lieferadresse vom Kunden!)
      const adressen = mitAdresse
        .map(p => {
          const kunde = p.kundeId ? kundenMap.get(p.kundeId) : undefined;
          const adresse = extrahiereAdresse(p, kunde);
          if (!adresse) return null;
          return {
            id: (p as any).$id || p.id,
            strasse: adresse.strasse,
            plz: adresse.plz,
            ort: adresse.ort,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);

      console.log(`🔄 Re-Geocoding: Starte für ${adressen.length} Projekte...`);
      const startTime = Date.now();

      // Google Batch-Geocoding
      const googleErgebnisse = await geocodeBatchMitGoogle(adressen);

      const endTime = Date.now();
      console.log(`✅ Re-Geocoding API fertig in ${((endTime - startTime) / 1000).toFixed(1)}s`);

      // Speichere alle Ergebnisse
      let erfolgreich = 0;
      let probleme = 0;
      const projektMap = new Map(mitAdresse.map(p => [(p as any).$id || p.id, p]));

      for (const [projektId, result] of googleErgebnisse) {
        const projekt = projektMap.get(projektId);
        if (!projekt) continue;

        try {
          // Speichere in Appwrite (auch niedrige Confidence - besser als PLZ!)
          const quelle = result.confidence === 'hoch' || result.confidence === 'mittel' ? 'exakt' : 'plz';
          await projektService.updateProjektKoordinaten(projektId, result.koordinaten, quelle);

          // Update lokalen State
          setGeocodedPositions(prev => {
            const next = new Map(prev);
            next.set(projektId, { lat: result.koordinaten[1], lng: result.koordinaten[0] });
            return next;
          });

          erfolgreich++;
          console.log(`✅ ${projekt.kundenname}: ${result.formattedAddress} (${result.confidence})`);
        } catch (saveError) {
          console.warn(`Speicherfehler für ${projekt.kundenname}:`, saveError);
          probleme++;
        }

        setHintergrundGeocodingFortschritt({
          done: erfolgreich + probleme,
          total: adressen.length
        });
      }

      console.log(`📊 Re-Geocoding fertig: ${erfolgreich} erfolgreich, ${probleme} Fehler`);
      alert(`Re-Geocoding abgeschlossen!\n\n${erfolgreich} Projekte aktualisiert\n${probleme} Fehler\n\nBitte Seite neu laden um die neuen Positionen zu sehen.`);

    } catch (error) {
      console.error('Re-Geocoding Fehler:', error);
      alert('Fehler beim Re-Geocoding: ' + (error as Error).message);
    } finally {
      setReGeocodingInProgress(false);
      setHintergrundGeocodingFortschritt(null);
    }
  }, [projekte, kundenMap, reGeocodingInProgress]);

  // Hintergrund-Geocoding für Projekte ohne exakte Koordinaten
  // Verwendet Google Geocoding API (schnell, parallel, genau)
  useEffect(() => {
    if (!isLoaded) return;

    // DEBUG: Analysiere alle Projekte
    console.log('📊 Projekt-Analyse:');
    let mitExaktenKoords = 0;
    let mitLieferadresse = 0;
    let mitKundenstrasse = 0;
    let ohneAdresse = 0;

    projekte.forEach(p => {
      if (p.koordinatenQuelle === 'exakt' || p.koordinatenQuelle === 'manuell') {
        mitExaktenKoords++;
      }
      if (p.lieferadresse?.strasse) {
        mitLieferadresse++;
      }
      if (p.kundenstrasse) {
        mitKundenstrasse++;
      }
      const kunde = p.kundeId ? kundenMap.get(p.kundeId) : undefined;
      const adresse = extrahiereAdresse(p, kunde);
      if (!adresse || !adresse.strasse) {
        ohneAdresse++;
        console.log(`⚠️ Keine vollständige Adresse für ${p.kundenname}:`, {
          projektLieferadresse: p.lieferadresse,
          kundenLieferadresse: kunde?.lieferadresse,
          kundenstrasse: p.kundenstrasse,
          kundenPlzOrt: p.kundenPlzOrt
        });
      }
    });

    console.log(`📊 Zusammenfassung: ${projekte.length} Projekte total`);
    console.log(`   - ${mitExaktenKoords} mit exakten Koordinaten`);
    console.log(`   - ${mitLieferadresse} mit Lieferadresse.strasse`);
    console.log(`   - ${mitKundenstrasse} mit kundenstrasse`);
    console.log(`   - ${ohneAdresse} ohne vollständige Adresse (werden übersprungen)`);

    // Finde Projekte ohne Koordinaten oder mit PLZ-Fallback
    const zuGeocoden = projekte.filter(p => {
      // Bereits exakt? -> überspringen
      if (p.koordinatenQuelle === 'exakt' || p.koordinatenQuelle === 'manuell') return false;
      // Hat keine Lieferadresse? -> überspringen (Kunde berücksichtigen!)
      const kunde = p.kundeId ? kundenMap.get(p.kundeId) : undefined;
      const adresse = extrahiereAdresse(p, kunde);
      if (!adresse || !adresse.strasse) return false;
      return true;
    });

    console.log(`🎯 ${zuGeocoden.length} Projekte zum Geocoden`);

    if (zuGeocoden.length === 0) return;

    // Starte Hintergrund-Geocoding mit Google API (SCHNELL!)
    const geocodeImHintergrund = async () => {
      setHintergrundGeocodingFortschritt({ done: 0, total: zuGeocoden.length });
      const neueProbleme: Projekt[] = [];
      const projektMap = new Map(zuGeocoden.map(p => [(p as any).$id || p.id, p]));

      // Bereite Batch für Google Geocoding vor (Kunde-Lieferadresse!)
      const adressen = zuGeocoden
        .map(p => {
          const kunde = p.kundeId ? kundenMap.get(p.kundeId) : undefined;
          const adresse = extrahiereAdresse(p, kunde);
          if (!adresse) return null;
          return {
            id: (p as any).$id || p.id,
            strasse: adresse.strasse,
            plz: adresse.plz,
            ort: adresse.ort,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);

      console.log(`🚀 Starte Google Batch-Geocoding für ${adressen.length} Adressen...`);
      const startTime = Date.now();

      try {
        // Google Batch-Geocoding (parallelisiert, ~10 gleichzeitig)
        const googleErgebnisse = await geocodeBatchMitGoogle(adressen);

        const endTime = Date.now();
        console.log(`✅ Google Batch-Geocoding fertig in ${((endTime - startTime) / 1000).toFixed(1)}s`);

        // Verarbeite Ergebnisse
        let erfolgreich = 0;
        let probleme = 0;

        for (const [projektId, result] of googleErgebnisse) {
          const projekt = projektMap.get(projektId);
          if (!projekt) continue;

          if (result.confidence === 'hoch' || result.confidence === 'mittel') {
            // Gute Confidence -> automatisch speichern
            try {
              await projektService.updateProjektKoordinaten(projektId, result.koordinaten, 'exakt');

              setGeocodedPositions(prev => {
                const next = new Map(prev);
                next.set(projektId, { lat: result.koordinaten[1], lng: result.koordinaten[0] });
                return next;
              });

              erfolgreich++;
              console.log(`✅ ${projekt.kundenname}: ${result.formattedAddress} (${result.confidence})`);
            } catch (saveError) {
              console.warn(`Speicherfehler für ${projekt.kundenname}:`, saveError);
              neueProbleme.push(projekt);
              probleme++;
            }
          } else {
            // Niedrige Confidence -> Problem-Liste
            neueProbleme.push(projekt);
            probleme++;
            console.log(`⚠️ ${projekt.kundenname}: Nur ${result.confidence} Confidence`);
          }

          setHintergrundGeocodingFortschritt({
            done: erfolgreich + probleme,
            total: adressen.length
          });
        }

        // Projekte die Google nicht gefunden hat
        for (const adresse of adressen) {
          if (!googleErgebnisse.has(adresse.id)) {
            const projekt = projektMap.get(adresse.id);
            if (projekt) {
              neueProbleme.push(projekt);
              probleme++;
              console.log(`❌ ${projekt.kundenname}: Keine Google-Ergebnisse`);
            }
          }
        }

        console.log(`📊 Geocoding-Zusammenfassung: ${erfolgreich} erfolgreich, ${probleme} Probleme`);

      } catch (error) {
        console.error('Google Batch-Geocoding Fehler:', error);
        // Bei komplettem Fehler: Alle als Problem markieren
        zuGeocoden.forEach(p => neueProbleme.push(p));
      }

      setProblemAdressen(prev => [...prev, ...neueProbleme]);
      setHintergrundGeocodingFortschritt(null);
    };

    // Kurze Verzögerung damit Google Maps API sicher geladen ist
    const timeoutId = setTimeout(geocodeImHintergrund, 1000);
    return () => clearTimeout(timeoutId);
  }, [isLoaded, projekte, kundenMap]); // Reagiert auf Projekte- und Kunden-Änderungen

  // === RENDER ===

  if (loadError) {
    console.error('Google Maps Load Error:', loadError);
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
        <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Google Maps nicht verfügbar</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">API Key in .env hinterlegen:</p>
        <code className="px-4 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm">VITE_GOOGLE_MAPS_API_KEY=...</code>
        <p className="text-red-500 mt-4 text-sm">Fehler: {loadError.message}</p>
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

  // FIXED HEIGHT CONTAINER - Karte soll nicht mit Inhalt wachsen!
  const containerHeight = isFullscreen ? '100vh' : 'calc(100vh - 180px)';
  const minContainerHeight = '600px';

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : ''
      }`}
      style={{
        height: containerHeight,
        minHeight: minContainerHeight,
        maxHeight: isFullscreen ? '100vh' : 'calc(100vh - 120px)',
      }}
    >

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
                <span className="text-amber-500 flex items-center gap-1">
                  {totalStats.geocoding && <Loader2 className="w-3 h-3 animate-spin" />}
                  {totalStats.ohneKoordinaten} ohne Position
                </span>
              )}
              {totalStats.hintergrundGeocoding && (
                <span className="text-blue-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Prüfe Adressen ({totalStats.hintergrundGeocoding.done}/{totalStats.hintergrundGeocoding.total})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Problem-Adressen Button */}
        {totalStats.problemAdressen > 0 && (
          <button
            onClick={() => setShowProblemAdressenPanel(!showProblemAdressenPanel)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              showProblemAdressenPanel
                ? 'bg-amber-500 text-white'
                : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            {totalStats.problemAdressen} Adressen prüfen
          </button>
        )}

        {/* Re-Geocoding Button (Admin-Funktion) */}
        <button
          onClick={reGeocodeAlleProjekte}
          disabled={reGeocodingInProgress}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-purple-100 text-purple-800 hover:bg-purple-200 disabled:opacity-50"
          title="Alle Adressen neu mit Google geocoden"
        >
          {reGeocodingInProgress ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
          Alle neu geocoden
        </button>

        {/* Touren Steuerung */}
        <div className="flex items-center gap-2 border-l border-gray-200 dark:border-slate-700 pl-4">
          <Route className="w-4 h-4 text-purple-500" />

          <div className="flex items-center bg-gray-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setTourenFilterModus('alle')}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                tourenFilterModus === 'alle'
                  ? 'bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-300 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Alle
            </button>
            <button
              onClick={() => setTourenFilterModus('datum')}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                tourenFilterModus === 'datum'
                  ? 'bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-300 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Datum
            </button>
          </div>

          {tourenFilterModus === 'datum' && (
            <input
              type="date"
              value={tourenDatum}
              onChange={(e) => setTourenDatum(e.target.value)}
              className="px-2 py-1 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs text-gray-700 dark:text-gray-300 w-[130px]"
            />
          )}

          <button
            onClick={() => setShowTouren(!showTouren)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              showTouren
                ? 'bg-purple-500 text-white shadow-md'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
            title={showTouren ? 'Touren ausblenden' : 'Touren einblenden'}
          >
            <Route className="w-4 h-4" />
            {showTouren ? 'Touren ausblenden' : `Touren anzeigen${touren.length > 0 ? ` (${touren.length})` : ''}`}
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

      {/* ===== MAIN CONTENT - Feste Höhe, kein Wachsen! ===== */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ===== SIDEBAR - Feste Breite, intern scrollbar ===== */}
        {showSidebar && (
          <div
            className="w-[360px] border-r border-gray-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-900 flex-shrink-0 overflow-hidden"
            ref={sidebarRef}
          >

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
                        isActive ? 'text-white shadow-sm' : 'hover:opacity-80'
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
                {(filterKW !== null || filterStatus !== null || filterVereine.size > 0) && (
                  <button
                    onClick={() => { setFilterKW(null); setFilterStatus(null); setFilterVereine(new Set()); setSidebarSearch(''); }}
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

            {/* Vereine Multi-Select Filter */}
            <div className="border-b border-gray-100 dark:border-slate-800">
              <button
                onClick={() => setShowVereineFilter(!showVereineFilter)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Vereine auswählen
                  </span>
                  {filterVereine.size > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">
                      {filterVereine.size}
                    </span>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showVereineFilter ? 'rotate-90' : ''}`} />
              </button>

              {showVereineFilter && (
                <div className="px-3 pb-2">
                  {/* Such-Input für Vereine */}
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Verein suchen..."
                      value={vereineFilterSearch}
                      onChange={(e) => setVereineFilterSearch(e.target.value)}
                      className="w-full pl-7 pr-7 py-1 border border-gray-200 dark:border-slate-700 rounded text-xs bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    {vereineFilterSearch && (
                      <button onClick={() => setVereineFilterSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Alle auswählen / Auswahl aufheben */}
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => {
                        const allIds = alleVereineFuerFilter.map(v => v.id);
                        setFilterVereine(new Set(allIds));
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                    >
                      Alle ({alleVereineFuerFilter.length})
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <button
                      onClick={() => setFilterVereine(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    >
                      Keine
                    </button>
                  </div>

                  {/* Vereinsliste mit Checkboxen */}
                  <div className="max-h-48 overflow-y-auto space-y-0.5 scrollbar-thin">
                    {alleVereineFuerFilter.map(v => (
                      <label
                        key={v.id}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={filterVereine.has(v.id)}
                          onChange={(e) => {
                            const newSet = new Set(filterVereine);
                            if (e.target.checked) {
                              newSet.add(v.id);
                            } else {
                              newSet.delete(v.id);
                            }
                            setFilterVereine(newSet);
                          }}
                          className="w-3.5 h-3.5 text-red-600 border-gray-300 rounded focus:ring-red-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                            {v.name}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                            {v.ort} · {v.tonnen.toFixed(0)}t {v.kw ? `· KW${v.kw}` : ''}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Project List - SCROLLABLE, füllt restlichen Platz */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {projekteNachKW.map(([kw, items]) => (
                <div key={String(kw)}>
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
                            <div className="mt-1.5 flex-shrink-0">
                              <div
                                className={`w-2.5 h-2.5 rounded-full ${status === 'offen' ? 'animate-pulse' : ''}`}
                                style={{ backgroundColor: STATUS_FARBEN[status].hex }}
                              />
                            </div>
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
              <div className="border-t border-gray-200 dark:border-slate-700 max-h-[250px] overflow-y-auto flex-shrink-0">
                <div className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 sticky top-0 z-10">
                  <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Route className="w-3 h-3" />
                    Touren ({touren.length})
                    {loadingTouren && <Loader2 className="w-3 h-3 animate-spin" />}
                  </span>
                </div>
                {tourPolylines.map(({ tour, color, idx, stopPositions }) => {
                  const geladenTonnen = tour.stops.reduce((sum, s) => sum + (s.tonnen || 0), 0);
                  const gesamtKapazitaet = tour.kapazitaet?.gesamtTonnen || 24;
                  const auslastung = gesamtKapazitaet > 0 ? (geladenTonnen / gesamtKapazitaet) * 100 : 0;
                  const istUeberladen = geladenTonnen > gesamtKapazitaet;

                  return (
                    <div
                      key={tour.id || idx}
                      className={`mx-2 my-1 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                        activeTourId === tour.id
                          ? 'border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/30 shadow-sm'
                          : 'border-transparent hover:border-gray-200 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/30'
                      }`}
                      onClick={() => {
                        setActiveTourId(activeTourId === tour.id ? null : tour.id);
                        if (map && stopPositions && stopPositions.length > 0) {
                          const bounds = new google.maps.LatLngBounds();
                          bounds.extend(WERK_POSITION);
                          stopPositions.forEach(({ position }) => bounds.extend(position));
                          map.fitBounds(bounds, 80);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 border-2 border-white shadow" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{tour.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                              tour.lkwTyp === 'mit_haenger'
                                ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300'
                                : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300'
                            }`}>
                              {tour.lkwTyp === 'mit_haenger' ? 'HNG' : 'MW'}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5">
                            <span>{tour.stops.length} Stops</span>
                            <span className={istUeberladen ? 'text-red-600 font-bold' : ''}>
                              {geladenTonnen.toFixed(1)}t / {gesamtKapazitaet}t
                            </span>
                            {tour.datum && <span>{new Date(tour.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>}
                          </div>
                          <div className="h-1.5 bg-gray-200 dark:bg-slate-600 rounded-full mt-1 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                istUeberladen ? 'bg-red-500' : auslastung > 80 ? 'bg-orange-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(auslastung, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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

        {/* ===== MAP - Füllt restlichen Platz ===== */}
        <div className="flex-1 relative overflow-hidden min-h-0">
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
              if (clusteredIds.has(id)) return null;

              const status = (item.projekt.dispoStatus || 'offen') as DispoStatus;
              const size = getMarkerSize(item.tonnen);
              const isActive = selectedId === id;
              const isHover = hoveredId === id;
              const istGeliefert = status === 'geliefert';

              // NEU: Prüfe Koordinaten-Quelle direkt aus dem Item
              const istPLZFallback = item.koordinatenQuelle === 'plz';

              // Marker-Farbe basierend auf Belieferungsart (simpel)
              const belieferungsart = item.projekt.belieferungsart;
              const markerFarbe = belieferungsart && BELIEFERUNGSART_FARBEN[belieferungsart]
                ? BELIEFERUNGSART_FARBEN[belieferungsart]
                : BELIEFERUNGSART_FARBEN.default;

              // Platzbauer-Projekt Flag
              const istPlatzbauerprojekt = item.projekt.istPlatzbauerprojekt === true;

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
                    <div className={`relative transition-all duration-150 ${isActive || isHover ? 'z-50 -translate-y-2' : 'z-10'}`}>
                      {/* Platzbauer-Badge oben links */}
                      {istPlatzbauerprojekt && (
                        <div
                          className="absolute -top-1 -left-1 z-10 w-4 h-4 bg-orange-400 rounded-full border border-white shadow flex items-center justify-center"
                          title="Platzbauer-Projekt"
                        >
                          <Users className="w-2.5 h-2.5 text-orange-900" />
                        </div>
                      )}

                      {/* PLZ-Fallback Badge mit Tilde (~) */}
                      {istPLZFallback && (
                        <div
                          className="absolute -top-1 -right-1 z-10 w-4 h-4 bg-amber-400 rounded-full border border-white shadow flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAdressKorrekturModal(item.projekt);
                          }}
                          title={`Position basiert auf PLZ-Zentrum${item.plz ? ` (${item.plz})` : ''} - Klicken zum Korrigieren`}
                        >
                          <span className="text-[10px] font-bold text-amber-900">~</span>
                        </div>
                      )}

                      {/* Marker */}
                      <div
                        className={`rounded-xl flex items-center justify-center border-2 ${
                          istPlatzbauerprojekt
                            ? 'border-orange-400'
                            : istPLZFallback
                            ? 'border-amber-400'
                            : 'border-white'
                        } ${status === 'offen' && !isActive ? 'animate-pulse' : ''}`}
                        style={{
                          width: size,
                          height: size,
                          backgroundColor: istGeliefert ? '#22c55e' : markerFarbe.hex,
                          opacity: istPLZFallback ? 0.7 : 1, // NEU: Reduzierte Opacity für PLZ-Fallback
                          boxShadow: isActive
                            ? `0 0 0 3px ${markerFarbe.hex}50, 0 8px 25px rgba(0,0,0,0.3)`
                            : isHover
                            ? `0 4px 15px rgba(0,0,0,0.25)`
                            : istPlatzbauerprojekt
                            ? '0 2px 8px rgba(251, 146, 60, 0.5)'
                            : istPLZFallback
                            ? '0 2px 8px rgba(251, 191, 36, 0.4)'
                            : '0 2px 8px rgba(0,0,0,0.2)',
                          transform: isActive ? 'scale(1.2)' : isHover ? 'scale(1.1)' : 'scale(1)',
                          transition: 'all 150ms ease',
                        }}
                      >
                        {istGeliefert ? (
                          // Großer Haken für geliefert
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : istPlatzbauerprojekt ? (
                          // Platzbauer-Icon: Personen-Symbol + Tonnage
                          <div className="flex flex-col items-center">
                            <Users className="w-3 h-3 text-white" />
                            {item.tonnen > 0 && (
                              <span className="text-white font-bold text-[8px] leading-none select-none">
                                {Math.round(item.tonnen)}t
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-white font-bold text-[11px] leading-none select-none drop-shadow-sm">
                            {item.tonnen > 0 ? `${Math.round(item.tonnen)}t` : '?'}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-center -mt-[1px]">
                        <div style={{
                          width: 0, height: 0,
                          borderLeft: '6px solid transparent',
                          borderRight: '6px solid transparent',
                          borderTop: `6px solid ${istGeliefert ? '#22c55e' : markerFarbe.hex}`,
                          filter: isActive ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.2))' : undefined,
                        }} />
                      </div>

                      {showLabels && !isHover && !isActive && (
                        <div className="absolute left-1/2 -translate-x-1/2 mt-0.5 whitespace-nowrap pointer-events-none">
                          <div className="text-[10px] font-semibold text-gray-700 dark:text-gray-200 bg-white/90 dark:bg-slate-900/90 px-1.5 py-0.5 rounded shadow-sm text-center truncate max-w-[110px]">
                            {item.projekt.kundenname}
                          </div>
                        </div>
                      )}

                      {isHover && !isActive && (
                        <div className="absolute left-1/2 -translate-x-1/2 mt-1 pointer-events-none z-50">
                          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-600 p-2.5 min-w-[180px]">
                            <div className="font-bold text-sm text-gray-900 dark:text-white">{item.projekt.kundenname}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">{item.projekt.kundenPlzOrt}</div>
                            <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                              <span
                                className="text-xs px-1.5 py-0.5 rounded-full text-white font-medium"
                                style={{ backgroundColor: markerFarbe.hex }}
                              >
                                {markerFarbe.label}
                              </span>
                              {istGeliefert && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500 text-white font-medium">
                                  Geliefert
                                </span>
                              )}
                              {istPlatzbauerprojekt && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-400 text-orange-900 font-medium">
                                  Platzbauer
                                </span>
                              )}
                              {istPLZFallback && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-900 font-medium">
                                  PLZ-Position
                                </span>
                              )}
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
            {showTouren && tourPolylines.map(({ tour, color, idx, stopPositions }) => {
              if (activeTourId !== null && activeTourId !== tour.id) return null;

              if (stopPositions && stopPositions.length > 0) {
                return stopPositions.map(({ position, stop }, stopIdx) => (
                  <OverlayViewF
                    key={`stop-${tour.id || idx}-${stopIdx}`}
                    position={position}
                    mapPaneName={OVERLAY_MOUSE_TARGET}
                    getPixelPositionOffset={() => ({ x: -12, y: -12 })}
                  >
                    <div
                      className="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      title={`Stop ${stopIdx + 1}: ${stop.kundenname} (${stop.tonnen}t)`}
                      onClick={() => setActiveTourId(tour.id)}
                    >
                      <span className="text-white text-[10px] font-bold">{stopIdx + 1}</span>
                    </div>
                  </OverlayViewF>
                ));
              }

              return tour.stops.map((stop, stopIdx) => {
                const pos = stop.adresse?.koordinaten
                  ? { lat: stop.adresse.koordinaten[1], lng: stop.adresse.koordinaten[0] }
                  : null;
                if (!pos) return null;
                return (
                  <OverlayViewF
                    key={`stop-${tour.id || idx}-${stopIdx}`}
                    position={pos}
                    mapPaneName={OVERLAY_MOUSE_TARGET}
                    getPixelPositionOffset={() => ({ x: -12, y: -12 })}
                  >
                    <div
                      className="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      title={`Stop ${stopIdx + 1}: ${stop.kundenname} (${stop.tonnen}t)`}
                      onClick={() => setActiveTourId(tour.id)}
                    >
                      <span className="text-white text-[10px] font-bold">{stopIdx + 1}</span>
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
                          {selectedItem.projekt.belieferungsart === 'nur_motorwagen' && 'Motorwagen'}
                          {selectedItem.projekt.belieferungsart === 'mit_haenger' && 'Hänger'}
                          {selectedItem.projekt.belieferungsart === 'abholung_ab_werk' && 'Abholung'}
                          {selectedItem.projekt.belieferungsart === 'palette_mit_ladekran' && 'Ladekran'}
                          {selectedItem.projekt.belieferungsart === 'bigbag' && 'BigBag'}
                        </span>
                      )}
                    </div>

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

                    {selectedItem.kunde?.anfahrtshinweise && (
                      <div className="flex items-start gap-2.5 p-2 bg-amber-50 rounded-lg">
                        <Truck className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-amber-800">{selectedItem.kunde.anfahrtshinweise}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-3">
                    {onProjektClick && (
                      <>
                        <button
                          onClick={() => onProjektClick(selectedItem.projekt, false)}
                          className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Eye className="w-4 h-4" />
                          Details
                        </button>
                        <button
                          onClick={() => onProjektClick(selectedItem.projekt, true)}
                          className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-all flex items-center justify-center gap-1.5"
                          title="In neuem Tab öffnen"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {onBuchen && selectedItem.projekt.dispoStatus !== 'geliefert' && (
                      <button
                        onClick={() => {
                          setBuchungsModus(true);
                          setBuchungsTonnen(selectedItem.tonnen || selectedItem.projekt.liefergewicht || 0);
                        }}
                        className="flex-1 px-3 py-2 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg text-sm font-semibold hover:from-green-700 hover:to-green-600 transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <Truck className="w-4 h-4" />
                        Auf Tour buchen
                      </button>
                    )}
                  </div>

                  {/* Buchungs-Panel */}
                  {buchungsModus && onBuchen && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-green-800">Tour auswählen</span>
                        <button
                          onClick={() => setBuchungsModus(false)}
                          className="text-green-600 hover:text-green-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Tonnen-Eingabe */}
                      <div className="mb-3">
                        <label className="text-xs text-green-700 mb-1 block">Tonnen</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={buchungsTonnen}
                          onChange={(e) => setBuchungsTonnen(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-1.5 border border-green-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </div>

                      {/* Neue Tour erstellen Formular */}
                      {showNeueTourForm && onNeueTour ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={neueTourName}
                            onChange={(e) => setNeueTourName(e.target.value)}
                            placeholder="Tour-Name (z.B. Tour 1)"
                            className="w-full px-3 py-1.5 border border-green-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setNeueTourTyp('motorwagen')}
                              className={`flex-1 p-2 rounded-lg text-xs font-medium border transition-all ${
                                neueTourTyp === 'motorwagen'
                                  ? 'bg-red-100 border-red-300 text-red-700'
                                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              🚛 Motorwagen (14t)
                            </button>
                            <button
                              type="button"
                              onClick={() => setNeueTourTyp('mit_haenger')}
                              className={`flex-1 p-2 rounded-lg text-xs font-medium border transition-all ${
                                neueTourTyp === 'mit_haenger'
                                  ? 'bg-green-100 border-green-300 text-green-700'
                                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              🚛+ Mit Hänger (24t)
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowNeueTourForm(false);
                                setNeueTourName('');
                              }}
                              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                            >
                              Abbrechen
                            </button>
                            <button
                              onClick={async () => {
                                if (!neueTourName.trim() || buchungsTonnen <= 0) return;
                                setBuchungsSaving(true);
                                try {
                                  const kapazitaet = neueTourTyp === 'mit_haenger' ? 24 : 14;
                                  const neueTourId = await onNeueTour(neueTourName.trim(), neueTourTyp, kapazitaet);
                                  const projektId = (selectedItem.projekt as any).$id || selectedItem.projekt.id;
                                  await onBuchen!(projektId, neueTourId, buchungsTonnen);

                                  // SMOOTH: Optimistisches lokales Update statt Reload
                                  const neueTour = await tourenService.loadTour(neueTourId);
                                  setTouren(prev => {
                                    const exists = prev.some(t => t.id === neueTourId);
                                    return exists
                                      ? prev.map(t => t.id === neueTourId ? neueTour : t)
                                      : [...prev, neueTour];
                                  });

                                  setBuchungsModus(false);
                                  setShowNeueTourForm(false);
                                  setNeueTourName('');
                                  setSelectedId(null);
                                } catch (err) {
                                  console.error('Fehler:', err);
                                } finally {
                                  setBuchungsSaving(false);
                                }
                              }}
                              disabled={buchungsSaving || !neueTourName.trim() || buchungsTonnen <= 0}
                              className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                              {buchungsSaving ? 'Erstelle...' : 'Erstellen & Buchen'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Neue Tour Button */}
                          {onNeueTour && (
                            <button
                              onClick={() => setShowNeueTourForm(true)}
                              className="w-full mb-2 p-2 border-2 border-dashed border-green-300 rounded-lg text-sm font-medium text-green-600 hover:bg-green-50 hover:border-green-400 transition-all flex items-center justify-center gap-1.5"
                            >
                              <Plus className="w-4 h-4" />
                              Neue Tour erstellen
                            </button>
                          )}

                          {/* Tour-Liste */}
                          <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                            {touren.length === 0 && !onNeueTour ? (
                              <div className="text-center py-3 text-sm text-gray-500">
                                Keine Touren vorhanden
                              </div>
                            ) : (
                              touren.map(tour => {
                                const beladung = tourenService.berechneBeladung(tour);
                                const nachBuchung = beladung.geladenTonnen + buchungsTonnen;
                                const wirdUeberladen = nachBuchung > tour.kapazitaet.gesamtTonnen;

                                return (
                                  <button
                                    key={tour.id}
                                    onClick={async () => {
                                      if (buchungsTonnen <= 0) return;
                                      setBuchungsSaving(true);
                                      try {
                                        const projektId = (selectedItem.projekt as any).$id || selectedItem.projekt.id;
                                        await onBuchen!(projektId, tour.id, buchungsTonnen);

                                        // SMOOTH: Optimistisches lokales Update - nur diese Tour aktualisieren
                                        const updatedTour = await tourenService.loadTour(tour.id);
                                        setTouren(prev => prev.map(t => t.id === tour.id ? updatedTour : t));

                                        setBuchungsModus(false);
                                        setSelectedId(null);
                                      } catch (err) {
                                        console.error('Fehler beim Buchen:', err);
                                      } finally {
                                        setBuchungsSaving(false);
                                      }
                                    }}
                                    disabled={buchungsSaving || buchungsTonnen <= 0}
                                    className={`w-full p-2 rounded-lg text-left transition-all ${
                                      wirdUeberladen
                                        ? 'bg-red-50 border border-red-200 hover:bg-red-100'
                                        : 'bg-white border border-green-200 hover:bg-green-100'
                                    } ${buchungsSaving ? 'opacity-50' : ''}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium text-sm text-gray-800">
                                        {tour.lkwTyp === 'mit_haenger' ? '🚛+' : '🚛'} {tour.name}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {beladung.geladenTonnen.toFixed(1)}t / {tour.kapazitaet.gesamtTonnen}t
                                      </span>
                                    </div>
                                    <div className="h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${wirdUeberladen ? 'bg-red-500' : 'bg-green-500'}`}
                                        style={{ width: `${Math.min(beladung.auslastungProzent, 100)}%` }}
                                      />
                                    </div>
                                    {wirdUeberladen && (
                                      <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Überladen (+{(nachBuchung - tour.kapazitaet.gesamtTonnen).toFixed(1)}t)
                                      </div>
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </InfoWindowF>
            )}
          </GoogleMap>

          {/* Zoom Hint */}
          <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 shadow-lg">
            <span className="font-medium">Ctrl + Scroll</span> zum Zoomen
          </div>

          {/* Map Zoom Controls */}
          <div className="absolute top-14 right-4 z-10 flex flex-col gap-1">
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
          {(loadingTouren || geocodingInProgress) && (
            <div className="absolute top-14 left-4 z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center gap-2 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                {geocodingInProgress ? 'Adressen werden geocoded...' : 'Touren laden...'}
              </span>
            </div>
          )}

          {/* Banner: Projekte ohne gültige Adresse */}
          {projekteOhneAdresse.length > 0 && (
            <button
              onClick={() => setShowOhneAdressePanel(!showOhneAdressePanel)}
              className={`absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg transition-all ${
                showOhneAdressePanel
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">{projekteOhneAdresse.length} ohne gültige Adresse</span>
            </button>
          )}

          {/* Panel: Projekte ohne gültige Adresse */}
          {showOhneAdressePanel && projekteOhneAdresse.length > 0 && (
            <div className="absolute bottom-16 left-4 z-20 w-80 max-h-64 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700">
              <div className="sticky top-0 bg-white dark:bg-slate-800 px-3 py-2 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Projekte ohne gültige Adresse</span>
                <button
                  onClick={() => setShowOhneAdressePanel(false)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {projekteOhneAdresse.map((projekt) => (
                  <div
                    key={(projekt as any).$id || projekt.id}
                    className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
                    onClick={() => {
                      openAdressKorrekturModal(projekt);
                      setShowOhneAdressePanel(false);
                    }}
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {projekt.kundenname}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {projekt.lieferadresse?.strasse || projekt.kundenstrasse || 'Keine Straße'} · {projekt.lieferadresse?.plz || ''} {projekt.lieferadresse?.ort || projekt.kundenPlzOrt || 'Kein Ort'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 right-4 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 px-3 py-2">
            <div className="flex items-center gap-4">
              {/* Belieferungsart-Farben */}
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-[10px] text-gray-600 dark:text-gray-400">Motorwagen</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-[10px] text-gray-600 dark:text-gray-400">Hänger</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-[10px] text-gray-600 dark:text-gray-400">Nicht def.</span>
              </div>
              <div className="border-l border-gray-200 dark:border-slate-700 pl-3 flex items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-[10px] text-gray-600 dark:text-gray-400">Geliefert</span>
              </div>
              {/* Warnsymbol für ungenaue Position */}
              <div className="border-l border-gray-200 dark:border-slate-700 pl-3 flex items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-amber-900">!</span>
                </div>
                <span className="text-[10px] text-gray-600 dark:text-gray-400">Position ungenau</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Problem-Adressen Panel (Overlay) */}
      {showProblemAdressenPanel && problemAdressen.length > 0 && (
        <div className="absolute top-16 right-4 z-30 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-96 max-h-[60vh] overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-amber-800 dark:text-amber-200">
                {problemAdressen.length} Adressen prüfen
              </span>
            </div>
            <button
              onClick={() => setShowProblemAdressenPanel(false)}
              className="p-1 hover:bg-amber-200 dark:hover:bg-amber-800 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-amber-700 dark:text-amber-300" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-gray-100 dark:divide-slate-700">
            {problemAdressen.map((projekt) => {
              const projektId = (projekt as any).$id || projekt.id;
              return (
                <div
                  key={projektId}
                  className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                  onClick={() => openAdressKorrekturModal(projekt)}
                >
                  <div className="font-medium text-gray-900 dark:text-white text-sm">
                    {projekt.kundenname}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {projekt.lieferadresse ? (
                      <>
                        {projekt.lieferadresse.strasse}, {projekt.lieferadresse.plz} {projekt.lieferadresse.ort}
                      </>
                    ) : (
                      <>
                        {projekt.kundenstrasse}, {projekt.kundenPlzOrt}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      Klicken zum Korrigieren
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Adress-Korrektur Modal */}
      {adressModalProjekt && (
        <AdressKorrekturModal
          isOpen={adressModalOpen}
          onClose={() => {
            setAdressModalOpen(false);
            setAdressModalProjekt(null);
          }}
          projekt={adressModalProjekt}
          onSave={handleSaveKoordinaten}
        />
      )}
    </div>
  );
};

export default DispoKartenAnsicht;
