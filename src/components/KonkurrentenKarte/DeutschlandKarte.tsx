import { useState, useRef, useEffect, useMemo } from 'react';
import { Konkurrent } from '../../types/konkurrent';
import deutschlandGeoJSONData from '../../data/deutschland.geo.json';
import { geoToSvg, calculateBounds, geoJsonToSvgPath } from '../../utils/geoJsonToSvg';
import { PLZ_BEREICHE } from '../../data/plz-bereiche';

// Verwende die geladene GeoJSON-Datei oder Fallback
const deutschlandGeoJSON = deutschlandGeoJSONData.features.length > 0 
  ? deutschlandGeoJSONData 
  : {
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        properties: { name: "Deutschland" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [[
            [5.866315, 47.270362], [15.0, 47.270362], [15.0, 55.0], [5.866315, 55.0], [5.866315, 47.270362]
          ]]
        }
      }]
    };

// Berechne Bounds aus GeoJSON
const getDeutschlandBounds = () => {
  const feature = deutschlandGeoJSON.features[0];
  if (feature.geometry.type === 'Polygon') {
    // Polygon coordinates are number[][], wrap in array for calculateBounds
    return calculateBounds(feature.geometry.coordinates as unknown as number[][]);
  } else if (feature.geometry.type === 'MultiPolygon') {
    // MultiPolygon coordinates are number[][][]
    return calculateBounds(feature.geometry.coordinates as unknown as number[][][]);
  }
  // Fallback
  return {
    minLat: 47.2,
    maxLat: 55.1,
    minLon: 5.8,
    maxLon: 15.0,
  };
};

const DEUTSCHLAND_BOUNDS = getDeutschlandBounds();

// Generiere SVG-Path für Deutschland
const getDeutschlandPath = (width: number, height: number): string => {
  const feature = deutschlandGeoJSON.features[0];
  if (feature.geometry.type === 'Polygon') {
    return geoJsonToSvgPath(feature.geometry.coordinates as unknown as number[][], width, height, DEUTSCHLAND_BOUNDS);
  } else if (feature.geometry.type === 'MultiPolygon') {
    return geoJsonToSvgPath(feature.geometry.coordinates as unknown as number[][][], width, height, DEUTSCHLAND_BOUNDS);
  }
  return '';
};

interface DeutschlandKarteProps {
  konkurrenten: Konkurrent[];
  onKonkurrentClick?: (konkurrent: Konkurrent) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onReset?: () => void;
}

