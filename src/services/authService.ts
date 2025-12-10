import { Account, Models } from 'appwrite';
import { client } from '../config/appwrite';

export const account = new Account(client);

// User mit erweiterten Informationen (Labels)
export interface User extends Models.User<Models.Preferences> {
  labels: string[];
}

// Username zu Email konvertieren (Appwrite benötigt Email-Format)
const usernameToEmail = (username: string): string => {
  // Wenn bereits Email-Format, direkt verwenden
  if (username.includes('@')) {
    return username;
  }
  // Ansonsten: Username + internes Domain-Suffix
  return `${username.toLowerCase()}@tennismehl.local`;
};

// Login mit Username und Passwort
export const login = async (username: string, password: string): Promise<User> => {
  try {
    const email = usernameToEmail(username);
    await account.createEmailPasswordSession(email, password);
    const user = await account.get() as User;
    console.log('✅ Login erfolgreich:', user.name, user.labels);
    return user;
  } catch (error: any) {
    console.error('❌ Login Fehler:', error);
    throw new Error(error.message || 'Login fehlgeschlagen');
  }
};

// Logout
export const logout = async (): Promise<void> => {
  try {
    await account.deleteSession('current');
    console.log('✅ Logout erfolgreich');
  } catch (error: any) {
    console.error('❌ Logout Fehler:', error);
    throw new Error(error.message || 'Logout fehlgeschlagen');
  }
};

// Aktuellen User abrufen
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const user = await account.get() as User;
    return user;
  } catch (error) {
    // Kein User eingeloggt
    return null;
  }
};

// Prüfen ob User eingeloggt ist
export const isAuthenticated = async (): Promise<boolean> => {
  try {
    await account.get();
    return true;
  } catch {
    return false;
  }
};

// Passwort ändern (für eingeloggten User)
export const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
  try {
    await account.updatePassword(newPassword, oldPassword);
    console.log('✅ Passwort erfolgreich geändert');
  } catch (error: any) {
    console.error('❌ Passwort-Änderung Fehler:', error);
    throw new Error(error.message || 'Passwort-Änderung fehlgeschlagen');
  }
};

// Prüfen ob User Admin ist
export const isAdmin = (user: User | null): boolean => {
  return user?.labels?.includes('admin') || false;
};

// Session prüfen und User zurückgeben
export const checkSession = async (): Promise<User | null> => {
  try {
    const user = await getCurrentUser();
    if (user) {
      console.log('✅ Session aktiv für:', user.name, '| Rolle:', isAdmin(user) ? 'Admin' : 'User');
    }
    return user;
  } catch (error) {
    console.log('ℹ️ Keine aktive Session');
    return null;
  }
};
