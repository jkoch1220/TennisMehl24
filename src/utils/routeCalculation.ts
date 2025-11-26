/**
 * Routenberechnung und Zeitberechnung für Eigenlieferung
 */

import { EigenlieferungStammdaten, RoutenBerechnung } from '../types';

// Startadresse (Standort des Unternehmens)
const START_ADRESSE = 'Hundsberg 13, 97950 Großrinderfeld';
const START_PLZ = '97950'; // PLZ für Fallback

// Manuelle Koordinaten für Großrinderfeld (Fallback falls Geocodierung fehlschlägt)
// Koordinaten für Großrinderfeld: ~49.66°N, 9.75°E
const START_COORDS_MANUELL: [number, number] = [9.75, 49.66]; // [lon, lat]

const OPENROUTESERVICE_API_KEY = import.meta.env.VITE_OPENROUTESERVICE_API_KEY || '';

/**
 * Geocodiert eine Adresse oder PLZ zu Koordinaten mit OpenRouteService
 */
const geocodeAdresse = async (adresseOderPLZ: string): Promise<[number, number] | null> => {
  if (!OPENROUTESERVICE_API_KEY) {
    console.warn('Kein OpenRouteService API-Key vorhanden');
    return null;
  }

  try {
    // Für PLZ: Verwende spezifischere Suche mit "Postleitzahl" oder "PLZ"
    const isPLZ = /^\d{5}$/.test(adresseOderPLZ);
    let searchQuery = adresseOderPLZ;
    
    if (isPLZ) {
      // Für PLZ: Suche spezifisch nach "PLZ Deutschland" oder "Postleitzahl PLZ"
      searchQuery = `${adresseOderPLZ} Deutschland`;
    }
    
    const encodedAdresse = encodeURIComponent(searchQuery);
    const apiUrl = `https://api.openrouteservice.org/geocode/search?api_key=${OPENROUTESERVICE_API_KEY}&text=${encodedAdresse}&boundary.country=DE&size=5`;
    
    console.log(`🔍 Geocodierung für "${adresseOderPLZ}"...`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`OpenRouteService API Fehler: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      // Für PLZ: Suche nach dem Ergebnis, das die PLZ im Namen/Text enthält
      let bestMatch = data.features[0];
      
      if (isPLZ) {
        // Durchsuche alle Ergebnisse nach einem Match mit der PLZ
        for (const feature of data.features) {
          const properties = feature.properties || {};
          const name = properties.name || '';
          const label = properties.label || '';
          const text = `${name} ${label}`.toLowerCase();
          
          // Prüfe ob die PLZ im Ergebnis vorkommt
          if (text.includes(adresseOderPLZ) || properties.postcode === adresseOderPLZ) {
            bestMatch = feature;
            console.log(`✅ Gefunden: "${properties.label || properties.name}" mit PLZ ${adresseOderPLZ}`);
            break;
          }
        }
        
        // Logge alle gefundenen Ergebnisse für Debugging
        console.log(`📋 Gefundene Ergebnisse für PLZ ${adresseOderPLZ}:`);
        data.features.slice(0, 3).forEach((f: { properties?: { label?: string; name?: string; postcode?: string } }, i: number) => {
          const props = f.properties || {};
          console.log(`   ${i + 1}. ${props.label || props.name} (PLZ: ${props.postcode || 'unbekannt'})`);
        });
      }
      
      const coordinates = bestMatch.geometry.coordinates;
      // OpenRouteService gibt [lon, lat] zurück (GeoJSON Format)
      const lon = coordinates[0];
      const lat = coordinates[1];
      
      const properties = bestMatch.properties || {};
      console.log(`📍 Geocodierung erfolgreich für "${adresseOderPLZ}": [${lon}, ${lat}]`);
      console.log(`   Label: ${properties.label || properties.name || 'unbekannt'}`);
      if (properties.postcode) {
        console.log(`   PLZ im Ergebnis: ${properties.postcode}`);
      }
      
      // Prüfe ob Koordinaten im erwarteten Bereich für Deutschland liegen
      // Deutschland: ~47-55°N (lat), ~6-15°E (lon)
      if (lon < 5 || lon > 16 || lat < 47 || lat > 56) {
        console.warn(`⚠️ Koordinaten [${lon}, ${lat}] liegen außerhalb des erwarteten Bereichs für Deutschland`);
      }
      
      return [lon, lat];
    }
    
    console.warn(`⚠️ Keine Ergebnisse für "${adresseOderPLZ}" gefunden`);
    return null;
  } catch (error) {
    console.error('Fehler bei Geocodierung:', error);
    return null;
  }
};

/**
 * Geocodiert eine PLZ mit Nominatim (OpenStreetMap) als Fallback
 * Nominatim ist oft besser für PLZ-Suchen
 */
const geocodePLZMitNominatim = async (plz: string): Promise<[number, number] | null> => {
  try {
    // Nominatim API (OpenStreetMap) - kostenlos, keine API-Key benötigt
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?postalcode=${plz}&countrycodes=de&format=json&limit=1`;
    
    console.log(`🔍 Nominatim Geocodierung für PLZ "${plz}"...`);
    
    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'TennisMehl-Kostenrechner/1.0' // Nominatim benötigt User-Agent
      }
    });
    
    if (!response.ok) {
      throw new Error(`Nominatim API Fehler: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = data[0];
      const lon = parseFloat(result.lon);
      const lat = parseFloat(result.lat);
      
      console.log(`📍 Nominatim Geocodierung erfolgreich für PLZ "${plz}": [${lon}, ${lat}]`);
      console.log(`   Ort: ${result.display_name}`);
      
      return [lon, lat];
    }
    
    return null;
  } catch (error) {
    console.warn('Nominatim Geocodierung fehlgeschlagen:', error);
    return null;
  }
};

// Cache für die letzten geocodierten PLZ-Koordinaten (um zu erkennen, ob immer die gleichen zurückgegeben werden)
// WICHTIG: Cache wird bei jedem Aufruf geleert, um falsche Koordinaten zu vermeiden
const plzCache = new Map<string, [number, number]>();

/**
 * Geocodiert eine PLZ zu Koordinaten
 * Verwendet Nominatim (OpenStreetMap) für PLZ, da es zuverlässiger ist
 * OpenRouteService hat Probleme mit PLZ-Suchen und gibt oft falsche/identische Koordinaten zurück
 */
const geocodePLZ = async (plz: string): Promise<[number, number] | null> => {
  // Verwende IMMER direkt Nominatim für PLZ, da OpenRouteService unzuverlässig ist
  // und oft falsche Koordinaten zurückgibt (z.B. "Deutschland" statt der richtigen PLZ)
  console.log(`📍 Verwende Nominatim für PLZ-Geocodierung (zuverlässiger als OpenRouteService)`);
  const nominatimResult = await geocodePLZMitNominatim(plz);
  
  if (nominatimResult) {
    // Cache nur wenn erfolgreich
    plzCache.set(plz, nominatimResult);
    return nominatimResult;
  }
  
  // Fallback: Versuche OpenRouteService wenn Nominatim fehlschlägt
  console.warn(`⚠️ Nominatim fehlgeschlagen, versuche OpenRouteService als Fallback...`);
  const orsResult = await geocodeAdresse(plz);
  if (orsResult) {
    // Prüfe ob Ergebnis plausibel ist (nicht "Deutschland" Koordinaten)
    const verdaechtigeKoordinaten: [number, number][] = [
      [9.687096, 50.970097], // Diese werden oft für falsche PLZ zurückgegeben
    ];
    const istVerdaechtig = verdaechtigeKoordinaten.some(
      ([lon, lat]) => Math.abs(orsResult[0] - lon) < 0.0001 && Math.abs(orsResult[1] - lat) < 0.0001
    );
    
    if (!istVerdaechtig) {
      plzCache.set(plz, orsResult);
    } else {
      console.warn(`⚠️ OpenRouteService lieferte verdächtige Koordinaten für PLZ ${plz}, verwende nicht`);
    }
  }
  
  return orsResult;
};

/**
 * Berechnet die Luftlinien-Distanz zwischen zwei Koordinaten (Haversine-Formel)
 * Hilft bei der Validierung der API-Ergebnisse
 */
const berechneLuftlinie = (
  coord1: [number, number],
  coord2: [number, number]
): number => {
  const R = 6371; // Erdradius in km
  const dLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const dLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1[1] * Math.PI) / 180) *
      Math.cos((coord2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Berechnet die Distanz zwischen zwei PLZ mit OpenRouteService
 * Falls kein API-Key vorhanden ist, wird eine Schätzung verwendet
 */
export const berechneDistanzVonPLZ = async (
  startPLZ: string,
  zielPLZ: string
): Promise<number> => {
  console.log(`🔄 berechneDistanzVonPLZ aufgerufen: ${startPLZ} → ${zielPLZ}`);
  
  // Wenn kein API-Key vorhanden, verwende Schätzung
  if (!OPENROUTESERVICE_API_KEY) {
    console.warn('OpenRouteService API-Key fehlt, verwende Schätzung');
    const startZone = parseInt(startPLZ.substring(0, 2));
    const zielZone = parseInt(zielPLZ.substring(0, 2));
    const geschaetzteDistanz = Math.max(20, Math.abs(startZone - zielZone) * 50);
    return geschaetzteDistanz;
  }

  try {
    // Für die Startadresse verwenden wir direkt die manuellen Koordinaten,
    // da die genaue Adresse bekannt ist und Geocodierung möglicherweise falsche Ergebnisse liefert
    let startCoords: [number, number] | null = null;
    const startAdresse = startPLZ === START_PLZ ? START_ADRESSE : startPLZ;
    
    if (startPLZ === START_PLZ) {
      // Verwende direkt die manuellen Koordinaten für Großrinderfeld
      startCoords = START_COORDS_MANUELL;
      console.log(`📍 Verwende manuelle Koordinaten für Start-PLZ ${startPLZ}: ${startAdresse} -> [${startCoords[0]}, ${startCoords[1]}]`);
    } else {
      // Für andere Start-PLZ verwende Nominatim direkt (zuverlässiger als OpenRouteService)
      console.log(`📍 Verwende Nominatim direkt für Start-PLZ ${startPLZ} (um falsche Geocodierung zu vermeiden)`);
      startCoords = await geocodePLZMitNominatim(startPLZ);
      if (!startCoords) {
        // Fallback auf geocodeAdresse wenn Nominatim fehlschlägt
        startCoords = await geocodeAdresse(startPLZ);
      }
    }
    
    // Für die Ziel-PLZ: Wenn es die START_PLZ ist, verwende auch manuelle Koordinaten
    // Ansonsten verwende IMMER Nominatim direkt (nicht OpenRouteService), da es zuverlässiger ist
    let zielCoords: [number, number] | null = null;
    if (zielPLZ === START_PLZ) {
      zielCoords = START_COORDS_MANUELL;
      console.log(`📍 Verwende manuelle Koordinaten für Ziel-PLZ ${zielPLZ}: ${START_ADRESSE} -> [${zielCoords[0]}, ${zielCoords[1]}]`);
    } else {
      // Verwende direkt Nominatim für Ziel-PLZ, um falsche Geocodierung zu vermeiden
      console.log(`📍 Verwende Nominatim direkt für Ziel-PLZ ${zielPLZ} (um falsche Geocodierung zu vermeiden)`);
      zielCoords = await geocodePLZMitNominatim(zielPLZ);
      if (!zielCoords) {
        // Fallback auf geocodePLZ wenn Nominatim fehlschlägt
        zielCoords = await geocodePLZ(zielPLZ);
      }
    }

    if (!startCoords || !zielCoords) {
      throw new Error('Konnte eine oder beide PLZ nicht geocodieren');
    }

    // Debug: Logge Koordinaten zur Fehlersuche
    console.log(`📍 Geocodierung - Start: ${startAdresse} -> [${startCoords[0]}, ${startCoords[1]}]`);
    console.log(`📍 Geocodierung - Ziel: ${zielPLZ} -> [${zielCoords[0]}, ${zielCoords[1]}]`);

    // Berechne Luftlinie zur Validierung
    const luftlinie = berechneLuftlinie(startCoords, zielCoords);
    console.log(`📏 Luftlinien-Distanz: ${luftlinie.toFixed(2)} km`);

    // Prüfe ob Koordinaten plausibel sind (Deutschland liegt zwischen ~47-55°N und ~6-15°E)
    // Wenn lon > 20 oder lat > 60, sind die Koordinaten wahrscheinlich falsch
    if (Math.abs(startCoords[0]) > 20 || Math.abs(startCoords[1]) > 60 || 
        Math.abs(zielCoords[0]) > 20 || Math.abs(zielCoords[1]) > 60) {
      console.warn('⚠️ Koordinaten scheinen außerhalb Deutschlands zu liegen, verwende Fallback');
      throw new Error('Koordinaten außerhalb des erwarteten Bereichs');
    }

    // Berechne Route mit OpenRouteService Directions API
    // OpenRouteService erwartet: start=lon,lat&end=lon,lat
    const startParam = `${startCoords[0]},${startCoords[1]}`;
    const endParam = `${zielCoords[0]},${zielCoords[1]}`;
    
    const apiUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${OPENROUTESERVICE_API_KEY}&start=${startParam}&end=${endParam}`;
    console.log(`🗺️ API-Anfrage für Route: ${startPLZ} → ${zielPLZ}`);
    console.log(`   Start-Koordinaten: [${startCoords[0]}, ${startCoords[1]}]`);
    console.log(`   Ziel-Koordinaten: [${zielCoords[0]}, ${zielCoords[1]}]`);
    console.log(`   API-URL: ${apiUrl.replace(OPENROUTESERVICE_API_KEY, '***')}`);
    
    // Verwende fetch ohne zusätzliche Header (CORS-Probleme vermeiden)
    const response = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-cache'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouteService API Fehler ${response.status}:`, errorText);
      throw new Error(`OpenRouteService API Fehler: ${response.status}`);
    }

    const data = await response.json();
    console.log('OpenRouteService API Antwort:', JSON.stringify(data, null, 2));

    // OpenRouteService v2 API gibt FeatureCollection zurück
    // Struktur: data.features[0].properties.segments[0].distance
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const segments = feature.properties?.segments;
      
      if (segments && segments.length > 0) {
        const segment = segments[0];
        
        // Distanz in Metern, konvertiere zu km
        const distanzMeter = segment.distance;
        const distanzKm = distanzMeter / 1000; // km
        const dauerSekunden = segment.duration;
        
        // Berechne Luftlinie zur Validierung
        const luftlinie = berechneLuftlinie(startCoords, zielCoords);
        
        console.log(`🗺️ API-Route Details für ${startPLZ} → ${zielPLZ}:`);
        console.log(`   - Route-Distanz: ${distanzMeter} m = ${distanzKm.toFixed(2)} km`);
        console.log(`   - Luftlinien-Distanz: ${luftlinie.toFixed(2)} km`);
        console.log(`   - Dauer: ${dauerSekunden} s`);
        console.log(`   - Verhältnis Route/Luftlinie: ${(distanzKm / luftlinie).toFixed(2)}x`);
        
        // Prüfe ob Distanz plausibel ist
        // Route sollte nicht mehr als 2x der Luftlinie sein (normalerweise 1.2-1.5x)
        if (distanzKm > luftlinie * 2.5) {
          console.warn(`⚠️ Route-Distanz (${distanzKm.toFixed(2)} km) ist mehr als 2.5x der Luftlinie (${luftlinie.toFixed(2)} km). Möglicherweise API-Fehler.`);
        }
        
        // Prüfe ob Distanz plausibel ist (maximal ~1000 km innerhalb Deutschlands)
        if (distanzKm > 1000) {
          console.warn(`⚠️ Unplausible Distanz: ${distanzKm} km. Möglicherweise falsche Geocodierung oder API-Fehler.`);
          console.warn(`   Start-Koordinaten: [${startCoords[0]}, ${startCoords[1]}]`);
          console.warn(`   Ziel-Koordinaten: [${zielCoords[0]}, ${zielCoords[1]}]`);
          console.warn(`   Luftlinie: ${luftlinie.toFixed(2)} km`);
          
          // Wenn Luftlinie plausibel ist, verwende diese mit einem Faktor (1.3x für typische Straßenrouten)
          if (luftlinie < 1000 && luftlinie > 0) {
            const geschaetzteDistanz = luftlinie * 1.3;
            console.log(`   → Verwende geschätzte Distanz basierend auf Luftlinie: ${geschaetzteDistanz.toFixed(2)} km`);
            return geschaetzteDistanz;
          }
          
          // Fallback: Schätzung basierend auf PLZ-Zonen
          const startZone = parseInt(startPLZ.substring(0, 2));
          const zielZone = parseInt(zielPLZ.substring(0, 2));
          const geschaetzteDistanz = Math.max(20, Math.abs(startZone - zielZone) * 50);
          console.log(`   → Verwende geschätzte Distanz basierend auf PLZ: ${geschaetzteDistanz} km`);
          return geschaetzteDistanz;
        }
        
        console.log(`✅ Berechnete Distanz: ${distanzKm.toFixed(2)} km`);
        return distanzKm;
      }
    }

    throw new Error('Keine Route gefunden');
  } catch (error) {
    console.error('Fehler bei Routenberechnung:', error);
    // Fallback: Schätzung basierend auf PLZ-Zonen
    const startZone = parseInt(startPLZ.substring(0, 2));
    const zielZone = parseInt(zielPLZ.substring(0, 2));
    const geschaetzteDistanz = Math.max(20, Math.abs(startZone - zielZone) * 50);
    console.log(`Fallback: Geschätzte Distanz: ${geschaetzteDistanz} km`);
    return geschaetzteDistanz;
  }
};

