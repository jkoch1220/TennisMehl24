/**
 * Shop Filter-Leiste
 * Status-Filter und Datums-Filter
 */

import { Filter, X } from 'lucide-react';
import { ShopBestellungFilter, ShopBestellungStatus } from '../../services/shopBestellungService';

interface ShopFilterLeisteProps {
  filter: ShopBestellungFilter;
  onFilterChange: (filter: ShopBestellungFilter) => void;
  neueCount: number;
}

const statusOptionen: { value: ShopBestellungStatus | ''; label: string }[] = [
  { value: '', label: 'Alle Status' },
  { value: 'neu', label: 'Neu' },
  { value: 'in_bearbeitung', label: 'In Bearbeitung' },
  { value: 'versendet', label: 'Versendet' },
  { value: 'abgeschlossen', label: 'Abgeschlossen' },
  { value: 'storniert', label: 'Storniert' },
  { value: 'parse_fehler', label: 'Parse-Fehler' },
];

const ShopFilterLeiste = ({ filter, onFilterChange, neueCount }: ShopFilterLeisteProps) => {
  const hasActiveFilters = filter.status || filter.datumVon || filter.datumBis;

  const handleStatusChange = (status: ShopBestellungStatus | '') => {
    onFilterChange({
      ...filter,
      status: status || undefined,
    });
  };

  const handleClearFilters = () => {
    onFilterChange({});
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Filter className="w-4 h-4 text-gray-400" />

      {/* Status-Dropdown */}
      <div className="relative">
        <select
          value={filter.status || ''}
          onChange={(e) => handleStatusChange(e.target.value as ShopBestellungStatus | '')}
          className="appearance-none pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent cursor-pointer"
        >
          {statusOptionen.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
              {opt.value === 'neu' && neueCount > 0 ? ` (${neueCount})` : ''}
            </option>
          ))}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Datums-Filter */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={filter.datumVon || ''}
          onChange={(e) => onFilterChange({ ...filter, datumVon: e.target.value || undefined })}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          placeholder="Von"
        />
        <span className="text-gray-400">-</span>
        <input
          type="date"
          value={filter.datumBis || ''}
          onChange={(e) => onFilterChange({ ...filter, datumBis: e.target.value || undefined })}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          placeholder="Bis"
        />
      </div>

      {/* Filter zurücksetzen */}
      {hasActiveFilters && (
        <button
          onClick={handleClearFilters}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
          Filter zurücksetzen
        </button>
      )}
    </div>
  );
};

export default ShopFilterLeiste;
