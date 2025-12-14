/**
 * Type-Definitionen für Stammdaten
 */

export interface Stammdaten {
  $id?: string;
  
  // Firmendaten
  firmenname: string;
  firmenstrasse: string;
  firmenPlz: string;
  firmenOrt: string;
  firmenTelefon: string;
  firmenEmail: string;
  firmenWebsite?: string;
  
  // Geschäftsführung (Array für mehrere Geschäftsführer)
  geschaeftsfuehrer: string[];
  
  // Handelsregister
  handelsregister: string; // z.B. "Würzburg HRB 731653"
  sitzGesellschaft: string; // z.B. "Großrinderfeld"
  
  // Steuerdaten
  steuernummer?: string;
  ustIdNr: string; // z.B. "DE 320 029 255"
  
  // Bankdaten
  bankname: string;
  iban: string;
  bic: string;
  
  // Werk/Verkauf Adresse (falls abweichend von Verwaltung)
  werkName?: string;
  werkStrasse?: string;
  werkPlz?: string;
  werkOrt?: string;
  
  // E-Mail-Templates (als JSON-String gespeichert)
  emailTemplates?: string; // JSON-String mit allen E-Mail-Templates
  
  // Metadaten
  erstelltAm?: string;
  aktualisiertAm?: string;
}

export interface StammdatenInput {
  firmenname: string;
  firmenstrasse: string;
  firmenPlz: string;
  firmenOrt: string;
  firmenTelefon: string;
  firmenEmail: string;
  firmenWebsite?: string;
  geschaeftsfuehrer: string[];
  handelsregister: string;
  sitzGesellschaft: string;
  steuernummer?: string;
  ustIdNr: string;
  bankname: string;
  iban: string;
  bic: string;
  werkName?: string;
  werkStrasse?: string;
  werkPlz?: string;
  werkOrt?: string;
  emailTemplates?: string; // JSON-String mit allen E-Mail-Templates
}
