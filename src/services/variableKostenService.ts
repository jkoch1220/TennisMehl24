import { databases, DATABASE_ID, VARIABLE_KOSTEN_COLLECTION_ID, VARIABLE_KOSTEN_DOCUMENT_ID } from '../config/appwrite';
import { VariableKostenInput } from '../types';
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
      return unflattenVariableKosten(document as Record<string, unknown>);
    } catch (error: unknown) {
      // Wenn Dokument nicht existiert, gib null zurück
      if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
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
    
    console.log('📤 Speichere Variable Kosten in Appwrite:', {
      collectionId: VARIABLE_KOSTEN_COLLECTION_ID,
      documentId: VARIABLE_KOSTEN_DOCUMENT_ID,
      dataLength: dataJson.length,
      keys: Object.keys(flattened).length,
    });
    
    try {
      // Versuche zuerst zu aktualisieren
      const result = await databases.updateDocument(
        DATABASE_ID,
        VARIABLE_KOSTEN_COLLECTION_ID,
        VARIABLE_KOSTEN_DOCUMENT_ID,
        {
          data: dataJson,
        }
      );
      console.log('✅ Variable Kosten erfolgreich aktualisiert:', result);
    } catch (error: unknown) {
      // Wenn Dokument nicht existiert, erstelle es
      if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
        console.log('📝 Dokument existiert nicht, erstelle neues...');
        const result = await databases.createDocument(
          DATABASE_ID,
          VARIABLE_KOSTEN_COLLECTION_ID,
          VARIABLE_KOSTEN_DOCUMENT_ID,
          {
            data: dataJson,
          }
        );
        console.log('✅ Variable Kosten erfolgreich erstellt:', result);
      } else {
        console.error('❌ Fehler beim Speichern der Variable Kosten:', error);
        const errorMessage = error instanceof Error 
          ? error.message 
          : `Fehler beim Speichern: ${error && typeof error === 'object' && 'code' in error ? String(error.code) : 'Unbekannter Fehler'}`;
        throw new Error(errorMessage);
      }
    }
  },
};

