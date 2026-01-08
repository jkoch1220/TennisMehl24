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
  ChevronRight,
  Users,
  Layers,
  User,
} from 'lucide-react';
import {
  getAccounts,
  getAllEmails,
  getEmail,
  getTotalUnreadCount,
  isInDevMode,
  EmailAccount,
  UnifiedEmail,
} from '../../services/emailService';

// Farben für die verschiedenen Konten
const ACCOUNT_COLORS: Record<string, string> = {
  'info@tennismehl.com': 'bg-blue-500',
  'anfrage@tennismehl.com': 'bg-green-500',
  'bestellung@tennismehl24.com': 'bg-purple-500',
  'rechnung@tennismehl.com': 'bg-red-500',
  'buchhaltung@tennismehl.com': 'bg-orange-500',
  'logistik@tennismehl.com': 'bg-teal-500',
  'jr@tennismehl.com': 'bg-indigo-500',
  'egner@tennismehl.com': 'bg-pink-500',
  'sigle@tennismehl.com': 'bg-cyan-500',
  'info@tennismehl24.com': 'bg-amber-500',
  'datenschutz@tennismehl.com': 'bg-gray-500',
};

const getAccountColor = (email: string): string => {
  return ACCOUNT_COLORS[email] || 'bg-gray-500';
};

