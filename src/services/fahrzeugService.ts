import { databases, DATABASE_ID, FAHRZEUGE_COLLECTION_ID } from '../config/appwrite';
import { Fahrzeug, NeuesFahrzeug } from '../types/dispo';
import { ID } from 'appwrite';

export const fahrzeugService = {
  // Lade alle Fahrzeuge
  async loadAlleFahrzeuge(): Promise<Fahrzeug[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        FAHRZEUGE_COLLECTION_ID
      );
      
      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Fahrzeuge:', error);
      return [];
    }
  },

  // Lade verfügbare Fahrzeuge
  async loadVerfuegbareFahrzeuge(datum: Date): Promise<Fahrzeug[]> {
    try {
      const alleFahrzeuge = await this.loadAlleFahrzeuge();
      const jetzt = new Date();
      
      return alleFahrzeuge.filter(fz => {
        if (!fz.verfuegbarkeit.verfuegbar) {
          return false;
        }
        if (fz.verfuegbarkeit.nichtVerfuegbarBis) {
          const nichtVerfuegbarBis = new Date(fz.verfuegbarkeit.nichtVerfuegbarBis);
          return nichtVerfuegbarBis < jetzt;
        }
        return true;
      });
    } catch (error) {
      console.error('Fehler beim Laden der verfügbaren Fahrzeuge:', error);
      return [];
    }
  },

  // Lade ein einzelnes Fahrzeug
  async loadFahrzeug(id: string): Promise<Fahrzeug | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        FAHRZEUGE_COLLECTION_ID,
        id
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden des Fahrzeugs:', error);
      return null;
    }
  },

  // Erstelle neues Fahrzeug
  async createFahrzeug(fahrzeug: NeuesFahrzeug): Promise<Fahrzeug> {
    const jetzt = new Date().toISOString();
    const neuesFahrzeug: Fahrzeug = {
      ...fahrzeug,
      id: ID.unique(),
      erstelltAm: fahrzeug.erstelltAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        FAHRZEUGE_COLLECTION_ID,
        neuesFahrzeug.id,
        {
          data: JSON.stringify(neuesFahrzeug),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen des Fahrzeugs:', error);
      throw error;
    }
  },

  // Aktualisiere Fahrzeug
  async updateFahrzeug(id: string, fahrzeug: Partial<Fahrzeug>): Promise<Fahrzeug> {
    try {
      // Lade aktuelles Fahrzeug
      const aktuell = await this.loadFahrzeug(id);
      if (!aktuell) {
        throw new Error(`Fahrzeug ${id} nicht gefunden`);
      }

      const aktualisiert: Fahrzeug = {
        ...aktuell,
        ...fahrzeug,
        id,
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        FAHRZEUGE_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Fahrzeugs:', error);
      throw error;
    }
  },

  // Lösche Fahrzeug
  async deleteFahrzeug(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        FAHRZEUGE_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen des Fahrzeugs:', error);
      throw error;
    }
  },

  // Parse Appwrite Document zu Fahrzeug
  parseDocument(doc: any): Fahrzeug {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    // Fallback: Wenn Daten direkt im Document sind
    return doc as Fahrzeug;
  },
};

