import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Link2,
  Link2Off,
  ExternalLink,
  Search,
  Calendar,
  AlertCircle,
  Wallet,
  Key,
  CheckCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { bankingService } from '../../services/bankingService';
import type {
  AccountSummary,
  BankTransaction,
  Requisition,
} from '../../types/banking';

type TabId = 'uebersicht' | 'transaktionen' | 'verbindung';

const Kontouebersicht = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('uebersicht');

  // Setup
  const [setupSecretId, setSetupSecretId] = useState('');
  const [setupSecretKey, setSetupSecretKey] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSuccess, setSetupSuccess] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  // Bankverbindung
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Kontodaten
  const [summary, setSummary] = useState<AccountSummary | null>(null);

  // Filter
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<'alle' | 'eingaenge' | 'ausgaben'>('alle');

  // ─── Daten laden ──────────────────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    try {
      const status = await bankingService.getStatus();
      setConfigured(status.configured);
      return status.configured;
    } catch {
      setConfigured(false);
      return false;
    }
  }, []);

  const loadRequisitions = useCallback(async () => {
    try {
      const data = await bankingService.getRequisitions();
      const linked = (data.results || []).filter((r) => r.status === 'LN');
      setRequisitions(linked);
      return linked;
    } catch {
      setRequisitions([]);
      return [];
    }
  }, []);

  const loadAccountSummary = useCallback(async (accountId: string) => {
    try {
      const data = await bankingService.getAccountSummary(accountId);
      setSummary(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Kontodaten');
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isConfigured = await loadStatus();
      if (!isConfigured) {
        setLoading(false);
        return;
      }

      const linked = await loadRequisitions();
      if (linked.length > 0 && linked[0].accounts.length > 0) {
        const accId = linked[0].accounts[0];
        setActiveAccountId(accId);
        await loadAccountSummary(accId);
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [loadStatus, loadRequisitions, loadAccountSummary]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ─── Bankverbindung herstellen ────────────────────────────────────────────

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectUrl = `${window.location.origin}/kontouebersicht?connected=true`;
      const result = await bankingService.connect(redirectUrl);
      // User zur Bank weiterleiten
      window.location.href = result.link;
    } catch (err: any) {
      setError(err.message || 'Fehler beim Verbinden');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (requisitionId: string) => {
    if (!confirm('Bankverbindung wirklich trennen?')) return;
    try {
      await bankingService.disconnect(requisitionId);
      setActiveAccountId(null);
      setSummary(null);
      await loadRequisitions();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Trennen');
    }
  };

  // ─── Nach Bank-Redirect: Requisition prüfen ──────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      // URL bereinigen
      window.history.replaceState({}, '', window.location.pathname);
      // Daten neu laden (Bank sollte jetzt verbunden sein)
      loadAll();
    }
  }, [loadAll]);

  // ─── Konto wechseln ──────────────────────────────────────────────────────

  const handleAccountChange = async (accountId: string) => {
    setActiveAccountId(accountId);
    setLoading(true);
    await loadAccountSummary(accountId);
    setLoading(false);
  };

  // ─── Hilfsfunktionen ─────────────────────────────────────────────────────

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const getKontostand = (): number => {
    if (!summary?.kontostand?.length) return 0;
    // Bevorzuge "closingBooked", dann "interimAvailable"
    const closing = summary.kontostand.find((b) => b.balanceType === 'closingBooked');
    const interim = summary.kontostand.find((b) => b.balanceType === 'interimAvailable');
    const balance = closing || interim || summary.kontostand[0];
    return parseFloat(balance.balanceAmount.amount);
  };

  const getFilteredTransactions = (): BankTransaction[] => {
    if (!summary?.transaktionen) return [];
    let filtered = summary.transaktionen;

    // Typ-Filter
    if (filterType === 'eingaenge') {
      filtered = filtered.filter((t) => parseFloat(t.transactionAmount.amount) > 0);
    } else if (filterType === 'ausgaben') {
      filtered = filtered.filter((t) => parseFloat(t.transactionAmount.amount) < 0);
    }

    // Suchfilter
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter((t) => {
        const text = [
          t.creditorName,
          t.debtorName,
          t.remittanceInformationUnstructured,
          ...(t.remittanceInformationUnstructuredArray || []),
          t.additionalInformation,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return text.includes(search);
      });
    }

    return filtered;
  };

  const getTransactionDescription = (tx: BankTransaction): string => {
    return (
      tx.remittanceInformationUnstructured ||
      tx.remittanceInformationUnstructuredArray?.join(' ') ||
      tx.additionalInformation ||
      'Keine Beschreibung'
    );
  };

  // ─── Setup: GoCardless konfigurieren ────────────────────────────────────

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupLoading(true);
    setSetupError(null);
    setSetupSuccess(false);
    try {
      await bankingService.setup(setupSecretId.trim(), setupSecretKey.trim());
      setSetupSuccess(true);
      setConfigured(true);
      // Nach 2 Sekunden alles neu laden
      setTimeout(() => {
        loadAll();
      }, 2000);
    } catch (err: any) {
      setSetupError(err.message || 'Fehler bei der Konfiguration');
    } finally {
      setSetupLoading(false);
    }
  };

  // ─── Nicht konfiguriert → Setup-Formular ──────────────────────────────────

  if (!loading && !configured) {
    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 mb-6">
            Kontoübersicht einrichten
          </h1>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <Landmark className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
                    GoCardless Bank Account Data
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400">
                    Kostenloser, PSD2-gesicherter Read-Only Zugriff auf dein VR Bank Konto
                  </p>
                </div>
              </div>
            </div>

            {/* Anleitung */}
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <h3 className="font-medium text-gray-900 dark:text-slate-100 mb-3">
                So richtest du die Bankanbindung ein:
              </h3>
              <ol className="space-y-3 text-sm text-gray-600 dark:text-slate-400">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                    1
                  </span>
                  <span>
                    Erstelle einen kostenlosen Account bei{' '}
                    <a
                      href="https://gocardless.com/bank-account-data/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      GoCardless Bank Account Data
                    </a>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                    2
                  </span>
                  <span>
                    Gehe in dein GoCardless Dashboard zu <strong>User Secrets</strong> und erstelle
                    ein neues Secret-Paar
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                    3
                  </span>
                  <span>Trage die Secret ID und den Secret Key unten ein</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                    4
                  </span>
                  <span>
                    Verbinde anschließend dein VR Bank Konto über die sichere PSD2-Schnittstelle
                  </span>
                </li>
              </ol>
            </div>

            {/* Formular */}
            <form onSubmit={handleSetup} className="p-6 space-y-4">
              {setupSuccess && (
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                    Erfolgreich konfiguriert! Lade Kontodaten...
                  </p>
                </div>
              )}

              {setupError && (
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <p className="text-sm text-red-700 dark:text-red-300">{setupError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Secret ID
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={setupSecretId}
                    onChange={(e) => setSetupSecretId(e.target.value)}
                    placeholder="z.B. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Secret Key
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showSecretKey ? 'text' : 'password'}
                    value={setupSecretKey}
                    onChange={(e) => setSetupSecretKey(e.target.value)}
                    placeholder="Dein GoCardless Secret Key"
                    className="w-full pl-10 pr-12 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={setupLoading || !setupSecretId.trim() || !setupSecretKey.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {setupLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    Wird geprüft...
                  </>
                ) : (
                  <>
                    <Key className="w-5 h-5" />
                    Konfiguration speichern & testen
                  </>
                )}
              </button>
            </form>

            {/* Hinweis */}
            <div className="px-6 pb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Die Credentials werden sicher im Backend gespeichert und nie an den Browser
                  übertragen. GoCardless bietet bis zu 50 Bankkonten kostenlos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-slate-400">Lade Kontodaten...</p>
        </div>
      </div>
    );
  }

  // ─── Keine Bankverbindung ─────────────────────────────────────────────────

  if (requisitions.length === 0 || !activeAccountId) {
    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 mb-6">
            Kontoübersicht
          </h1>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-slate-700 text-center">
            <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full w-fit mx-auto mb-4">
              <Landmark className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-2">
              Bankkonto verbinden
            </h2>
            <p className="text-gray-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
              Verbinde dein VR Bank Konto um Kontostand, Eingänge und Ausgänge direkt im Portal zu
              sehen. Die Verbindung ist read-only und PSD2-gesichert.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto disabled:opacity-50"
            >
              {connecting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                <Link2 className="w-5 h-5" />
              )}
              {connecting ? 'Verbinde...' : 'VR Bank verbinden'}
            </button>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-4">
              Du wirst zur VR Bank weitergeleitet um dich sicher anzumelden
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Hauptansicht ─────────────────────────────────────────────────────────

  const kontostand = getKontostand();
  const transactions = getFilteredTransactions();

  const tabs: { id: TabId; label: string; color: string }[] = [
    { id: 'uebersicht', label: 'Übersicht', color: 'blue' },
    { id: 'transaktionen', label: 'Transaktionen', color: 'indigo' },
    { id: 'verbindung', label: 'Verbindung', color: 'gray' },
  ];

  // Alle verfügbaren Konten
  const alleKonten = requisitions.flatMap((r) =>
    r.accounts.map((accId) => ({ accountId: accId, requisitionId: r.id }))
  );

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">
              Kontoübersicht
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">
              {summary?.konto?.ownerName || 'VR Bank'}{' '}
              {summary?.konto?.iban && (
                <span className="font-mono text-sm">
                  {summary.konto.iban.replace(/(.{4})/g, '$1 ').trim()}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            {/* Konto-Wechsler (wenn mehrere Konten) */}
            {alleKonten.length > 1 && (
              <select
                value={activeAccountId}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="border border-gray-300 dark:border-slate-700 rounded-lg px-4 py-2 bg-white dark:bg-slate-800 text-sm font-medium text-gray-900 dark:text-slate-100"
              >
                {alleKonten.map((k, i) => (
                  <option key={k.accountId} value={k.accountId}>
                    Konto {i + 1}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={loadAll}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Aktualisieren
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700 overflow-x-auto pb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? `bg-${tab.color}-100 dark:bg-${tab.color}-900/30 text-${tab.color}-700 dark:text-${tab.color}-400 border-b-2 border-${tab.color}-500`
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Übersicht Tab ───────────────────────────────────────────────── */}
        {activeTab === 'uebersicht' && summary && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Kontostand */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Kontostand</p>
                    <p
                      className={`text-2xl font-bold mt-1 ${
                        kontostand >= 0
                          ? 'text-gray-900 dark:text-slate-100'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatCurrency(kontostand)}
                    </p>
                    {summary.kontostand[0]?.referenceDate && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                        Stand: {formatDate(summary.kontostand[0].referenceDate)}
                      </p>
                    )}
                  </div>
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <Wallet className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </div>

              {/* Eingänge */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Eingänge (30 Tage)</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                      +{formatCurrency(summary.zusammenfassung.eingaenge)}
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <ArrowDownLeft className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </div>

              {/* Ausgaben */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Ausgaben (30 Tage)</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                      -{formatCurrency(summary.zusammenfassung.ausgaben)}
                    </p>
                  </div>
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                    <ArrowUpRight className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </div>

              {/* Saldo 30 Tage */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Saldo (30 Tage)</p>
                    <p
                      className={`text-2xl font-bold mt-1 ${
                        summary.zusammenfassung.saldo >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {summary.zusammenfassung.saldo >= 0 ? '+' : ''}
                      {formatCurrency(summary.zusammenfassung.saldo)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                      {summary.zusammenfassung.anzahlTransaktionen} Buchungen
                    </p>
                  </div>
                  <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
                    <TrendingUp className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Letzte Transaktionen (Quick Preview) */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
              <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  Letzte Buchungen
                </h2>
                <button
                  onClick={() => setActiveTab('transaktionen')}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  Alle anzeigen
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-slate-700">
                {(summary.transaktionen || []).slice(0, 10).map((tx, i) => {
                  const amount = parseFloat(tx.transactionAmount.amount);
                  const isIncoming = amount > 0;
                  return (
                    <div
                      key={tx.transactionId || tx.internalTransactionId || i}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-2 rounded-full flex-shrink-0 ${
                              isIncoming
                                ? 'bg-green-100 dark:bg-green-900/30'
                                : 'bg-red-100 dark:bg-red-900/30'
                            }`}
                          >
                            {isIncoming ? (
                              <ArrowDownLeft className="w-4 h-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-red-600 dark:text-red-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-slate-100 truncate">
                              {isIncoming ? tx.debtorName : tx.creditorName || 'Unbekannt'}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-slate-400 truncate">
                              {getTransactionDescription(tx)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <p
                            className={`font-bold ${
                              isIncoming
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {isIncoming ? '+' : ''}
                            {formatCurrency(amount)}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-slate-500">
                            {formatDate(tx.bookingDate)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!summary.transaktionen || summary.transaktionen.length === 0) && (
                  <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                    Keine Transaktionen im Zeitraum
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Transaktionen Tab ───────────────────────────────────────────── */}
        {activeTab === 'transaktionen' && (
          <div className="space-y-4">
            {/* Filter */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Suche nach Name, Verwendungszweck..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2">
                {(['alle', 'eingaenge', 'ausgaben'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filterType === type
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {type === 'alle' ? 'Alle' : type === 'eingaenge' ? 'Eingänge' : 'Ausgaben'}
                  </button>
                ))}
              </div>
            </div>

            {/* Zeitraum */}
            {summary?.zeitraum && (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Zeitraum: {formatDate(summary.zeitraum.von)} - {formatDate(summary.zeitraum.bis)} |{' '}
                {transactions.length} Buchungen
              </p>
            )}

            {/* Transaktionsliste */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 divide-y divide-gray-200 dark:divide-slate-700">
              {transactions.map((tx, i) => {
                const amount = parseFloat(tx.transactionAmount.amount);
                const isIncoming = amount > 0;
                return (
                  <div
                    key={tx.transactionId || tx.internalTransactionId || i}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`p-2 rounded-full flex-shrink-0 mt-0.5 ${
                            isIncoming
                              ? 'bg-green-100 dark:bg-green-900/30'
                              : 'bg-red-100 dark:bg-red-900/30'
                          }`}
                        >
                          {isIncoming ? (
                            <ArrowDownLeft className="w-4 h-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-slate-100">
                            {isIncoming ? tx.debtorName : tx.creditorName || 'Unbekannt'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                            {getTransactionDescription(tx)}
                          </p>
                          {(isIncoming ? tx.debtorAccount?.iban : tx.creditorAccount?.iban) && (
                            <p className="text-xs text-gray-400 dark:text-slate-500 font-mono mt-1">
                              {isIncoming ? tx.debtorAccount?.iban : tx.creditorAccount?.iban}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p
                          className={`font-bold ${
                            isIncoming
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {isIncoming ? '+' : ''}
                          {formatCurrency(amount)}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                          {formatDate(tx.bookingDate)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {transactions.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                  {searchText || filterType !== 'alle'
                    ? 'Keine Transaktionen mit diesem Filter'
                    : 'Keine Transaktionen im Zeitraum'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Verbindung Tab ──────────────────────────────────────────────── */}
        {activeTab === 'verbindung' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">
                Aktive Bankverbindungen
              </h2>
              <div className="space-y-4">
                {requisitions.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 border border-gray-200 dark:border-slate-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                        <Link2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-slate-100">
                          {req.institution_id}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                          {req.accounts.length} Konto{req.accounts.length !== 1 ? 'en' : ''} |
                          Verbunden am {formatDate(req.created)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDisconnect(req.id)}
                      className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Link2Off className="w-4 h-4" />
                      Trennen
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700">
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Link2 className="w-4 h-4" />
                  Weiteres Konto verbinden
                </button>
              </div>
            </div>

            {/* API-Konfiguration */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">
                API-Konfiguration
              </h2>
              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <Key className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-slate-100">
                      GoCardless Credentials
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Konfiguriert und aktiv
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (confirm('API-Konfiguration zurücksetzen? Die Bankverbindung bleibt bestehen.')) {
                      await bankingService.resetSetup();
                      setConfigured(false);
                    }
                  }}
                  className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  Zurücksetzen
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                Über die Bankanbindung
              </h3>
              <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                <li>Die Verbindung nutzt PSD2 (EU-Regulierung) für sicheren Read-Only Zugriff</li>
                <li>Es werden nur Kontostände und Transaktionen gelesen - keine Überweisungen</li>
                <li>Die Verbindung ist 90 Tage gültig und muss dann erneuert werden</li>
                <li>Anbieter: GoCardless Bank Account Data (ehem. Nordigen)</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Kontouebersicht;
