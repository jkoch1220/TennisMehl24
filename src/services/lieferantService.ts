import { databases, DATABASE_ID, LIEFERANTEN_COLLECTION_ID } from '../config/appwrite';
import { Lieferant, NeuerLieferant } from '../types';
import { ID, Query } from 'appwrite';

export const lieferantService = {
  // Lade alle Lieferanten
  async loadAlleLieferanten(): Promise<Lieferant[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        LIEFERANTEN_COLLECTION_ID,
        [
          Query.orderDesc('$updatedAt'), // Verwende Appwrite's eingebautes updatedAt
          Query.limit(5000)
        ]
      );
      
      const lieferanten = response.documents.map(doc => this.parseLieferantDocument(doc));
      
      // Sortiere zusätzlich nach geaendertAm aus dem JSON (falls vorhanden)
      return lieferanten.sort((a, b) => {
        const dateA = new Date(a.geaendertAm || a.erstelltAm || 0).getTime();
        const dateB = new Date(b.geaendertAm || b.erstelltAm || 0).getTime();
        return dateB - dateA; // Neueste zuerst
      });
    } catch (error) {
      console.error('Fehler beim Laden der Lieferanten:', error);
      return [];
    }
  },

  // Lade einen einzelnen Lieferanten
  async loadLieferant(id: string): Promise<Lieferant | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        LIEFERANTEN_COLLECTION_ID,
        id
      );
      
      return this.parseLieferantDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden des Lieferanten:', error);
      return null;
    }
  },

  // Erstelle neuen Lieferanten
  async createLieferant(lieferant: NeuerLieferant): Promise<Lieferant> {
    const jetzt = new Date().toISOString();
    
    const neuerLieferant: Lieferant = {
      ...lieferant,
      id: ID.unique(),
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        LIEFERANTEN_COLLECTION_ID,
        neuerLieferant.id,
        {
          data: JSON.stringify(neuerLieferant),
        }
      );
      
      return this.parseLieferantDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen des Lieferanten:', error);
      throw error;
    }
  },

  // Aktualisiere Lieferanten
  async updateLieferant(id: string, lieferant: Partial<NeuerLieferant>): Promise<Lieferant> {
    try {
      const aktuell = await this.loadLieferant(id);
      if (!aktuell) {
        throw new Error(`Lieferant ${id} nicht gefunden`);
      }

      const aktualisiert: Lieferant = {
        ...aktuell,
        ...lieferant,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        LIEFERANTEN_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );
      
      return this.parseLieferantDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Lieferanten:', error);
      throw error;
    }
  },

  // Lösche Lieferanten
  async deleteLieferant(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        LIEFERANTEN_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen des Lieferanten:', error);
      throw error;
    }
  },

  // ========== HELPER FUNCTIONS ==========

  // Parse Lieferanten-Dokument aus Appwrite
  parseLieferantDocument(doc: any): Lieferant {
    try {
      const data = typeof doc.data === 'string' ? JSON.parse(doc.data) : doc.data;
      return {
        ...data,
        id: doc.$id,
      };
    } catch (error) {
      console.error('Fehler beim Parsen des Lieferanten-Dokuments:', error);
      throw error;
    }
  },
};



