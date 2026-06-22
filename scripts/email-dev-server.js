/**
 * Lokaler Dev-Server für Email Dashboard
 * Startet einen Express-Server der IMAP-Anfragen verarbeitet
 */

import express from 'express';
import cors from 'cors';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import dotenv from 'dotenv';

// .env laden
dotenv.config();

const app = express();
const PORT = 8888;

// CORS für Vite Dev Server
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
}));

app.use(express.json({ limit: '50mb' }));

// Konfiguration aus .env
const IMAP_HOST = process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net';
const IMAP_PORT = parseInt(process.env.EMAIL_IMAP_PORT || '993');

// Email Accounts parsen
let EMAIL_ACCOUNTS = [];
try {
  EMAIL_ACCOUNTS = JSON.parse(process.env.EMAIL_ACCOUNTS || '[]');
} catch (e) {
  console.error('Fehler beim Parsen von EMAIL_ACCOUNTS:', e);
}

// Mögliche Namen für den "Gesendet"-Ordner (identisch zur Netlify-Funktion)
const SENT_FOLDER_NAMES = [
  'INBOX.Sent', 'Sent', 'INBOX.Gesendet', 'Gesendet',
  'Sent Items', 'Sent Messages', 'Gesendete Objekte', 'SENT',
];

/**
 * Kopiert eine bereits versendete E-Mail (raw MIME) in den "Gesendet"-Ordner via IMAP.
 * Best-effort — Fehler werden zurückgegeben, brechen den Versand nicht ab.
 */
function copyToSentFolder(account, rawEmail) {
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
        try { imap.end(); } catch { /* ignore */ }
      }
    };

    imap.once('error', (err) => {
      cleanup();
      resolve({ success: false, error: err.message });
    });

    imap.once('ready', () => {
      const tryFolders = [...SENT_FOLDER_NAMES];
      const tried = [];

      const appendToFolder = (folderName) => {
        imap.append(rawEmail, { mailbox: folderName, flags: ['\\Seen'] }, (appendErr) => {
          if (appendErr) {
            cleanup();
            resolve({ success: false, error: appendErr.message });
          } else {
            cleanup();
            resolve({ success: true, folder: folderName });
          }
        });
      };

      const tryNextFolder = () => {
        if (tryFolders.length === 0) {
          imap.addBox('INBOX.Sent', (addErr) => {
            if (addErr) {
              cleanup();
              resolve({ success: false, error: `No Sent folder found (tried: ${tried.join(', ')})` });
            } else {
              appendToFolder('INBOX.Sent');
            }
          });
          return;
        }
        const folderName = tryFolders.shift();
        tried.push(folderName);
        imap.openBox(folderName, false, (err) => {
          if (err) tryNextFolder();
          else appendToFolder(folderName);
        });
      };

      tryNextFolder();
    });

    imap.connect();
    setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve({ success: false, error: 'IMAP timeout' });
      }
    }, 15000);
  });
}

// Email parsen
const parseEmail = (mail, uid, flags) => {
  const fromAddr = mail.from?.value?.[0] || { name: '', address: '' };
  const toAddrs = mail.to?.value || [];

  return {
    id: `${uid}`,
    uid,
    subject: mail.subject || '(Kein Betreff)',
    from: {
      name: fromAddr.name || fromAddr.address || 'Unbekannt',
      address: fromAddr.address || '',
    },
    to: toAddrs.map((addr) => ({
      name: addr.name || addr.address || '',
      address: addr.address || '',
    })),
    date: mail.date?.toISOString() || new Date().toISOString(),
    bodyPreview: (mail.text || '').substring(0, 200).replace(/\s+/g, ' ').trim(),
    body: mail.text || undefined,
    bodyHtml: mail.html || undefined,
    isRead: flags.includes('\\Seen'),
    hasAttachments: (mail.attachments?.length || 0) > 0,
    attachments: mail.attachments?.map((att) => ({
      filename: att.filename || 'attachment',
      size: att.size || 0,
      contentType: att.contentType || 'application/octet-stream',
    })),
  };
};

