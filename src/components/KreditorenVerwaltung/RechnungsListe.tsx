import { useState, useEffect } from 'react';
import { Edit, Trash2, Filter, X, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import { OffeneRechnung, RechnungsFilter, SortierFeld, SortierRichtung, RechnungsStatus, Rechnungskategorie, Prioritaet, Unternehmen } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';
import ZahlungsSchnelleingabe from './ZahlungsSchnelleingabe';

interface RechnungsListeProps {
  rechnungen: OffeneRechnung[];
  onEdit: (rechnung: OffeneRechnung) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

const RechnungsListe = ({ rechnungen, onEdit, onDelete, onRefresh }: RechnungsListeProps) => {
  const [filteredRechnungen, setFilteredRechnungen] = useState<OffeneRechnung[]>([]);
  const [filter, setFilter] = useState<RechnungsFilter>({});
  const [sortFeld, setSortFeld] = useState<SortierFeld>('faelligkeitsdatum');
  const [sortRichtung, setSortRichtung] = useState<SortierRichtung>('asc');
  const [showFilter, setShowFilter] = useState(false);
  const [suche, setSuche] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    applyFilters();
  }, [rechnungen, filter, sortFeld, sortRichtung, suche]);

  const applyFilters = async () => {
    try {
      const filterMitSuche = { ...filter, suche: suche || undefined };
      const gefiltert = await kreditorService.filterRechnungen(filterMitSuche, sortFeld, sortRichtung);
      setFilteredRechnungen(gefiltert);
    } catch (error) {
      console.error('Fehler beim Filtern:', error);
      setFilteredRechnungen(rechnungen);
    }
  };

  const handleSort = (feld: SortierFeld) => {
    if (sortFeld === feld) {
      setSortRichtung(sortRichtung === 'asc' ? 'desc' : 'asc');
    } else {
      setSortFeld(feld);
      setSortRichtung('asc');
    }
  };

  const getStatusBadge = (status: RechnungsStatus) => {
    const styles: Record<RechnungsStatus, string> = {
      offen: 'bg-blue-100 text-blue-800',
      faellig: 'bg-yellow-100 text-yellow-800',
      gemahnt: 'bg-orange-100 text-orange-800',
      in_bearbeitung: 'bg-purple-100 text-purple-800',
      verzug: 'bg-red-100 text-red-800',
      bezahlt: 'bg-green-100 text-green-800',
      storniert: 'bg-gray-100 text-gray-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getPrioritaetBadge = (prioritaet: Prioritaet) => {
    const styles: Record<Prioritaet, string> = {
      kritisch: 'bg-red-500 text-white',
      hoch: 'bg-orange-500 text-white',
      normal: 'bg-blue-500 text-white',
      niedrig: 'bg-gray-400 text-white',
    };
    return styles[prioritaet] || 'bg-gray-400 text-white';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  const getTageBisFaellig = (faelligkeitsdatum: string) => {
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    const faellig = new Date(faelligkeitsdatum);
    faellig.setHours(0, 0, 0, 0);
    const diff = Math.floor((faellig.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const SortButton = ({ feld, children }: { feld: SortierFeld; children: React.ReactNode }) => {
    const isActive = sortFeld === feld;
    return (
      <button
        onClick={() => handleSort(feld)}
        className={`flex items-center gap-1 hover:text-red-600 transition-colors ${
          isActive ? 'text-red-600 font-semibold' : 'text-gray-600'
        }`}
      >
        {children}
        {isActive ? (
          sortRichtung === 'asc' ? (
            <ArrowUp className="w-4 h-4" />
          ) : (
            <ArrowDown className="w-4 h-4" />
          )
        ) : (
          <ArrowUpDown className="w-4 h-4 opacity-50" />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter und Suche */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Suche */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Suche nach Rechnungsnummer, Betreff, Kreditor..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
              showFilter
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-5 h-5" />
            Filter
            {Object.keys(filter).length > 0 && (
              <span className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                {Object.keys(filter).length}
              </span>
            )}
          </button>
        </div>

        {/* Erweiterte Filter */}
        {showFilter && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                multiple
                value={filter.status || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as RechnungsStatus);
                  setFilter({ ...filter, status: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                size={4}
              >
                <option value="offen">Offen</option>
                <option value="faellig">Fällig</option>
                <option value="gemahnt">Gemahnt</option>
                <option value="verzug">Verzug</option>
                <option value="in_bearbeitung">In Bearbeitung</option>
                <option value="bezahlt">Bezahlt</option>
                <option value="storniert">Storniert</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kategorie</label>
              <select
                multiple
                value={filter.kategorie || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as Rechnungskategorie);
                  setFilter({ ...filter, kategorie: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                size={4}
              >
                <option value="lieferanten">Lieferanten</option>
                <option value="dienstleister">Dienstleister</option>
                <option value="energie">Energie</option>
                <option value="miete">Miete</option>
                <option value="versicherung">Versicherung</option>
                <option value="steuern">Steuern</option>
                <option value="sonstiges">Sonstiges</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priorität</label>
              <select
                multiple
                value={filter.prioritaet || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as Prioritaet);
                  setFilter({ ...filter, prioritaet: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                size={4}
              >
                <option value="kritisch">Kritisch</option>
                <option value="hoch">Hoch</option>
                <option value="normal">Normal</option>
                <option value="niedrig">Niedrig</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unternehmen</label>
              <select
                multiple
                value={filter.anUnternehmen || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as Unternehmen);
                  setFilter({ ...filter, anUnternehmen: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                size={2}
              >
                <option value="TennisMehl">TennisMehl</option>
                <option value="Egner Bau">Egner Bau</option>
              </select>
            </div>

            <div className="md:col-span-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setFilter({});
                  setSuche('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Filter zurücksetzen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortButton feld="kreditorName">Kreditor</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unternehmen
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rechnungsnummer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Betreff
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortButton feld="summe">Summe</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortButton feld="faelligkeitsdatum">Fälligkeitsdatum</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortButton feld="status">Status</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mahnstufe
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortButton feld="prioritaet">Priorität</SortButton>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRechnungen.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    Keine Rechnungen gefunden
                  </td>
                </tr>
              ) : (
                filteredRechnungen.map((rechnung) => {
                  const tageBisFaellig = getTageBisFaellig(rechnung.faelligkeitsdatum);
                  const istUeberfaellig = tageBisFaellig < 0;
                  
                  return (
                    <>
                      <tr
                        key={rechnung.id}
                        className={`hover:bg-gray-50 ${
                          istUeberfaellig && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert'
                            ? 'bg-red-50'
                            : ''
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{rechnung.kreditorName}</div>
                          {rechnung.kategorie && (
                            <div className="text-xs text-gray-500 capitalize">{rechnung.kategorie}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {rechnung.anUnternehmen}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{rechnung.rechnungsnummer || '-'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 max-w-xs truncate" title={rechnung.betreff}>
                            {rechnung.betreff || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">
                            {formatCurrency(rechnung.summe)}
                          </div>
                          {rechnung.monatlicheRate && (
                            <div className="text-xs text-blue-600 mt-1">
                              Rate: {formatCurrency(rechnung.monatlicheRate)}/Monat
                            </div>
                          )}
                        {rechnung.zahlungen && rechnung.zahlungen.length > 0 && (() => {
                          const gesamtBezahlt = rechnung.zahlungen.reduce((sum, z) => sum + (z.betrag || 0), 0);
                          const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
                          return (
                            <>
                              <div className="text-xs text-green-600 mt-1">
                                Bezahlt: {formatCurrency(gesamtBezahlt)}
                              </div>
                              {offenerBetrag > 0 && (
                                <div className="text-xs text-red-600 mt-1">
                                  Offen: {formatCurrency(offenerBetrag)}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{formatDate(rechnung.faelligkeitsdatum)}</div>
                          {istUeberfaellig && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert' && (
                            <div className="text-xs text-red-600 font-medium">
                              {Math.abs(tageBisFaellig)} Tage überfällig
                            </div>
                          )}
                          {!istUeberfaellig && tageBisFaellig <= 7 && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert' && (
                            <div className="text-xs text-yellow-600 font-medium">
                              {tageBisFaellig === 0 ? 'Heute fällig' : `in ${tageBisFaellig} Tagen`}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(rechnung.status)}`}>
                            {rechnung.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {rechnung.mahnstufe > 0 ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                              {rechnung.mahnstufe}. Mahnung
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPrioritaetBadge(rechnung.prioritaet)}`}>
                            {rechnung.prioritaet}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const newExpanded = new Set(expandedRows);
                                if (newExpanded.has(rechnung.id)) {
                                  newExpanded.delete(rechnung.id);
                                } else {
                                  newExpanded.add(rechnung.id);
                                }
                                setExpandedRows(newExpanded);
                              }}
                              className="text-green-700 hover:text-green-900 hover:bg-green-100 p-1.5 rounded transition-colors border border-green-200 hover:border-green-300"
                              title="Zahlung hinzufügen"
                            >
                              {expandedRows.has(rechnung.id) ? (
                                <ChevronUp className="w-5 h-5 stroke-2" />
                              ) : (
                                <ChevronDown className="w-5 h-5 stroke-2" />
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(rechnung);
                              }}
                              className="text-blue-600 hover:text-blue-900 transition-colors"
                              title="Bearbeiten"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Möchten Sie diese Rechnung wirklich löschen?')) {
                                  onDelete(rechnung.id);
                                }
                              }}
                              className="text-red-600 hover:text-red-900 transition-colors"
                              title="Löschen"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(rechnung.id) && (
                        <tr key={`${rechnung.id}-expanded`}>
                          <td colSpan={10} className="px-6 py-4 bg-gray-50">
                            <ZahlungsSchnelleingabe rechnung={rechnung} onUpdate={onRefresh} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer mit Anzahl */}
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-700">
              {filteredRechnungen.length} von {rechnungen.length} Rechnungen
            </div>
            {filteredRechnungen.length > 0 && (
              <div className="text-sm font-semibold text-gray-900">
                Gesamt: {formatCurrency(
                  filteredRechnungen.reduce((sum, r) => sum + r.summe, 0)
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RechnungsListe;
