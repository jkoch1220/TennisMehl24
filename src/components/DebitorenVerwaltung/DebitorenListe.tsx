import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DebitorView, DebitorStatus, DEBITOR_STATUS_CONFIG, MAHNSTUFEN_CONFIG } from '../../types/debitor';

interface DebitorenListeProps {
  debitoren: DebitorView[];
  onOpenDetail: (debitor: DebitorView) => void;
  onMarkPaid?: (debitor: DebitorView) => void;
  onMarkPaidBulk?: (debitoren: DebitorView[]) => void;
}

type SortField = 'kundenname' | 'rechnungsbetrag' | 'offenerBetrag' | 'tageUeberfaellig' | 'faelligkeitsdatum' | 'mahnstufe';
type SortDirection = 'asc' | 'desc';

const DebitorenListe = ({ debitoren, onOpenDetail, onMarkPaid, onMarkPaidBulk }: DebitorenListeProps) => {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<SortField>('tageUeberfaellig');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [erwartetBetrag, setErwartetBetrag] = useState<string>('');

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

  // Selektierbare Debitoren (nicht bezahlt)
  const auswaehlbareIds = useMemo(
    () => sortedDebitoren.filter((d) => d.status !== 'bezahlt').map((d) => d.projektId),
    [sortedDebitoren]
  );

  const selectedDebitoren = useMemo(
    () => sortedDebitoren.filter((d) => selectedIds.has(d.projektId)),
    [sortedDebitoren, selectedIds]
  );

  const summeOffen = selectedDebitoren.reduce((sum, d) => sum + d.offenerBetrag, 0);

  const erwartetNumber = parseFloat(erwartetBetrag.replace(',', '.'));
  const hatErwarteten = !isNaN(erwartetNumber) && erwartetBetrag.trim() !== '';
  const differenz = hatErwarteten ? summeOffen - erwartetNumber : 0;
  const istDifferenzNull = hatErwarteten && Math.abs(differenz) < 0.005;

  const alleAusgewaehlt =
    auswaehlbareIds.length > 0 && auswaehlbareIds.every((id) => selectedIds.has(id));
  const einigeAusgewaehlt = !alleAusgewaehlt && auswaehlbareIds.some((id) => selectedIds.has(id));

  const toggleOne = (projektId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projektId)) {
        next.delete(projektId);
      } else {
        next.add(projektId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (alleAusgewaehlt) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(auswaehlbareIds));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setErwartetBetrag('');
  };

  const handleBulkMarkPaid = () => {
    if (!onMarkPaidBulk || selectedDebitoren.length === 0) return;

    const anzahl = selectedDebitoren.length;
    const betragText = formatCurrency(summeOffen);
    const bestaetigung = hatErwarteten && !istDifferenzNull
      ? `Achtung: Ausgewählter Betrag (${betragText}) weicht vom erwarteten Betrag (${formatCurrency(erwartetNumber)}) um ${formatCurrency(Math.abs(differenz))} ab.\n\nTrotzdem ${anzahl} Rechnung(en) als bezahlt markieren?`
      : `${anzahl} Rechnung(en) über insgesamt ${betragText} als bezahlt markieren?`;

    if (!confirm(bestaetigung)) return;

    onMarkPaidBulk(selectedDebitoren);
    setSelectedIds(new Set());
    setErwartetBetrag('');
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

  const zeigeAuswahlSpalte = !!onMarkPaidBulk && auswaehlbareIds.length > 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
      {/* Desktop Tabelle */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
          <thead className="bg-gray-50 dark:bg-slate-900/50">
            <tr>
              {zeigeAuswahlSpalte && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={alleAusgewaehlt}
                    ref={(el) => {
                      if (el) el.indeterminate = einigeAusgewaehlt;
                    }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-green-600 focus:ring-green-500 cursor-pointer"
                    title="Alle auswählen"
                  />
                </th>
              )}
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
            {sortedDebitoren.map((debitor) => {
              const istAusgewaehlt = selectedIds.has(debitor.projektId);
              const istSelektierbar = debitor.status !== 'bezahlt';
              return (
                <tr
                  key={debitor.projektId}
                  className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors ${
                    istAusgewaehlt ? 'bg-green-50/50 dark:bg-green-900/10' : ''
                  }`}
                  onClick={() => onOpenDetail(debitor)}
                >
                  {zeigeAuswahlSpalte && (
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      {istSelektierbar ? (
                        <input
                          type="checkbox"
                          checked={istAusgewaehlt}
                          onChange={() => toggleOne(debitor.projektId)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-green-600 focus:ring-green-500 cursor-pointer"
                        />
                      ) : (
                        <span className="block w-4 h-4" />
                      )}
                    </td>
                  )}
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
                    <div className="flex items-center gap-1">
                      {onMarkPaid && debitor.status !== 'bezahlt' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Möchten Sie diese Rechnung als vollständig bezahlt markieren?')) {
                              onMarkPaid(debitor);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800 transition-colors"
                          title="Als bezahlt markieren"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Bezahlt
                        </button>
                      )}
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden divide-y divide-gray-200 dark:divide-slate-700">
        {sortedDebitoren.map((debitor) => {
          const istAusgewaehlt = selectedIds.has(debitor.projektId);
          const istSelektierbar = debitor.status !== 'bezahlt';
          return (
            <div
              key={debitor.projektId}
              className={`p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors ${
                istAusgewaehlt ? 'bg-green-50/50 dark:bg-green-900/10' : ''
              }`}
              onClick={() => onOpenDetail(debitor)}
            >
              <div className="flex justify-between items-start mb-2 gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {zeigeAuswahlSpalte && istSelektierbar && (
                    <input
                      type="checkbox"
                      checked={istAusgewaehlt}
                      onChange={() => toggleOne(debitor.projektId)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-green-600 focus:ring-green-500 cursor-pointer shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-slate-100 truncate">{debitor.kundenname}</p>
                    <p className="text-sm text-gray-500 dark:text-slate-400 truncate">
                      {debitor.rechnungsnummer || 'Keine Rechnungsnr.'} • {formatDate(debitor.faelligkeitsdatum)}
                    </p>
                  </div>
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

              {onMarkPaid && debitor.status !== 'bezahlt' && (
                <div className="mt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Möchten Sie diese Rechnung als vollständig bezahlt markieren?')) {
                        onMarkPaid(debitor);
                      }
                    }}
                    className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800 transition-colors"
                    title="Als bezahlt markieren"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Als bezahlt markieren
                  </button>
                </div>
              )}
            </div>
          );
        })}
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

      {/* Auswahl-Leiste (sticky unten) */}
      {zeigeAuswahlSpalte && selectedDebitoren.length > 0 && (
        <div className="sticky bottom-0 z-10 border-t-2 border-green-500 dark:border-green-600 bg-white dark:bg-slate-800 shadow-lg">
          <div className="px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
            {/* Linke Seite: Zusammenfassung */}
            <div className="flex flex-wrap items-center gap-4 lg:gap-6">
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">Ausgewählt</p>
                <p className="text-lg font-bold text-gray-900 dark:text-slate-100">
                  {selectedDebitoren.length} Rechnung{selectedDebitoren.length === 1 ? '' : 'en'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">Summe offen</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">
                  {formatCurrency(summeOffen)}
                </p>
              </div>
            </div>

            {/* Mitte: Soll-Betrag Vergleich */}
            <div className="flex items-center gap-2 lg:ml-auto">
              <label className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                Erwartet:
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={erwartetBetrag}
                onChange={(e) => setErwartetBetrag(e.target.value)}
                placeholder="z.B. 1234,56"
                className="w-32 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {hatErwarteten && (
                <div
                  className={`text-sm font-semibold whitespace-nowrap ${
                    istDifferenzNull
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                  title="Differenz (Summe - Erwartet)"
                >
                  {istDifferenzNull
                    ? '✓ Stimmt überein'
                    : `Δ ${differenz > 0 ? '+' : ''}${formatCurrency(differenz)}`}
                </div>
              )}
            </div>

            {/* Rechte Seite: Aktionen */}
            <div className="flex items-center gap-2">
              <button
                onClick={clearSelection}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                title="Auswahl aufheben"
              >
                <X className="w-4 h-4" />
                Auswahl aufheben
              </button>
              <button
                onClick={handleBulkMarkPaid}
                className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-sm font-semibold text-white bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Alle als bezahlt markieren
              </button>
            </div>
          </div>
        </div>
      )}
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
