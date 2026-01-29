// Gemeinsame Basis-Datentypen
export interface Position {
  id: string;
  artikelnummer?: string;
  bezeichnung: string;
  beschreibung?: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  einkaufspreis?: number; // Optional - Einkaufspreis/direkte Kosten für DB1-Berechnung (nur intern)
  streichpreis?: number; // Optional - durchgestrichener Originalpreis für Rabattaktionen
  streichpreisGrund?: string; // Optional - Grund für den Rabatt (z.B. "Neukundenaktion", "Frühbucherpreis")
  gesamtpreis: number;
  istBedarfsposition?: boolean; // Optional - Bedarfspositionen werden separat im Angebot angezeigt und NICHT in die Gesamtsumme eingerechnet
}

export interface LieferscheinPosition {
  id: string;
  artikelnummer?: string;
  artikel: string;
  beschreibung?: string;
  menge: number;
  einheit: string;
  seriennummer?: string;
  chargennummer?: string;
}

export interface BaseDokument {
  // Firmendaten (Absender)
  firmenname: string;
  firmenstrasse: string;
  firmenPlzOrt: string;
  firmenTelefon: string;
  firmenEmail: string;
  firmenWebsite?: string;
  
  // Kundeninformationen (Empfänger)
  kundennummer?: string;
  kundenname: string;
  kundenstrasse: string;
  kundenPlzOrt: string;
  
  // Projektnummer (optional)
  projektnummer?: string;
  
  // Ihr Ansprechpartner (bei Tennismehl)
  ihreAnsprechpartner?: string;
  
  // Lieferadresse (falls abweichend)
  lieferadresseAbweichend?: boolean;
  lieferadresseName?: string;
  lieferadresseStrasse?: string;
  lieferadressePlzOrt?: string;
  
  // Ansprechpartner (beim Kunden)
  ansprechpartner?: string;
  
  // Bemerkungen
  bemerkung?: string;
}

// ANGEBOT
export interface AngebotsDaten extends BaseDokument {
  // Angebotsinformationen
  angebotsnummer: string;
  angebotsdatum: string;
  gueltigBis: string;
  
  // Positionen
  positionen: Position[];
  
  // Zahlungsbedingungen
  zahlungsbedingungenAusblenden?: boolean; // Zahlungsbedingungen im PDF ausblenden
  zahlungsziel: string; // z.B. "Vorkasse", "14 Tage", "30 Tage"
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Lieferbedingungen
  lieferzeit?: string;
  lieferdatum?: string;
  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;
  
  // Dieselpreiszuschlag
  dieselpreiszuschlagAktiviert?: boolean;
  dieselpreiszuschlagText?: string;
  
  // Liefersaison
  liefersaisonAnzeigen?: boolean;

  // Endpreis ausblenden (für Angebote mit variablen Mengen)
  endpreisAusblenden?: boolean;
  endpreisAlternativText?: string; // z.B. "gemäß Menge" oder leer lassen

  // Optionale Klauseln
  agbHinweis?: string;
  eigentumsVorbehalt?: string;

  // DISPO-Ansprechpartner (wird beim Kunden gespeichert, nicht im PDF gedruckt)
  dispoAnsprechpartner?: {
    name: string;
    telefon: string;
  };

  // Platzbauer (wird beim Kunden und Projekt gespeichert, nicht im PDF gedruckt)
  platzbauerId?: string;
  platzbauername?: string; // Nur für Anzeige
}

// Lieferdatum-Typ für Auftragsbestätigung
// - 'fix' = Fixes Datum (z.B. 15.03.2025)
// - 'spaetestens' = Spätestens bis Datum (z.B. spätestens 15.03.2025)
// - 'kw' = In Kalenderwoche X (feste KW)
// - 'spaetestens_kw' = Spätestens bis Kalenderwoche X (flexibel)
export type LieferdatumTyp = 'fix' | 'spaetestens' | 'kw' | 'spaetestens_kw';

// Wochentage für bevorzugten Liefertag
export type Wochentag = 'montag' | 'dienstag' | 'mittwoch' | 'donnerstag' | 'freitag' | 'samstag';

// Belieferungsart (importiert von saisonplanung, hier für Referenz)
export type Belieferungsart =
  | 'nur_motorwagen'
  | 'mit_haenger'
  | 'abholung_ab_werk'
  | 'palette_mit_ladekran'
  | 'bigbag';

// AUFTRAGSBESTÄTIGUNG (ähnlich wie Angebot, aber als Bestätigung eines erteilten Auftrags)
export interface AuftragsbestaetigungsDaten extends BaseDokument {
  // Auftragsbestätigungsinformationen
  auftragsbestaetigungsnummer: string;
  auftragsbestaetigungsdatum: string;
  kundennummerExtern?: string; // Bestellnummer/Referenznummer des Kunden

  // Positionen
  positionen: Position[];

  // Zahlungsbedingungen
  zahlungsbedingungenAusblenden?: boolean; // Zahlungsbedingungen im PDF ausblenden
  zahlungsziel: string;
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Lieferbedingungen
  lieferzeit?: string;
  lieferdatum?: string;
  lieferdatumTyp?: LieferdatumTyp; // 'fix' = Fixes Datum, 'spaetestens' = Spätestens bis, 'spaetestens_kw' = Spätestens KW
  lieferKW?: number; // Kalenderwoche (1-53) wenn lieferdatumTyp = 'spaetestens_kw'
  lieferKWJahr?: number; // Jahr der Kalenderwoche (für Jahreswechsel)
  bevorzugterTag?: Wochentag; // Bevorzugter Wochentag für die Lieferung
  lieferzeitVon?: string; // Zeitfenster von (z.B. "08:00")
  lieferzeitBis?: string; // Zeitfenster bis (z.B. "16:00")
  belieferungsart?: Belieferungsart; // Motorwagen, Hänger, etc.

