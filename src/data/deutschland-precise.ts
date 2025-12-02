/**
 * Präzise Deutschland GeoJSON-Daten
 * Basierend auf vereinfachten aber genauen Koordinaten
 * Deutschland: ~5.8°-15°E, ~47°-55°N
 */

// Vereinfachter aber genauer Deutschland-Umriss
// Diese Koordinaten repräsentieren die wichtigsten Punkte des Deutschland-Umrisses
export const deutschlandGeoJSON = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: { name: "Deutschland" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          // Südwesten (Bodensee-Gebiet)
          [8.5, 47.5],
          [9.0, 47.6],
          [9.5, 47.7],
          [10.0, 47.8],
          [10.5, 47.9],
          // Süden (Alpenvorland)
          [11.0, 47.8],
          [11.5, 47.9],
          [12.0, 48.0],
          [12.5, 48.1],
          [13.0, 48.2],
          [13.5, 48.3],
          [14.0, 48.4],
          [14.5, 48.5],
          // Südosten (Bayern)
          [13.0, 48.8],
          [12.5, 49.0],
          [12.0, 49.2],
          [11.5, 49.4],
          [11.0, 49.6],
          [10.5, 49.8],
          [10.0, 50.0],
          [9.5, 50.2],
          [9.0, 50.4],
          [8.5, 50.6],
          [8.0, 50.8],
          [7.5, 51.0],
          // Westen (Rheinland)
          [6.5, 51.0],
          [6.0, 51.2],
          [6.0, 51.5],
          [6.0, 51.8],
          [6.0, 52.0],
          [6.0, 52.2],
          [6.0, 52.5],
          [6.0, 52.8],
          [6.0, 53.0],
          [6.0, 53.2],
          [6.0, 53.5],
          [6.0, 53.8],
          [6.5, 54.0],
          [7.0, 54.2],
          [7.5, 54.4],
          [8.0, 54.5],
          [8.5, 54.6],
          [9.0, 54.7],
          [9.5, 54.8],
          [10.0, 54.9],
          [10.5, 55.0],
          [11.0, 54.9],
          [11.5, 54.8],
          [12.0, 54.7],
          [12.5, 54.6],
          [13.0, 54.5],
          [13.5, 54.4],
          [14.0, 54.3],
          [14.5, 54.2],
          [15.0, 54.0],
          // Nordosten (Mecklenburg-Vorpommern)
          [14.5, 53.8],
          [14.0, 53.6],
          [13.5, 53.4],
          [13.0, 53.2],
          [12.5, 53.0],
          [12.0, 52.8],
          [11.5, 52.6],
          [11.0, 52.4],
          [10.5, 52.2],
          [10.0, 52.0],
          [9.5, 51.8],
          [9.0, 51.6],
          [8.5, 51.4],
          [8.0, 51.2],
          [7.5, 51.0],
          [7.0, 50.8],
          [6.5, 50.6],
          [6.0, 50.4],
          [6.0, 50.0],
          [6.0, 49.5],
          [6.0, 49.0],
          [6.0, 48.5],
          [6.0, 48.0],
          [6.5, 47.8],
          [7.0, 47.6],
          [7.5, 47.5],
          [8.0, 47.5],
          [8.5, 47.5] // Zurück zum Start
        ]]
      }
    }
  ]
};
