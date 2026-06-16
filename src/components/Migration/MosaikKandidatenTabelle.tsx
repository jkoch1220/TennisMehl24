import { useMemo, useState } from 'react';
import { Search, Filter, X, ChevronRight } from 'lucide-react';
import { MigrationKandidat, MigrationStatus } from '../../types/mosaik';
import { SaisonKunde } from '../../types/saisonplanung';

interface Props {
  kandidaten: MigrationKandidat[];
  crmKundenById: Map<string, SaisonKunde>;
  onOpen: (id: string) => void;
}

const STATUS_LABEL: Record<MigrationStatus, string> = {
  neu: 'Neu',
  auto_match: 'Auto-Match',
  review: 'Prüfen',
  bestaetigt: 'Bestätigt',
  angelegt: 'Angelegt',
  uebersprungen: 'Übersprungen',
  fehler: 'Fehler',
};

const STATUS_FARBE: Record<MigrationStatus, string> = {
  neu: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  auto_match:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  bestaetigt: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  angelegt:
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  uebersprungen:
    'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  fehler: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export default function MosaikKandidatenTabelle({
  kandidaten,
  crmKundenById,
  onOpen,
}: Props) {
  const [suche, setSuche] = useState('');
  const [statusFilter, setStatusFilter] = useState<MigrationStatus | 'alle'>('alle');
  const [gruppeFilter, setGruppeFilter] = useState<string>('alle');
  const [bundeslandFilter, setBundeslandFilter] = useState<string>('alle');
  const [inaktiveZeigen, setInaktiveZeigen] = useState(false);

  const gruppen = useMemo(() => {
    const set = new Set<string>();
    kandidaten.forEach((k) => k.gruppe && set.add(k.gruppe));
    return Array.from(set).sort();
  }, [kandidaten]);

  const bundeslaender = useMemo(() => {
    const set = new Set<string>();
    kandidaten.forEach((k) => k.bundesland && set.add(k.bundesland));
    return Array.from(set).sort();
  }, [kandidaten]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return kandidaten.filter((k) => {
      if (!inaktiveZeigen && k.mosaikInaktiv) return false;
      if (statusFilter !== 'alle' && k.status !== statusFilter) return false;
      if (gruppeFilter !== 'alle' && k.gruppe !== gruppeFilter) return false;
      if (bundeslandFilter !== 'alle' && k.bundesland !== bundeslandFilter) return false;
      if (q) {
        const r = k.data.rohdaten;
        const haystack = [
          k.mosaikKurzname,
          r.Name1,
          r.Name2,
          r.Name3,
          r.Ort,
          r.PLZ,
          r.Straße,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [kandidaten, suche, statusFilter, gruppeFilter, bundeslandFilter, inaktiveZeigen]);

  function resetFilter() {
    setSuche('');
    setStatusFilter('alle');
    setGruppeFilter('alle');
    setBundeslandFilter('alle');
    setInaktiveZeigen(false);
  }

  const istGefiltert =
    suche !== '' ||
    statusFilter !== 'alle' ||
    gruppeFilter !== 'alle' ||
    bundeslandFilter !== 'alle' ||
    inaktiveZeigen;

  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Suche: Name, Ort, PLZ, Kurzname …"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MigrationStatus | 'alle')}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value="alle">Alle Status</option>
            {(Object.keys(STATUS_LABEL) as MigrationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={gruppeFilter}
            onChange={(e) => setGruppeFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value="alle">Alle Gruppen</option>
            {gruppen.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={bundeslandFilter}
            onChange={(e) => setBundeslandFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value="alle">Alle Bundesländer</option>
            {bundeslaender.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={inaktiveZeigen}
              onChange={(e) => setInaktiveZeigen(e.target.checked)}
              className="rounded"
            />
            Mosaik-inaktive
          </label>
          {istGefiltert && (
            <button
              onClick={resetFilter}
              className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              <X className="w-3 h-3" />
              Filter zurücksetzen
            </button>
          )}
        </div>
        <div className="mt-3 text-xs text-gray-600 dark:text-dark-textMuted flex items-center gap-2">
          <Filter className="w-3.5 h-3.5" />
          {gefiltert.length} von {kandidaten.length} Kandidaten
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Kurzname</th>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Ort</th>
              <th className="text-left px-4 py-3 font-medium">Gruppe</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Score</th>
              <th className="text-left px-4 py-3 font-medium">Match</th>
              <th className="px-2 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {gefiltert.map((k) => {
              const r = k.data.rohdaten;
              const match = k.matchKundeId ? crmKundenById.get(k.matchKundeId) : undefined;
              return (
                <tr
                  key={k.id}
                  onClick={() => onOpen(k.id)}
                  className="hover:bg-orange-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {k.mosaikKurzname}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {r.Name2 || r.Name3 || r.Name1 || '—'}
                    </div>
                    {k.mosaikInaktiv && (
                      <div className="text-[10px] uppercase text-red-600 dark:text-red-400 mt-0.5">
                        inaktiv in Mosaik
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {r.PLZ ? `${r.PLZ} ` : ''}
                    {r.Ort || ''}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {k.gruppe || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_FARBE[k.status]}`}
                    >
                      {STATUS_LABEL[k.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">
                    {typeof k.matchScore === 'number' ? (k.matchScore * 100).toFixed(0) + ' %' : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                    {match ? match.name : k.matchKundeId ? '(gelöscht)' : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-gray-400">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              );
            })}
            {gefiltert.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                  Keine Kandidaten passen zum Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
