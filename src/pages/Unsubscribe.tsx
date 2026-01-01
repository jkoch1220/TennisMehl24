import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { HeartCrack, CheckCircle, AlertCircle, Loader2, Mail } from 'lucide-react';
import { newsletterService } from '../services/newsletterService';

const Unsubscribe = () => {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'invalid'>('loading');
  const [email, setEmail] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const processUnsubscribe = async () => {
      if (!token) {
        setStatus('invalid');
        return;
      }

      const result = await newsletterService.unsubscribeByToken(token);

      if (result.success) {
        setStatus('success');
        setEmail(result.email || '');
      } else {
        if (result.error === 'Ungültiger Abmeldelink') {
          setStatus('invalid');
        } else {
          setStatus('error');
          setErrorMessage(result.error || 'Unbekannter Fehler');
        }
      }
    };

    processUnsubscribe();
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl shadow-lg mb-4">
            <span className="text-3xl font-bold text-white">TM</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">TennisMehl24</h1>
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          {/* Loading State */}
          {status === 'loading' && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Abmeldung wird verarbeitet...
              </h2>
              <p className="text-gray-600">
                Bitte warten Sie einen Moment.
              </p>
            </div>
          )}

          {/* Success State */}
          {status === 'success' && (
            <>
              <div className="bg-gradient-to-r from-amber-400 to-orange-500 p-8 text-center text-white">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur rounded-full mb-4">
                  <HeartCrack className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold mb-2">
                  Schade, dass Sie gehen!
                </h2>
                <p className="text-white/90 text-lg">
                  TennisMehl wird Sie vermissen
                </p>
              </div>

              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-4">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  Erfolgreich abgemeldet
                </h3>
                {email && (
                  <p className="text-gray-600 mb-4">
                    <span className="font-medium">{email}</span> wurde aus unserem Newsletter entfernt.
                  </p>
                )}
                <p className="text-sm text-gray-500">
                  Sie werden keine weiteren E-Mails von uns erhalten.
                </p>

                <div className="mt-8 p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-600 mb-3">
                    Falls Sie es sich anders überlegen, kontaktieren Sie uns gerne:
                  </p>
                  <a
                    href="mailto:info@tennismehl24.de"
                    className="inline-flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium"
                  >
                    <Mail className="w-4 h-4" />
                    info@tennismehl24.de
                  </a>
                </div>
              </div>
            </>
          )}

          {/* Invalid Token State */}
          {status === 'invalid' && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
                <AlertCircle className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Ungültiger Link
              </h2>
              <p className="text-gray-600 mb-6">
                Dieser Abmeldelink ist ungültig oder bereits abgelaufen.
              </p>
              <p className="text-sm text-gray-500">
                Falls Sie sich abmelden möchten, kontaktieren Sie uns bitte:
              </p>
              <a
                href="mailto:info@tennismehl24.de"
                className="inline-flex items-center gap-2 mt-3 text-orange-600 hover:text-orange-700 font-medium"
              >
                <Mail className="w-4 h-4" />
                info@tennismehl24.de
              </a>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Ein Fehler ist aufgetreten
              </h2>
              <p className="text-gray-600 mb-6">
                {errorMessage || 'Die Abmeldung konnte nicht verarbeitet werden.'}
              </p>
              <p className="text-sm text-gray-500">
                Bitte versuchen Sie es später erneut oder kontaktieren Sie uns:
              </p>
              <a
                href="mailto:info@tennismehl24.de"
                className="inline-flex items-center gap-2 mt-3 text-orange-600 hover:text-orange-700 font-medium"
              >
                <Mail className="w-4 h-4" />
                info@tennismehl24.de
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} TennisMehl24</p>
          <p className="mt-1">Qualitäts-Ziegelmehl für Tennisplätze</p>
        </div>
      </div>
    </div>
  );
};

export default Unsubscribe;
