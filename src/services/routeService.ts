import { databases, DATABASE_ID, ROUTEN_COLLECTION_ID } from '../config/appwrite';
import { Route, NeueRoute } from '../types/dispo';
import { ID } from 'appwrite';

export const routeService = {
  // Lade alle Routen
  async loadAlleRouten(): Promise<Route[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        ROUTEN_COLLECTION_ID
      );
      
      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Routen:', error);
      return [];
    }
  },

  // Lade Routen für ein bestimmtes Datum
  async loadRoutenFuerDatum(datum: Date): Promise<Route[]> {
    try {
      const tagStart = new Date(datum);
      tagStart.setHours(0, 0, 0, 0);
      const tagEnd = new Date(datum);
      tagEnd.setHours(23, 59, 59, 999);

      const response = await databases.listDocuments(
        DATABASE_ID,
        ROUTEN_COLLECTION_ID,
        [
          `datum >= ${tagStart.toISOString()}`,
          `datum <= ${tagEnd.toISOString()}`,
        ]
      );
      
      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Routen:', error);
      return [];
    }
  },

  // Lade eine einzelne Route
  async loadRoute(id: string): Promise<Route | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        ROUTEN_COLLECTION_ID,
        id
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden der Route:', error);
      return null;
    }
  },

  // Erstelle neue Route
  async createRoute(route: NeueRoute): Promise<Route> {
    const jetzt = new Date().toISOString();
    const neueRoute: Route = {
      ...route,
      id: ID.unique(),
      erstelltAm: route.erstelltAm || jetzt,
      geaendertAm: route.geaendertAm || jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        ROUTEN_COLLECTION_ID,
        neueRoute.id,
        {
          data: JSON.stringify(neueRoute),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen der Route:', error);
      throw error;
    }
  },

  // Aktualisiere Route
  async updateRoute(id: string, route: Partial<Route>): Promise<Route> {
    try {
      // Lade aktuelle Route
      const aktuell = await this.loadRoute(id);
      if (!aktuell) {
        throw new Error(`Route ${id} nicht gefunden`);
      }

      const aktualisiert: Route = {
        ...aktuell,
        ...route,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        ROUTEN_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Route:', error);
      throw error;
    }
  },

  // Lösche Route
  async deleteRoute(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        ROUTEN_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen der Route:', error);
      throw error;
    }
  },

  // Parse Appwrite Document zu Route
  parseDocument(doc: any): Route {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    // Fallback: Wenn Daten direkt im Document sind
    return doc as Route;
  },
};

