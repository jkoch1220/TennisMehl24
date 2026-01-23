import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DebitorView, DebitorStatus, DEBITOR_STATUS_CONFIG, MAHNSTUFEN_CONFIG } from '../../types/debitor';

interface DebitorenListeProps {
  debitoren: DebitorView[];
  onOpenDetail: (debitor: DebitorView) => void;
}

type SortField = 'kundenname' | 'rechnungsbetrag' | 'offenerBetrag' | 'tageUeberfaellig' | 'faelligkeitsdatum' | 'mahnstufe';
type SortDirection = 'asc' | 'desc';

const DebitorenListe = ({ debitoren, onOpenDetail }: DebitorenListeProps) => {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<SortField>('tageUeberfaellig');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedDebitoren = [...debitoren].sort((a, b) => {
    let comparison = 0;

    switch (sortField) {
      case 'kundenname':
        comparison = a.kundenname.localeCompare(b.kundenname);
        break;
      case 'rechnungsbetrag':
        comparison = a.rechnungsbetrag - b.rechnungsbetrag;
        break;
      case 'offenerBetrag':
        comparison = a.offenerBetrag - b.offenerBetrag;
        break;
      case 'tageUeberfaellig':
        comparison = a.tageUeberfaellig - b.tageUeberfaellig;
        break;
      case 'faelligkeitsdatum':
        comparison = new Date(a.faelligkeitsdatum).getTime() - new Date(b.faelligkeitsdatum).getTime();
        break;
      case 'mahnstufe':
        comparison = a.mahnstufe - b.mahnstufe;
        break;
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
        )}
      </div>
    </th>
  );

  if (debitoren.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 text-center">
        <p className="text-gray-500 dark:text-slate-400">Keine Debitoren gefunden</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
      {/* Desktop Tabelle */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
          <thead className="bg-gray-50 dark:bg-slate-900/50">
            <tr>
              <SortHeader field="kundenname" label="Kunde" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Rechnung
              </th>
              <SortHeader field="rechnungsbetrag" label="Betrag" />
              <SortHeader field="offenerBetrag" label="Offen" />
              <SortHeader field="faelligkeitsdatum" label="Fällig" />
              <SortHeader field="tageUeberfaellig" label="Überfällig" />
              <SortHeader field="mahnstufe" label="Mahnstufe" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {sortedDebitoren.map((debitor) => (
              <tr
                key={debitor.projektId}
                className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                onClick={() => onOpenDetail(debitor)}
              >
                <td className="px-4 py-4">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-slate-100">{debitor.kundenname}</p>
                    {debitor.kundennummer && (
                      <p className="text-sm text-gray-500 dark:text-slate-400">#{debitor.kundennummer}</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div>
                    <p className="text-sm text-gray-900 dark:text-slate-100">{debitor.rechnungsnummer || '-'}</p>
                    {debitor.rechnungsdatum && (
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        vom {formatDate(debitor.rechnungsdatum)}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-900 dark:text-slate-100 font-medium">
                  {formatCurrency(debitor.rechnungsbetrag)}
                </td>
                <td className="px-4 py-4">
                  <span className={`text-sm font-bold ${debitor.offenerBetrag > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {formatCurrency(debitor.offenerBetrag)}
                  </span>
                  {debitor.prozentBezahlt > 0 && debitor.prozentBezahlt < 100 && (
                    <div className="mt-1 w-full bg-gray-200 dark:bg-slate-600 rounded-full h-1.5">
                      <div
                        className="bg-green-500 h-1.5 rounded-full"
                        style={{ width: `${debitor.prozentBezahlt}%` }}
                      />
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 text-sm text-gray-900 dark:text-slate-100">
                  {formatDate(debitor.faelligkeitsdatum)}
                </td>
                <td className="px-4 py-4">
                  {debitor.tageUeberfaellig > 0 ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      {debitor.tageUeberfaellig} Tage
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500 dark:text-slate-400">-</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <MahnstufeDisplay mahnstufe={debitor.mahnstufe} />
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={debitor.status} />
                </td>
                <td className="px-4 py-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projektabwicklung/${debitor.projektId}`);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="Zum Projekt"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden divide-y divide-gray-200 dark:divide-slate-700">
        {sortedDebitoren.map((debitor) => (
          <div
            key={debitor.projektId}
            className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
            onClick={() => onOpenDetail(debitor)}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-medium text-gray-900 dark:text-slate-100">{debitor.kundenname}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {debitor.rechnungsnummer || 'Keine Rechnungsnr.'} • {formatDate(debitor.faelligkeitsdatum)}
                </p>
              </div>
              <StatusBadge status={debitor.status} />
            </div>

            <div className="flex justify-between items-center mt-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">Offen</p>
                <p className={`font-bold ${debitor.offenerBetrag > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {formatCurrency(debitor.offenerBetrag)}
                </p>
              </div>

              {debitor.tageUeberfaellig > 0 && (
                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">{debitor.tageUeberfaellig} Tage überfällig</span>
                </div>
              )}

              <MahnstufeDisplay mahnstufe={debitor.mahnstufe} />
            </div>

            {debitor.prozentBezahlt > 0 && debitor.prozentBezahlt < 100 && (
              <div className="mt-2 w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${debitor.prozentBezahlt}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summen Footer */}
      <div className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 px-4 py-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600 dark:text-slate-400">{debitoren.length} Debitoren</span>
          <div className="flex gap-6">
            <span className="text-gray-600 dark:text-slate-400">
              Gesamt: <strong className="text-gray-900 dark:text-slate-100">{formatCurrency(debitoren.reduce((sum, d) => sum + d.rechnungsbetrag, 0))}</strong>
            </span>
            <span className="text-gray-600 dark:text-slate-400">
              Offen: <strong className="text-red-600 dark:text-red-400">{formatCurrency(debitoren.reduce((sum, d) => sum + d.offenerBetrag, 0))}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Status Badge Komponente
const StatusBadge = ({ status }: { status: DebitorStatus }) => {
  const config = DEBITOR_STATUS_CONFIG[status];

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color}`}>
      {config.label}
    </span>
  );
};

// Mahnstufe Display
const MahnstufeDisplay = ({ mahnstufe }: { mahnstufe: number }) => {
  if (mahnstufe === 0) {
    return <span className="text-sm text-gray-400 dark:text-slate-500">-</span>;
  }

  const config = MAHNSTUFEN_CONFIG[mahnstufe as 0 | 1 | 2 | 3 | 4];

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color}`}>
      {config.label}
    </span>
  );
};

export default DebitorenListe;
