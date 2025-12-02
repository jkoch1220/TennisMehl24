/**
 * Konvertiert GeoJSON-Koordinaten zu SVG-Pfaden
 */

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function geoToSvg(
  lon: number,
  lat: number,
  width: number,
  height: number,
  bounds: Bounds
): [number, number] {
  const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width;
  const y = height - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * height;
  return [x, y];
}

export function calculateBounds(coordinates: number[][][] | number[][]): Bounds {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  // Handle both Polygon (number[][]) and MultiPolygon (number[][][])
  const polygons = Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0]) && typeof coordinates[0][0][0] === 'number'
    ? (coordinates as unknown as number[][][])
    : [(coordinates as unknown as number[][])];

  polygons.forEach(polygon => {
    const rings = Array.isArray(polygon[0]) && Array.isArray(polygon[0][0])
      ? (polygon as unknown as number[][][])
      : [(polygon as unknown as number[][])];
    
    rings.forEach(ring => {
      ring.forEach((coord) => {
        const [lon, lat] = Array.isArray(coord) ? coord : [coord, coord];
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
      });
    });
  });

  return { minLat, maxLat, minLon, maxLon };
}

export function geoJsonToSvgPath(
  coordinates: number[][][] | number[][],
  width: number,
  height: number,
  bounds: Bounds
): string {
  const paths: string[] = [];

  // Handle both Polygon (number[][]) and MultiPolygon (number[][][])
  const polygons = Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0]) && typeof coordinates[0][0][0] === 'number'
    ? (coordinates as unknown as number[][][])
    : [(coordinates as unknown as number[][])];

  polygons.forEach(polygon => {
    const rings = Array.isArray(polygon[0]) && Array.isArray(polygon[0][0])
      ? (polygon as unknown as number[][][])
      : [(polygon as unknown as number[][])];
    
    rings.forEach((ring, ringIndex) => {
      const pathParts: string[] = [];
      
      ring.forEach((coord, pointIndex) => {
        const [lon, lat] = Array.isArray(coord) && coord.length >= 2 ? coord : [0, 0];
        const [x, y] = geoToSvg(lon, lat, width, height, bounds);
        
        if (pointIndex === 0) {
          pathParts.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
        } else {
          pathParts.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
        }
      });
      
      if (ringIndex === 0) {
        paths.push(pathParts.join(' ') + ' Z');
      } else {
        // Innere Ringe (Löcher)
        paths.push(pathParts.join(' ') + ' Z');
      }
    });
  });

  return paths.join(' ');
}
