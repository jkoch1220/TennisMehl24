/**
 * Dieselpreis-Historie Service
 *
 * Speichert und lädt historische Dieselpreise aus Appwrite.
 * Kombiniert mit Tankerkönig-API für aktuelle Preise.
 */

import { Query, ID } from 'appwrite';
import { databases, DATABASE_ID, COLLECTIONS } from '../config/appwrite';

// Interface für einen Dieselpreis-Eintrag
export interface DieselpreisEintrag {
  $id?: string;
  datum: string;           // Format: YYYY-MM-DD
  preis: number;           // Durchschnittspreis in €/L
  minimum?: number;        // Niedrigster Preis
  maximum?: number;        // Höchster Preis
  anzahlTankstellen?: number;
  quelle: 'tankerkoenig' | 'manuell' | 'import';
  region?: string;         // z.B. "deutschland" oder "97" für PLZ-Region
  $createdAt?: string;
  $updatedAt?: string;
}

// Cache für schnellen Zugriff (verhindert wiederholte DB-Abfragen)
const preisCache = new Map<string, DieselpreisEintrag>();
let cacheLadezeit: number = 0;
const CACHE_GUELTIG_MS = 5 * 60 * 1000; // 5 Minuten

/**
 * Lädt den Dieselpreis für ein bestimmtes Datum aus der Datenbank
 */
export async function holeDieselpreisAusDB(datum: string): Promise<DieselpreisEintrag | null> {
  // Cache prüfen
  const cached = preisCache.get(datum);
  if (cached && Date.now() - cacheLadezeit < CACHE_GUELTIG_MS) {
    return cached;
  }

  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.DIESELPREISE,
      [
        Query.equal('datum', datum),
        Query.limit(1)
      ]
    );

    if (response.documents.length > 0) {
      const eintrag = response.documents[0] as unknown as DieselpreisEintrag;
      preisCache.set(datum, eintrag);
      cacheLadezeit = Date.now();
      return eintrag;
    }

    return null;
  } catch (error) {
    console.warn('Fehler beim Laden des Dieselpreises aus DB:', error);
    return null;
  }
}

/**
 * Speichert einen Dieselpreis in der Datenbank
 */
export async function speichereDieselpreis(eintrag: Omit<DieselpreisEintrag, '$id' | '$createdAt' | '$updatedAt'>): Promise<DieselpreisEintrag | null> {
  try {
    // Prüfen ob Eintrag für dieses Datum schon existiert
    const existing = await holeDieselpreisAusDB(eintrag.datum);

    if (existing?.$id) {
      // Update
      const updated = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.DIESELPREISE,
        existing.$id,
        {
          preis: eintrag.preis,
          minimum: eintrag.minimum,
          maximum: eintrag.maximum,
          anzahlTankstellen: eintrag.anzahlTankstellen,
          quelle: eintrag.quelle,
          region: eintrag.region,
        }
      );
      const result = updated as unknown as DieselpreisEintrag;
      preisCache.set(eintrag.datum, result);
      return result;
    } else {
      // Create
      const created = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.DIESELPREISE,
        ID.unique(),
        {
          datum: eintrag.datum,
          preis: eintrag.preis,
          minimum: eintrag.minimum,
          maximum: eintrag.maximum,
          anzahlTankstellen: eintrag.anzahlTankstellen,
          quelle: eintrag.quelle,
          region: eintrag.region || 'deutschland',
        }
      );
      const result = created as unknown as DieselpreisEintrag;
      preisCache.set(eintrag.datum, result);
      return result;
    }
  } catch (error) {
    console.error('Fehler beim Speichern des Dieselpreises:', error);
    return null;
  }
}

/**
 * Lädt alle Dieselpreise für einen Zeitraum
 */
export async function holeDieselpreiseZeitraum(
  vonDatum: string,
  bisDatum: string
): Promise<DieselpreisEintrag[]> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.DIESELPREISE,
      [
        Query.greaterThanEqual('datum', vonDatum),
        Query.lessThanEqual('datum', bisDatum),
        Query.orderAsc('datum'),
        Query.limit(1000)
      ]
    );

    return response.documents as unknown as DieselpreisEintrag[];
  } catch (error) {
    console.warn('Fehler beim Laden der Dieselpreise:', error);
    return [];
  }
}

/**
 * Findet den nächsten verfügbaren Preis für ein Datum
 * (falls kein exakter Treffer, sucht den nächsten Tag davor)
 */
export async function findeNaechstenDieselpreis(datum: string): Promise<DieselpreisEintrag | null> {
  // Erst exakten Treffer versuchen
  const exakt = await holeDieselpreisAusDB(datum);
  if (exakt) return exakt;

  try {
    // Suche den nächsten Preis VOR dem Datum
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.DIESELPREISE,
      [
        Query.lessThanEqual('datum', datum),
        Query.orderDesc('datum'),
        Query.limit(1)
      ]
    );

    if (response.documents.length > 0) {
      return response.documents[0] as unknown as DieselpreisEintrag;
    }

    return null;
  } catch (error) {
    console.warn('Fehler beim Suchen des nächsten Dieselpreises:', error);
    return null;
  }
}

/**
 * Speichert den heutigen Preis von der Tankerkönig API
 * (Für täglichen Cron-Job)
 */
export async function speichereHeutigenPreis(
  preis: number,
  minimum?: number,
  maximum?: number,
  anzahlTankstellen?: number
): Promise<DieselpreisEintrag | null> {
  const heute = new Date().toISOString().split('T')[0];

  return speichereDieselpreis({
    datum: heute,
    preis,
    minimum,
    maximum,
    anzahlTankstellen,
    quelle: 'tankerkoenig',
    region: 'deutschland',
  });
}

/**
 * Batch-Import von Dieselpreisen (für historische Daten)
 */
export async function importiereDieselpreise(
  eintraege: Array<Omit<DieselpreisEintrag, '$id' | '$createdAt' | '$updatedAt'>>
): Promise<{ erfolg: number; fehler: number }> {
  let erfolg = 0;
  let fehler = 0;

  for (const eintrag of eintraege) {
    try {
      await speichereDieselpreis(eintrag);
      erfolg++;
    } catch {
      fehler++;
    }

    // Rate limiting - nicht zu schnell
    if (erfolg % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`Import abgeschlossen: ${erfolg} erfolgreich, ${fehler} Fehler`);
  return { erfolg, fehler };
}

/**
 * Löscht den lokalen Cache
 */
export function loescheCache(): void {
  preisCache.clear();
  cacheLadezeit = 0;
}
