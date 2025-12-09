// Projekt-Status
export type ProjektStatus = 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung' | 'bezahlt';

// Projekt für Bestellabwicklung
export interface Projekt {
  id: string;
  kundeId: string;
  kundennummer?: string;
  kundenname: string;
  kundenstrasse: string;
  kundenPlzOrt: string;
  saisonjahr: number;
  status: ProjektStatus;
  
  // Verlinkung zu Dokumenten
  angebotId?: string;
  angebotsnummer?: string;
  angebotsdatum?: string;
  
  auftragsbestaetigungId?: string;
  auftragsbestaetigungsnummer?: string;
  auftragsbestaetigungsdatum?: string;
  
  lieferscheinId?: string;
  lieferscheinnummer?: string;
  lieferdatum?: string;
  
  rechnungId?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  
  bezahltAm?: string;
  
  // Mengen- und Preis-Info (aus Callliste)
  angefragteMenge?: number;
  preisProTonne?: number;
  bezugsweg?: string;
  platzbauerId?: string;
  
  // Notizen
  notizen?: string;
  
  // Timestamps
  erstelltAm: string;
  geaendertAm: string;
  erstelltVon?: string;
}

export type NeuesProjekt = Omit<Projekt, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

// Filter-Optionen für Projekt-Liste
export interface ProjektFilter {
  status?: ProjektStatus[];
  saisonjahr?: number;
  suche?: string;
}
