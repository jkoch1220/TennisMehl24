import { useCallback, useEffect, useState } from 'react';
import { ScrollText, Loader2, Search, ChevronDown, AlertCircle } from 'lucide-react';
import {
  loadAuditEintraege,
  AuditLogEintrag,
  AuditLogFilter,
} from '../../services/auditService';
import { listUsers, DirectoryUser } from '../../services/userDirectoryService';

/**
 * Audit-Log-Tool (D13, Admin-only via ProtectedRoute + Collection-Permissions):
 * filterbar nach User, Zeitraum, Entitätstyp und Aktion; Volltext in summary;
 * Cursor-Pagination ("Mehr laden").
 */

const ACTION_LABELS: Record<string, string> = {
  create: 'Erstellt',
  update: 'Bearbeitet',
  delete: 'Gelöscht',
  login: 'Anmeldung',
  password_change: 'Passwort',
  permission_change: 'Rechte',
  role_change: 'Rolle',
  user_create: 'User angelegt',
};

const ENTITY_LABELS: Record<string, string> = {
  projekt: 'Projekt',
  dokument: 'Dokument (Angebot/AB/Rechnung…)',
  angebots_lauf: 'Massen-Angebots-Lauf',
  debitor: 'Debitor',
  mahnwesen: 'Mahnwesen',
  kreditor: 'Kreditor',
  kreditor_rechnung: 'Kreditoren-Rechnung',
  stammdaten: 'Stammdaten',
  chat: 'Chat',
  user: 'Benutzer',
  role: 'Rolle',
  permissions: 'Berechtigungen',
};

const formatZeitpunkt = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const AuditLogTool = () => {
  const [eintraege, setEintraege] = useState<AuditLogEintrag[]>([]);
  const [hatMehr, setHatMehr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nachladen, setNachladen] = useState(false);
  const [fehler, setFehler] = useState('');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [aufgeklappt, setAufgeklappt] = useState<string | null>(null);

  // Filter
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterVon, setFilterVon] = useState('');
  const [filterBis, setFilterBis] = useState('');
  const [suche, setSuche] = useState('');

  const aktuellerFilter = useCallback((): AuditLogFilter => ({
    userId: filterUser || undefined,
    action: filterAction || undefined,
    entityType: filterEntity || undefined,
    von: filterVon || undefined,
    bis: filterBis || undefined,
    suche: suche.trim() || undefined,
  }), [filterUser, filterAction, filterEntity, filterVon, filterBis, suche]);

  const lade = useCallback(async () => {
    setLoading(true);
    setFehler('');
    try {
      const result = await loadAuditEintraege(aktuellerFilter());
      setEintraege(result.eintraege);
      setHatMehr(result.hatMehr);
    } catch (error) {
      console.error('❌ Audit-Log konnte nicht geladen werden:', error);
      setFehler((error as Error).message || 'Audit-Log konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [aktuellerFilter]);

  const ladeMehr = async () => {
    if (eintraege.length === 0) return;
    setNachladen(true);
    try {
      const cursor = eintraege[eintraege.length - 1].$id;
      const result = await loadAuditEintraege(aktuellerFilter(), cursor);
      setEintraege((prev) => [...prev, ...result.eintraege]);
      setHatMehr(result.hatMehr);
    } catch (error) {
      setFehler((error as Error).message || 'Nachladen fehlgeschlagen');
    } finally {
      setNachladen(false);
    }
  };

  useEffect(() => {
    lade();
  }, [lade]);

  useEffect(() => {
    listUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const selectKlasse =
    'p-2 border-2 border-gray-300 dark:border-dark-border rounded-lg text-sm bg-white dark:bg-dark-surface focus:border-red-500 focus:outline-none';

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-500 to-gray-700 flex items-center justify-center">
          <ScrollText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">Audit-Log</h1>
          <p className="text-sm text-gray-600 dark:text-dark-textMuted">
            Wer hat was wann geändert — Einträge sind unveränderlich, Aufbewahrung 2 Jahre (D11)
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className={selectKlasse}>
          <option value="">Alle User</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className={selectKlasse}>
          <option value="">Alle Aktionen</option>
          {Object.entries(ACTION_LABELS).map(([wert, label]) => (
            <option key={wert} value={wert}>{label}</option>
          ))}
        </select>
        <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)} className={selectKlasse}>
          <option value="">Alle Bereiche</option>
          {Object.entries(ENTITY_LABELS).map(([wert, label]) => (
            <option key={wert} value={wert}>{label}</option>
          ))}
        </select>
        <input type="date" value={filterVon} onChange={(e) => setFilterVon(e.target.value)} className={selectKlasse} title="Von" />
        <input type="date" value={filterBis} onChange={(e) => setFilterBis(e.target.value)} className={selectKlasse} title="Bis" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lade()}
            placeholder="Volltext (Enter)…"
            className={`${selectKlasse} w-full pl-8`}
          />
        </div>
      </div>

      {fehler && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {fehler}
        </div>
      )}

      {/* Liste */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : eintraege.length === 0 ? (
          <p className="text-center text-sm text-gray-500 dark:text-dark-textMuted py-16">
            Keine Einträge für die gewählten Filter.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-dark-border">
            {eintraege.map((eintrag) => (
              <li key={eintrag.$id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <button
                  className="w-full text-left"
                  onClick={() => setAufgeklappt(aufgeklappt === eintrag.$id ? null : eintrag.$id)}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-gray-500 dark:text-dark-textMuted whitespace-nowrap w-32">
                      {formatZeitpunkt(eintrag.timestamp)}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-dark-textMuted">
                      {eintrag.userName || 'System'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      {ACTION_LABELS[eintrag.action] ?? eintrag.action}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      {ENTITY_LABELS[eintrag.entityType] ?? eintrag.entityType}
                    </span>
                    <span className="text-sm text-gray-800 dark:text-dark-text flex-1 min-w-[200px]">
                      {eintrag.summary}
                    </span>
                    {eintrag.changes && (
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform ${aufgeklappt === eintrag.$id ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>
                </button>
                {aufgeklappt === eintrag.$id && eintrag.changes && (
                  <div className="mt-2 ml-32 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1">
                    {Object.entries(eintrag.changes).map(([feld, wert]) => (
                      <div key={feld} className="flex gap-2">
                        <span className="font-semibold text-gray-700 dark:text-dark-textMuted">{feld}:</span>
                        <span className="text-red-600 line-through">{String(wert.alt ?? '—')}</span>
                        <span>→</span>
                        <span className="text-green-700">{String(wert.neu ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {hatMehr && !loading && (
        <div className="text-center">
          <button
            onClick={ladeMehr}
            disabled={nachladen}
            className="px-5 py-2 rounded-lg border-2 border-gray-300 dark:border-dark-border text-sm font-semibold text-gray-700 dark:text-dark-textMuted hover:border-gray-400 disabled:opacity-50"
          >
            {nachladen ? 'Lädt…' : 'Mehr laden'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AuditLogTool;
