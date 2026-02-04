// Mahnwesen Types - Zahlungserinnerungen und Mahnungen

// Dokumenttypen im Mahnwesen
export type MahnwesenDokumentTyp = 'zahlungserinnerung' | 'mahnung_1' | 'mahnung_2';

// Basis-Interface für alle Mahnwesen-Dokumente
export interface MahnwesenDokumentDaten {
  // Dokumentinformationen
  dokumentTyp: MahnwesenDokumentTyp;
  dokumentNummer: string; // z.B. "ZE-2024-001" oder "MA-2024-001"
  dokumentDatum: string; // ISO Date

  // Debitor/Projekt-Referenz
  projektId: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  rechnungsbetrag: number;
  offenerBetrag: number;
  faelligkeitsdatum: string;
  tageUeberfaellig: number;

  // Kundendaten
  kundennummer?: string;
  kundenname: string;
  kundenstrasse: string;
  kundenPlzOrt: string;
  ansprechpartner?: string;

  // Firmendaten (Absender)
  firmenname: string;
  firmenstrasse: string;
  firmenPlzOrt: string;
  firmenTelefon: string;
  firmenEmail: string;

  // Bankdaten
  bankname: string;
  iban: string;
  bic: string;

  // Steuerdaten
  steuernummer?: string;
  ustIdNr?: string;

  // Text-Inhalt (konfigurierbar)
  betreff: string;
  anrede: string;
  haupttext: string;
  schlusstext: string;

  // Neue Zahlungsfrist
  neueZahlungsfrist: string; // ISO Date - neue Frist für die Zahlung

  // Mahngebühren (nur bei Mahnungen)
  mahngebuehren?: number;
  verzugszinsen?: number;
  gesamtforderung?: number; // offenerBetrag + mahngebuehren + verzugszinsen
}

// Gespeichertes Mahnwesen-Dokument (in Appwrite)
export interface GespeichertesMahnwesenDokument {
  $id?: string;
  $createdAt?: string;
  $updatedAt?: string;
  projektId: string;
  dokumentTyp: MahnwesenDokumentTyp;
  dokumentNummer: string;
  dateiId: string; // Appwrite Storage File ID
  dateiname: string;
  betrag: number; // Gesamtforderung
  daten: string; // JSON der MahnwesenDokumentDaten
}

// Konfigurierbare Texte für Mahnwesen
export interface MahnwesenTextVorlagen {
  // Zahlungserinnerung (freundlich)
  zahlungserinnerung: {
    betreff: string;
    anrede: string;
    haupttext: string;
    schlusstext: string;
    fristTage: number; // z.B. 7 Tage ab Erstellung
  };

  // 1. Mahnung (formell)
  mahnung_1: {
    betreff: string;
    anrede: string;
    haupttext: string;
    schlusstext: string;
    fristTage: number; // z.B. 10 Tage ab Erstellung
    mahngebuehren: number; // z.B. 5.00 EUR
  };

  // 2. Mahnung (letzte Warnung)
  mahnung_2: {
    betreff: string;
    anrede: string;
    haupttext: string;
    schlusstext: string;
    fristTage: number; // z.B. 7 Tage ab Erstellung
    mahngebuehren: number; // z.B. 10.00 EUR
    inkassoHinweis: string;
  };
}

// Standard-Textvorlagen
export const STANDARD_MAHNWESEN_VORLAGEN: MahnwesenTextVorlagen = {
  zahlungserinnerung: {
    betreff: 'Zahlungserinnerung',
    anrede: 'Sehr geehrte Damen und Herren,',
    haupttext: `sicherlich ist es nur in der Hektik des Alltags untergegangen - wir möchten Sie freundlich daran erinnern, dass die Zahlung für die oben genannte Rechnung noch aussteht.

Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie diese Erinnerung bitte als gegenstandslos.`,
    schlusstext: `Bei Fragen zu dieser Rechnung stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen`,
    fristTage: 7,
  },

  mahnung_1: {
    betreff: '1. Mahnung',
    anrede: 'Sehr geehrte Damen und Herren,',
    haupttext: `trotz unserer Zahlungserinnerung haben wir leider noch keinen Zahlungseingang für die oben genannte Rechnung feststellen können.

Wir bitten Sie daher, den ausstehenden Betrag innerhalb der genannten Frist zu begleichen.`,
    schlusstext: `Sollte die Zahlung bereits veranlasst sein, bitten wir Sie, dieses Schreiben als gegenstandslos zu betrachten.

Mit freundlichen Grüßen`,
    fristTage: 10,
    mahngebuehren: 5.00,
  },

  mahnung_2: {
    betreff: '2. Mahnung - Letzte Zahlungsaufforderung',
    anrede: 'Sehr geehrte Damen und Herren,',
    haupttext: `trotz unserer bisherigen Mahnungen ist die Zahlung für die oben genannte Rechnung noch immer nicht bei uns eingegangen.

Wir fordern Sie hiermit letztmalig auf, den gesamten ausstehenden Betrag inklusive Mahngebühren fristgerecht zu begleichen.`,
    schlusstext: `Wir hoffen, dass wir diese Angelegenheit noch einvernehmlich klären können, und verbleiben

mit freundlichen Grüßen`,
    fristTage: 7,
    mahngebuehren: 10.00,
    inkassoHinweis: 'Sollte die Zahlung nicht fristgerecht erfolgen, werden wir die Forderung ohne weitere Ankündigung an ein Inkassounternehmen übergeben. Die dadurch entstehenden Kosten gehen zu Ihren Lasten.',
  },
};

// Platzhalter für dynamische Inhalte in den Texten
export const MAHNWESEN_PLATZHALTER = {
  kundenname: '{kundenname}',
  rechnungsnummer: '{rechnungsnummer}',
  rechnungsdatum: '{rechnungsdatum}',
  rechnungsbetrag: '{rechnungsbetrag}',
  offenerBetrag: '{offenerBetrag}',
  faelligkeitsdatum: '{faelligkeitsdatum}',
  tageUeberfaellig: '{tageUeberfaellig}',
  neueZahlungsfrist: '{neueZahlungsfrist}',
  gesamtforderung: '{gesamtforderung}',
};
