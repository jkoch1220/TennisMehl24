import { useState, FormEvent } from 'react';
import { ShieldAlert, AlertCircle, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { changePassword, clearMustChangePasswordFlag } from '../services/authService';
import { isForbiddenNewPassword, ONBOARDING_PASSWORD_INPUT } from '../constants/onboarding';
import { auditService } from '../services/auditService';

/**
 * Pflicht-Screen nach Erstlogin mit Einmalpasswort (D5):
 * blockiert die gesamte App, bis ein eigenes Passwort gesetzt wurde.
 */
const ForcePasswordChange = () => {
  const { user, refreshUser, logout } = useAuth();
  const [oldPassword, setOldPassword] = useState(ONBOARDING_PASSWORD_INPUT);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (isForbiddenNewPassword(newPassword)) {
      setError('Das Einmalpasswort kann nicht als neues Passwort verwendet werden.');
      return;
    }

    setIsLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      if (user) {
        await clearMustChangePasswordFlag(user);
        auditService.log(user, {
          action: 'password_change',
          entityType: 'user',
          entityId: user.$id,
          summary: `${user.name} hat das Einmalpasswort durch ein eigenes Passwort ersetzt`,
        });
      }
      await refreshUser();
    } catch (err) {
      setError((err as Error).message || 'Passwort-Änderung fehlgeschlagen.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl p-8 md:p-12 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
            <ShieldAlert className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-dark-text mb-2">
            Neues Passwort setzen
          </h1>
          <p className="text-gray-600 dark:text-dark-textMuted">
            Hallo {user?.name}! Bevor es losgeht, setze bitte ein eigenes Passwort
            (mindestens 8 Zeichen).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="oldPassword" className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
              Einmalpasswort
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyRound className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </div>
              <input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-3 border-2 border-gray-300 dark:border-dark-border rounded-lg focus:border-red-500 focus:outline-none transition-colors"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
              Neues Passwort
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full p-3 border-2 border-gray-300 dark:border-dark-border rounded-lg focus:border-red-500 focus:outline-none transition-colors"
              placeholder="Mindestens 8 Zeichen"
              autoFocus
              required
              minLength={8}
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2">
              Neues Passwort bestätigen
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 border-2 border-gray-300 dark:border-dark-border rounded-lg focus:border-red-500 focus:outline-none transition-colors"
              placeholder="Neues Passwort wiederholen"
              required
              minLength={8}
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !oldPassword || !newPassword || !confirmPassword}
            className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg dark:shadow-dark-lg"
          >
            {isLoading ? 'Wird gespeichert...' : 'Passwort setzen und loslegen'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => logout()}
              className="text-xs text-gray-500 dark:text-dark-textMuted hover:text-gray-700 underline"
              disabled={isLoading}
            >
              Abmelden
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
