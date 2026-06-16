/**
 * Mosaik (Altsystem) Datentypen
 *
 * Die Datenstrukturen entsprechen den von `migration/scripts/export_mosaik.py`
 * erzeugten JSON-Dateien. Schlüssel = Mosaik-Spaltennamen (1:1, inkl. Umlaute).
 */

// ============================================================
// ROHDATEN (aus Mosaik-Export)
// ============================================================

export interface MosaikKunde {
  Kurzname: string;
  Nummer: string | null;
  Matchcode: string | null;
  Typ: number | null;
  Gruppe: string | null;
  Branche: string | null;
  Name1: string | null;
  Name2: string | null;
  Name3: string | null;
  Briefanrede: string | null;
  Geschlecht: number | null;
  Straße: string | null;
  PLZ: string | null;
  Ort: string | null;
  Postfach: string | null;
  Postfachort: string | null;
  Ländercode: string | null;
  Telefon: string | null;
  Telefax: string | null;
  Mobiltelefon: string | null;
  Kommunikation: string | null; // = E-Mail
  Internetadresse: string | null;
  UStID: string | null;
  IBAN: string | null;
  BIC: string | null;
  Bankname: string | null;
  BLZ: string | null;
  Bankkonto: string | null;
  Bankkontoinhaber: string | null;
  Zahlungsart: string | null;
  Zahlungsmittel: string | null;
  Zahlungsweise: string | null;
  Info: string | null;
  Herkunft: string | null;
  Erstkontakt: string | null;
  Umsatzdatum: string | null;
  Erstanlagedatum: string | null;
  Änderungsdatum: string | null;
  Löschdatum: string | null;
  Ausgeblendet: boolean | null;
  Kreditlimit: number | null;
  Kreditsperre: boolean | null;
  Mahncode: number | null;
  Fahrtzone: string | null;
}

export interface MosaikAnsprechpartner {
  Kurzname: string;
  Ansprechpartner: string | null;
  Anrede: string | null;
  Namenszusatz: string | null;
  Position: string | null;
  Abteilung: string | null;
  Telefon: string | null;
  Mobiltelefon: string | null;
  Telefax: string | null;
  Kommunikation: string | null; // = E-Mail
  Geschlecht: number | null;
  Geburtsdatum: string | null;
  Straße: string | null;
  PLZ: string | null;
  Ort: string | null;
  Info: string | null;
}

/** sub_adressen.json: gleiche Felder wie MosaikKunde, andere Bedeutung */
export type MosaikSubAdresse = MosaikKunde;

export interface MosaikAdressreferenz {
  /** Verbindungstyp (Mosaik-intern) */
  Typ: number | null;
  /** Mosaik-Kurzname des Haupt-Kunden */
  Kurzname: string;
  /** Mosaik-Kurzname der Sub-Adresse */
  Referenz: string;
}

export interface MosaikJahrUmsatz {
  anzahl: number;
  /** Achtung: skaliert (z.B. Pfennig × 100). Vor Übernahme verifizieren! */
  summe: number;
  vorgaenge: Record<string, number>;
}

/** bestellhistorie.json: { Kurzname: { "2024": {...}, "2025": {...} } } */
export type MosaikBestellhistorie = Record<string, MosaikJahrUmsatz>;

export interface MosaikZahlungsverhalten {
  anzahl_buchungen: number;
  max_mahnstufe: number;
  letzte_buchung: string | null;
}

// ============================================================
// STAGING (migration_kandidaten Collection)
// ============================================================

export type MigrationStatus =
  | 'neu'
  | 'auto_match'
  | 'review'
  | 'bestaetigt'
  | 'angelegt'
  | 'uebersprungen'
  | 'fehler';

/** Pro Feld: welcher Wert kommt aus Mosaik, welcher aus CRM, was wird übernommen */
export interface FeldDiffEintrag {
  feld: string;
  mosaikWert: string | null;
  crmWert: string | null;
  empfehlung: 'mosaik' | 'crm' | 'beibehalten';
}

export interface MosaikKandidatData {
  rohdaten: MosaikKunde;
  ansprechpartner: MosaikAnsprechpartner[];
  subAdressen: Array<{ referenz: MosaikAdressreferenz; adresse: MosaikSubAdresse }>;
  bestellhistorie?: MosaikBestellhistorie;
  zahlungsverhalten?: MosaikZahlungsverhalten;
  /** wird beim Matching befüllt */
  feldDiff?: FeldDiffEintrag[];
  /** Begründung des Matching-Vorschlags (deterministisch oder KI) */
  matchBegruendung?: string;
  /** Freitext-Notiz vom Bearbeiter */
  notiz?: string;
}

export interface MigrationKandidat {
  id: string;
  mosaikKurzname: string;
  status: MigrationStatus;
  gruppe?: string;
  bundesland?: string;
  matchKundeId?: string;
  matchScore?: number;
  mosaikInaktiv?: boolean;
  bearbeitetAm?: string;
  bearbeitetVon?: string;
  data: MosaikKandidatData;
  /** Appwrite Timestamps */
  $createdAt?: string;
  $updatedAt?: string;
}

// ============================================================
// IMPORT-BUNDLE (was die UI hochlädt)
// ============================================================

export interface MosaikImportBundle {
  kunden: MosaikKunde[];
  ansprechpartner: Record<string, MosaikAnsprechpartner[]>;
  subAdressen: MosaikSubAdresse[];
  adressreferenzen: MosaikAdressreferenz[];
  bestellhistorie: Record<string, MosaikBestellhistorie>;
  zahlungsverhalten: Record<string, MosaikZahlungsverhalten>;
}
