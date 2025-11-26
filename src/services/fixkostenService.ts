import { databases, DATABASE_ID, FIXKOSTEN_COLLECTION_ID, FIXKOSTEN_DOCUMENT_ID } from '../config/appwrite';
import { FixkostenInput } from '../types';
import { flattenFixkosten, unflattenFixkosten } from '../utils/dataConverter';

export const fixkostenService = {
  // Lade Fixkosten-Daten
  async loadFixkosten(): Promise<FixkostenInput | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        FIXKOSTEN_COLLECTION_ID,
        FIXKOSTEN_DOCUMENT_ID
      );
      
      // Konvertiere JSON-String zurück zu FixkostenInput
      if (document.data && typeof document.data === 'string') {
        const data = JSON.parse(document.data);
        return unflattenFixkosten(data);
      }
      
      // Fallback: Altes Format (wenn noch einzelne Felder vorhanden)
      return unflattenFixkosten(document as Record<string, unknown>);
    } catch (error: unknown) {
      // Wenn Dokument nicht existiert, gib null zurück
      if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
        return null;
      }
      console.error('Fehler beim Laden der Fixkosten:', error);
      throw error;
    }
  },

  // Speichere Fixkosten-Daten
  async saveFixkosten(data: FixkostenInput): Promise<void> {
    const flattened = flattenFixkosten(data);
    const dataJson = JSON.stringify(flattened);
    
    console.log('📤 Speichere Fixkosten in Appwrite:', {
      collectionId: FIXKOSTEN_COLLECTION_ID,
      documentId: FIXKOSTEN_DOCUMENT_ID,
      dataLength: dataJson.length,
      keys: Object.keys(flattened).length,
    });
    
    try {
      // Versuche zuerst zu aktualisieren
      const result = await databases.updateDocument(
        DATABASE_ID,
        FIXKOSTEN_COLLECTION_ID,
        FIXKOSTEN_DOCUMENT_ID,
        {
          data: dataJson,
        }
      );
      console.log('✅ Fixkosten erfolgreich aktualisiert:', result);
    } catch (error: unknown) {
      // Wenn Dokument nicht existiert, erstelle es
      if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
        console.log('📝 Dokument existiert nicht, erstelle neues...');
        const result = await databases.createDocument(
          DATABASE_ID,
          FIXKOSTEN_COLLECTION_ID,
          FIXKOSTEN_DOCUMENT_ID,
          {
            data: dataJson,
          }
        );
        console.log('✅ Fixkosten erfolgreich erstellt:', result);
      } else {
        console.error('❌ Fehler beim Speichern der Fixkosten:', error);
        const errorMessage = error instanceof Error 
          ? error.message 
          : `Fehler beim Speichern: ${error && typeof error === 'object' && 'code' in error ? String(error.code) : 'Unbekannter Fehler'}`;
        throw new Error(errorMessage);
      }
    }
  },
};

