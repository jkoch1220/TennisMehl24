/**
 * API-Integration für Dieselpreise
 *
 * Datenquellen (in Prioritätsreihenfolge):
 * 1. Appwrite Datenbank (historische Preise pro Datum)
 * 2. Backend API (wenn VITE_USE_BACKEND=true) - mit Redis-Cache
 * 3. Tankerkoenig API direkt (falls Backend nicht verfügbar)
 * 4. Fallback: Aktueller deutscher Durchschnittspreis
 *
 * WICHTIG: Bei historischen Daten wird der Preis aus der DB geladen.
 * Bei aktuellen Daten wird der Preis von der API geholt UND in der DB gespeichert.
 */

import { getKoordinatenFuerPLZ } from '../data/plzKoordinaten';
import { useBackend, backendFetch } from '../config/backend';
import {
  holeDieselpreisAusDB,
  speichereDieselpreis,
  findeNaechstenDieselpreis,
} from '../services/dieselpreisHistorieService';

const TANKERKOENIG_API_KEY = import.meta.env.VITE_TANKERKOENIG_API_KEY || '';
const TANKERKOENIG_API_BASE_URL = 'https://creativecommons.tankerkoenig.de/json';

// Fallback-Preis wenn nichts verfügbar
const FALLBACK_DURCHSCHNITTSPREIS_DIESEL =
  import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS
    ? parseFloat(import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS)
    : 1.55; // €/Liter

// Backend API Response Interface
interface BackendDieselResponse {
  success: boolean;
  durchschnitt: number;
  minimum?: number;
  maximum?: number;
  stations?: number;
  timestamp?: string;
  error?: string;
}

// Ergebnis-Interface mit Metadaten
export interface DieselPreisErgebnis {
  preis: number;
  datum: string;
  quelle: 'datenbank' | 'api' | 'fallback';
  istHistorisch: boolean;
  hinweis?: string;
}

/**
 * Geocodiert eine PLZ zu Koordinaten (für Tankerkönig-API)
 */
const geocodePLZFuerDieselPreis = (plz: string): [number, number] | null => {
  const coords = getKoordinatenFuerPLZ(plz);
  if (coords) {
    return [coords.lng, coords.lat]; // [lon, lat]
  }
  return null;
};

/**
 * Holt den aktuellen Dieselpreis von der Tankerkönig API
 */
async function holeAktuellenPreisVonAPI(plz: string): Promise<{ preis: number; min?: number; max?: number; anzahl?: number } | null> {
  // Option 1: Backend API
  if (useBackend('diesel')) {
    try {
      console.log(`🔍 Hole Dieselpreis vom Backend für PLZ ${plz}...`);
      const response = await backendFetch<BackendDieselResponse>(
        `/api/geo/diesel-preis/preis?plz=${plz}&radius=15`
      );

      if (response.success && response.durchschnitt > 0) {
        console.log(`✅ Backend: Dieselpreis ${response.durchschnitt.toFixed(3)} €/L`);
        return {
          preis: response.durchschnitt,
          min: response.minimum,
          max: response.maximum,
          anzahl: response.stations,
        };
      }
    } catch (error) {
      console.warn('⚠️ Backend nicht erreichbar:', error);
    }
  }

  // Option 2: Direkter Tankerkoenig API Call
  if (TANKERKOENIG_API_KEY) {
    try {
      const koordinaten = geocodePLZFuerDieselPreis(plz);
      if (!koordinaten) {
        console.warn(`⚠️ Konnte PLZ ${plz} nicht geocodieren`);
        return null;
      }

      const [lon, lat] = koordinaten;
      const apiUrl = `${TANKERKOENIG_API_BASE_URL}/list.php?lat=${lat}&lng=${lon}&rad=15&type=diesel&sort=price&apikey=${TANKERKOENIG_API_KEY}`;

      console.log(`🔍 Hole Dieselpreise von Tankerkönig-API für PLZ ${plz}...`);
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`API Fehler: ${response.status}`);
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.message || 'Unbekannter Fehler');
      }

      const stations = data.stations || [];
      const dieselPreise: number[] = [];

      for (const station of stations) {
        if (station.isOpen && station.price && typeof station.price === 'number' && station.price > 0) {
          dieselPreise.push(station.price);
        }
      }

      if (dieselPreise.length > 0) {
        const durchschnitt = dieselPreise.reduce((sum, p) => sum + p, 0) / dieselPreise.length;
        const min = Math.min(...dieselPreise);
        const max = Math.max(...dieselPreise);

        console.log(`✅ Tankerkönig: ${dieselPreise.length} Tankstellen, Durchschnitt: ${durchschnitt.toFixed(3)} €/L`);
        return { preis: durchschnitt, min, max, anzahl: dieselPreise.length };
      }
    } catch (error) {
      console.error('❌ Tankerkönig-API Fehler:', error);
    }
  }

  return null;
}

