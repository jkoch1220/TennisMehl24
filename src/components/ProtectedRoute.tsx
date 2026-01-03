import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccessTool } from '../services/permissionsService';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  toolId: string;
}

const ProtectedRoute = ({ children, toolId }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();

  // Während geladen wird
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted">Lade...</p>
        </div>
      </div>
    );
  }

  // Nicht eingeloggt - sollte nicht passieren, aber zur Sicherheit
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Prüfen ob User Zugriff auf dieses Tool hat
  const hasAccess = canAccessTool(user, toolId);

  if (!hasAccess) {
    // Kein Zugriff - Zeige Fehlermeldung
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-2">
            Kein Zugriff
          </h1>
          <p className="text-gray-600 dark:text-dark-textMuted mb-6">
            Sie haben keine Berechtigung, um auf dieses Tool zuzugreifen. 
            Bitte wenden Sie sich an einen Administrator.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all shadow-md dark:shadow-dark-md"
          >
            Zurück
          </button>
        </div>
      </div>
    );
  }

  // User hat Zugriff - Zeige das Tool
  return <>{children}</>;
};

export default ProtectedRoute;




