export interface Artikel {
  $id?: string;
  artikelnummer: string;
  bezeichnung: string;
  beschreibung?: string;
  einheit: string; // z.B. 't', 'kg', 'Stk', 'm²'
  einzelpreis?: number; // Optional - kann auch weggelassen werden
  streichpreis?: number; // Optional - durchgestrichener Originalpreis für Rabattaktionen
  erstelltAm?: string;
  aktualisiertAm?: string;
}

export interface ArtikelInput {
  artikelnummer: string;
  bezeichnung: string;
  beschreibung?: string;
  einheit: string;
  einzelpreis?: number; // Optional - kann 0 oder leer sein
  streichpreis?: number; // Optional - durchgestrichener Originalpreis für Rabattaktionen
}