// IMAP Verbindung herstellen und Emails abrufen
const getEmails = (account, folder, limit) => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    const emails = [];

    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        if (!box.messages.total) {
          imap.end();
          return resolve([]);
        }

        const start = Math.max(1, box.messages.total - limit + 1);
        const end = box.messages.total;

        const f = imap.seq.fetch(`${start}:${end}`, {
          bodies: '',
          struct: true,
        });

        f.on('message', (msg, seqno) => {
          let uid = 0;
          let flags = [];

          msg.on('body', (stream) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.once('end', () => {
              const buffer = Buffer.concat(chunks);
              simpleParser(buffer)
                .then((mail) => {
                  emails.push(parseEmail(mail, uid || seqno, flags));
                })
                .catch(console.error);
            });
          });

          msg.once('attributes', (attrs) => {
            uid = attrs.uid;
            flags = attrs.flags || [];
          });
        });

        f.once('error', (err) => {
          imap.end();
          reject(err);
        });

        f.once('end', () => {
          imap.end();
          setTimeout(() => {
            emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            resolve(emails);
          }, 500);
        });
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
};

// Einzelne Email abrufen
const getEmailByUid = (account, folder, uid) => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox(folder, true, (err) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const f = imap.fetch(uid, { bodies: '', struct: true });
        let email = null;
        let flags = [];

        f.on('message', (msg) => {
          msg.on('body', (stream) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.once('end', () => {
              const buffer = Buffer.concat(chunks);
              simpleParser(buffer)
                .then((mail) => {
                  email = parseEmail(mail, uid, flags);
                })
                .catch(console.error);
            });
          });

          msg.once('attributes', (attrs) => {
            flags = attrs.flags || [];
          });
        });

        f.once('error', (err) => {
          imap.end();
          reject(err);
        });

        f.once('end', () => {
          imap.end();
          setTimeout(() => resolve(email), 200);
        });
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
};

// Ordner abrufen
const getFolders = (account) => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.getBoxes((err, boxes) => {
        imap.end();
        if (err) return reject(err);

        const folders = [];
        const processBoxes = (boxList, prefix = '') => {
          for (const [name, box] of Object.entries(boxList)) {
            const path = prefix ? `${prefix}${box.delimiter}${name}` : name;
            folders.push({ name, path });
            if (box.children) {
              processBoxes(box.children, path);
            }
          }
        };
        processBoxes(boxes);
        resolve(folders);
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
};

// Ungelesene Emails zählen
const getUnreadCount = (account, folder) => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        imap.end();
        if (err) return reject(err);
        resolve(box.messages.unseen || 0);
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
};

