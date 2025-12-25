import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Search, ArrowUpDown, AlertCircle, CheckCircle2, FileSpreadsheet, Package, Loader2 } from 'lucide-react';
import { UniversalArtikel, ImportProgress } from '../../types/universaArtikel';
import {
  getAlleUniversalArtikel,
  sucheUniversalArtikel,
  loescheAlleUniversalArtikel,
  importiereExcel,
} from '../../services/universaArtikelService';

type SortField = 'artikelnummer' | 'bezeichnung' | 'katalogPreisBrutto';

const UniversalArtikelTab = () => {
  const [artikel, setArtikel] = useState<UniversalArtikel[]>([]);
  const [loading, setLoading] = useState(true);
  const [suchtext, setSuchtext] = useState('');
  const [sortField, setSortField] = useState<SortField>('artikelnummer');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  // Import State mit Fortschritt
  const [importStatus, setImportStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState<string>('');
  const [importDetails, setImportDetails] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Artikel laden
  const ladeArtikel = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAlleUniversalArtikel(sortField, pageSize, page * pageSize);
      setArtikel(result.artikel);
      setTotal(result.total);
    } catch (error) {
      console.error('Fehler beim Laden der Universal-Artikel:', error);
    } finally {
      setLoading(false);
    }
  }, [sortField, page, pageSize]);

  useEffect(() => {
    if (!suchtext.trim()) {
      ladeArtikel();
    }
  }, [sortField, page, ladeArtikel, suchtext]);

  // Suche
  const handleSuche = async (text: string) => {
    setSuchtext(text);
    if (!text.trim()) {
      ladeArtikel();
      return;
    }

    setLoading(true);
    try {
      const ergebnisse = await sucheUniversalArtikel(text);
      setArtikel(ergebnisse);
      setTotal(ergebnisse.length);
    } catch (error) {
      console.error('Fehler bei der Suche:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sortierung ändern
  const handleSortieren = (field: SortField) => {
    setSortField(field);
    setPage(0);
  };

  // Progress-Callback für Import
  const handleImportProgress = useCallback((progress: ImportProgress) => {
    setImportProgress(progress);
    setImportMessage(progress.message);
  }, []);

  // Excel-Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Dateiendung prüfen
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setImportStatus('error');
      setImportMessage('Bitte eine Excel-Datei (.xlsx oder .xls) auswählen');
      return;
    }

    setImportStatus('uploading');
    setImportMessage('Starte Import...');
    setImportDetails([]);
    setImportProgress(null);

    try {
      const result = await importiereExcel(file, true, handleImportProgress);

      if (result.erfolg > 0) {
        setImportStatus('success');
        setImportMessage(`${result.erfolg} Artikel erfolgreich importiert`);
        if (result.fehler > 0) {
          setImportDetails([
            `${result.fehler} Artikel konnten nicht importiert werden`,
            ...result.fehlermeldungen,
          ]);
        }
        // Liste neu laden
        setPage(0);
        ladeArtikel();
      } else {
        setImportStatus('error');
        setImportMessage('Import fehlgeschlagen');
        setImportDetails(result.fehlermeldungen);
      }
    } catch (error: any) {
      setImportStatus('error');
      setImportMessage('Fehler beim Import: ' + (error?.message || 'Unbekannter Fehler'));
    }

    setImportProgress(null);

    // File-Input zurücksetzen
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Alle Artikel löschen
  const handleAlleLoeschen = async () => {
    if (!confirm('Möchten Sie wirklich ALLE Universal-Artikel löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return;
    }

    setImportStatus('uploading');
    setImportMessage('Lösche Artikel...');
    setImportProgress(null);

    try {
      const geloescht = await loescheAlleUniversalArtikel((progress) => {
        setImportProgress(progress);
        setImportMessage(progress.message);
      });
      setImportStatus('success');
      setImportMessage(`${geloescht} Artikel gelöscht`);
      setArtikel([]);
      setTotal(0);
    } catch (error: any) {
      setImportStatus('error');
      setImportMessage('Fehler beim Löschen: ' + (error?.message || 'Unbekannter Fehler'));
    } finally {
      setImportProgress(null);
    }
  };

  // Status nach einiger Zeit ausblenden (nur bei Erfolg/Fehler, nicht während des Uploads)
  useEffect(() => {
    if (importStatus === 'success' || importStatus === 'error') {
      const timer = setTimeout(() => {
        setImportStatus('idle');
        setImportMessage('');
        setImportDetails([]);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [importStatus]);

  // Fortschrittsbalken berechnen
  const progressPercent = importProgress
    ? Math.round((importProgress.current / Math.max(importProgress.total, 1)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header mit Upload und Suche */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg">
                <Package className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Universal Artikel</h2>
            </div>
            <p className="text-gray-600 dark:text-dark-textMuted text-sm">
              Artikelkatalog von Universal Sport GmbH - Import aus Excel-Preisliste
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Suchfeld */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={suchtext}
                onChange={(e) => handleSuche(e.target.value)}
                placeholder="Artikel suchen..."
                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent w-full sm:w-64 bg-white dark:bg-slate-800 text-gray-900 dark:text-dark-text"
                disabled={importStatus === 'uploading'}
              />
            </div>

            {/* Excel-Upload Button */}
            <label className={`flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg transition-colors whitespace-nowrap ${
              importStatus === 'uploading' ? 'opacity-50 cursor-not-allowed' : 'hover:from-orange-600 hover:to-red-700 cursor-pointer'
            }`}>
              <Upload className="h-4 w-4" />
              Excel importieren
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                disabled={importStatus === 'uploading'}
              />
            </label>

            {/* Alle löschen Button */}
            {total > 0 && importStatus !== 'uploading' && (
              <button
                onClick={handleAlleLoeschen}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
              >
                <Trash2 className="h-4 w-4" />
                Alle löschen
              </button>
            )}
          </div>
        </div>

        {/* Statistik */}
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-600 dark:text-dark-textMuted">
          <span className="flex items-center gap-1">
            <FileSpreadsheet className="h-4 w-4" />
            {total} Artikel insgesamt
          </span>
          {artikel[0]?.importDatum && (
            <span>
              Letzter Import: {new Date(artikel[0].importDatum).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>

      {/* Import Status mit Fortschrittsbalken */}
      {importStatus !== 'idle' && (
        <div
          className={`rounded-xl p-4 ${
            importStatus === 'uploading'
              ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800'
              : importStatus === 'success'
              ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800'
          }`}
        >
          <div className="flex items-start gap-3">
            {importStatus === 'uploading' && (
              <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0 mt-0.5" />
            )}
            {importStatus === 'success' && (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            )}
            {importStatus === 'error' && (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p
                className={`font-medium ${
                  importStatus === 'uploading'
                    ? 'text-blue-800 dark:text-blue-300'
                    : importStatus === 'success'
                    ? 'text-green-800 dark:text-green-300'
                    : 'text-red-800 dark:text-red-300'
                }`}
              >
                {importMessage}
              </p>

              {/* Fortschrittsbalken während des Imports */}
              {importStatus === 'uploading' && importProgress && (
                <div className="mt-3 space-y-2">
                  {/* Phase-Anzeige */}
                  <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                    <span className="capitalize">
                      {importProgress.phase === 'parsing' && '📄 Excel verarbeiten'}
                      {importProgress.phase === 'deleting' && '🗑️ Alte Artikel löschen'}
                      {importProgress.phase === 'importing' && '📥 Artikel importieren'}
                      {importProgress.phase === 'done' && '✓ Abgeschlossen'}
                    </span>
                    <span className="ml-auto font-mono">
                      {importProgress.current}/{importProgress.total}
                    </span>
                  </div>

                  {/* Progress-Bar */}
                  <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Prozent-Anzeige */}
                  <div className="text-right text-sm font-semibold text-blue-800 dark:text-blue-300">
                    {progressPercent}%
                  </div>
                </div>
              )}

              {importDetails.length > 0 && (
                <ul className="mt-2 text-sm space-y-1">
                  {importDetails.map((detail, i) => (
                    <li key={i} className="text-gray-700 dark:text-dark-textMuted">
                      {detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info-Box für leere Liste */}
      {!loading && artikel.length === 0 && !suchtext && importStatus === 'idle' && (
        <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/40 dark:to-red-950/40 border border-orange-200 dark:border-orange-800 rounded-xl p-8 text-center">
          <FileSpreadsheet className="h-16 w-16 text-orange-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-2">
            Keine Universal-Artikel vorhanden
          </h3>
          <p className="text-gray-600 dark:text-dark-textMuted mb-4 max-w-md mx-auto">
            Laden Sie die Universal Sport Großhändler-/Katalogpreisliste als Excel-Datei hoch,
            um die Artikel zu importieren. Der Import unterstützt auch große Dateien mit 700+ Artikeln.
          </p>
          <label className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-colors cursor-pointer">
            <Upload className="h-5 w-5" />
            Excel-Preisliste hochladen
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Artikel-Liste */}
      {(artikel.length > 0 || suchtext) && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-600 dark:text-dark-textMuted flex items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              Lade Artikel...
            </div>
          ) : artikel.length === 0 ? (
            <div className="p-8 text-center text-gray-600 dark:text-dark-textMuted">
              Keine Artikel gefunden
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <button
                          onClick={() => handleSortieren('artikelnummer')}
                          className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider hover:text-orange-600"
                        >
                          Art.-Nr.
                          {sortField === 'artikelnummer' && <ArrowUpDown className="h-3 w-3" />}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button
                          onClick={() => handleSortieren('bezeichnung')}
                          className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider hover:text-orange-600"
                        >
                          Bezeichnung
                          {sortField === 'bezeichnung' && <ArrowUpDown className="h-3 w-3" />}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                        VE
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                        GH-Preis
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                        Katalog Netto
                      </th>
                      <th className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleSortieren('katalogPreisBrutto')}
                          className="flex items-center gap-2 ml-auto text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider hover:text-orange-600"
                        >
                          Katalog Brutto
                          {sortField === 'katalogPreisBrutto' && <ArrowUpDown className="h-3 w-3" />}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                        Seite
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {artikel.map((art) => (
                      <tr key={art.$id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-dark-text">{art.artikelnummer}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-900 dark:text-dark-text">{art.bezeichnung}</span>
                          {art.aenderungen && art.aenderungen.trim() !== '' && (
                            <span className="ml-2 text-xs text-red-600 dark:text-red-400">(geändert)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm text-gray-600 dark:text-dark-textMuted">{art.verpackungseinheit}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="text-sm text-gray-900 dark:text-dark-text">
                            {art.grosshaendlerPreisNetto.toFixed(2)} €
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="text-sm text-gray-600 dark:text-dark-textMuted">
                            {art.katalogPreisNetto.toFixed(2)} €
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                            {art.katalogPreisBrutto.toFixed(2)} €
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span className="text-sm text-gray-600 dark:text-dark-textMuted">
                            {art.seiteKatalog || '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginierung */}
              {!suchtext && total > pageSize && (
                <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="text-sm text-gray-600 dark:text-dark-textMuted">
                    Zeige {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} von {total} Artikeln
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-dark-text"
                    >
                      Zurück
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={(page + 1) * pageSize >= total}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-dark-text"
                    >
                      Weiter
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Info-Box */}
      <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
        <p className="text-sm text-orange-800 dark:text-orange-300">
          <strong>Hinweis:</strong> Der Import ersetzt alle vorhandenen Universal-Artikel mit den Daten aus der Excel-Datei.
          Die Preisliste von Universal Sport kann direkt hochgeladen werden - das System erkennt automatisch das Format
          und importiert auch große Dateien mit 700+ Artikeln zuverlässig.
        </p>
      </div>
    </div>
  );
};

export default UniversalArtikelTab;
