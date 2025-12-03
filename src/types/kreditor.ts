// Status-Typen für Rechnungen
export type RechnungsStatus = 
  | 'offen'           // Rechnung ist offen und noch nicht fällig
  | 'faellig'         // Rechnung ist fällig
  | 'gemahnt'         // Rechnung wurde gemahnt
  | 'in_bearbeitung'  // Rechnung wird bearbeitet/zur Zahlung vorbereitet
  | 'bezahlt'         // Rechnung wurde bezahlt
  | 'storniert'       // Rechnung wurde storniert
  | 'verzug'          // Rechnung ist im Verzug
  | 'inkasso';        // Rechnung im Inkasso

// Mahnstufe
export type Mahnstufe = 0 | 1 | 2 | 3 | 4; // 0 = keine Mahnung, 1-3 = Mahnstufen, 4 = gerichtliches Mahnverfahren

// Priorität für Bearbeitung
export type Prioritaet = 'kritisch' | 'hoch' | 'normal' | 'niedrig';

// Unternehmen für Forderungen
export type Unternehmen = 'TennisMehl' | 'Egner Bau';

// Zahlung Interface für Zahlungshistorie
export interface Zahlung {
  id: string;
  betrag: number; // Überwiesener Betrag
  datum: string; // ISO Date String - Wann wurde überwiesen
  notiz?: string; // Optional: Notiz zur Zahlung
  erstelltAm: string; // ISO Date String
}

// Kategorie für bessere Organisation
export type Rechnungskategorie = 
  | 'lieferanten'
  | 'dienstleister'
  | 'energie'
  | 'miete'
  | 'versicherung'
  | 'steuern'
  | 'darlehen'
  | 'sonstiges';

// Kreditor/Glaubiger Interface
export interface Kreditor {
  id: string;
  name: string;
  kreditorennummer?: string;
  kontakt?: {
    ansprechpartner?: string;
    telefon?: string;
    email?: string;
    adresse?: {
      strasse?: string;
      plz?: string;
      ort?: string;
    };
  };
  zahlungsbedingungen?: {
    zahlungsziel?: number; // Tage
    skonto?: {
      prozent: number;
      tage: number;
    };
  };
  notizen?: string;
  erstelltAm: string; // ISO Date String
}

// Offene Rechnung Interface
export interface OffeneRechnung {
  id: string;
  rechnungsnummer?: string; // Externe Rechnungsnummer vom Kreditor
  betreff?: string; // Betreff/Kurzbeschreibung
  kreditorId?: string; // Referenz zum Kreditor (optional)
  kreditorName: string; // Name des Kreditors/Glaubigers (Pflichtfeld)
  anUnternehmen: Unternehmen; // An welches Unternehmen ist die Forderung
  status: RechnungsStatus;
  summe: number; // Betrag in EUR
  mwst?: number; // MwSt-Betrag (optional)
  bruttoSumme?: number; // Summe inkl. MwSt (optional)
  monatlicheRate?: number; // Monatliche Rate für Ratenzahlungen (optional)
  faelligkeitsdatum: string; // ISO Date String
  rechnungsdatum?: string; // ISO Date String (wann wurde die Rechnung ausgestellt)
  mahnstufe: Mahnstufe;
  letzterKontakt?: string; // ISO Date String
  spaetestensBearbeitenAm?: string; // ISO Date String
  prioritaet: Prioritaet;
  kategorie: Rechnungskategorie;
  kommentar?: string;
  anhaenge?: string[]; // URLs oder Pfade zu angehängten Dokumenten
  zahlungsreferenz?: string; // Referenz für Zahlung (z.B. Verwendungszweck)
  erstelltAm: string; // ISO Date String
  geaendertAm: string; // ISO Date String
  bezahltAm?: string; // ISO Date String (wann wurde bezahlt)
  bezahlbetrag?: number; // Tatsächlich bezahlter Betrag (falls abweichend)
  zahlungen?: Zahlung[]; // Historie der Zahlungen/Raten
}

