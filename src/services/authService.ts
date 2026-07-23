import { Account, Models } from 'appwrite';
import { client } from '../config/appwrite';
import { mapOnboardingPassword } from '../constants/onboarding';

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
    await account.createEmailPasswordSession(email, mapOnboardingPassword(password));
    const user = await account.get() as User;
    console.log('✅ Login erfolgreich:', user.name, user.labels);
    return user;
  } catch (error) {
    console.error('❌ Login Fehler:', error);
    throw new Error((error as Error).message || 'Login fehlgeschlagen');
  }
};

// Logout
export const logout = async (): Promise<void> => {
  try {
    await account.deleteSession('current');
    console.log('✅ Logout erfolgreich');
  } catch (error) {
    console.error('❌ Logout Fehler:', error);
    throw new Error((error as Error).message || 'Logout fehlgeschlagen');
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
    await account.updatePassword(newPassword, mapOnboardingPassword(oldPassword));
    console.log('✅ Passwort erfolgreich geändert');
  } catch (error) {
    console.error('❌ Passwort-Änderung Fehler:', error);
    throw new Error((error as Error).message || 'Passwort-Änderung fehlgeschlagen');
  }
};

// Muss der User sein Passwort noch ändern? (Flag in Appwrite-Prefs, D5)
export const mustChangePassword = (user: User | null): boolean =>
  (user?.prefs as Record<string, unknown> | undefined)?.mustChangePassword === true;

// Flag nach erfolgreichem Wechsel entfernen.
// WICHTIG: updatePrefs ersetzt das GESAMTE Prefs-Objekt — bestehende Prefs mergen!
export const clearMustChangePasswordFlag = async (user: User): Promise<void> => {
  const prefs = { ...(user.prefs ?? {}) } as Record<string, unknown>;
  delete prefs.mustChangePassword;
  await account.updatePrefs(prefs);
  console.log('✅ mustChangePassword-Flag entfernt');
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