/**
 * NEUE HAUPTFUNKTION: Holt den Dieselpreis für ein bestimmtes Datum
 *
 * @param datum - ISO-Datum (YYYY-MM-DD) für das der Preis benötigt wird
 * @param plz - PLZ für die API-Abfrage (falls kein historischer Preis vorhanden)
 * @returns Preis-Ergebnis mit Metadaten
 */
export async function holeDieselPreisFuerDatum(
  datum: string,
  plz: string = '97828'
): Promise<DieselPreisErgebnis> {
  const heute = new Date().toISOString().split('T')[0];
  const istHeute = datum === heute;
  const istVergangenheit = datum < heute;
  const istZukunft = datum > heute;

  // === 1. DATENBANK PRÜFEN (historische Preise) ===
  console.log(`🔍 Suche Dieselpreis für ${datum} in Datenbank...`);

  // Exakten Treffer suchen
  let dbEintrag = await holeDieselpreisAusDB(datum);

  if (dbEintrag) {
    console.log(`✅ Dieselpreis aus DB: ${dbEintrag.preis.toFixed(3)} €/L für ${datum}`);
    return {
      preis: dbEintrag.preis,
      datum: dbEintrag.datum,
      quelle: 'datenbank',
      istHistorisch: istVergangenheit,
    };
  }

  // === 2. FÜR HEUTE/ZUKUNFT: API ABFRAGEN UND SPEICHERN ===
  if (istHeute || istZukunft) {
    const apiErgebnis = await holeAktuellenPreisVonAPI(plz);

    if (apiErgebnis) {
      // Heutigen Preis in DB speichern (für Historie)
      if (istHeute) {
        await speichereDieselpreis({
          datum: heute,
          preis: apiErgebnis.preis,
          minimum: apiErgebnis.min,
          maximum: apiErgebnis.max,
          anzahlTankstellen: apiErgebnis.anzahl,
          quelle: 'tankerkoenig',
          region: 'deutschland',
        });
        console.log(`💾 Dieselpreis für ${heute} in DB gespeichert`);
      }

      return {
        preis: apiErgebnis.preis,
        datum: istHeute ? heute : datum,
        quelle: 'api',
        istHistorisch: false,
        hinweis: istZukunft ? 'Aktueller Preis als Schätzung für zukünftiges Datum' : undefined,
      };
    }
  }

  // === 3. FÜR VERGANGENHEIT: NÄCHSTEN VERFÜGBAREN PREIS SUCHEN ===
  if (istVergangenheit) {
    const naechster = await findeNaechstenDieselpreis(datum);

    if (naechster) {
      const tageUnterschied = Math.abs(
        (new Date(datum).getTime() - new Date(naechster.datum).getTime()) / (1000 * 60 * 60 * 24)
      );

      console.log(`📅 Nächster verfügbarer Preis: ${naechster.preis.toFixed(3)} €/L vom ${naechster.datum} (${Math.round(tageUnterschied)} Tage Unterschied)`);

      return {
        preis: naechster.preis,
        datum: naechster.datum,
        quelle: 'datenbank',
        istHistorisch: true,
        hinweis: `Preis vom ${naechster.datum} verwendet (${Math.round(tageUnterschied)} Tage vor Leistungsdatum)`,
      };
    }
  }

  // === 4. FALLBACK ===
  console.warn(`⚠️ Kein Dieselpreis verfügbar für ${datum}, verwende Fallback`);
  return {
    preis: FALLBACK_DURCHSCHNITTSPREIS_DIESEL,
    datum: datum,
    quelle: 'fallback',
    istHistorisch: istVergangenheit,
    hinweis: 'Kein historischer Preis verfügbar - Fallback-Wert verwendet. Bitte manuell eingeben.',
  };
}

/**
 * LEGACY-FUNKTION: Holt den aktuellen Dieselpreis (ohne Datum)
 * Für Abwärtskompatibilität beibehalten.
 *
 * @deprecated Verwende holeDieselPreisFuerDatum() stattdessen
 */
export const holeDieselPreis = async (plz: string): Promise<number> => {
  const heute = new Date().toISOString().split('T')[0];
  const ergebnis = await holeDieselPreisFuerDatum(heute, plz);
  return ergebnis.preis;
};

/**
 * Validiert ob die Tankerkönig-API verfügbar ist
 */
export const istDieselPreisAPIVerfuegbar = (): boolean => {
  return TANKERKOENIG_API_KEY.length > 0;
};

/**
 * Gibt den Fallback-Durchschnittspreis zurück
 */
export const getAktuellerDurchschnittspreis = (): number => {
  return FALLBACK_DURCHSCHNITTSPREIS_DIESEL;
};
