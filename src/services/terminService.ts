import { databases } from '../config/appwrite';
import { DATABASE_ID, KALENDER_COLLECTION_ID } from '../config/appwrite';
import { Termin, NeuerTermin } from '../types/termin';
import { Query } from 'appwrite';

export const terminService = {
  // Alle Termine laden
  async loadAlleTermine(): Promise<Termin[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        KALENDER_COLLECTION_ID,
        [
          Query.orderDesc('startDatum'),
          Query.limit(1000)
        ]
      );

      return response.documents.map(parseTerminDocument);
    } catch (error) {
      console.error('Fehler beim Laden der Termine:', error);
      throw new Error('Termine konnten nicht geladen werden');
    }
  },

  // Termine für einen bestimmten Zeitraum laden
  async loadTermineImZeitraum(startDatum: string, endDatum: string): Promise<Termin[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        KALENDER_COLLECTION_ID,
        [
          Query.greaterThanEqual('startDatum', startDatum),
          Query.lessThanEqual('startDatum', endDatum),
          Query.orderAsc('startDatum'),
          Query.limit(1000)
        ]
      );

      return response.documents.map(parseTerminDocument);
    } catch (error) {
      console.error('Fehler beim Laden der Termine für Zeitraum:', error);
      throw new Error('Termine für den Zeitraum konnten nicht geladen werden');
    }
  },

  // Neuen Termin erstellen
  async createTermin(terminData: NeuerTermin): Promise<Termin> {
    try {
      const now = new Date().toISOString();
      
      const data = {
        titel: terminData.titel,
        beschreibung: terminData.beschreibung || '',
        startDatum: terminData.startDatum,
        endDatum: terminData.endDatum,
        ganztaegig: terminData.ganztaegig || false,
        farbe: terminData.farbe || '#3b82f6',
        ort: terminData.ort || '',
        wiederholung: terminData.wiederholung || 'keine',
        wiederholungEnde: terminData.wiederholungEnde || '',
        erinnerung: terminData.erinnerung || 0,
        erstelltAm: now,
        geaendertAm: now,
        erstelltVon: '', // Wird in Appwrite automatisch gesetzt
        data: JSON.stringify({}) // Für zukünftige Erweiterungen
      };

      const response = await databases.createDocument(
        DATABASE_ID,
        KALENDER_COLLECTION_ID,
        'unique()',
        data
      );

      return parseTerminDocument(response);
    } catch (error) {
      console.error('Fehler beim Erstellen des Termins:', error);
      throw new Error('Termin konnte nicht erstellt werden');
    }
  },

  // Termin aktualisieren
  async updateTermin(terminId: string, terminData: Partial<NeuerTermin>): Promise<Termin> {
    try {
      const updateData: any = {
        geaendertAm: new Date().toISOString()
      };

      if (terminData.titel !== undefined) updateData.titel = terminData.titel;
      if (terminData.beschreibung !== undefined) updateData.beschreibung = terminData.beschreibung;
      if (terminData.startDatum !== undefined) updateData.startDatum = terminData.startDatum;
      if (terminData.endDatum !== undefined) updateData.endDatum = terminData.endDatum;
      if (terminData.ganztaegig !== undefined) updateData.ganztaegig = terminData.ganztaegig;
      if (terminData.farbe !== undefined) updateData.farbe = terminData.farbe;
      if (terminData.ort !== undefined) updateData.ort = terminData.ort;
      if (terminData.wiederholung !== undefined) updateData.wiederholung = terminData.wiederholung;
      if (terminData.wiederholungEnde !== undefined) updateData.wiederholungEnde = terminData.wiederholungEnde;
      if (terminData.erinnerung !== undefined) updateData.erinnerung = terminData.erinnerung;

      const response = await databases.updateDocument(
        DATABASE_ID,
        KALENDER_COLLECTION_ID,
        terminId,
        updateData
      );

      return parseTerminDocument(response);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Termins:', error);
      throw new Error('Termin konnte nicht aktualisiert werden');
    }
  },

  // Termin löschen
  async deleteTermin(terminId: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        KALENDER_COLLECTION_ID,
        terminId
      );
    } catch (error) {
      console.error('Fehler beim Löschen des Termins:', error);
      throw new Error('Termin konnte nicht gelöscht werden');
    }
  },

  // Termin verschieben (Drag & Drop)
  async verschiebeTermin(terminId: string, neueStartZeit: string, neueDauer?: number): Promise<Termin> {
    try {
      // Berechne Endzeit basierend auf neuer Startzeit und optional neuer Dauer
      const startDate = new Date(neueStartZeit);
      let endDate: Date;
      
      if (neueDauer !== undefined) {
        // Neue Dauer wurde angegeben (in Minuten)
        endDate = new Date(startDate.getTime() + neueDauer * 60000);
      } else {
        // Alte Dauer beibehalten - erst aktuellen Termin laden
        const alleTermine = await this.loadAlleTermine();
        const aktuellerTermin = alleTermine.find(t => t.id === terminId);
        
        if (!aktuellerTermin) {
          throw new Error('Termin nicht gefunden');
        }

        const alteDauer = new Date(aktuellerTermin.endDatum).getTime() - new Date(aktuellerTermin.startDatum).getTime();
        endDate = new Date(startDate.getTime() + alteDauer);
      }

      return await this.updateTermin(terminId, {
        startDatum: startDate.toISOString(),
        endDatum: endDate.toISOString()
      });
    } catch (error) {
      console.error('Fehler beim Verschieben des Termins:', error);
      throw new Error('Termin konnte nicht verschoben werden');
    }
  }
};

// Helper-Funktion zum Parsen der Appwrite-Dokumente
export function parseTerminDocument(doc: any): Termin {
  return {
    id: doc.$id,
    titel: doc.titel || '',
    beschreibung: doc.beschreibung || '',
    startDatum: doc.startDatum || '',
    endDatum: doc.endDatum || '',
    ganztaegig: doc.ganztaegig || false,
    farbe: doc.farbe || '#3b82f6',
    ort: doc.ort || '',
    wiederholung: doc.wiederholung || 'keine',
    wiederholungEnde: doc.wiederholungEnde || '',
    erinnerung: doc.erinnerung || 0,
    erstelltAm: doc.erstelltAm || doc.$createdAt || '',
    geaendertAm: doc.geaendertAm || doc.$updatedAt || '',
    erstelltVon: doc.erstelltVon || ''
  };
}