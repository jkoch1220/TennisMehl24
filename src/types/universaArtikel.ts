// Versandart-Typen für Universal-Artikel
export type VersandartTyp = 'gls' | 'spedition' | 'post' | 'anfrage' | 'unbekannt';

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

  // === Zoll & Herkunft (aus Artikelliste 2026) ===
  zolltarifnummer?: string;       // ZTN (8-stellig), z.B. "95069990"
  ursprungsland?: string;          // UL (ISO 2-stellig), z.B. "DE", "CN", "VN"
  ursprungsregion?: string;        // UR, z.B. "03", "08", "99"

  // === Physische Eigenschaften ===
  gewichtKg?: number;              // Gewicht in kg
  laengeCm?: number;               // Länge in cm
  breiteCm?: number;               // Breite in cm
  hoeheCm?: number;                // Höhe in cm
  ean?: string;                    // EAN/Barcode (13-stellig)

  // === Versandcodes (Referenz auf VersandkostenArtikel) ===
  // Format: "31", "21", "31+33", "2x31+1x33", "F.a.A.", "Post"
  versandcodeDE?: string;          // Versandcode Deutschland (GLS: 3x, Spedition: 2x)
  versandcodeAT?: string;          // Versandcode Österreich (GLS: 4x)
  versandcodeBenelux?: string;     // Versandcode Benelux (GLS: 5x)

  // === Berechnete/abgeleitete Felder (für schnelle Filterung) ===
  versandartDE?: VersandartTyp;    // Abgeleitet aus versandcodeDE
  istSperrgut?: boolean;           // Abgeleitet aus Gewicht/Maßen oder Versandcode
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

  // Optionale Felder aus Artikelliste
  zolltarifnummer?: string;
  ursprungsland?: string;
  ursprungsregion?: string;
  gewichtKg?: number;
  laengeCm?: number;
  breiteCm?: number;
  hoeheCm?: number;
  ean?: string;
  versandcodeDE?: string;
  versandcodeAT?: string;
  versandcodeBenelux?: string;
  versandartDE?: VersandartTyp;
  istSperrgut?: boolean;
}

// === Versandkosten-Artikel (für Versandkosten-Preise von Universal) ===
export interface VersandkostenArtikel {
  $id?: string;
  code: string;                    // "31", "21", "33" etc.
  bezeichnung: string;             // "GLS Paket Standard DE"

  // Preise (werden von Universal nachgeliefert)
  preisNetto?: number;
  preisBrutto?: number;

  // Versandinfo
  versandart: VersandartTyp;       // 'gls' | 'spedition' | 'post'
  zone: 'DE' | 'AT' | 'Benelux';
  gewichtsklasse?: number;         // 1-5

  // Dienstleister
  dienstleister?: string;          // "GLS", "Spedition XY"

  importDatum?: string;
}

// Input-Interface für Versandkosten-Import
export interface VersandkostenArtikelInput {
  code: string;
  bezeichnung: string;
  preisNetto?: number;
  preisBrutto?: number;
  versandart: VersandartTyp;
  zone: 'DE' | 'AT' | 'Benelux';
  gewichtsklasse?: number;
  dienstleister?: string;
}

export interface ExcelImportResult {
  erfolg: number;
  fehler: number;
  aktualisiert?: number;  // Anzahl aktualisierter bestehender Artikel
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
