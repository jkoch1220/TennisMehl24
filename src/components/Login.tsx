import { useState, FormEvent } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { verifyPassword, setSession } from '../utils/auth';

interface LoginProps {
  onLogin: () => void;
}

const Login = ({ onLogin }: LoginProps) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const isValid = await verifyPassword(password);
      if (isValid) {
        setSession();
        onLogin();
      } else {
        setError('Falsches Passwort. Bitte versuchen Sie es erneut.');
        setPassword('');
      }
    } catch (err) {
      setError('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <Lock className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            TennisMehl24
          </h1>
          <p className="text-gray-600">
            Bitte geben Sie das Passwort ein, um fortzufahren
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none transition-colors"
              placeholder="Passwort eingeben"
              autoFocus
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
            disabled={isLoading || !password}
            className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {isLoading ? 'Wird überprüft...' : 'Anmelden'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Diese Anwendung ist passwortgeschützt
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

