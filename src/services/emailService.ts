// Email Service - kommuniziert mit der Netlify Function für IMAP-Zugriff

// Base URL für die API - im Dev-Mode lokalen Server verwenden
const getApiUrl = () => {
  // Prüfe ob lokaler Email-Dev-Server läuft (Port 8888)
  if (import.meta.env.DEV) {
    return 'http://localhost:8888/.netlify/functions/email-api';
  }
  return '/.netlify/functions/email-api';
};

// Dev Mode Flag - wird gesetzt wenn weder Netlify noch lokaler Server erreichbar
let isDevMode = false;
let devModeChecked = false;

// Email Interface
export interface Email {
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

// Email Account Interface
export interface EmailAccount {
  email: string;
  name: string;
}

// Folder Interface
export interface EmailFolder {
  name: string;
  path: string;
}

// API Response Types
interface AccountsResponse {
  accounts: EmailAccount[];
}

interface EmailListResponse {
  emails: Email[];
  account: string;
  folder: string;
}

interface EmailDetailResponse {
  email: Email | null;
}

interface FoldersResponse {
  folders: EmailFolder[];
}

interface UnreadResponse {
  unread: number;
  folder: string;
}

// ============== MOCK DATA FOR DEV MODE ==============

const MOCK_ACCOUNTS: EmailAccount[] = [
  { email: 'info@tennismehl.com', name: 'Info' },
  { email: 'anfrage@tennismehl.com', name: 'Anfragen' },
  { email: 'bestellung@tennismehl24.com', name: 'Bestellungen' },
  { email: 'rechnung@tennismehl.com', name: 'Rechnungen' },
  { email: 'buchhaltung@tennismehl.com', name: 'Buchhaltung' },
  { email: 'logistik@tennismehl.com', name: 'Logistik' },
];

const MOCK_FOLDERS: EmailFolder[] = [
  { name: 'INBOX', path: 'INBOX' },
  { name: 'Sent', path: 'Sent' },
  { name: 'Drafts', path: 'Drafts' },
  { name: 'Trash', path: 'Trash' },
  { name: 'Spam', path: 'Spam' },
];

const generateMockEmails = (account: string): Email[] => {
  const now = new Date();
  const subjects = [
    'Anfrage Ziegelmehl 25t',
    'Re: Liefertermin KW 3',
    'Rechnung #2024-0142',
    'Preisanfrage Tennisplatzbelag',
    'Bestellung TC Musterstadt',
    'Rückfrage zur Lieferung',
    'Angebot erbeten',
    'Terminbestätigung',
    'Mahnung - Rechnung überfällig',
    'Newsletter Abmeldung',
  ];

  const senders = [
    { name: 'Max Mustermann', address: 'max@example.com' },
    { name: 'TC Musterstadt', address: 'info@tc-musterstadt.de' },
    { name: 'Sportanlagen GmbH', address: 'kontakt@sportanlagen.de' },
    { name: 'Hans Meier', address: 'h.meier@tennisclub.de' },
    { name: 'Petra Schmidt', address: 'p.schmidt@verein.de' },
  ];

  const previews = [
    'Sehr geehrte Damen und Herren, wir benötigen für unsere Tennisanlage...',
    'Vielen Dank für Ihr Angebot. Wir möchten gerne bestellen...',
    'Anbei erhalten Sie die Rechnung für die letzte Lieferung...',
    'Könnten Sie uns bitte ein Angebot für 15 Tonnen zusenden?',
    'Wann können wir mit der Lieferung rechnen? Der Platz muss...',
    'Bezugnehmend auf unser Telefonat von heute...',
    'Wir interessieren uns für Ihre Produkte und hätten gerne...',
    'Der Termin am Donnerstag passt uns sehr gut. Bitte liefern Sie...',
  ];

  return Array.from({ length: 12 }, (_, i) => ({
    id: `${account}-${i + 1}`,
    uid: 1000 + i,
    subject: subjects[i % subjects.length],
    from: senders[i % senders.length],
    to: [{ name: 'TennisMehl', address: account }],
    date: new Date(now.getTime() - i * 3600000 * (1 + Math.random() * 5)).toISOString(),
    bodyPreview: previews[i % previews.length],
    body: `${previews[i % previews.length]}\n\nMit freundlichen Grüßen\n${senders[i % senders.length].name}`,
    isRead: i > 2,
    hasAttachments: i % 4 === 0,
    attachments: i % 4 === 0 ? [
      { filename: 'Anfrage.pdf', size: 125000, contentType: 'application/pdf' },
    ] : undefined,
  }));
};

// ============== API HELPERS ==============

// Check if we're in dev mode (Netlify Function not available)
const checkDevMode = async (): Promise<boolean> => {
  if (devModeChecked) return isDevMode;

  try {
    const response = await fetch(`${getApiUrl()}?action=accounts`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    isDevMode = !response.ok;
  } catch {
    isDevMode = true;
  }

  devModeChecked = true;

  if (isDevMode) {
    console.log('📧 Email Dashboard: Dev-Modus aktiv (Mock-Daten)');
  }

  return isDevMode;
};

// API Call Helper
const callApi = async <T>(params: Record<string, string>): Promise<T> => {
  const url = new URL(getApiUrl(), window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API Error: ${response.status}`);
  }

  return response.json();
};

// ============== PUBLIC API ==============

// Get all configured email accounts
export const getAccounts = async (): Promise<EmailAccount[]> => {
  if (await checkDevMode()) {
    return MOCK_ACCOUNTS;
  }

  const response = await callApi<AccountsResponse>({ action: 'accounts' });
  return response.accounts;
};

// Get emails from a specific account and folder
export const getEmails = async (
  account: string,
  folder: string = 'INBOX',
  limit: number = 50
): Promise<Email[]> => {
  if (await checkDevMode()) {
    const emails = generateMockEmails(account);
    return emails.slice(0, limit);
  }

  const response = await callApi<EmailListResponse>({
    action: 'list',
    account,
    folder,
    limit: limit.toString(),
  });
  return response.emails;
};

// Get a single email by UID
export const getEmail = async (
  account: string,
  folder: string,
  uid: number
): Promise<Email | null> => {
  if (await checkDevMode()) {
    const emails = generateMockEmails(account);
    return emails.find((e) => e.uid === uid) || emails[0];
  }

  const response = await callApi<EmailDetailResponse>({
    action: 'get',
    account,
    folder,
    uid: uid.toString(),
  });
  return response.email;
};

// Get folders for an account
export const getFolders = async (account: string): Promise<EmailFolder[]> => {
  if (await checkDevMode()) {
    return MOCK_FOLDERS;
  }

  const response = await callApi<FoldersResponse>({
    action: 'folders',
    account,
  });
  return response.folders;
};

// Get unread count for a folder
export const getUnreadCount = async (
  account: string,
  folder: string = 'INBOX'
): Promise<number> => {
  if (await checkDevMode()) {
    // Random unread count for dev mode
    return Math.floor(Math.random() * 5);
  }

  const response = await callApi<UnreadResponse>({
    action: 'unread',
    account,
    folder,
  });
  return response.unread;
};

// Check if running in dev mode
export const isInDevMode = (): boolean => isDevMode;

// ============== UNIFIED INBOX ==============

export interface UnifiedEmail extends Email {
  accountEmail: string;
  accountName: string;
}

// Get emails from ALL accounts at once (for unified inbox)
export const getAllEmails = async (limit: number = 10): Promise<UnifiedEmail[]> => {
  const accounts = await getAccounts();

  // Parallel alle Konten abfragen für beste Performance
  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      try {
        const emails = await getEmails(account.email, 'INBOX', limit);
        return emails.map((email) => ({
          ...email,
          accountEmail: account.email,
          accountName: account.name,
        }));
      } catch (error) {
        console.error(`Fehler bei ${account.email}:`, error);
        return [];
      }
    })
  );

  // Alle erfolgreichen Ergebnisse zusammenführen
  const allEmails: UnifiedEmail[] = [];
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allEmails.push(...result.value);
    }
  });

  // Nach Datum sortieren (neueste zuerst)
  allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return allEmails;
};

// Get total unread count across all accounts
export const getTotalUnreadCount = async (): Promise<{ total: number; byAccount: Map<string, number> }> => {
  const accounts = await getAccounts();
  const byAccount = new Map<string, number>();
  let total = 0;

  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      const count = await getUnreadCount(account.email);
      return { email: account.email, count };
    })
  );

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      byAccount.set(result.value.email, result.value.count);
      total += result.value.count;
    }
  });

  return { total, byAccount };
};