// Neue Rechnung (ohne ID für Erstellung)
export type NeueOffeneRechnung = Omit<OffeneRechnung, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  erstelltAm?: string;
  geaendertAm?: string;
};

// Neuer Kreditor (ohne ID für Erstellung)
export type NeuerKreditor = Omit<Kreditor, 'id' | 'erstelltAm'> & {
  erstelltAm?: string;
};

// Statistik-Interface für Dashboard
export interface KreditorenStatistik {
  gesamtOffen: number; // Anzahl offener Rechnungen
  gesamtBetrag: number; // Summe aller offenen Rechnungen
  faelligBetrag: number; // Summe fälliger Rechnungen
  verzugBetrag: number; // Summe im Verzug
  gemahntBetrag: number; // Summe gemahnter Rechnungen
  nachStatus: Record<RechnungsStatus, { anzahl: number; betrag: number }>;
  nachMahnstufe: Record<Mahnstufe, { anzahl: number; betrag: number }>;
  nachKategorie: Record<Rechnungskategorie, { anzahl: number; betrag: number }>;
  nachUnternehmen: Record<Unternehmen, { anzahl: number; betrag: number }>;
  kritischeRechnungen: OffeneRechnung[]; // Rechnungen mit hoher Priorität oder im Verzug
  naechsteFaelligkeiten: OffeneRechnung[]; // Rechnungen die bald fällig werden
}

// Filter-Optionen für Rechnungsliste
export interface RechnungsFilter {
  status?: RechnungsStatus[];
  mahnstufe?: Mahnstufe[];
  kategorie?: Rechnungskategorie[];
  kreditorId?: string;
  anUnternehmen?: Unternehmen[]; // Filter nach Unternehmen
  prioritaet?: Prioritaet[];
  faelligVon?: string; // ISO Date String
  faelligBis?: string; // ISO Date String
  betragMin?: number;
  betragMax?: number;
  suche?: string; // Suche in Rechnungsnummer, Betreff, Kreditor
}

// Sortier-Optionen
export type SortierFeld = 
  | 'faelligkeitsdatum'
  | 'summe'
  | 'status'
  | 'mahnstufe'
  | 'prioritaet'
  | 'erstelltAm'
  | 'kreditorName';

export type SortierRichtung = 'asc' | 'desc';

// Aktivitäts-Typen für den Verlauf (wie Salesforce)
export type AktivitaetsTyp = 
  | 'email'             // E-Mail-Verkehr
  | 'telefonat'         // Telefonat
  | 'kommentar'         // Kommentar/Notiz
  | 'datei'             // Datei hochgeladen
  | 'zahlung'           // Zahlung/Tilgung
  | 'status_aenderung'  // Status geändert
  | 'mahnung'           // Mahnung erhalten/gesendet
  | 'rate_anpassung';   // Monatliche Rate angepasst

// Aktivität für den Rechnungsverlauf
export interface RechnungsAktivitaet {
  id: string;
  rechnungId: string;              // Referenz zur Rechnung
  typ: AktivitaetsTyp;
  titel: string;                   // z.B. "E-Mail gesendet", "Telefonat mit Hr. Müller"
  beschreibung?: string;           // Detaillierte Beschreibung
  dateiId?: string;                // Referenz zur Datei im Storage (falls Datei)
  dateiName?: string;              // Original-Dateiname
  dateiTyp?: string;               // MIME-Type
  dateiGroesse?: number;           // Dateigröße in Bytes
  erstelltAm: string;              // ISO Date String
  erstelltVon?: string;            // Wer hat die Aktivität erstellt
}

// Neue Aktivität (ohne ID für Erstellung)
export type NeueRechnungsAktivitaet = Omit<RechnungsAktivitaet, 'id' | 'erstelltAm'> & {
  erstelltAm?: string;
};
