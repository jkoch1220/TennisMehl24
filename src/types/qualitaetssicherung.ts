// Qualitätssicherung Types für Tennismehl 0/2 nach DIN 18035-5

export interface Siebwerte {
  mm2_0: number;   // 2.0mm - 100% (fix)
  mm1_0: number;   // 1.0mm - 85-95%
  mm0_63: number;  // 0.63mm - 65-80%
  mm0_315: number; // 0.315mm - 40-60%
  mm0_125: number; // 0.125mm - 20-35%
  mm0_063: number; // 0.063mm - 0-10%
}

export type QSErgebnis = 'bestanden' | 'nicht_bestanden';

export interface Siebanalyse {
  id: string;
  chargenNummer: string;
  pruefDatum: string;
  kundeId?: string;
  projektId?: string;
  kundeName?: string;      // Cached für Anzeige
  projektName?: string;    // Cached für Anzeige
  siebwerte: Siebwerte;
  ergebnis: QSErgebnis;
  abweichungen: string[];
  notizen?: string;
  erstelltAm: string;
  erstelltVon?: string;
}

export type NeueSiebanalyse = Omit<Siebanalyse, 'id' | 'erstelltAm' | 'chargenNummer' | 'ergebnis' | 'abweichungen'> & {
  id?: string;
};

// DIN 18035-5 Toleranzen für Tennismehl 0/2
export interface SiebToleranz {
  sieb: keyof Siebwerte;
  label: string;
  einheit: string;
  min: number;
  max: number;
}

export const SIEB_TOLERANZEN: SiebToleranz[] = [
  { sieb: 'mm2_0',   label: '2,0',   einheit: 'mm', min: 100, max: 100 },
  { sieb: 'mm1_0',   label: '1,0',   einheit: 'mm', min: 85,  max: 95 },
  { sieb: 'mm0_63',  label: '0,63',  einheit: 'mm', min: 65,  max: 80 },
  { sieb: 'mm0_315', label: '0,315', einheit: 'mm', min: 40,  max: 60 },
  { sieb: 'mm0_125', label: '0,125', einheit: 'mm', min: 20,  max: 35 },
  { sieb: 'mm0_063', label: '0,063', einheit: 'mm', min: 0,   max: 10 },
];

// Für Graph-Darstellung
export interface GraphDataPoint {
  sieb: string;
  siebNumerisch: number;
  messwert: number;
  minToleranz: number;
  maxToleranz: number;
}

// Filter für Archiv
export interface SiebanalyseFilter {
  suche?: string;
  ergebnis?: QSErgebnis | 'alle';
  zeitraum?: 'heute' | 'woche' | 'monat' | 'jahr' | 'alle';
  kundeId?: string;
}

// Trend-Daten
export interface TrendDaten {
  analysen: Siebanalyse[];
  durchschnitt: Siebwerte;
  standardabweichung: Siebwerte;
  trend: Record<keyof Siebwerte, 'steigend' | 'fallend' | 'stabil'>;
  warnungen: string[];
}
