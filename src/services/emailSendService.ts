/**
 * Service für E-Mail-Versand und Protokollierung
 */

import { databases, DATABASE_ID } from '../config/appwrite';
import { ID } from 'appwrite';
import {
  EmailSendRequest,
  EmailSendResponse,
  EmailProtokoll,
  EmailProtokollInput,
  EmailAccount,
  EmailPlatzhalter,
  DokumentTyp,
  TEST_EMAIL_ADDRESS,
} from '../types/email';
import { Query } from 'appwrite';

// Collection ID für E-Mail-Protokoll
const EMAIL_PROTOKOLL_COLLECTION_ID = 'email_protokoll';

// API Endpoint für E-Mail-Versand
const getEmailApiUrl = (): string => {
  // In Development: lokaler Server oder Netlify Function
  if (import.meta.env.DEV) {
    return 'http://localhost:8888/.netlify/functions/email-send';
  }
  return '/.netlify/functions/email-send';
};

/**
 * Lädt alle verfügbaren E-Mail-Konten
 */
export const ladeEmailKonten = async (): Promise<EmailAccount[]> => {
  try {
    const apiUrl = import.meta.env.DEV
      ? 'http://localhost:8888/.netlify/functions/email-api?action=accounts'
      : '/.netlify/functions/email-api?action=accounts';

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.accounts || [];
  } catch (error) {
    console.error('Fehler beim Laden der E-Mail-Konten:', error);
    // Fallback-Konten für Development
    return [
      { email: 'info@tennismehl.com', name: 'Info' },
      { email: 'anfrage@tennismehl.com', name: 'Anfragen' },
      { email: 'bestellung@tennismehl24.com', name: 'Bestellungen' },
      { email: 'rechnung@tennismehl.com', name: 'Rechnungen' },
      { email: 'logistik@tennismehl.com', name: 'Logistik' },
    ];
  }
};

/**
 * Sendet eine E-Mail über die Netlify Function
 */
export const sendeEmail = async (request: EmailSendRequest): Promise<EmailSendResponse> => {
  try {
    const apiUrl = getEmailApiUrl();

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Unbekannter Fehler',
      };
    }

    return {
      success: true,
      messageId: data.messageId,
      testModeActive: data.testModeActive,
      actualRecipient: data.actualRecipient,
    };
  } catch (error) {
    console.error('Fehler beim E-Mail-Versand:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Netzwerkfehler',
    };
  }
};

/**
 * Protokolliert eine gesendete E-Mail in Appwrite
 */
export const protokolliereEmail = async (input: EmailProtokollInput): Promise<EmailProtokoll> => {
  try {
    const protokoll = {
      ...input,
      gesendetAm: new Date().toISOString(),
    };

    const result = await databases.createDocument(
      DATABASE_ID,
      EMAIL_PROTOKOLL_COLLECTION_ID,
      ID.unique(),
      protokoll
    );

    return result as unknown as EmailProtokoll;
  } catch (error) {
    console.error('Fehler beim Protokollieren der E-Mail:', error);
    throw error;
  }
};

/**
 * Lädt E-Mail-Protokolle für ein Projekt
 */
export const ladeEmailProtokoll = async (projektId: string): Promise<EmailProtokoll[]> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      EMAIL_PROTOKOLL_COLLECTION_ID,
      [
        Query.equal('projektId', projektId),
        Query.orderDesc('gesendetAm'),
        Query.limit(50),
      ]
    );

    return response.documents as unknown as EmailProtokoll[];
  } catch (error) {
    console.error('Fehler beim Laden des E-Mail-Protokolls:', error);
    return [];
  }
};

/**
 * Lädt alle E-Mail-Protokolle (für Admin-Übersicht)
 */
export const ladeAlleEmailProtokolle = async (limit = 100): Promise<EmailProtokoll[]> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      EMAIL_PROTOKOLL_COLLECTION_ID,
      [
        Query.orderDesc('gesendetAm'),
        Query.limit(limit),
      ]
    );

    return response.documents as unknown as EmailProtokoll[];
  } catch (error) {
    console.error('Fehler beim Laden der E-Mail-Protokolle:', error);
    return [];
  }
};

/**
 * Ersetzt Platzhalter in einem HTML-String
 */
export const ersetzePlatzhalter = (
  html: string,
  platzhalter: EmailPlatzhalter
): string => {
  const { dokumentNummer, kundenname, kundennummer, datum, ansprechpartner, projektnummer } =
    platzhalter;

  const kundennummerText = kundennummer ? ` (Kundennummer: ${kundennummer})` : '';
  const formatierteDatum = datum || new Date().toLocaleDateString('de-DE');

  return html
    .replace(/{dokumentNummer}/g, dokumentNummer || '')
    .replace(/{kundenname}/g, kundenname || '')
    .replace(/{kundennummer}/g, kundennummer || '')
    .replace(/{kundennummerText}/g, kundennummerText)
    .replace(/{datum}/g, formatierteDatum)
    .replace(/{ansprechpartner}/g, ansprechpartner || '')
    .replace(/{projektnummer}/g, projektnummer || '');
};

