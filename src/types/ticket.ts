export interface Ticket {
  id: string;
  titel: string;
  beschreibung: string;
  status: TicketStatus;
  prioritaet: TicketPrioritaet;
  erstelltAm: string; // ISO Date String
  geaendertAm: string; // ISO Date String
  erstelltVon?: string; // Name des Erstellers
  erstelltVonId?: string; // User-ID des Erstellers
  sortIndex?: number; // Für manuelle Sortierung/Priorisierung
}

export type TicketStatus = 'offen' | 'in_bearbeitung' | 'erledigt' | 'abgelehnt';
export type TicketPrioritaet = 'niedrig' | 'normal' | 'hoch' | 'kritisch';

export interface NeuesTicket {
  titel: string;
  beschreibung: string;
  prioritaet?: TicketPrioritaet;
  erstelltVon?: string;
}