/**
 * Berechnet die benötigte Zeit für eine Fahrt
 * Berücksichtigt auch die tatsächliche Fahrzeit aus der Route (falls verfügbar)
 */
export const berechneFahrzeit = (
  distanz: number,
  durchschnittsgeschwindigkeit: number,
  tatsaechlicheFahrzeitSekunden?: number
): number => {
  // Wenn tatsächliche Fahrzeit verfügbar ist, verwende diese
  if (tatsaechlicheFahrzeitSekunden !== undefined) {
    return tatsaechlicheFahrzeitSekunden / 60; // Konvertiere Sekunden zu Minuten
  }
  
  // Sonst berechne basierend auf Distanz und Geschwindigkeit
  return (distanz / durchschnittsgeschwindigkeit) * 60;
};

/**
 * Berechnet die benötigte Pausenzeit basierend auf Fahrzeit
 * EU-Verordnung: 45 Minuten Pause nach 4,5 Stunden Fahrt
 */
export const berechnePausenzeit = (fahrzeitMinuten: number): number => {
  // 45 Minuten Pause alle 4,5 Stunden (270 Minuten)
  const anzahlPausen = Math.floor(fahrzeitMinuten / 270);
  return anzahlPausen * 45; // Minuten
};

/**
 * Berechnet die komplette Routenberechnung für Eigenlieferung
 * Berücksichtigt sowohl Hinweg als auch Rückfahrt
 */
