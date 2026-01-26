/**
 * Authentifizierung Middleware
 *
 * Validiert Appwrite Sessions und Cron-Secrets.
 */

import { Request, Response, NextFunction } from 'express';
import { Client, Account } from 'node-appwrite';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';

// Request mit User erweitern
declare global {
  namespace Express {
    interface Request {
      user?: {
        $id: string;
        email: string;
        name: string;
      };
      isCronJob?: boolean;
    }
  }
}

/**
 * Authentifizierung für normale API-Requests
 * Validiert Appwrite Session Token
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'Kein Authorization Header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'Kein Token angegeben' });
      return;
    }

    // Appwrite Client mit Session erstellen
    const client = new Client()
      .setEndpoint(config.APPWRITE_ENDPOINT)
      .setProject(config.APPWRITE_PROJECT_ID)
      .setSession(token);

    const account = new Account(client);

    try {
      const user = await account.get();
      req.user = {
        $id: user.$id,
        email: user.email,
        name: user.name,
      };
      next();
    } catch {
      res.status(401).json({ error: 'Ungültige Session' });
    }
  } catch (error) {
    logger.error('Auth Fehler: %s', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Authentifizierungsfehler' });
  }
}

/**
 * Authentifizierung für Cron Jobs
 * Validiert Cron-Secret Header
 */
export function authenticateCron(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const cronSecret = req.headers['x-cron-secret'];

  if (cronSecret === config.CRON_SECRET) {
    req.isCronJob = true;
    next();
  } else {
    res.status(401).json({ error: 'Ungültiges Cron-Secret' });
  }
}

/**
 * Optionale Authentifizierung
 * Setzt User wenn Token vorhanden, aber blockiert nicht
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');

      if (token) {
        const client = new Client()
          .setEndpoint(config.APPWRITE_ENDPOINT)
          .setProject(config.APPWRITE_PROJECT_ID)
          .setSession(token);

        const account = new Account(client);

        try {
          const user = await account.get();
          req.user = {
            $id: user.$id,
            email: user.email,
            name: user.name,
          };
        } catch {
          // Session ungültig, aber kein Fehler
        }
      }
    }

    next();
  } catch {
    next();
  }
}
