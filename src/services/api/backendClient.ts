/**
 * Backend API Client
 *
 * Zentraler Client für alle Backend-API-Aufrufe.
 * Alle sensiblen Operationen (Claude AI, Routing, etc.) werden
 * über das sichere Backend abgewickelt.
 *
 * WICHTIG: API-Keys sind NUR auf dem Server gespeichert!
 *
 * Unterstützt zwei Backend-Varianten:
 * 1. Netlify Functions: VITE_BACKEND_URL = '/.netlify/functions'
 * 2. Express Backend:   VITE_BACKEND_URL = 'http://localhost:3001/api'
 */

import { account } from '../../config/appwrite';

// Backend URL - Netlify Functions ODER Express Backend
// Für Netlify: '/.netlify/functions' oder leer
// Für Express: 'http://localhost:3001/api' oder 'https://api.tennismehl.com/api'
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/.netlify/functions';

// Prüfe ob Express Backend verwendet wird
const isExpressBackend = BACKEND_URL.includes('/api') || BACKEND_URL.includes('localhost:3001');

/**
 * Gibt den korrekten Endpunkt-Pfad basierend auf dem Backend-Typ zurück
 */
function getEndpoint(netlifyPath: string, expressPath: string): string {
  return isExpressBackend ? expressPath : netlifyPath;
}

/**
 * Basis-Fetch mit Authentifizierung
 */
