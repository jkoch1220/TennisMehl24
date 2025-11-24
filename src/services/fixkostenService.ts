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
      return unflattenFixkosten(document as any);
    } catch (error: any) {
      // Wenn Dokument nicht existiert, gib null zurück
      if (error.code === 404) {
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
    
    try {
      // Versuche zuerst zu aktualisieren
      await databases.updateDocument(
        DATABASE_ID,
        FIXKOSTEN_COLLECTION_ID,
        FIXKOSTEN_DOCUMENT_ID,
        {
          data: dataJson,
        }
      );
    } catch (error: any) {
      // Wenn Dokument nicht existiert, erstelle es
      if (error.code === 404) {
        await databases.createDocument(
          DATABASE_ID,
          FIXKOSTEN_COLLECTION_ID,
          FIXKOSTEN_DOCUMENT_ID,
          {
            data: dataJson,
          }
        );
      } else {
        console.error('Fehler beim Speichern der Fixkosten:', error);
        const errorMessage = error?.message || `Fehler beim Speichern: ${error?.code || 'Unbekannter Fehler'}`;
        throw new Error(errorMessage);
      }
    }
  },
};

