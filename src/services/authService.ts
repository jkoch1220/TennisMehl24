import { Account, Models } from 'appwrite';
import { client } from '../config/appwrite';
import { mapOnboardingPassword } from '../constants/onboarding';

export const account = new Account(client);

// User mit erweiterten Informationen (Labels)
export interface User extends Models.User<Models.Preferences> {
  labels: string[];
}

/**
 * Kachel-Login (Custom-Token-Flow): Die Netlify Function verifiziert das
 * Passwort serverseitig (E-Mail bleibt auf dem Server) und liefert ein
 * kurzlebiges Login-Token. account.createSession() tauscht es gegen eine
 * reguläre Session, die das Web-SDK selbst persistiert (Cookie/Fallback) —
 * derselbe bewährte Mechanismus wie beim klassischen E-Mail-Login.
 */

// Altlast des früheren SSR-Ansatzes aufräumen (manuell gepinnte Session-Header
// kollidierten auf manchen Rechnern mit altem SDK-State)
localStorage.removeItem('tm_session_secret');

export const loginMitKachel = async (userId: string, password: string): Promise<User> => {
  const response = await fetch('/.netlify/functions/admin-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', userId, password: mapOnboardingPassword(password) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secret || !data.userId) {
    throw new Error((data.error as string) || 'Anmeldung fehlgeschlagen');
  }
  await account.createSession(data.userId, data.secret);
  const user = (await account.get()) as User;
  console.log('✅ Login erfolgreich (Kachel):', user.name, user.labels);
  return user;
};

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

/**
 * "Passwort vergessen?": Appwrite mailt einen Recovery-Link an die Account-E-Mail.
 * Der Aufrufer zeigt IMMER dieselbe neutrale Meldung — auch bei Fehlern —
 * damit nicht erratbar ist, welche E-Mail-Adressen ein Konto haben.
 */
export const passwortVergessenAnfordern = async (email: string): Promise<void> => {
  await account.createRecovery(email, `${window.location.origin}/passwort-zuruecksetzen`);
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
