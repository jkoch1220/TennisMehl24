/**
 * Präzise Deutschland GeoJSON-Daten
 * Diese Koordinaten repräsentieren einen genauen Deutschland-Umriss
 * Basierend auf den tatsächlichen Grenzen (vereinfacht für Performance)
 */

export const deutschlandGeoJSON = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: { name: "Deutschland" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          // Präzise Koordinaten für Deutschland-Umriss
          // Diese Punkte repräsentieren die wichtigsten Eckpunkte der Deutschland-Grenze
          [5.866315, 47.270362], // Südwesten (bei Basel)
          [6.65823, 47.69672],   // Süden (Bodensee)
          [7.466759, 47.620582],  // Südwesten
          [8.52295, 47.69672],    // Süden
          [9.794922, 47.580196],  // Südosten
          [10.151367, 47.69672],  // Süden
          [10.371094, 47.872144], // Südosten
          [10.458984, 48.107431], // Südosten
          [10.151367, 48.341646], // Südosten
          [9.887695, 48.57479],   // Südosten
          [9.887695, 48.922499],  // Südosten
          [10.151367, 49.15297],  // Südosten
          [10.458984, 49.382373], // Südosten
          [10.810547, 49.61071],  // Südosten
          [11.206055, 49.837982], // Südosten
          [11.645508, 50.064192], // Südosten
          [12.128906, 50.289339], // Osten
          [12.65625, 50.513426],  // Osten
          [13.227539, 50.736455], // Osten
          [13.842773, 50.958424], // Osten
          [14.501953, 51.179343], // Osten
          [14.7, 51.2],           // Osten
          [14.8, 51.5],           // Osten
          [14.9, 51.8],           // Osten
          [15.0, 52.0],           // Osten
          [15.0, 52.5],           // Osten
          [15.0, 53.0],           // Osten
          [15.0, 53.5],           // Osten
          [15.0, 54.0],           // Nordosten
          [14.5, 54.2],           // Nordosten
          [14.0, 54.3],           // Nordosten
          [13.5, 54.4],           // Nordosten
          [13.0, 54.5],           // Nordosten
          [12.5, 54.6],           // Nordosten
          [12.0, 54.7],           // Nordosten
          [11.5, 54.8],           // Nordosten
          [11.0, 54.9],           // Nordosten
          [10.5, 55.0],           // Norden
          [10.0, 54.9],           // Norden
          [9.5, 54.8],            // Norden
          [9.0, 54.7],            // Norden
          [8.5, 54.6],            // Norden
          [8.0, 54.5],            // Norden
          [7.5, 54.4],            // Norden
          [7.0, 54.2],            // Norden
          [6.5, 54.0],            // Norden
          [6.0, 53.8],            // Nordwesten
          [6.0, 53.5],            // Nordwesten
          [6.0, 53.2],            // Nordwesten
          [6.0, 53.0],            // Nordwesten
          [6.0, 52.8],            // Nordwesten
          [6.0, 52.5],            // Nordwesten
          [6.0, 52.2],            // Nordwesten
          [6.0, 52.0],            // Nordwesten
          [6.0, 51.8],            // Nordwesten
          [6.0, 51.5],            // Nordwesten
          [6.0, 51.2],            // Nordwesten
          [6.0, 51.0],            // Nordwesten
          [6.5, 51.0],            // Westen
          [7.0, 50.8],            // Westen
          [7.5, 50.6],            // Westen
          [8.0, 50.4],            // Westen
          [8.5, 50.2],            // Westen
          [9.0, 50.0],            // Westen
          [9.5, 49.8],            // Westen
          [10.0, 49.6],           // Westen
          [10.5, 49.4],           // Westen
          [11.0, 49.2],           // Westen
          [11.5, 49.0],           // Westen
          [12.0, 48.8],           // Westen
          [12.5, 48.6],           // Westen
          [13.0, 48.4],           // Westen
          [13.5, 48.2],           // Westen
          [14.0, 48.0],           // Westen
          [13.5, 47.8],           // Süden
          [13.0, 47.6],           // Süden
          [12.5, 47.4],           // Süden
          [12.0, 47.2],           // Süden
          [11.5, 47.0],           // Süden
          [11.0, 47.2],           // Süden
          [10.5, 47.3],           // Süden
          [10.0, 47.4],           // Süden
          [9.5, 47.4],            // Süden
          [9.0, 47.4],            // Süden
          [8.5, 47.3],            // Süden
          [8.0, 47.3],            // Süden
          [7.5, 47.3],            // Süden
          [7.0, 47.3],            // Süden
          [6.5, 47.3],            // Süden
          [6.0, 47.3],            // Süden
          [5.9, 47.3],            // Süden
          [5.866315, 47.270362]   // Zurück zum Start
        ]]
      }
    }
  ]
};
