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
  menge?: number;
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

// Webformular-Daten extrahieren
const extrahiereWebformularDaten = (text: string): ExtrahierteDaten => {
  const daten: ExtrahierteDaten = {};

  // WICHTIG: Vereinsname hat Priorität - eigene Extraktion!
  // "Vereins-Name *:" oder "Vereinsname *:" oder "Vereins-Name:"
  const vereinsnameMatch = text.match(/(?:vereins-?name|verein|club|klub)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
  if (vereinsnameMatch && vereinsnameMatch[1]) {
    const vereinsname = vereinsnameMatch[1].trim();
    // Nur wenn es ein echter Wert ist (nicht leer, nicht nur Sonderzeichen)
    if (vereinsname && vereinsname.length > 1 && !/^[-_*]+$/.test(vereinsname)) {
      daten.vereinsname = vereinsname;
      // Vereinsname ist der Kundenname!
      daten.kundenname = vereinsname;
    }
  }

  // Vorname und Nachname separat extrahieren
  const vornameMatch = text.match(/vorname\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
  if (vornameMatch && vornameMatch[1]) {
    daten.vorname = vornameMatch[1].trim();
  }

  const nachnameMatch = text.match(/nachname\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
  if (nachnameMatch && nachnameMatch[1]) {
    daten.nachname = nachnameMatch[1].trim();
  }

  // Ansprechpartner aus Vorname + Nachname zusammensetzen
  if (daten.vorname || daten.nachname) {
    daten.ansprechpartner = `${daten.vorname || ''} ${daten.nachname || ''}`.trim();
  }

  // Falls kein Vereinsname, prüfe Firma/Organisation (NICHT "name" allgemein!)
  if (!daten.kundenname) {
    const firmaMatch = text.match(/(?:firma|organisation|unternehmen|betrieb)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i);
    if (firmaMatch && firmaMatch[1]) {
      const firma = firmaMatch[1].trim();
      if (firma && firma.length > 1) {
        daten.kundenname = firma;
      }
    }
  }

  // Fallback: Wenn immer noch kein Kundenname, nimm Ansprechpartner
  if (!daten.kundenname && daten.ansprechpartner) {
    daten.kundenname = daten.ansprechpartner;
  }

  // Standard Webformular-Format für restliche Felder
  const patterns: Record<string, RegExp> = {
    strasse: /(?:straße|strasse|adresse)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i,
    plz: /(?:plz|postleitzahl)\s*[*:]?\s*[:=]?\s*(\d{5})/i,
    ort: /(?:ort|stadt|city)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i,
    telefon: /(?:telefon|tel|phone|mobil)\s*[*:]?\s*[:=]?\s*([\d\s\-\/\+]+)/i,
    email: /(?:e-?mail|email)\s*[*:]?\s*[:=]?\s*([\w.+-]+@[\w.-]+\.\w+)/i,
    menge: /(?:menge|tonnen|gewicht)\s*[*:]?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i,
    artikel: /(?:artikel|produkt|material)\s*[*:]?\s*[:=]?\s*(.+?)(?:\n|$)/i,
    koernung: /(?:körnung|koernung|korngröße)\s*[*:]?\s*[:=]?\s*([\d\/\-]+)/i,
    lieferart: /(?:lieferart|lieferung)\s*[*:]?\s*[:=]?\s*(lose|gesackt|big\s*bag)/i,
    anzahlPlaetze: /(?:anzahl\s*plätze|anzahl\s*plaetze|plätze|tennis.*plätze?)\s*[*:]?\s*[:=]?\s*(\d+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = match[1].trim();
      if (key === 'menge' || key === 'anzahlPlaetze') {
        daten[key as keyof ExtrahierteDaten] = parseFloat(value.replace(',', '.')) as any;
      } else {
        (daten as any)[key] = value;
      }
    }
  }

  // Nachricht extrahieren (alles nach "Nachricht:" oder "Bemerkung:")
  const nachrichtMatch = text.match(/(?:nachricht|bemerkung|anmerkung|mitteilung)\s*[*:]?\s*[:=]?\s*([\s\S]+?)(?:(?:mit freundlichen|regards|---)|$)/i);
  if (nachrichtMatch) {
    daten.nachricht = nachrichtMatch[1].trim().substring(0, 2000);
  }

  console.log('📋 Extrahierte Daten:', JSON.stringify(daten, null, 2));

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

// Speichere Anfrage in Appwrite
const speichereAnfrage = async (
  databases: Databases,
  email: EmailData,
  extrahierteDaten: ExtrahierteDaten
): Promise<string> => {
  const jetzt = new Date().toISOString();

  const document = await databases.createDocument(
    DATABASE_ID,
    ANFRAGEN_COLLECTION_ID,
    ID.unique(),
    {
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
    }
  );

  return document.$id;
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
          continue;
        }

        // Webformular-Daten extrahieren
        const extrahierteDaten = extrahiereWebformularDaten(email.body);

        // In Appwrite speichern
        const docId = await speichereAnfrage(databases, email, extrahierteDaten);
        gespeicherteIds.push(docId);
        neueSpeicherungen++;
        console.log(`✅ Gespeichert: ${email.subject.substring(0, 50)}...`);

      } catch (error) {
        console.error(`❌ Fehler bei E-Mail ${email.uid}:`, error);
        fehler++;
      }
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
