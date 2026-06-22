import { useState, useMemo } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, Inbox } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../contexts/NotificationContext';
import type { NotificationTyp } from '../../types/notification';
import { getTypIcon, getTypFarbe, getTypLabel, formatRelativeTime } from './notificationUi';

type Filter = 'alle' | NotificationTyp;

/**
 * Benachrichtigungs-Bereich auf der Startseite.
 * Gleiche Datenquelle wie die Glocke (NotificationContext). Zeigt die offenen
 * Benachrichtigungen mit „Öffnen" (-> link) und „Abhaken".
 */
const NotificationsHomeSection = () => {
  const navigate = useNavigate();
  const {
    notifications,
    offeneCount,
    loading,
    markiereGelesen,
    markiereAlleGelesen,
    hakeAb,
    hakeAlleAb,
  } = useNotifications();
  const [filter, setFilter] = useState<Filter>('alle');

  // Welche Typen kommen aktuell vor? (für Filter-Buttons)
  const vorhandeneTypen = useMemo(() => {
    const set = new Set<NotificationTyp>();
    notifications.forEach((n) => set.add(n.typ));
    return Array.from(set);
  }, [notifications]);

  const gefiltert = useMemo(
    () => (filter === 'alle' ? notifications : notifications.filter((n) => n.typ === filter)),
    [notifications, filter]
  );

  const handleOeffnen = (id: string, link: string) => {
    markiereGelesen(id);
    navigate(link);
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg dark:shadow-dark-lg border border-transparent dark:border-dark-border overflow-hidden mb-8">
      {/* Kopf */}
      <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100 dark:border-dark-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white flex-shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">Benachrichtigungen</h2>
            <p className="text-sm text-gray-500 dark:text-dark-textMuted">
              {offeneCount === 0
                ? 'Alles erledigt'
                : `${offeneCount} offene ${offeneCount === 1 ? 'Benachrichtigung' : 'Benachrichtigungen'}`}
            </p>
          </div>
        </div>
        {offeneCount > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => markiereAlleGelesen()}
              className="hidden sm:flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-dark-textMuted hover:text-gray-900 dark:hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Alle gelesen
            </button>
            <button
              onClick={() => hakeAlleAb()}
              className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 px-2.5 py-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Alle abhaken
            </button>
          </div>
        )}
      </div>

      {/* Filter (nur wenn mehr als ein Typ vorkommt) */}
      {vorhandeneTypen.length > 1 && (
        <div className="flex items-center gap-2 px-5 pt-4 flex-wrap">
          <FilterChip aktiv={filter === 'alle'} onClick={() => setFilter('alle')} label="Alle" />
          {vorhandeneTypen.map((typ) => (
            <FilterChip
              key={typ}
              aktiv={filter === typ}
              onClick={() => setFilter(typ)}
              label={getTypLabel(typ)}
            />
          ))}
        </div>
      )}

      {/* Inhalt */}
      <div className="p-5">
        {loading ? (
          <div className="py-10 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto"></div>
            <p className="text-gray-500 dark:text-dark-textMuted mt-3 text-sm">Lade Benachrichtigungen...</p>
          </div>
        ) : gefiltert.length === 0 ? (
          <div className="py-10 text-center">
            <Inbox className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-dark-textMuted font-medium">
              Keine neuen Benachrichtigungen
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Neue Shop-Bestellungen und Anfragen erscheinen hier automatisch.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {gefiltert.map((n) => (
              <div
                key={n.$id}
                className="group flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-dark-border hover:border-gray-200 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                {/* Typ-Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${getTypFarbe(n.typ)}`}>
                  {getTypIcon(n.typ, 'w-5 h-5')}
                </div>

                {/* Inhalt */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {n.titel}
                    </span>
                    {n.prioritaet === 'hoch' && (
                      <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded uppercase">
                        Wichtig
                      </span>
                    )}
                  </div>
                  {n.nachricht && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{n.nachricht}</p>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatRelativeTime(n.erstelltAm)}
                  </span>
                </div>

                {/* Aktionen */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleOeffnen(n.$id, n.link)}
                    className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-200 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Öffnen
                  </button>
                  <button
                    onClick={() => hakeAb(n.$id)}
                    className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                    title="Abhaken (erledigt)"
                    aria-label="Abhaken"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const FilterChip = ({
  aktiv,
  onClick,
  label,
}: {
  aktiv: boolean;
  onClick: () => void;
  label: string;
}) => (
  <button
    onClick={onClick}
    className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
      aktiv
        ? 'bg-red-600 text-white'
        : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
    }`}
  >
    {label}
  </button>
);

export default NotificationsHomeSection;
