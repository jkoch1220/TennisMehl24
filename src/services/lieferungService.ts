import { databases, DATABASE_ID, LIEFERUNGEN_COLLECTION_ID } from '../config/appwrite';
import { Lieferung, NeueLieferung } from '../types/dispo';
import { ID } from 'appwrite';

export const lieferungService = {
  // Lade alle Lieferungen
  async loadAlleLieferungen(): Promise<Lieferung[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        LIEFERUNGEN_COLLECTION_ID
      );
      
      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Lieferungen:', error);
      return [];
    }
  },

  // Lade Lieferungen für einen bestimmten Zeitraum
  async loadLieferungenVonBis(von: Date, bis: Date): Promise<Lieferung[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        LIEFERUNGEN_COLLECTION_ID,
        [
          `zeitfenster.gewuenscht >= ${von.toISOString()}`,
          `zeitfenster.gewuenscht <= ${bis.toISOString()}`,
        ]
      );
      
      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Lieferungen:', error);
      return [];
    }
  },

  // Lade eine einzelne Lieferung
  async loadLieferung(id: string): Promise<Lieferung | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        LIEFERUNGEN_COLLECTION_ID,
        id
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden der Lieferung:', error);
      return null;
    }
  },

  // Erstelle neue Lieferung
  async createLieferung(lieferung: NeueLieferung): Promise<Lieferung> {
    const jetzt = new Date().toISOString();
    const neueLieferung: Lieferung = {
      ...lieferung,
      id: ID.unique(),
      erstelltAm: lieferung.erstelltAm || jetzt,
      geaendertAm: lieferung.geaendertAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        LIEFERUNGEN_COLLECTION_ID,
        neueLieferung.id,
        {
          data: JSON.stringify(neueLieferung),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen der Lieferung:', error);
      throw error;
    }
  },

  // Aktualisiere Lieferung
  async updateLieferung(id: string, lieferung: Partial<Lieferung>): Promise<Lieferung> {
    try {
      // Lade aktuelle Lieferung
      const aktuell = await this.loadLieferung(id);
      if (!aktuell) {
        throw new Error(`Lieferung ${id} nicht gefunden`);
      }

      const aktualisiert: Lieferung = {
        ...aktuell,
        ...lieferung,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        LIEFERUNGEN_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Lieferung:', error);
      throw error;
    }
  },

  // Lösche Lieferung
  async deleteLieferung(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        LIEFERUNGEN_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen der Lieferung:', error);
      throw error;
    }
  },

  // Parse Appwrite Document zu Lieferung
  parseDocument(doc: any): Lieferung {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    // Fallback: Wenn Daten direkt im Document sind
    return doc as Lieferung;
  },
};

