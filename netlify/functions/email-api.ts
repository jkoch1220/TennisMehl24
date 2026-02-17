import { Handler, HandlerEvent } from '@netlify/functions';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';

// Email Account Interface
interface EmailAccount {
  email: string;
  password: string;
  name: string;
}

// Email Response Interface
interface EmailResponse {
  id: string;
  uid: number;
  subject: string;
  from: {
    name: string;
    address: string;
  };
  to: Array<{ name: string; address: string }>;
  date: string;
  bodyPreview: string;
  body?: string;
  bodyHtml?: string;
  isRead: boolean;
  hasAttachments: boolean;
  attachments?: Array<{
    filename: string;
    size: number;
    contentType: string;
  }>;
}

// Parse IMAP response to our format
const parseEmail = (mail: ParsedMail, uid: number, flags: string[]): EmailResponse => {
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

// Get emails from IMAP server
const getEmails = (
  account: EmailAccount,
  folder: string,
  limit: number
): Promise<EmailResponse[]> => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net',
      port: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    const emails: EmailResponse[] = [];

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

        // Get last N messages
        const start = Math.max(1, box.messages.total - limit + 1);
        const end = box.messages.total;

        const f = imap.seq.fetch(`${start}:${end}`, {
          bodies: '',
          struct: true,
        });

        f.on('message', (msg, seqno) => {
          let uid = 0;
          let flags: string[] = [];

          msg.on('body', (stream) => {
            const chunks: Buffer[] = [];
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
          // Sort by date descending
          setTimeout(() => {
            emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            resolve(emails);
          }, 500);
        });
      });
    });

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
};

