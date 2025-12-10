import { databases, DATABASE_ID, COLLECTIONS } from '../config/appwrite';
import { ID, Query } from 'appwrite';
import { Projekt, NeuesProjekt, ProjektFilter, ProjektStatus } from '../types/projekt';

class ProjektService {
  private readonly collectionId = COLLECTIONS.PROJEKTE;

  // Alle Projekte laden mit optionalen Filtern
  async loadProjekte(filter?: ProjektFilter): Promise<Projekt[]> {
    try {
      const queries: string[] = [];

      if (filter?.status && filter.status.length > 0) {
        queries.push(Query.equal('status', filter.status));
      }

      if (filter?.saisonjahr) {
        queries.push(Query.equal('saisonjahr', filter.saisonjahr));
      }

      if (filter?.suche) {
        // Verwende Query.contains statt Query.search (benötigt keinen Fulltext-Index)
        queries.push(Query.contains('kundenname', filter.suche));
      }

      queries.push(Query.orderDesc('erstelltAm'));
      queries.push(Query.limit(1000));

      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, queries);
      return response.documents.map(doc => {
        if (doc.data && typeof doc.data === 'string') {
          try {
            return { ...JSON.parse(doc.data), $id: doc.$id };
          } catch {
            return doc as unknown as Projekt;
          }
        }
        return doc as unknown as Projekt;
      });
    } catch (error) {
      console.error('Fehler beim Laden der Projekte:', error);
      throw error;
    }
  }

  // Projekte gruppiert nach Status laden
  async loadProjekteGruppiert(saisonjahr?: number): Promise<{
    angebot: Projekt[];
    auftragsbestaetigung: Projekt[];
    lieferschein: Projekt[];
    rechnung: Projekt[];
    bezahlt: Projekt[];
  }> {
    try {
      const queries: string[] = [Query.orderDesc('erstelltAm'), Query.limit(1000)];
      
      if (saisonjahr) {
        queries.push(Query.equal('saisonjahr', saisonjahr));
      }

      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, queries);
      const projekte = response.documents as unknown as Projekt[];

      return {
        angebot: projekte.filter((p) => p.status === 'angebot'),
        auftragsbestaetigung: projekte.filter((p) => p.status === 'auftragsbestaetigung'),
        lieferschein: projekte.filter((p) => p.status === 'lieferschein'),
        rechnung: projekte.filter((p) => p.status === 'rechnung'),
        bezahlt: projekte.filter((p) => p.status === 'bezahlt'),
      };
    } catch (error) {
      console.error('Fehler beim Laden der gruppierten Projekte:', error);
      throw error;
    }
  }

  // Einzelnes Projekt laden
  async getProjekt(projektId: string): Promise<Projekt> {
    try {
      const response = await databases.getDocument(DATABASE_ID, this.collectionId, projektId);
      if (response.data && typeof response.data === 'string') {
        try {
          return { ...JSON.parse(response.data), $id: response.$id };
        } catch {
          return response as unknown as Projekt;
        }
      }
      return response as unknown as Projekt;
    } catch (error) {
      console.error('Fehler beim Laden des Projekts:', error);
      throw error;
    }
  }

  // Alle Projekte für ein Saisonjahr laden (für Prüfung ob Kunde bereits Projekt hat)
  async getAllProjekte(saisonjahr: number): Promise<Projekt[]> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, [
        Query.equal('saisonjahr', saisonjahr),
        Query.limit(5000),
      ]);
      
      return response.documents as unknown as Projekt[];
    } catch (error) {
      console.error('Fehler beim Laden aller Projekte:', error);
      return []; // Return leeres Array bei Fehler (z.B. Collection existiert noch nicht)
    }
  }

  // Projekt für einen Kunden finden (aktuelle Saison)
  async getProjektFuerKunde(kundeId: string, saisonjahr: number): Promise<Projekt | null> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, [
        Query.equal('kundeId', kundeId),
        Query.equal('saisonjahr', saisonjahr),
        Query.limit(1),
      ]);
      
      if (response.documents.length > 0) {
        return response.documents[0] as unknown as Projekt;
      }
      return null;
    } catch (error) {
      console.error('Fehler beim Laden des Projekts für Kunde:', error);
      throw error;
    }
  }

  // Neues Projekt erstellen
  async createProjekt(projekt: NeuesProjekt): Promise<Projekt> {
    try {
      const dokumentId = projekt.id || ID.unique();
      const jetzt = new Date().toISOString();

      const neuesProjekt: Projekt = {
        ...projekt,
        id: dokumentId,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      } as Projekt;

      const dokument = {
        projektName: neuesProjekt.projektName,
        kundeId: neuesProjekt.kundeId,
        kundenname: neuesProjekt.kundenname,
        saisonjahr: neuesProjekt.saisonjahr,
        status: neuesProjekt.status,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
        data: JSON.stringify(neuesProjekt),
      };

      const response = await databases.createDocument(
        DATABASE_ID,
        this.collectionId,
        dokumentId,
        dokument
      );

      if (response.data && typeof response.data === 'string') {
        try {
          return { ...JSON.parse(response.data), $id: response.$id };
        } catch {
          return neuesProjekt;
        }
      }
      return neuesProjekt;
    } catch (error) {
      console.error('Fehler beim Erstellen des Projekts:', error);
      throw error;
    }
  }

  // Projekt aktualisieren
  async updateProjekt(projektId: string, updates: Partial<Projekt>): Promise<Projekt> {
    try {
      // Erst das aktuelle Projekt laden
      const aktuell = await this.getProjekt(projektId);
      
      const aktualisiert = {
        ...aktuell,
        ...updates,
        geaendertAm: new Date().toISOString(),
      };

      const dokument = {
        projektName: aktualisiert.projektName,
        kundeId: aktualisiert.kundeId,
        kundenname: aktualisiert.kundenname,
        saisonjahr: aktualisiert.saisonjahr,
        status: aktualisiert.status,
        geaendertAm: aktualisiert.geaendertAm,
        data: JSON.stringify(aktualisiert),
      };

      const response = await databases.updateDocument(
        DATABASE_ID,
        this.collectionId,
        projektId,
        dokument
      );

      if (response.data && typeof response.data === 'string') {
        try {
          return { ...JSON.parse(response.data), $id: response.$id };
        } catch {
          return aktualisiert;
        }
      }
      return aktualisiert;
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Projekts:', error);
      throw error;
    }
  }

  // Projekt-Status ändern
  async updateProjektStatus(projektId: string, neuerStatus: ProjektStatus): Promise<Projekt> {
    try {
      const updates: Partial<Projekt> = {
        status: neuerStatus,
        geaendertAm: new Date().toISOString(),
      };

      const response = await databases.updateDocument(
        DATABASE_ID,
        this.collectionId,
        projektId,
        updates
      );

      return response as unknown as Projekt;
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Projekt-Status:', error);
      throw error;
    }
  }

  // Projekt löschen
  async deleteProjekt(projekt: Projekt): Promise<void> {
    try {
      // Verwende $id falls vorhanden, sonst id
      const documentId = (projekt as any).$id || projekt.id;
      console.log('Lösche Projekt mit documentId:', documentId);
      await databases.deleteDocument(DATABASE_ID, this.collectionId, documentId);
    } catch (error) {
      console.error('Fehler beim Löschen des Projekts:', error);
      throw error;
    }
  }
}

export const projektService = new ProjektService();
