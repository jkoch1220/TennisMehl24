import { Handler, HandlerEvent } from '@netlify/functions';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { Client, Databases, ID, Query } from 'node-appwrite';

// Interfaces
interface EmailAccount {
  email: string;
  password: string;
  name: string;
  imapHost?: string;
  imapPort?: number;
}

interface EmailData {
  uid: number;
  subject: string;
  fromName: string;
  fromAddress: string;
  date: string;
  body: string;
  bodyHtml?: string;
}

interface ExtrahierteDaten {
  kundenname?: string;
  vereinsname?: string;  // Wichtig: Vereinsname hat Priorität über Vorname/Nachname
  vorname?: string;
  nachname?: string;
  ansprechpartner?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  telefon?: string;
  email?: string;
  // Einzelne Tonnen-Felder für präzise Extraktion
  tonnenLose02?: number;
  tonnenGesackt02?: number;
  tonnenLose03?: number;
  tonnenGesackt03?: number;
  menge?: number;  // Gesamtmenge (Summe aller Tonnen)
  artikel?: string;
  koernung?: string;
  lieferart?: string;
  anzahlPlaetze?: number;
  nachricht?: string;
}

// Konstanten
const ANFRAGEN_EMAIL_KONTO = 'anfrage@tennismehl.com';
const WEBFORMULAR_ABSENDER = 'mail@tennismehl.com';
const DATABASE_ID = 'tennismehl24_db';
const ANFRAGEN_COLLECTION_ID = 'anfragen';

// ============================================
// VALIDATOREN - Strikte Prüfung aller Werte
// ============================================

// Alle bekannten Feldnamen aus dem Webformular (um Verwechslung zu vermeiden)
const BEKANNTE_FELDNAMEN = [
  'vorname', 'nachname', 'vereins-name', 'vereinsname', 'verein', 'club', 'klub',
  'straße', 'strasse', 'adresse', 'plz', 'postleitzahl', 'ort', 'stadt', 'gemeinde',
  'e-mail', 'email', 'mail', 'telefon', 'tel', 'telefonnummer', 'handy', 'mobil',
  'angebot', 'anzahl plätze', 'anzahl plaetze', 'plätze', 'plaetze',
  'tonnen 0-2 lose', 'tonnen 0-2 gesackt', 'tonnen 0-3 lose', 'tonnen 0-3 gesackt',
  'nachricht', 'bemerkung', 'anmerkung', 'kommentar', 'hinweis', 'mitteilung',
  'datenschutzerklärung', 'datenschutzerklaerung'
];

/**
 * Prüft ob ein Wert wie ein Feldname aussieht
 */
const siehtAusWieFeldname = (value: string): boolean => {
  if (!value) return false;
  const lower = value.toLowerCase().trim();

  for (const feldname of BEKANNTE_FELDNAMEN) {
    if (lower.startsWith(feldname)) {
      return true;
    }
  }

  if (/^[a-zäöüß\-\s]+\s*\*?\s*:/i.test(lower)) {
    return true;
  }

  return false;
};

/**
 * Sanitize Strings gegen XSS/Injection
 */
const sanitizeString = (value: string): string => {
  if (!value) return '';
  return value
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .substring(0, 500);
};

/**
 * Validiert E-Mail-Adresse
 */
const validateEmail = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();

  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!emailRegex.test(trimmed)) {
    console.log(`⚠️ Ungültige E-Mail: "${value}"`);
    return undefined;
  }

  if (siehtAusWieFeldname(trimmed)) {
    console.log(`⚠️ E-Mail sieht aus wie Feldname: "${value}"`);
    return undefined;
  }

  return trimmed;
};

/**
 * Validiert Telefonnummer
 */
const validateTelefon = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();

  if (siehtAusWieFeldname(trimmed)) {
    console.log(`⚠️ Telefon sieht aus wie Feldname: "${value}"`);
    return undefined;
  }

  // Telefon: nur Zahlen, +, -, Leerzeichen, Klammern, /
  const telefonRegex = /^[\d\s\-+()\/]{5,20}$/;
  if (!telefonRegex.test(trimmed)) {
    console.log(`⚠️ Ungültige Telefonnummer: "${value}"`);
    return undefined;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 5) {
    console.log(`⚠️ Telefonnummer zu kurz: "${value}"`);
    return undefined;
  }

  return trimmed;
};