// Get single email by UID
const getEmailByUid = (
  account: EmailAccount,
  folder: string,
  uid: number
): Promise<EmailResponse | null> => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net',
      port: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox(folder, true, (err) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const f = imap.fetch(uid, {
          bodies: '',
          struct: true,
        });

        let email: EmailResponse | null = null;
        let flags: string[] = [];

        f.on('message', (msg) => {
          msg.on('body', (stream) => {
            const chunks: Buffer[] = [];
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

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
};

// Get folder list
const getFolders = (account: EmailAccount): Promise<Array<{ name: string; path: string }>> => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net',
      port: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.getBoxes((err, boxes) => {
        imap.end();
        if (err) return reject(err);

        const folders: Array<{ name: string; path: string }> = [];
        const processBoxes = (boxList: Imap.MailBoxes, prefix = '') => {
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

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
};

// Get unread count
const getUnreadCount = (account: EmailAccount, folder: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net',
      port: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
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

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
};

// Move email to another folder (or delete by moving to Trash)
const moveEmail = (
  account: EmailAccount,
  sourceFolder: string,
  uid: number,
  targetFolder: string
): Promise<{ success: boolean; message: string }> => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net',
      port: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      // Erst Zielordner erstellen falls nicht vorhanden
      imap.addBox(targetFolder, (addErr) => {
        // Fehler ignorieren wenn Ordner schon existiert
        if (addErr && !addErr.message.includes('ALREADYEXISTS') && !addErr.message.includes('already exists')) {
          console.log('Ordner existiert möglicherweise schon:', addErr.message);
        }

        // Source-Folder öffnen (nicht readonly!)
        imap.openBox(sourceFolder, false, (openErr) => {
          if (openErr) {
            imap.end();
            return reject(openErr);
          }

          // Email in Zielordner kopieren
          imap.copy(uid, targetFolder, (copyErr) => {
            if (copyErr) {
              imap.end();
              return reject(copyErr);
            }

            // Original als gelöscht markieren
            imap.addFlags(uid, ['\\Deleted'], (flagErr) => {
              if (flagErr) {
                imap.end();
                return reject(flagErr);
              }

              // Expunge um gelöschte Emails endgültig zu entfernen
              imap.expunge((expungeErr) => {
                imap.end();
                if (expungeErr) {
                  // Expunge-Fehler sind nicht kritisch
                  console.warn('Expunge warning:', expungeErr.message);
                }
                resolve({ success: true, message: `Email moved to ${targetFolder}` });
              });
            });
          });
        });
      });
    });

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
};

// Search emails by email address (FROM or TO)
const searchEmailsByAddress = (
  account: EmailAccount,
  emailAddress: string,
  folders: string[] = ['INBOX', 'Sent']
): Promise<EmailResponse[]> => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net',
      port: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    const allEmails: EmailResponse[] = [];
    let currentFolderIndex = 0;

    const processFolder = () => {
      if (currentFolderIndex >= folders.length) {
        imap.end();
        // Sort by date descending and remove duplicates
        allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const seen = new Set<string>();
        const unique = allEmails.filter((email) => {
          const key = `${email.date}-${email.subject}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        resolve(unique);
        return;
      }

      const folder = folders[currentFolderIndex];
      currentFolderIndex++;

      imap.openBox(folder, true, (err) => {
        if (err) {
          // Folder might not exist, skip to next
          processFolder();
          return;
        }

        // Search for emails FROM or TO the address
        // IMAP search: OR FROM <address> TO <address>
        imap.search([['OR', ['FROM', emailAddress], ['TO', emailAddress]]], (searchErr, uids) => {
          if (searchErr || !uids || uids.length === 0) {
            processFolder();
            return;
          }

          // Limit to last 50 results per folder
          const limitedUids = uids.slice(-50);

          const f = imap.fetch(limitedUids, {
            bodies: '',
            struct: true,
          });

          f.on('message', (msg, seqno) => {
            let uid = 0;
            let flags: string[] = [];

            msg.on('body', (stream) => {
              const chunks: Buffer[] = [];
              stream.on('data', (chunk) => chunks.push(chunk));
              stream.once('end', () => {
                const buffer = Buffer.concat(chunks);
                simpleParser(buffer)
                  .then((mail) => {
                    allEmails.push(parseEmail(mail, uid || seqno, flags));
                  })
                  .catch(console.error);
              });
            });

            msg.once('attributes', (attrs) => {
              uid = attrs.uid;
              flags = attrs.flags || [];
            });
          });

          f.once('error', () => {
            processFolder();
          });

          f.once('end', () => {
            // Small delay to ensure all emails are parsed
            setTimeout(() => processFolder(), 200);
          });
        });
      });
    };

    imap.once('ready', () => {
      processFolder();
    });

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
};

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

    // Parse request
    const params = event.queryStringParameters || {};
    const action = params.action || 'list';
    const accountEmail = params.account;
    const folder = params.folder || 'INBOX';
    const limit = parseInt(params.limit || '50');
    const uid = params.uid ? parseInt(params.uid) : undefined;
    const searchEmail = params.email; // For search action

    // Get accounts list
    if (action === 'accounts') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          accounts: accounts.map((a) => ({ email: a.email, name: a.name })),
        }),
      };
    }

    // Find account
    const account = accountEmail
      ? accounts.find((a) => a.email === accountEmail)
      : accounts[0];

    if (!account) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Account not found' }),
      };
    }

    // Handle actions
    switch (action) {
      case 'list': {
        const emails = await getEmails(account, folder, limit);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ emails, account: account.email, folder }),
        };
      }

      case 'get': {
        if (!uid) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'UID required' }),
          };
        }
        const email = await getEmailByUid(account, folder, uid);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ email }),
        };
      }

      case 'folders': {
        const folders = await getFolders(account);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ folders }),
        };
      }

      case 'unread': {
        const count = await getUnreadCount(account, folder);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ unread: count, folder }),
        };
      }

      case 'move': {
        if (!uid) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'UID required' }),
          };
        }
        const targetFolder = params.target || 'INBOX.Verarbeitet';
        const result = await moveEmail(account, folder, uid, targetFolder);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result),
        };
      }

      case 'search': {
        if (!searchEmail) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Email address required for search' }),
          };
        }
        // Search across all accounts if no specific account given
        const accountsToSearch = accountEmail ? [account] : accounts;
        const allResults: EmailResponse[] = [];

        for (const acc of accountsToSearch) {
          try {
            const results = await searchEmailsByAddress(acc, searchEmail, ['INBOX', 'Sent', 'INBOX.Sent']);
            allResults.push(...results);
          } catch (err) {
            console.error(`Search failed for ${acc.email}:`, err);
          }
        }

        // Sort all results by date and remove duplicates
        allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const seen = new Set<string>();
        const uniqueResults = allResults.filter((email) => {
          const key = `${email.date}-${email.subject}-${email.from.address}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            emails: uniqueResults,
            searchedEmail: searchEmail,
            accountsSearched: accountsToSearch.map(a => a.email)
          }),
        };
      }

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Unknown action' }),
        };
    }
  } catch (error) {
    console.error('Email API Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

export { handler };
