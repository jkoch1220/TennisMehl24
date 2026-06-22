import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../contexts/NotificationContext';
import type { Benachrichtigung } from '../../types/notification';
import { getTypIcon, getTypFarbe, formatRelativeTime } from './notificationUi';

/**
 * Glocke im Header mit Badge (= ungelesenCount) und Dropdown-Panel.
 * Beim Öffnen werden die sichtbaren Meldungen als gelesen markiert (Badge sinkt),
 * erst das Abhaken entfernt sie aus der offenen Liste.
 */
const NotificationBell = () => {
  const navigate = useNavigate();
  const {
    notifications,
    ungelesenCount,
    offeneCount,
    markiereGelesen,
    markiereAlleGelesen,
    hakeAb,
    hakeAlleAb,
  } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Beim Öffnen alle sichtbaren als gelesen markieren (Badge runter)
  useEffect(() => {
    if (isOpen && ungelesenCount > 0) {
      markiereAlleGelesen();
    }
    // Nur beim Öffnen auslösen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Klick außerhalb schließt das Dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Klick auf Eintrag: als gelesen markieren + zum Ursprung navigieren
  const handleEintragKlick = (notification: Benachrichtigung) => {
    markiereGelesen(notification.$id);
    setIsOpen(false);
    navigate(notification.link);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Glocken-Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative p-1.5 text-[#1d1d1f]/60 dark:text-white/60 hover:text-[#1d1d1f] dark:hover:text-white transition-colors"
        title="Benachrichtigungen"
        aria-label="Benachrichtigungen"
      >
        <Bell className="w-[18px] h-[18px]" />
        {ungelesenCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
            {ungelesenCount > 9 ? '9+' : ungelesenCount}
          </span>
        )}
      </button>

      {/* Dropdown-Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[70vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-orange-500 to-red-500 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Bell className="w-5 h-5" />
                <h3 className="font-semibold">Benachrichtigungen</h3>
                {offeneCount > 0 && (
                  <span className="text-xs bg-white/25 rounded-full px-2 py-0.5">{offeneCount}</span>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white transition-colors"
                aria-label="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {offeneCount > 0 && (
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => markiereAlleGelesen()}
                  className="text-xs text-white/90 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Alle als gelesen
                </button>
                <button
                  onClick={() => hakeAlleAb()}
                  className="text-xs text-white/90 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Alle abhaken
                </button>
              </div>
            )}
          </div>

          {/* Liste */}
          <div className="overflow-y-auto flex-1">
            {offeneCount === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">Keine neuen Benachrichtigungen</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {notifications.map((n) => (
                    <div
                      key={n.$id}
                      className="flex items-start gap-3 p-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      {/* Typ-Icon */}
                      <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${getTypFarbe(n.typ)}`}>
                        {getTypIcon(n.typ, 'w-[18px] h-[18px]')}
                      </div>

                      {/* Inhalt (klickbar -> navigieren) */}
                      <button
                        onClick={() => handleEintragKlick(n)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {n.titel}
                          </span>
                          {n.prioritaet === 'hoch' && (
                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">
                              !
                            </span>
                          )}
                          <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        </div>
                        {n.nachricht && (
                          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{n.nachricht}</p>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatRelativeTime(n.erstelltAm)}
                        </span>
                      </button>

                      {/* Abhaken */}
                      <button
                        onClick={() => hakeAb(n.$id)}
                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                        title="Abhaken (erledigt)"
                        aria-label="Abhaken"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