export const berechneEigenlieferungRoute = async (
  startPLZ: string,
  zielPLZ: string,
  stammdaten: EigenlieferungStammdaten
): Promise<RoutenBerechnung> => {
  console.log(`🚛 Berechne Route für Eigenlieferung: ${startPLZ} → ${zielPLZ} → ${startPLZ}`);
  
  // Berechne Hinweg (Start → Ziel)
  console.log(`\n📤 === HINWEG BERECHNUNG ===`);
  console.log(`   Von: ${startPLZ} → Nach: ${zielPLZ}`);
  const hinwegDistanz = await berechneDistanzVonPLZ(startPLZ, zielPLZ);
  console.log(`   ✅ Hinweg berechnet: ${hinwegDistanz.toFixed(2)} km\n`);
  
  // Warte kurz, um sicherzustellen, dass die API-Anfragen nicht gecached werden
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Berechne Rückweg (Ziel → Start)
  // WICHTIG: Für Rückweg ist zielPLZ der Start und startPLZ das Ziel
  console.log(`\n📥 === RÜCKWEG BERECHNUNG ===`);
  console.log(`   Von: ${zielPLZ} → Nach: ${startPLZ}`);
  console.log(`   ⚠️ ACHTUNG: Start und Ziel sind VERTAUSCHT für Rückweg!`);
  const rueckwegDistanz = await berechneDistanzVonPLZ(zielPLZ, startPLZ);
  console.log(`   ✅ Rückweg berechnet: ${rueckwegDistanz.toFixed(2)} km\n`);
  
  // Gesamtdistanz = Hinweg + Rückweg
  const distanz = hinwegDistanz + rueckwegDistanz;
  console.log(`   Gesamtdistanz: ${distanz.toFixed(2)} km`);
  
  // Berechne Fahrzeit für Hinweg
  const hinwegFahrzeit = berechneFahrzeit(hinwegDistanz, stammdaten.durchschnittsgeschwindigkeit);
  
  // Berechne Fahrzeit für Rückweg
  const rueckwegFahrzeit = berechneFahrzeit(rueckwegDistanz, stammdaten.durchschnittsgeschwindigkeit);
  
  // Gesamtfahrzeit = Hinweg + Rückweg
  const fahrzeit = hinwegFahrzeit + rueckwegFahrzeit;
  console.log(`   Gesamtfahrzeit: ${fahrzeit.toFixed(1)} Minuten (${(fahrzeit / 60).toFixed(1)} Stunden)`);
  
  // Berechne Pausenzeit für die gesamte Fahrt
  // Pausen werden während der Fahrt gemacht, nicht nur am Ziel
  const pausenzeit = berechnePausenzeit(fahrzeit);
  
  // Gesamtzeit = Beladung + Hinweg + Abladung + Rückweg + Pausen
  // Pausen können während der Fahrt gemacht werden, daher addieren wir sie zur Fahrzeit
  const gesamtzeit = stammdaten.beladungszeit + fahrzeit + pausenzeit + stammdaten.abladungszeit;
  
  // Berechne Dieselverbrauch für die gesamte Strecke (Hinweg + Rückweg)
  const dieselverbrauch = (distanz / 100) * stammdaten.dieselverbrauchDurchschnitt;
  
  // Berechne Dieselkosten für die gesamte Strecke
  const dieselkosten = dieselverbrauch * stammdaten.dieselLiterKostenBrutto;
  
  console.log(`   Dieselverbrauch: ${dieselverbrauch.toFixed(2)} Liter`);
  console.log(`   Dieselkosten: ${dieselkosten.toFixed(2)} €`);
  
  return {
    distanz,
    fahrzeit,
    gesamtzeit,
    dieselverbrauch,
    dieselkosten,
    beladungszeit: stammdaten.beladungszeit,
    abladungszeit: stammdaten.abladungszeit,
    pausenzeit,
    hinwegDistanz,
    rueckwegDistanz,
    hinwegFahrzeit,
    rueckwegFahrzeit,
  };
};

/**
 * Formatiert Zeit in Stunden und Minuten
 */
export const formatZeit = (minuten: number): string => {
  const stunden = Math.floor(minuten / 60);
  const restMinuten = Math.round(minuten % 60);
  return `${stunden}h ${restMinuten}min`;
};

