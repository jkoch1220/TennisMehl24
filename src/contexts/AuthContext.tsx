import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { User, login as loginService, logout as logoutService, checkSession, isAdmin } from '../services/authService';
import { cacheUser } from '../services/userCacheService';
import { loadUserPermissions, loadAllPermissions, clearPermissionsCache } from '../services/permissionsService';

// Auth-Initialisierung Timeout (5 Sekunden)
const AUTH_INIT_TIMEOUT = 5000;

/**
 * Wrapper für Promises mit Timeout.
 * Wenn das Promise nicht innerhalb des Timeouts resolved, wird mit Timeout-Fehler rejected.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timeoutId));
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  permissionsLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  // Permissions für aktuellen User laden
  const loadPermissionsForUser = async (currentUser: User) => {
    setPermissionsLoading(true);
    try {
      if (isAdmin(currentUser)) {
        // Admin: Lade alle Permissions (für Benutzerverwaltung)
        await loadAllPermissions();
        console.log('✅ Alle Permissions geladen (Admin)');
      } else {
        // Normaler User: Nur eigene Permissions laden
        await loadUserPermissions(currentUser.$id);
        console.log('✅ User-Permissions geladen:', currentUser.name);
      }
    } catch (error) {
      console.error('❌ Fehler beim Laden der Permissions:', error);
    } finally {
      setPermissionsLoading(false);
    }
  };

  // Session beim Start prüfen (mit Timeout um Hängen zu verhindern)
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Session-Check mit 5 Sekunden Timeout
        const currentUser = await withTimeout(
          checkSession(),
          AUTH_INIT_TIMEOUT,
          'Session-Check Timeout'
        );
        setUser(currentUser);
        // User im Cache speichern für Benutzerverwaltung
        if (currentUser) {
          cacheUser({
            $id: currentUser.$id,
            name: currentUser.name,
            email: currentUser.email,
            labels: currentUser.labels,
          });
          // Permissions laden (auch mit Timeout, aber Fehler erlauben)
          try {
            await withTimeout(
              loadPermissionsForUser(currentUser),
              AUTH_INIT_TIMEOUT,
              'Permissions-Load Timeout'
            );
          } catch (permError) {
            // Bei Permission-Timeout: User ist eingeloggt, Permissions werden später geladen
            console.warn('⚠️ Permissions konnten nicht geladen werden:', permError);
            setPermissionsLoading(false);
          }
        } else {
          setPermissionsLoading(false);
        }
      } catch (error) {
        // Timeout oder andere Fehler: Als nicht eingeloggt behandeln
        if ((error as Error)?.message?.includes('Timeout')) {
          console.warn('⚠️ Auth-Initialisierung Timeout - behandle als nicht eingeloggt');
        } else {
          console.error('❌ Fehler beim Prüfen der Session:', error);
        }
        setUser(null);
        setPermissionsLoading(false);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Login - memoisiert um unnötige Re-Renders zu vermeiden
  const login = useCallback(async (username: string, password: string) => {
    try {
      const loggedInUser = await loginService(username, password);
      setUser(loggedInUser);
      // User im Cache speichern
      cacheUser({
        $id: loggedInUser.$id,
        name: loggedInUser.name,
        email: loggedInUser.email,
        labels: loggedInUser.labels,
      });
      // Permissions laden
      await loadPermissionsForUser(loggedInUser);
    } catch (error) {
      throw error;
    }
  }, []);

  // Logout - memoisiert
  const logout = useCallback(async () => {
    try {
      await logoutService();
      setUser(null);
      // Permissions Cache leeren
      clearPermissionsCache();
    } catch (error) {
      throw error;
    }
  }, []);

  // User neu laden (z.B. nach Änderungen) - memoisiert
  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await checkSession();
      setUser(currentUser);
      if (currentUser) {
        await loadPermissionsForUser(currentUser);
      }
    } catch (error) {
      console.error('❌ Fehler beim Aktualisieren des Users:', error);
    }
  }, []);

  // Nur Permissions neu laden (z.B. nach Änderungen in Benutzerverwaltung)
  const refreshPermissions = useCallback(async () => {
    if (user) {
      await loadPermissionsForUser(user);
    }
  }, [user]);

  // Berechne isAdmin einmal und memoisiere
  const isAdminValue = useMemo(() => isAdmin(user), [user]);

  // Memoisierter Context Value - verhindert unnötige Re-Renders aller Consumer
  const value = useMemo<AuthContextType>(() => ({
    user,
    loading,
    permissionsLoading,
    login,
    logout,
    isAdmin: isAdminValue,
    refreshUser,
    refreshPermissions,
  }), [user, loading, permissionsLoading, login, logout, isAdminValue, refreshUser, refreshPermissions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook zum einfachen Zugriff auf Auth Context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth muss innerhalb eines AuthProvider verwendet werden');
  }
  return context;
};