/**
 * Validiert deutsche PLZ (5 Ziffern)
 */
const validatePLZ = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();

  const plzRegex = /^\d{5}$/;
  if (!plzRegex.test(trimmed)) {
    console.log(`⚠️ Ungültige PLZ: "${value}"`);
    return undefined;
  }

  const plzNum = parseInt(trimmed, 10);
  if (plzNum < 1000 || plzNum > 99999) {
    return undefined;
  }

  return trimmed;
};

/**
 * Validiert Namen (Vorname, Nachname, Vereinsname, Ort, Straße)
 */
const validateName = (value: string | undefined, maxLength: number = 100): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();

  if (siehtAusWieFeldname(trimmed)) {
    console.log(`⚠️ Name sieht aus wie Feldname: "${value}"`);
    return undefined;
  }

  if (trimmed.length < 2 || /^[-_*\s]+$/.test(trimmed)) {
    return undefined;
  }

  if (trimmed.endsWith(':')) {
    console.log(`⚠️ Name endet mit Doppelpunkt: "${value}"`);
    return undefined;
  }

  return sanitizeString(trimmed).substring(0, maxLength);
};

// Parse Email
const parseEmailContent = (mail: ParsedMail, uid: number): EmailData => {
  const fromAddr = mail.from?.value?.[0] || { name: '', address: '' };

  return {
    uid,
    subject: mail.subject || '(Kein Betreff)',
    fromName: fromAddr.name || fromAddr.address || 'Unbekannt',
    fromAddress: fromAddr.address || '',
    date: mail.date?.toISOString() || new Date().toISOString(),
    body: mail.text || '',
    bodyHtml: mail.html || undefined,
  };
};

/**
 * Extrahiert einen Feldwert robust - stoppt vor dem nächsten Feldnamen
 */
const extractFieldRobust = (text: string, fieldPattern: RegExp): string | undefined => {
  const match = text.match(fieldPattern);
  if (!match || !match[1]) return undefined;

  let value = match[1].trim();

  // KRITISCH: Stoppe wenn der Wert einen anderen Feldnamen enthält
  for (const feldname of BEKANNTE_FELDNAMEN) {
    const feldnamePos = value.toLowerCase().indexOf(feldname);
    if (feldnamePos > 0) {
      // Schneide vor dem Feldnamen ab
      value = value.substring(0, feldnamePos).trim();
    }
  }

  // Prüfe ob der Wert selbst wie ein Feldname aussieht
  if (siehtAusWieFeldname(value)) {
    console.log(`⚠️ Wert sieht aus wie Feldname: "${value}" - ABGELEHNT`);
    return undefined;
  }

  return value || undefined;
};