  // DISPO-Ansprechpartner (z.B. Platzwart vor Ort) - wird immer beim Kunden gespeichert
  dispoAnsprechpartner?: {
    name: string;
    telefon: string;
  };

  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;

  // Optionale Klauseln
  agbHinweis?: string;
  eigentumsVorbehalt?: string;
}

// LIEFERSCHEIN
export interface LieferscheinDaten extends BaseDokument {
  // Lieferscheininformationen
  lieferscheinnummer: string;
  lieferdatum: string;
  bestellnummer?: string;

  // Ansprechpartner Telefon (zusätzlich zum ansprechpartner aus BaseDokument)
  ansprechpartnerTelefon?: string;

  // Liefertermin & Belieferung (wie in Auftragsbestätigung)
  lieferdatumTyp?: LieferdatumTyp; // 'kw' = In KW, 'spaetestens_kw' = Spätestens KW
  lieferKW?: number; // Kalenderwoche (1-53)
  lieferKWJahr?: number; // Jahr der Kalenderwoche
  bevorzugterTag?: Wochentag; // Bevorzugter Wochentag für die Lieferung
  belieferungsart?: Belieferungsart; // Motorwagen, Hänger, etc.

  // DISPO-Ansprechpartner (z.B. Platzwart vor Ort für die Anlieferung)
  dispoAnsprechpartner?: {
    name: string;
    telefon: string;
  };

  // Positionen (OHNE Preise!)
  positionen: LieferscheinPosition[];

  // Empfangsbestätigung
  empfangBestaetigt?: boolean;

  // Unterschriften für Empfangsbestätigung (default: true)
  unterschriftenFuerEmpfangsbestaetigung?: boolean;
}

// RECHNUNG
export interface RechnungsDaten extends BaseDokument {
  // Rechnungsinformationen
  rechnungsnummer: string;
  rechnungsdatum: string;
  leistungsdatum?: string;
  
  // Bankdaten
  bankname: string;
  iban: string;
  bic: string;
  
  // Steuerdaten
  steuernummer?: string;
  ustIdNr?: string;
  
  // Positionen
  positionen: Position[];

  // Zahlungsbedingungen
  zahlungsbedingungenAusblenden?: boolean; // Zahlungsbedingungen im PDF ausblenden
  zahlungsziel: string; // z.B. "Vorkasse", "14 Tage", "30 Tage"
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };
}

// Berechnungen
export interface DokumentBerechnung {
  nettobetrag: number;
  umsatzsteuer: number;
  umsatzsteuersatz: number;
  bruttobetrag: number;
}

export type DokumentTyp = 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung' | 'stornorechnung' | 'proformarechnung';

// Status einer Rechnung im Workflow
export type RechnungsStatus = 'aktiv' | 'storniert';

// Gespeichertes Dokument in der Datenbank
// WICHTIG: Diese Dokumente dienen der gesetzlichen Aufbewahrungspflicht (8 Jahre GoBD)!
export interface GespeichertesDokument {
  $id?: string;
  projektId: string;
  dokumentTyp: DokumentTyp;
  dokumentNummer: string;
  dateiId: string;
  dateiname: string;
  bruttobetrag?: number;
  istFinal: boolean; // true bei Rechnungen & Stornos (unveränderbar), false bei Angebot/AB/LS
  daten?: string; // JSON-String der Dokument-Daten für Archivierung
  version?: number; // Versionsnummer für Angebote/AB/LS
  // Storno-Referenzen (nur für Rechnungen und Stornos)
  stornoVonRechnungId?: string; // Bei Stornorechnung: ID der stornierten Rechnung
  stornoRechnungId?: string; // Bei Rechnung: ID der zugehörigen Stornorechnung (wenn storniert)
  rechnungsStatus?: RechnungsStatus; // Status der Rechnung
  stornoGrund?: string; // Begründung für Stornierung
  $createdAt?: string; // Automatisch von Appwrite erstellt
  $updatedAt?: string; // Automatisch von Appwrite erstellt
}

// Storno-Rechnung Daten
export interface StornoRechnungsDaten extends Omit<RechnungsDaten, 'rechnungsnummer' | 'rechnungsdatum'> {
  stornoRechnungsnummer: string;
  stornoDatum: string;
  originalRechnungsnummer: string;
  originalRechnungsdatum: string;
  originalRechnungId: string;
  stornoGrund: string;
}

// Proforma-Rechnung Daten
export interface ProformaRechnungsDaten extends Omit<RechnungsDaten, 'rechnungsnummer'> {
  proformaRechnungsnummer: string;
}

// Typ für die UI-Darstellung eines Dokuments
export interface DokumentAnzeige {
  id: string;
  typ: DokumentTyp;
  nummer: string;
  dateiname: string;
  erstelltAm: Date; // Wird aus $createdAt gemappt
  bruttobetrag?: number;
  istFinal: boolean;
  downloadUrl: string;
  viewUrl: string;
  version?: number;
  rechnungsStatus?: RechnungsStatus;
  stornoGrund?: string;
}

// Dateiverlauf für die UI
export interface DokumentVerlaufEintrag {
  id: string;
  typ: DokumentTyp;
  nummer: string;
  dateiname: string;
  erstelltAm: Date;
  bruttobetrag?: number;
  istFinal: boolean;
  downloadUrl: string;
  viewUrl: string;
  version?: number;
  rechnungsStatus?: RechnungsStatus;
  stornoVonRechnungId?: string;
  stornoGrund?: string;
  // UI-Helper
  istAktuell: boolean; // Neueste Version dieses Dokumenttyps
  istStorniert?: boolean; // Wurde diese Rechnung storniert?
}
