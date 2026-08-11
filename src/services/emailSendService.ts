/**
 * Service für E-Mail-Versand und Protokollierung
 */

import { databases, DATABASE_ID } from '../config/appwrite';
import { istMockModusAktiv } from '../config/mockModus';
import { ID } from 'appwrite';
import {
  EmailSendRequest,
  EmailSendResponse,
  EmailProtokoll,
  EmailProtokollInput,
  EmailAccount,
  EmailPlatzhalter,
  ProtokollDokumentTyp,
  TEST_EMAIL_ADDRESS,
} from '../types/email';
import { Query } from 'appwrite';

// Collection ID für E-Mail-Protokoll
const EMAIL_PROTOKOLL_COLLECTION_ID = 'email_protokoll';

// API Endpoint für E-Mail-Versand
// In Development: Vite Proxy leitet an Produktion weiter (siehe vite.config.ts)
// In Production: relative URL
const getEmailApiUrl = (): string => {
  // Immer relativer Pfad - Vite Proxy kümmert sich um Dev
  return '/.netlify/functions/email-send';
};

/**
 * Lädt alle verfügbaren E-Mail-Konten
 */
export const ladeEmailKonten = async (): Promise<EmailAccount[]> => {
  try {
    // Vite Proxy leitet in Dev weiter, in Prod ist es relativ
    const apiUrl = '/.netlify/functions/email-api?action=accounts';

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
      { email: 'anfrage@tennismehl.com', name: 'Anfragen' },
      { email: 'info@tennismehl.com', name: 'Info' },
      { email: 'bestellung@tennismehl24.com', name: 'Bestellungen' },
      { email: 'rechnung@tennismehl.com', name: 'Rechnungen' },
      { email: 'logistik@tennismehl.com', name: 'Logistik' },
    ];
  }
};

// Hinweis für Netzwerk-/Proxy-Fehler (lokaler Mail-Dev-Server läuft nicht o.ä.)
const EMAIL_SERVER_HINWEIS =
  'E-Mail-Server nicht erreichbar. Lokal: Dev-Server mit „npm run dev:full" starten ' +
  '(Mail-Server Port 8888) oder EMAIL_PROXY_TARGET in .env auf die Netlify-Produktion stellen.';

// Versucht, einen Response-Body als JSON zu parsen. Leerer Body oder
// HTML-Fehlerseite (z.B. Proxy-502) liefern null statt einer Exception.
const parseJsonSicher = (text: string): Record<string, unknown> | null => {
  if (!text || !text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
};

const alsString = (wert: unknown): string | undefined =>
  typeof wert === 'string' && wert.trim() ? wert : undefined;

/**
 * Sendet eine E-Mail über die Netlify Function.
 *
 * Robust gegen nicht-JSON-Antworten (leerer Body, HTML-Fehlerseite) und
 * Netzwerk-/Proxy-Fehler: In diesen Fällen kommt eine klare deutsche
 * Fehlermeldung mit Handlungshinweis zurück, die im Formular angezeigt wird.
 */
export const sendeEmail = async (request: EmailSendRequest): Promise<EmailSendResponse> => {
  const apiUrl = getEmailApiUrl();

  // =========================================================================
  // MOCK-MODUS: Testversand wird hier ERZWUNGEN — nicht in den Komponenten.
  //
  // Dies ist die einzige Stelle im Frontend, an der eine E-Mail das Haus
  // verlässt: `sendeEmailMitPdf()` und alle Fachservices (Mahnwesen,
  // Rechnungsversand, Massen-Angebote, Anfragebearbeitung) laufen hier durch.
  // Deshalb sitzt die Erzwingung hier und nicht bei den ~10 Aufrufern — die
  // können sie so nicht überstimmen, auch nicht versehentlich.
  //
  // Der Empfänger wird serverseitig in netlify/functions/email-send.ts durch
  // TEST_EMAIL_ADDRESS ersetzt; `testMode: true` ist das Signal dafür. Das
  // Betreff-Präfix setzt die Function ebenfalls ("[TEST - Original an: …]"),
  // wir ergänzen hier zusätzlich "[MOCK]", damit im Postfach sofort erkennbar
  // ist, dass die Mail aus der Sandbox stammt und nicht aus einem normalen
  // Testversand auf Echtdaten.
  //
  // Der bestehende Komponenten-Schalter (testModus-State) bleibt bestehen und
  // wirkt weiter — er ist eine zusätzliche Bremse, kein Ersatz für diese hier.
  // =========================================================================
  // Zwei Bremsen statt einer: `testMode: true` biegt den Empfänger serverseitig
  // um, UND der Empfänger wird hier bereits clientseitig ersetzt. Die zweite
  // Bremse greift auch dann, wenn auf Netlify eine ältere Version der Function
  // läuft, die `testMode` noch nicht kennt — dieser Fall wäre sonst genau der
  // Weg, auf dem eine Sandbox-Mail bei einem echten Kunden landet.
  const mockAktiv = istMockModusAktiv();
  const effektiverRequest: EmailSendRequest = mockAktiv
    ? {
        ...request,
        testMode: true,
        to: TEST_EMAIL_ADDRESS,
        subject: request.subject.startsWith('[MOCK')
          ? request.subject
          : `[MOCK → ${request.to}] ${request.subject}`,
      }
    : request;

  if (mockAktiv) {
    console.warn(
      `🧪 Mock-Modus: E-Mail an "${request.to}" wird stattdessen an ${TEST_EMAIL_ADDRESS} zugestellt.`
    );
  }

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(effektiverRequest),
    });
  } catch (error) {
    // fetch-Exception: Server/Proxy gar nicht erreichbar (ECONNREFUSED, DNS, offline)
    console.error('Netzwerkfehler beim E-Mail-Versand:', error);
    return {
      success: false,
      error: `Netzwerkfehler beim E-Mail-Versand. ${EMAIL_SERVER_HINWEIS}`,
    };
  }

  // Body IMMER als Text lesen und erst dann versuchsweise parsen —
  // response.json() wirft bei leerem Body "Unexpected end of JSON input".
  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch {
    bodyText = '';
  }
  const data = parseJsonSicher(bodyText);

  if (!response.ok) {
    const serverMeldung = data ? alsString(data.message) || alsString(data.error) : undefined;
    if (serverMeldung) {
      return { success: false, error: serverMeldung };
    }
    // 500/502/504 mit leerem oder nicht-JSON-Body → typischer Proxy-/Dev-Server-Fehler
    return {
      success: false,
      error: `E-Mail-Versand fehlgeschlagen (HTTP ${response.status}, keine lesbare Server-Antwort). ${EMAIL_SERVER_HINWEIS}`,
    };
  }

  if (!data) {
    // HTTP 200, aber kein gültiges JSON — sollte nie passieren, sauber melden statt crashen
    return {
      success: false,
      error: `Unerwartete Antwort vom E-Mail-Server (kein gültiges JSON). ${EMAIL_SERVER_HINWEIS}`,
    };
  }

  return {
    success: true,
    messageId: alsString(data.messageId),
    testModeActive: data.testModeActive === true,
    actualRecipient: alsString(data.actualRecipient),
  };
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
 * Lädt das E-Mail-Protokoll für EIN konkretes Dokument (Projekt + Dokumenttyp,
 * optional eingeschränkt auf die Dokumentnummer) — Basis der Doppelversand-Warnung.
 *
 * Gibt bei Fehlern bewusst null zurück (nicht []), damit das Formular
 * "Verlauf konnte nicht geprüft werden" von "noch nie versendet" unterscheiden kann.
 */
