/**
 * Zentrale Fehlerbehandlung
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Interner Serverfehler';

  // Fehler loggen
  logger.error({
    error: message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode,
  });

  // Response senden
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

// Hilfsfunktion zum Erstellen von Fehlern
export function createError(message: string, statusCode: number): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}
