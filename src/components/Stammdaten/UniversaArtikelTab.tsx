import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Search, ArrowUpDown, AlertCircle, CheckCircle2, FileSpreadsheet, Package, Loader2, Truck, ChevronDown, Plus, Pencil } from 'lucide-react';
import { UniversalArtikel, ImportProgress } from '../../types/universaArtikel';
import {
  getAlleUniversalArtikel,
  sucheUniversalArtikel,
  loescheAlleUniversalArtikel,
  importiereExcel,
  importiereArtikellisteExcel,
  aktualisiereUniversalArtikel,
  loescheUniversalArtikel,
} from '../../services/universaArtikelService';
import UniversalArtikelDialog from './UniversalArtikelDialog';

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
  const artikellisteInputRef = useRef<HTMLInputElement>(null);

  // Import-Dropdown State
  const [showImportDropdown, setShowImportDropdown] = useState(false);

  // Dialog für Einzel-Anlage/Bearbeitung
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogArtikel, setDialogArtikel] = useState<UniversalArtikel | null>(null);

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

  // Dialog öffnen (neu oder bearbeiten)
  const handleNeuAnlegen = () => {
    setDialogArtikel(null);
    setDialogOpen(true);
  };

  const handleBearbeiten = (art: UniversalArtikel) => {
    setDialogArtikel(art);
    setDialogOpen(true);
  };

  const handleDialogSaved = (art: UniversalArtikel) => {
    setArtikel((prev) => {
      const idx = prev.findIndex((a) => a.$id === art.$id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = art;
        return copy;
      }
      return [art, ...prev];
    });
    if (!dialogArtikel) {
      setTotal((t) => t + 1);
    }
    setImportStatus('success');
    setImportMessage(dialogArtikel ? `Artikel "${art.artikelnummer}" aktualisiert` : `Artikel "${art.artikelnummer}" angelegt`);
  };

  // Einzelnen Artikel löschen
  const handleEinzelLoeschen = async (art: UniversalArtikel) => {
    if (!art.$id) return;
    if (!confirm(`Artikel "${art.artikelnummer} – ${art.bezeichnung}" wirklich löschen?`)) return;
    try {
      await loescheUniversalArtikel(art.$id);
      setArtikel((prev) => prev.filter((a) => a.$id !== art.$id));
      setTotal((t) => Math.max(0, t - 1));
      setImportStatus('success');
      setImportMessage(`Artikel "${art.artikelnummer}" gelöscht`);
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      setImportStatus('error');
      setImportMessage('Fehler beim Löschen des Artikels');
    }
  };

  // Toggle ohneMwSt für einzelnen Artikel
  const handleToggleOhneMwSt = async (artikelId: string, aktuellerWert: boolean) => {
    try {
      await aktualisiereUniversalArtikel(artikelId, { ohneMwSt: !aktuellerWert });
      // Lokalen State aktualisieren
      setArtikel(prev => prev.map(art =>
        art.$id === artikelId ? { ...art, ohneMwSt: !aktuellerWert } : art
      ));
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      alert('Fehler beim Speichern der Einstellung');
    }
  };

  // Progress-Callback für Import
  const handleImportProgress = useCallback((progress: ImportProgress) => {
    setImportProgress(progress);
    setImportMessage(progress.message);
  }, []);

  // Excel-Upload (Preisliste - ersetzt alle Artikel)
  const handlePreislisteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowImportDropdown(false);

    // Dateiendung prüfen
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setImportStatus('error');
      setImportMessage('Bitte eine Excel-Datei (.xlsx oder .xls) auswählen');
      return;
    }

    setImportStatus('uploading');
    setImportMessage('Starte Preislisten-Import...');
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

  // Artikelliste-Upload (Versand/Zoll-Daten - merged mit bestehenden)
  const handleArtikellisteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowImportDropdown(false);

    // Dateiendung prüfen
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setImportStatus('error');
      setImportMessage('Bitte eine Excel-Datei (.xlsx oder .xls) auswählen');
      return;
    }

    setImportStatus('uploading');
    setImportMessage('Starte Artikellisten-Import (Versand/Zoll)...');
    setImportDetails([]);
    setImportProgress(null);

    try {
      const result = await importiereArtikellisteExcel(file, handleImportProgress);

      const neuErstellt = result.erfolg;
      const aktualisiert = result.aktualisiert || 0;

      if (neuErstellt > 0 || aktualisiert > 0) {
        setImportStatus('success');
        const messages: string[] = [];
        if (aktualisiert > 0) messages.push(`${aktualisiert} Artikel aktualisiert`);
        if (neuErstellt > 0) messages.push(`${neuErstellt} neue Artikel erstellt`);
        setImportMessage(messages.join(', '));

        if (result.fehler > 0) {
          setImportDetails([
            `${result.fehler} Artikel konnten nicht verarbeitet werden`,
            ...result.fehlermeldungen,
          ]);
        }
        // Liste neu laden
        setPage(0);
        ladeArtikel();
      } else if (result.fehler > 0) {
        setImportStatus('error');
        setImportMessage('Import fehlgeschlagen');
        setImportDetails(result.fehlermeldungen);
      } else {
        setImportStatus('success');
        setImportMessage('Keine Änderungen - alle Artikel sind bereits aktuell');
      }
    } catch (error: any) {
      setImportStatus('error');
      setImportMessage('Fehler beim Import: ' + (error?.message || 'Unbekannter Fehler'));
    }

    setImportProgress(null);

    // File-Input zurücksetzen
    if (artikellisteInputRef.current) {
      artikellisteInputRef.current.value = '';
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

            {/* Neu anlegen Button */}
            <button
              onClick={handleNeuAnlegen}
              disabled={importStatus === 'uploading'}
              className={`flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg transition-colors whitespace-nowrap ${
                importStatus === 'uploading' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'
              }`}
            >
              <Plus className="h-4 w-4" />
              Artikel anlegen
            </button>

            {/* Excel-Import Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowImportDropdown(!showImportDropdown)}
                disabled={importStatus === 'uploading'}
                className={`flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg transition-colors whitespace-nowrap ${
                  importStatus === 'uploading' ? 'opacity-50 cursor-not-allowed' : 'hover:from-orange-600 hover:to-red-700'
                }`}
              >
                <Upload className="h-4 w-4" />
                Excel importieren
                <ChevronDown className={`h-4 w-4 transition-transform ${showImportDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showImportDropdown && (
                <>
                  {/* Backdrop zum Schließen */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowImportDropdown(false)}
                  />

                  {/* Dropdown-Menü */}
                  <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 z-20 overflow-hidden">
                    {/* Preisliste Import */}
                    <label className="block p-4 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-200 dark:border-slate-700 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg flex-shrink-0">
                          <FileSpreadsheet className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">Preisliste importieren</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Großhändler-/Katalogpreise aus der Universal Preisliste. <span className="text-red-500 font-medium">Ersetzt alle Artikel!</span>
                          </div>
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handlePreislisteUpload}
                        className="hidden"
                      />
                    </label>

                    {/* Artikelliste Import (Versand/Zoll) */}
                    <label className="block p-4 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex-shrink-0">
                          <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">Artikelliste importieren</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Versand-, Zoll- und Maßdaten ergänzen. <span className="text-green-600 font-medium">Preise bleiben erhalten!</span>
                          </div>
                        </div>
                      </div>
                      <input
                        ref={artikellisteInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleArtikellisteUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </>
              )}
            </div>

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
          <div className="flex flex-wrap items-center justify-center gap-3">
            <label className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-colors cursor-pointer">
              <Upload className="h-5 w-5" />
              Excel-Preisliste hochladen
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handlePreislisteUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={handleNeuAnlegen}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Einzelnen Artikel anlegen
            </button>
          </div>
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
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                        Versand DE
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                        ohne MwSt
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-dark-textMuted uppercase tracking-wider">
                        Aktionen
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
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          {art.versandcodeDE ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                art.versandartDE === 'gls'
                                  ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                  : art.versandartDE === 'spedition'
                                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                  : art.versandartDE === 'anfrage'
                                  ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                                  : 'bg-gray-100 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300'
                              }`}
                              title={`Versandcode: ${art.versandcodeDE}${art.gewichtKg ? ` | Gewicht: ${art.gewichtKg} kg` : ''}${art.istSperrgut ? ' | Sperrgut' : ''}`}
                            >
                              {art.versandartDE === 'gls' && <Truck className="h-3 w-3" />}
                              {art.versandartDE === 'spedition' && <Package className="h-3 w-3" />}
                              {art.versandartDE === 'anfrage' && <AlertCircle className="h-3 w-3" />}
                              {art.versandcodeDE}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <input
                            type="checkbox"
                            checked={art.ohneMwSt || false}
                            onChange={() => handleToggleOhneMwSt(art.$id!, art.ohneMwSt || false)}
                            className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-slate-600 rounded cursor-pointer"
                            title="Artikel ist bereits Brutto (keine MwSt hinzufügen)"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleBearbeiten(art)}
                              className="p-1.5 text-gray-500 hover:text-orange-600 dark:text-dark-textMuted dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                              title="Bearbeiten"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleEinzelLoeschen(art)}
                              className="p-1.5 text-gray-500 hover:text-red-600 dark:text-dark-textMuted dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                              title="Löschen"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
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
      <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-lg p-4 space-y-3">
        <p className="text-sm text-orange-800 dark:text-orange-300">
          <strong>Zwei Import-Modi verfügbar:</strong>
        </p>
        <ul className="text-sm text-orange-800 dark:text-orange-300 space-y-2 ml-4">
          <li>
            <strong>📊 Preisliste:</strong> Großhändler-/Katalogpreise importieren. <span className="text-red-600 dark:text-red-400">Achtung: Ersetzt alle Artikel!</span>
          </li>
          <li>
            <strong>🚚 Artikelliste:</strong> Versand-, Zoll- und Maßdaten ergänzen. Preise bleiben erhalten - ideal für die "Artikelliste 2026" von Universal.
          </li>
        </ul>
        <p className="text-xs text-orange-600 dark:text-orange-400">
          Versandcodes: 3x = GLS DE, 4x = GLS AT, 5x = GLS Benelux, 2x = Spedition, F.a.A. = Fracht auf Anfrage
        </p>
      </div>

      {/* Dialog für Neuanlage/Bearbeitung einzelner Artikel */}
      <UniversalArtikelDialog
        open={dialogOpen}
        artikel={dialogArtikel}
        onClose={() => setDialogOpen(false)}
        onSaved={handleDialogSaved}
      />
    </div>
  );
};

export default UniversalArtikelTab;
