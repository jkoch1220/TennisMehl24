import { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Search, ArrowUpDown, AlertCircle, CheckCircle2, FileSpreadsheet, Package, Loader2 } from 'lucide-react';
import { UniversaArtikel } from '../../types/universaArtikel';
import {
  getAlleUniversaArtikel,
  sucheUniversaArtikel,
  loescheAlleUniversaArtikel,
  importiereExcel,
} from '../../services/universaArtikelService';

type SortField = 'artikelnummer' | 'bezeichnung' | 'katalogPreisBrutto';

const UniversaArtikelTab = () => {
  const [artikel, setArtikel] = useState<UniversaArtikel[]>([]);
  const [loading, setLoading] = useState(true);
  const [suchtext, setSuchtext] = useState('');
  const [sortField, setSortField] = useState<SortField>('artikelnummer');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  // Import State
  const [importStatus, setImportStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState<string>('');
  const [importDetails, setImportDetails] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Artikel laden
  const ladeArtikel = async () => {
    setLoading(true);
    try {
      const result = await getAlleUniversaArtikel(sortField, pageSize, page * pageSize);
      setArtikel(result.artikel);
      setTotal(result.total);
    } catch (error) {
      console.error('Fehler beim Laden der Universa-Artikel:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!suchtext.trim()) {
      ladeArtikel();
    }
  }, [sortField, page]);

  // Suche
  const handleSuche = async (text: string) => {
    setSuchtext(text);
    if (!text.trim()) {
      ladeArtikel();
      return;
    }

    setLoading(true);
    try {
      const ergebnisse = await sucheUniversaArtikel(text);
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
    setImportMessage('Importiere Artikel...');
    setImportDetails([]);

    try {
      const result = await importiereExcel(file, true); // true = alle ersetzen

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

    // File-Input zurücksetzen
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Alle Artikel löschen
  const handleAlleLoeschen = async () => {
    if (!confirm('Möchten Sie wirklich ALLE Universa-Artikel löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return;
    }

    setLoading(true);
    try {
      const geloescht = await loescheAlleUniversaArtikel();
      setImportStatus('success');
      setImportMessage(`${geloescht} Artikel gelöscht`);
      setArtikel([]);
      setTotal(0);
    } catch (error: any) {
      setImportStatus('error');
      setImportMessage('Fehler beim Löschen: ' + (error?.message || 'Unbekannter Fehler'));
    } finally {
      setLoading(false);
    }
  };

  // Status nach einiger Zeit ausblenden
  useEffect(() => {
    if (importStatus === 'success' || importStatus === 'error') {
      const timer = setTimeout(() => {
        setImportStatus('idle');
        setImportMessage('');
        setImportDetails([]);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [importStatus]);

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
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Universa Artikel</h2>
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
              />
            </div>

            {/* Excel-Upload Button */}
            <label className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-colors cursor-pointer whitespace-nowrap">
              <Upload className="h-4 w-4" />
              Excel importieren
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* Alle löschen Button */}
            {total > 0 && (
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

      {/* Import Status */}
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
      {!loading && artikel.length === 0 && !suchtext && (
        <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/40 dark:to-red-950/40 border border-orange-200 dark:border-orange-800 rounded-xl p-8 text-center">
          <FileSpreadsheet className="h-16 w-16 text-orange-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-2">
            Keine Universa-Artikel vorhanden
          </h3>
          <p className="text-gray-600 dark:text-dark-textMuted mb-4 max-w-md mx-auto">
            Laden Sie die Universa Großhändler-/Katalogpreisliste als Excel-Datei hoch,
            um die Artikel zu importieren.
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
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700"
                    >
                      Zurück
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={(page + 1) * pageSize >= total}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700"
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
          <strong>Hinweis:</strong> Der Import ersetzt alle vorhandenen Universa-Artikel mit den Daten aus der Excel-Datei.
          Die Preisliste von Universal Sport kann direkt hochgeladen werden - das System erkennt automatisch das Format.
        </p>
      </div>
    </div>
  );
};

export default UniversaArtikelTab;
