import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail,
  Inbox,
  RefreshCw,
  Search,
  X,
  Paperclip,
  Clock,
  AlertCircle,
  CheckCircle,
  Folder,
  ChevronRight,
  ChevronDown,
  User,
  Users,
} from 'lucide-react';
import {
  getAccounts,
  getEmails,
  getEmail,
  getFolders,
  getUnreadCount,
  isInDevMode,
  Email,
  EmailAccount,
  EmailFolder,
} from '../../services/emailService';

const EmailDashboard = () => {
  // Account State
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());

  // Email State
  const [emails, setEmails] = useState<Email[]>([]);
  const [folders, setFolders] = useState<EmailFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('INBOX');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  // UI State
  const [loading, setLoading] = useState(true);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFolders] = useState(true);
  const [showAccounts, setShowAccounts] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Refs
  const refreshIntervalRef = useRef<number | null>(null);

  // Accounts laden
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        setLoading(true);
        const accountList = await getAccounts();
        setAccounts(accountList);

        if (accountList.length > 0) {
          setSelectedAccount(accountList[0].email);
        }

        // Ungelesene Emails für alle Konten laden
        const counts = new Map<string, number>();
        await Promise.all(
          accountList.map(async (acc) => {
            try {
              const count = await getUnreadCount(acc.email);
              counts.set(acc.email, count);
            } catch {
              counts.set(acc.email, 0);
            }
          })
        );
        setUnreadCounts(counts);
      } catch (err) {
        console.error('Fehler beim Laden der Accounts:', err);
        setError('Fehler beim Laden der Email-Konten. Bitte versuchen Sie es später erneut.');
      } finally {
        setLoading(false);
      }
    };

    loadAccounts();
  }, []);

  // Emails laden
  const loadEmails = useCallback(async () => {
    if (!selectedAccount) return;

    setEmailsLoading(true);
    setError(null);

    try {
      const [emailsResponse, foldersResponse, unread] = await Promise.all([
        getEmails(selectedAccount, selectedFolder, 50),
        getFolders(selectedAccount),
        getUnreadCount(selectedAccount, selectedFolder),
      ]);

      setEmails(emailsResponse);
      setFolders(foldersResponse);
      setUnreadCounts((prev) => new Map(prev).set(selectedAccount, unread));
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Emails laden Fehler:', err);
      setError('Fehler beim Laden der Emails. Bitte versuchen Sie es erneut.');
    } finally {
      setEmailsLoading(false);
    }
  }, [selectedAccount, selectedFolder]);

  // Emails laden wenn Account oder Folder sich ändert
  useEffect(() => {
    if (selectedAccount) {
      loadEmails();
    }
  }, [selectedAccount, selectedFolder, loadEmails]);

  // Auto-Refresh
  useEffect(() => {
    if (autoRefresh && selectedAccount) {
      refreshIntervalRef.current = window.setInterval(() => {
        loadEmails();
      }, 30000); // Alle 30 Sekunden

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefresh, selectedAccount, loadEmails]);

  // Email auswählen
  const handleSelectEmail = async (email: Email) => {
    if (!selectedAccount) return;

    try {
      const fullEmail = await getEmail(selectedAccount, selectedFolder, email.uid);
      if (fullEmail) {
        setSelectedEmail(fullEmail);
      }
    } catch (err) {
      console.error('Email laden Fehler:', err);
    }
  };

  // Gefilterte Emails
  const filteredEmails = emails.filter((email) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.subject?.toLowerCase().includes(query) ||
      email.from?.name?.toLowerCase().includes(query) ||
      email.from?.address?.toLowerCase().includes(query) ||
      email.bodyPreview?.toLowerCase().includes(query)
    );
  });

  // Datum formatieren
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Gestern';
    } else if (days < 7) {
      return date.toLocaleDateString('de-DE', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }
  };

  // Total unread
  const totalUnread = Array.from(unreadCounts.values()).reduce((sum, count) => sum + count, 0);

  // Loading State
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border p-8">
          <div className="flex items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-red-600" />
            <span className="text-gray-600 dark:text-dark-textMuted">Email-Konten werden geladen...</span>
          </div>
        </div>
      </div>
    );
  }

  // No accounts
  if (accounts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-2">
              Keine Email-Konten konfiguriert
            </h2>
            <p className="text-gray-600 dark:text-dark-textMuted">
              Bitte konfigurieren Sie die Email-Konten in den Umgebungsvariablen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border mb-6">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text">
                  Email Dashboard
                </h1>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-textMuted">
                  <Users className="w-4 h-4" />
                  <span>{accounts.length} Konten</span>
                  {totalUnread > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-medium">
                      {totalUnread} ungelesen
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Auto-Refresh Toggle */}
              <label className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-bg rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-green-500 transition-colors">
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${autoRefresh ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-sm text-gray-600 dark:text-dark-textMuted">Auto</span>
              </label>

              {/* Refresh Button */}
              <button
                onClick={loadEmails}
                disabled={emailsLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${emailsLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Aktualisieren</span>
              </button>
            </div>
          </div>

          {/* Last Refresh Info */}
          {lastRefresh && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <Clock className="w-3 h-3" />
              <span>Zuletzt aktualisiert: {lastRefresh.toLocaleTimeString('de-DE')}</span>
              {autoRefresh && <span className="text-green-500">(Auto-Refresh aktiv)</span>}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Emails durchsuchen..."
              className="w-full pl-10 pr-10 py-3 border border-gray-200 dark:border-dark-border rounded-lg bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-dark-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dev Mode Banner */}
      {isInDevMode() && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3">
          <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <div className="font-medium text-amber-800 dark:text-amber-300">Dev-Modus aktiv</div>
            <div className="text-sm text-amber-600 dark:text-amber-400">
              Mock-Daten werden angezeigt. Auf Netlify werden echte Emails geladen.
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Left Sidebar - Accounts & Folders */}
        <div className="hidden lg:block w-72 flex-shrink-0 space-y-4">
          {/* Accounts */}
          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border overflow-hidden">
            <button
              onClick={() => setShowAccounts(!showAccounts)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <h3 className="font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
                <User className="w-4 h-4" />
                Konten
              </h3>
              {showAccounts ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showAccounts && (
              <div className="px-2 pb-2 space-y-1 max-h-64 overflow-y-auto">
                {accounts.map((account) => {
                  const unread = unreadCounts.get(account.email) || 0;
                  return (
                    <button
                      key={account.email}
                      onClick={() => {
                        setSelectedAccount(account.email);
                        setSelectedFolder('INBOX');
                        setSelectedEmail(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                        selectedAccount === account.email
                          ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-dark-text'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{account.name}</div>
                        <div className="text-xs text-gray-500 dark:text-dark-textMuted truncate">
                          {account.email}
                        </div>
                      </div>
                      {unread > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs flex-shrink-0">
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Folders */}
          {showFolders && folders.length > 0 && (
            <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border p-4">
              <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-3 flex items-center gap-2">
                <Folder className="w-4 h-4" />
                Ordner
              </h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {folders.map((folder) => (
                  <button
                    key={folder.path}
                    onClick={() => {
                      setSelectedFolder(folder.path);
                      setSelectedEmail(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                      selectedFolder === folder.path
                        ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-dark-text'
                    }`}
                  >
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Email List */}
        <div className={`flex-1 ${selectedEmail ? 'hidden lg:block lg:w-1/2' : ''}`}>
          {/* Mobile Account Selector */}
          <div className="lg:hidden mb-4">
            <select
              value={selectedAccount || ''}
              onChange={(e) => {
                setSelectedAccount(e.target.value);
                setSelectedFolder('INBOX');
                setSelectedEmail(null);
              }}
              className="w-full p-3 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text"
            >
              {accounts.map((account) => (
                <option key={account.email} value={account.email}>
                  {account.name} ({unreadCounts.get(account.email) || 0} ungelesen)
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border overflow-hidden">
            {/* Current Account Header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
              <div className="flex items-center justify-between">
                <div className="font-medium text-gray-900 dark:text-dark-text">
                  {accounts.find((a) => a.email === selectedAccount)?.name || 'Unbekannt'}
                </div>
                <div className="text-sm text-gray-500 dark:text-dark-textMuted">
                  {selectedFolder}
                </div>
              </div>
            </div>

            {emailsLoading && emails.length === 0 ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
                <span className="text-gray-500 dark:text-dark-textMuted">Emails werden geladen...</span>
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="p-8 text-center">
                <Inbox className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-dark-textMuted">
                  {searchQuery ? 'Keine Emails gefunden' : 'Keine Emails vorhanden'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-dark-border max-h-[calc(100vh-350px)] overflow-y-auto">
                {filteredEmails.map((email) => (
                  <button
                    key={email.id}
                    onClick={() => handleSelectEmail(email)}
                    className={`w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      !email.isRead ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''
                    } ${selectedEmail?.id === email.id ? 'bg-teal-100 dark:bg-teal-900/30' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Read Status */}
                      <div className="flex-shrink-0 mt-1">
                        {email.isRead ? (
                          <CheckCircle className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-teal-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* From & Date */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`truncate ${!email.isRead ? 'font-semibold' : ''} text-gray-900 dark:text-dark-text`}>
                            {email.from?.name || email.from?.address || 'Unbekannt'}
                          </span>
                          <span className="flex-shrink-0 text-xs text-gray-500 dark:text-dark-textMuted">
                            {formatDate(email.date)}
                          </span>
                        </div>

                        {/* Subject */}
                        <div className={`truncate ${!email.isRead ? 'font-medium' : ''} text-gray-800 dark:text-gray-200 mb-1`}>
                          {email.subject || '(Kein Betreff)'}
                        </div>

                        {/* Preview */}
                        <div className="text-sm text-gray-500 dark:text-dark-textMuted truncate">
                          {email.bodyPreview}
                        </div>

                        {/* Badges */}
                        {email.hasAttachments && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs">
                              <Paperclip className="w-3 h-3" />
                              Anhang
                            </span>
                          </div>
                        )}
                      </div>

                      <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Email Detail */}
        {selectedEmail && (
          <div className={`flex-1 ${selectedEmail ? 'fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto' : ''}`}>
            <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border h-full lg:h-auto lg:max-h-[calc(100vh-350px)] overflow-hidden flex flex-col">
              {/* Email Header */}
              <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-dark-border">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <button
                    onClick={() => setSelectedEmail(null)}
                    className="flex items-center gap-2 text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                    <span className="lg:hidden">Zurück</span>
                  </button>

                  <button
                    onClick={() => setSelectedEmail(null)}
                    className="hidden lg:block p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text mb-3">
                  {selectedEmail.subject || '(Kein Betreff)'}
                </h2>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-bold">
                    {selectedEmail.from?.name?.charAt(0).toUpperCase() ||
                      selectedEmail.from?.address?.charAt(0).toUpperCase() ||
                      '?'}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-dark-text">
                      {selectedEmail.from?.name || 'Unbekannt'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-dark-textMuted">
                      {selectedEmail.from?.address}
                    </div>
                  </div>
                  <div className="ml-auto text-sm text-gray-500 dark:text-dark-textMuted">
                    {new Date(selectedEmail.date).toLocaleString('de-DE')}
                  </div>
                </div>

                {/* Attachments */}
                {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedEmail.attachments.map((att, i) => (
                      <div
                        key={i}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm"
                      >
                        <Paperclip className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-700 dark:text-gray-300">{att.filename}</span>
                        <span className="text-gray-400 text-xs">
                          ({Math.round(att.size / 1024)} KB)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Email Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {selectedEmail.bodyHtml ? (
                  <div
                    className="prose dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                  />
                ) : selectedEmail.body ? (
                  <pre className="whitespace-pre-wrap text-gray-700 dark:text-gray-300 font-sans">
                    {selectedEmail.body}
                  </pre>
                ) : (
                  <p className="text-gray-500 dark:text-dark-textMuted">{selectedEmail.bodyPreview}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailDashboard;
