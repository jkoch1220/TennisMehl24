export interface Artikel {
  $id?: string;
  artikelnummer: string;
  bezeichnung: string;
  beschreibung?: string;
  einheit: string; // z.B. 't', 'kg', 'Stk', 'm²'
  einzelpreis?: number; // Optional - kann auch weggelassen werden (Verkaufspreis)
  einkaufspreis?: number; // Optional - Einkaufspreis/direkte Kosten für DB1-Berechnung
  streichpreis?: number; // Optional - durchgestrichener Originalpreis für Rabattaktionen
  erstelltAm?: string;
  aktualisiertAm?: string;
}

export interface ArtikelInput {
  artikelnummer: string;
  bezeichnung: string;
  beschreibung?: string;
  einheit: string;
  einzelpreis?: number; // Optional - kann 0 oder leer sein (Verkaufspreis)
  einkaufspreis?: number; // Optional - Einkaufspreis/direkte Kosten für DB1-Berechnung
  streichpreis?: number; // Optional - durchgestrichener Originalpreis für Rabattaktionen
}
