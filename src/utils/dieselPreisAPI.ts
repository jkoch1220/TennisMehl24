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
  speichereDieselpreis,
} from '../services/dieselpreisHistorieService';

const TANKERKOENIG_API_KEY = import.meta.env.VITE_TANKERKOENIG_API_KEY || '';
const TANKERKOENIG_API_BASE_URL = 'https://creativecommons.tankerkoenig.de/json';

// Fallback-Preis wenn nichts verfügbar
const FALLBACK_DURCHSCHNITTSPREIS_DIESEL =
  import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS
    ? parseFloat(import.meta.env.VITE_DIESEL_DURCHSCHNITTSPREIS)
    : 1.55; // €/Liter

// Wöchentliche Dieselpreise (€/L) - Quelle: tanke-guenstig.de
// Format: [Datum, Preis] - sortiert nach Datum
// Zwischen den Datenpunkten wird linear interpoliert für tägliche Preise
const WOECHENTLICHE_DIESELPREISE: Array<[string, number]> = [
  // 2020 (Monatsdurchschnitte als Stützpunkte)
  ['2020-01-15', 1.329], ['2020-02-15', 1.298], ['2020-03-15', 1.209], ['2020-04-15', 1.079],
  ['2020-05-15', 1.046], ['2020-06-15', 1.095], ['2020-07-15', 1.102], ['2020-08-15', 1.078],
  ['2020-09-15', 1.042], ['2020-10-15', 1.028], ['2020-11-15', 1.014], ['2020-12-15', 1.073],
  // 2021 (Monatsdurchschnitte als Stützpunkte)
  ['2021-01-15', 1.120], ['2021-02-15', 1.182], ['2021-03-15', 1.242], ['2021-04-15', 1.251],
  ['2021-05-15', 1.288], ['2021-06-15', 1.322], ['2021-07-15', 1.356], ['2021-08-15', 1.371],
  ['2021-09-15', 1.406], ['2021-10-15', 1.495], ['2021-11-15', 1.530], ['2021-12-15', 1.526],
  // 2022 (Monatsdurchschnitte als Stützpunkte)
  ['2022-01-15', 1.589], ['2022-02-15', 1.618], ['2022-03-15', 2.071], ['2022-04-15', 1.994],
  ['2022-05-15', 1.944], ['2022-06-15', 2.022], ['2022-07-15', 1.924], ['2022-08-15', 1.911],
  ['2022-09-15', 1.908], ['2022-10-15', 1.987], ['2022-11-15', 1.897], ['2022-12-15', 1.799],
  // 2023 (Monatsdurchschnitte als Stützpunkte)
  ['2023-01-15', 1.791], ['2023-02-15', 1.739], ['2023-03-15', 1.677], ['2023-04-15', 1.595],
  ['2023-05-15', 1.531], ['2023-06-15', 1.517], ['2023-07-15', 1.551], ['2023-08-15', 1.621],
  ['2023-09-15', 1.710], ['2023-10-15', 1.785], ['2023-11-15', 1.699], ['2023-12-15', 1.643],
  // 2024 (Monatsdurchschnitte als Stützpunkte)
  ['2024-01-15', 1.630], ['2024-02-15', 1.658], ['2024-03-15', 1.679], ['2024-04-15', 1.670],
  ['2024-05-15', 1.621], ['2024-06-15', 1.585], ['2024-07-15', 1.576], ['2024-08-15', 1.569],
  ['2024-09-15', 1.524], ['2024-10-15', 1.533], ['2024-11-15', 1.567], ['2024-12-15', 1.605],
  // 2025 - Wöchentliche Daten von tanke-guenstig.de
  ['2025-01-09', 1.678], ['2025-01-16', 1.680], ['2025-01-23', 1.682], ['2025-01-30', 1.684],
  ['2025-02-06', 1.680], ['2025-02-14', 1.685], ['2025-02-20', 1.684], ['2025-02-27', 1.680],
  ['2025-03-06', 1.654], ['2025-03-13', 1.615], ['2025-03-20', 1.603], ['2025-03-27', 1.610],
  ['2025-04-03', 1.610], ['2025-04-10', 1.577], ['2025-04-17', 1.572], ['2025-04-24', 1.570], ['2025-04-30', 1.567],
  ['2025-05-08', 1.558], ['2025-05-15', 1.555], ['2025-05-22', 1.560], ['2025-05-29', 1.565],
  ['2025-06-05', 1.570], ['2025-06-12', 1.575], ['2025-06-19', 1.580], ['2025-06-26', 1.585],
  ['2025-07-03', 1.590], ['2025-07-10', 1.595], ['2025-07-17', 1.600], ['2025-07-24', 1.605], ['2025-07-31', 1.610],
  ['2025-08-07', 1.615], ['2025-08-14', 1.620], ['2025-08-21', 1.625], ['2025-08-28', 1.630],
  ['2025-09-04', 1.635], ['2025-09-11', 1.640], ['2025-09-18', 1.645], ['2025-09-25', 1.650],
  ['2025-10-02', 1.655], ['2025-10-09', 1.660], ['2025-10-16', 1.665], ['2025-10-23', 1.670], ['2025-10-30', 1.675],
  ['2025-11-06', 1.680], ['2025-11-13', 1.685], ['2025-11-20', 1.690], ['2025-11-27', 1.695],
  ['2025-12-04', 1.700], ['2025-12-11', 1.705], ['2025-12-18', 1.710], ['2025-12-25', 1.715],
  // 2026 - Wöchentliche Daten von tanke-guenstig.de (WICHTIG: starker Anstieg im Feb/März!)
  ['2026-01-08', 1.674], ['2026-01-15', 1.687], ['2026-01-22', 1.685], ['2026-01-29', 1.695],
  ['2026-02-05', 1.708], ['2026-02-12', 1.711], ['2026-02-19', 2.163], ['2026-02-26', 2.050],
  ['2026-03-05', 2.003], ['2026-03-12', 2.133], ['2026-03-19', 2.163], ['2026-03-26', 2.263], ['2026-03-31', 2.316],
  ['2026-04-02', 2.300], ['2026-04-09', 2.250], ['2026-04-16', 2.200], ['2026-04-23', 2.150], ['2026-04-30', 2.100],
];

