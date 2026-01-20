import { Handler, HandlerEvent } from '@netlify/functions';
import nodemailer from 'nodemailer';

// Email Account Interface
interface EmailAccount {
  email: string;
  password: string;
  name: string;
}

// Request Body Interface
interface EmailSendRequest {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  pdfBase64?: string;
  pdfFilename?: string;
  testMode?: boolean;
}

// Test-E-Mail-Adresse
const TEST_EMAIL_ADDRESS = 'jtatwcook@gmail.com';

// SMTP-Konfiguration
const SMTP_HOST = process.env.EMAIL_SMTP_HOST || 'web3.ipp-webspace.net';
const SMTP_PORT = parseInt(process.env.EMAIL_SMTP_PORT || '465');

// Main handler
const handler: Handler = async (event: HandlerEvent) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Nur POST erlauben
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  try {
    // Parse accounts from env
    const accountsJson = process.env.EMAIL_ACCOUNTS;
    if (!accountsJson) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Email accounts not configured' }),
      };
    }

    const accounts: EmailAccount[] = JSON.parse(accountsJson);

    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body required' }),
      };
    }

    const request: EmailSendRequest = JSON.parse(event.body);

    // Validierung
    if (!request.to || !request.from || !request.subject || !request.htmlBody) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields: to, from, subject, htmlBody',
        }),
      };
    }

    // Finde das E-Mail-Konto für den Absender
    const senderAccount = accounts.find((a) => a.email === request.from);
    if (!senderAccount) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Sender account not found: ${request.from}`,
          availableAccounts: accounts.map((a) => a.email),
        }),
      };
    }

    // Testmodus - echten Empfänger ersetzen
    const actualRecipient = request.testMode ? TEST_EMAIL_ADDRESS : request.to;
    const testModeActive = request.testMode === true;

    // Betreff im Testmodus anpassen
    const actualSubject = testModeActive
      ? `[TEST - Original an: ${request.to}] ${request.subject}`
      : request.subject;

    // Nodemailer Transporter erstellen
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true, // SSL
      auth: {
        user: senderAccount.email,
        pass: senderAccount.password,
      },
      tls: {
        rejectUnauthorized: false, // Für selbst-signierte Zertifikate
      },
    });

    // E-Mail-Optionen
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${senderAccount.name}" <${senderAccount.email}>`,
      to: actualRecipient,
      replyTo: request.replyTo || senderAccount.email,
      subject: actualSubject,
      html: request.htmlBody,
      text: request.textBody || stripHtml(request.htmlBody),
    };

    // PDF-Anhang hinzufügen falls vorhanden
    if (request.pdfBase64 && request.pdfFilename) {
      // Validiere Base64-String-Größe (max 10MB)
      const maxSizeBytes = 10 * 1024 * 1024; // 10MB
      const base64SizeBytes = (request.pdfBase64.length * 3) / 4;

      if (base64SizeBytes > maxSizeBytes) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'PDF too large. Maximum size is 10MB.',
            actualSize: `${(base64SizeBytes / 1024 / 1024).toFixed(2)}MB`,
          }),
        };
      }

      mailOptions.attachments = [
        {
          filename: request.pdfFilename,
          content: Buffer.from(request.pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ];
    }

    // E-Mail senden
    console.log(`Sending email from ${senderAccount.email} to ${actualRecipient}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully. MessageId: ${info.messageId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        messageId: info.messageId,
        testModeActive,
        actualRecipient,
        originalRecipient: request.to,
      }),
    };
  } catch (error) {
    console.error('Email send error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error && 'code' in error
      ? (error as Error & { code: string }).code
      : undefined;

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to send email',
        message: errorMessage,
        code: errorDetails,
      }),
    };
  }
};

// Hilfsfunktion: HTML zu Plain-Text konvertieren
function stripHtml(html: string): string {
  return html
    // Ersetze <br> und </p> mit Zeilenumbrüchen
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    // Entferne alle HTML-Tags
    .replace(/<[^>]+>/g, '')
    // Dekodiere HTML-Entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalisiere Whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export { handler };
