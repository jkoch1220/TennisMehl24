import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, login as loginService, logout as logoutService, checkSession, isAdmin } from '../services/authService';
import { cacheUser } from '../services/userCacheService';
import { loadUserPermissions, loadAllPermissions, clearPermissionsCache } from '../services/permissionsService';

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

  // Session beim Start prüfen
  useEffect(() => {
    const initAuth = async () => {
      try {
        const currentUser = await checkSession();
        setUser(currentUser);
        // User im Cache speichern für Benutzerverwaltung
        if (currentUser) {
          cacheUser({
            $id: currentUser.$id,
            name: currentUser.name,
            email: currentUser.email,
            labels: currentUser.labels,
          });
          // Permissions laden
          await loadPermissionsForUser(currentUser);
        } else {
          setPermissionsLoading(false);
        }
      } catch (error) {
        console.error('❌ Fehler beim Prüfen der Session:', error);
        setPermissionsLoading(false);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Login
  const login = async (username: string, password: string) => {
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
  };

  // Logout
  const logout = async () => {
    try {
      await logoutService();
      setUser(null);
      // Permissions Cache leeren
      clearPermissionsCache();
    } catch (error) {
      throw error;
    }
  };

  // User neu laden (z.B. nach Änderungen)
  const refreshUser = async () => {
    try {
      const currentUser = await checkSession();
      setUser(currentUser);
      if (currentUser) {
        await loadPermissionsForUser(currentUser);
      }
    } catch (error) {
      console.error('❌ Fehler beim Aktualisieren des Users:', error);
    }
  };

  // Nur Permissions neu laden (z.B. nach Änderungen in Benutzerverwaltung)
  const refreshPermissions = async () => {
    if (user) {
      await loadPermissionsForUser(user);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    permissionsLoading,
    login,
    logout,
    isAdmin: isAdmin(user),
    refreshUser,
    refreshPermissions,
  };

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