export const ladeEmailProtokollFuerDokument = async (
  projektId: string,
  dokumentTyp: ProtokollDokumentTyp,
  dokumentNummer?: string
): Promise<EmailProtokoll[] | null> => {
  try {
    const queries = [
      Query.equal('projektId', projektId),
      Query.equal('dokumentTyp', dokumentTyp),
      Query.orderDesc('gesendetAm'),
      Query.limit(100),
    ];
    if (dokumentNummer && dokumentNummer.trim()) {
      queries.push(Query.equal('dokumentNummer', dokumentNummer.trim()));
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      EMAIL_PROTOKOLL_COLLECTION_ID,
      queries
    );
    return response.documents as unknown as EmailProtokoll[];
  } catch (error) {
    console.error('Fehler beim Laden des Dokument-E-Mail-Protokolls:', error);
    return null;
  }
};

/**
 * Erkennt Testmodus-Versände im Protokoll.
 *
 * Neue Einträge protokollieren im Testmodus den tatsächlichen Empfänger
 * (Test-Adresse); ältere/fremde Einträge werden über den [TEST]-Betreff erkannt.
 */
export const istTestversand = (eintrag: EmailProtokoll): boolean => {
  return (
    eintrag.empfaenger === TEST_EMAIL_ADDRESS ||
    (eintrag.betreff || '').includes('[TEST]')
  );
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
 *
 * @param skipProtokoll - Wenn true, wird die E-Mail NICHT in Appwrite protokolliert.
 *                        Verwenden für Testmodus, um Doppelversand-Erkennung nicht zu verfälschen.
 */
export const sendeEmailMitPdf = async (params: {
  empfaenger: string;
  absender: string;
  betreff: string;
  htmlBody: string;
  pdfBase64: string;
  pdfDateiname: string;
  projektId: string;
  dokumentTyp: ProtokollDokumentTyp;
  dokumentNummer: string;
  pdfVersion?: number;
  testModus?: boolean;
  skipProtokoll?: boolean;
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
    skipProtokoll,
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

  // Protokollieren (außer wenn skipProtokoll=true, z.B. im Testmodus)
  if (!skipProtokoll) {
    try {
      // Im Testmodus den TATSÄCHLICHEN Empfänger (Test-Adresse) protokollieren —
      // so bleibt das Protokoll wahr und Testversände sind als solche erkennbar
      // (siehe istTestversand / Doppelversand-Warnung im EmailFormular).
      const protokollEmpfaenger =
        (testModus || sendResult.testModeActive) && sendResult.success
          ? sendResult.actualRecipient || TEST_EMAIL_ADDRESS
          : empfaenger;
      await protokolliereEmail({
        projektId,
        dokumentTyp,
        dokumentNummer,
        empfaenger: protokollEmpfaenger,
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
      margin-top: 15px;
      padding-top: 15px;
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
