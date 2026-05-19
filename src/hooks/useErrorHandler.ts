import { useCallback } from 'react';
import { toast } from 'sonner';
import { AppError, getUserMessage } from '../utils/errorHandling';

/**
 * Hook für einheitliche Fehleranzeige in Komponenten.
 *
 * Beispiel:
 *   const handleError = useErrorHandler();
 *   try { await ... } catch (error) { handleError(error, 'Speichern der Zahlung'); }
 */
export function useErrorHandler() {
  return useCallback((error: unknown, context: string) => {
    if (error instanceof AppError) {
      toast.error(error.userMessage);
      console.error(`[${context}]`, error);
      return;
    }

    const message = getUserMessage(error, `Fehler beim ${context}. Bitte erneut versuchen.`);
    toast.error(message);
    console.error(`[${context}]`, error);
  }, []);
}
