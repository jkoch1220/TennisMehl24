export interface UniversaArtikel {
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
}

export interface UniversaArtikelInput {
  artikelnummer: string;
  bezeichnung: string;
  verpackungseinheit: string;
  grosshaendlerPreisNetto: number;
  katalogPreisNetto: number;
  katalogPreisBrutto: number;
  seiteKatalog?: number;
  aenderungen?: string;
}

export interface ExcelImportResult {
  erfolg: number;
  fehler: number;
  fehlermeldungen: string[];
}
