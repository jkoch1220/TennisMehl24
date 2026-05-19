/**
 * Zentrale Fehlerbehandlung für Services und Komponenten.
 *
 * Pattern:
 *   try {
 *     await ...;
 *   } catch (error) {
 *     handleServiceError(error, 'Laden der Debitoren');
 *   }
 *
 * `handleServiceError` wirft IMMER (return type `never`). Aufrufer behalten ihren
 * Control-Flow (try/catch beim Caller). Komponenten verwenden `useErrorHandler`,
 * um AppError-Instanzen in benutzerfreundliche Toasts umzusetzen.
 */

export type AppErrorCode = 'NETWORK' | 'AUTH' | 'NOT_FOUND' | 'VALIDATION' | 'UNKNOWN';

export class AppError extends Error {
  readonly userMessage: string;
  readonly code: AppErrorCode;
  readonly retryable: boolean;

  constructor(
    message: string,
    userMessage: string,
    code: AppErrorCode = 'UNKNOWN',
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'AppError';
    this.userMessage = userMessage;
    this.code = code;
    this.retryable = retryable;
  }
}

export function handleServiceError(error: unknown, context: string): never {
  if (error instanceof AppError) {
    console.error(`[${context}]`, error);
    throw error;
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]`, error);

  if (rawMessage.includes('Failed to fetch') || rawMessage.includes('NetworkError')) {
    throw new AppError(
      rawMessage,
      'Netzwerkfehler — bitte Verbindung prüfen.',
      'NETWORK',
      true
    );
  }

  if (rawMessage.includes('401') || rawMessage.toLowerCase().includes('unauthorized')) {
    throw new AppError(
      rawMessage,
      'Sitzung abgelaufen — bitte neu anmelden.',
      'AUTH',
      false
    );
  }

  if (rawMessage.includes('404') || rawMessage.includes('could not be found')) {
    throw new AppError(
      rawMessage,
      'Datensatz nicht gefunden.',
      'NOT_FOUND',
      false
    );
  }

  if (rawMessage.includes('429') || rawMessage.includes('503') || rawMessage.includes('timeout')) {
    throw new AppError(
      rawMessage,
      `Server überlastet beim ${context} — bitte erneut versuchen.`,
      'UNKNOWN',
      true
    );
  }

  throw new AppError(
    rawMessage,
    `Fehler beim ${context}. Bitte erneut versuchen.`,
    'UNKNOWN',
    true
  );
}

/**
 * Extrahiert die für den User sichtbare Nachricht aus einem beliebigen Fehler.
 * AppError-Instanzen liefern ihre userMessage; andere Fehler bekommen einen Fallback.
 */
export function getUserMessage(error: unknown, fallback: string = 'Ein Fehler ist aufgetreten.'): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }
  return fallback;
}
