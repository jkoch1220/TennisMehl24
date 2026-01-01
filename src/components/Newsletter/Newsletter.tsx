import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Mail,
  Users,
  UserMinus,
  UserPlus,
  Copy,
  Check,
  Search,
  Upload,
  Trash2,
  Edit3,
  Link,
  X,
  AlertCircle,
  RefreshCw,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { newsletterService } from '../../services/newsletterService';
import { NewsletterSubscriber, NewsletterStats, NewsletterBulkImportResult } from '../../types/newsletter';

type FilterStatus = 'all' | 'active' | 'unsubscribed';

const Newsletter = () => {
  // State
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [stats, setStats] = useState<NewsletterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingSubscriber, setEditingSubscriber] = useState<NewsletterSubscriber | null>(null);

  // Form State
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Import State
  const [importEmails, setImportEmails] = useState<string[]>([]);
  const [importTags, setImportTags] = useState('');
  const [importResult, setImportResult] = useState<NewsletterBulkImportResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Daten laden
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subs, statistics] = await Promise.all([
        newsletterService.loadAllSubscribers(),
        newsletterService.getStats()
      ]);
      setSubscribers(subs);
      setStats(statistics);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Gefilterte Subscribers
  const filteredSubscribers = useMemo(() => {
    return subscribers.filter(sub => {
      // Status-Filter
      if (filterStatus === 'active' && sub.status !== 'active') return false;
      if (filterStatus === 'unsubscribed' && sub.status !== 'unsubscribed') return false;

      // Suche
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchEmail = sub.email.toLowerCase().includes(term);
        const matchName = sub.name?.toLowerCase().includes(term);
        const matchTags = sub.tags?.toLowerCase().includes(term);
        if (!matchEmail && !matchName && !matchTags) return false;
      }

      return true;
    });
  }, [subscribers, filterStatus, searchTerm]);

  // Abmeldelink kopieren
  const copyUnsubscribeLink = useCallback((subscriber: NewsletterSubscriber) => {
    const link = newsletterService.generateUnsubscribeLink(subscriber.unsubscribeToken);
    navigator.clipboard.writeText(link);
    setCopiedId(subscriber.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Subscriber hinzufügen
  const handleAddSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      await newsletterService.createSubscriber({
        email: newEmail,
        name: newName || undefined,
        tags: newTags || undefined,
        notes: newNotes || undefined,
        source: 'manual',
      });

      setNewEmail('');
      setNewName('');
      setNewTags('');
      setNewNotes('');
      setShowAddModal(false);
      await loadData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Fehler beim Speichern');
    } finally {
      setFormLoading(false);
    }
  };

  // Subscriber aktualisieren
  const handleUpdateSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubscriber) return;

    setFormError('');
    setFormLoading(true);

    try {
      await newsletterService.updateSubscriber(editingSubscriber.id, {
        email: newEmail,
        name: newName || undefined,
        tags: newTags || undefined,
        notes: newNotes || undefined,
      });

      setEditingSubscriber(null);
      setNewEmail('');
      setNewName('');
      setNewTags('');
      setNewNotes('');
      await loadData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Fehler beim Speichern');
    } finally {
      setFormLoading(false);
    }
  };

  // Subscriber löschen
  const handleDelete = async (id: string) => {
    if (!confirm('Subscriber wirklich löschen?')) return;

    try {
      await newsletterService.deleteSubscriber(id);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  };

  // Reaktivieren
  const handleResubscribe = async (id: string) => {
    try {
      await newsletterService.resubscribe(id);
      await loadData();
    } catch (error) {
      console.error('Fehler beim Reaktivieren:', error);
    }
  };

  // Edit Modal öffnen
  const openEditModal = (subscriber: NewsletterSubscriber) => {
    setEditingSubscriber(subscriber);
    setNewEmail(subscriber.email);
    setNewName(subscriber.name || '');
    setNewTags(subscriber.tags || '');
    setNewNotes(subscriber.notes || '');
    setFormError('');
  };

  // Modal schließen
  const closeModal = () => {
    setShowAddModal(false);
    setEditingSubscriber(null);
    setNewEmail('');
    setNewName('');
    setNewTags('');
    setNewNotes('');
    setFormError('');
  };

  // Excel Import
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const extractEmailsFromText = (text: string): string[] => {
    const emails: string[] = [];
    const parts = text.split(/[;,\s\n]+/);
    parts.forEach(part => {
      let cleaned = part.trim().toLowerCase();
      cleaned = cleaned.replace(/^[<"']+|[>"']+$/g, '');
      if (emailRegex.test(cleaned)) {
        emails.push(cleaned);
      }
    });
    return emails;
  };

  const processExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const allEmails: string[] = [];

        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
          jsonData.forEach(row => {
            if (Array.isArray(row)) {
              row.forEach(cell => {
                if (cell && typeof cell === 'string') {
                  const found = extractEmailsFromText(cell);
                  allEmails.push(...found);
                }
              });
            }
          });
        });

        const unique = [...new Set(allEmails)].sort();
        setImportEmails(unique);
        setImportResult(null);
      } catch (err) {
        console.error('Excel parsing error:', err);
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && (files[0].name.endsWith('.xlsx') || files[0].name.endsWith('.xls'))) {
      processExcelFile(files[0]);
    }
  }, [processExcelFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processExcelFile(files[0]);
    }
  }, [processExcelFile]);

  const handleImport = async () => {
    if (importEmails.length === 0) return;

    setImportLoading(true);
    try {
      const result = await newsletterService.bulkImport(importEmails, 'excel-import', importTags || undefined);
      setImportResult(result);
      await loadData();
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setImportLoading(false);
    }
  };

  // Export als Excel (alle Daten)
  const exportToExcel = useCallback(() => {
    const data = filteredSubscribers.map(sub => ({
      Email: sub.email,
      Name: sub.name || '',
      Status: sub.status === 'active' ? 'Aktiv' : 'Abgemeldet',
      Tags: sub.tags || '',
      'Angemeldet am': new Date(sub.subscribedAt).toLocaleDateString('de-DE'),
      'Abgemeldet am': sub.unsubscribedAt ? new Date(sub.unsubscribedAt).toLocaleDateString('de-DE') : '',
      Quelle: sub.source || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Newsletter');
    XLSX.writeFile(wb, `newsletter_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  }, [filteredSubscribers]);

  // SERIENMAIL EXPORT - Nur aktive mit Abmeldelink!
  const exportForSerienmail = useCallback(() => {
    const activeSubscribers = subscribers.filter(s => s.status === 'active');

    const data = activeSubscribers.map(sub => ({
      Email: sub.email,
      Name: sub.name || '',
      Vorname: sub.name ? sub.name.split(' ')[0] : '',
      Abmeldelink: newsletterService.generateUnsubscribeLink(sub.unsubscribeToken),
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    // Spaltenbreiten anpassen
    ws['!cols'] = [
      { wch: 35 }, // Email
      { wch: 25 }, // Name
      { wch: 15 }, // Vorname
      { wch: 60 }, // Abmeldelink
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Serienmail');
    XLSX.writeFile(wb, `serienmail_empfaenger_${new Date().toISOString().split('T')[0]}.xlsx`);
  }, [subscribers]);

  // Alle aktiven Emails kopieren
  const copyAllActiveEmails = useCallback(() => {
    const activeEmails = subscribers
      .filter(s => s.status === 'active')
      .map(s => s.email)
      .join('; ');
    navigator.clipboard.writeText(activeEmails);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2000);
  }, [subscribers]);

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
              <Mail className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text">
                Newsletter-Verwaltung
              </h1>
              <p className="text-gray-600 dark:text-dark-textMuted">
                Empfänger verwalten & Abmeldelinks
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Excel Import</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Hinzufügen</span>
            </button>
            <button
              onClick={loadData}
              className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              title="Aktualisieren"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 dark:text-gray-300 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.totalSubscribers}</p>
                <p className="text-xs text-gray-500 dark:text-dark-textMuted">Gesamt</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <UserPlus className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.activeSubscribers}</p>
                <p className="text-xs text-gray-500 dark:text-dark-textMuted">Aktiv</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <UserMinus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.unsubscribedSubscribers}</p>
                <p className="text-xs text-gray-500 dark:text-dark-textMuted">Abgemeldet</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.recentUnsubscribes}</p>
                <p className="text-xs text-gray-500 dark:text-dark-textMuted">30-Tage Abm.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Suche nach Email, Name oder Tags..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'all'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Alle
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'active'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Aktiv
            </button>
            <button
              onClick={() => setFilterStatus('unsubscribed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'unsubscribed'
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Abgemeldet
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportForSerienmail}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-600 hover:to-indigo-700 transition-all shadow-md"
              title="Excel für Serienmails mit Abmeldelinks"
            >
              <Mail className="w-4 h-4" />
              <span className="hidden lg:inline">Serienmail Export</span>
              <span className="lg:hidden">Serienmail</span>
            </button>
            <button
              onClick={copyAllActiveEmails}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                copiedId === 'all'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
              }`}
              title="Alle aktiven Emails kopieren"
            >
              {copiedId === 'all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="hidden md:inline">Emails kopieren</span>
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="Kompletter Export als Excel"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Subscriber List */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-2" />
            <p className="text-gray-500 dark:text-dark-textMuted">Lade Subscribers...</p>
          </div>
        ) : filteredSubscribers.length === 0 ? (
          <div className="p-8 text-center">
            <Mail className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-dark-textMuted">
              {searchTerm || filterStatus !== 'all'
                ? 'Keine Subscribers gefunden'
                : 'Noch keine Newsletter-Subscribers'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-dark-border">
            {filteredSubscribers.map((subscriber) => (
              <div
                key={subscriber.id}
                className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                  subscriber.status === 'unsubscribed' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 dark:text-dark-text truncate">
                        {subscriber.email}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                          subscriber.status === 'active'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}
                      >
                        {subscriber.status === 'active' ? 'Aktiv' : 'Abgemeldet'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-dark-textMuted">
                      {subscriber.name && (
                        <span>{subscriber.name}</span>
                      )}
                      <span>
                        Seit {new Date(subscriber.subscribedAt).toLocaleDateString('de-DE')}
                      </span>
                      {subscriber.source && (
                        <span className="inline-flex items-center gap-1">
                          {subscriber.source === 'excel-import' && <FileSpreadsheet className="w-3 h-3" />}
                          {subscriber.source === 'manual' && <Edit3 className="w-3 h-3" />}
                          {subscriber.source}
                        </span>
                      )}
                      {subscriber.tags && (
                        <span className="text-purple-600 dark:text-purple-400">
                          #{subscriber.tags}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyUnsubscribeLink(subscriber)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        copiedId === subscriber.id
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                      }`}
                      title="Abmeldelink kopieren"
                    >
                      {copiedId === subscriber.id ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span className="hidden sm:inline">Kopiert!</span>
                        </>
                      ) : (
                        <>
                          <Link className="w-4 h-4" />
                          <span className="hidden sm:inline">Abmeldelink</span>
                        </>
                      )}
                    </button>

                    {subscriber.status === 'unsubscribed' && (
                      <button
                        onClick={() => handleResubscribe(subscriber.id)}
                        className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                        title="Wieder aktivieren"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => openEditModal(subscriber)}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(subscriber.id)}
                      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer mit Anzahl */}
        {filteredSubscribers.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg border-t border-gray-200 dark:border-dark-border text-sm text-gray-500 dark:text-dark-textMuted">
            {filteredSubscribers.length} von {subscribers.length} Subscribers angezeigt
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingSubscriber) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
                {editingSubscriber ? 'Subscriber bearbeiten' : 'Neuer Subscriber'}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={editingSubscriber ? handleUpdateSubscriber : handleAddSubscriber} className="p-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  E-Mail *
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="email@beispiel.de"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Max Mustermann"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tags (optional)
                </label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="verein, 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notizen (optional)
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Interne Notizen..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {formLoading ? 'Speichern...' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-green-500" />
                Excel Import
              </h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportEmails([]);
                  setImportResult(null);
                  setImportTags('');
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              {importResult ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                    <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">Import abgeschlossen!</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                        <p className="text-green-700 dark:text-green-400">Importiert</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600">{importResult.duplicates}</p>
                        <p className="text-amber-700 dark:text-amber-400">Duplikate</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-600">{importResult.invalid}</p>
                        <p className="text-red-700 dark:text-red-400">Ungültig</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportEmails([]);
                      setImportResult(null);
                      setImportTags('');
                    }}
                    className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-semibold transition-colors"
                  >
                    Schließen
                  </button>
                </div>
              ) : importEmails.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                    <p className="font-semibold text-blue-800 dark:text-blue-300">
                      {importEmails.length} E-Mail-Adressen gefunden
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                      Prüfen Sie die Liste und starten Sie den Import.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tags für alle (optional)
                    </label>
                    <input
                      type="text"
                      value={importTags}
                      onChange={(e) => setImportTags(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="newsletter-2024"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {importEmails.slice(0, 50).map((email, i) => (
                        <div key={i} className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300">
                          {email}
                        </div>
                      ))}
                      {importEmails.length > 50 && (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                          ... und {importEmails.length - 50} weitere
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setImportEmails([]);
                        setImportTags('');
                      }}
                      className="flex-1 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Andere Datei
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={importLoading}
                      className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {importLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Importiere...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Importieren
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    isDragging
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                  }`}
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileInput}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />

                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
                    isDragging ? 'bg-green-100' : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <Upload className={`w-8 h-8 ${isDragging ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-2">
                    Excel-Datei hierher ziehen
                  </h3>
                  <p className="text-gray-600 dark:text-dark-textMuted mb-4">
                    oder klicken um Datei auszuwählen
                  </p>

                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Unterstützt: .xlsx, .xls</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Newsletter;
