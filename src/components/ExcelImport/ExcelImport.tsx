import { useState, useCallback } from 'react';
import {
  Upload,
  Mail,
  Copy,
  Check,
  FileSpreadsheet,
  X,
  AlertCircle,
  AlertTriangle,
  Send,
  RefreshCw,
  CheckCircle,
  Users
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { newsletterService } from '../../services/newsletterService';
import { NewsletterBulkImportResult } from '../../types/newsletter';

interface ExtractedData {
  emails: string[];
  invalidEmails: string[];
  duplicatesRemoved: number;
  totalFound: number;
  fileName: string;
}

const ExcelImport = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showInvalid, setShowInvalid] = useState(false);
  const [importResult, setImportResult] = useState<NewsletterBulkImportResult | null>(null);
  const [importTags, setImportTags] = useState('');

  // E-Mail-Regex für Validierung
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  // E-Mail aus Text extrahieren
  const extractEmail = (text: string): string | null => {
    if (!text || typeof text !== 'string') return null;

    // Erst mailto:-Links extrahieren
    let processed = text;
    const mailtoMatch = text.match(/mailto:([^\s?&]+)/i);
    if (mailtoMatch) {
      processed = mailtoMatch[1];
    }

    let cleaned = processed.trim().toLowerCase();
    cleaned = cleaned.replace(/^[<"']+|[>"']+$/g, '');
    cleaned = cleaned.replace(/,([a-z]{2,4})$/i, '.$1');
    cleaned = cleaned.replace(/\.{2,}/g, '.');
    cleaned = cleaned.replace(/\s/g, '');

    if (emailRegex.test(cleaned)) {
      return cleaned;
    }
    return null;
  };

  // Excel-Datei verarbeiten - NUR E-Mails
  const processExcelFile = useCallback((file: File) => {
    setLoading(true);
    setError(null);
    setExtractedData(null);
    setImportResult(null);

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        const allEmails: string[] = [];
        const allInvalidEmails: string[] = [];
        const seenEmails = new Set<string>();

        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

          jsonData.forEach((row) => {
            if (!Array.isArray(row)) return;

            row.forEach((cell) => {
              if (cell && typeof cell === 'string') {
                const email = extractEmail(cell);
                if (email) {
                  if (!seenEmails.has(email)) {
                    seenEmails.add(email);
                    allEmails.push(email);
                  }
                } else if (cell.includes('@')) {
                  // Hat @ aber ist ungültig
                  const cleaned = cell.trim().toLowerCase();
                  if (!allInvalidEmails.includes(cleaned)) {
                    allInvalidEmails.push(cleaned);
                  }
                }
              }
            });
          });
        });

        // Sortieren nach Email
        allEmails.sort((a, b) => a.localeCompare(b));

        setExtractedData({
          emails: allEmails,
          invalidEmails: allInvalidEmails.sort(),
          duplicatesRemoved: 0, // Duplikate bereits beim Hinzufügen gefiltert
          totalFound: allEmails.length,
          fileName: file.name
        });
      } catch (err) {
        console.error('Excel parsing error:', err);
        setError('Fehler beim Lesen der Excel-Datei. Bitte prüfen Sie das Format.');
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Fehler beim Lesen der Datei.');
      setLoading(false);
    };

    reader.readAsBinaryString(file);
  }, []);

  // IN NEWSLETTER IMPORTIEREN
  const handleImportToNewsletter = async () => {
    if (!extractedData || extractedData.emails.length === 0) return;

    setImporting(true);
    setError(null);

    try {
      const result = await newsletterService.bulkImport(
        extractedData.emails,
        'excel-import',
        importTags || undefined
      );
      setImportResult(result);
    } catch (err) {
      console.error('Import error:', err);
      setError('Fehler beim Import in die Newsletter-Liste.');
    } finally {
      setImporting(false);
    }
  };

  // Drag & Drop Handler
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        processExcelFile(file);
      } else {
        setError('Bitte nur Excel-Dateien (.xlsx, .xls) hochladen.');
      }
    }
  }, [processExcelFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processExcelFile(files[0]);
    }
  }, [processExcelFile]);

  // Alle Emails kopieren
  const handleCopyAll = useCallback(() => {
    if (extractedData) {
      navigator.clipboard.writeText(extractedData.emails.join('; '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [extractedData]);

  // Reset
  const handleReset = useCallback(() => {
    setExtractedData(null);
    setError(null);
    setShowInvalid(false);
    setImportResult(null);
    setImportTags('');
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text">
              Excel Import
            </h1>
            <p className="text-gray-600 dark:text-dark-textMuted">
              E-Mail-Adressen aus Excel importieren
            </p>
          </div>
        </div>
      </div>

      {/* Drop Zone */}
      {!extractedData && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
            isDragging
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-green-400 dark:hover:border-green-500 bg-white dark:bg-dark-surface'
          }`}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
              <p className="text-gray-600 dark:text-dark-textMuted">
                Verarbeite Excel-Datei...
              </p>
            </div>
          ) : (
            <>
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 transition-colors ${
                isDragging ? 'bg-green-100 dark:bg-green-800' : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                <Upload className={`w-8 h-8 ${isDragging ? 'text-green-600' : 'text-gray-400'}`} />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-2">
                Excel-Datei hierher ziehen
              </h3>
              <p className="text-gray-600 dark:text-dark-textMuted mb-4">
                oder klicken um Datei auszuwählen
              </p>

              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              <div className="flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>.xlsx, .xls</span>
                </div>
                <div className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  <span>Alle E-Mails werden erkannt</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 dark:text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-800 rounded"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Results */}
      {extractedData && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-dark-border overflow-hidden">
            {/* Stats Header */}
            <div className="p-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Mail className="w-6 h-6" />
                  <h2 className="text-xl font-bold">
                    {importResult ? 'Import abgeschlossen!' : 'E-Mails gefunden'}
                  </h2>
                </div>
                <button
                  onClick={handleReset}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  title="Neue Datei"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {importResult ? (
                // Import-Ergebnis anzeigen
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/20 rounded-xl p-3">
                    <div className="text-2xl font-bold text-green-200">{importResult.imported}</div>
                    <div className="text-xs opacity-90">Neu importiert</div>
                  </div>
                  <div className="bg-white/20 rounded-xl p-3">
                    <div className="text-2xl font-bold text-amber-200">{importResult.duplicates}</div>
                    <div className="text-xs opacity-90">Bereits vorhanden</div>
                  </div>
                  <div className="bg-white/20 rounded-xl p-3">
                    <div className="text-2xl font-bold text-red-200">{importResult.invalid}</div>
                    <div className="text-xs opacity-90">Ungültig</div>
                  </div>
                  <div className="bg-white/20 rounded-xl p-3">
                    <div className="text-2xl font-bold">{extractedData.emails.length}</div>
                    <div className="text-xs opacity-90">Gesamt geprüft</div>
                  </div>
                </div>
              ) : (
                // Vorschau anzeigen
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white/20 rounded-xl p-3 sm:p-4">
                    <div className="text-2xl sm:text-3xl font-bold">{extractedData.emails.length}</div>
                    <div className="text-xs sm:text-sm opacity-90">E-Mails gefunden</div>
                  </div>
                  <div className="bg-white/20 rounded-xl p-3 sm:p-4">
                    <div className="text-2xl sm:text-3xl font-bold">{extractedData.invalidEmails.length}</div>
                    <div className="text-xs sm:text-sm opacity-90">Ungültige</div>
                  </div>
                  <div className="bg-white/20 rounded-xl p-3 sm:p-4 col-span-2 sm:col-span-1">
                    <div className="text-2xl sm:text-3xl font-bold">{extractedData.fileName}</div>
                    <div className="text-xs sm:text-sm opacity-90">Datei</div>
                  </div>
                </div>
              )}
            </div>

            {/* Import Success Message */}
            {importResult && importResult.imported > 0 && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-300">
                    {importResult.imported} neue Empfänger importiert
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Alles in der Newsletter-Verwaltung sichtbar.
                  </p>
                </div>
              </div>
            )}

            {/* Import Actions - nur wenn noch nicht importiert */}
            {!importResult && (
              <div className="p-4 border-b border-gray-200 dark:border-dark-border bg-purple-50 dark:bg-purple-900/20">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tags für Import (optional)
                    </label>
                    <input
                      type="text"
                      value={importTags}
                      onChange={(e) => setImportTags(e.target.value)}
                      placeholder="z.B. newsletter-2024, vereine"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleImportToNewsletter}
                    disabled={importing || extractedData.emails.length === 0}
                    className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg whitespace-nowrap"
                  >
                    {importing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Importiere...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        In Newsletter importieren
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-3 text-xs text-purple-600 dark:text-purple-400">
                  Duplikate werden automatisch erkannt und übersprungen.
                </p>
              </div>
            )}

            {/* Quick Actions */}
            <div className="p-4 border-b border-gray-200 dark:border-dark-border flex flex-wrap gap-2">
              <button
                onClick={handleCopyAll}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  copied
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Kopiert!' : 'Alle Emails kopieren'}
              </button>

              {importResult && (
                <a
                  href="/newsletter"
                  className="flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Zur Newsletter-Verwaltung
                </a>
              )}
            </div>

            {/* Email List */}
            <div className="max-h-80 overflow-y-auto p-4">
              <div className="grid gap-1">
                {extractedData.emails.map((email, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-dark-bg rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                  >
                    <span className="text-xs text-gray-400 w-8 text-right">{index + 1}.</span>
                    <span className="text-gray-900 dark:text-dark-text font-mono text-sm flex-1">
                      {email}
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(email)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all"
                      title="Kopieren"
                    >
                      <Copy className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
              <button
                onClick={handleReset}
                className="w-full py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-xl transition-colors"
              >
                Neue Datei importieren
              </button>
            </div>
          </div>

          {/* Invalid Emails Warning */}
          {extractedData.invalidEmails.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowInvalid(!showInvalid)}
                className="w-full p-4 flex items-center gap-3 text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
              >
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-amber-800 dark:text-amber-300">
                    {extractedData.invalidEmails.length} ungültige E-Mail-Adressen gefunden
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Klicken zum {showInvalid ? 'Ausblenden' : 'Anzeigen'}
                  </p>
                </div>
              </button>

              {showInvalid && (
                <div className="px-4 pb-4 max-h-48 overflow-y-auto">
                  <div className="grid gap-1">
                    {extractedData.invalidEmails.map((email, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 px-3 py-1.5 bg-amber-100/50 dark:bg-amber-900/30 rounded-lg text-sm font-mono text-amber-800 dark:text-amber-300"
                      >
                        {email}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExcelImport;
