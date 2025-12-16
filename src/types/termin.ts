export interface Termin {
  id: string;
  titel: string;
  beschreibung?: string;
  startDatum: string; // ISO Date String
  endDatum: string; // ISO Date String
  ganztaegig: boolean;
  farbe?: string; // Hex-Farbcode
  ort?: string;
  wiederholung?: 'keine' | 'taeglich' | 'woechentlich' | 'monatlich' | 'jaehrlich';
  wiederholungEnde?: string; // ISO Date String
  erinnerung?: number; // Minuten vor Termin
  erstelltAm: string;
  geaendertAm: string;
  erstelltVon?: string;
}

export interface NeuerTermin {
  titel: string;
  beschreibung?: string;
  startDatum: string;
  endDatum: string;
  ganztaegig?: boolean;
  farbe?: string;
  ort?: string;
  wiederholung?: 'keine' | 'taeglich' | 'woechentlich' | 'monatlich' | 'jaehrlich';
  wiederholungEnde?: string;
  erinnerung?: number;
}

export interface TerminFormData extends NeuerTermin {
  startTime?: string;
  endTime?: string;
}

export type KalenderAnsicht = 'monat' | 'woche';

export interface TerminPosition {
  top: number;
  height: number;
  left: number;
  width: number;
}

export interface WochenTag {
  datum: Date;
  istHeute: boolean;
  istAktuellerMonat: boolean;
  termine: Termin[];
}

export interface ZeitSlot {
  stunde: number;
  minute: number;
  datum: Date;
}

// Standard-Farben für Termine
export const TERMIN_FARBEN = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#84cc16', // Lime
  '#ec4899', // Pink
  '#6366f1', // Indigo
] as const;

export type TerminFarbe = typeof TERMIN_FARBEN[number];