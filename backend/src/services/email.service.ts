/**
 * Email Service
 *
 * IMAP für Empfang, SMTP für Versand.
 */

import Imap from 'imap';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import nodemailer from 'nodemailer';
import { Readable } from 'stream';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';

/**
 * Extrahiert Text aus AddressObject oder AddressObject[]
 */
function getAddressText(address: AddressObject | AddressObject[] | undefined): string {
  if (!address) return '';
  if (Array.isArray(address)) {
    return address.map(a => a.text).join(', ');
  }
  return address.text || '';
}

// Types
interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: Date;
  body: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

interface ProcessInquiriesResult {
  processed: number;
  errors: number;
  details: string[];
}

// SMTP Transporter
const smtpTransporter = config.EMAIL_USER
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASSWORD,
      },
    })
  : null;

/**
 * Erstellt IMAP-Verbindung
 */
function createImapConnection(): Imap {
  return new Imap({
    user: config.EMAIL_USER,
    password: config.EMAIL_PASSWORD,
    host: config.EMAIL_HOST,
    port: config.EMAIL_PORT,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });
}

/**
 * Holt E-Mails aus dem Posteingang
 */
async function fetchInbox(folder: string = 'INBOX', limit: number = 50): Promise<Email[]> {
  if (!config.EMAIL_USER) {
    logger.warn('Email nicht konfiguriert');
    return [];
  }

  return new Promise((resolve, reject) => {
    const imap = createImapConnection();
    const emails: Email[] = [];

    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        const totalMessages = box.messages.total;
        if (totalMessages === 0) {
          imap.end();
          resolve([]);
          return;
        }

        // Letzte N E-Mails holen
        const start = Math.max(1, totalMessages - limit + 1);
        const fetch = imap.seq.fetch(`${start}:${totalMessages}`, {
          bodies: '',
          struct: true,
        });

        fetch.on('message', (msg, seqno) => {
          msg.on('body', (stream) => {
            // Stream als Readable casten für mailparser
            simpleParser(stream as unknown as Readable)
              .then((parsed: ParsedMail) => {
                emails.push({
                  id: String(seqno),
                  from: parsed.from?.text || '',
                  to: getAddressText(parsed.to),
                  subject: parsed.subject || '',
                  date: parsed.date || new Date(),
                  body: parsed.text || '',
                  html: parsed.html || undefined,
                  attachments: parsed.attachments?.map((a) => ({
                    filename: a.filename || 'unknown',
                    contentType: a.contentType,
                    size: a.size,
                  })),
                });
              })
              .catch((parseErr: Error) => {
                logger.error('Parse Fehler: %s', parseErr.message);
              });
          });
        });

        fetch.once('end', () => {
          imap.end();
          // Sortiere nach Datum (neueste zuerst)
          emails.sort((a, b) => b.date.getTime() - a.date.getTime());
          resolve(emails);
        });

        fetch.once('error', (fetchErr) => {
          imap.end();
          reject(fetchErr);
        });
      });
    });

    imap.once('error', (imapErr) => {
      reject(imapErr);
    });

    imap.connect();
  });
}

/**
 * Sendet eine E-Mail
 */
async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!smtpTransporter) {
    return { success: false, error: 'SMTP nicht konfiguriert' };
  }

  try {
    const info = await smtpTransporter.sendMail({
      from: config.EMAIL_USER,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    });

    logger.info(`E-Mail gesendet: ${info.messageId}`);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('E-Mail senden fehlgeschlagen: %s', error instanceof Error ? error.message : String(error));
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
    };
  }
}

/**
 * Verarbeitet neue Anfragen (für Cron Jobs)
 */
async function processNewInquiries(): Promise<ProcessInquiriesResult> {
  const result: ProcessInquiriesResult = {
    processed: 0,
    errors: 0,
    details: [],
  };

  try {
    // Hier kann die Logik zum Verarbeiten von Anfragen implementiert werden
    // z.B. E-Mails aus einem bestimmten Ordner lesen und in die Datenbank speichern

    logger.info('Anfragen-Verarbeitung gestartet');

    // Beispiel: Neue E-Mails aus INBOX holen
    const emails = await fetchInbox('INBOX', 10);

    for (const email of emails) {
      try {
        // Hier: E-Mail verarbeiten, in DB speichern, etc.
        result.details.push(`Verarbeitet: ${email.subject}`);
        result.processed++;
      } catch (error) {
        result.errors++;
        result.details.push(`Fehler bei: ${email.subject}`);
      }
    }

    logger.info(`Anfragen-Verarbeitung abgeschlossen: ${result.processed} verarbeitet, ${result.errors} Fehler`);
  } catch (error) {
    logger.error('Anfragen-Verarbeitung fehlgeschlagen: %s', error instanceof Error ? error.message : String(error));
    result.errors++;
    result.details.push(error instanceof Error ? error.message : 'Unbekannter Fehler');
  }

  return result;
}

export const emailService = {
  fetchInbox,
  sendEmail,
  processNewInquiries,
};

export default emailService;
