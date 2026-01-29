/**
 * Länder-Konstanten für die Adressverwaltung
 * Standard ist Deutschland - andere Länder werden nur bei Bedarf angezeigt
 */

export interface Land {
  code: string;       // ISO 3166-1 alpha-2
  name: string;       // Anzeigename (deutsch)
  googleCode: string; // Google Places API Code (lowercase)
}

export const LAENDER: readonly Land[] = [
  { code: 'DE', name: 'Deutschland', googleCode: 'de' },
  { code: 'AT', name: 'Österreich', googleCode: 'at' },
  { code: 'CH', name: 'Schweiz', googleCode: 'ch' },
  { code: 'NL', name: 'Niederlande', googleCode: 'nl' },
  { code: 'BE', name: 'Belgien', googleCode: 'be' },
  { code: 'LU', name: 'Luxemburg', googleCode: 'lu' },
  { code: 'FR', name: 'Frankreich', googleCode: 'fr' },
  { code: 'PL', name: 'Polen', googleCode: 'pl' },
  { code: 'CZ', name: 'Tschechien', googleCode: 'cz' },
  { code: 'IT', name: 'Italien', googleCode: 'it' },
] as const;

export const DEFAULT_LAND_CODE = 'DE';

/**
 * Gibt den Ländernamen für einen ISO-Code zurück
 * Bei Deutschland wird ein leerer String zurückgegeben (Standard, nicht anzeigen)
 */
export const getLandName = (code?: string): string => {
  if (!code || code === 'DE') return ''; // Deutschland nicht anzeigen
  const land = LAENDER.find(l => l.code === code);
  return land?.name || code;
};

/**
 * Gibt den Google Places API Code für ein Land zurück
 */
export const getGoogleCountryCode = (code?: string): string => {
  const land = LAENDER.find(l => l.code === code);
  return land?.googleCode || 'de';
};
