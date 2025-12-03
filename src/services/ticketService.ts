import { databases, DATABASE_ID, TICKETS_COLLECTION_ID } from '../config/appwrite';
import { Ticket, NeuesTicket } from '../types/ticket';
import { ID, Query } from 'appwrite';

export const ticketService = {
  // Lade alle Tickets
  async loadAlleTickets(): Promise<Ticket[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        TICKETS_COLLECTION_ID,
        [
          Query.limit(5000)
        ]
      );
      
      return response.documents.map(doc => this.parseTicketDocument(doc));
    } catch (error) {
      console.error('Fehler beim Laden der Tickets:', error);
      return [];
    }
  },

  // Lade ein einzelnes Ticket
  async loadTicket(id: string): Promise<Ticket | null> {
    try {
      const document = await databases.getDocument(
        DATABASE_ID,
        TICKETS_COLLECTION_ID,
        id
      );
      
      return this.parseTicketDocument(document);
    } catch (error) {
      console.error('Fehler beim Laden des Tickets:', error);
      return null;
    }
  },

  // Erstelle neues Ticket
  async createTicket(ticket: NeuesTicket): Promise<Ticket> {
    const jetzt = new Date().toISOString();
    const neuesTicket: Ticket = {
      ...ticket,
      id: ID.unique(),
      status: 'offen',
      prioritaet: ticket.prioritaet || 'normal',
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        TICKETS_COLLECTION_ID,
        neuesTicket.id,
        {
          data: JSON.stringify(neuesTicket),
        }
      );
      
      return this.parseTicketDocument(document);
    } catch (error) {
      console.error('Fehler beim Erstellen des Tickets:', error);
      throw error;
    }
  },

  // Aktualisiere Ticket
  async updateTicket(id: string, ticket: Partial<Ticket>): Promise<Ticket> {
    try {
      const aktuell = await this.loadTicket(id);
      if (!aktuell) {
        throw new Error(`Ticket ${id} nicht gefunden`);
      }

      const aktualisiert: Ticket = {
        ...aktuell,
        ...ticket,
        id,
        geaendertAm: new Date().toISOString(),
      };

      const document = await databases.updateDocument(
        DATABASE_ID,
        TICKETS_COLLECTION_ID,
        id,
        {
          data: JSON.stringify(aktualisiert),
        }
      );
      
      return this.parseTicketDocument(document);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Tickets:', error);
      throw error;
    }
  },

  // Lösche Ticket
  async deleteTicket(id: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        TICKETS_COLLECTION_ID,
        id
      );
    } catch (error) {
      console.error('Fehler beim Löschen des Tickets:', error);
      throw error;
    }
  },

  // Helper-Funktion zum Parsen von Dokumenten
  parseTicketDocument(doc: any): Ticket {
    if (doc.data && typeof doc.data === 'string') {
      return JSON.parse(doc.data);
    }
    return doc as Ticket;
  },
};
