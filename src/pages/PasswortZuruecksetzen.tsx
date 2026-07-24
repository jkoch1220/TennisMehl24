import { useState, FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { KeyRound, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { isForbiddenNewPassword } from '../constants/onboarding';

/**
 * Öffentliche Seite für den "Passwort vergessen?"-Flow.
 * Appwrite mailt einen Link auf diese Route mit userId + secret in der URL;
 * die Netlify Function validiert das Secret (updateRecovery), löscht ein evtl.
 * gesetztes mustChangePassword-Flag und schreibt den Audit-Eintrag.
 */
const PasswortZuruecksetzen = () => {
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId') ?? '';
  const secret = searchParams.get('secret') ?? '';

  const [passwort, setPasswort] = useState('');
  const [passwortWdh, setPasswortWdh] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [erfolgreich, setErfolgreich] = useState(false);

  const linkUnvollstaendig = !userId || !secret;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (passwort.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (isForbiddenNewPassword(passwort)) {
      setError('Dieses Passwort ist nicht erlaubt — bitte ein eigenes wählen.');
      return;
    }
    if (passwort !== passwortWdh) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/.netlify/functions/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete-recovery', userId, secret, password: passwort }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data.error as string) || 'Zurücksetzen fehlgeschlagen');
      }
      setErfolgreich(true);
    } catch (err) {
      setError((err as Error).message || 'Zurücksetzen fehlgeschlagen');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl p-8 md:p-12 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <Lock className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-dark-text mb-2">TennisMehl24</h1>
          <p className="text-gray-600 dark:text-dark-textMuted">Neues Passwort setzen</p>
        </div>

        {linkUnvollstaendig ? (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 text-sm text-red-700">
            Dieser Link ist unvollständig. Bitte den Link aus der E-Mail vollständig öffnen oder über
            „Passwort vergessen?" einen neuen anfordern.
            <div className="mt-4">
              <Link to="/" className="underline font-semibold">Zur Anmeldung</Link>
            </div>
          </div>
        ) : erfolgreich ? (
          <div className="space-y-6">
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-800">
                Passwort erfolgreich geändert. Du kannst dich jetzt mit dem neuen Passwort anmelden.
              </p>
            </div>
            <Link
              to="/"
              className="block w-full text-center bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all shadow-lg"
            >
              Zur Anmeldung
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {(['neu', 'wdh'] as const).map((feld) => (
              <div key={feld}>
                <label
                  htmlFor={`passwort-${feld}`}
                  className="block text-sm font-semibold text-gray-700 dark:text-dark-textMuted mb-2"
                >
                  {feld === 'neu' ? 'Neues Passwort (mindestens 8 Zeichen)' : 'Neues Passwort wiederholen'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    id={`passwort-${feld}`}
                    type="password"
                    value={feld === 'neu' ? passwort : passwortWdh}
                    onChange={(e) => (feld === 'neu' ? setPasswort(e.target.value) : setPasswortWdh(e.target.value))}
                    className="w-full pl-10 pr-3 py-3 border-2 border-gray-300 dark:border-dark-border rounded-lg focus:border-red-500 focus:outline-none transition-colors"
                    autoFocus={feld === 'neu'}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
            ))}

            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !passwort || !passwortWdh}
              className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg dark:shadow-dark-lg"
            >
              {isLoading ? 'Wird gespeichert...' : 'Passwort speichern'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default PasswortZuruecksetzen;
