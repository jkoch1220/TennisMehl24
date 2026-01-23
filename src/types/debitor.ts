// Debitorenverwaltung Types - Offene Forderungen von Kunden

// Status-Typen für Debitoren (Zahlungsstatus)
export type DebitorStatus =
  | 'offen'           // Rechnung erstellt, noch nicht fällig
  | 'faellig'         // Rechnung ist fällig (Zahlungsziel überschritten)
  | 'ueberfaellig'    // > 14 Tage nach Fälligkeit
  | 'gemahnt'         // Mindestens eine Mahnung versendet
  | 'teilbezahlt'     // Teilzahlung eingegangen
  | 'bezahlt';        // Vollständig bezahlt

// Mahnstufe (0-4)
export type DebitorMahnstufe = 0 | 1 | 2 | 3 | 4;
// 0 = keine Mahnung
// 1 = Zahlungserinnerung (freundlich)
// 2 = 1. Mahnung
// 3 = 2. Mahnung (letzte Frist)
// 4 = Inkasso/gerichtlich

// Priorität für Bearbeitung
export type DebitorPrioritaet = 'kritisch' | 'hoch' | 'normal' | 'niedrig';

// Zahlung Interface für Zahlungshistorie
export interface DebitorZahlung {
  id: string;
  betrag: number;
  datum: string; // ISO Date String
  zahlungsart?: 'ueberweisung' | 'bar' | 'lastschrift' | 'scheck';
  referenz?: string; // z.B. Bankreferenz
  notiz?: string;
  erstelltAm: string;
  erstelltVon?: string;
}

// Aktivitäts-Typen für den Verlauf (Salesforce-Style)
export type DebitorAktivitaetsTyp =
  | 'email'                // E-Mail gesendet/empfangen
  | 'telefonat'            // Telefonat
  | 'mahnung_versendet'    // Mahnung versendet
  | 'zahlung_eingegangen'  // Zahlung eingegangen
  | 'kommentar'            // Notiz/Kommentar
  | 'status_aenderung'     // Status geändert
  | 'erinnerung';          // Wiedervorlage/Erinnerung

// Aktivität für den Debitorenverlauf
export interface DebitorAktivitaet {
  id: string;
  typ: DebitorAktivitaetsTyp;
  titel: string;
  beschreibung?: string;
  mahnstufe?: DebitorMahnstufe; // Bei Mahnung: welche Stufe
  betrag?: number; // Bei Zahlung
  dateiId?: string; // Angehängte Datei (z.B. Mahnschreiben PDF)
  dateiName?: string;
  erstelltAm: string;
  erstelltVon?: string;
}

// Haupt-Interface für Debitoren-Metadaten (in Appwrite gespeichert)
export interface DebitorMetadaten {
  id: string;
  projektId: string; // Verknüpfung zum Projekt

  // Status (berechnet aus Projekt + Zahlungen)
  status: DebitorStatus;

  // Mahnwesen
  mahnstufe: DebitorMahnstufe;
  letzteMahnungAm?: string;
  naechsteMahnungAm?: string; // Geplante nächste Mahnung

  // Zahlungen
  zahlungen: DebitorZahlung[];

  // Aktivitäten
  aktivitaeten: DebitorAktivitaet[];

  // Priorisierung
  prioritaet: DebitorPrioritaet;

  // Notizen
  notizen?: string;

  // Zahlungsziel-Override (wenn abweichend vom Standard 14 Tage)
  zahlungszielTage?: number;

  // Sperrvermerk (z.B. keine weiteren Lieferungen)
  gesperrt?: boolean;
  sperrgrund?: string;

  // Timestamps
  erstelltAm: string;
  geaendertAm: string;
}

// Neue Metadaten (ohne ID für Erstellung)
export type NeueDebitorMetadaten = Omit<DebitorMetadaten, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  erstelltAm?: string;
  geaendertAm?: string;
};

// Kombiniertes View-Interface (Projekt + Metadaten) - für UI
export interface DebitorView {
  // Aus Projekt
  projektId: string;
  kundeId: string;
  kundennummer?: string;
  kundenname: string;
  kundenEmail?: string;
  ansprechpartner?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  rechnungsbetrag: number;
  saisonjahr: number;