// Webformular-Daten extrahieren
const extrahiereWebformularDaten = (text: string): ExtrahierteDaten => {
  const daten: ExtrahierteDaten = {};

  // WICHTIG: Vereinsname hat Priorität - mit robuster Extraktion
  const vereinsnameRaw = extractFieldRobust(text, /(?:vereins-?name|verein|club|klub)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
  const vereinsname = validateName(vereinsnameRaw, 200);
  if (vereinsname) {
    daten.vereinsname = vereinsname;
    daten.kundenname = vereinsname;
  }

  // Vorname und Nachname separat extrahieren mit Validierung
  const vornameRaw = extractFieldRobust(text, /vorname\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
  const vorname = validateName(vornameRaw, 50);
  if (vorname) {
    daten.vorname = vorname;
  }

  const nachnameRaw = extractFieldRobust(text, /nachname\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
  const nachname = validateName(nachnameRaw, 50);
  if (nachname) {
    daten.nachname = nachname;
  }

  // Ansprechpartner aus Vorname + Nachname zusammensetzen
  if (daten.vorname || daten.nachname) {
    daten.ansprechpartner = `${daten.vorname || ''} ${daten.nachname || ''}`.trim();
  }

  // Falls kein Vereinsname, prüfe Firma/Organisation
  if (!daten.kundenname) {
    const firmaRaw = extractFieldRobust(text, /(?:firma|organisation|unternehmen|betrieb)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
    const firma = validateName(firmaRaw, 200);
    if (firma) {
      daten.kundenname = firma;
    }
  }

  // Fallback: Wenn immer noch kein Kundenname, nimm Ansprechpartner
  if (!daten.kundenname && daten.ansprechpartner) {
    daten.kundenname = daten.ansprechpartner;
  }

  // Straße mit Validierung
  const strasseRaw = extractFieldRobust(text, /(?:straße|strasse|adresse)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
  const strasse = validateName(strasseRaw, 200);
  if (strasse) daten.strasse = strasse;

  // PLZ mit strenger Validierung (muss 5 Ziffern sein)
  const plzMatch = text.match(/(?:plz|postleitzahl)\s*[*:]?\s*[:=]?\s*(\d{5})/i);
  if (plzMatch) {
    const plz = validatePLZ(plzMatch[1]);
    if (plz) daten.plz = plz;
  }

  // Ort mit Validierung
  const ortRaw = extractFieldRobust(text, /(?:ort|stadt|city)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
  const ort = validateName(ortRaw, 100);
  if (ort) daten.ort = ort;

  // Telefon mit strenger Validierung
  const telefonMatch = text.match(/(?:telefon|tel|phone|mobil)\s*[*:]?\s*[:=]?\s*([\d\s\-\/\+()]+)/i);
  if (telefonMatch) {
    const telefon = validateTelefon(telefonMatch[1]);
    if (telefon) daten.telefon = telefon;
  }

  // E-Mail mit strenger Validierung
  const emailMatch = text.match(/(?:e-?mail|email)\s*[*:]?\s*[:=]?\s*([\w.+-]+@[\w.-]+\.\w+)/i);
  if (emailMatch) {
    const email = validateEmail(emailMatch[1]);
    if (email) daten.email = email;
  }

  // Artikel (optional)
  const artikelRaw = extractFieldRobust(text, /(?:artikel|produkt|material)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
  if (artikelRaw && !siehtAusWieFeldname(artikelRaw)) {
    daten.artikel = sanitizeString(artikelRaw);
  }

  // Körnung
  const koernungMatch = text.match(/(?:körnung|koernung|korngröße)\s*[*:]?\s*[:=]?\s*([\d\/\-]+)/i);
  if (koernungMatch) daten.koernung = koernungMatch[1].trim();

  // Lieferart
  const lieferartMatch = text.match(/(?:lieferart|lieferung)\s*[*:]?\s*[:=]?\s*(lose|gesackt|big\s*bag)/i);
  if (lieferartMatch) daten.lieferart = lieferartMatch[1].trim().toLowerCase();

  // Anzahl Plätze
  const plaetzeMatch = text.match(/(?:anzahl\s*plätze|anzahl\s*plaetze|plätze|tennis.*plätze?)\s*[*:]?\s*[:=]?\s*(\d+)/i);
  if (plaetzeMatch) {
    const anzahl = parseInt(plaetzeMatch[1], 10);
    if (!isNaN(anzahl) && anzahl > 0 && anzahl <= 100) {
      daten.anzahlPlaetze = anzahl;
    }
  }

  // WICHTIG: Einzelne Tonnen-Felder extrahieren für präzise Berechnung
  // Das Webformular hat: "Tonnen 0-2 lose:", "Tonnen 0-2 gesackt:", "Tonnen 0-3 lose:", "Tonnen 0-3 gesackt:"
  const tonnenPatterns = {
    tonnenLose02: /tonnen\s*0-?2\s*(?:mm\s*)?lose\s*[*:]?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i,
    tonnenGesackt02: /tonnen\s*0-?2\s*(?:mm\s*)?gesackt\s*[*:]?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i,
    tonnenLose03: /tonnen\s*0-?3\s*(?:mm\s*)?lose\s*[*:]?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i,
    tonnenGesackt03: /tonnen\s*0-?3\s*(?:mm\s*)?gesackt\s*[*:]?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i,
  };

  for (const [key, pattern] of Object.entries(tonnenPatterns)) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(value) && value > 0) {
        (daten as any)[key] = value;
      }
    }
  }

  // Berechne Gesamtmenge aus allen Tonnen-Feldern
  const gesamtMenge =
    (daten.tonnenLose02 || 0) +
    (daten.tonnenGesackt02 || 0) +
    (daten.tonnenLose03 || 0) +
    (daten.tonnenGesackt03 || 0);

  if (gesamtMenge > 0) {
    daten.menge = gesamtMenge;

    // Bestimme Hauptprodukt (größte Menge)
    const mengen = [
      { menge: daten.tonnenLose02 || 0, koernung: '0-2', lieferart: 'lose' },
      { menge: daten.tonnenGesackt02 || 0, koernung: '0-2', lieferart: 'gesackt' },
      { menge: daten.tonnenLose03 || 0, koernung: '0-3', lieferart: 'lose' },
      { menge: daten.tonnenGesackt03 || 0, koernung: '0-3', lieferart: 'gesackt' },
    ];
    const hauptPosition = mengen.reduce((max, curr) => curr.menge > max.menge ? curr : max, mengen[0]);

    if (!daten.koernung) daten.koernung = hauptPosition.koernung;
    if (!daten.lieferart) daten.lieferart = hauptPosition.lieferart;
  }

  // Nachricht extrahieren - aber stopp vor Datenschutzerklärung und anderen Feldern
  const nachrichtMatch = text.match(/(?:nachricht|bemerkung|anmerkung|mitteilung)\s*[*:]?\s*[:=]?\s*([\s\S]+?)(?:datenschutz|mit freundlichen|regards|---|$)/i);
  if (nachrichtMatch && nachrichtMatch[1]) {
    let nachricht = nachrichtMatch[1].trim();

    // Entferne trailing Feldnamen
    for (const feldname of BEKANNTE_FELDNAMEN) {
      const pos = nachricht.toLowerCase().lastIndexOf(feldname);
      if (pos > 0) {
        nachricht = nachricht.substring(0, pos).trim();
      }
    }

    // Sanitize und speichere
    nachricht = sanitizeString(nachricht);
    if (nachricht.length >= 3 && !siehtAusWieFeldname(nachricht)) {
      daten.nachricht = nachricht.substring(0, 2000);
    }
  }

  console.log('📋 Extrahierte Daten (validiert):', JSON.stringify(daten, null, 2));

  return daten;
};

// Ist Webformular-Anfrage?
const istWebformularAnfrage = (text: string): boolean => {
  const lowerText = text.toLowerCase();

  const hatVornameNachname = /vorname\s*[*:]/.test(lowerText) && /nachname\s*[*:]/.test(lowerText);
  const hatPlz = /plz\s*[*:]?\s*\d{5}/.test(lowerText);
  const hatTennisKeywords = /(tennismehl|ziegelmehl|tennisplatz|angebot|anfrage)/i.test(lowerText);
  const hatVereinsname = /vereins?-?name\s*[*:]/i.test(lowerText);
  const hatAnzahlPlaetze = /anzahl\s*pl[äa]tze/i.test(lowerText);
  const hatTonnenAngabe = /tonnen?\s*(0-2|0-3|lose|gesackt)/i.test(lowerText);

  const matches = [hatVornameNachname, hatPlz, hatTennisKeywords, hatVereinsname, hatAnzahlPlaetze, hatTonnenAngabe].filter(Boolean);
  return matches.length >= 2;
};

// E-Mails von IMAP holen
const fetchEmails = (account: EmailAccount, limit: number): Promise<EmailData[]> => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: account.imapHost || process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net',
      port: account.imapPort || parseInt(process.env.EMAIL_IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    const emails: EmailData[] = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
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

          msg.on('body', (stream) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.once('end', () => {
              const buffer = Buffer.concat(chunks);
              simpleParser(buffer)
                .then((mail) => {
                  emails.push(parseEmailContent(mail, uid || seqno));
                })
                .catch(console.error);
            });
          });

          msg.once('attributes', (attrs) => {
            uid = attrs.uid;
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

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
};

// Appwrite Client erstellen
const createAppwriteClient = () => {
  const client = new Client();
  client
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_PROJECT_ID || 'tennismehl24')
    .setKey(process.env.APPWRITE_API_KEY || '');

  return new Databases(client);
};

// Prüfe ob E-Mail bereits in Appwrite existiert
const emailExistiertBereits = async (
  databases: Databases,
  emailAbsender: string,
  emailDatum: string,
  emailBetreff: string
): Promise<boolean> => {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      ANFRAGEN_COLLECTION_ID,
      [
        Query.equal('emailAbsender', emailAbsender),
        Query.equal('emailDatum', emailDatum),
        Query.equal('emailBetreff', emailBetreff.substring(0, 500)),
        Query.limit(1)
      ]
    );
    return response.total > 0;
  } catch (error) {
    console.error('Fehler bei Duplikat-Check:', error);
    return false;
  }
};

// Move email to folder (copy + delete)
const moveEmailToFolder = (
  account: EmailAccount,
  uid: number,
  targetFolder: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: account.imapHost || process.env.EMAIL_IMAP_HOST || 'web3.ipp-webspace.net',
      port: account.imapPort || parseInt(process.env.EMAIL_IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      // Erst Zielordner erstellen falls nicht vorhanden
      imap.addBox(targetFolder, (addErr) => {
        // Fehler ignorieren wenn Ordner schon existiert
        if (addErr && !addErr.message?.includes('ALREADYEXISTS') && !addErr.message?.includes('already exists')) {
          console.log('📁 Ordner-Info:', addErr.message);
        }

        // INBOX öffnen (nicht readonly!)
        imap.openBox('INBOX', false, (openErr) => {
          if (openErr) {
            imap.end();
            return reject(openErr);
          }

          // Email in Zielordner kopieren
          imap.copy(uid, targetFolder, (copyErr) => {
            if (copyErr) {
              imap.end();
              console.error('❌ Copy-Fehler:', copyErr);
              return reject(copyErr);
            }

            // Original als gelöscht markieren
            imap.addFlags(uid, ['\\Deleted'], (flagErr) => {
              if (flagErr) {
                imap.end();
                console.error('❌ Flag-Fehler:', flagErr);
                return reject(flagErr);
              }

              // Expunge um gelöschte Emails endgültig zu entfernen
              imap.expunge((expungeErr) => {
                imap.end();
                if (expungeErr) {
                  console.warn('⚠️ Expunge warning:', expungeErr.message);
                }
                console.log(`📤 Email ${uid} nach ${targetFolder} verschoben`);
                resolve();
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

// Speichere Anfrage in Appwrite
const speichereAnfrage = async (
  databases: Databases,
  email: EmailData,
  extrahierteDaten: ExtrahierteDaten,
  emailKonto: string
): Promise<string> => {
  const jetzt = new Date().toISOString();

  // Basis-Daten (immer vorhanden)
  const basisDaten = {
    emailBetreff: email.subject.substring(0, 500),
    emailAbsender: email.fromAddress,
    emailDatum: email.date,
    emailText: email.body.substring(0, 10000),
    emailHtml: (email.bodyHtml || '').substring(0, 50000),
    extrahierteDaten: JSON.stringify(extrahierteDaten),
    status: 'neu',
    kundeId: '',
    projektId: '',
    angebotVersendetAm: '',
    bearbeitetVon: '',
    erstelltAm: jetzt,
  };

  try {
    // Versuche mit neuen Feldern zu speichern
    const document = await databases.createDocument(
      DATABASE_ID,
      ANFRAGEN_COLLECTION_ID,
      ID.unique(),
      {
        ...basisDaten,
        emailUid: email.uid,
        emailKonto: emailKonto,
      }
    );
    return document.$id;
  } catch (error: any) {
    // Falls Fehler wegen unbekannter Attribute, ohne neue Felder speichern
    if (error?.message?.includes('Unknown attribute') || error?.code === 400) {
      console.log('⚠️ Neue Felder noch nicht in Appwrite - speichere ohne emailUid/emailKonto');
      const document = await databases.createDocument(
        DATABASE_ID,
        ANFRAGEN_COLLECTION_ID,
        ID.unique(),
        basisDaten
      );
      return document.$id;
    }
    throw error;
  }
};

// Main Handler
const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

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

    // Find anfrage@ account
    const anfrageAccount = accounts.find(a => a.email === ANFRAGEN_EMAIL_KONTO);
    if (!anfrageAccount) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Account ${ANFRAGEN_EMAIL_KONTO} not found`,
          availableAccounts: accounts.map(a => a.email)
        }),
      };
    }

    // Appwrite initialisieren
    const databases = createAppwriteClient();

    // E-Mails abrufen (letzte 100)
    console.log(`📧 Hole E-Mails von ${ANFRAGEN_EMAIL_KONTO}...`);
    const emails = await fetchEmails(anfrageAccount, 100);
    console.log(`📬 ${emails.length} E-Mails gefunden`);

    // Nur E-Mails von mail@tennismehl.com filtern
    const webformularEmails = emails.filter(email =>
      email.fromAddress.toLowerCase() === WEBFORMULAR_ABSENDER
    );
    console.log(`🌐 ${webformularEmails.length} Webformular-Anfragen`);

    let neueSpeicherungen = 0;
    let duplikate = 0;
    let fehler = 0;
    const gespeicherteIds: string[] = [];

    // UIDs der erfolgreich verarbeiteten Emails (für späteres Verschieben)
    const zuVerschiebendeUids: number[] = [];

    for (const email of webformularEmails) {
      try {
        // Prüfe ob bereits in DB
        const existiert = await emailExistiertBereits(
          databases,
          email.fromAddress,
          email.date,
          email.subject
        );

        if (existiert) {
          duplikate++;
          // AUCH bereits verarbeitete Emails verschieben!
          zuVerschiebendeUids.push(email.uid);
          continue;
        }

        // Webformular-Daten extrahieren
        const extrahierteDaten = extrahiereWebformularDaten(email.body);

        // In Appwrite speichern
        const docId = await speichereAnfrage(databases, email, extrahierteDaten, ANFRAGEN_EMAIL_KONTO);
        gespeicherteIds.push(docId);
        neueSpeicherungen++;
        console.log(`✅ Gespeichert: ${email.subject.substring(0, 50)}...`);

        // Merken zum Verschieben
        zuVerschiebendeUids.push(email.uid);

      } catch (error) {
        console.error(`❌ Fehler bei E-Mail ${email.uid}:`, error);
        fehler++;
      }
    }

    // NACH dem Speichern: Alle verarbeiteten Emails aus INBOX verschieben
    let verschoben = 0;
    if (zuVerschiebendeUids.length > 0) {
      console.log(`📤 Verschiebe ${zuVerschiebendeUids.length} Emails nach INBOX.Verarbeitet...`);
      for (const uid of zuVerschiebendeUids) {
        try {
          await moveEmailToFolder(anfrageAccount, uid, 'INBOX.Verarbeitet');
          verschoben++;
        } catch (moveErr) {
          console.warn(`⚠️ Konnte Email ${uid} nicht verschieben:`, moveErr);
          // Nicht als Fehler zählen - Hauptsache gespeichert
        }
      }
      console.log(`✅ ${verschoben}/${zuVerschiebendeUids.length} Emails verschoben`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        emailsGefunden: emails.length,
        webformularAnfragen: webformularEmails.length,
        neueSpeicherungen,
        duplikate,
        fehler,
        verschoben,
        gespeicherteIds,
      }),
    };

  } catch (error) {
    console.error('Email Sync Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

export { handler };