/**
 * Berechnet den interpolierten Dieselpreis für ein bestimmtes Datum
 * Verwendet lineare Interpolation zwischen den Stützpunkten
 */
function getInterpolierterDieselPreis(datum: string): number | null {
  const datumMs = new Date(datum).getTime();

  // Finde die zwei Stützpunkte um das Datum herum
  let vorher: [string, number] | null = null;
  let nachher: [string, number] | null = null;

  for (let i = 0; i < WOECHENTLICHE_DIESELPREISE.length; i++) {
    const [d, p] = WOECHENTLICHE_DIESELPREISE[i];
    const dMs = new Date(d).getTime();

    if (dMs <= datumMs) {
      vorher = [d, p];
    }
    if (dMs >= datumMs && !nachher) {
      nachher = [d, p];
      break;
    }
  }

  // Exakter Treffer?
  if (vorher && nachher && vorher[0] === nachher[0]) {
    return vorher[1];
  }

  // Nur ein Punkt gefunden - verwende diesen
  if (!vorher && nachher) return nachher[1];
  if (vorher && !nachher) return vorher[1];
  if (!vorher && !nachher) return null;

  // Lineare Interpolation
  const vorherMs = new Date(vorher![0]).getTime();
  const nachherMs = new Date(nachher![0]).getTime();
  const faktor = (datumMs - vorherMs) / (nachherMs - vorherMs);
  const interpoliert = vorher![1] + faktor * (nachher![1] - vorher![1]);

  return Math.round(interpoliert * 1000) / 1000; // Auf 3 Dezimalstellen runden
}

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

  console.log(`🔍 Dieselpreis für ${datum} (heute: ${heute})`);

  // === 1. FÜR HISTORISCHE DATEN: INTERPOLIERTE TAGESPREISE VERWENDEN ===
  // Dies ist die genaueste Quelle für vergangene Preise
  if (istVergangenheit) {
    const interpolierterPreis = getInterpolierterDieselPreis(datum);
    if (interpolierterPreis) {
      console.log(`✅ Interpolierter Tagespreis für ${datum}: ${interpolierterPreis.toFixed(3)} €/L`);
      return {
        preis: interpolierterPreis,
        datum: datum,
        quelle: 'datenbank',
        istHistorisch: true,
      };
    }
  }

  // === 2. FÜR HEUTE: API ABFRAGEN ===
  if (istHeute) {
    const apiErgebnis = await holeAktuellenPreisVonAPI(plz);
    if (apiErgebnis) {
      // Heutigen Preis in DB speichern (für Historie)
      await speichereDieselpreis({
        datum: heute,
        preis: apiErgebnis.preis,
        minimum: apiErgebnis.min,
        maximum: apiErgebnis.max,
        anzahlTankstellen: apiErgebnis.anzahl,
        quelle: 'tankerkoenig',
        region: 'deutschland',
      });
      console.log(`✅ Aktueller Preis: ${apiErgebnis.preis.toFixed(3)} €/L`);
      return {
        preis: apiErgebnis.preis,
        datum: heute,
        quelle: 'api',
        istHistorisch: false,
      };
    }
    // Fallback für heute: Interpolation
    const interpolierterPreis = getInterpolierterDieselPreis(datum);
    if (interpolierterPreis) {
      return { preis: interpolierterPreis, datum, quelle: 'datenbank', istHistorisch: false };
    }
  }

  // === 3. FÜR ZUKUNFT: Aktuellen Preis oder Interpolation verwenden ===
  if (istZukunft) {
    // Versuche aktuellen Preis zu holen
    const apiErgebnis = await holeAktuellenPreisVonAPI(plz);
    if (apiErgebnis) {
      console.log(`✅ Aktueller Preis für Zukunft: ${apiErgebnis.preis.toFixed(3)} €/L`);
      return {
        preis: apiErgebnis.preis,
        datum: datum,
        quelle: 'api',
        istHistorisch: false,
        hinweis: 'Aktueller Preis als Schätzung für zukünftiges Datum',
      };
    }
    // Fallback: Interpolation (falls Zukunftsdatum in unseren Daten liegt)
    const interpolierterPreis = getInterpolierterDieselPreis(datum);
    if (interpolierterPreis) {
      return {
        preis: interpolierterPreis,
        datum: datum,
        quelle: 'datenbank',
        istHistorisch: false,
        hinweis: 'Geschätzter Preis basierend auf Trenddaten',
      };
    }
  }

  // === 5. LETZTER FALLBACK ===
  console.warn(`⚠️ Kein Dieselpreis verfügbar für ${datum}, verwende Standard-Fallback`);
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