  // Aus Metadaten (oder Defaults)
  metadatenId?: string;
  status: DebitorStatus;
  mahnstufe: DebitorMahnstufe;
  prioritaet: DebitorPrioritaet;
  zahlungen: DebitorZahlung[];
  aktivitaeten: DebitorAktivitaet[];
  notizen?: string;
  gesperrt?: boolean;
  sperrgrund?: string;
  letzteMahnungAm?: string;

  // Berechnete Felder
  offenerBetrag: number;
  bezahlterBetrag: number;
  faelligkeitsdatum: string;
  tageUeberfaellig: number;
  prozentBezahlt: number;
  zahlungszielTage: number;
}

// Statistik Interface für Dashboard
export interface DebitorenStatistik {
  gesamtForderungen: number; // Summe aller Rechnungen
  gesamtOffen: number; // Summe offener Beträge
  gesamtBezahlt: number; // Summe bezahlter Beträge
  anzahlOffen: number; // Anzahl offener Debitoren
  anzahlBezahlt: number;

  // Nach Status
  ueberfaelligBetrag: number;
  ueberfaelligAnzahl: number;
  gemahntBetrag: number;
  gemahntAnzahl: number;

  // Aufschlüsselung
  nachMahnstufe: Record<DebitorMahnstufe, { anzahl: number; betrag: number }>;
  nachSaisonjahr: Record<number, { anzahl: number; betrag: number }>;

  // Top-Listen
  kritischeDebitoren: DebitorView[]; // Top 10 nach Betrag/Überfälligkeit
  naechsteFaelligkeiten: DebitorView[]; // Nächste 7 Tage fällig
}

// Filter-Optionen für Debitorenliste
export interface DebitorFilter {
  status?: DebitorStatus[];
  mahnstufe?: DebitorMahnstufe[];
  saisonjahr?: number;
  prioritaet?: DebitorPrioritaet[];
  faelligVon?: string; // ISO Date String
  faelligBis?: string;
  betragMin?: number;
  betragMax?: number;
  suche?: string; // Suche in Kundenname, Rechnungsnummer
  nurUeberfaellig?: boolean;
  nurGesperrt?: boolean;
}

// Sortier-Optionen
export type DebitorSortierFeld =
  | 'faelligkeitsdatum'
  | 'rechnungsbetrag'
  | 'offenerBetrag'
  | 'tageUeberfaellig'
  | 'status'
  | 'mahnstufe'
  | 'kundenname'
  | 'rechnungsdatum';

export type SortierRichtung = 'asc' | 'desc';

// Mahnstufen-Konfiguration für UI
export const MAHNSTUFEN_CONFIG: Record<DebitorMahnstufe, { label: string; beschreibung: string; tage: number; color: string; bgColor: string }> = {
  0: { label: 'Keine', beschreibung: 'Noch keine Mahnung', tage: 0, color: 'text-gray-600', bgColor: 'bg-gray-100' },
  1: { label: 'Erinnerung', beschreibung: 'Freundliche Zahlungserinnerung', tage: 7, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  2: { label: '1. Mahnung', beschreibung: 'Erste Mahnung', tage: 14, color: 'text-amber-600', bgColor: 'bg-amber-100' },
  3: { label: '2. Mahnung', beschreibung: 'Letzte Mahnung vor Inkasso', tage: 21, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  4: { label: 'Inkasso', beschreibung: 'Inkasso/Gerichtliches Mahnverfahren', tage: 30, color: 'text-red-600', bgColor: 'bg-red-100' },
};

// Status-Konfiguration für UI
export const DEBITOR_STATUS_CONFIG: Record<DebitorStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  offen: { label: 'Offen', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: 'Clock' },
  faellig: { label: 'Fällig', color: 'text-amber-600', bgColor: 'bg-amber-100', icon: 'AlertCircle' },
  ueberfaellig: { label: 'Überfällig', color: 'text-red-600', bgColor: 'bg-red-100', icon: 'AlertTriangle' },
  gemahnt: { label: 'Gemahnt', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: 'Mail' },
  teilbezahlt: { label: 'Teilbezahlt', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: 'CreditCard' },
  bezahlt: { label: 'Bezahlt', color: 'text-green-600', bgColor: 'bg-green-100', icon: 'CheckCircle' },
};

// Standard-Zahlungsziel in Tagen
export const STANDARD_ZAHLUNGSZIEL_TAGE = 14;
