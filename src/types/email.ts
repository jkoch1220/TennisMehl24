/**
 * Type-Definitionen für das E-Mail-System
 */

// Belegtypen die per E-Mail versendet werden können (Beleg-Templates, EmailFormular)
export type DokumentTyp = 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung';

// Dokumenttypen die im E-Mail-Protokoll auftauchen können (Belege + Mahnwesen).
// 'mahnwesen' fasst Zahlungserinnerung + 1./2. Mahnung zusammen — die konkrete Stufe
// steht in der dokumentNummer (z.B. ZE-2026-001 / MA-2026-001).
export type ProtokollDokumentTyp = DokumentTyp | 'mahnwesen';

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

// Inline-Bild für E-Mails (z.B. Signatur-Logos), wird als cid:-Anhang eingebettet
export interface EmailInlineImage {
  cid: string;            // Content-ID, im HTML referenziert als src="cid:<cid>"
  base64: string;         // Bilddaten als Base64
  contentType: string;    // z.B. image/png
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
  inlineImages?: EmailInlineImage[]; // Eingebettete Bilder (Signatur-Logos etc.)
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
  dokumentTyp: ProtokollDokumentTyp;
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
  dokumentTyp: ProtokollDokumentTyp;
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