const DeutschlandKarte = ({ 
  konkurrenten, 
  onKonkurrentClick,
  zoom: externalZoom,
  onZoomChange,
  onReset
}: DeutschlandKarteProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [internalZoom, setInternalZoom] = useState(1);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [hoveredKonkurrent, setHoveredKonkurrent] = useState<Konkurrent | null>(null);
  
  const zoom = externalZoom !== undefined ? externalZoom : internalZoom;
  const setZoom = (newZoom: number) => {
    if (onZoomChange) {
      onZoomChange(newZoom);
    } else {
      setInternalZoom(newZoom);
    }
  };

  const width = 800;
  const height = 1000;

  // Berechne Marker-Größe basierend auf Produktionsmenge
  const getMarkerSize = (konkurrent: Konkurrent): number => {
    if (!konkurrent.produktionsmenge) {
      return 8; // Standard-Größe
    }
    
    // Skaliere zwischen 6 und 20 Pixel
    const minSize = 6;
    const maxSize = 20;
    const minProd = 1000;
    const maxProd = 15000;
    
    const normalized = Math.min(1, Math.max(0, (konkurrent.produktionsmenge - minProd) / (maxProd - minProd)));
    return minSize + normalized * (maxSize - minSize);
  };

  // Filtere Konkurrenten mit Koordinaten
  const konkurrentenMitKoordinaten = konkurrenten.filter((k) => k.adresse.koordinaten);

  // Gruppiere PLZ-Bereiche nach den ersten beiden Ziffern
  // Zeige ALLE PLZ-Bereiche, nicht nur die mit Konkurrenten
  const plzBereiche = useMemo(() => {
    // Zeige alle verfügbaren PLZ-Bereiche
    return Object.keys(PLZ_BEREICHE).sort();
  }, []);

  // Berechne Transform-Matrix für Zoom und Pan
  const transform = `translate(${pan[0]}, ${pan[1]}) scale(${zoom})`;

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(5, zoom * delta));
    
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Zoom zum Mauszeiger
      const scale = newZoom / zoom;
      const newPanX = x - (x - pan[0]) * scale;
      const newPanY = y - (y - pan[1]) * scale;
      
      setZoom(newZoom);
      setPan([newPanX, newPanY]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart([e.clientX - pan[0], e.clientY - pan[1]]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && dragStart) {
      setPan([e.clientX - dragStart[0], e.clientY - dragStart[1]]);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  // Zentriere Karte auf Konkurrenten beim ersten Laden
  useEffect(() => {
    if (konkurrentenMitKoordinaten.length > 0 && zoom === 1 && pan[0] === 0 && pan[1] === 0) {
      const avgLon = konkurrentenMitKoordinaten.reduce((sum, k) => sum + (k.adresse.koordinaten![0] || 0), 0) / konkurrentenMitKoordinaten.length;
      const avgLat = konkurrentenMitKoordinaten.reduce((sum, k) => sum + (k.adresse.koordinaten![1] || 0), 0) / konkurrentenMitKoordinaten.length;
      
      const [svgX, svgY] = geoToSvg(avgLon, avgLat, width, height, DEUTSCHLAND_BOUNDS);
      
      // Zentriere auf durchschnittliche Position
      setPan([width / 2 - svgX, height / 2 - svgY]);
      setZoom(1.5);
    }
  }, [konkurrentenMitKoordinaten.length]);
  
  // Exponiere Reset-Funktion über useImperativeHandle oder einfacher über Ref
  const resetKarte = () => {
    setPan([0, 0]);
    setZoom(1);
  };
  
  useEffect(() => {
    if (onReset) {
      // Setze Reset-Funktion in Ref
      (onReset as any).current = resetKarte;
    }
  }, [onReset]);

  return (
    <div className="relative w-full h-full bg-gray-50 dark:bg-gray-800">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        className="cursor-move"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Deutschland-Umriss (genau aus GeoJSON) */}
        <g transform={transform}>
          {/* Hintergrund */}
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="#e8f4f8"
          />
          
          {/* Deutschland-Umriss */}
          <path
            d={getDeutschlandPath(width, height)}
            fill="#f0f0f0"
            stroke="#4a90e2"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          
          {/* PLZ-Bereiche (erste 2 Ziffern) - als Polygone */}
          {plzBereiche.map((plzPrefix) => {
            const bereich = PLZ_BEREICHE[plzPrefix];
            if (!bereich) return null;
            
            const [lon, lat] = bereich.center;
            const [x, y] = geoToSvg(lon, lat, width, height, DEUTSCHLAND_BOUNDS);
            
            // Erstelle ein Polygon für den PLZ-Bereich (vereinfacht als Hexagon)
            const radius = 40; // Radius in SVG-Einheiten
            const points: string[] = [];
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 3) * i;
              const px = x + radius * Math.cos(angle);
              const py = y + radius * Math.sin(angle);
              points.push(`${px},${py}`);
            }
            
            return (
              <g key={plzPrefix}>
                <polygon
                  points={points.join(' ')}
                  fill="rgba(74, 144, 226, 0.15)"
                  stroke="rgba(74, 144, 226, 0.5)"
                  strokeWidth="1.5"
                  strokeDasharray="4,2"
                  opacity="0.7"
                />
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="11"
                  fontWeight="bold"
                  fill="#2563eb"
                  style={{ pointerEvents: 'none' }}
                >
                  {plzPrefix}
                </text>
              </g>
            );
          })}
          
          {/* Konkurrenten-Marker */}
          {konkurrentenMitKoordinaten.map((konkurrent) => {
            if (!konkurrent.adresse.koordinaten) return null;
            
            const [lon, lat] = konkurrent.adresse.koordinaten;
            const [x, y] = geoToSvg(lon, lat, width, height, DEUTSCHLAND_BOUNDS);
            const size = getMarkerSize(konkurrent);
            const isHovered = hoveredKonkurrent?.id === konkurrent.id;
            
            return (
              <g
                key={konkurrent.id}
                transform={`translate(${x}, ${y})`}
                onMouseEnter={() => setHoveredKonkurrent(konkurrent)}
                onMouseLeave={() => setHoveredKonkurrent(null)}
                onClick={() => onKonkurrentClick?.(konkurrent)}
                className="cursor-pointer"
              >
                {/* Marker-Kreis */}
                <circle
                  cx={0}
                  cy={0}
                  r={size}
                  fill="#dc2626"
                  stroke="#fff"
                  strokeWidth={isHovered ? 3 : 2}
                  opacity={isHovered ? 0.9 : 0.8}
                />
                
                {/* Tooltip */}
                {isHovered && (
                  <g transform="translate(0, -size - 10)">
                    <rect
                      x={-60}
                      y={-20}
                      width={120}
                      height={40}
                      fill="#fff"
                      stroke="#333"
                      strokeWidth="1"
                      rx="4"
                    />
                    <text
                      x={0}
                      y={-5}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="bold"
                      fill="#333"
                    >
                      {konkurrent.name}
                    </text>
                    {konkurrent.produktionsmenge && (
                      <text
                        x={0}
                        y={8}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#666"
                      >
                        {konkurrent.produktionsmenge.toLocaleString()} t/Jahr
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      
      {/* Zoom-Indikator */}
      <div className="absolute top-4 right-4 bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg p-2 text-xs text-gray-600 dark:text-dark-textMuted">
        Zoom: {(zoom * 100).toFixed(0)}%
      </div>
    </div>
  );
};

export default DeutschlandKarte;
