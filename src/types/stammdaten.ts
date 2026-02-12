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

  // Saison-Einstellungen
  // Die Saison geht von November bis April (z.B. Nov 2025 - Apr 2026 = Saison 2026)
  aktuelleSaison?: number; // z.B. 2026 - kann manuell überschrieben werden
  saisonStartMonat?: number; // Standard: 11 (November)

  // Liefersaison für PDF-Dokumente
  // Wird auf Angeboten/Dokumenten angezeigt, z.B. "Liefersaison voraussichtlich 02.03. - 17.04.2025 (10. - 16. KW 2025)"
  liefersaisonStartDatum?: string; // z.B. "02.03.2025"
  liefersaisonEndDatum?: string; // z.B. "17.04.2025"
  liefersaisonStartKW?: number; // z.B. 10
  liefersaisonEndKW?: number; // z.B. 16
  liefersaisonJahr?: number; // z.B. 2025

  // Instandsetzungs-Dienste (für "Direkt Platzbauer"-Kunden)
  // Liste der verfügbaren Dienste, die ein Platzbauer ausführen kann
  instandsetzungsDienste?: string[]; // z.B. ["Frühjahrs-Instandsetzung", "Herbst-Instandsetzung"]

  // Nummernkreis-Zähler für Instandsetzungsaufträge
  instandsetzungsauftragZaehler?: number;

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
  aktuelleSaison?: number;
  saisonStartMonat?: number;
  // Liefersaison für PDF-Dokumente
  liefersaisonStartDatum?: string;
  liefersaisonEndDatum?: string;
  liefersaisonStartKW?: number;
  liefersaisonEndKW?: number;
  liefersaisonJahr?: number;
  // Instandsetzungs-Dienste
  instandsetzungsDienste?: string[];
  instandsetzungsauftragZaehler?: number;
}
