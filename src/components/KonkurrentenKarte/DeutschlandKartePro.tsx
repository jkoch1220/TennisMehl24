import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Konkurrent } from '../../types/konkurrent';
import { konkurrentService } from '../../services/konkurrentService';
import { MapPin, Phone, Mail, Globe, Factory, Star, ExternalLink } from 'lucide-react';

// Fix für Leaflet Marker Icons (Bug mit Webpack/Vite)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Deutschland Zentrum und Bounds
const DEUTSCHLAND_CENTER: [number, number] = [51.1657, 10.4515];
const DEUTSCHLAND_BOUNDS: [[number, number], [number, number]] = [
  [47.2701, 5.8663], // SW
  [55.0581, 15.0419] // NE
];

interface DeutschlandKarteProProps {
  konkurrenten: Konkurrent[];
  selectedKonkurrent: Konkurrent | null;
  hoveredKonkurrent: Konkurrent | null;
  onKonkurrentClick: (k: Konkurrent) => void;
  onKonkurrentHover: (k: Konkurrent | null) => void;
}

// Komponente um zur ausgewählten Position zu fliegen
const FlyToSelected = ({ konkurrent }: { konkurrent: Konkurrent | null }) => {
  const map = useMap();

  useEffect(() => {
    if (konkurrent?.adresse.koordinaten) {
      const [lon, lat] = konkurrent.adresse.koordinaten;
      map.flyTo([lat, lon], 10, { duration: 1 });
    }
  }, [konkurrent?.id, map]);

  return null;
};