/**
 * Konvertiert ein jsPDF-Objekt zu Base64
 */
export const pdfZuBase64 = (pdf: { output: (type: string) => string }): string => {
  // jsPDF output('datauristring') gibt "data:application/pdf;base64,..." zurück
  const dataUri = pdf.output('datauristring');
  // Extrahiere nur den Base64-Teil
  const base64 = dataUri.split(',')[1];
  return base64;
};

/**
 * Konvertiert einen Blob zu Base64
 */
export const blobZuBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Entferne das Data-URL-Präfix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Sendet eine E-Mail mit PDF und protokolliert sie
 */
export const sendeEmailMitPdf = async (params: {
  empfaenger: string;
  absender: string;
  betreff: string;
  htmlBody: string;
  pdfBase64: string;
  pdfDateiname: string;
  projektId: string;
  dokumentTyp: DokumentTyp;
  dokumentNummer: string;
  pdfVersion?: number;
  testModus?: boolean;
}): Promise<EmailSendResponse> => {
  const {
    empfaenger,
    absender,
    betreff,
    htmlBody,
    pdfBase64,
    pdfDateiname,
    projektId,
    dokumentTyp,
    dokumentNummer,
    pdfVersion,
    testModus,
  } = params;

  // E-Mail senden
  const sendResult = await sendeEmail({
    to: empfaenger,
    from: absender,
    subject: betreff,
    htmlBody,
    pdfBase64,
    pdfFilename: pdfDateiname,
    testMode: testModus,
  });

  // Protokollieren (auch bei Fehler)
  try {
    await protokolliereEmail({
      projektId,
      dokumentTyp,
      dokumentNummer,
      empfaenger: testModus ? `${TEST_EMAIL_ADDRESS} (Original: ${empfaenger})` : empfaenger,
      absender,
      betreff,
      htmlContent: htmlBody,
      pdfDateiname,
      pdfVersion,
      status: sendResult.success ? 'gesendet' : 'fehler',
      fehlerMeldung: sendResult.error,
      messageId: sendResult.messageId,
    });
  } catch (protokollError) {
    console.error('Fehler beim Protokollieren:', protokollError);
    // Protokollierungsfehler soll den Versand-Status nicht überschreiben
  }

  return sendResult;
};

/**
 * Generiert eine Standard-Signatur (HTML)
 */
export const generiereStandardSignatur = (): string => {
  return `
<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
  <p style="margin: 0; color: #374151;">Mit freundlichen Grüßen</p>
  <p style="margin: 5px 0 0 0; font-weight: bold; color: #1f2937;">Koch Dienste</p>
  <p style="margin: 5px 0 0 0; font-size: 12px; color: #6b7280;">
    TennisMehl24<br>
    E-Mail: info@tennismehl.com<br>
    Web: www.tennismehl24.de
  </p>
</div>
`.trim();
};

/**
 * Konvertiert Plain-Text zu HTML (Zeilenumbrüche zu <br> und Absätze zu <p>)
 */
export const textToHtml = (text: string): string => {
  if (!text) return '';

  // Prüfe ob bereits HTML (hat <br> oder <p> Tags)
  if (/<br\s*\/?>/i.test(text) || /<p>/i.test(text)) {
    return text;
  }

  // Teile in Absätze (doppelte Zeilenumbrüche)
  const paragraphs = text.split(/\n\s*\n/);

  // Konvertiere jeden Absatz, ersetze einzelne Zeilenumbrüche durch <br>
  const htmlParagraphs = paragraphs.map(para => {
    const lines = para.trim().split('\n');
    if (lines.length === 1) {
      return `<p style="margin: 0 0 16px 0;">${lines[0]}</p>`;
    }
    return `<p style="margin: 0 0 16px 0;">${lines.join('<br>')}</p>`;
  });

  return htmlParagraphs.join('\n');
};

/**
 * Wraps HTML-Content in ein E-Mail-Template mit Styling
 */
export const wrapInEmailTemplate = (content: string, signatur?: string): string => {
  // Konvertiere Plain-Text zu HTML falls nötig
  const htmlContent = textToHtml(content);
  const signaturteil = signatur || '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      max-width: 650px;
      margin: 0 auto;
      padding: 20px;
      background-color: #ffffff;
    }
    p {
      margin: 0 0 16px 0;
      font-size: 14px;
    }
    a { color: #c41e3a; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; height: auto; }
    .signature {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    .signature p {
      margin: 0 0 8px 0;
      font-size: 13px;
    }
    .signature img {
      max-height: 60px;
      width: auto;
    }
  </style>
</head>
<body>
  <div class="email-content">
    ${htmlContent}
  </div>
  ${signaturteil ? `<div class="signature">${signaturteil}</div>` : ''}
</body>
</html>
`.trim();
};
