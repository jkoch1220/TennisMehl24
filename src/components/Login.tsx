import { useState, useEffect, FormEvent } from 'react';
import { Lock, AlertCircle, ArrowLeft, User as UserIcon, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { listUsers, DirectoryUser } from '../services/userDirectoryService';

/**
 * "Wer bist du?"-Login (D6): zeigt alle aktiven User dynamisch als Kacheln.
 * Klick auf einen Namen → Passwort-Eingabe für genau diesen User.
 * Fällt auf das klassische Formular zurück, wenn die User-Liste nicht
 * verfügbar ist (z.B. lokale Entwicklung ohne Netlify Functions).
 */

const initialen = (name: string): string =>
  name
    .split(/\s+/)
    .map((teil) => teil.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

const KACHEL_FARBEN = [
  'from-red-500 to-orange-500',
  'from-blue-500 to-indigo-500',
  'from-green-500 to-emerald-500',
  'from-purple-500 to-violet-500',
  'from-amber-500 to-orange-600',
  'from-teal-500 to-cyan-600',
];

const Login = () => {
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [listeFehlgeschlagen, setListeFehlgeschlagen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [manuellerModus, setManuellerModus] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, loginKachel } = useAuth();

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((err) => {
        console.warn('⚠️ User-Liste nicht verfügbar, Fallback auf manuelle Anmeldung:', err.message);
        setListeFehlgeschlagen(true);
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (selectedUser) {
        // Kachel-Modus: Session kommt von der Netlify Function (SSR-Muster),
        // die E-Mail des Users bleibt serverseitig
        await loginKachel(selectedUser.id, password);
      } else {
        // Manuell: Benutzername (Alt-Accounts) oder voll eingegebene E-Mail
        await login(username, password);
      }
    } catch (err) {
      setError((err as Error).message || 'Login fehlgeschlagen. Bitte überprüfen Sie Ihre Zugangsdaten.');
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  const zeigeKacheln = !manuellerModus && !listeFehlgeschlagen && !selectedUser;
  const zeigeFormular = manuellerModus || listeFehlgeschlagen || !!selectedUser;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl p-8 md:p-12 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <Lock className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-dark-text mb-2">
            TennisMehl24
          </h1>
          <p className="text-gray-600 dark:text-dark-textMuted">
            {zeigeKacheln ? 'Wer bist du?' : selectedUser ? `Hallo ${selectedUser.name}!` : 'Bitte melden Sie sich an'}
          </p>
        </div>

        {/* Kachel-Auswahl */}
        {zeigeKacheln && (
          <div>
            {users === null ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {users.map((u, index) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u);
                      setError('');
                    }}
                    className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 dark:border-dark-border rounded-xl hover:border-red-400 hover:shadow-lg transition-all"
                  >
                    <div
                      className={`w-16 h-16 rounded-full bg-gradient-to-br ${KACHEL_FARBEN[index % KACHEL_FARBEN.length]} flex items-center justify-center text-white text-xl font-bold`}
                    >
                      {initialen(u.name)}
                    </div>
                    <span className="font-semibold text-gray-800 dark:text-dark-text">{u.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-6 text-center">
              <button
                onClick={() => setManuellerModus(true)}
                className="text-xs text-gray-500 dark:text-dark-textMuted hover:text-gray-700 underline"
              >
                Manuelle Anmeldung
              </button>
            </div>
          </div>
        )}

        {/* Passwort-Eingabe (nach Kachel-Klick) bzw. klassisches Formular */}
        {zeigeFormular && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {selectedUser ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setPassword('');
                  setError('');
                }}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-textMuted hover:text-gray-800"
              >
                <ArrowLeft className="w-4 h-4" />
                Anderer Benutzer
              </button>
            ) : (
              <div>
                <label htmlFor="username" className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
                  E-Mail oder Benutzername
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 border-2 border-gray-300 dark:border-dark-border rounded-lg focus:border-red-500 focus:outline-none transition-colors"
                    placeholder="E-Mail-Adresse eingeben"
                    autoFocus
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
                Passwort
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 border-2 border-gray-300 dark:border-dark-border rounded-lg focus:border-red-500 focus:outline-none transition-colors"
                  placeholder="Passwort eingeben"
                  autoFocus={!!selectedUser}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || (!selectedUser && !username) || !password}
              className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg dark:shadow-dark-lg"
            >
              {isLoading ? 'Wird angemeldet...' : 'Anmelden'}
            </button>

            {manuellerModus && !listeFehlgeschlagen && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setManuellerModus(false);
                    setError('');
                  }}
                  className="text-xs text-gray-500 dark:text-dark-textMuted hover:text-gray-700 underline"
                >
                  Zurück zur Benutzer-Auswahl
                </button>
              </div>
            )}
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 dark:text-dark-textMuted">
            Zugriff nur für autorisierte Benutzer
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
