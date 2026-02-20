import { useState } from 'react';
import {
  Mail,
  Search,
  ChevronRight,
  Plus,
  Phone,
  User,
  Info,
} from 'lucide-react';
import { SaisonKundeMitDaten } from '../../types/saisonplanung';
import { useNavigate } from 'react-router-dom';
import VereinSchnellerfassung from './VereinSchnellerfassung';

interface PlatzbauerlVereineProps {
  vereine: SaisonKundeMitDaten[];
  platzbauerId: string;
  platzbauerName: string;
  saisonjahr: number;
  onRefresh?: () => void;
}

const PlatzbauerlVereine = ({
  vereine,
  platzbauerId,
  platzbauerName,
  onRefresh,
}: PlatzbauerlVereineProps) => {
  const navigate = useNavigate();
  const [suche, setSuche] = useState('');
  const [showSchnellerfassung, setShowSchnellerfassung] = useState(false);

  // Filter nur nach Suche (alle Vereine hier sind bereits "ueber_platzbauer")
  const gefilterteVereine = vereine.filter(v => {
    const kunde = v.kunde;
    if (!suche.trim()) return true;
    const sucheLower = suche.toLowerCase();
    return (
      kunde.name.toLowerCase().includes(sucheLower) ||
      kunde.lieferadresse?.ort?.toLowerCase().includes(sucheLower) ||
      kunde.lieferadresse?.plz?.includes(suche)
    );
  });

  if (vereine.length === 0) {
    return (
      <>
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">
            Keine Vereine mit Bezugsweg &quot;Platzbauer&quot; zugeordnet.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Hier werden nur Vereine angezeigt, die über den Platzbauer bestellen (Sammelbestellung).
          </p>
          <button
            onClick={() => setShowSchnellerfassung(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Verein anlegen
          </button>
        </div>
        {showSchnellerfassung && (
          <VereinSchnellerfassung
            platzbauerId={platzbauerId}
            platzbauerName={platzbauerName}
            onClose={() => setShowSchnellerfassung(false)}
            onSuccess={() => onRefresh?.()}
          />
        )}
      </>
    );
  }

  return (
    <>
    <div className="space-y-4">
      {/* Info-Hinweis */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <span className="text-blue-700 dark:text-blue-300">
          Vereine mit Bezugsweg &quot;Platzbauer&quot; – bestellen über {platzbauerName} (Sammelbestellung).
          Vereine mit &quot;Direkt Instandsetzung&quot; finden Sie im Tab <strong>Instandsetzung</strong>.
        </span>
      </div>

      {/* Filter-Leiste */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Suche */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Verein suchen..."
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none"
          />
        </div>

        {/* Fast Add Button */}
        <button
          onClick={() => setShowSchnellerfassung(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Verein anlegen
        </button>
      </div>

      {/* Anzahl */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {gefilterteVereine.length} {gefilterteVereine.length === 1 ? 'Verein' : 'Vereine'}
        {suche && ` gefunden`}
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
                  onClick={() => navigate(`/saisonplanung?kunde=${kunde.id}`)}
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
                      {kunde.dispoAnsprechpartner?.name ? (
                        <>
                          <span className="text-gray-900 dark:text-white flex items-center gap-1.5">
                            <User className="w-3 h-3 flex-shrink-0 text-gray-400" />
                            {kunde.dispoAnsprechpartner.name}
                          </span>
                          {kunde.dispoAnsprechpartner.telefon && (
                            <a
                              href={`tel:${kunde.dispoAnsprechpartner.telefon}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-600 dark:text-gray-300 flex items-center gap-1.5 hover:text-amber-600 dark:hover:text-amber-400"
                            >
                              <Phone className="w-3 h-3 flex-shrink-0" />
                              {kunde.dispoAnsprechpartner.telefon}
                            </a>
                          )}
                        </>
                      ) : kunde.email ? (
                        <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1 truncate max-w-[180px]">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          {kunde.email}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Kein Kontakt</span>
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

    {/* Schnellerfassung Modal */}
    {showSchnellerfassung && (
      <VereinSchnellerfassung
        platzbauerId={platzbauerId}
        platzbauerName={platzbauerName}
        onClose={() => setShowSchnellerfassung(false)}
        onSuccess={() => onRefresh?.()}
      />
    )}
    </>
  );
};

export default PlatzbauerlVereine;
