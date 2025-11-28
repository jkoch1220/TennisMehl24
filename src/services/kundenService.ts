import { databases, DATABASE_ID, KUNDEN_COLLECTION_ID } from '../config/appwrite';
import { Kunde, NeuerKunde } from '../types/dispo';
import { ID } from 'appwrite';

export const kundenService = {
  // Lade alle Kunden
  async loadAlleKunden(): Promise<Kunde[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        KUNDEN_COLLECTION_ID
      );
      
      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error);
      return [];
    }
  },

  // Suche Kunden nach Name oder Kundennummer
  async sucheKunden(suchbegriff: string): Promise<Kunde[]> {
    try {
      const alleKunden = await this.loadAlleKunden();
      const begriff = suchbegriff.toLowerCase();
      
      return alleKunden.filter(kunde => 
        kunde.name.toLowerCase().includes(begriff) ||
        kunde.kundennummer.toLowerCase().includes(begriff) ||
        kunde.adresse.ort.toLowerCase().includes(begriff)
      );
    } catch (error) {
      console.error('Fehler beim Suchen der Kunden:', error);
      return [];
    }
  },

  // Lade einen einzelnen Kunden
  async loadKunde(id: string): Promise<Kunde | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        KUNDEN_COLLECTION_ID,
        id
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden des Kunden:', error);
      return null;
    }
  },

  // Erstelle neuen Kunden
  async createKunde(kunde: NeuerKunde): Promise<Kunde> {
    const jetzt = new Date().toISOString();
    const neuerKunde: Kunde = {
      ...kunde,
      id: ID.unique(),
      erstelltAm: kunde.erstelltAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        KUNDEN_COLLECTION_ID,
        neuerKunde.id,
        {
          data: JSON.stringify(neuerKunde),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen des Kunden:', error);
      throw error;
    }
  },

  // Aktualisiere Kunde
  async updateKunde(id: string, kunde: Partial<Kunde>): Promise<Kunde> {
    try {
      // Lade aktuellen Kunden
      const aktuell = await this.loadKunde(id);
      if (!aktuell) {
        throw new Error(`Kunde ${id} nicht gefunden`);
      }

      const aktualisiert: Kunde = {
        ...aktuell,
        ...kunde,
        id,
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        KUNDEN_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Kunden:', error);
      throw error;
    }
  },

  // Lösche Kunde
  async deleteKunde(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        KUNDEN_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen des Kunden:', error);
      throw error;
    }
  },

  // Parse Appwrite Document zu Kunde
  parseDocument(doc: any): Kunde {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    // Fallback: Wenn Daten direkt im Document sind
    return doc as Kunde;
  },
};

