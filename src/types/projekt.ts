// Projekt-Status
export type ProjektStatus = 'angebot' | 'angebot_versendet' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung' | 'bezahlt' | 'verloren';

// Dispo-Status für Projekte (Lieferplanung)
export type DispoStatus = 'offen' | 'geplant' | 'beladen' | 'unterwegs' | 'geliefert';

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
  ansprechpartner?: string;
  lieferadresse?: {
    strasse: string;
    plz: string;
    ort: string;
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

  // === DISPO-FELDER ===
  // Dispo-Status (Lieferplanung)
  dispoStatus?: DispoStatus;

  // Geplantes Lieferdatum (aus AB oder Dispo)
  geplantesDatum?: string;

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