const EmailDashboard = () => {
  // State
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [emails, setEmails] = useState<UnifiedEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<UnifiedEmail | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [totalUnread, setTotalUnread] = useState(0);

  // UI State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  // Refs
  const refreshIntervalRef = useRef<number | null>(null);

  // Alle Emails laden (Unified Inbox)
  const loadAllEmails = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);

    try {
      const [emailsData, unreadData, accountsData] = await Promise.all([
        getAllEmails(15), // 15 Emails pro Konto
        getTotalUnreadCount(),
        getAccounts(),
      ]);

      setEmails(emailsData);
      setTotalUnread(unreadData.total);
      setUnreadCounts(unreadData.byAccount);
      setAccounts(accountsData);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Fehler beim Laden:', err);
      setError('Fehler beim Laden der Emails');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial laden
  useEffect(() => {
    loadAllEmails(false);
  }, [loadAllEmails]);

  // Auto-Refresh (alle 15 Sekunden für Kiosk)
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = window.setInterval(() => {
        loadAllEmails(false);
      }, 15000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefresh, loadAllEmails]);

  // Email auswählen und Details laden
  const handleSelectEmail = async (email: UnifiedEmail) => {
    try {
      const fullEmail = await getEmail(email.accountEmail, 'INBOX', email.uid);
      if (fullEmail) {
        setSelectedEmail({
          ...fullEmail,
          accountEmail: email.accountEmail,
          accountName: email.accountName,
        });
      }
    } catch (err) {
      console.error('Email laden Fehler:', err);
    }
  };

  // Gefilterte Emails
  const filteredEmails = emails.filter((email) => {
    // Filter nach Account wenn ausgewählt
    if (viewMode === 'single' && selectedAccount && email.accountEmail !== selectedAccount) {
      return false;
    }

    // Suche
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.subject?.toLowerCase().includes(query) ||
      email.from?.name?.toLowerCase().includes(query) ||
      email.from?.address?.toLowerCase().includes(query) ||
      email.bodyPreview?.toLowerCase().includes(query) ||
      email.accountName?.toLowerCase().includes(query)
    );
  });

  // Datum formatieren
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Gerade eben';
    if (minutes < 60) return `vor ${minutes} Min`;
    if (hours < 24) return `vor ${hours} Std`;
    if (days === 1) return 'Gestern';
    if (days < 7) return date.toLocaleDateString('de-DE', { weekday: 'short' });
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  };

  // Loading State
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <RefreshCw className="w-10 h-10 animate-spin text-teal-600" />
            <span className="text-lg text-gray-600 dark:text-dark-textMuted">
              Lade alle Postfächer...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border mb-4">
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text">
                  Email Dashboard
                </h1>
                <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-dark-textMuted">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {accounts.length} Konten
                  </span>
                  {totalUnread > 0 && (
                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-bold">
                      {totalUnread} neu
                    </span>
                  )}
                  {refreshing && (
                    <RefreshCw className="w-4 h-4 animate-spin text-teal-500" />
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex bg-gray-100 dark:bg-dark-bg rounded-lg p-1">
                <button
                  onClick={() => setViewMode('all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'all'
                      ? 'bg-white dark:bg-dark-surface text-teal-600 shadow-sm'
                      : 'text-gray-600 dark:text-dark-textMuted'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Alle
                </button>
                <button
                  onClick={() => setViewMode('single')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'single'
                      ? 'bg-white dark:bg-dark-surface text-teal-600 shadow-sm'
                      : 'text-gray-600 dark:text-dark-textMuted'
                  }`}
                >
                  <User className="w-4 h-4" />
                  Einzeln
                </button>
              </div>

              {/* Auto-Refresh */}
              <label className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-bg rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-8 h-4 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:bg-green-500 transition-colors">
                  <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${autoRefresh ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-xs text-gray-600 dark:text-dark-textMuted">Live</span>
              </label>

              {/* Refresh Button */}
              <button
                onClick={() => loadAllEmails(true)}
                disabled={refreshing}
                className="p-2 bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Last Refresh */}
          {lastRefresh && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              <span>Aktualisiert: {lastRefresh.toLocaleTimeString('de-DE')}</span>
              {autoRefresh && <span className="text-green-500">(Auto alle 15s)</span>}
            </div>
          )}
        </div>

        {/* Account Filter (nur bei Einzelansicht) */}
        {viewMode === 'single' && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
            {accounts.map((account) => {
              const unread = unreadCounts.get(account.email) || 0;
              const isSelected = selectedAccount === account.email;
              return (
                <button
                  key={account.email}
                  onClick={() => setSelectedAccount(isSelected ? null : account.email)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${getAccountColor(account.email)}`} />
                  {account.name}
                  {unread > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      isSelected ? 'bg-white/20' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    }`}>
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suchen in allen Emails..."
              className="w-full pl-10 pr-10 py-2.5 border border-gray-200 dark:border-dark-border rounded-lg bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-dark-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            Dev-Modus: Mock-Daten werden angezeigt
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex gap-4">
        {/* Email List */}
        <div className={`flex-1 ${selectedEmail ? 'hidden lg:block' : ''}`}>
          <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border overflow-hidden">
            {filteredEmails.length === 0 ? (
              <div className="p-12 text-center">
                <Inbox className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-dark-textMuted text-lg">
                  {searchQuery ? 'Keine Emails gefunden' : 'Keine neuen Emails'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-dark-border max-h-[calc(100vh-280px)] overflow-y-auto">
                {filteredEmails.map((email) => (
                  <button
                    key={`${email.accountEmail}-${email.id}`}
                    onClick={() => handleSelectEmail(email)}
                    className={`w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      !email.isRead ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''
                    } ${selectedEmail?.id === email.id && selectedEmail?.accountEmail === email.accountEmail ? 'bg-teal-100 dark:bg-teal-900/30' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Unread Indicator */}
                      <div className="flex-shrink-0 mt-1">
                        {email.isRead ? (
                          <CheckCircle className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-teal-500 animate-pulse" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Account Badge + Date */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${getAccountColor(email.accountEmail)}`}>
                              {email.accountName}
                            </span>
                            <span className={`truncate text-sm ${!email.isRead ? 'font-semibold' : ''} text-gray-900 dark:text-dark-text`}>
                              {email.from?.name || email.from?.address || 'Unbekannt'}
                            </span>
                          </div>
                          <span className="flex-shrink-0 text-xs text-gray-500 dark:text-dark-textMuted">
                            {formatDate(email.date)}
                          </span>
                        </div>

                        {/* Subject */}
                        <div className={`truncate ${!email.isRead ? 'font-semibold' : ''} text-gray-800 dark:text-gray-200 mb-1`}>
                          {email.subject || '(Kein Betreff)'}
                        </div>

                        {/* Preview */}
                        <div className="text-sm text-gray-500 dark:text-dark-textMuted truncate">
                          {email.bodyPreview}
                        </div>

                        {/* Attachment Badge */}
                        {email.hasAttachments && (
                          <div className="mt-1">
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
          <div className="flex-1 fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto">
            <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-dark-border h-full lg:h-auto lg:max-h-[calc(100vh-280px)] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="p-4 border-b border-gray-200 dark:border-dark-border">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setSelectedEmail(null)}
                    className="flex items-center gap-2 text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                    <span className="lg:hidden">Zurück</span>
                  </button>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium text-white ${getAccountColor(selectedEmail.accountEmail)}`}>
                    {selectedEmail.accountName}
                  </span>
                </div>

                <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text mb-3">
                  {selectedEmail.subject || '(Kein Betreff)'}
                </h2>

                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${getAccountColor(selectedEmail.accountEmail)}`}>
                    {selectedEmail.from?.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-dark-text">
                      {selectedEmail.from?.name || 'Unbekannt'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-dark-textMuted truncate">
                      {selectedEmail.from?.address} → {selectedEmail.accountEmail}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-dark-textMuted">
                    {new Date(selectedEmail.date).toLocaleString('de-DE')}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4">
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
                  <p className="text-gray-500">{selectedEmail.bodyPreview}</p>
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
