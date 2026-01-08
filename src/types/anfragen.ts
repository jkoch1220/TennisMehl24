/**
 * Typen für das Anfragen-Tool
 * 
 * Dieses Tool verwaltet automatisch erkannte E-Mail-Anfragen,
 * die von n8n verarbeitet und in Appwrite gespeichert werden.
 */

export type AnfrageStatus = 
  | 'neu'              // Neu eingegangen, noch nicht bearbeitet
  | 'zugeordnet'       // Einem Kunden zugeordnet
  | 'angebot_erstellt' // Angebot wurde erstellt
  | 'angebot_versendet' // Angebot wurde versendet
  | 'abgelehnt'        // Anfrage wurde abgelehnt/ignoriert
  | 'erledigt';        // Vollständig bearbeitet

export interface ExtrahierteDaten {
  // Vom n8n-Workflow extrahierte Informationen
  kundenname?: string;
  email?: string;
  telefon?: string;
  adresse?: {
    strasse?: string;
    plz?: string;
    ort?: string;
    bundesland?: string;
  };
  anfrageinhalt?: string; // Vollständiger Text der Anfrage
  menge?: number; // Extrahierte Menge (z.B. in Tonnen)
  artikel?: string; // Extrahierter Artikel/Produkt
  lieferdatum?: string; // Extrahierter Liefertermin
  sonstigeInfos?: Record<string, any>; // Weitere extrahierte Daten
  konfidenz?: number; // Konfidenz-Score der Extraktion (0-1)
}

export interface Anfrage {
  id: string;
  
  // E-Mail-Informationen
  emailBetreff: string;
  emailAbsender: string;
  emailDatum: string; // ISO-Datum
  emailText: string; // Vollständiger E-Mail-Text
  emailHtml?: string; // HTML-Version falls verfügbar
  
  // Extrahierte Daten (von n8n)
  extrahierteDaten: ExtrahierteDaten;
  
  // Status und Zuordnung
  status: AnfrageStatus;
  zugeordneterKundeId?: string; // ID des zugeordneten Kunden (aus kunden oder saison_kunden)
  zugeordneterKundeTyp?: 'dispo' | 'saison'; // Typ der Kunden-Collection
  zugeordnetAm?: string; // ISO-Datum
  zugeordnetVon?: string; // User-ID der Person, die zugeordnet hat
  
  // Angebot-Informationen
  angebotId?: string; // ID des erstellten Angebots (Projekt-ID)
  angebotErstelltAm?: string; // ISO-Datum
  angebotVersendetAm?: string; // ISO-Datum
  
  // Bearbeitungsinformationen
  bearbeitetVon?: string; // User-ID
  bearbeitetAm?: string; // ISO-Datum
  notizen?: string; // Interne Notizen zur Anfrage
  
  // Metadaten
  erstelltAm: string; // ISO-Datum - wann n8n die Anfrage erstellt hat
  aktualisiertAm: string; // ISO-Datum
  n8nWorkflowId?: string; // ID des n8n-Workflows für Tracking
  n8nExecutionId?: string; // ID der n8n-Execution für Tracking
}

export interface NeueAnfrage {
  // Diese Felder werden von n8n ausgefüllt
  emailBetreff: string;
  emailAbsender: string;
  emailDatum: string;
  emailText: string;
  emailHtml?: string;
  extrahierteDaten: ExtrahierteDaten;
  n8nWorkflowId?: string;
  n8nExecutionId?: string;
}

export interface AnfrageUpdate {
  status?: AnfrageStatus;
  zugeordneterKundeId?: string;
  zugeordneterKundeTyp?: 'dispo' | 'saison';
  angebotId?: string;
  notizen?: string;
  bearbeitetVon?: string;
}



