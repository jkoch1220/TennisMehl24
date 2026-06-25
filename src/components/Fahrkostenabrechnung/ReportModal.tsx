import { useMemo, useState } from 'react';
import { X, Download, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fahrkostenService } from '../../services/fahrkostenService';
import { Fahrt, Person, Firma } from '../../types/fahrtkosten';
import { toISODate } from './dateUtils';
import { generiereFahrtkostenPdf } from './fahrtkostenPdf';

interface ReportModalProps {
  fahrten: Fahrt[];
  personen: Person[];
  firmen: Firma[];
  /** Vorausgewählte Person (Kontext) */
  startPersonId?: string;
  onClose: () => void;
}

export default function ReportModal({ fahrten, personen, firmen, startPersonId, onClose }: ReportModalProps) {
  const heute = toISODate(new Date());
  const monatsStart = heute.substring(0, 8) + '01';

  const [firmaId, setFirmaId] = useState<string>(''); // '' = alle
  const [personId, setPersonId] = useState<string>(startPersonId || ''); // '' = alle
  const [von, setVon] = useState<string>(monatsStart);
  const [bis, setBis] = useState<string>(heute);

  const gefiltert = useMemo(
    () => fahrkostenService.filtereFahrten(fahrten, {
      firmaId: firmaId || undefined,
      personId: personId || undefined,
      von,
      bis,
    }).sort((a, b) => a.datum.localeCompare(b.datum)),
    [fahrten, firmaId, personId, von, bis]
  );

  const gesamtKm = gefiltert.reduce((s, f) => s + f.kilometer, 0);
  const gesamtBetrag = Math.round(gefiltert.reduce((s, f) => s + f.betrag, 0) * 100) / 100;

  // Gruppierung nach Firma für die Anzeige & Export
  const proFirma = useMemo(() => {
    const map = new Map<string, Fahrt[]>();
    gefiltert.forEach(f => {
      const key = f.firmaName || '(ohne Firma)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [gefiltert]);

  const baueSheet = (rows: Fahrt[]) => {
    const data: Record<string, string | number>[] = rows.map((f, i) => ({
      'Nr.': i + 1,
      'Datum': new Date(f.datum).toLocaleDateString('de-DE'),
      'Person': f.personName,
      'Firma': f.firmaName,
      'Start': f.startort,
      'Ziel': f.zielort,
      'Auto': f.autoName || '',
      'Kennzeichen': f.autoKennzeichen || '',
      'km-Stand Start': f.startKm ?? '',
      'km-Stand Ende': f.endKm ?? '',
      'Kilometer': f.kilometer,
      'Pauschale (€/km)': f.kilometerPauschale.toFixed(2),
      'Betrag (€)': f.betrag.toFixed(2),
      'Kommentar': f.kommentar || '',
    }));
    const summeKm = rows.reduce((s, f) => s + f.kilometer, 0);
    const summeBetrag = Math.round(rows.reduce((s, f) => s + f.betrag, 0) * 100) / 100;
    data.push({} as Record<string, string | number>);
    data.push({
      'Nr.': '', 'Datum': '', 'Person': '', 'Firma': '', 'Start': '', 'Ziel': 'GESAMT:',
      'Auto': '', 'Kennzeichen': '', 'km-Stand Start': '', 'km-Stand Ende': '', 'Kilometer': summeKm, 'Pauschale (€/km)': '',
      'Betrag (€)': summeBetrag.toFixed(2), 'Kommentar': `${rows.length} Fahrten`,
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 11 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 10 }, { wch: 14 }, { wch: 11 }, { wch: 24 }];
    return ws;
  };

  const handleExport = () => {
    if (gefiltert.length === 0) return;
    const wb = XLSX.utils.book_new();

    if (firmaId) {
      // Einzelne Firma -> ein Blatt
      XLSX.utils.book_append_sheet(wb, baueSheet(gefiltert), 'Report');
    } else {
      // Alle Firmen -> ein Blatt pro Firma
      proFirma.forEach(([firmaName, rows]) => {
        const safeName = firmaName.replace(/[\\/?*[\]:]/g, '').substring(0, 28) || 'Firma';
        XLSX.utils.book_append_sheet(wb, baueSheet(rows), safeName);
      });
    }

    const firmaLabel = firmaId ? (firmen.find(f => f.id === firmaId)?.name || 'Firma') : 'AlleFirmen';
    const dateiname = `Fahrtkosten_${firmaLabel.replace(/\s+/g, '_')}_${von}_bis_${bis}.xlsx`;
    XLSX.writeFile(wb, dateiname);
  };

  const handlePdf = () => {
    if (gefiltert.length === 0) return;
    generiereFahrtkostenPdf({
      fahrten: gefiltert,
      firmaName: firmaId ? firmen.find(f => f.id === firmaId)?.name : undefined,
      personName: personId ? personen.find(p => p.id === personId)?.name : undefined,
      von,
      bis,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
        <div className="sm:hidden flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Firmen-Report</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Firma */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Firma</label>
            <select
              value={firmaId}
              onChange={e => setFirmaId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            >
              <option value="">Alle Firmen (je ein Blatt)</option>
              {firmen.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          {/* Person */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Person</label>
            <select
              value={personId}
              onChange={e => setPersonId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            >
              <option value="">Alle Personen</option>
              {personen.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Zeitraum */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Von</label>
              <input type="date" value={von} onChange={e => setVon(e.target.value)} className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Bis</label>
              <input type="date" value={bis} onChange={e => setBis(e.target.value)} className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-gray-900 dark:text-white" />
            </div>
          </div>

          {/* Zusammenfassung */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{gefiltert.length}</p>
              <p className="text-xs text-gray-500 dark:text-dark-textMuted">Fahrten</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{gesamtKm}</p>
              <p className="text-xs text-gray-500 dark:text-dark-textMuted">Kilometer</p>
            </div>
            <div>
              <p className="text-xl font-bold text-red-600">{gesamtBetrag.toFixed(2)} €</p>
              <p className="text-xs text-gray-500 dark:text-dark-textMuted">Gesamt</p>
            </div>
          </div>

          {/* Aufschlüsselung pro Firma */}
          {!firmaId && proFirma.length > 0 && (
            <div className="space-y-1">
              {proFirma.map(([name, rows]) => {
                const km = rows.reduce((s, f) => s + f.kilometer, 0);
                const betrag = Math.round(rows.reduce((s, f) => s + f.betrag, 0) * 100) / 100;
                return (
                  <div key={name} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                    <span className="text-gray-700 dark:text-gray-300 truncate">{name}</span>
                    <span className="text-gray-500 dark:text-dark-textMuted flex-shrink-0 ml-2">{rows.length} · {km} km · <span className="font-medium text-red-600">{betrag.toFixed(2)} €</span></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t dark:border-dark-border flex gap-3">
          <button
            type="button"
            onClick={handlePdf}
            disabled={gefiltert.length === 0}
            className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <FileText className="w-5 h-5" /> PDF (Abrechnung)
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={gefiltert.length === 0}
            className="flex-1 py-3 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" /> Excel
          </button>
        </div>
      </div>
    </div>
  );
}
