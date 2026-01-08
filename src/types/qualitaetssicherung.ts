// Qualitätssicherung Types für Tennismehl 0/2 nach DIN 18035-5

export interface Siebwerte {
  mm2_0: number;   // 2.0mm - 100% (fix)
  mm1_0: number;   // 1.0mm - 85-95%
  mm0_63: number;  // 0.63mm - 65-80%
  mm0_315: number; // 0.315mm - 40-60%
  mm0_125: number; // 0.125mm - 20-35%
  mm0_063: number; // 0.063mm - 0-10%
}

// Rückstände in Gramm pro Sieb (für genaue Prozentsatz-Berechnung)
export interface SiebRueckstaende {
  mm2_0: number;   // Rückstand auf 2,0mm Sieb in g
  mm1_0: number;   // Rückstand auf 1,0mm Sieb in g
  mm0_63: number;  // Rückstand auf 0,63mm Sieb in g
  mm0_315: number; // Rückstand auf 0,315mm Sieb in g
  mm0_125: number; // Rückstand auf 0,125mm Sieb in g
  mm0_063: number; // Rückstand auf 0,063mm Sieb in g
  durchgang: number; // Was durch 0,063mm durchgeht (Feinanteil) in g
}

export type QSErgebnis = 'bestanden' | 'nicht_bestanden' | 'mischprobe';

// Probentyp: Mischprobe (Produktion) vs Fertigprodukt (Auslieferung)
export type ProbenTyp = 'mischprobe' | 'fertigprodukt';

// Hammer-Status im Produktionsprozess
export type HammerStatus = 'frisch' | 'genutzt' | 'gedreht' | 'wechsel_faellig';

export interface HammerInfo {
  status: HammerStatus;
  letzterWechsel?: string;      // ISO Datum
  betriebsstunden?: number;
  anzahlDrehungen?: number;     // 0, 1, 2, 3 (max 4 Seiten)
}

export interface Siebanalyse {
  id: string;
  chargenNummer: string;
  pruefDatum: string;
  probenTyp: ProbenTyp;           // NEU: Mischprobe oder Fertigprodukt
  hammerInfo?: HammerInfo;        // NEU: Hammer-Status bei Produktion
  kundeId?: string;
  projektId?: string;
  kundeName?: string;
  projektName?: string;
  siebwerte: Siebwerte;           // Berechnete Siebdurchgänge in %
  probenGewicht?: number;         // Gesamtgewicht der Probe in g
  siebRueckstaende?: SiebRueckstaende; // Rückstände pro Sieb in g
  ergebnis: QSErgebnis;
  abweichungen: string[];
  notizen?: string;
  erstelltAm: string;
  erstelltVon?: string;
  // NEU: Für Mischungen
  istMischung?: boolean;
  quellChargen?: string[];        // IDs der gemischten Chargen
  mischVerhaeltnis?: number[];    // Prozentuale Anteile
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
  probenTyp?: ProbenTyp | 'alle';
  hammerStatus?: HammerStatus | 'alle';
}

// Mischungs-Berechnung
export interface MischKomponente {
  analyseId: string;
  chargenNummer: string;
  anteil: number;  // 0-100%
  siebwerte: Siebwerte;
}

export interface MischErgebnis {
  komponenten: MischKomponente[];
  gemischteSiebwerte: Siebwerte;
  ergebnis: QSErgebnis;
  abweichungen: string[];
}

// DIN 18035-5 Diagramm-Daten
export interface DINDiagrammPunkt {
  siebweite: number;       // mm (für X-Achse, log)
  siebLabel: string;       // "2,0" etc.
  durchgang: number;       // % Siebdurchgang
  minGrenze: number;       // DIN Min
  maxGrenze: number;       // DIN Max
  rueckstand?: number;     // % Rückstand (100 - Durchgang)
}

// Hammer-Statistik
export interface HammerStatistik {
  aktuellerStatus: HammerStatus;
  letzterWechsel: string;
  betriebsstundenSeitWechsel: number;
  anzahlProbenSeitWechsel: number;
  durchschnittlicheKoernung: Siebwerte;
  empfehlung: 'weiter' | 'drehen' | 'wechseln';
}

// Trend-Daten
export interface TrendDaten {
  analysen: Siebanalyse[];
  durchschnitt: Siebwerte;
  standardabweichung: Siebwerte;
  trend: Record<keyof Siebwerte, 'steigend' | 'fallend' | 'stabil'>;
  warnungen: string[];
}
