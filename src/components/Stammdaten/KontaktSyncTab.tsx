import { useState, useEffect } from 'react';
import { Smartphone, Download, Copy, Check, RefreshCw, Link, Shield, Info, Users, ChevronDown, ChevronUp } from 'lucide-react';

const KontaktSyncTab = () => {
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ anzahl: number; generiert: string } | null>(null);
  const [quelle, setQuelle] = useState<'alle' | 'saison' | 'kunden'>('alle');
  const [nurAktive, setNurAktive] = useState(true);
  const [showIPhoneAnleitung, setShowIPhoneAnleitung] = useState(false);
  const [showAndroidAnleitung, setShowAndroidAnleitung] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Token aus localStorage laden oder generieren
  useEffect(() => {
    const gespeicherterToken = localStorage.getItem('kontakt_sync_token');
    if (gespeicherterToken) {
      setToken(gespeicherterToken);
    } else {
      generiereToken();
    }
  }, []);

  const generiereToken = () => {
    const neuerToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    setToken(neuerToken);
    localStorage.setItem('kontakt_sync_token', neuerToken);
  };

  const getSyncUrl = () => {
    const baseUrl = window.location.origin;
    const params = new URLSearchParams({
      token,
      quelle,
      ...(nurAktive ? {} : { aktiv: 'false' }),
    });
    return `${baseUrl}/.netlify/functions/contacts-sync?${params.toString()}`;
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(getSyncUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = getSyncUrl();
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    window.open(getSyncUrl(), '_blank');
  };

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = getSyncUrl() + '&format=json';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Vorschau');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Smartphone className="h-8 w-8" />
          <h2 className="text-2xl font-bold">Kontakt-Sync</h2>
        </div>
        <p className="text-teal-100">
          Synchronisiere deine Kundenkontakte mit deinem Handy. Wenn jemand anruft, siehst du sofort
          den Namen aus dem Portal.
        </p>
      </div>

      {/* Einstellungen */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-teal-600" />
          Einstellungen
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Quelle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
              Kontakt-Quelle
            </label>
            <select
              value={quelle}
              onChange={(e) => setQuelle(e.target.value as 'alle' | 'saison' | 'kunden')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-teal-500"
            >
              <option value="alle">Alle Kontakte (Saison + Kundenliste)</option>
              <option value="saison">Nur Saisonkunden</option>
              <option value="kunden">Nur Kundenliste (Legacy)</option>
            </select>
          </div>

          {/* Nur Aktive */}
          <div className="flex items-center gap-3 mt-6">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={nurAktive}
                onChange={(e) => setNurAktive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 dark:peer-focus:ring-teal-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-teal-600"></div>
              <span className="ml-3 text-sm font-medium text-gray-700 dark:text-dark-textMuted">
                Nur aktive Kontakte
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Sync-URL & Download */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2">
          <Link className="h-5 w-5 text-teal-600" />
          Sync-URL & Download
        </h3>

        {/* URL Anzeige */}
        <div className="bg-gray-50 dark:bg-dark-bg rounded-lg p-4 mb-4">
          <p className="text-xs text-gray-500 dark:text-dark-textMuted mb-2">Deine persönliche Sync-URL:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-100 dark:bg-dark-surface p-2 rounded font-mono text-gray-800 dark:text-dark-text break-all">
              {getSyncUrl()}
            </code>
            <button
              onClick={handleCopyUrl}
              className="flex-shrink-0 p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              title="URL kopieren"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Aktions-Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
          >
            <Download className="h-4 w-4" />
            VCF herunterladen
          </button>

          <button
            onClick={handlePreview}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border transition-colors font-medium"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Vorschau laden
          </button>
        </div>

        {/* Statistik */}
        {stats && (
          <div className="mt-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
            <p className="text-teal-800 dark:text-teal-200 font-medium">
              {stats.anzahl} Kontakte gefunden
            </p>
            <p className="text-teal-600 dark:text-teal-400 text-sm">
              Generiert: {new Date(stats.generiert).toLocaleString('de-DE')}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Sicherheit */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-teal-600" />
          Sicherheit
        </h3>
        <p className="text-sm text-gray-600 dark:text-dark-textMuted mb-3">
          Die Sync-URL enthält einen geheimen Token. Teile diesen Link nicht mit anderen.
          Falls der Token kompromittiert wird, generiere einen neuen.
        </p>
        <div className="flex items-center gap-3">
          <code className="text-xs bg-gray-100 dark:bg-dark-bg px-3 py-1.5 rounded font-mono text-gray-700 dark:text-dark-text">
            Token: {token.substring(0, 8)}...{token.substring(token.length - 4)}
          </code>
          <button
            onClick={generiereToken}
            className="text-sm px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            Neuen Token generieren
          </button>
        </div>
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Wichtig: Auf dem Server muss die Umgebungsvariable <code>CONTACTS_SYNC_TOKEN</code> auf den
          gleichen Token gesetzt werden, damit die Authentifizierung funktioniert.
        </p>
      </div>

      {/* Anleitungen */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4 flex items-center gap-2">
          <Info className="h-5 w-5 text-teal-600" />
          Einrichtung auf dem Handy
        </h3>

        {/* iPhone Anleitung */}
        <div className="border border-gray-200 dark:border-dark-border rounded-lg mb-3">
          <button
            onClick={() => setShowIPhoneAnleitung(!showIPhoneAnleitung)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
          >
            <span className="font-medium text-gray-900 dark:text-dark-text">
              iPhone / iOS
            </span>
            {showIPhoneAnleitung ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>
          {showIPhoneAnleitung && (
            <div className="px-4 pb-4 space-y-3 text-sm text-gray-700 dark:text-dark-textMuted">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Option 1: Direkter VCF-Import (einfach)</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300">
                  <li>Klicke oben auf &quot;VCF herunterladen&quot;</li>
                  <li>Öffne die heruntergeladene .vcf Datei auf dem iPhone</li>
                  <li>Tippe auf &quot;Alle X Kontakte hinzufügen&quot;</li>
                  <li>Fertig! Wiederhole regelmäßig für aktuelle Daten</li>
                </ol>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <p className="font-semibold text-purple-800 dark:text-purple-200 mb-2">Option 2: Automatischer Sync mit iOS-Kurzbefehl</p>
                <ol className="list-decimal list-inside space-y-1 text-purple-700 dark:text-purple-300">
                  <li>Öffne die &quot;Kurzbefehle&quot;-App auf dem iPhone</li>
                  <li>Erstelle einen neuen Kurzbefehl</li>
                  <li>Füge die Aktion &quot;URL abrufen&quot; hinzu und setze deine Sync-URL ein</li>
                  <li>Füge &quot;Kontakte importieren&quot; als nächste Aktion hinzu</li>
                  <li>Unter &quot;Automation&quot; kannst du den Kurzbefehl z.B. täglich ausführen lassen</li>
                </ol>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="font-semibold text-green-800 dark:text-green-200 mb-2">Option 3: CardDAV (erfordert Server-Setup)</p>
                <ol className="list-decimal list-inside space-y-1 text-green-700 dark:text-green-300">
                  <li>Gehe zu Einstellungen &gt; Kontakte &gt; Accounts</li>
                  <li>Tippe auf &quot;Account hinzufügen&quot; &gt; &quot;Andere&quot;</li>
                  <li>Wähle &quot;CardDAV-Account hinzufügen&quot;</li>
                  <li>Server: deine Domain, Benutzer/Passwort: Token</li>
                  <li>(Erfordert zusätzliches CardDAV-Server-Setup)</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Android Anleitung */}
        <div className="border border-gray-200 dark:border-dark-border rounded-lg">
          <button
            onClick={() => setShowAndroidAnleitung(!showAndroidAnleitung)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
          >
            <span className="font-medium text-gray-900 dark:text-dark-text">
              Android
            </span>
            {showAndroidAnleitung ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>
          {showAndroidAnleitung && (
            <div className="px-4 pb-4 space-y-3 text-sm text-gray-700 dark:text-dark-textMuted">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Option 1: Direkter VCF-Import (einfach)</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300">
                  <li>Klicke oben auf &quot;VCF herunterladen&quot;</li>
                  <li>Öffne die .vcf Datei mit der Kontakte-App</li>
                  <li>Bestätige den Import aller Kontakte</li>
                  <li>Fertig! Wiederhole regelmäßig für aktuelle Daten</li>
                </ol>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <p className="font-semibold text-purple-800 dark:text-purple-200 mb-2">Option 2: Automatischer Sync mit DAVx5</p>
                <ol className="list-decimal list-inside space-y-1 text-purple-700 dark:text-purple-300">
                  <li>Installiere &quot;DAVx5&quot; aus dem Play Store</li>
                  <li>Richte einen CardDAV-Account ein</li>
                  <li>Server-URL: deine Domain</li>
                  <li>Benutzer/Passwort: Token aus diesem Portal</li>
                  <li>(Erfordert zusätzliches CardDAV-Server-Setup)</li>
                </ol>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="font-semibold text-green-800 dark:text-green-200 mb-2">Option 3: Google Kontakte Import</p>
                <ol className="list-decimal list-inside space-y-1 text-green-700 dark:text-green-300">
                  <li>Lade die VCF-Datei herunter</li>
                  <li>Öffne contacts.google.com im Browser</li>
                  <li>Klicke auf &quot;Importieren&quot; und wähle die .vcf Datei</li>
                  <li>Die Kontakte werden automatisch auf dein Android synchronisiert</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hinweise */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200 mb-3">Hinweise</h3>
        <ul className="space-y-2 text-sm text-amber-800 dark:text-amber-300">
          <li>
            <strong>Kategorien:</strong> Alle Kontakte werden mit der Kategorie &quot;TennisMehl24&quot;
            markiert, damit du sie leicht filtern kannst.
          </li>
          <li>
            <strong>Namensformat:</strong> Kontakte werden im Format &quot;Name (Firma)&quot; angelegt,
            z.B. &quot;Max Müller (TC Musterstadt)&quot;.
          </li>
          <li>
            <strong>Duplikate:</strong> Beim erneuten Import werden Kontakte mit gleicher UID aktualisiert.
            Manche Kontakte-Apps erkennen Duplikate automatisch.
          </li>
          <li>
            <strong>Telefonnummern:</strong> Deutsche Nummern werden automatisch ins internationale
            Format (+49...) konvertiert.
          </li>
          <li>
            <strong>Empfehlung:</strong> Am einfachsten ist der VCF-Import über Google Kontakte (Android)
            oder direkt auf dem iPhone. Für automatischen Sync empfehlen wir iOS-Kurzbefehle.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default KontaktSyncTab;
