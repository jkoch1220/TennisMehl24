import React, { useState, FormEvent } from 'react';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { changePassword } from '../../services/authService';

const PasswordChange: React.FC = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validierung
    if (newPassword !== confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    setIsLoading(true);

    try {
      await changePassword(oldPassword, newPassword);
      setSuccess(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Ändern des Passworts.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-2">
          <Lock className="w-5 h-5" />
          Passwort ändern
        </h3>
        <p className="text-sm text-gray-600">
          Ändern Sie hier Ihr Passwort. Das neue Passwort muss mindestens 8 Zeichen lang sein.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="oldPassword" className="block text-sm font-semibold text-gray-700 mb-2">
            Aktuelles Passwort
          </label>
          <input
            id="oldPassword"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none transition-colors"
            placeholder="Aktuelles Passwort eingeben"
            required
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="block text-sm font-semibold text-gray-700 mb-2">
            Neues Passwort
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none transition-colors"
            placeholder="Neues Passwort eingeben"
            required
            disabled={isLoading}
            minLength={8}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
            Neues Passwort bestätigen
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none transition-colors"
            placeholder="Neues Passwort wiederholen"
            required
            disabled={isLoading}
            minLength={8}
          />
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700">
              Passwort erfolgreich geändert!
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !oldPassword || !newPassword || !confirmPassword}
          className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          {isLoading ? 'Wird geändert...' : 'Passwort ändern'}
        </button>
      </form>
    </div>
  );
};

export default PasswordChange;



