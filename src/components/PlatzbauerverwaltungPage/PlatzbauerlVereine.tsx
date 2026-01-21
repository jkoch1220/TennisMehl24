import { useState } from 'react';
import {
  Mail,
  Search,
  ChevronRight,
} from 'lucide-react';
import { SaisonKundeMitDaten } from '../../types/saisonplanung';
import { useNavigate } from 'react-router-dom';

interface PlatzbauerlVereineProps {
  vereine: SaisonKundeMitDaten[];
  platzbauerId: string;
  saisonjahr: number;
}

const PlatzbauerlVereine = ({
  vereine,
}: PlatzbauerlVereineProps) => {
  const navigate = useNavigate();
  const [suche, setSuche] = useState('');

  // Filter
  const gefilterteVereine = vereine.filter(v => {
    if (!suche.trim()) return true;
    const sucheLower = suche.toLowerCase();
    const kunde = v.kunde;
    return (
      kunde.name.toLowerCase().includes(sucheLower) ||
      kunde.lieferadresse?.ort?.toLowerCase().includes(sucheLower) ||
      kunde.lieferadresse?.plz?.includes(suche)
    );
  });

  if (vereine.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">
          Diesem Platzbauer sind noch keine Vereine zugeordnet.
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
          Vereine werden automatisch zugeordnet, wenn bei ihnen der Bezugsweg "Platzbauer" ausgewählt wird.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Suche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Verein suchen..."
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* Info */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {gefilterteVereine.length} von {vereine.length} Vereine{vereine.length !== 1 ? 'n' : ''}
      </p>

      {/* Tabelle */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-dark-border">
              <th className="pb-3 pr-4">Verein</th>
              <th className="pb-3 pr-4">Ort</th>
              <th className="pb-3 pr-4">Kontakt</th>
              <th className="pb-3 pr-4 text-right">Menge (Vorjahr)</th>
              <th className="pb-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
            {gefilterteVereine.map(({ kunde }) => {
              const adresse = kunde.lieferadresse || kunde.rechnungsadresse;

              return (
                <tr
                  key={kunde.id}
                  className="group hover:bg-gray-50 dark:hover:bg-dark-bg cursor-pointer"
                  onClick={() => navigate(`/kundenliste?kunde=${kunde.id}`)}
                >
                  <td className="py-3 pr-4">
                    <div className="font-medium text-gray-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400">
                      {kunde.name}
                    </div>
                    {kunde.kundennummer && (
                      <div className="text-xs text-gray-400">
                        #{kunde.kundennummer}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {adresse ? (
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        <div>{adresse.plz} {adresse.ort}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-col gap-1 text-sm">
                      {kunde.email ? (
                        <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1 truncate max-w-[200px]">
                          <Mail className="w-3 h-3" />
                          {kunde.email}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <span className="text-gray-900 dark:text-white font-medium">
                      {kunde.tonnenLetztesJahr ? `${kunde.tonnenLetztesJahr} t` : '-'}
                    </span>
                  </td>
                  <td className="py-3">
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-amber-500" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlatzbauerlVereine;
