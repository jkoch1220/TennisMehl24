// Passwort-Hash (SHA-256 von "TennisMehl2025!")
// Standard-Passwort: TennisMehl2025!
// Um das Passwort zu ändern, generieren Sie einen neuen Hash mit: crypto.createHash('sha256').update('IhrPasswort').digest('hex')
const PASSWORD_HASH = '64d277977b9c9f14974eaa91103f12c18baf3d986b8ed52bcfb406b3fa7c4acf';

// Einfache Hash-Funktion mit Web Crypto API
export const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

// Passwort verifizieren
export const verifyPassword = async (password: string): Promise<boolean> => {
  const hashedPassword = await hashPassword(password);
  return hashedPassword === PASSWORD_HASH;
};

// Session speichern
export const setSession = (): void => {
  sessionStorage.setItem('authenticated', 'true');
  sessionStorage.setItem('sessionStart', Date.now().toString());
};

// Session prüfen
export const isAuthenticated = (): boolean => {
  const authenticated = sessionStorage.getItem('authenticated');
  return authenticated === 'true';
};

// Session löschen
export const clearSession = (): void => {
  sessionStorage.removeItem('authenticated');
  sessionStorage.removeItem('sessionStart');
};

