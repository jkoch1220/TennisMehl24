import { databases, DATABASE_ID, VARIABLE_KOSTEN_COLLECTION_ID, VARIABLE_KOSTEN_DOCUMENT_ID } from '../config/appwrite';
import { VariableKostenInput, VerkaufspreisEingabe } from '../types';
import { flattenVariableKosten, unflattenVariableKosten } from '../utils/dataConverter';

export const variableKostenService = {
  // Lade Variable Kosten-Daten
  async loadVariableKosten(): Promise<VariableKostenInput | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        VARIABLE_KOSTEN_COLLECTION_ID,
        VARIABLE_KOSTEN_DOCUMENT_ID
      );
      
      // Konvertiere JSON-String zurück zu VariableKostenInput
      if (document.data && typeof document.data === 'string') {
        const data = JSON.parse(document.data);
        return unflattenVariableKosten(data);
      }
      
      // Fallback: Altes Format (wenn noch einzelne Felder vorhanden)
      return unflattenVariableKosten(document as any);
    } catch (error: any) {
      // Wenn Dokument nicht existiert, gib null zurück
      if (error.code === 404) {
        return null;
      }
      console.error('Fehler beim Laden der Variable Kosten:', error);
      throw error;
    }
  },

  // Speichere Variable Kosten-Daten
  async saveVariableKosten(data: VariableKostenInput): Promise<void> {
    const flattened = flattenVariableKosten(data);
    const dataJson = JSON.stringify(flattened);
    
    try {
      // Versuche zuerst zu aktualisieren
      await databases.updateDocument(
        DATABASE_ID,
        VARIABLE_KOSTEN_COLLECTION_ID,
        VARIABLE_KOSTEN_DOCUMENT_ID,
        {
          data: dataJson,
        }
      );
    } catch (error: any) {
      // Wenn Dokument nicht existiert, erstelle es
      if (error.code === 404) {
        await databases.createDocument(
          DATABASE_ID,
          VARIABLE_KOSTEN_COLLECTION_ID,
          VARIABLE_KOSTEN_DOCUMENT_ID,
          {
            data: dataJson,
          }
        );
      } else {
        console.error('Fehler beim Speichern der Variable Kosten:', error);
        const errorMessage = error?.message || `Fehler beim Speichern: ${error?.code || 'Unbekannter Fehler'}`;
        throw new Error(errorMessage);
      }
    }
  },
};

