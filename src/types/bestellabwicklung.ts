export interface RechnungsPosition {
  id: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  gesamtpreis: number;
}

export interface RechnungsDaten {
  // Rechnungsinformationen
  rechnungsnummer: string;
  rechnungsdatum: string;
  leistungsdatum?: string;
  
  // Kundeninformationen
  kundenname: string;
  kundenstrasse: string;
  kundenPlzOrt: string;
  
  // Firmendaten (Absender)
  firmenname: string;
  firmenstrasse: string;
  firmenPlzOrt: string;
  firmenTelefon: string;
  firmenEmail: string;
  firmenWebsite?: string;
  
  // Bankdaten
  bankname: string;
  iban: string;
  bic: string;
  
  // Steuerdaten
  steuernummer?: string;
  ustIdNr?: string;
  
  // Positionen
  positionen: RechnungsPosition[];
  
  // Zahlungsbedingungen
  zahlungsziel: number; // Tage
  skonto?: {
    prozent: number;
    tage: number;
  };
  
  // Bemerkungen
  bemerkung?: string;
}

export interface RechnungsBerechnung {
  nettobetrag: number;
  umsatzsteuer: number;
  umsatzsteuersatz: number;
  bruttobetrag: number;
}
