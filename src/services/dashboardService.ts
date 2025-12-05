import { databases } from '../config/appwrite';
import { DATABASE_ID } from '../config/appwrite';
import type { LagerBestand, DashboardStats } from '../types/dashboard';

export const LAGER_COLLECTION_ID = 'lager_bestand';
export const LAGER_DOCUMENT_ID = 'lager_data';

// Default-Werte für neuen Lagerbestand
const DEFAULT_LAGER_BESTAND: LagerBestand = {
  ziegelschutt: 0,
  ziegelmehlSchuettware: 0,
  ziegelmehlSackware: 0,
  hammerBestand: 0,
  anstehendeAuslieferungen: 0,
  
  ziegelschuttMin: 100,
  ziegelschuttMax: 1000,
  ziegelmehlSchuettwareMin: 50,
  ziegelmehlSchuettwareMax: 500,
  ziegelmehlSackwareMin: 200,
  ziegelmehlSackwareMax: 2000,
  hammerBestandMin: 10,
  hammerBestandMax: 100,
};

export const dashboardService = {
  // Lagerbestand abrufen
  async getLagerBestand(): Promise<LagerBestand> {
    try {
      const response = await databases.getDocument(
        DATABASE_ID,
        LAGER_COLLECTION_ID,
        LAGER_DOCUMENT_ID
      );
      
      // Parse data aus JSON-String
      const data = JSON.parse(response.data);
      
      return {
        id: response.$id,
        ...data,
        letztesUpdate: response.$updatedAt,
      };
    } catch (error: any) {
      if (error.code === 404) {
        // Dokument existiert nicht, erstelle es
        return await dashboardService.updateLagerBestand(DEFAULT_LAGER_BESTAND);
      }
      console.error('Fehler beim Laden des Lagerbestands:', error);
      throw error;
    }
  },

  // Lagerbestand aktualisieren
  async updateLagerBestand(bestand: LagerBestand): Promise<LagerBestand> {
    try {
      // Speichere alle Daten als JSON-String im data-Feld
      const dataToSave = {
        ziegelschutt: bestand.ziegelschutt,
        ziegelmehlSchuettware: bestand.ziegelmehlSchuettware,
        ziegelmehlSackware: bestand.ziegelmehlSackware,
        hammerBestand: bestand.hammerBestand,
        anstehendeAuslieferungen: bestand.anstehendeAuslieferungen,
        ziegelschuttMin: bestand.ziegelschuttMin,
        ziegelschuttMax: bestand.ziegelschuttMax,
        ziegelmehlSchuettwareMin: bestand.ziegelmehlSchuettwareMin,
        ziegelmehlSchuettwareMax: bestand.ziegelmehlSchuettwareMax,
        ziegelmehlSackwareMin: bestand.ziegelmehlSackwareMin,
        ziegelmehlSackwareMax: bestand.ziegelmehlSackwareMax,
        hammerBestandMin: bestand.hammerBestandMin,
        hammerBestandMax: bestand.hammerBestandMax,
      };

      try {
        // Versuche zu aktualisieren
        const response = await databases.updateDocument(
          DATABASE_ID,
          LAGER_COLLECTION_ID,
          LAGER_DOCUMENT_ID,
          {
            data: JSON.stringify(dataToSave)
          }
        );
        
        return {
          id: response.$id,
          ...dataToSave,
          letztesUpdate: response.$updatedAt,
        };
      } catch (updateError: any) {
        if (updateError.code === 404) {
          // Dokument existiert nicht, erstelle es
          const response = await databases.createDocument(
            DATABASE_ID,
            LAGER_COLLECTION_ID,
            LAGER_DOCUMENT_ID,
            {
              data: JSON.stringify(dataToSave)
            }
          );
          
          return {
            id: response.$id,
            ...dataToSave,
            letztesUpdate: response.$updatedAt,
          };
        }
        throw updateError;
      }
    } catch (error) {
      console.error('Fehler beim Speichern des Lagerbestands:', error);
      throw error;
    }
  },

  // Alle Dashboard-Statistiken
  async getDashboardStats(): Promise<DashboardStats> {
    const lagerBestand = await dashboardService.getLagerBestand();

    return {
      lagerBestand,
    };
  },
};
