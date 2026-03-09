export interface UniversalArtikel {
  $id?: string;
  artikelnummer: string;
  bezeichnung: string;
  verpackungseinheit: string;
  grosshaendlerPreisNetto: number;
  katalogPreisNetto: number;
  katalogPreisBrutto: number;
  seiteKatalog?: number;
  aenderungen?: string;
  importDatum?: string;
  ohneMwSt?: boolean; // Artikel ist bereits Brutto (keine MwSt hinzufügen, z.B. Versandkosten)
}

export interface UniversalArtikelInput {
  artikelnummer: string;
  bezeichnung: string;
  verpackungseinheit: string;
  grosshaendlerPreisNetto: number;
  katalogPreisNetto: number;
  katalogPreisBrutto: number;
  seiteKatalog?: number;
  aenderungen?: string;
  ohneMwSt?: boolean; // Artikel ist bereits Brutto (keine MwSt hinzufügen)
}

export interface ExcelImportResult {
  erfolg: number;
  fehler: number;
  fehlermeldungen: string[];
}

// Progress-Callback für Import-Fortschritt
export interface ImportProgress {
  phase: 'parsing' | 'deleting' | 'importing' | 'done';
  current: number;
  total: number;
  message: string;
}

export type ImportProgressCallback = (progress: ImportProgress) => void;

// Backwards compatibility aliases (deprecated)
export type UniversaArtikel = UniversalArtikel;
export type UniversaArtikelInput = UniversalArtikelInput;
