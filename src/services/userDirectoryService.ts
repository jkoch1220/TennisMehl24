import { account } from './authService';

/**
 * Zugriff auf die Netlify Function admin-users:
 *  - listUsers() ist öffentlich (für den "Wer bist du?"-Screen vor dem Login)
 *    und liefert bewusst KEINE E-Mail-Adressen (nur id + name).
 *  - listUsersMitEmail() sendet das Session-JWT mit — nur verifizierte Admins
 *    bekommen die E-Mail-Adressen zurück (Benutzerverwaltung).
 *  - create/reset laufen mit Session-JWT und werden serverseitig auf Admin geprüft.
 */

export interface DirectoryUser {
  id: string;
  name: string;
  /** Nur gefüllt, wenn die Liste als Admin (mit JWT) abgerufen wurde. */
  email?: string;
}

const FUNCTION_URL = '/.netlify/functions/admin-users';

export const listUsers = async (): Promise<DirectoryUser[]> => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list' }),
  });
  if (!response.ok) {
    throw new Error(`User-Liste nicht verfügbar (HTTP ${response.status})`);
  }
  const data = await response.json();
  return Array.isArray(data.users) ? data.users : [];
};

const adminRequest = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
  // Kurzlebiges JWT der aktuellen Session — die Function verifiziert damit das Admin-Label
  const { jwt } = await account.createJWT();
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-appwrite-jwt': jwt },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data.error as string) || `Aktion fehlgeschlagen (HTTP ${response.status})`);
  }
  return data;
};

export const listUsersMitEmail = async (): Promise<DirectoryUser[]> => {
  const data = await adminRequest({ action: 'list' });
  return Array.isArray(data.users) ? (data.users as DirectoryUser[]) : [];
};

export const createUser = async (email: string, name: string): Promise<DirectoryUser> => {
  const data = await adminRequest({ action: 'create', email, name });
  return data.user as unknown as DirectoryUser;
};

export const resetUserPassword = async (userId: string): Promise<void> => {
  await adminRequest({ action: 'reset-password', userId });
};
