import { useState, useEffect } from 'react';
import { Lock, Factory, AlertCircle } from 'lucide-react';
import ProduktionsTracker from '../ProduktionsTracker/ProduktionsTracker';

const PASSWORT = 'Tennismehl24!';
const STORAGE_KEY = 'produktion_public_auth';

export default function PublicProduktion() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Prüfe ob bereits authentifiziert (aus localStorage)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password === PASSWORT) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setAuthenticated(true);
    } else {
      setError('Falsches Passwort');
      setPassword('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthenticated(false);
    setPassword('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Factory className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Produktion erfassen</h1>
            <p className="text-gray-600 mt-2">Bitte Passwort eingeben</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all text-lg"
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-red-600 to-orange-500 text-white py-3 rounded-xl font-semibold hover:from-red-700 hover:to-orange-600 transition-all shadow-lg hover:shadow-xl"
            >
              Anmelden
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-6">
            Zugang nur für Mitarbeiter
          </p>
        </div>
      </div>
    );
  }

  // Authentifiziert - zeige ProduktionsTracker
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50">
      {/* Header mit Logout */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center shadow">
              <Factory className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-gray-900">Produktion erfassen</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Lock className="w-4 h-4" />
            Abmelden
          </button>
        </div>
      </div>

      {/* ProduktionsTracker */}
      <div className="p-4">
        <ProduktionsTracker />
      </div>
    </div>
  );
}