async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Session-Token holen (wenn eingeloggt)
  let authToken = '';
  try {
    const session = await account.getSession('current');
    authToken = session.$id;
  } catch {
    // Nicht eingeloggt - kein Token
  }

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));

    // Rate Limit Fehler speziell behandeln
    if (response.status === 429) {
      throw new Error('Zu viele Anfragen. Bitte warten Sie einen Moment.');
    }

    throw new Error(error.error || error.details || `API Fehler: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// CLAUDE AI SERVICE
// ============================================================================

export interface TourAdresse {
  strasse: string;
  plz: string;
  ort: string;
}

export interface ProjektFuerOptimierung {
  id: string;
  kundenname: string;
  adresse: TourAdresse;
  tonnen: number;
  paletten?: number;
  belieferungsart: 'mit_haenger' | 'nur_motorwagen' | 'abholung_ab_werk' | 'palette_mit_ladekran' | 'bigbag';
  lieferKW?: number;
  lieferdatumTyp?: 'genau_kw' | 'spaetestens_kw' | 'flexibel' | 'fix' | 'spaetestens' | 'kw';
  zeitfenster?: { von: string; bis: string };
  wichtigeHinweise?: string[];
}

export interface FahrzeugFuerOptimierung {
  id: string;
  kennzeichen: string;
  typ: string; // 'motorwagen' | 'mit_haenger'
  kapazitaetTonnen: number;
  fahrerName?: string;
}

export interface ClaudeOptimierungRequest {
  projekte: ProjektFuerOptimierung[];
  fahrzeuge: FahrzeugFuerOptimierung[];
  startAdresse: TourAdresse;
  startZeit: string;
  einschraenkungen: {
    maxArbeitszeitMinuten: number;
    pausenregelMinuten: number;
    respektiereZeitfenster: boolean;
    respektiereKWDeadlines: boolean;
    aktuelleKW?: number;
  };
}

export interface OptimierteRoute {
  fahrzeugTyp: 'motorwagen' | 'mit_haenger';
  fahrzeugId?: string;
  stopReihenfolge: string[];
  begruendung: string;
  geschaetzteTonnen: number;
  kapazitaetMaximal: number;
  geschaetzteDistanzKm?: number;
}

export interface ClaudeOptimierungResponse {
  touren: OptimierteRoute[];
  warnungen: string[];
  nichtFuerHeute: string[];
  empfehlung?: string;
}

// ============================================================================
// ROUTING SERVICE
// ============================================================================

export interface RouteResult {
  distanzKm: number;
  fahrzeitMinuten: number;
  fahrzeitOhneTrafficMinuten: number;
  trafficDelayMinuten: number;
}

export interface GeocodingResult {
  success: boolean;
  coordinates?: { lat: number; lng: number };
  error?: string;
}

// ============================================================================
// FUEL PRICE SERVICE
// ============================================================================

export interface FuelPriceResult {
  success: boolean;
  preis?: number;
  guenstigsterPreis?: number;
  durchschnittspreis?: number;
  anzahlTankstellen?: number;
  quelle: 'tankerkoenig' | 'fallback';
  timestamp: string;
  error?: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

export const backendApi = {
  /**
   * Claude AI Services
   */
  claude: {
    /**
     * Optimiert Liefertouren mit Claude AI
     */
    optimizeRoute: (request: ClaudeOptimierungRequest): Promise<ClaudeOptimierungResponse> =>
      fetchWithAuth<ClaudeOptimierungResponse>(
        getEndpoint('/claude-optimize', '/claude/optimize-route'),
        {
          method: 'POST',
          body: JSON.stringify(request),
        }
      ),

    /**
     * Parst eine E-Mail-Anfrage mit Claude AI
     */
    parseInquiry: (emailContent: string, emailSubject?: string): Promise<Record<string, unknown>> =>
      fetchWithAuth<Record<string, unknown>>(
        getEndpoint('/claude-parse', '/claude/parse-inquiry'),
        {
          method: 'POST',
          body: JSON.stringify({ emailContent, emailSubject }),
        }
      ),

    /**
     * Prüft ob Claude AI Service verfügbar ist
     */
    isAvailable: async (): Promise<boolean> => {
      try {
        // Einfacher Health-Check könnte hier implementiert werden
        return true;
      } catch {
        return false;
      }
    },
  },

  /**
   * Routing & Geocoding Services
   */
  routing: {
    /**
     * Berechnet Route zwischen zwei PLZ
     */
    calculateRoute: (startPLZ: string, zielPLZ: string): Promise<RouteResult> => {
      if (isExpressBackend) {
        return fetchWithAuth<RouteResult>('/routing/calculate', {
          method: 'POST',
          body: JSON.stringify({ startPLZ, zielPLZ }),
        });
      }
      return fetchWithAuth<RouteResult>('/routing', {
        method: 'POST',
        body: JSON.stringify({
          action: 'route',
          startPLZ,
          zielPLZ,
        }),
      });
    },

    /**
     * Geocodiert eine Adresse/PLZ
     */
    geocode: (addressOrPLZ: string): Promise<GeocodingResult> => {
      if (isExpressBackend) {
        return fetchWithAuth<GeocodingResult>('/routing/geocode', {
          method: 'POST',
          body: JSON.stringify({ address: addressOrPLZ }),
        });
      }
      return fetchWithAuth<GeocodingResult>('/routing', {
        method: 'POST',
        body: JSON.stringify({
          action: 'geocode',
          address: addressOrPLZ,
        }),
      });
    },

    /**
     * Batch-Geocoding für mehrere Adressen
     */
    batchGeocode: (addresses: string[]): Promise<GeocodingResult[]> => {
      if (isExpressBackend) {
        return fetchWithAuth<GeocodingResult[]>('/routing/batch-geocode', {
          method: 'POST',
          body: JSON.stringify({ addresses }),
        });
      }
      return fetchWithAuth<GeocodingResult[]>('/routing', {
        method: 'POST',
        body: JSON.stringify({
          action: 'batch-geocode',
          addresses,
        }),
      });
    },
  },

  /**
   * Fuel Price Services
   */
  fuel: {
    /**
     * Holt aktuellen Dieselpreis für eine PLZ
     */
    getDieselPrice: (plz: string, radius?: number): Promise<FuelPriceResult> =>
      fetchWithAuth<FuelPriceResult>(
        getEndpoint('/fuel-price', '/fuel/diesel-price'),
        {
          method: 'POST',
          body: JSON.stringify({ plz, radius: radius || 10 }),
        }
      ),
  },

  /**
   * Email Services (nur Express Backend)
   */
  email: {
    /**
     * Holt E-Mails aus dem Posteingang
     */
    fetchInbox: (folder?: string, limit?: number): Promise<{ emails: unknown[]; total: number }> => {
      if (!isExpressBackend) {
        throw new Error('Email Service nur im Express Backend verfügbar');
      }
      const params = new URLSearchParams();
      if (folder) params.append('folder', folder);
      if (limit) params.append('limit', String(limit));
      return fetchWithAuth<{ emails: unknown[]; total: number }>(
        `/email/inbox?${params.toString()}`,
        { method: 'GET' }
      );
    },

    /**
     * Sendet eine E-Mail
     */
    send: (options: { to: string | string[]; subject: string; text?: string; html?: string }): Promise<{ success: boolean; messageId?: string }> => {
      if (!isExpressBackend) {
        throw new Error('Email Service nur im Express Backend verfügbar');
      }
      return fetchWithAuth<{ success: boolean; messageId?: string }>('/email/send', {
        method: 'POST',
        body: JSON.stringify(options),
      });
    },
  },

  /**
   * Health Check
   */
  health: {
    /**
     * Einfacher Health Check
     */
    check: (): Promise<{ status: string; timestamp: string }> =>
      fetchWithAuth<{ status: string; timestamp: string }>(
        getEndpoint('/health', '/health'),
        { method: 'GET' }
      ),

    /**
     * Detaillierter Health Check
     */
    detailed: (): Promise<Record<string, unknown>> => {
      if (!isExpressBackend) {
        throw new Error('Detailed Health Check nur im Express Backend verfügbar');
      }
      return fetchWithAuth<Record<string, unknown>>('/health/detailed', { method: 'GET' });
    },
  },
};

// ============================================================================
// LEGACY EXPORTS (für Abwärtskompatibilität)
// ============================================================================

/**
 * @deprecated Verwende backendApi.claude.optimizeRoute stattdessen
 */
export const claudeRouteOptimizer = {
  async optimiereTouren(request: ClaudeOptimierungRequest): Promise<ClaudeOptimierungResponse> {
    return backendApi.claude.optimizeRoute(request);
  },

  isAvailable(): boolean {
    return true; // Backend ist immer verfügbar wenn Server läuft
  },

  getAktuelleKW(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - start.getTime();
    const oneWeek = 604800000;
    return Math.ceil((diff / oneWeek) + 1);
  },
};

/**
 * @deprecated Verwende backendApi.routing.calculateRoute stattdessen
 */
export async function berechneRoute(startPLZ: string, zielPLZ: string): Promise<RouteResult> {
  return backendApi.routing.calculateRoute(startPLZ, zielPLZ);
}

/**
 * @deprecated Verwende backendApi.fuel.getDieselPrice stattdessen
 */
export async function holeDieselPreis(plz: string): Promise<number> {
  const result = await backendApi.fuel.getDieselPrice(plz);
  return result.preis || 1.55; // Fallback
}

export default backendApi;
