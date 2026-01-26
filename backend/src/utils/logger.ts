/**
 * Logger mit Pino
 */

import pino from 'pino';
import { config } from '../config/environment.js';

const isDev = config.NODE_ENV === 'development';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    pid: false,
  },
});

// Audit Logger für sicherheitsrelevante Ereignisse
export function auditLog(
  action: string,
  userId: string,
  details: Record<string, unknown>,
  req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }
): void {
  logger.info({
    type: 'AUDIT',
    action,
    userId,
    ...details,
    ip: req?.ip || 'unknown',
    userAgent: req?.headers?.['user-agent'] || 'unknown',
    timestamp: new Date().toISOString(),
  });
}

export default logger;
