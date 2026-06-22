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
    betreff: 'Zahlungserinnerung – Rechnung {rechnungsnummer}',
    anrede: 'Guten Tag zusammen,',
    haupttext: `sicherlich ist es im Tagesgeschäft nur untergegangen: Für die Rechnung {rechnungsnummer} konnten wir bislang keinen Zahlungseingang feststellen. Wir möchten Sie daher freundlich an den offenen Betrag von {offenerBetrag} erinnern und bitten Sie um Überweisung bis zum {neueZahlungsfrist}.

BITTE BEACHTEN SIE UNSERE GEÄNDERTEN KONTODATEN (siehe unten) – diese haben sich gegenüber dem letzten Jahr geändert.

Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie diese Erinnerung bitte als gegenstandslos.`,
    schlusstext: `Bei Fragen zu dieser Rechnung sind wir gerne für Sie da. Sollte diese Zahlungserinnerung künftig an eine andere E-Mail-Adresse (z. B. Buchhaltung/Vorstand) gehen, teilen Sie uns diese bitte kurz mit.

Mit freundlichen Grüßen`,
    fristTage: 7,
  },

  mahnung_1: {
    betreff: '1. Mahnung – Rechnung {rechnungsnummer}',
    anrede: 'Guten Tag zusammen,',
    haupttext: `trotz unserer Zahlungserinnerung konnten wir für die Rechnung {rechnungsnummer} noch keinen Zahlungseingang feststellen. Wir bitten Sie daher, den ausstehenden Betrag von {gesamtforderung} (inkl. Mahngebühren) bis spätestens {neueZahlungsfrist} auf unser unten angegebenes Konto zu überweisen.

BITTE BEACHTEN SIE UNSERE GEÄNDERTEN KONTODATEN (siehe unten)!`,
    schlusstext: `Sollte die Zahlung zwischenzeitlich erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos. Sollte dieses Schreiben künftig an eine andere E-Mail-Adresse (z. B. Buchhaltung/Vorstand) gehen, teilen Sie uns diese bitte kurz mit.

Mit freundlichen Grüßen`,
    fristTage: 10,
    mahngebuehren: 5.00,
  },

  mahnung_2: {
    betreff: '2. Mahnung – Letzte Zahlungsaufforderung – Rechnung {rechnungsnummer}',
    anrede: 'Guten Tag zusammen,',
    haupttext: `trotz unserer vorangegangenen Mahnung ist die Zahlung für die Rechnung {rechnungsnummer} weiterhin offen. Wir fordern Sie hiermit letztmalig auf, den gesamten ausstehenden Betrag von {gesamtforderung} (inkl. Mahngebühren) bis spätestens {neueZahlungsfrist} zu begleichen.

BITTE BEACHTEN SIE UNSERE GEÄNDERTEN KONTODATEN (siehe unten)!`,
    schlusstext: `Sollte dieses Schreiben künftig an eine andere E-Mail-Adresse (z. B. Buchhaltung/Vorstand) gehen, teilen Sie uns diese bitte kurz mit.

Wir hoffen, dass sich diese Angelegenheit einvernehmlich klären lässt, und verbleiben

mit freundlichen Grüßen`,
    fristTage: 7,
    mahngebuehren: 10.00,
    inkassoHinweis: 'Sollte die Zahlung nicht bis zum {neueZahlungsfrist} bei uns eingegangen sein, werden wir die Forderung ohne weitere Ankündigung an ein Inkassounternehmen übergeben. Die dadurch entstehenden Kosten gehen zu Ihren Lasten.',
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