// API Endpoint
app.get('/.netlify/functions/email-api', async (req, res) => {
  const { action, account: accountEmail, folder = 'INBOX', limit = '50', uid } = req.query;

  try {
    // Accounts Liste
    if (action === 'accounts') {
      return res.json({
        accounts: EMAIL_ACCOUNTS.map((a) => ({ email: a.email, name: a.name })),
      });
    }

    // Account finden
    const account = accountEmail
      ? EMAIL_ACCOUNTS.find((a) => a.email === accountEmail)
      : EMAIL_ACCOUNTS[0];

    if (!account) {
      return res.status(400).json({ error: 'Account not found' });
    }

    switch (action) {
      case 'list': {
        const emails = await getEmails(account, folder, parseInt(limit));
        return res.json({ emails, account: account.email, folder });
      }

      case 'get': {
        if (!uid) {
          return res.status(400).json({ error: 'UID required' });
        }
        const email = await getEmailByUid(account, folder, parseInt(uid));
        return res.json({ email });
      }

      case 'folders': {
        const folders = await getFolders(account);
        return res.json({ folders });
      }

      case 'unread': {
        const count = await getUnreadCount(account, folder);
        return res.json({ unread: count, folder });
      }

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Email API Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// SMTP-Konfiguration
const SMTP_HOST = process.env.EMAIL_SMTP_HOST || 'web3.ipp-webspace.net';
const SMTP_PORT = parseInt(process.env.EMAIL_SMTP_PORT || '465');
const TEST_EMAIL_ADDRESS = 'jtatwcook@gmail.com';

// Hilfsfunktion: HTML zu Plain-Text
const stripHtml = (html) => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// SMTP Email-Versand Endpoint
app.post('/.netlify/functions/email-send', async (req, res) => {
  try {
    const { to, from, replyTo, subject, htmlBody, textBody, pdfBase64, pdfFilename, testMode } = req.body;

    // Validierung
    if (!to || !from || !subject || !htmlBody) {
      return res.status(400).json({
        error: 'Missing required fields: to, from, subject, htmlBody',
      });
    }

    // Finde das E-Mail-Konto für den Absender
    const senderAccount = EMAIL_ACCOUNTS.find((a) => a.email === from);
    if (!senderAccount) {
      return res.status(400).json({
        error: `Sender account not found: ${from}`,
        availableAccounts: EMAIL_ACCOUNTS.map((a) => a.email),
      });
    }

    // Testmodus - echten Empfänger ersetzen
    const actualRecipient = testMode ? TEST_EMAIL_ADDRESS : to;
    const testModeActive = testMode === true;

    // Betreff im Testmodus anpassen
    const actualSubject = testModeActive
      ? `[TEST - Original an: ${to}] ${subject}`
      : subject;

    // Nodemailer Transporter erstellen
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true,
      auth: {
        user: senderAccount.email,
        pass: senderAccount.password,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // E-Mail-Optionen
    const mailOptions = {
      from: `"${senderAccount.name}" <${senderAccount.email}>`,
      to: actualRecipient,
      replyTo: replyTo || senderAccount.email,
      subject: actualSubject,
      html: htmlBody,
      text: textBody || stripHtml(htmlBody),
    };

    // PDF-Anhang hinzufügen falls vorhanden
    if (pdfBase64 && pdfFilename) {
      const maxSizeBytes = 10 * 1024 * 1024;
      const base64SizeBytes = (pdfBase64.length * 3) / 4;

      if (base64SizeBytes > maxSizeBytes) {
        return res.status(400).json({
          error: 'PDF too large. Maximum size is 10MB.',
          actualSize: `${(base64SizeBytes / 1024 / 1024).toFixed(2)}MB`,
        });
      }

      mailOptions.attachments = [
        {
          filename: pdfFilename,
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ];
    }

    // E-Mail senden
    console.log(`📤 Sending email from ${senderAccount.email} to ${actualRecipient}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully. MessageId: ${info.messageId}`);

    // In den "Gesendet"-Ordner kopieren (wie bei Universal/Produktion) — best-effort.
    let sentFolderCopy = false;
    let sentFolder;
    try {
      const rawEmail = await new Promise((resolve, reject) => {
        new MailComposer(mailOptions).compile().build((err, message) => {
          if (err) reject(err);
          else resolve(message);
        });
      });
      const sentResult = await copyToSentFolder(senderAccount, rawEmail);
      sentFolderCopy = sentResult.success;
      sentFolder = sentResult.folder;
      if (sentResult.success) {
        console.log(`📁 Email in Gesendet-Ordner kopiert: ${sentResult.folder}`);
      } else {
        console.warn(`⚠️  Kopie in Gesendet-Ordner fehlgeschlagen: ${sentResult.error}`);
      }
    } catch (imapError) {
      console.warn('⚠️  IMAP-Kopie in Gesendet-Ordner fehlgeschlagen:', imapError.message);
    }

    return res.json({
      success: true,
      messageId: info.messageId,
      testModeActive,
      actualRecipient,
      originalRecipient: to,
      sentFolderCopy,
      sentFolder,
    });
  } catch (error) {
    console.error('❌ Email send error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send email',
      message: error.message,
      code: error.code,
    });
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`\n📧 Email Dev Server läuft auf http://localhost:${PORT}`);
  console.log(`   ${EMAIL_ACCOUNTS.length} Email-Konten konfiguriert`);
  console.log(`   SMTP: ${SMTP_HOST}:${SMTP_PORT}\n`);

  if (EMAIL_ACCOUNTS.length === 0) {
    console.log('⚠️  Keine Email-Konten in .env gefunden!');
    console.log('   Stellen Sie sicher, dass EMAIL_ACCOUNTS in .env konfiguriert ist.\n');
  }
});
