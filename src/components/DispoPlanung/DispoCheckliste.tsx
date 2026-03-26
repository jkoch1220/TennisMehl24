/**
 * DispoCheckliste.tsx
 *
 * Übersichtliche Checklisten-Ansicht für die Disposition.
 * Ermöglicht schnelles Abhaken von Projekten als:
 * - Abgestimmt (Termin mit Kunde bestätigt)
 * - Gedruckt (Lieferschein gedruckt)
 * - Geliefert (ausgeliefert)
 * - Abgerechnet (komplett fertig)
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Phone,
  Printer,
  Truck,
  Receipt,
  ExternalLink,
  Search,
  SortAsc,
  SortDesc,
} from 'lucide-react';
import { Projekt } from '../../types/projekt';
import { projektService } from '../../services/projektService';
import { useNavigate } from 'react-router-dom';

// Checklisten-Status Typen
type ChecklistenStatus = 'abgestimmt' | 'gedruckt' | 'geliefert' | 'abgerechnet';

interface DispoChecklisteProps {
  projekte: Projekt[];
}

// Status-Konfiguration mit Icons und Farben
const STATUS_CONFIG: Record<ChecklistenStatus, {
  label: string;
  icon: typeof CheckCircle2;
  activeColor: string;
  inactiveColor: string;
  bgActive: string;
  bgInactive: string;
}> = {
  abgestimmt: {
    label: 'Abgestimmt',
    icon: Phone,
    activeColor: 'text-blue-600 dark:text-blue-400',
    inactiveColor: 'text-gray-300 dark:text-gray-600',
    bgActive: 'bg-blue-100 dark:bg-blue-900/50',
    bgInactive: 'bg-gray-100 dark:bg-gray-800',
  },
  gedruckt: {
    label: 'Gedruckt',
    icon: Printer,
    activeColor: 'text-purple-600 dark:text-purple-400',
    inactiveColor: 'text-gray-300 dark:text-gray-600',
    bgActive: 'bg-purple-100 dark:bg-purple-900/50',
    bgInactive: 'bg-gray-100 dark:bg-gray-800',
  },
  geliefert: {
    label: 'Geliefert',
    icon: Truck,
    activeColor: 'text-green-600 dark:text-green-400',
    inactiveColor: 'text-gray-300 dark:text-gray-600',
    bgActive: 'bg-green-100 dark:bg-green-900/50',
    bgInactive: 'bg-gray-100 dark:bg-gray-800',
  },
  abgerechnet: {
    label: 'Abgerechnet',
    icon: Receipt,
    activeColor: 'text-emerald-600 dark:text-emerald-400',
    inactiveColor: 'text-gray-300 dark:text-gray-600',
    bgActive: 'bg-emerald-100 dark:bg-emerald-900/50',
    bgInactive: 'bg-gray-100 dark:bg-gray-800',
  },
};

// Kalenderwoche berechnen (ISO 8601)
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Aktuelle KW ermitteln
function getCurrentWeek(): number {
  return getISOWeek(new Date());
}

// KW-Optionen für Filter
function getKWOptions(): { value: number; label: string }[] {
  const currentKW = getCurrentWeek();
  const options: { value: number; label: string }[] = [];
  for (let offset = -2; offset <= 8; offset++) {
    const kw = currentKW + offset;
    if (kw > 0 && kw <= 53) {
      options.push({
        value: kw,
        label: `KW ${kw}${offset === 0 ? ' (aktuell)' : ''}`,
      });
    }
  }
  return options;
}

// Extrahiere Lieferdaten aus Projekt
function extractLieferKW(projekt: Projekt): number | null {
  if (projekt.lieferKW) return projekt.lieferKW;

  if (projekt.auftragsbestaetigungsDaten) {
    try {
      const abDaten = typeof projekt.auftragsbestaetigungsDaten === 'string'
        ? JSON.parse(projekt.auftragsbestaetigungsDaten)
        : projekt.auftragsbestaetigungsDaten;
      if (abDaten.lieferKW) return abDaten.lieferKW;
    } catch {
      // Ignore
    }
  }

  return null;
}

// Extrahiere Tonnage aus AB-Daten
function extractTonnage(projekt: Projekt): number {
  if (projekt.angefragteMenge) return projekt.angefragteMenge;

  if (projekt.auftragsbestaetigungsDaten) {
    try {
      const abDaten = typeof projekt.auftragsbestaetigungsDaten === 'string'
        ? JSON.parse(projekt.auftragsbestaetigungsDaten)
        : projekt.auftragsbestaetigungsDaten;

      if (abDaten.positionen && Array.isArray(abDaten.positionen)) {
        // Summiere Ziegelmehl-Positionen
        let summe = 0;
        for (const pos of abDaten.positionen) {
          if (pos.einheit === 't' || pos.einheit === 'Tonnen') {
            summe += pos.menge || 0;
          }
        }
        if (summe > 0) return summe;
      }
    } catch {
      // Ignore
    }
  }

  return 0;
}

type SortField = 'kundenname' | 'kw' | 'tonnage' | 'status';
type SortDirection = 'asc' | 'desc';

const DispoCheckliste = ({ projekte }: DispoChecklisteProps) => {
  const navigate = useNavigate();

  // Lokaler State für Projekte (für optimistische Updates ohne Seiten-Reload)
  const [lokaleProjekte, setLokaleProjekte] = useState<Projekt[]>(projekte);

  // Sync mit Props wenn sich diese ändern (z.B. bei Tab-Wechsel)
  useEffect(() => {
    setLokaleProjekte(projekte);
  }, [projekte]);

  // State
  const [suche, setSuche] = useState('');
  const [filterKW, setFilterKW] = useState<number | null>(getCurrentWeek());
  const [sortField, setSortField] = useState<SortField>('kw');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [updating, setUpdating] = useState<string | null>(null);
  const [showNurOffene, setShowNurOffene] = useState(true);

  // Checklisten-Status aus Projekt-Feldern ableiten
  const getChecklistenStatus = useCallback((projekt: Projekt): Record<ChecklistenStatus, boolean> => {
    // Mapping: dispoStatus -> Checklisten-Felder
    // Wir verwenden die vorhandenen Felder im Projekt
    const dispoStatus = projekt.dispoStatus || 'offen';

    return {
      abgestimmt: projekt.kommuniziertesDatum !== undefined && projekt.kommuniziertesDatum !== '',
      gedruckt: dispoStatus === 'geplant' || dispoStatus === 'beladen' || dispoStatus === 'unterwegs' || dispoStatus === 'geliefert',
      geliefert: dispoStatus === 'geliefert' || projekt.status === 'rechnung' || projekt.status === 'bezahlt',
      abgerechnet: projekt.status === 'rechnung' || projekt.status === 'bezahlt',
    };
  }, []);

  // Status togglen
  const toggleStatus = useCallback(async (projekt: Projekt, status: ChecklistenStatus) => {
    const projektId = (projekt as any).$id || projekt.id;
    setUpdating(projektId);

    try {
      const currentStatus = getChecklistenStatus(projekt);
      const newValue = !currentStatus[status];

      // Je nach Status unterschiedliche Felder updaten
      const updates: Partial<Projekt> = {};

      switch (status) {
        case 'abgestimmt':
          updates.kommuniziertesDatum = newValue ? new Date().toISOString().split('T')[0] : undefined;
          break;

        case 'gedruckt':
          updates.dispoStatus = newValue ? 'geplant' : 'offen';
          break;

        case 'geliefert':
          if (newValue) {
            updates.dispoStatus = 'geliefert';
            // Optional: Status auf lieferschein setzen wenn noch nicht
            if (projekt.status === 'auftragsbestaetigung') {
              updates.status = 'lieferschein';
            }
          } else {
            updates.dispoStatus = 'geplant';
          }
          break;

        case 'abgerechnet':
          if (newValue) {
            updates.status = 'rechnung';
            updates.dispoStatus = 'geliefert';
          } else {
            updates.status = 'lieferschein';
          }
          break;
      }

      // Optimistisches Update des lokalen State
      setLokaleProjekte(prev => prev.map(p => {
        const pId = (p as any).$id || p.id;
        if (pId === projektId) {
          return { ...p, ...updates };
        }
        return p;
      }));

      // Im Hintergrund speichern (ohne await für sofortige UI-Reaktion)
      projektService.updateProjekt(projektId, updates).catch(error => {
        console.error('Fehler beim Speichern:', error);
        // Bei Fehler: Reload der echten Daten
        // (optional: könnte auch rollback machen)
      });
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
    } finally {
      setUpdating(null);
    }
  }, [getChecklistenStatus]);

  // Gefilterte und sortierte Projekte
  const gefilterteProjekte = useMemo(() => {
    let result = lokaleProjekte.filter(p => {
      // Nur AB und Lieferschein Status (wie in der Hauptansicht)
      if (!['auftragsbestaetigung', 'lieferschein'].includes(p.status)) {
        // Aber zeige auch Rechnung wenn "Nur offene" deaktiviert
        if (showNurOffene || p.status !== 'rechnung') {
          return false;
        }
      }

      // KW Filter
      if (filterKW !== null) {
        const projektKW = extractLieferKW(p);
        if (projektKW !== filterKW) return false;
      }

      // Suche
      if (suche) {
        const searchLower = suche.toLowerCase();
        const matchesName = p.kundenname?.toLowerCase().includes(searchLower);
        const matchesNr = p.kundennummer?.toLowerCase().includes(searchLower);
        const matchesAB = p.auftragsbestaetigungsnummer?.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesNr && !matchesAB) return false;
      }

      // Nur offene (nicht komplett abgehakt)
      if (showNurOffene) {
        const status = getChecklistenStatus(p);
        if (status.abgerechnet) return false;
      }

      return true;
    });

    // Sortieren
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'kundenname':
          comparison = (a.kundenname || '').localeCompare(b.kundenname || '');
          break;
        case 'kw': {
          const kwA = extractLieferKW(a) || 99;
          const kwB = extractLieferKW(b) || 99;
          comparison = kwA - kwB;
          break;
        }
        case 'tonnage': {
          const tA = extractTonnage(a);
          const tB = extractTonnage(b);
          comparison = tA - tB;
          break;
        }
        case 'status': {
          const statusA = getChecklistenStatus(a);
          const statusB = getChecklistenStatus(b);
          const scoreA = (statusA.abgestimmt ? 1 : 0) + (statusA.gedruckt ? 2 : 0) + (statusA.geliefert ? 4 : 0) + (statusA.abgerechnet ? 8 : 0);
          const scoreB = (statusB.abgestimmt ? 1 : 0) + (statusB.gedruckt ? 2 : 0) + (statusB.geliefert ? 4 : 0) + (statusB.abgerechnet ? 8 : 0);
          comparison = scoreA - scoreB;
          break;
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [lokaleProjekte, filterKW, suche, showNurOffene, sortField, sortDirection, getChecklistenStatus]);

  // Statistiken
  const stats = useMemo(() => {
    let abgestimmt = 0;
    let gedruckt = 0;
    let geliefert = 0;
    let abgerechnet = 0;
    let offen = 0;

    for (const p of gefilterteProjekte) {
      const s = getChecklistenStatus(p);
      if (s.abgerechnet) abgerechnet++;
      else if (s.geliefert) geliefert++;
      else if (s.gedruckt) gedruckt++;
      else if (s.abgestimmt) abgestimmt++;
      else offen++;
    }

    return { abgestimmt, gedruckt, geliefert, abgerechnet, offen, gesamt: gefilterteProjekte.length };
  }, [gefilterteProjekte, getChecklistenStatus]);

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const kwOptions = useMemo(() => getKWOptions(), []);

  return (
    <div className="space-y-4">
      {/* Header mit Filter */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          {/* Titel & Stats */}
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-orange-500" />
              Dispo-Checkliste
            </h2>
            <div className="flex gap-2 text-sm">
              <span className="px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded text-gray-600 dark:text-gray-400">
                {stats.gesamt} Aufträge
              </span>
              <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 rounded text-green-700 dark:text-green-300">
                {stats.geliefert + stats.abgerechnet} erledigt
              </span>
            </div>
          </div>

          {/* Filter */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Suche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Suchen..."
                className="pl-9 pr-4 py-2 w-48 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* KW Filter */}
            <select
              value={filterKW || ''}
              onChange={(e) => setFilterKW(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            >
              <option value="">Alle KW</option>
              {kwOptions.map(kw => (
                <option key={kw.value} value={kw.value}>{kw.label}</option>
              ))}
            </select>

            {/* Nur offene Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showNurOffene}
                onChange={(e) => setShowNurOffene(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Nur offene</span>
            </label>
          </div>
        </div>

        {/* Status-Legende */}
        <div className="mt-4 flex flex-wrap gap-4">
          {(Object.keys(STATUS_CONFIG) as ChecklistenStatus[]).map(status => {
            const config = STATUS_CONFIG[status];
            const Icon = config.icon;
            return (
              <div key={status} className="flex items-center gap-2 text-sm">
                <div className={`p-1 rounded ${config.bgActive}`}>
                  <Icon className={`w-4 h-4 ${config.activeColor}`} />
                </div>
                <span className="text-gray-600 dark:text-gray-400">{config.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700"
                  onClick={() => handleSort('kw')}
                >
                  <div className="flex items-center gap-1">
                    KW
                    {sortField === 'kw' && (sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700"
                  onClick={() => handleSort('kundenname')}
                >
                  <div className="flex items-center gap-1">
                    Kunde
                    {sortField === 'kundenname' && (sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700"
                  onClick={() => handleSort('tonnage')}
                >
                  <div className="flex items-center gap-1 justify-end">
                    Tonnen
                    {sortField === 'tonnage' && (sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Ort
                </th>
                {/* Status-Spalten */}
                {(Object.keys(STATUS_CONFIG) as ChecklistenStatus[]).map(status => {
                  const config = STATUS_CONFIG[status];
                  const Icon = config.icon;
                  return (
                    <th
                      key={status}
                      className="px-3 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
                      title={config.label}
                    >
                      <div className="flex justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                    </th>
                  );
                })}
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {gefilterteProjekte.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    Keine Aufträge gefunden
                  </td>
                </tr>
              ) : (
                gefilterteProjekte.map(projekt => {
                  const projektId = (projekt as any).$id || projekt.id;
                  const checkStatus = getChecklistenStatus(projekt);
                  const kw = extractLieferKW(projekt);
                  const tonnage = extractTonnage(projekt);
                  const isUpdating = updating === projektId;
                  const isComplete = checkStatus.abgerechnet;

                  return (
                    <tr
                      key={projektId}
                      className={`hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors ${
                        isComplete ? 'opacity-50' : ''
                      }`}
                    >
                      {/* KW */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center w-10 h-7 rounded text-sm font-bold ${
                          kw === getCurrentWeek()
                            ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300'
                            : kw && kw < getCurrentWeek()
                              ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300'
                        }`}>
                          {kw || '-'}
                        </span>
                      </td>

                      {/* Kunde */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {projekt.kundenname}
                        </div>
                        {projekt.auftragsbestaetigungsnummer && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            AB-{projekt.auftragsbestaetigungsnummer}
                          </div>
                        )}
                      </td>

                      {/* Tonnen */}
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-medium text-gray-900 dark:text-white">
                          {tonnage > 0 ? `${tonnage}t` : '-'}
                        </span>
                      </td>

                      {/* Ort */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[150px] block">
                          {projekt.lieferadresse?.ort || projekt.kundenPlzOrt?.split(' ').slice(1).join(' ') || '-'}
                        </span>
                      </td>

                      {/* Status-Buttons */}
                      {(Object.keys(STATUS_CONFIG) as ChecklistenStatus[]).map(status => {
                        const config = STATUS_CONFIG[status];
                        const isActive = checkStatus[status];

                        return (
                          <td key={status} className="px-3 py-3 text-center">
                            <button
                              onClick={() => toggleStatus(projekt, status)}
                              disabled={isUpdating}
                              className={`p-2 rounded-lg transition-all transform hover:scale-110 ${
                                isActive
                                  ? `${config.bgActive} ${config.activeColor}`
                                  : `${config.bgInactive} ${config.inactiveColor} hover:bg-gray-200 dark:hover:bg-gray-700`
                              } ${isUpdating ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                              title={isActive ? `${config.label} - Klicken zum Entfernen` : `Als ${config.label} markieren`}
                            >
                              {isActive ? (
                                <CheckCircle2 className="w-5 h-5" />
                              ) : (
                                <Circle className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                        );
                      })}

                      {/* Link zum Projekt */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/projektabwicklung/${projektId}`)}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-orange-500 transition-colors"
                          title="Projekt öffnen"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Stats */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap gap-4 justify-center">
          <StatBadge label="Offen" value={stats.offen} color="gray" />
          <StatBadge label="Abgestimmt" value={stats.abgestimmt} color="blue" />
          <StatBadge label="Gedruckt" value={stats.gedruckt} color="purple" />
          <StatBadge label="Geliefert" value={stats.geliefert} color="green" />
          <StatBadge label="Abgerechnet" value={stats.abgerechnet} color="emerald" />
        </div>
      </div>
    </div>
  );
};

// Statistik-Badge Komponente
interface StatBadgeProps {
  label: string;
  value: number;
  color: 'gray' | 'blue' | 'purple' | 'green' | 'emerald';
}

const StatBadge = ({ label, value, color }: StatBadgeProps) => {
  const colorClasses = {
    gray: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    green: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${colorClasses[color]}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
};

export default DispoCheckliste;
