import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ChatNachricht } from '../../types/chatNachricht';
import { projektService } from '../../services/projektService';
import { useAuth } from '../../contexts/AuthContext';
import { Query } from 'appwrite';
import { databases, DATABASE_ID, CHAT_NACHRICHTEN_COLLECTION_ID } from '../../config/appwrite';

interface ProjektInfo {
  id: string;
  name: string;
  kundenname: string;
}

const GlobalChatDropdown = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [nachrichten, setNachrichten] = useState<(ChatNachricht & { projekt?: ProjektInfo })[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Alle neuesten Nachrichten laden
  const loadNachrichten = async () => {
    try {
      setLoading(true);
      // Lade die neuesten 50 Nachrichten
      const response = await databases.listDocuments(DATABASE_ID, CHAT_NACHRICHTEN_COLLECTION_ID, [
        Query.orderDesc('$createdAt'),
        Query.limit(50),
      ]);

      const nachrichtenRaw = response.documents.map((doc: any) => {
        if (doc.data && typeof doc.data === 'string') {
          try {
            const parsed = JSON.parse(doc.data);
            return { ...parsed, id: parsed.id || doc.$id };
          } catch {
            // Fallback
          }
        }
        return {
          id: doc.$id,
          projektId: doc.projektId,
          text: doc.text,
          mentions: doc.mentions || [],
          erstelltAm: doc.erstelltAm || doc.$createdAt,
          erstelltVon: doc.erstelltVon,
          erstelltVonName: doc.erstelltVonName,
        };
      });

      // Projekt-Infos für jede Nachricht laden
      const projektIds = [...new Set(nachrichtenRaw.map((n: ChatNachricht) => n.projektId))];
      const projektInfoMap: Record<string, ProjektInfo> = {};

      for (const projektId of projektIds) {
        try {
          const projekt = await projektService.getProjekt(projektId as string);
          if (projekt) {
            projektInfoMap[projektId as string] = {
              id: projekt.id,
              name: projekt.projektName || projekt.kundenname,
              kundenname: projekt.kundenname,
            };
          }
        } catch {
          // Projekt nicht gefunden - ignorieren
        }
      }

      // Nachrichten mit Projekt-Info anreichern
      const nachrichtenMitProjekt = nachrichtenRaw.map((n: ChatNachricht) => ({
        ...n,
        projekt: projektInfoMap[n.projektId],
      }));

      setNachrichten(nachrichtenMitProjekt);
    } catch (error) {
      console.error('Fehler beim Laden der Chat-Nachrichten:', error);
    } finally {
      setLoading(false);
    }
  };

  // Laden wenn Dropdown geöffnet wird
  useEffect(() => {
    if (isOpen) {
      loadNachrichten();
    }
  }, [isOpen]);

  // Klick außerhalb schließt Dropdown
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

  // Text mit hervorgehobenen Mentions rendern
  const renderTextWithMentions = (text: string) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="text-blue-600 dark:text-blue-400 font-semibold">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Relative Zeit formatieren
  const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min`;
    if (diffHours < 24) return `vor ${diffHours} Std`;
    if (diffDays < 7) return `vor ${diffDays} Tagen`;
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  };

  // Zum Projekt navigieren
  const handleNavigate = (projektId: string) => {
    setIsOpen(false);
    navigate(`/projektabwicklung/${projektId}`);
  };

  // Anzahl ungelesener Nachrichten (vereinfacht: alle außer eigene)
  const unreadCount = nachrichten.filter(n => n.erstelltVon !== user?.$id).length;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        title="Chat-Nachrichten"
      >
        <MessageCircle className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-dark-xl border border-gray-200 dark:border-slate-700 overflow-hidden z-50">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-indigo-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <MessageCircle className="w-5 h-5" />
                <h3 className="font-semibold">Alle Chat-Nachrichten</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Nachrichten-Liste */}
          <div className="overflow-y-auto max-h-[calc(70vh-80px)]">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Lade Nachrichten...</p>
              </div>
            ) : nachrichten.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">Noch keine Nachrichten</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {nachrichten.map((nachricht) => (
                  <button
                    key={nachricht.id}
                    onClick={() => nachricht.projekt && handleNavigate(nachricht.projektId)}
                    className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {/* Projekt-Name */}
                    {nachricht.projekt && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                          {nachricht.projekt.name}
                        </span>
                        <ExternalLink className="w-3 h-3 text-gray-400" />
                      </div>
                    )}

                    {/* Autor und Zeit */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {nachricht.erstelltVonName}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(nachricht.erstelltAm)}
                      </span>
                    </div>

                    {/* Nachrichtentext */}
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                      {renderTextWithMentions(nachricht.text)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalChatDropdown;
