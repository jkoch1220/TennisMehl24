import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, X, AtSign } from 'lucide-react';
import { ChatNachricht } from '../../types/chatNachricht';
import { chatNachrichtenService } from '../../services/chatNachrichtenService';
import { getCachedUsersList, CachedUser } from '../../services/userCacheService';
import { useAuth } from '../../contexts/AuthContext';

interface ProjektChatProps {
  projektId: string;
  projektName?: string;
}

const ProjektChat = ({ projektId, projektName }: ProjektChatProps) => {
  const { user } = useAuth();
  const [nachrichten, setNachrichten] = useState<ChatNachricht[]>([]);
  const [neueNachricht, setNeueNachricht] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [users, setUsers] = useState<CachedUser[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Nachrichten laden
  useEffect(() => {
    const loadNachrichten = async () => {
      try {
        setLoading(true);
        const loaded = await chatNachrichtenService.list(projektId);
        setNachrichten(loaded);
      } catch (error) {
        console.error('Fehler beim Laden der Chat-Nachrichten:', error);
      } finally {
        setLoading(false);
      }
    };

    loadNachrichten();
  }, [projektId]);

  // Users für Mentions laden
  useEffect(() => {
    const cachedUsers = getCachedUsersList();
    setUsers(cachedUsers);
  }, []);

  // Auto-Scroll zu neuen Nachrichten
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [nachrichten]);

  // Nachricht senden
  const handleSend = async () => {
    if (!neueNachricht.trim() || !user) return;

    // Mentions aus Text extrahieren
    const mentionRegex = /@(\w+)/g;
    const mentionNames = [...neueNachricht.matchAll(mentionRegex)].map(m => m[1]);
    const mentionUserIds = users
      .filter(u => mentionNames.some(name =>
        u.name.toLowerCase().includes(name.toLowerCase())
      ))
      .map(u => u.$id);

    try {
      setSending(true);
      const created = await chatNachrichtenService.create({
        projektId,
        text: neueNachricht.trim(),
        mentions: mentionUserIds,
        erstelltVon: user.$id,
        erstelltVonName: user.name,
      });
      setNachrichten([...nachrichten, created]);
      setNeueNachricht('');
    } catch (error) {
      console.error('Fehler beim Senden der Nachricht:', error);
      alert('Fehler beim Senden der Nachricht');
    } finally {
      setSending(false);
    }
  };

  // Input-Handler für @-Mentions
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setNeueNachricht(value);
    setCursorPosition(cursorPos);

    // Prüfe ob wir gerade nach @ tippen
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Nur anzeigen wenn kein Leerzeichen nach @
      if (!textAfterAt.includes(' ')) {
        setMentionFilter(textAfterAt.toLowerCase());
        setShowMentionDropdown(true);
        return;
      }
    }

    setShowMentionDropdown(false);
    setMentionFilter('');
  };

  // User aus Dropdown auswählen
  const handleSelectUser = (selectedUser: CachedUser) => {
    const textBeforeCursor = neueNachricht.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = neueNachricht.substring(cursorPosition);

    // Text vor @ + @Username + Text nach Cursor
    const newText =
      neueNachricht.substring(0, lastAtIndex) +
      '@' + selectedUser.name + ' ' +
      textAfterCursor;

    setNeueNachricht(newText);
    setShowMentionDropdown(false);
    setMentionFilter('');
    inputRef.current?.focus();
  };

  // Gefilterte User-Liste
  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(mentionFilter) ||
    u.email.toLowerCase().includes(mentionFilter)
  );

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

  // Datum formatieren
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Kollabiert - nur Icon zeigen
  if (isCollapsed) {
    return (
      <div className="fixed right-4 bottom-4 z-50">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all"
          title="Chat öffnen"
        >
          <MessageCircle className="w-6 h-6" />
          {nachrichten.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {nachrichten.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 flex-shrink-0 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <MessageCircle className="w-5 h-5" />
            <h3 className="font-semibold">Projekt-Chat</h3>
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            className="text-white/80 hover:text-white transition-colors"
            title="Chat minimieren"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {projektName && (
          <p className="text-white/70 text-sm mt-1 truncate">{projektName}</p>
        )}
      </div>

      {/* Nachrichten-Liste */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Lade Nachrichten...</p>
          </div>
        ) : nachrichten.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Noch keine Nachrichten.
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
              Starte die Konversation!
            </p>
          </div>
        ) : (
          nachrichten.map((nachricht) => {
            const isOwn = nachricht.erstelltVon === user?.$id;
            return (
              <div
                key={nachricht.id}
                className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
              >
                {/* Autor-Name */}
                <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 px-1">
                  {nachricht.erstelltVonName}
                </span>

                {/* Nachricht-Bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    isOwn
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-md'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white rounded-bl-md'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {renderTextWithMentions(nachricht.text)}
                  </p>
                </div>

                {/* Zeitstempel */}
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 px-1">
                  {formatTime(nachricht.erstelltAm)}
                </span>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input-Bereich */}
      <div className="p-4 border-t border-gray-200 dark:border-slate-700 relative">
        {/* Mention-Dropdown */}
        {showMentionDropdown && filteredUsers.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
            {filteredUsers.map((u) => (
              <button
                key={u.$id}
                onClick={() => handleSelectUser(u)}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={neueNachricht}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
                if (e.key === 'Escape') {
                  setShowMentionDropdown(false);
                }
              }}
              placeholder="Nachricht schreiben... (@)"
              className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={1}
              disabled={sending}
            />
            <button
              onClick={() => {
                setNeueNachricht(neueNachricht + '@');
                setShowMentionDropdown(true);
                inputRef.current?.focus();
              }}
              className="absolute right-3 bottom-2 text-gray-400 hover:text-blue-600 transition-colors"
              title="Person erwähnen"
            >
              <AtSign className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={handleSend}
            disabled={!neueNachricht.trim() || sending}
            className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Nachricht senden"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
          @ für Erwähnungen, Enter zum Senden
        </p>
      </div>
    </div>
  );
};

export default ProjektChat;
