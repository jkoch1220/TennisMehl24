import { databases, DATABASE_ID, BESTELLUNGEN_COLLECTION_ID } from '../config/appwrite';
import { Bestellung, NeueBestellung } from '../types/bestellung';
import { ID } from 'appwrite';

export const bestellungService = {
  // Lade alle Bestellungen
  async loadAlleBestellungen(): Promise<Bestellung[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        BESTELLUNGEN_COLLECTION_ID
      );
      
      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Bestellungen:', error);
      return [];
    }
  },

  // Lade offene Bestellungen (Status: offen, geplant)
  async loadOffeneBestellungen(): Promise<Bestellung[]> {
    try {
      const alle = await this.loadAlleBestellungen();
      return alle.filter(b => b.status === 'offen' || b.status === 'geplant');
    } catch (error) {
      console.error('Fehler beim Laden der offenen Bestellungen:', error);
      return [];
    }
  },

  // Lade eine einzelne Bestellung
  async loadBestellung(id: string): Promise<Bestellung | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        BESTELLUNGEN_COLLECTION_ID,
        id
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden der Bestellung:', error);
      return null;
    }
  },

  // Erstelle neue Bestellung
  async createBestellung(bestellung: NeueBestellung): Promise<Bestellung> {
    const jetzt = new Date().toISOString();
    const neueBestellung: Bestellung = {
      ...bestellung,
      id: ID.unique(),
      erstelltAm: bestellung.erstelltAm || jetzt,
      geaendertAm: bestellung.geaendertAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        BESTELLUNGEN_COLLECTION_ID,
        neueBestellung.id,
        {
          data: JSON.stringify(neueBestellung),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen der Bestellung:', error);
      throw error;
    }
  },

  // Aktualisiere Bestellung
  async updateBestellung(id: string, bestellung: Partial<Bestellung>): Promise<Bestellung> {
    try {
      // Lade aktuelle Bestellung
      const aktuell = await this.loadBestellung(id);
      if (!aktuell) {
        throw new Error(`Bestellung ${id} nicht gefunden`);
      }

      const aktualisiert: Bestellung = {
        ...aktuell,
        ...bestellung,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        BESTELLUNGEN_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Bestellung:', error);
      throw error;
    }
  },

  // Lösche Bestellung
  async deleteBestellung(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        BESTELLUNGEN_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen der Bestellung:', error);
      throw error;
    }
  },

  // Parse Appwrite Document zu Bestellung
  parseDocument(doc: any): Bestellung {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    // Fallback: Wenn Daten direkt im Document sind
    return doc as Bestellung;
  },
};

