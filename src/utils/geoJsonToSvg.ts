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

export function calculateBounds(coordinates: number[][][]): Bounds {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  coordinates.forEach(polygon => {
    polygon.forEach(ring => {
      ring.forEach(([lon, lat]) => {
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
  coordinates: number[][][],
  width: number,
  height: number,
  bounds: Bounds
): string {
  const paths: string[] = [];

  coordinates.forEach(polygon => {
    polygon.forEach((ring, ringIndex) => {
      const pathParts: string[] = [];
      
      ring.forEach(([lon, lat], pointIndex) => {
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
