import { useState, useEffect } from 'react';
import { Edit, Trash2, Filter, X, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Eye, ChevronLeft, ChevronRight, Clock, RotateCcw, CheckSquare, Square, AlertTriangle, Shield } from 'lucide-react';
import { OffeneRechnung, RechnungsFilter, SortierFeld, SortierRichtung, RechnungsStatus, Rechnungskategorie, Prioritaet, Unternehmen } from '../../types/kreditor';
import { getRelevanteFaelligkeit, istRechnungHeuteFaellig } from '../../utils/ratenzahlungCalculations';
import { kreditorService } from '../../services/kreditorService';
import { aktivitaetService } from '../../services/aktivitaetService';
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

  // Multi-Select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetBestaetigung, setResetBestaetigung] = useState('');
  const [entferneZahlungen, setEntferneZahlungen] = useState(true);

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
            // Sortiere nach geaendertAm (nicht erstelltAm)
            aVal = new Date(a.geaendertAm).getTime();
            bVal = new Date(b.geaendertAm).getTime();
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
      'TennisMehl': 'bg-blue-50 dark:bg-blue-900/20',
      'Egner Bau': 'bg-amber-50 dark:bg-amber-900/20',
    };
    return styles[unternehmen] || 'bg-white dark:bg-slate-800';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  // Multi-Select Funktionen
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedRechnungen.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedRechnungen.map(r => r.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const getSelectedRechnungen = () => {
    return rechnungen.filter(r => selectedIds.has(r.id));
  };

  // Status zurücksetzen
  const handleResetStatus = async () => {
    const zuruecksetzen = getSelectedRechnungen();
    setResetLoading(true);

    try {
      for (const rechnung of zuruecksetzen) {
        // Status auf "offen" zurücksetzen
        // Hinweis: In Appwrite muss man null verwenden um Felder zu löschen, nicht undefined
        const updateData: Record<string, unknown> = {
          status: 'offen',
          bezahltAm: null, // null löscht das Feld in Appwrite
        };

        // Optional: Zahlungen entfernen
        if (entferneZahlungen) {
          updateData.zahlungen = [];
        }

        await kreditorService.updateRechnung(rechnung.id, updateData as Partial<OffeneRechnung>);

        // Aktivität dokumentieren
        await aktivitaetService.logStatusAenderung(rechnung.id, 'offen', rechnung.status);

        const zahlungenText = entferneZahlungen && rechnung.zahlungen?.length
          ? ` Zahlungen (${rechnung.zahlungen.length}) wurden ebenfalls entfernt.`
          : '';

        await aktivitaetService.addKommentar(
          rechnung.id,
          `⚠️ MASSEN-KORREKTUR: Status wurde von "${rechnung.status}" auf "offen" zurückgesetzt.${zahlungenText}`
        );
      }

      setShowResetDialog(false);
      setSelectedIds(new Set());
      setResetBestaetigung('');
      onRefresh();
    } catch (error) {
      console.error('Fehler beim Zurücksetzen:', error);
      alert('Fehler beim Zurücksetzen. Bitte versuche es erneut.');
    } finally {
      setResetLoading(false);
    }
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
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Suche */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Suche nach Rechnungsnummer, Betreff, Kreditor..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
              showFilter
                ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
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
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700 grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">Status</label>
              <select
                multiple
                value={filter.status || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as RechnungsStatus);
                  setFilter({ ...filter, status: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">Kategorie</label>
              <select
                multiple
                value={filter.kategorie || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as Rechnungskategorie);
                  setFilter({ ...filter, kategorie: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">Priorität</label>
              <select
                multiple
                value={filter.prioritaet || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as Prioritaet);
                  setFilter({ ...filter, prioritaet: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg"
                size={4}
              >
                <option value="kritisch">Kritisch</option>
                <option value="hoch">Hoch</option>
                <option value="normal">Normal</option>
                <option value="niedrig">Niedrig</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-2">Unternehmen</label>
              <select
                multiple
                value={filter.anUnternehmen || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value as Unternehmen);
                  setFilter({ ...filter, anUnternehmen: values.length > 0 ? values : undefined });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg"
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
                className="px-4 py-2 text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Filter zurücksetzen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Aktionsleiste bei Auswahl */}
      {selectedIds.size > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/30 border-2 border-orange-300 dark:border-orange-700 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-orange-600" />
              <span className="font-semibold text-orange-800 dark:text-orange-200">
                {selectedIds.size} ausgewählt
              </span>
            </div>
            <span className="text-orange-700 dark:text-orange-300">
              Summe: {formatCurrency(getSelectedRechnungen().reduce((sum, r) => sum + r.summe, 0))}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={clearSelection}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Auswahl aufheben
            </button>
            <button
              onClick={() => {
                setResetBestaetigung('');
                setShowResetDialog(true);
              }}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              Status zurücksetzen
            </button>
          </div>
        </div>
      )}

      {/* Tabelle */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider w-12">
                  <button
                    onClick={toggleSelectAll}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded transition-colors"
                    title={selectedIds.size === displayedRechnungen.length ? 'Alle abwählen' : 'Alle auswählen'}
                  >
                    {selectedIds.size === displayedRechnungen.length && displayedRechnungen.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-orange-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  <SortButton feld="kreditorName">Kreditor</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Unternehmen
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Rechnungsnummer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Betreff
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  <SortButton feld="summe">Summe</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  <SortButton feld="faelligkeitsdatum">Fälligkeitsdatum</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  <SortButton feld="status">Status</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  <SortButton feld="erstelltAm">Geändert am</SortButton>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Mahnstufe
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  <SortButton feld="prioritaet">Priorität</SortButton>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200">
              {displayedRechnungen.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-500 dark:text-slate-400">
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
                          selectedIds.has(rechnung.id)
                            ? 'bg-orange-100 dark:bg-orange-900/40'
                            : istUeberfaellig && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert'
                            ? 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50'
                            : istHeute && rechnung.status !== 'bezahlt' && rechnung.status !== 'storniert'
                            ? 'bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 border-l-4 border-orange-400'
                            : `${getUnternehmenHintergrund(rechnung.anUnternehmen)} hover:brightness-95 dark:hover:brightness-110`
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => toggleSelect(rechnung.id, e)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded transition-colors"
                          >
                            {selectedIds.has(rechnung.id) ? (
                              <CheckSquare className="w-5 h-5 text-orange-600" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{rechnung.kreditorName}</div>
                          {rechnung.kategorie && (
                            <div className="text-xs text-gray-500 dark:text-slate-400 capitalize">{rechnung.kategorie}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {rechnung.anUnternehmen}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-slate-100">{rechnung.rechnungsnummer || '-'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-slate-100 max-w-xs truncate" title={rechnung.betreff}>
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
                                <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                  {formatCurrency(offenerBetrag)}
                                </div>
                                {hatZahlungen && (
                                  <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
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
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            <div>
                              <div className="text-sm text-gray-900 dark:text-slate-100">
                                {formatDate(rechnung.geaendertAm)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-slate-400">
                                {new Date(rechnung.geaendertAm).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                              </div>
                            </div>
                          </div>
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
                          <td colSpan={12} className="px-6 py-4 bg-opacity-60">
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
        <div className="bg-gray-50 dark:bg-slate-800 px-6 py-3 border-t border-gray-200 dark:border-slate-700">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-700 dark:text-slate-400">
              {filteredRechnungen.length} von {rechnungen.length} Rechnungen
            </div>
            {filteredRechnungen.length > 0 && (
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Gesamt: {formatCurrency(
                  filteredRechnungen.reduce((sum, r) => sum + r.summe, 0)
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pagination - nur anzeigen wenn kein aktiver Filter/Suche */}
        {!hasActiveSearch && totalPages > 1 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-slate-400">
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

      {/* Reset Dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Status zurücksetzen</h2>
                  <p className="text-white/80 text-sm">{selectedIds.size} Rechnung(en) ausgewählt</p>
                </div>
              </div>
            </div>

            {/* Inhalt */}
            <div className="p-6">
              {/* Warnung */}
              <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-700 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-red-900 dark:text-red-100">Achtung!</h4>
                    <p className="text-red-700 dark:text-red-300 text-sm mt-1">
                      Du setzt {selectedIds.size} Rechnung(en) auf "offen" zurück.
                      Gesamtsumme: {formatCurrency(getSelectedRechnungen().reduce((sum, r) => sum + r.summe, 0))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ausgewählte Rechnungen */}
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 mb-6 max-h-48 overflow-y-auto">
                <h4 className="font-semibold text-gray-900 dark:text-slate-100 mb-3 text-sm">Betroffene Rechnungen:</h4>
                <div className="space-y-2">
                  {getSelectedRechnungen().map(r => (
                    <div key={r.id} className="flex justify-between items-center text-sm">
                      <div>
                        <span className="font-medium text-gray-900 dark:text-slate-100">{r.kreditorName}</span>
                        <span className="text-gray-500 dark:text-slate-400 ml-2">{r.rechnungsnummer || r.betreff}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold">{formatCurrency(r.summe)}</span>
                        {r.zahlungen && r.zahlungen.length > 0 && (
                          <span className="text-green-600 text-xs ml-2">
                            ({r.zahlungen.length} Zahlung(en))
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Option: Zahlungen entfernen */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4 mb-6">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={entferneZahlungen}
                    onChange={(e) => setEntferneZahlungen(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <div>
                    <span className="font-medium text-yellow-900 dark:text-yellow-100">Zahlungen auch entfernen</span>
                    <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
                      Wenn aktiviert, werden alle erfassten Zahlungen gelöscht und der volle Rechnungsbetrag ist wieder offen.
                    </p>
                  </div>
                </label>
              </div>

              {/* Bestätigungs-Eingabe */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Tippe zum Bestätigen:
                </label>
                <div className="bg-gray-100 dark:bg-slate-900 rounded-lg px-4 py-2 mb-3 font-mono text-lg text-gray-900 dark:text-slate-100">
                  ZURÜCKSETZEN {selectedIds.size}
                </div>
                <input
                  type="text"
                  value={resetBestaetigung}
                  onChange={(e) => setResetBestaetigung(e.target.value)}
                  placeholder="Hier eingeben..."
                  className={`w-full px-4 py-3 border-2 rounded-xl text-lg font-mono transition-colors ${
                    resetBestaetigung === `ZURÜCKSETZEN ${selectedIds.size}`
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700'
                  } text-gray-900 dark:text-slate-100 focus:outline-none`}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowResetDialog(false);
                    setResetBestaetigung('');
                  }}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-gray-700 dark:text-slate-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleResetStatus}
                  disabled={resetBestaetigung !== `ZURÜCKSETZEN ${selectedIds.size}` || resetLoading}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resetLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                      Zurücksetzen...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-5 h-5" />
                      Jetzt zurücksetzen
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RechnungsListe;
