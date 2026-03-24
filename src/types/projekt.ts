// Projekt-Status
export type ProjektStatus = 'angebot' | 'angebot_versendet' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung' | 'bezahlt' | 'verloren';

// Gründe für verlorene Projekte
export type VerlorenGrund = 'duplikat' | 'preis' | 'kommunikation' | 'telefon_fehler' | 'sonstiges';

export const VERLOREN_GRUENDE: { value: VerlorenGrund; label: string }[] = [
  { value: 'duplikat', label: 'Duplikat' },
  { value: 'preis', label: 'Preis' },
  { value: 'kommunikation', label: 'Kommunikation' },
  { value: 'telefon_fehler', label: 'Ich habe am Telefon Scheiße gelabert' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

// Dispo-Status für Projekte (Lieferplanung)
export type DispoStatus = 'offen' | 'geplant' | 'beladen' | 'unterwegs' | 'geliefert';

// Hydrocourt-Status für TM-HYC Bestellungen (Versand an Schwab)
// Erweiterter Workflow mit Rechnungsstellung
export type HydrocourtStatus = 'offen' | 'bestellt' | 'versendet' | 'rechnungsstellung' | 'bezahlt';

// Universal-Kanban-Status für Universal-Artikel Workflow
export type UniversalKanbanStatus = 'offen' | 'versendet' | 'an_kunden' | 'rechnungsstellung' | 'bezahlt';

// Teilprojekt-Typ (nach Split)
export type TeilprojektTyp = 'universal' | 'hydrocourt';

// Lieferdatum-Typ (aus AB)
// - 'fix' = Fixes Datum, 'spaetestens' = Spätestens bis Datum
// - 'kw' = In KW X (fix), 'spaetestens_kw' = Spätestens bis KW X (flexibel)
export type LieferdatumTyp = 'fix' | 'spaetestens' | 'kw' | 'spaetestens_kw';

// Wochentage für bevorzugten Liefertag
export type Wochentag = 'montag' | 'dienstag' | 'mittwoch' | 'donnerstag' | 'freitag' | 'samstag';

// Belieferungsart
export type Belieferungsart =
  | 'nur_motorwagen'
  | 'mit_haenger'
  | 'abholung_ab_werk'
  | 'palette_mit_ladekran'
  | 'bigbag';

// Projekt-Anhang (PDF, Mail, Dokumente)
export interface ProjektAnhang {
  id: string;
  dateiname: string;
  dateityp: string; // z.B. 'application/pdf', 'message/rfc822', 'image/jpeg'
  kategorie: 'bestellung' | 'lieferung' | 'rechnung' | 'sonstiges' | 'mail';
  beschreibung?: string;
  appwriteFileId: string; // ID in Appwrite Storage
  hochgeladenAm: string;
  hochgeladenVon?: string;
  groesse: number; // Bytes
}

// Dispo-Notiz für interne Kommunikation
export interface DispoNotiz {
  id: string;
  text: string;
  erstelltAm: string;
  erstelltVon?: string;
  wichtig?: boolean;
}

// Projekt für Projektabwicklung
export interface Projekt {
  id: string;
  $id?: string; // Appwrite Document ID
  projektName: string;
  kundeId: string;
  kundennummer?: string;
  kundenname: string;
  kundenstrasse: string;
  kundenPlzOrt: string;
  kundenEmail?: string;
  /** Telefonnummer des Kunden (z.B. aus Shop-Bestellung) */
  kundenTelefon?: string;
  /** Abweichende E-Mail für Rechnungen (z.B. an Geschäftsführer/Buchhaltung) */
  rechnungsEmail?: string;
  ansprechpartner?: string;
  lieferadresse?: {
    strasse: string;
    plz: string;
    ort: string;
    land?: string; // ISO-Ländercode (z.B. 'DE', 'AT', 'CH')
  };
  saisonjahr: number;
  status: ProjektStatus;
  
  // Verlinkung zu Dokumenten
  angebotId?: string;
  angebotsnummer?: string;
  angebotsdatum?: string;
  
  auftragsbestaetigungId?: string;
  auftragsbestaetigungsnummer?: string;
  auftragsbestaetigungsdatum?: string;
  
  lieferscheinId?: string;
  lieferscheinnummer?: string;
  lieferdatum?: string;
  
  rechnungId?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  
  bezahltAm?: string;
  
  // Mengen- und Preis-Info (aus Callliste)
  angefragteMenge?: number;
  preisProTonne?: number;
  bezugsweg?: string;
  platzbauerId?: string;
  
  // Notizen
  notizen?: string;

  // Verloren-Grund (wenn status === 'verloren')
  verlorenGrund?: VerlorenGrund;
  verlorenGrundText?: string; // Freitext bei 'sonstiges'

  // === DISPO-FELDER ===
  // Dispo-Status (Lieferplanung)
  dispoStatus?: DispoStatus;

  // Geplantes Lieferdatum (aus AB oder Dispo) - nur intern für grobe Zeitplanung
  geplantesDatum?: string;

  // Kommuniziertes Lieferdatum (mit Kunde abgestimmt)
  kommuniziertesDatum?: string;

  // Zeitfenster für Lieferung
  lieferzeitfenster?: {
    von: string; // z.B. "08:00"
    bis: string; // z.B. "12:00"
  };

  // Lieferdatum-Typ (fix oder spätestens bis oder spätestens KW)
  lieferdatumTyp?: LieferdatumTyp;

  // Kalenderwoche für spätestens-KW-Modus
  lieferKW?: number;
  lieferKWJahr?: number;

  // Bevorzugter Wochentag für Lieferung
  bevorzugterTag?: Wochentag;

  // Belieferungsart (Motorwagen, Hänger, etc.)
  belieferungsart?: Belieferungsart;

  // Dispo-Notizen (interne Kommunikation)
  dispoNotizen?: DispoNotiz[];

  // Projekt-Anhänge (PDFs, Mails, Dokumente)
  anhaenge?: ProjektAnhang[];

  // Fahrer/Route Zuweisung
  fahrzeugId?: string;
  routeId?: string;
  positionInRoute?: number;

  // === KOORDINATEN (für Kartenansicht) ===
  // Geocodierte Koordinaten [longitude, latitude]
  koordinaten?: [number, number];

  // Quelle der Koordinaten: 'exakt' = genaue Adresse, 'plz' = PLZ-Zentrum, 'manuell' = vom Nutzer gesetzt
  koordinatenQuelle?: 'exakt' | 'plz' | 'manuell';

  // Flag: Adresse konnte nicht eindeutig geocodiert werden
  adresseUnbekannt?: boolean;

  // Lieferdetails
  anzahlPaletten?: number;
  liefergewicht?: number; // in Tonnen

  // DISPO-Ansprechpartner (z.B. Platzwart für diese Lieferung)
  dispoAnsprechpartner?: {
    name: string;
    telefon: string;
  };

  // === ENDE DISPO-FELDER ===

  // Projektabwicklungsdaten (als JSON)
  angebotsDaten?: string; // JSON-serialisierte AngebotsDaten
  auftragsbestaetigungsDaten?: string; // JSON-serialisierte AuftragsbestaetigungsDaten
  lieferscheinDaten?: string; // JSON-serialisierte LieferscheinDaten
  rechnungsDaten?: string; // JSON-serialisierte RechnungsDaten
  
  // === PLATZBAUER-ZUORDNUNG ===
  // Wenn dieses Projekt einem Platzbauer-Saisonprojekt zugeordnet ist
  istPlatzbauerprojekt?: boolean;
  zugeordnetesPlatzbauerprojektId?: string;

  // === INSTANDSETZUNG ===
  // Gewünschter Termin für Frühjahrs-Instandsetzung (für "Direkt Platzbauer"-Kunden)
  instandsetzungTermin?: string; // ISO Date

  // === HYDROCOURT STATUS ===
  // Status für TM-HYC Bestellungen (Versand an Schwab)
  hydrocourtStatus?: HydrocourtStatus;
  hydrocourtBestelltAm?: string;      // ISO Datum wann an Schwab gesendet
  hydrocourtTrackingNummer?: string;  // Sendungsverfolgung
  hydrocourtVersendetAm?: string;     // Wann Schwab die Ware versendet hat
  hydrocourtNotizen?: string;         // Freitext für interne Notizen

  // === UNIVERSAL-ARTIKEL STATUS ===
  // Separater Kanban-Status für Universal-Artikel (unabhängig von Ziegelmehl-Workflow!)
  universalKanbanStatus?: UniversalKanbanStatus;
  universalBestelltAm?: string;       // ISO Datum wann an Universal gesendet
  trackingNummer?: string;            // Sendungsverfolgung (GLS etc.)

  // === TEILPROJEKT-FELDER (nach Split) ===
  // Wenn dieses Projekt durch Split erstellt wurde
  quellProjektId?: string;            // ID des Original-Projekts aus dem gesplittet wurde
  istTeilprojekt?: boolean;           // true = dieses Projekt wurde durch Split erstellt
  teilprojektTyp?: TeilprojektTyp;    // 'universal' | 'hydrocourt'
  teilprojektErstelltAm?: string;     // Wann der Split durchgeführt wurde

  // Wenn aus diesem Projekt Teilprojekte erstellt wurden
  teilprojektIds?: string[];          // IDs der ausgelagerten Teilprojekte

  // Timestamps
  erstelltAm: string;
  geaendertAm: string;
  erstelltVon?: string;
}

export type NeuesProjekt = Omit<Projekt, 'id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

// Filter-Optionen für Projekt-Liste
export interface ProjektFilter {
  status?: ProjektStatus[];
  saisonjahr?: number;
  suche?: string;
}