// Custom Marker basierend auf Produktionsmenge und Bedrohungsstufe
const KonkurrentMarker = ({
  konkurrent,
  isSelected,
  isHovered,
  onClick,
  onHover,
  maxProduktion
}: {
  konkurrent: Konkurrent;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onHover: (hover: boolean) => void;
  maxProduktion: number;
}) => {
  if (!konkurrent.adresse.koordinaten) return null;

  const [lon, lat] = konkurrent.adresse.koordinaten;

  // Berechne Radius basierend auf Produktionsmenge (zwischen 8 und 40 Pixel)
  const getRadius = () => {
    const prod = konkurrent.produktionsmenge || 0;
    if (prod === 0) return 12;
    const normalized = Math.log(prod + 1) / Math.log(maxProduktion + 1);
    return Math.max(12, Math.min(45, 12 + normalized * 33));
  };

  const radius = getRadius();
  const color = konkurrentService.getBedrohungsfarbe(konkurrent.bedrohungsstufe);
  const durchschnittsBewertung = konkurrentService.berechneDurchschnittsBewertung(konkurrent.bewertung);

  return (
    <CircleMarker
      center={[lat, lon]}
      radius={isSelected ? radius * 1.2 : isHovered ? radius * 1.1 : radius}
      pathOptions={{
        fillColor: color,
        fillOpacity: isSelected ? 0.95 : isHovered ? 0.9 : 0.8,
        color: isSelected ? '#fff' : '#fff',
        weight: isSelected ? 4 : isHovered ? 3 : 2,
        opacity: 1,
      }}
      eventHandlers={{
        click: onClick,
        mouseover: () => onHover(true),
        mouseout: () => onHover(false),
      }}
    >
      <Tooltip
        permanent={isSelected}
        direction="top"
        offset={[0, -radius]}
        className="konkurrent-tooltip"
      >
        <div className="min-w-[200px] p-0">
          <div className="font-bold text-gray-900 text-sm mb-1">{konkurrent.name}</div>
          <div className="text-xs text-gray-600 mb-2">
            {konkurrent.adresse.plz} {konkurrent.adresse.ort}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <Factory className="w-3 h-3 text-gray-500" />
              <span className="font-semibold">{konkurrent.produktionsmenge?.toLocaleString() || '?'} t/Jahr</span>
            </div>
            {durchschnittsBewertung > 0 && (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                <span>{durchschnittsBewertung.toFixed(1)}</span>
              </div>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div
              className="text-xs font-medium px-2 py-0.5 rounded-full inline-block"
              style={{
                backgroundColor: `${color}20`,
                color: color
              }}
            >
              {konkurrent.bedrohungsstufe || 'Unbekannt'}
            </div>
          </div>
        </div>
      </Tooltip>

      {/* Popup bei Klick */}
      <Popup className="konkurrent-popup" maxWidth={350}>
        <div className="p-2">
          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
              style={{ backgroundColor: color }}
            >
              {konkurrent.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-base leading-tight">{konkurrent.name}</h3>
              <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                <MapPin className="w-3 h-3" />
                {konkurrent.adresse.strasse && <span>{konkurrent.adresse.strasse}, </span>}
                {konkurrent.adresse.plz} {konkurrent.adresse.ort}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-gray-900">
                {konkurrent.produktionsmenge?.toLocaleString() || '—'}
              </div>
              <div className="text-xs text-gray-500">t/Jahr</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-1">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span className="text-lg font-bold text-gray-900">
                  {durchschnittsBewertung > 0 ? durchschnittsBewertung.toFixed(1) : '—'}
                </span>
              </div>
              <div className="text-xs text-gray-500">Bewertung</div>
            </div>
          </div>

          {/* Produkte */}
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1">Produkte</div>
            <div className="flex gap-1">
              {konkurrent.produkte.map(p => (
                <span
                  key={p}
                  className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                >
                  {p === 'tennissand' ? 'Tennis-Sand' : 'Tennis-Mehl'}
                </span>
              ))}
            </div>
          </div>

          {/* Kontakt */}
          {konkurrent.kontakt && (
            <div className="space-y-1 text-sm border-t border-gray-200 pt-3">
              {konkurrent.kontakt.telefon && (
                <a
                  href={`tel:${konkurrent.kontakt.telefon}`}
                  className="flex items-center gap-2 text-gray-600 hover:text-red-600"
                >
                  <Phone className="w-3 h-3" />
                  {konkurrent.kontakt.telefon}
                </a>
              )}
              {konkurrent.kontakt.email && (
                <a
                  href={`mailto:${konkurrent.kontakt.email}`}
                  className="flex items-center gap-2 text-gray-600 hover:text-red-600"
                >
                  <Mail className="w-3 h-3" />
                  {konkurrent.kontakt.email}
                </a>
              )}
              {konkurrent.kontakt.website && (
                <a
                  href={konkurrent.kontakt.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-600 hover:text-red-600"
                >
                  <Globe className="w-3 h-3" />
                  Website öffnen
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Notizen */}
          {konkurrent.notizen && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Notizen</div>
              <p className="text-sm text-gray-700 line-clamp-3">{konkurrent.notizen}</p>
            </div>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
};

const DeutschlandKartePro = ({
  konkurrenten,
  selectedKonkurrent,
  hoveredKonkurrent,
  onKonkurrentClick,
  onKonkurrentHover
}: DeutschlandKarteProProps) => {
  const mapRef = useRef<L.Map | null>(null);

  // Konkurrenten mit Koordinaten
  const konkurrentenMitKoordinaten = useMemo(() =>
    konkurrenten.filter(k => k.adresse.koordinaten),
    [konkurrenten]
  );

  // Max Produktionsmenge für Skalierung
  const maxProduktion = useMemo(() =>
    Math.max(...konkurrentenMitKoordinaten.map(k => k.produktionsmenge || 0), 1),
    [konkurrentenMitKoordinaten]
  );

  // Sortiere Marker - größte zuerst (damit kleine oben liegen)
  const sortierteKonkurrenten = useMemo(() =>
    [...konkurrentenMitKoordinaten].sort((a, b) => (b.produktionsmenge || 0) - (a.produktionsmenge || 0)),
    [konkurrentenMitKoordinaten]
  );

  return (
    <div className="relative w-full h-full">
      <MapContainer
        ref={mapRef}
        center={DEUTSCHLAND_CENTER}
        zoom={6}
        minZoom={5}
        maxZoom={18}
        maxBounds={DEUTSCHLAND_BOUNDS}
        maxBoundsViscosity={0.8}
        className="w-full h-full z-0"
        style={{ background: '#e8f4fc' }}
      >
        {/* OpenStreetMap Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Alternative: CartoDB Positron (cleaner look) */}
        {/* <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        /> */}

        {/* Fly to selected */}
        <FlyToSelected konkurrent={selectedKonkurrent} />

        {/* Konkurrenten Marker */}
        {sortierteKonkurrenten.map(konkurrent => (
          <KonkurrentMarker
            key={konkurrent.id}
            konkurrent={konkurrent}
            isSelected={selectedKonkurrent?.id === konkurrent.id}
            isHovered={hoveredKonkurrent?.id === konkurrent.id}
            onClick={() => onKonkurrentClick(konkurrent)}
            onHover={(hover) => onKonkurrentHover(hover ? konkurrent : null)}
            maxProduktion={maxProduktion}
          />
        ))}
      </MapContainer>

      {/* Legende */}
      <div className="absolute bottom-4 left-4 bg-white dark:bg-dark-surface rounded-xl shadow-lg p-4 z-[1000] max-w-xs">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3">
          Legende
        </h4>

        {/* Marker-Größen */}
        <div className="mb-3">
          <div className="text-xs text-gray-500 dark:text-dark-textMuted mb-2">Produktionsmenge (t/Jahr)</div>
          <div className="flex items-end gap-3">
            {[
              { label: '<2k', size: 12 },
              { label: '5k', size: 20 },
              { label: '10k', size: 30 },
              { label: '>15k', size: 40 }
            ].map(item => (
              <div key={item.label} className="flex flex-col items-center gap-1">
                <div
                  className="rounded-full bg-gray-400 dark:bg-gray-600"
                  style={{ width: item.size, height: item.size }}
                />
                <span className="text-[10px] text-gray-500 dark:text-dark-textMuted">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bedrohungsstufen */}
        <div>
          <div className="text-xs text-gray-500 dark:text-dark-textMuted mb-2">Bedrohungsstufe</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Niedrig', color: '#22c55e' },
              { label: 'Mittel', color: '#eab308' },
              { label: 'Hoch', color: '#f97316' },
              { label: 'Kritisch', color: '#ef4444' }
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-gray-600 dark:text-dark-textMuted">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-dark-border">
          <div className="text-xs text-gray-600 dark:text-dark-textMuted">
            <strong>{konkurrentenMitKoordinaten.length}</strong> Konkurrenten auf der Karte
          </div>
        </div>
      </div>

      {/* Custom CSS für Tooltips und Popups */}
      <style>{`
        .konkurrent-tooltip {
          background: white !important;
          border: none !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
          padding: 0 !important;
        }
        .konkurrent-tooltip .leaflet-tooltip-content {
          margin: 0 !important;
          padding: 12px !important;
        }
        .konkurrent-tooltip::before {
          border-top-color: white !important;
        }

        .konkurrent-popup .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          box-shadow: 0 4px 25px rgba(0,0,0,0.2) !important;
          padding: 0 !important;
        }
        .konkurrent-popup .leaflet-popup-content {
          margin: 0 !important;
          min-width: 280px !important;
        }
        .konkurrent-popup .leaflet-popup-tip {
          background: white !important;
        }

        .leaflet-container {
          font-family: inherit !important;
        }

        /* Dark mode */
        .dark .konkurrent-tooltip {
          background: #1f2937 !important;
        }
        .dark .konkurrent-tooltip .leaflet-tooltip-content {
          color: #f3f4f6 !important;
        }
        .dark .konkurrent-popup .leaflet-popup-content-wrapper {
          background: #1f2937 !important;
        }
        .dark .konkurrent-popup .leaflet-popup-tip {
          background: #1f2937 !important;
        }
      `}</style>
    </div>
  );
};

export default DeutschlandKartePro;
