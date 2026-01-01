import { useState } from 'react';
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  Eye,
  FileDown,
  Calendar,
  Clock,
  User,
  Folder,
  Beaker,
} from 'lucide-react';
import { Siebanalyse, SiebanalyseFilter } from '../../types/qualitaetssicherung';
import { generateQSPruefbericht } from '../../utils/qsPdfHelpers';
import { ladeStammdaten } from '../../services/stammdatenService';

interface Props {
  analysen: Siebanalyse[];
  filter: SiebanalyseFilter;
  onFilterChange: (filter: SiebanalyseFilter) => void;
  onEdit: (analyse: Siebanalyse) => void;
  onDelete: (id: string) => void;
  onSelect: (analyse: Siebanalyse) => void;
}

export default function ProbenListe({
  analysen,
  filter,
  onFilterChange,
  onEdit,
  onDelete,
  onSelect,
}: Props) {
  const [showFilter, setShowFilter] = useState(false);

  const handleExportPDF = async (analyse: Siebanalyse, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const stammdaten = await ladeStammdaten();
      await generateQSPruefbericht(analyse, stammdaten);
    } catch (error) {
      console.error('Fehler beim PDF-Export:', error);
      alert('Fehler beim Erstellen des PDF-Prüfberichts');
    }
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
      {/* Suchleiste und Filter */}
      <div className="p-4 border-b border-gray-200 dark:border-dark-border">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Suche */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Suche nach Chargen-Nr., Kunde, Projekt..."
              value={filter.suche || ''}
              onChange={(e) => onFilterChange({ ...filter, suche: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              showFilter
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </button>
        </div>

        {/* Filter-Optionen */}
        {showFilter && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Ergebnis-Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  Ergebnis
                </label>
                <select
                  value={filter.ergebnis || 'alle'}
                  onChange={(e) =>
                    onFilterChange({ ...filter, ergebnis: e.target.value as 'alle' | 'bestanden' | 'nicht_bestanden' })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text"
                >
                  <option value="alle">Alle</option>
                  <option value="bestanden">Bestanden</option>
                  <option value="nicht_bestanden">Nicht bestanden</option>
                </select>
              </div>

              {/* Zeitraum-Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  Zeitraum
                </label>
                <select
                  value={filter.zeitraum || 'alle'}
                  onChange={(e) =>
                    onFilterChange({
                      ...filter,
                      zeitraum: e.target.value as 'heute' | 'woche' | 'monat' | 'jahr' | 'alle',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text"
                >
                  <option value="alle">Alle</option>
                  <option value="heute">Heute</option>
                  <option value="woche">Letzte 7 Tage</option>
                  <option value="monat">Dieser Monat</option>
                  <option value="jahr">Dieses Jahr</option>
                </select>
              </div>

              {/* Reset */}
              <div className="flex items-end">
                <button
                  onClick={() => onFilterChange({ ergebnis: 'alle', zeitraum: 'alle' })}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-dark-text"
                >
                  Filter zurücksetzen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabelle */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-dark-bg">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                Chargen-Nr.
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                Datum
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider hidden md:table-cell">
                Kunde / Projekt
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                Ergebnis
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {analysen.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500 dark:text-dark-textMuted">
                  Keine Siebanalysen gefunden
                </td>
              </tr>
            ) : (
              analysen.map((analyse) => (
                <tr
                  key={analyse.id}
                  className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  onClick={() => onSelect(analyse)}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900 dark:text-dark-text">
                      {analyse.chargenNummer}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-textMuted">
                        <Calendar className="h-4 w-4" />
                        {new Date(analyse.pruefDatum).toLocaleDateString('de-DE')}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-textMuted">
                        <Clock className="h-3 w-3" />
                        {new Date(analyse.pruefDatum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="space-y-1">
                      {analyse.kundeName && (
                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-dark-textMuted">
                          <User className="h-3 w-3" />
                          {analyse.kundeName}
                        </div>
                      )}
                      {analyse.projektName && (
                        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-dark-textMuted">
                          <Folder className="h-3 w-3" />
                          {analyse.projektName}
                        </div>
                      )}
                      {!analyse.kundeName && !analyse.projektName && (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {analyse.ergebnis === 'mischprobe' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">
                        <Beaker className="h-3 w-3" />
                        Mischprobe
                      </span>
                    ) : analyse.ergebnis === 'bestanden' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                        <CheckCircle className="h-3 w-3" />
                        Bestanden
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
                        <XCircle className="h-3 w-3" />
                        Nicht best.
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(analyse);
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Anzeigen"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => handleExportPDF(analyse, e)}
                        className="p-1.5 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors"
                        title="PDF exportieren"
                      >
                        <FileDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(analyse);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="Bearbeiten"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(analyse.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-dark-border">
        <p className="text-sm text-gray-500 dark:text-dark-textMuted">
          {analysen.length} Siebanalyse{analysen.length !== 1 ? 'n' : ''} gefunden
        </p>
      </div>
    </div>
  );
}
