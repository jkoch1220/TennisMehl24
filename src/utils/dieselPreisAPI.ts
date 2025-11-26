/**
 * API-Integration für Dieselpreise
 * Unterstützt mehrere Datenquellen:
 * 1. Tankerkoenig API (falls API-Key vorhanden) - automatisch aktuelle Preise
 * 2. Aktueller deutscher Durchschnittspreis (manuell konfigurierbar) - Fallback
 */

const TANKERKOENIG_API_KEY = import.meta.env.VITE_TANKERKOENIG_API_KEY || '';
const TANKERKOENIG_API_BASE_URL = 'https://creativecommons.tankerkoenig.de/json';

// Aktueller deutscher Durchschnittspreis für Diesel (Fallback wenn API nicht verfügbar)
// Kann über Umgebungsvariable VITE_DIESEL_DURCHSCHNITTSPREIS überschrieben werden
const AKTUELLER_DURCHSCHNITTSPREIS_DIESEL = 
  import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS 
    ? parseFloat(import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS)
    : 1.55; // €/Liter (Standardwert)

/**
 * Geocodiert eine PLZ zu Koordinaten (für Tankerkönig-API)
 * Nutzt Nominatim als primäre Quelle
 */
const geocodePLZFuerDieselPreis = async (plz: string): Promise<[number, number] | null> => {
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?postalcode=${plz}&countrycodes=de&format=json&limit=1`;
    
    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'TennisMehl-Kostenrechner/1.0'
      }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = data[0];
      const lon = parseFloat(result.lon);
      const lat = parseFloat(result.lat);
      return [lon, lat];
    }
    
    return null;
  } catch (error) {
    console.warn('Geocodierung für Dieselpreis fehlgeschlagen:', error);
    return null;
  }
};

/**
 * Holt den aktuellen Dieselpreis von Tankerkönig-API basierend auf PLZ
 * Falls API nicht verfügbar ist oder fehlschlägt, wird ein Durchschnittswert zurückgegeben
 */
export const holeDieselPreis = async (plz: string): Promise<number> => {
  // Option 1: Tankerkoenig API (falls API-Key vorhanden)
  if (TANKERKOENIG_API_KEY) {
    try {
      // 1. Geocodiere PLZ zu Koordinaten
      const koordinaten = await geocodePLZFuerDieselPreis(plz);
      
      if (!koordinaten) {
        console.warn(`⚠️ Konnte PLZ ${plz} nicht geocodieren, verwende Durchschnittspreis`);
        return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
      }
      
      const [lon, lat] = koordinaten;
      
      // 2. Hole Tankstellen-Liste mit aktuellen Preisen von Tankerkönig-API
      // Die list.php API gibt direkt Preise zurück, kein separater Call nötig
      const radius = 10; // 10 km Radius
      const apiUrl = `${TANKERKOENIG_API_BASE_URL}/list.php?lat=${lat}&lng=${lon}&rad=${radius}&type=diesel&sort=price&apikey=${TANKERKOENIG_API_KEY}`;
      
      console.log(`🔍 Hole Dieselpreise von Tankerkönig-API für PLZ ${plz} (Koordinaten: ${lat}, ${lon})...`);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Tankerkönig API Fehler: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Prüfe ob API erfolgreich war
      if (!data.ok) {
        throw new Error(`Tankerkönig API Fehler: ${data.message || 'Unbekannter Fehler'}`);
      }
      
      // Extrahiere Dieselpreise von geöffneten Tankstellen
      const stations = data.stations || [];
      const dieselPreise: number[] = [];
      
      for (const station of stations) {
        // Nur geöffnete Tankstellen mit gültigem Dieselpreis berücksichtigen
        if (station.isOpen && station.diesel && typeof station.diesel === 'number' && station.diesel > 0) {
          dieselPreise.push(station.diesel);
        }
      }
      
      if (dieselPreise.length > 0) {
        // Berechne Durchschnittspreis (könnte auch günstigsten nehmen)
        const durchschnittspreis = dieselPreise.reduce((sum, preis) => sum + preis, 0) / dieselPreise.length;
        const guenstigsterPreis = Math.min(...dieselPreise);
        
        console.log(`✅ Tankerkönig-API: ${dieselPreise.length} Tankstellen gefunden`);
        console.log(`   Günstigster Preis: ${guenstigsterPreis.toFixed(3)} €/Liter`);
        console.log(`   Durchschnittspreis: ${durchschnittspreis.toFixed(3)} €/Liter`);
        console.log(`   → Verwende Durchschnittspreis: ${durchschnittspreis.toFixed(3)} €/Liter`);
        
        return durchschnittspreis;
      } else {
        console.warn(`⚠️ Keine geöffneten Tankstellen mit Dieselpreis gefunden für PLZ ${plz}, verwende Durchschnittspreis`);
        return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
      }
    } catch (error) {
      console.error('❌ Fehler bei Tankerkönig-API:', error);
      console.log(`   → Fallback auf Durchschnittspreis: ${AKTUELLER_DURCHSCHNITTSPREIS_DIESEL} €/Liter`);
      return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
    }
  }

  // Option 2: Fallback auf Durchschnittspreis wenn kein API-Key vorhanden
  console.info(`ℹ️ Kein Tankerkönig-API-Key vorhanden, verwende Durchschnittspreis: ${AKTUELLER_DURCHSCHNITTSPREIS_DIESEL} €/Liter`);
  return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
};

/**
 * Validiert ob die Tankerkönig-API verfügbar ist
 */
export const istDieselPreisAPIVerfuegbar = (): boolean => {
  return TANKERKOENIG_API_KEY.length > 0;
};

/**
 * Gibt den aktuell konfigurierten Durchschnittspreis zurück
 * (kann für manuelle Anpassungen verwendet werden)
 */
export const getAktuellerDurchschnittspreis = (): number => {
  return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
};

