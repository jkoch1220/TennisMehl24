/**
 * Shop Bestellungen Tabelle
 * Responsive Tabelle mit Sortierung
 */

import { useState } from 'react';
import { ChevronUp, ChevronDown, Eye, Truck, Play, CheckCircle, Loader2 } from 'lucide-react';
import {
  ShopBestellung,
  ShopBestellungStatus,
  parseAdresse,
  parsePositionen,
  formatBestelldatum,
  getStatusInfo,
} from '../../services/shopBestellungService';

interface ShopBestellungTabelleProps {
  bestellungen: ShopBestellung[];
  loading: boolean;
  onSelect: (bestellung: ShopBestellung) => void;
  onStatusUpdate: (bestellung: ShopBestellung, status: ShopBestellungStatus) => void;
  onVersand: (bestellung: ShopBestellung) => void;
}

type SortKey = 'bestellnummer' | 'bestelldatum' | 'kundenname' | 'ort' | 'summeBrutto' | 'status';
type SortDir = 'asc' | 'desc';

const ShopBestellungTabelle = ({
  bestellungen,
  loading,
  onSelect,
  onStatusUpdate,
  onVersand,
}: ShopBestellungTabelleProps) => {
  const [sortKey, setSortKey] = useState<SortKey>('bestelldatum');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Sortierung
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedBestellungen = [...bestellungen].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (sortKey) {
      case 'bestellnummer':
        aVal = a.bestellnummer;
        bVal = b.bestellnummer;
        break;
      case 'bestelldatum':
        aVal = a.bestelldatum;
        bVal = b.bestelldatum;
        break;
      case 'kundenname':
        aVal = parseAdresse(a.lieferadresse).name;
        bVal = parseAdresse(b.lieferadresse).name;
        break;
      case 'ort':
        aVal = parseAdresse(a.lieferadresse).ort;
        bVal = parseAdresse(b.lieferadresse).ort;
        break;
      case 'summeBrutto':
        aVal = a.summeBrutto;
        bVal = b.summeBrutto;
        break;
      case 'status':
        aVal = a.status;
        bVal = b.status;
        break;
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortDir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  // Sort Header Komponente
  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <button
      onClick={() => handleSort(sortKeyName)}
      className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
    >
      {label}
      {sortKey === sortKeyName ? (
        sortDir === 'asc' ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )
      ) : (
        <div className="w-4 h-4" />
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (bestellungen.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400">Keine Bestellungen gefunden</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Tabelle */}
      <div className="hidden md:block overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider">
                <SortHeader label="Status" sortKeyName="status" />
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider">
                <SortHeader label="Best.-Nr." sortKeyName="bestellnummer" />
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider">
                <SortHeader label="Datum" sortKeyName="bestelldatum" />
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider">
                <SortHeader label="Kunde" sortKeyName="kundenname" />
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider">
                <SortHeader label="Ort" sortKeyName="ort" />
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider">
                Artikel
              </th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wider">
                <SortHeader label="Summe" sortKeyName="summeBrutto" />
              </th>
              <th className="px-4 py-3 text-center text-xs uppercase tracking-wider">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedBestellungen.map((bestellung) => {
              const statusInfo = getStatusInfo(bestellung.status);
              const lieferadresse = parseAdresse(bestellung.lieferadresse);
              const positionen = parsePositionen(bestellung.positionen);
              const isNeu = bestellung.status === 'neu';

              return (
                <tr
                  key={bestellung.$id}
                  className={`
                    hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors
                    ${isNeu ? 'bg-orange-50 dark:bg-orange-900/10' : ''}
                  `}
                  onClick={() => onSelect(bestellung)}
                >
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-900 dark:text-white">
                    {bestellung.bestellnummer}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatBestelldatum(bestellung.bestelldatum)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {lieferadresse.name}
                    </div>
                    {lieferadresse.firma && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {lieferadresse.firma}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {lieferadresse.plz} {lieferadresse.ort}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {positionen.length} Position{positionen.length !== 1 ? 'en' : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {bestellung.summeBrutto.toLocaleString('de-DE', {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelect(bestellung)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        title="Details anzeigen"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {bestellung.status === 'neu' && (
                        <button
                          onClick={() => onStatusUpdate(bestellung, 'in_bearbeitung')}
                          className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                          title="In Bearbeitung nehmen"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}

                      {bestellung.status === 'in_bearbeitung' && (
                        <button
                          onClick={() => onVersand(bestellung)}
                          className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
                          title="Als versendet markieren"
                        >
                          <Truck className="w-4 h-4" />
                        </button>
                      )}

                      {bestellung.status === 'versendet' && (
                        <button
                          onClick={() => onStatusUpdate(bestellung, 'abgeschlossen')}
                          className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                          title="Abschließen"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {sortedBestellungen.map((bestellung) => {
          const statusInfo = getStatusInfo(bestellung.status);
          const lieferadresse = parseAdresse(bestellung.lieferadresse);
          const positionen = parsePositionen(bestellung.positionen);
          const isNeu = bestellung.status === 'neu';

          return (
            <div
              key={bestellung.$id}
              onClick={() => onSelect(bestellung)}
              className={`
                p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700
                ${isNeu ? 'border-l-4 border-l-orange-500' : ''}
              `}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                    #{bestellung.bestellnummer}
                  </span>
                  <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {bestellung.summeBrutto.toLocaleString('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </span>
              </div>

              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                {lieferadresse.firma || lieferadresse.name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-500">
                {lieferadresse.plz} {lieferadresse.ort} | {formatBestelldatum(bestellung.bestelldatum)}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {positionen.length} Artikel
                </span>

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {bestellung.status === 'neu' && (
                    <button
                      onClick={() => onStatusUpdate(bestellung, 'in_bearbeitung')}
                      className="px-3 py-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg"
                    >
                      Bearbeiten
                    </button>
                  )}
                  {bestellung.status === 'in_bearbeitung' && (
                    <button
                      onClick={() => onVersand(bestellung)}
                      className="px-3 py-1 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg"
                    >
                      Versenden
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ShopBestellungTabelle;
