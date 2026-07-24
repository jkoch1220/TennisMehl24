import { Account, Models } from 'appwrite';
import { client } from '../config/appwrite';
import { mapOnboardingPassword } from '../constants/onboarding';

export const account = new Account(client);

// User mit erweiterten Informationen (Labels)
export interface User extends Models.User<Models.Preferences> {
  labels: string[];
}

/**
 * Kachel-Login (SSR-Muster): Die Netlify Function löst die E-Mail serverseitig
 * auf und erstellt die Session — der Browser bekommt nur das Session-Secret.
 * Das Secret muss selbst persistiert werden (localStorage, wie der SDK-eigene
 * cookieFallback), damit die Session einen Reload überlebt.
 */
const SESSION_SECRET_KEY = 'tm_session_secret';

// Beim App-Start eine ggf. gespeicherte Kachel-Session wiederherstellen
const gespeichertesSecret = localStorage.getItem(SESSION_SECRET_KEY);
if (gespeichertesSecret) {
  client.setSession(gespeichertesSecret);
}

export const loginMitKachel = async (userId: string, password: string): Promise<User> => {
  const response = await fetch('/.netlify/functions/admin-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', userId, password: mapOnboardingPassword(password) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secret) {
    throw new Error((data.error as string) || 'Anmeldung fehlgeschlagen');
  }
  client.setSession(data.secret);
  localStorage.setItem(SESSION_SECRET_KEY, data.secret);
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
  } finally {
    // Kachel-Session-Secret immer verwerfen, auch wenn deleteSession scheitert
    localStorage.removeItem(SESSION_SECRET_KEY);
    client.setSession('');
  }
};

// Aktuellen User abrufen
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const user = await account.get() as User;
    return user;
  } catch (error) {
    // Kein User eingeloggt — ein evtl. abgelaufenes Kachel-Session-Secret
    // verwerfen, damit es Folge-Logins nicht stört
    if (localStorage.getItem(SESSION_SECRET_KEY)) {
      localStorage.removeItem(SESSION_SECRET_KEY);
      client.setSession('');
    }
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
