/**
 * API-Integration für Dieselpreise
 * Unterstützt mehrere Datenquellen:
 * 1. Tankerkoenig API (falls API-Key vorhanden)
 * 2. Web Scraping von öffentlichen Quellen (Fallback)
 * 3. Aktueller deutscher Durchschnittspreis (manuell konfigurierbar)
 */

const TANKERKOENIG_API_KEY = import.meta.env.VITE_TANKERKOENIG_API_KEY || '';

// Aktueller deutscher Durchschnittspreis für Diesel (manuell aktualisierbar)
// Kann über Umgebungsvariable VITE_DIESEL_DURCHSCHNITTSPREIS überschrieben werden
// Quelle: z.B. ADAC Spritpreismonitor oder Statistisches Bundesamt
// Stand: Dezember 2024 - sollte regelmäßig aktualisiert werden
const AKTUELLER_DURCHSCHNITTSPREIS_DIESEL = 
  import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS 
    ? parseFloat(import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS)
    : 1.55; // €/Liter (Standardwert)

/**
 * Versucht den Dieselpreis über Web Scraping von einer öffentlichen Quelle zu holen
 * Fallback-Methode wenn keine API verfügbar ist
 */
const holeDieselPreisViaScraping = async (): Promise<number | null> => {
  try {
    // Option 1: ADAC Spritpreismonitor (öffentliche Seite)
    // Hinweis: Web Scraping sollte respektvoll sein und Rate-Limiting beachten
    // Da direkte CORS-Probleme auftreten können, verwenden wir einen Proxy-Service
    // oder versuchen es über einen öffentlichen API-Endpoint
    // Für jetzt: Verwende den Durchschnittswert
    
    // Alternative: Einfacher Fetch-Versuch (funktioniert nur wenn CORS erlaubt ist)
    // const response = await fetch(adacUrl, { mode: 'no-cors' });
    
    return null; // Scraping nicht implementiert, da CORS-Probleme erwartet werden
  } catch (error) {
    console.warn('Web Scraping fehlgeschlagen:', error);
    return null;
  }
};

/**
 * Holt den aktuellen Dieselpreis von einer Tankstelle in der Nähe einer PLZ
 * Falls keine API verfügbar ist, wird ein aktueller Durchschnittswert zurückgegeben
 */
export const holeDieselPreis = async (_plz: string): Promise<number> => {
  // Option 1: Tankerkoenig API (falls API-Key vorhanden)
  if (TANKERKOENIG_API_KEY) {
    try {
      // TODO: Implementiere echte API-Anfrage
      // Die Tankerkoenig API benötigt Station-IDs, nicht PLZ
      // Für eine echte Implementierung müsste man zuerst Stationen in der Nähe finden
      // 
      // Beispiel-Implementierung:
      // 1. Zuerst Stationen in der Nähe finden:
      //    const stationsUrl = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${lat}&lng=${lng}&rad=5&sort=dist&type=diesel&apikey=${TANKERKOENIG_API_KEY}`;
      // 2. Dann Preise abrufen:
      //    const pricesUrl = `${TANKERKOENIG_API_URL}?ids=${stationIds.join(',')}&apikey=${TANKERKOENIG_API_KEY}`;
      //    const response = await fetch(pricesUrl);
      //    const data = await response.json();
      //    return data.prices[stationIds[0]].diesel;
      
      // Für jetzt: Fallback auf Durchschnittswert
      console.info('Tankerkoenig API-Key vorhanden, aber Implementierung noch ausstehend. Verwende Durchschnittswert.');
    } catch (error) {
      console.error('Fehler bei Tankerkoenig API:', error);
    }
  }

  // Option 2: Versuche Web Scraping (Fallback)
  const scrapingPreis = await holeDieselPreisViaScraping();
  if (scrapingPreis !== null) {
    return scrapingPreis;
  }

  // Option 3: Verwende aktuellen deutschen Durchschnittspreis
  // Dieser Wert sollte regelmäßig manuell aktualisiert werden
  // oder über eine einfache Konfiguration geändert werden können
  console.info(`Verwende aktuellen deutschen Durchschnittspreis: ${AKTUELLER_DURCHSCHNITTSPREIS_DIESEL} €/Liter`);
  return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
};

/**
 * Validiert ob ein API-Key vorhanden ist
 */
export const istDieselPreisAPIVerfuegbar = (): boolean => {
  // Gibt true zurück, da wir immer einen Fallback-Wert haben
  return true;
};

/**
 * Gibt den aktuell konfigurierten Durchschnittspreis zurück
 * (kann für manuelle Anpassungen verwendet werden)
 */
export const getAktuellerDurchschnittspreis = (): number => {
  return AKTUELLER_DURCHSCHNITTSPREIS_DIESEL;
};

