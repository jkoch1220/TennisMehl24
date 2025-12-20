import { useState, useEffect } from 'react';
import { Edit, Trash2, Filter, X, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { OffeneRechnung, RechnungsFilter, SortierFeld, SortierRichtung, RechnungsStatus, Rechnungskategorie, Prioritaet, Unternehmen } from '../../types/kreditor';
import { getRelevanteFaelligkeit, istRechnungHeuteFaellig } from '../../utils/ratenzahlungCalculations';
import ZahlungsSchnelleingabe from './ZahlungsSchnelleingabe';

interface RechnungsListeProps {
  rechnungen: OffeneRechnung[];
  onEdit: (rechnung: OffeneRechnung) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  onOpenDetail?: (rechnung: OffeneRechnung) => void;
}

const RechnungsListe = ({ rechnungen, onEdit, onDelete, onRefresh, onOpenDetail }: RechnungsListeProps) => {
  const [filteredRechnungen, setFilteredRechnungen] = useState<OffeneRechnung[]>([]);
  const [filter, setFilter] = useState<RechnungsFilter>({});
  const [sortFeld, setSortFeld] = useState<SortierFeld>('faelligkeitsdatum');
  const [sortRichtung, setSortRichtung] = useState<SortierRichtung>('asc');
  const [showFilter, setShowFilter] = useState(false);
  const [suche, setSuche] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    applyFilters();
    setCurrentPage(1); // Reset auf Seite 1 bei Filter-Änderung
  }, [rechnungen, filter, sortFeld, sortRichtung, suche]);

  const applyFilters = () => {
    try {
      let gefiltert = [...rechnungen];

      // Filter anwenden
      if (filter.status && filter.status.length > 0) {
        gefiltert = gefiltert.filter(r => filter.status!.includes(r.status));
      }

      if (filter.mahnstufe && filter.mahnstufe.length > 0) {
        gefiltert = gefiltert.filter(r => filter.mahnstufe!.includes(r.mahnstufe));
      }

      if (filter.kategorie && filter.kategorie.length > 0) {
        gefiltert = gefiltert.filter(r => filter.kategorie!.includes(r.kategorie));
      }

      if (filter.anUnternehmen && filter.anUnternehmen.length > 0) {
        gefiltert = gefiltert.filter(r => filter.anUnternehmen!.includes(r.anUnternehmen));
      }

      if (filter.prioritaet && filter.prioritaet.length > 0) {
        gefiltert = gefiltert.filter(r => filter.prioritaet!.includes(r.prioritaet));
      }

      if (filter.faelligVon) {
        gefiltert = gefiltert.filter(r => r.faelligkeitsdatum >= filter.faelligVon!);
      }

      if (filter.faelligBis) {
        gefiltert = gefiltert.filter(r => r.faelligkeitsdatum <= filter.faelligBis!);
      }

      if (filter.betragMin !== undefined) {
        gefiltert = gefiltert.filter(r => r.summe >= filter.betragMin!);
      }

      if (filter.betragMax !== undefined) {
        gefiltert = gefiltert.filter(r => r.summe <= filter.betragMax!);
      }

      // Suche
      if (suche) {
        const sucheLower = suche.toLowerCase();
        gefiltert = gefiltert.filter(r =>
          r.rechnungsnummer?.toLowerCase().includes(sucheLower) ||
          r.betreff?.toLowerCase().includes(sucheLower) ||
          r.kreditorName.toLowerCase().includes(sucheLower) ||
          r.kommentar?.toLowerCase().includes(sucheLower)
        );
      }

      // Sortierung anwenden
      gefiltert.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortFeld) {
          case 'faelligkeitsdatum':
            aVal = new Date(a.faelligkeitsdatum).getTime();
            bVal = new Date(b.faelligkeitsdatum).getTime();
            break;
          case 'summe':
            aVal = a.summe;
            bVal = b.summe;
            break;
          case 'status':
            aVal = a.status;
            bVal = b.status;
            break;
          case 'mahnstufe':
            aVal = a.mahnstufe;
            bVal = b.mahnstufe;
            break;
          case 'prioritaet':
            const prioritaetOrder = { kritisch: 0, hoch: 1, normal: 2, niedrig: 3 };
            aVal = prioritaetOrder[a.prioritaet];
            bVal = prioritaetOrder[b.prioritaet];
            break;
          case 'erstelltAm':
            aVal = new Date(a.erstelltAm).getTime();
            bVal = new Date(b.erstelltAm).getTime();
            break;
          case 'kreditorName':
            aVal = a.kreditorName.toLowerCase();
            bVal = b.kreditorName.toLowerCase();
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortRichtung === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortRichtung === 'asc' ? 1 : -1;
        return 0;
      });

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
      in_ratenzahlung: 'bg-indigo-100 text-indigo-800',
      verzug: 'bg-red-100 text-red-800',
      inkasso: 'bg-red-600 text-white',
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

  const getUnternehmenHintergrund = (unternehmen: Unternehmen) => {
    const styles: Record<Unternehmen, string> = {
      'TennisMehl': 'bg-blue-50',
      'Egner Bau': 'bg-amber-50',
    };
    return styles[unternehmen] || 'bg-white';
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

  // Paging: Nur anwenden wenn nicht gesucht wird
  const hasActiveSearch = suche.trim() !== '' || 
                          (filter.status && filter.status.length > 0) ||
                          (filter.mahnstufe && filter.mahnstufe.length > 0) ||
                          (filter.kategorie && filter.kategorie.length > 0) ||
                          (filter.anUnternehmen && filter.anUnternehmen.length > 0) ||
                          (filter.prioritaet && filter.prioritaet.length > 0);

  const displayedRechnungen = hasActiveSearch 
    ? filteredRechnungen 
    : filteredRechnungen.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalPages = Math.ceil(filteredRechnungen.length / itemsPerPage);

  return (
    <div className="space-y-4">
      {/* Filter und Suche */}
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Suche */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Suche nach Rechnungsnummer, Betreff, Kreditor..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-border grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">Status</label>
              <select
                multiple
                value={filter.status || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as RechnungsStatus);
                  setFilter({ ...filter, status: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                size={4}
              >
                <option value="offen">Offen</option>
                <option value="faellig">Fällig</option>
                <option value="gemahnt">Gemahnt</option>
                <option value="verzug">Verzug</option>
                <option value="in_bearbeitung">In Bearbeitung</option>
                <option value="in_ratenzahlung">In Ratenzahlung</option>
                <option value="bezahlt">Bezahlt</option>
                <option value="storniert">Storniert</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">Kategorie</label>
              <select
                multiple
                value={filter.kategorie || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as Rechnungskategorie);
                  setFilter({ ...filter, kategorie: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                size={4}
              >
                <option value="lieferanten">Lieferanten</option>
                <option value="dienstleister">Dienstleister</option>
                <option value="energie">Energie</option>
                <option value="miete">Miete</option>
                <option value="versicherung">Versicherung</option>
                <option value="steuern">Steuern</option>
                <option value="darlehen">Darlehen</option>
                <option value="sonstiges">Sonstiges</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">Priorität</label>
              <select
                multiple
                value={filter.prioritaet || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as Prioritaet);
                  setFilter({ ...filter, prioritaet: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
                size={4}
              >
                <option value="kritisch">Kritisch</option>
                <option value="hoch">Hoch</option>
                <option value="normal">Normal</option>
                <option value="niedrig">Niedrig</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">Unternehmen</label>
              <select
                multiple
                value={filter.anUnternehmen || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as Unternehmen);
                  setFilter({ ...filter, anUnternehmen: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg"
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
                className="px-4 py-2 text-gray-700 dark:text-dark-textMuted hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Filter zurücksetzen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabelle */}
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  <SortButton feld="kreditorName">Kreditor</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  Unternehmen
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  Rechnungsnummer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  Betreff
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  <SortButton feld="summe">Summe</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  <SortButton feld="faelligkeitsdatum">Fälligkeitsdatum</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  <SortButton feld="status">Status</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  Mahnstufe
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  <SortButton feld="prioritaet">Priorität</SortButton>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-textMuted uppercase tracking-wider">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-surface divide-y divide-gray-200">
              {displayedRechnungen.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500 dark:text-dark-textMuted">
                    Keine Rechnungen gefunden
                  </td>
                </tr>
              ) : (
                displayedRechnungen.map((rechnung) => {
                  const relevanteFaelligkeit = getRelevanteFaelligkeit(rechnung);
                  const tageBisFaellig = getTageBisFaellig(relevanteFaelligkeit);
                  const istUeberfaellig = tageBisFaellig < 0;
                  const istHeute = istRechnungHeuteFaellig(rechnung);
                  
                  return (
                    <>
                      <tr
                        key={rechnung.id}
                        onClick={() => onOpenDetail?.(rechnung)}
                        className={`cursor-pointer transition-colors ${
                          istUeberfaellig && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert'
                            ? 'bg-red-50 hover:bg-red-100'
                            : istHeute && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert'
                            ? 'bg-orange-50 hover:bg-orange-100 border-l-4 border-orange-400'
                            : `${getUnternehmenHintergrund(rechnung.anUnternehmen)} hover:brightness-95`
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text">{rechnung.kreditorName}</div>
                          {rechnung.kategorie && (
                            <div className="text-xs text-gray-500 dark:text-dark-textMuted capitalize">{rechnung.kategorie}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {rechnung.anUnternehmen}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-dark-text">{rechnung.rechnungsnummer || '-'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-dark-text max-w-xs truncate" title={rechnung.betreff}>
                            {rechnung.betreff || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(() => {
                            const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
                            const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
                            const hatZahlungen = gesamtBezahlt > 0;
                            
                            return (
                              <>
                                <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                                  {formatCurrency(offenerBetrag)}
                                </div>
                                {hatZahlungen && (
                                  <div className="text-xs text-gray-500 dark:text-dark-textMuted mt-1">
                                    von {formatCurrency(rechnung.summe)}
                                  </div>
                                )}
                                {rechnung.monatlicheRate && (
                                  <div className="text-xs text-blue-600 mt-1">
                                    Rate: {formatCurrency(rechnung.monatlicheRate)}
                                  </div>
                                )}
                                {hatZahlungen && (
                                  <div className="text-xs text-green-600 mt-1">
                                    Bezahlt: {formatCurrency(gesamtBezahlt)}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm font-medium ${
                            istUeberfaellig && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert'
                              ? 'text-red-700'
                              : istHeute && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert'
                              ? 'text-orange-700'
                              : 'text-gray-900'
                          }`}>
                            {formatDate(relevanteFaelligkeit)}
                          </div>
                          {rechnung.status === 'in_ratenzahlung' && rechnung.rateFaelligAm && (
                            <div className="text-xs text-indigo-600">
                              Rate ({rechnung.ratenzahlungInterval || 'monatlich'})
                            </div>
                          )}
                          {istUeberfaellig && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert' && (
                            <div className="text-xs text-red-600 font-bold">
                              {Math.abs(tageBisFaellig)} Tage überfällig
                            </div>
                          )}
                          {!istUeberfaellig && istHeute && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert' && (
                            <div className="text-xs text-orange-600 font-bold">
                              🕐 Heute fällig!
                            </div>
                          )}
                          {!istUeberfaellig && !istHeute && tageBisFaellig <= 7 && tageBisFaellig > 0 && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert' && (
                            <div className="text-xs text-yellow-600 font-medium">
                              in {tageBisFaellig} Tagen
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(rechnung.status)}`}>
                            {rechnung.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {rechnung.mahnstufe === 4 ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-600 text-white">
                              Gerichtlich
                            </span>
                          ) : rechnung.mahnstufe > 0 ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                              {rechnung.mahnstufe}. Mahnung
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
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
                                onOpenDetail?.(rechnung);
                              }}
                              className="text-purple-600 hover:text-purple-900 hover:bg-purple-100 p-1.5 rounded transition-colors"
                              title="Details anzeigen"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
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
                              title="Schnelle Zahlung"
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
                              className="text-blue-600 hover:text-blue-900 hover:bg-blue-100 p-1.5 rounded transition-colors"
                              title="Bearbeiten"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Möchten Sie diese Rechnung wirklich löschen? Alle Aktivitäten und hochgeladenen Dateien werden ebenfalls gelöscht.')) {
                                  onDelete(rechnung.id);
                                }
                              }}
                              className="text-red-600 hover:text-red-900 hover:bg-red-100 p-1.5 rounded transition-colors"
                              title="Löschen"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(rechnung.id) && (
                        <tr key={`${rechnung.id}-expanded`} className={getUnternehmenHintergrund(rechnung.anUnternehmen)}>
                          <td colSpan={10} className="px-6 py-4 bg-opacity-60">
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
        <div className="bg-gray-50 dark:bg-gray-800 px-6 py-3 border-t border-gray-200 dark:border-dark-border">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-700 dark:text-dark-textMuted">
              {filteredRechnungen.length} von {rechnungen.length} Rechnungen
            </div>
            {filteredRechnungen.length > 0 && (
              <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                Gesamt: {formatCurrency(
                  filteredRechnungen.reduce((sum, r) => sum + r.summe, 0)
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pagination - nur anzeigen wenn kein aktiver Filter/Suche */}
        {!hasActiveSearch && totalPages > 1 && (
          <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-dark-textMuted">
              Seite {currentPage} von {totalPages} ({filteredRechnungen.length} Rechnungen)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-2 rounded-lg flex items-center gap-1 transition-colors ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Zurück
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 py-2 rounded-lg flex items-center gap-1 transition-colors ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Weiter
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RechnungsListe;
