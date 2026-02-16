import { ID, Query } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  ANFRAGEN_COLLECTION_ID,
} from '../config/appwrite';
import { Anfrage, NeueAnfrage, AnfrageUpdate } from '../types/anfragen';

/**
 * Service für die Verwaltung von Anfragen
 * 
 * Anfragen werden automatisch von n8n erstellt und hier verwaltet.
 */
export const anfragenService = {
  /**
   * Lade alle Anfragen
   */
  async loadAlleAnfragen(): Promise<Anfrage[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        ANFRAGEN_COLLECTION_ID,
        [
          Query.orderDesc('emailDatum'),
          Query.limit(1000)
        ]
      );
      
      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Anfragen:', error);
      return [];
    }
  },

  /**
   * Lade Anfragen nach Status
   */
  async loadAnfragenNachStatus(status: string): Promise<Anfrage[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        ANFRAGEN_COLLECTION_ID,
        [
          Query.equal('status', status),
          Query.orderDesc('emailDatum'),
          Query.limit(1000)
        ]
      );
      
      return response.documents.map(doc => this.parseDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Anfragen:', error);
      return [];
    }
  },

  /**
   * Lade eine einzelne Anfrage
   */
  async loadAnfrage(id: string): Promise<Anfrage | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        ANFRAGEN_COLLECTION_ID,
        id
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden der Anfrage:', error);
      return null;
    }
  },

  /**
   * Erstelle eine neue Anfrage (wird von n8n oder manueller Verarbeitung aufgerufen)
   */
  async createAnfrage(anfrage: NeueAnfrage): Promise<Anfrage> {
    const jetzt = new Date().toISOString();

    const neueAnfrage: Anfrage = {
      id: ID.unique(),
      ...anfrage,
      status: anfrage.status || 'neu',
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        ANFRAGEN_COLLECTION_ID,
        neueAnfrage.id,
        {
          emailBetreff: neueAnfrage.emailBetreff,
          emailAbsender: neueAnfrage.emailAbsender,
          emailDatum: neueAnfrage.emailDatum,
          emailText: neueAnfrage.emailText,
          emailHtml: neueAnfrage.emailHtml || '',
          extrahierteDaten: JSON.stringify(neueAnfrage.extrahierteDaten),
          status: neueAnfrage.status,
          kundeId: anfrage.kundeId || '',
          projektId: anfrage.projektId || '',
          angebotVersendetAm: anfrage.angebotVersendetAm || '',
          bearbeitetVon: anfrage.bearbeitetVon || '',
          erstelltAm: neueAnfrage.erstelltAm,
          n8nWorkflowId: neueAnfrage.n8nWorkflowId || '',
          n8nExecutionId: neueAnfrage.n8nExecutionId || '',
        }
      );

      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen der Anfrage:', error);
      throw error;
    }
  },

  /**
   * Aktualisiere eine Anfrage
   */
  async updateAnfrage(id: string, update: AnfrageUpdate): Promise<Anfrage> {
    const jetzt = new Date().toISOString();
    
    try {
      // Lade aktuelle Anfrage
      const aktuelleAnfrage = await this.loadAnfrage(id);
      if (!aktuelleAnfrage) {
        throw new Error('Anfrage nicht gefunden');
      }

      // Bereite Update vor
      const updateData: any = {
        aktualisiertAm: jetzt,
      };

      if (update.status !== undefined) {
        updateData.status = update.status;
      }
      if (update.zugeordneterKundeId !== undefined) {
        updateData.zugeordneterKundeId = update.zugeordneterKundeId;
        updateData.zugeordnetAm = jetzt;
      }
      if (update.zugeordneterKundeTyp !== undefined) {
        updateData.zugeordneterKundeTyp = update.zugeordneterKundeTyp;
      }
      if (update.angebotId !== undefined) {
        updateData.angebotId = update.angebotId;
        if (!aktuelleAnfrage.angebotErstelltAm) {
          updateData.angebotErstelltAm = jetzt;
        }
      }
      if (update.notizen !== undefined) {
        updateData.notizen = update.notizen;
      }
      if (update.bearbeitetVon !== undefined) {
        updateData.bearbeitetVon = update.bearbeitetVon;
        updateData.bearbeitetAm = jetzt;
      }

      const document = await databases.updateDocument(
        DATABASE_ID,
        ANFRAGEN_COLLECTION_ID,
        id,
        updateData
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Anfrage:', error);
      throw error;
    }
  },

  /**
   * Lösche eine Anfrage
   */
  async deleteAnfrage(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        ANFRAGEN_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen der Anfrage:', error);
      throw error;
    }
  },

  /**
   * Lösche mehrere Anfragen
   */
  async deleteAnfragen(ids: string[]): Promise<void> {
    try {
      await Promise.all(ids.map(id => this.deleteAnfrage(id)));
    } catch (error) {
      console.error('Fehler beim Löschen der Anfragen:', error);
      throw error;
    }
  },

  /**
   * Markiere mehrere Anfragen als wichtig
   */
  async markiereAlsWichtig(ids: string[], wichtig: boolean): Promise<void> {
    const jetzt = new Date().toISOString();
    try {
      await Promise.all(ids.map(id =>
        databases.updateDocument(
          DATABASE_ID,
          ANFRAGEN_COLLECTION_ID,
          id,
          {
            notizen: wichtig ? '⭐ WICHTIG' : '',
            aktualisiertAm: jetzt,
          }
        )
      ));
    } catch (error) {
      console.error('Fehler beim Markieren als wichtig:', error);
      throw error;
    }
  },

  /**
   * Markiere Angebot als versendet
   */
  async markiereAngebotAlsVersendet(anfrageId: string): Promise<Anfrage> {
    const jetzt = new Date().toISOString();
    
    try {
      const document = await databases.updateDocument(
        DATABASE_ID,
        ANFRAGEN_COLLECTION_ID,
        anfrageId,
        {
          status: 'angebot_versendet',
          angebotVersendetAm: jetzt,
          aktualisiertAm: jetzt,
        }
      );
      
      return this.parseDocument(document);
    } catch (error) {
      console.error('Fehler beim Markieren des Angebots als versendet:', error);
      throw error;
    }
  },

  /**
   * Parse Appwrite-Dokument zu Anfrage
   */
  parseDocument(doc: any): Anfrage {
    let extrahierteDaten = {};
    try {
      if (doc.extrahierteDaten) {
        extrahierteDaten = typeof doc.extrahierteDaten === 'string'
          ? JSON.parse(doc.extrahierteDaten)
          : doc.extrahierteDaten;
      }
    } catch (e) {
      console.warn('Fehler beim Parsen der extrahierten Daten:', e);
    }

    return {
      id: doc.$id,
      emailBetreff: doc.emailBetreff || '',
      emailAbsender: doc.emailAbsender || '',
      emailDatum: doc.emailDatum || doc.$createdAt,
      emailText: doc.emailText || '',
      emailHtml: doc.emailHtml || '',
      extrahierteDaten: extrahierteDaten as any,
      status: doc.status || 'neu',
      zugeordneterKundeId: doc.zugeordneterKundeId || undefined,
      zugeordneterKundeTyp: doc.zugeordneterKundeTyp || undefined,
      zugeordnetAm: doc.zugeordnetAm || undefined,
      zugeordnetVon: doc.zugeordnetVon || undefined,
      angebotId: doc.angebotId || undefined,
      angebotErstelltAm: doc.angebotErstelltAm || undefined,
      angebotVersendetAm: doc.angebotVersendetAm || undefined,
      bearbeitetVon: doc.bearbeitetVon || undefined,
      bearbeitetAm: doc.bearbeitetAm || undefined,
      notizen: doc.notizen || undefined,
      erstelltAm: doc.erstelltAm || doc.$createdAt,
      aktualisiertAm: doc.aktualisiertAm || doc.$updatedAt,
      n8nWorkflowId: doc.n8nWorkflowId || undefined,
      n8nExecutionId: doc.n8nExecutionId || undefined,
    };
  },
};



