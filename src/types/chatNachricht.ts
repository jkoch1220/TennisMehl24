/**
 * Chat-Nachrichten für Projekte (Salesforce-ähnlich)
 */

export interface ChatNachricht {
  id: string;
  projektId: string;
  text: string;
  mentions: string[];        // Array von User-IDs die erwähnt wurden
  erstelltAm: string;
  erstelltVon: string;       // User-ID des Erstellers
  erstelltVonName: string;   // User-Name für Anzeige
}

export interface NeueChatNachricht {
  projektId: string;
  text: string;
  mentions?: string[];
  erstelltVon: string;
  erstelltVonName: string;
}
