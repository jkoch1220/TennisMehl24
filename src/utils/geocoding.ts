/**
 * Geocoding-Utilities für Adressen
 */

/**
 * Geocodiert eine Adresse (Straße, PLZ, Ort) zu Koordinaten
 * Verwendet Nominatim (OpenStreetMap) - kostenlos und zuverlässig
 * Versucht mehrere Strategien: Vollständige Adresse -> PLZ + Ort -> Nur PLZ
 */
export async function geocodeAdresse(
  strasse: string,
  plz: string,
  ort: string
): Promise<[number, number] | null> {
  // Strategie 1: Vollständige Adresse
  const queries = [
    `${strasse}, ${plz} ${ort}, Deutschland`,
    `${strasse}, ${plz}, Deutschland`,
    `${plz} ${ort}, Deutschland`,
    `${plz}, Deutschland`,
  ];

  for (const query of queries) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=1&countrycodes=de`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'TennisMehl24-Dispo-Planung', // Nominatim erfordert User-Agent
        },
      });

      if (!response.ok) {
        console.warn(`Geocoding-Fehler für "${query}":`, response.statusText);
        continue; // Versuche nächste Strategie
      }

      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const lon = parseFloat(result.lon);
        const lat = parseFloat(result.lat);
        
        // Validiere, dass die Koordinaten plausibel sind (Deutschland liegt zwischen ~5-15°E und ~47-55°N)
        if (lon >= 5 && lon <= 15 && lat >= 47 && lat <= 55) {
          console.log(`✅ Geocodiert: ${query} -> [${lon}, ${lat}]`);
          return [lon, lat];
        } else {
          console.warn(`⚠️ Unplausible Koordinaten für "${query}": [${lon}, ${lat}]`);
          continue; // Versuche nächste Strategie
        }
      }
    } catch (error) {
      console.warn(`Fehler beim Geocoding für "${query}":`, error);
      continue; // Versuche nächste Strategie
    }
  }

  console.warn(`⚠️ Keine Koordinaten gefunden für: ${strasse}, ${plz} ${ort}`);
  return null;
}

/**
 * Geocodiert nur eine PLZ zu Koordinaten (PLZ-Zentrum)
 */
export async function geocodePLZ(plz: string): Promise<[number, number] | null> {
  try {
    const query = `${plz}, Deutschland`;
    const encodedQuery = encodeURIComponent(query);

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=1&countrycodes=de&postalcode=${plz}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TennisMehl24-Dispo-Planung',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      return [parseFloat(result.lon), parseFloat(result.lat)];
    }

    return null;
  } catch (error) {
    console.error('Fehler beim PLZ-Geocoding:', error);
    return null;
  }
}



