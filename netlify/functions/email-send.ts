import { Handler, HandlerEvent } from '@netlify/functions';
import nodemailer from 'nodemailer';
import Imap from 'imap';

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

// IMAP-Konfiguration (gleicher Server)
const IMAP_HOST = process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net';
const IMAP_PORT = parseInt(process.env.EMAIL_IMAP_PORT || '993');

// Mögliche Namen für den "Gesendet"-Ordner (je nach Mailserver-Konfiguration)
const SENT_FOLDER_NAMES = ['Sent', 'INBOX.Sent', 'Gesendet', 'Sent Items', 'Sent Messages'];

/**
 * Kopiert eine E-Mail in den "Gesendet"-Ordner via IMAP
 */
async function copyToSentFolder(
  account: EmailAccount,
  rawEmail: string
): Promise<{ success: boolean; folder?: string; error?: string }> {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        try {
          imap.end();
        } catch {
          // Ignore cleanup errors
        }
      }
    };

    imap.once('error', (err: Error) => {
      console.error('IMAP error:', err.message);
      cleanup();
      resolve({ success: false, error: err.message });
    });

    imap.once('ready', () => {
      // Versuche verschiedene Ordnernamen für "Gesendet"
      const tryFolders = [...SENT_FOLDER_NAMES];

      const tryNextFolder = () => {
        if (tryFolders.length === 0) {
          console.warn('No Sent folder found, trying to create INBOX.Sent');
          // Versuche INBOX.Sent zu erstellen
          imap.addBox('INBOX.Sent', (addErr) => {
            if (addErr) {
              console.error('Could not create Sent folder:', addErr.message);
              cleanup();
              resolve({ success: false, error: 'No Sent folder found and could not create one' });
            } else {
              appendToFolder('INBOX.Sent');
            }
          });
          return;
        }

        const folderName = tryFolders.shift()!;
        imap.openBox(folderName, false, (err) => {
          if (err) {
            // Ordner existiert nicht, nächsten versuchen
            tryNextFolder();
          } else {
            appendToFolder(folderName);
          }
        });
      };

      const appendToFolder = (folderName: string) => {
        // E-Mail mit \Seen Flag in den Ordner appenden
        imap.append(rawEmail, { mailbox: folderName, flags: ['\\Seen'] }, (appendErr) => {
          if (appendErr) {
            console.error(`Failed to append to ${folderName}:`, appendErr.message);
            cleanup();
            resolve({ success: false, error: appendErr.message });
          } else {
            console.log(`Email copied to ${folderName} folder successfully`);
            cleanup();
            resolve({ success: true, folder: folderName });
          }
        });
      };

      tryNextFolder();
    });

    imap.connect();

    // Timeout nach 15 Sekunden
    setTimeout(() => {
      if (!resolved) {
        console.error('IMAP operation timed out');
        cleanup();
        resolve({ success: false, error: 'IMAP timeout' });
      }
    }, 15000);
  });
}

/**
 * Erstellt eine RFC 822 formatierte E-Mail für IMAP
 */
function buildRawEmail(options: {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  date: Date;
  messageId: string;
  attachmentFilename?: string;
  attachmentBase64?: string;
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const hasAttachment = options.attachmentFilename && options.attachmentBase64;

  let email = '';
  email += `From: "${options.fromName}" <${options.from}>\r\n`;
  email += `To: ${options.to}\r\n`;
  email += `Subject: ${options.subject}\r\n`;
  email += `Date: ${options.date.toUTCString()}\r\n`;
  email += `Message-ID: ${options.messageId}\r\n`;
  email += `MIME-Version: 1.0\r\n`;

  if (hasAttachment) {
    email += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
    email += `\r\n`;
    email += `--${boundary}\r\n`;
    email += `Content-Type: multipart/alternative; boundary="${boundary}_alt"\r\n`;
    email += `\r\n`;

    // Text part
    email += `--${boundary}_alt\r\n`;
    email += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    email += `Content-Transfer-Encoding: quoted-printable\r\n`;
    email += `\r\n`;
    email += `${options.text}\r\n`;
    email += `\r\n`;

    // HTML part
    email += `--${boundary}_alt\r\n`;
    email += `Content-Type: text/html; charset="UTF-8"\r\n`;
    email += `Content-Transfer-Encoding: quoted-printable\r\n`;
    email += `\r\n`;
    email += `${options.html}\r\n`;
    email += `\r\n`;
    email += `--${boundary}_alt--\r\n`;

    // PDF attachment
    email += `\r\n--${boundary}\r\n`;
    email += `Content-Type: application/pdf; name="${options.attachmentFilename}"\r\n`;
    email += `Content-Disposition: attachment; filename="${options.attachmentFilename}"\r\n`;
    email += `Content-Transfer-Encoding: base64\r\n`;
    email += `\r\n`;
    // Split base64 into 76-char lines
    const base64Lines = options.attachmentBase64!.match(/.{1,76}/g) || [];
    email += base64Lines.join('\r\n');
    email += `\r\n`;
    email += `--${boundary}--\r\n`;
  } else {
    email += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
    email += `\r\n`;

    // Text part
    email += `--${boundary}\r\n`;
    email += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    email += `Content-Transfer-Encoding: quoted-printable\r\n`;
    email += `\r\n`;
    email += `${options.text}\r\n`;
    email += `\r\n`;

    // HTML part
    email += `--${boundary}\r\n`;
    email += `Content-Type: text/html; charset="UTF-8"\r\n`;
    email += `Content-Transfer-Encoding: quoted-printable\r\n`;
    email += `\r\n`;
    email += `${options.html}\r\n`;
    email += `\r\n`;
    email += `--${boundary}--\r\n`;
  }

  return email;
}

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

    // E-Mail in den "Gesendet"-Ordner kopieren (via IMAP)
    let sentFolderResult: { success: boolean; folder?: string; error?: string } = { success: false };
    try {
      const textContent = request.textBody || stripHtml(request.htmlBody);
      const rawEmail = buildRawEmail({
        from: senderAccount.email,
        fromName: senderAccount.name,
        to: actualRecipient,
        subject: actualSubject,
        html: request.htmlBody,
        text: textContent,
        date: new Date(),
        messageId: info.messageId || `<${Date.now()}@tennismehl.com>`,
        attachmentFilename: request.pdfFilename,
        attachmentBase64: request.pdfBase64,
      });

      sentFolderResult = await copyToSentFolder(senderAccount, rawEmail);
      if (sentFolderResult.success) {
        console.log(`Email copied to Sent folder: ${sentFolderResult.folder}`);
      } else {
        console.warn(`Could not copy to Sent folder: ${sentFolderResult.error}`);
      }
    } catch (imapError) {
      console.warn('IMAP copy to Sent folder failed:', imapError);
      // Nicht als Fehler behandeln - E-Mail wurde trotzdem gesendet
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        messageId: info.messageId,
        testModeActive,
        actualRecipient,
        originalRecipient: request.to,
        sentFolderCopy: sentFolderResult.success,
        sentFolder: sentFolderResult.folder,
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
