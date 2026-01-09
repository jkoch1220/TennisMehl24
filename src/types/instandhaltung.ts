// Frequenz-Typen für Instandhaltungsaufgaben
export type InstandhaltungFrequenz = 'taeglich' | 'woechentlich' | 'monatlich';

// Status einer Begehung
export type BegehungStatus = 'in_bearbeitung' | 'abgeschlossen' | 'abgebrochen';

// Checklist-Item Definition (Stammdaten)
export interface InstandhaltungChecklistItem {
  id: string;
  titel: string;
  beschreibung?: string;
  frequenz: InstandhaltungFrequenz;
  sortierung: number;
  istAktiv: boolean;
  erstelltAm: string;
  erstelltVon?: string;
}

// Item wie es während einer Begehung erfasst wird
export interface BegehungChecklistItem {
  checklistItemId: string;
  titel: string;
  beschreibung?: string;
  erledigt: boolean;
  erledigtAm?: string;
  bemerkung?: string;
}

// Begehungs-Session
export interface Begehung {
  id: string;
  frequenz: InstandhaltungFrequenz;
  startDatum: string;
  abschlussDatum?: string;
  status: BegehungStatus;
  bearbeiterName: string;
  checklistItems: BegehungChecklistItem[];
  notizen?: string;
  erstelltAm: string;
}

// Für neue Entitäten
export type NeuerChecklistItem = Omit<InstandhaltungChecklistItem, 'id' | 'erstelltAm'>;

// Tab-Konfiguration
export interface FrequenzTabConfig {
  id: InstandhaltungFrequenz;
  label: string;
  labelKurz: string;
  icon: string;
  color: string;
  warningDays: number;
}

// Konfigurations-Konstanten
export const FREQUENZ_CONFIG: Record<InstandhaltungFrequenz, FrequenzTabConfig> = {
  taeglich: {
    id: 'taeglich',
    label: 'Täglich',
    labelKurz: 'Tägl.',
    icon: 'Sun',
    color: 'from-amber-500 to-orange-500',
    warningDays: 1,
  },
  woechentlich: {
    id: 'woechentlich',
    label: 'Wöchentlich',
    labelKurz: 'Wöchentl.',
    icon: 'CalendarDays',
    color: 'from-blue-500 to-indigo-500',
    warningDays: 7,
  },
  monatlich: {
    id: 'monatlich',
    label: 'Monatlich',
    labelKurz: 'Monatl.',
    icon: 'Calendar',
    color: 'from-purple-500 to-pink-500',
    warningDays: 30,
  },
};

// Überfälligkeits-Status Info
export interface OverdueInfo {
  frequenz: InstandhaltungFrequenz;
  letzteBegehung: Begehung | null;
  istUeberfaellig: boolean;
  tageUeberfaellig: number;
}
