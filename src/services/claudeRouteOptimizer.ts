/**
 * Claude AI Route Optimizer für intelligente Tourenplanung
 *
 * SICHERHEITSHINWEIS:
 * Diese Datei ruft jetzt das sichere Backend auf.
 * Der Anthropic API-Key ist NUR auf dem Server gespeichert.
 */

import { backendApi } from './api/backendClient';
import type {
  ClaudeOptimierungRequest,
  ClaudeOptimierungResponse,
} from '../types/tour';

// Re-export types from backendClient
export type {
  ClaudeOptimierungRequest,
  ClaudeOptimierungResponse,
  ProjektFuerOptimierung,
  FahrzeugFuerOptimierung,
  TourAdresse,
  OptimierteRoute,
} from './api/backendClient';

// Aktuelle Kalenderwoche berechnen
function getAktuelleKW(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000; // ms pro Woche
  return Math.ceil((diff / oneWeek) + 1);
}

export const claudeRouteOptimizer = {
  /**
   * Optimiert Touren mit Claude AI über das sichere Backend
   */
  async optimiereTouren(request: ClaudeOptimierungRequest): Promise<ClaudeOptimierungResponse> {
    console.log('🤖 Sende Anfrage an Backend für Claude-Optimierung...');

    try {
      const result = await backendApi.claude.optimizeRoute(request);
      console.log('✅ Claude-Optimierung erfolgreich');
      return result;
    } catch (error) {
      console.error('❌ Fehler bei Claude-Optimierung:', error);
      throw error;
    }
  },

  /**
   * Prüft ob Claude API verfügbar ist
   * (Backend ist immer verfügbar wenn Server läuft)
   */
  isAvailable(): boolean {
    return true;
  },

  /**
   * Gibt die aktuelle Kalenderwoche zurück
   */
  getAktuelleKW,
};

export default claudeRouteOptimizer;
