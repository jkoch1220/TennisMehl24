/**
 * API-Integration für Dieselpreise
 *
 * SICHERHEITSHINWEIS:
 * Diese Datei ruft jetzt das sichere Backend auf.
 * Der TankerKoenig API-Key ist NUR auf dem Server gespeichert.
 */

import { backendApi, FuelPriceResult } from '../services/api/backendClient';

// Fallback Durchschnittspreis (wird verwendet wenn Backend nicht erreichbar)
const FALLBACK_DURCHSCHNITTSPREIS_DIESEL = 1.55; // €/Liter

/**
 * Holt den aktuellen Dieselpreis über das sichere Backend
 * Falls Backend nicht verfügbar ist, wird ein Fallback-Wert zurückgegeben
 */
export const holeDieselPreis = async (plz: string): Promise<number> => {
  try {
    console.log(`🔍 Hole Dieselpreis für PLZ ${plz} vom Backend...`);

    const result = await backendApi.fuel.getDieselPrice(plz);

    if (result.success && result.preis) {
      console.log(`✅ Dieselpreis erhalten: ${result.preis.toFixed(3)} €/L (Quelle: ${result.quelle})`);
      if (result.anzahlTankstellen) {
        console.log(`   ${result.anzahlTankstellen} Tankstellen im Umkreis`);
      }
      return result.preis;
    } else {
      console.warn(`⚠️ Kein Preis erhalten, verwende Fallback: ${FALLBACK_DURCHSCHNITTSPREIS_DIESEL} €/L`);
      return FALLBACK_DURCHSCHNITTSPREIS_DIESEL;
    }
  } catch (error) {
    console.error('❌ Fehler beim Abrufen des Dieselpreises:', error);
    console.log(`   → Fallback auf Durchschnittspreis: ${FALLBACK_DURCHSCHNITTSPREIS_DIESEL} €/L`);
    return FALLBACK_DURCHSCHNITTSPREIS_DIESEL;
  }
};

/**
 * Holt detaillierte Dieselpreis-Informationen
 */
export const holeDieselPreisDetails = async (
  plz: string,
  radius?: number
): Promise<FuelPriceResult> => {
  try {
    return await backendApi.fuel.getDieselPrice(plz, radius);
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Dieselpreis-Details:', error);
    return {
      success: false,
      preis: FALLBACK_DURCHSCHNITTSPREIS_DIESEL,
      quelle: 'fallback',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
    };
  }
};

/**
 * Prüft ob die Dieselpreis-API verfügbar ist
 * (Backend ist immer verfügbar wenn Server läuft)
 */
export const istDieselPreisAPIVerfuegbar = (): boolean => {
  return true;
};

/**
 * Gibt den Fallback-Durchschnittspreis zurück
 */
export const getAktuellerDurchschnittspreis = (): number => {
  return FALLBACK_DURCHSCHNITTSPREIS_DIESEL;
};

// Re-export type
export type { FuelPriceResult };
