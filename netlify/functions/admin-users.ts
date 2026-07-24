import { Handler, HandlerEvent } from '@netlify/functions';
import { Client, Users, Account, ID } from 'node-appwrite';

/**
 * User-Verwaltung mit Server-API-Key (der Key bleibt ausschließlich hier).
 *
 * Aktionen:
 *  - list            (öffentlich, pre-Login): aktive User für den "Wer bist du?"-Screen.
 *                    Liefert NUR id + name — E-Mail-Adressen sind privat und gehen
 *                    nur an verifizierte Admins (JWT optional mitgesendet).
 *  - login           (öffentlich): Kachel-Login nach dem Appwrite-SSR-Muster.
 *                    Die E-Mail wird serverseitig aufgelöst, die Session mit dem
 *                    Admin-Client erstellt und nur das Session-Secret zurückgegeben —
 *                    so verlässt keine E-Mail-Adresse den Server.
 *  - create          (nur Admin, JWT-verifiziert): neuen User mit echter E-Mail +
 *                    Einmalpasswort anlegen
 *  - reset-password  (nur Admin, JWT-verifiziert): User auf Einmalpasswort zurücksetzen
 *
 * Admin-Verifikation: Client sendet sein Appwrite-Session-JWT im Header
 * `x-appwrite-jwt`; die Function prüft damit serverseitig Account + Label 'admin'.
 */

// In Sync mit src/constants/onboarding.ts halten (Appwrite-Minimum: 8 Zeichen;
// die Login-UI bildet die Eingabe "1220" auf diesen Wert ab).
const ONBOARDING_PASSWORD_ACTUAL = 'TM-Start-1220!';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-appwrite-jwt',
  },
  body: JSON.stringify(body),
});

const getConfig = () => {
  const apiKey = process.env.APPWRITE_API_KEY || process.env.VITE_APPWRITE_API_KEY;
  const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
  if (!apiKey || !endpoint || !projectId) return null;
  return { apiKey, endpoint, projectId };
};

/** Prüft das mitgesendete Session-JWT und verlangt das Label 'admin'. */
const verifyAdmin = async (
  event: HandlerEvent,
  endpoint: string,
  projectId: string
): Promise<{ ok: boolean; error?: string }> => {
  const jwt = event.headers['x-appwrite-jwt'];
  if (!jwt) return { ok: false, error: 'Nicht autorisiert (kein JWT)' };
  try {
    const jwtClient = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt);
    const me = await new Account(jwtClient).get();
    if (!Array.isArray(me.labels) || !me.labels.includes('admin')) {
      return { ok: false, error: 'Nicht autorisiert (kein Admin)' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Nicht autorisiert (JWT ungültig oder abgelaufen)' };
  }
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const config = getConfig();
  if (!config) {
    console.error('Appwrite-Konfiguration fehlt (APPWRITE_API_KEY / ENDPOINT / PROJECT_ID)');
    return jsonResponse(500, { error: 'Konfigurationsfehler' });
  }
  const { apiKey, endpoint, projectId } = config;

  let body: {
    action?: string;
    email?: string;
    name?: string;
    userId?: string;
    password?: string;
  } = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Ungültiger Request-Body' });
  }

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const users = new Users(client);

  try {
    switch (body.action) {
      // ---------------------------------------------------------- öffentlich
      case 'list': {
        // E-Mail nur für verifizierte Admins (UserManagement) — nie pre-Login.
        const istAdmin = (await verifyAdmin(event, endpoint, projectId)).ok;
        const result = await users.list();
        const active = result.users
          .filter((u) => u.status === true)
          .map((u) => (istAdmin ? { id: u.$id, name: u.name, email: u.email } : { id: u.$id, name: u.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'de'));
        return jsonResponse(200, { users: active });
      }

      case 'login': {
        if (!body.userId || !body.password) {
          return jsonResponse(400, { error: 'userId und password erforderlich' });
        }
        try {
          const target = await users.get(body.userId);
          if (target.status !== true) throw new Error('inaktiv');
          // SSR-Muster: Session mit dem Admin-Client erstellen → Response enthält
          // das Session-Secret, das der Browser per client.setSession() übernimmt.
          const session = await new Account(client).createEmailPasswordSession(
            target.email,
            body.password
          );
          return jsonResponse(200, { secret: session.secret });
        } catch {
          // Neutral halten: keine Unterscheidung unbekannter User / falsches Passwort
          return jsonResponse(401, { error: 'Anmeldung fehlgeschlagen' });
        }
      }

      // ---------------------------------------------------------- nur Admin
      case 'create': {
        const auth = await verifyAdmin(event, endpoint, projectId);
        if (!auth.ok) return jsonResponse(403, { error: auth.error });

        const email = (body.email || '').trim().toLowerCase();
        const name = (body.name || '').trim();
        if (!EMAIL_REGEX.test(email) || email.endsWith('@tennismehl.local')) {
          return jsonResponse(400, { error: 'Bitte eine echte E-Mail-Adresse angeben' });
        }
        if (!name) return jsonResponse(400, { error: 'Anzeigename fehlt' });

        const created = await users.create(
          ID.unique(),
          email,
          undefined,
          ONBOARDING_PASSWORD_ACTUAL,
          name
        );
        await users.updatePrefs(created.$id, { mustChangePassword: true });
        return jsonResponse(200, {
          success: true,
          user: { id: created.$id, name: created.name, email: created.email },
        });
      }

      case 'reset-password': {
        const auth = await verifyAdmin(event, endpoint, projectId);
        if (!auth.ok) return jsonResponse(403, { error: auth.error });

        if (!body.userId) return jsonResponse(400, { error: 'userId fehlt' });
        const target = await users.get(body.userId);
        await users.updatePassword(body.userId, ONBOARDING_PASSWORD_ACTUAL);
        const prefs = { ...(target.prefs as Record<string, unknown>), mustChangePassword: true };
        await users.updatePrefs(body.userId, prefs);
        return jsonResponse(200, { success: true });
      }

      default:
        return jsonResponse(400, { error: 'Unbekannte Aktion' });
    }
  } catch (error) {
    const e = error as { code?: number; message?: string };
    console.error('admin-users Fehler:', e.message);
    if (e.code === 409) return jsonResponse(409, { error: 'E-Mail-Adresse wird bereits verwendet' });
    return jsonResponse(500, { error: 'Aktion fehlgeschlagen' });
  }
};
