// Gemeinsame Basis-Datentypen
export interface Position {
  id: string;
  artikelnummer?: string;
  bezeichnung: string;
  beschreibung?: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  streichpreis?: number; // Optional - durchgestrichener Originalpreis für Rabattaktionen
  gesamtpreis: number;
}

export interface LieferscheinPosition {
  id: string;
  artikel: string;
  menge: number;
  einheit: string;
  seriennummer?: string;
  chargennummer?: string;
}

export interface BaseDokument {
  // Firmendaten (Absender)
  firmenname: string;
  firmenstrasse: string;
  firmenPlzOrt: string;
  firmenTelefon: string;
  firmenEmail: string;
  firmenWebsite?: string;
  
  // Kundeninformationen (Empfänger)
  kundennummer?: string;
  kundenname: string;
  kundenstrasse: string;
  kundenPlzOrt: string;
  
  // Projektnummer (optional)
  projektnummer?: string;
  
  // Ihr Ansprechpartner (bei Tennismehl)
  ihreAnsprechpartner?: string;
  
  // Lieferadresse (falls abweichend)
  lieferadresseAbweichend?: boolean;
  lieferadresseName?: string;
  lieferadresseStrasse?: string;
  lieferadressePlzOrt?: string;
  
  // Ansprechpartner (beim Kunden)
  ansprechpartner?: string;
  
  // Bemerkungen
  bemerkung?: string;
}

// ANGEBOT
export interface AngebotsDaten extends BaseDokument {
  // Angebotsinformationen
  angebotsnummer: string;
  angebotsdatum: string;
  gueltigBis: string;
  
  // Positionen
  positionen: Position[];
  
  // Zahlungsbedingungen
  zahlungsziel: string; // z.B. "Vorkasse", "14 Tage", "30 Tage"
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };
  
  // Lieferbedingungen
  lieferzeit?: string;
  lieferdatum?: string;
  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;
  
  // Optionale Klauseln
  agbHinweis?: string;
  eigentumsVorbehalt?: string;
}

// AUFTRAGSBESTÄTIGUNG (ähnlich wie Angebot, aber als Bestätigung eines erteilten Auftrags)
export interface AuftragsbestaetigungsDaten extends BaseDokument {
  // Auftragsbestätigungsinformationen
  auftragsbestaetigungsnummer: string;
  auftragsbestaetigungsdatum: string;
  kundennummerExtern?: string; // Bestellnummer/Referenznummer des Kunden
  
  // Positionen
  positionen: Position[];
  
  // Zahlungsbedingungen
  zahlungsziel: string;
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };
  
  // Lieferbedingungen
  lieferzeit?: string;
  lieferdatum?: string;
  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;
  
  // Optionale Klauseln
  agbHinweis?: string;
  eigentumsVorbehalt?: string;
}

// LIEFERSCHEIN
export interface LieferscheinDaten extends BaseDokument {
  // Lieferscheininformationen
  lieferscheinnummer: string;
  lieferdatum: string;
  bestellnummer?: string;
  
  // Positionen (OHNE Preise!)
  positionen: LieferscheinPosition[];
  
  // Empfangsbestätigung
  empfangBestaetigt?: boolean;
}

// RECHNUNG
export interface RechnungsDaten extends BaseDokument {
  // Rechnungsinformationen
  rechnungsnummer: string;
  rechnungsdatum: string;
  leistungsdatum?: string;
  
  // Bankdaten
  bankname: string;
  iban: string;
  bic: string;
  
  // Steuerdaten
  steuernummer?: string;
  ustIdNr?: string;
  
  // Positionen
  positionen: Position[];
  
  // Zahlungsbedingungen
  zahlungsziel: string; // z.B. "Vorkasse", "14 Tage", "30 Tage"
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };
}

// Berechnungen
export interface DokumentBerechnung {
  nettobetrag: number;
  umsatzsteuer: number;
  umsatzsteuersatz: number;
  bruttobetrag: number;
}

export type DokumentTyp = 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung';

// Gespeichertes Dokument in der Datenbank
export interface GespeichertesDokument {
  $id?: string;
  projektId: string;
  dokumentTyp: 'auftragsbestaetigung' | 'lieferschein' | 'rechnung';
  dokumentNummer: string;
  dateiId: string;
  dateiname: string;
  bruttobetrag?: number;
  istFinal: boolean; // true bei Rechnungen, false bei AB/LS
  daten?: string; // JSON-String der Dokument-Daten für Bearbeitung
  $createdAt?: string; // Automatisch von Appwrite erstellt
  $updatedAt?: string; // Automatisch von Appwrite erstellt
}

// Typ für die UI-Darstellung eines Dokuments
export interface DokumentAnzeige {
  id: string;
  typ: 'auftragsbestaetigung' | 'lieferschein' | 'rechnung';
  nummer: string;
  dateiname: string;
  erstelltAm: Date; // Wird aus $createdAt gemappt
  bruttobetrag?: number;
  istFinal: boolean;
  downloadUrl: string;
  viewUrl: string;
}
