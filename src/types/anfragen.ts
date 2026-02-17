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
  | 'verarbeitet'      // Vollständig verarbeitet (Kunde + Projekt + Angebot + E-Mail)
  | 'abgelehnt'        // Anfrage wurde abgelehnt/ignoriert
  | 'erledigt'         // Vollständig bearbeitet
  | 'geloescht';       // Gelöscht (bleibt in DB für Duplikat-Erkennung)

export interface ExtrahierteDaten {
  // Vom n8n-Workflow oder Netlify Function extrahierte Informationen
  kundenname?: string; // WICHTIG: Vereinsname hat Priorität!
  vereinsname?: string; // Vereins-Name aus Webformular
  vorname?: string; // Vorname des Ansprechpartners
  nachname?: string; // Nachname des Ansprechpartners
  ansprechpartner?: string; // Kombiniert: "Vorname Nachname"
  email?: string;
  telefon?: string;
  // Flache Adressfelder (von Netlify Function)
  strasse?: string;
  plz?: string;
  ort?: string;
  // Legacy: Verschachtelte Adresse (für Kompatibilität)
  adresse?: {
    strasse?: string;
    plz?: string;
    ort?: string;
    bundesland?: string;
  };
  anfrageinhalt?: string; // Vollständiger Text der Anfrage
  // Einzelne Tonnen-Felder für präzise Kalkulation
  tonnenLose02?: number; // Tonnen 0-2mm lose
  tonnenGesackt02?: number; // Tonnen 0-2mm gesackt
  tonnenLose03?: number; // Tonnen 0-3mm lose
  tonnenGesackt03?: number; // Tonnen 0-3mm gesackt
  menge?: number; // Gesamtmenge (Summe aller Tonnen)
  artikel?: string; // Extrahierter Artikel/Produkt
  lieferdatum?: string; // Extrahierter Liefertermin
  nachricht?: string; // Freitext-Nachricht vom Webformular
  anzahlPlaetze?: number; // Anzahl Tennisplätze
  koernung?: string; // z.B. "0-2" oder "0-3"
  lieferart?: string; // "lose" oder "gesackt"
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
  emailUid?: number; // IMAP UID für späteres Verschieben/Löschen
  emailKonto?: string; // E-Mail-Konto (z.B. anfrage@tennismehl.com)
  
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
  // Diese Felder werden von n8n oder der manuellen Verarbeitung ausgefüllt
  emailBetreff: string;
  emailAbsender: string;
  emailDatum: string;
  emailText: string;
  emailHtml?: string;
  extrahierteDaten: ExtrahierteDaten;
  n8nWorkflowId?: string;
  n8nExecutionId?: string;
  // Optionale Felder für manuelle Verarbeitung
  status?: AnfrageStatus;
  kundeId?: string;
  projektId?: string;
  angebotVersendetAm?: string;
  bearbeitetVon?: string;
}

export interface AnfrageUpdate {
  status?: AnfrageStatus;
  zugeordneterKundeId?: string;
  zugeordneterKundeTyp?: 'dispo' | 'saison';
  angebotId?: string;
  notizen?: string;
  bearbeitetVon?: string;
}

/**
 * Verarbeitete Anfrage mit Angebots-Vorschlag
 * Wird verwendet im Anfragen-Verarbeitungs-Tab
 */
export interface VerarbeiteteAnfrage extends Anfrage {
  // Analysierte/extrahierte Daten (aufbereitet)
  analysiert: {
    kundenname: string;
    ansprechpartner?: string;
    email?: string;
    telefon?: string;
    strasse?: string;
    plzOrt: string;
    plz?: string;
    ort?: string;
    anzahlPlaetze?: number;
    // Einzelne Tonnen-Felder
    tonnenLose02?: number;
    tonnenGesackt02?: number;
    tonnenLose03?: number;
    tonnenGesackt03?: number;
    menge?: number; // Gesamtmenge
    artikel?: string;
    koernung?: string;
    lieferart?: 'lose' | 'gesackt' | string;
  };

  // Vorgeschlagenes Angebot
  angebotsvorschlag: {
    positionen: Array<{
      artikelbezeichnung: string;
      menge: number;
      einheit: string;
      einzelpreis?: number;
      gesamtpreis?: number;
    }>;
    summeNetto?: number;
    frachtkosten?: number;
    empfohlenerPreisProTonne?: number;
  };

  // Vorgeschlagene E-Mail
  emailVorschlag: {
    betreff: string;
    text: string;
    empfaenger: string;
  };

  // Verarbeitungsstatus
  verarbeitungsStatus: 'ausstehend' | 'in_bearbeitung' | 'bereit' | 'genehmigt' | 'abgelehnt';
}

/**
 * Konfiguration für die Anfragen-Verarbeitung
 */
export interface AnfragenVerarbeitungConfig {
  automatischParsen: boolean;
  standardZahlungsziel: string;
  standardGueltigkeit: number; // Tage
  standardEmailVorlage: string;
}



