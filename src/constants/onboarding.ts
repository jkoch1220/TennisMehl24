/**
 * Einmalpasswort-Konvention (D5): Neue und zurückgesetzte User starten mit "1220"
 * und müssen beim ersten Login ein eigenes Passwort setzen.
 *
 * Appwrite akzeptiert keine Passwörter unter 8 Zeichen — deshalb wird die
 * Eingabe "1220" beim Login transparent auf den internen Startwert abgebildet.
 * Für die Sicherheit ist das gleichwertig (der Schutz kommt aus dem sofort
 * erzwungenen Passwortwechsel), die UX bleibt exakt "1220".
 *
 * WICHTIG: scripts/setup-onboarding-users.mjs und netlify/functions/admin-users.ts
 * lesen ONBOARDING_PASSWORD_ACTUAL aus dieser Datei — hier ist die einzige Quelle.
 */
export const ONBOARDING_PASSWORD_INPUT = '1220';
export const ONBOARDING_PASSWORD_ACTUAL = 'TM-Start-1220!';

/** Beim Login/Passwortwechsel eingegebenes Passwort ggf. auf den Startwert abbilden. */
export const mapOnboardingPassword = (password: string): string =>
  password === ONBOARDING_PASSWORD_INPUT ? ONBOARDING_PASSWORD_ACTUAL : password;

/** Verbotene Werte für neue Passwörter (Einmalpasswort darf nicht "neu gesetzt" werden). */
export const isForbiddenNewPassword = (password: string): boolean =>
  password === ONBOARDING_PASSWORD_INPUT || password === ONBOARDING_PASSWORD_ACTUAL;
