/**
 * Backend Configuration with Feature Flags
 *
 * This module enables switching between:
 * - Legacy mode: Direct API calls from browser
 * - Backend mode: Calls routed through TennisMehl Backend
 *
 * Set VITE_USE_BACKEND=true in .env to enable backend mode
 */

export interface BackendConfig {
  enabled: boolean;
  baseUrl: string;
  timeout: number;
  features: {
    claude: boolean;      // AI parsing & generation
    diesel: boolean;      // Diesel price API
    geocoding: boolean;   // Address geocoding
    pdf: boolean;         // PDF generation
    calculations: boolean; // Cost calculations
    routeOptimizer: boolean; // Route optimization
    appwriteProxy: boolean; // Route Appwrite through backend
  };
}

// Default feature flags - can be overridden via environment
const DEFAULT_FEATURES = {
  claude: true,        // Always use backend for Claude (security!)
  diesel: true,        // Cache diesel prices on backend
  geocoding: true,     // Cache geocoding results
  pdf: false,          // Keep PDF local for now (faster preview)
  calculations: false, // Keep calculations local (instant feedback)
  routeOptimizer: false, // Keep local (instant feedback)
  appwriteProxy: false   // Direct Appwrite access for now
};

export const BACKEND_CONFIG: BackendConfig = {
  enabled: import.meta.env.VITE_USE_BACKEND === 'true',
  baseUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000',
  timeout: parseInt(import.meta.env.VITE_BACKEND_TIMEOUT || '30000'),
  features: {
    claude: import.meta.env.VITE_BACKEND_CLAUDE !== 'false' && DEFAULT_FEATURES.claude,
    diesel: import.meta.env.VITE_BACKEND_DIESEL !== 'false' && DEFAULT_FEATURES.diesel,
    geocoding: import.meta.env.VITE_BACKEND_GEOCODING !== 'false' && DEFAULT_FEATURES.geocoding,
    pdf: import.meta.env.VITE_BACKEND_PDF === 'true' || DEFAULT_FEATURES.pdf,
    calculations: import.meta.env.VITE_BACKEND_CALC === 'true' || DEFAULT_FEATURES.calculations,
    routeOptimizer: import.meta.env.VITE_BACKEND_ROUTE === 'true' || DEFAULT_FEATURES.routeOptimizer,
    appwriteProxy: import.meta.env.VITE_BACKEND_APPWRITE === 'true' || DEFAULT_FEATURES.appwriteProxy
  }
};

/**
 * Check if a specific feature should use the backend
 */
export function useBackend(feature: keyof BackendConfig['features']): boolean {
  return BACKEND_CONFIG.enabled && BACKEND_CONFIG.features[feature];
}

/**
 * Get full URL for backend endpoint
 */
export function getBackendUrl(path: string): string {
  const base = BACKEND_CONFIG.baseUrl.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Fetch wrapper for backend calls with error handling
 */
export async function backendFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = getBackendUrl(path);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BACKEND_CONFIG.timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || `Backend error: ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Log backend configuration on startup (dev mode only)
 */
if (import.meta.env.DEV) {
  console.log('🔧 Backend Configuration:', {
    enabled: BACKEND_CONFIG.enabled,
    baseUrl: BACKEND_CONFIG.baseUrl,
    features: BACKEND_CONFIG.features
  });
}
