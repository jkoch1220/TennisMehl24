/**
 * Type-Definitionen für das E-Mail-System
 */

// Dokumenttypen die per E-Mail versendet werden können
export type DokumentTyp = 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung';

// E-Mail-Template (HTML-basiert)
export interface EmailTemplate {
  betreff: string;
  htmlContent: string;  // HTML-Content statt Plain-Text
  signatur?: string;    // Optionale separate Signatur (HTML)
}

// Alle E-Mail-Templates nach Dokumenttyp
export interface EmailTemplates {
  angebot: EmailTemplate;
  auftragsbestaetigung: EmailTemplate;
  lieferschein: EmailTemplate;
  rechnung: EmailTemplate;
}

// E-Mail-Konto aus der Konfiguration
export interface EmailAccount {
  email: string;
  name: string;
  password?: string; // Nur serverseitig verfügbar
}

// Request für E-Mail-Versand
export interface EmailSendRequest {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;      // Plain-Text Fallback
  pdfBase64?: string;     // PDF als Base64-String
  pdfFilename?: string;   // Dateiname für PDF-Anhang
  testMode?: boolean;     // Wenn true, sendet an Test-Adresse
}

// Response vom E-Mail-Versand
export interface EmailSendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  testModeActive?: boolean;
  actualRecipient?: string; // Bei Testmodus: wohin tatsächlich gesendet
}

// E-Mail-Protokoll für Appwrite
export interface EmailProtokoll {
  $id?: string;
  $createdAt?: string;
  $updatedAt?: string;
  projektId: string;
  dokumentTyp: DokumentTyp;
  dokumentNummer: string;
  empfaenger: string;
  absender: string;
  betreff: string;
  htmlContent: string;
  pdfDateiname: string;
  pdfVersion?: number;
  gesendetAm: string;
  status: 'gesendet' | 'fehler';
  fehlerMeldung?: string;
  messageId?: string;
}

// Input für neues Protokoll
export interface EmailProtokollInput {
  projektId: string;
  dokumentTyp: DokumentTyp;
  dokumentNummer: string;
  empfaenger: string;
  absender: string;
  betreff: string;
  htmlContent: string;
  pdfDateiname: string;
  pdfVersion?: number;
  status: 'gesendet' | 'fehler';
  fehlerMeldung?: string;
  messageId?: string;
}

// Platzhalter für E-Mail-Templates
export interface EmailPlatzhalter {
  dokumentNummer: string;
  kundenname: string;
  kundennummer?: string;
  datum?: string;
  ansprechpartner?: string;
  projektnummer?: string;
}

// Verfügbare Platzhalter-Keys
export const PLATZHALTER_KEYS = [
  '{dokumentNummer}',
  '{kundenname}',
  '{kundennummer}',
  '{kundennummerText}',
  '{datum}',
  '{ansprechpartner}',
  '{projektnummer}'
] as const;

// Standard-Test-E-Mail-Adresse
export const TEST_EMAIL_ADDRESS = 'jtatwcook@gmail.com';
