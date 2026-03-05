/**
 * Shop Statistik-Karten
 * Zeigt KPIs für Shop-Bestellungen
 */

import { Package, Clock, Truck, CheckCircle, Calendar } from 'lucide-react';
import { ShopStats, ShopBestellungFilter } from '../../services/shopBestellungService';

interface ShopStatistikKartenProps {
  stats: ShopStats;
  onFilterClick: (filter: ShopBestellungFilter) => void;
}

const ShopStatistikKarten = ({ stats, onFilterClick }: ShopStatistikKartenProps) => {
  const karten = [
    {
      label: 'Neu',
      value: stats.neu,
      icon: Package,
      color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
      borderColor: 'border-orange-200 dark:border-orange-800',
      filter: { status: 'neu' as const },
      highlight: stats.neu > 0,
    },
    {
      label: 'In Bearbeitung',
      value: stats.in_bearbeitung,
      icon: Clock,
      color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      borderColor: 'border-blue-200 dark:border-blue-800',
      filter: { status: 'in_bearbeitung' as const },
    },
    {
      label: 'Versendet',
      value: stats.versendet,
      icon: Truck,
      color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
      borderColor: 'border-purple-200 dark:border-purple-800',
      filter: { status: 'versendet' as const },
    },
    {
      label: 'Abgeschlossen',
      value: stats.abgeschlossen,
      icon: CheckCircle,
      color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
      borderColor: 'border-green-200 dark:border-green-800',
      filter: { status: 'abgeschlossen' as const },
    },
    {
      label: 'Diesen Monat',
      value: stats.diesesMonat,
      icon: Calendar,
      color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      borderColor: 'border-gray-200 dark:border-gray-700',
      filter: {},
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {karten.map((karte) => {
        const Icon = karte.icon;
        return (
          <button
            key={karte.label}
            onClick={() => onFilterClick(karte.filter)}
            className={`
              relative p-4 rounded-xl border-2 transition-all
              ${karte.borderColor}
              hover:shadow-md hover:scale-[1.02]
              bg-white dark:bg-gray-800
              text-left
            `}
          >
            {/* Highlight-Badge für neue Bestellungen */}
            {karte.highlight && (
              <span className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full animate-pulse" />
            )}

            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${karte.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {karte.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {karte.label}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ShopStatistikKarten;
