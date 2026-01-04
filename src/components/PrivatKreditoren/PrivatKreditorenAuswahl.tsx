import { useState } from 'react';
import { Wallet, ChevronDown } from 'lucide-react';
import { PrivatKreditorProvider } from '../../contexts/PrivatKreditorContext';
import PrivatKreditorenVerwaltung from './PrivatKreditorenVerwaltung';

type Owner = 'julian' | 'luca';

const PrivatKreditorenAuswahl = () => {
  const [selectedOwner, setSelectedOwner] = useState<Owner>('julian');

  return (
    <div className="min-h-screen">
      {/* Header mit Auswahl */}
      <div className="bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl text-white">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-text">
                  Private Kreditorenverwaltung
                </h1>
                <p className="text-sm text-gray-500 dark:text-dark-textMuted">
                  Persönliche Rechnungen und Zahlungen verwalten
                </p>
              </div>
            </div>

            {/* Owner Select */}
            <div className="relative">
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-textMuted mb-1">
                Konto auswählen
              </label>
              <div className="relative">
                <select
                  value={selectedOwner}
                  onChange={(e) => setSelectedOwner(e.target.value as Owner)}
                  className="appearance-none w-full sm:w-48 px-4 py-2.5 pr-10 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-700 rounded-xl text-purple-900 dark:text-purple-100 font-semibold cursor-pointer hover:border-purple-400 dark:hover:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors"
                >
                  <option value="julian">Julian</option>
                  <option value="luca">Luca</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-500 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content mit Provider basierend auf Auswahl */}
      <PrivatKreditorProvider key={selectedOwner} owner={selectedOwner}>
        <PrivatKreditorenVerwaltung hideHeader />
      </PrivatKreditorProvider>
    </div>
  );
};

export default PrivatKreditorenAuswahl;
