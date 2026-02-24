/**
 * Geocoding-Utilities für Adressen
 *
 * STRATEGIE (Stand 2024):
 * 1. Backend-API mit Google Geocoding (API-Key sicher im Backend)
 * 2. PLZ-Lookup als lokaler Fallback (kostenlos)
 * 3. Nominatim für Spezialfälle (via Backend)
 */

import { useBackend, backendFetch } from '../config/backend';

/**
 * Geocoding-Vorschlag mit Details
 */
export interface GeocodingVorschlag {
  displayName: string;
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
  koordinaten: [number, number]; // [lon, lat]
  confidence: 'hoch' | 'mittel' | 'niedrig';
  typ: string; // z.B. 'building', 'street', 'postcode'
}

/**
 * Ergebnis des Geocodings mit Vorschlägen
 */
export interface GeocodingErgebnis {
  erfolg: boolean;
  vorschlaege: GeocodingVorschlag[];
  eindeutig: boolean; // true wenn nur 1 Treffer mit hoher Confidence
  fehler?: string;
  quelle?: 'google' | 'nominatim' | 'plz';
}

/**
 * Google Geocoding Result Type
 */
export interface GoogleGeocodingResult {
  koordinaten: [number, number]; // [lon, lat]
  formattedAddress: string;
  confidence: 'hoch' | 'mittel' | 'niedrig';
  components: {
    strasse?: string;
    hausnummer?: string;
    plz?: string;
    ort?: string;
  };
}

/**
 * Backend Response Types
 */
interface BackendGeocodingResponse {
  success: boolean;
  cached?: boolean;
  lat: number;
  lng: number;
  displayName: string;
  confidence?: 'hoch' | 'mittel' | 'niedrig';
  locationType?: string;
  components?: {
    street?: string;
    houseNumber?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  error?: string;
}

interface BackendBatchResponse {
  success: boolean;
  total: number;
  found: number;
  cached: number;
  apiCalls: number;
  results: Array<{
    id: string;
    success: boolean;
    cached?: boolean;
    lat?: number;
    lng?: number;
    displayName?: string;
    confidence?: 'hoch' | 'mittel' | 'niedrig';
    locationType?: string;
    components?: BackendGeocodingResponse['components'];
    error?: string;
  }>;
}

interface BackendSuggestionsResponse {
  success: boolean;
  query: string;
  suggestions: Array<{
    displayName: string;
    lat: number;
    lng: number;
    confidence: 'hoch' | 'mittel' | 'niedrig';
    locationType: string;
    components: BackendGeocodingResponse['components'];
  }>;
}

/**
 * Google Geocoding über Backend - Haupt-Geocoder
 * API-Key bleibt sicher im Backend
 */
export async function geocodeMitGoogle(
  strasse: string,
  plz: string,
  ort: string
): Promise<GoogleGeocodingResult | null> {
  if (!useBackend('geocoding')) {
    console.warn('Backend-Geocoding nicht aktiviert, nutze PLZ-Fallback');
    return null;
  }

  try {
    const params = new URLSearchParams({
      strasse,
      plz,
      ort
    });

    const response = await backendFetch<BackendGeocodingResponse>(
      `/api/geo/google/geocode?${params.toString()}`
    );

    if (!response.success || !response.lat || !response.lng) {
      return null;
    }

    // Validiere: In Deutschland?
    if (response.lat < 47 || response.lat > 56 || response.lng < 5 || response.lng > 16) {
      console.warn(`Koordinaten außerhalb Deutschlands: [${response.lng}, ${response.lat}]`);
      return null;
    }

    return {
      koordinaten: [response.lng, response.lat],
      formattedAddress: response.displayName,
      confidence: response.confidence || 'niedrig',
      components: {
        strasse: response.components?.street,
        hausnummer: response.components?.houseNumber,
        plz: response.components?.postcode,
        ort: response.components?.city,
      },
    };
  } catch (error) {
    console.warn('Backend Google Geocoding Fehler:', error);
    return null;
  }
}

/**
 * Batch-Geocoding über Backend - für mehrere Adressen gleichzeitig
 * Parallelisiert im Backend (max 10 gleichzeitig)
 */
export async function geocodeBatchMitGoogle(
  adressen: Array<{ id: string; strasse: string; plz: string; ort: string }>
): Promise<Map<string, GoogleGeocodingResult>> {
  const ergebnisse = new Map<string, GoogleGeocodingResult>();

  if (!useBackend('geocoding')) {
    console.warn('Backend-Geocoding nicht aktiviert');
    return ergebnisse;
  }

  if (adressen.length === 0) {
    return ergebnisse;
  }

  try {
    const response = await backendFetch<BackendBatchResponse>('/api/geo/google/batch', {
      method: 'POST',
      body: JSON.stringify({ adressen })
    });

    if (!response.success || !response.results) {
      return ergebnisse;
    }

    for (const result of response.results) {
      if (result.success && result.lat && result.lng) {
        // Validiere: In Deutschland?
        if (result.lat < 47 || result.lat > 56 || result.lng < 5 || result.lng > 16) {
          continue;
        }

        ergebnisse.set(result.id, {
          koordinaten: [result.lng, result.lat],
          formattedAddress: result.displayName || '',
          confidence: result.confidence || 'niedrig',
          components: {
            strasse: result.components?.street,
            hausnummer: result.components?.houseNumber,
            plz: result.components?.postcode,
            ort: result.components?.city,
          },
        });
      }
    }

    console.log(`✅ Batch-Geocoding: ${ergebnisse.size}/${adressen.length} erfolgreich (${response.cached} aus Cache, ${response.apiCalls} API-Calls)`);

    return ergebnisse;
  } catch (error) {
    console.warn('Backend Batch-Geocoding Fehler:', error);
    return ergebnisse;
  }
}

/**
 * Kombinierte Geocoding-Funktion mit Google als Haupt-Geocoder
 * Fallback auf PLZ wenn Google keine genaue Adresse findet
 */
export async function geocodeAdresseSchnell(
  strasse: string,
  plz: string,
  ort: string
): Promise<GeocodingErgebnis> {
  // 1. Versuche Google Geocoding über Backend
  const googleResult = await geocodeMitGoogle(strasse, plz, ort);

  if (googleResult && (googleResult.confidence === 'hoch' || googleResult.confidence === 'mittel')) {
    return {
      erfolg: true,
      vorschlaege: [{
        displayName: googleResult.formattedAddress,
        strasse: googleResult.components.strasse,
        hausnummer: googleResult.components.hausnummer,
        plz: googleResult.components.plz,
        ort: googleResult.components.ort,
        koordinaten: googleResult.koordinaten,
        confidence: googleResult.confidence,
        typ: googleResult.confidence === 'hoch' ? 'building' : 'street',
      }],
      eindeutig: googleResult.confidence === 'hoch',
      quelle: 'google',
    };
  }

  // 2. Fallback: PLZ-Lookup (lokal, kostenlos)
  // Import dynamisch um zirkuläre Abhängigkeiten zu vermeiden
  const { getKoordinatenFuerPLZ } = await import('../data/plzKoordinaten');
  const plzCoords = getKoordinatenFuerPLZ(plz);

  if (plzCoords) {
    return {
      erfolg: true,
      vorschlaege: [{
        displayName: `${plz} ${ort || ''}`.trim(),
        plz,
        ort: ort || undefined,
        koordinaten: [plzCoords.lng, plzCoords.lat],
        confidence: 'niedrig',
        typ: 'postcode',
      }],
      eindeutig: false,
      quelle: 'plz',
    };
  }

  return {
    erfolg: false,
    vorschlaege: [],
    eindeutig: false,
    fehler: 'Adresse konnte nicht geocodiert werden',
  };
}

/**
 * Geocodiert eine Adresse und liefert mehrere Vorschläge zurück
 * Nutzt Backend für Google Geocoding mit mehreren Vorschlägen
 */
export async function geocodeAdresseMitVorschlaegen(
  strasse: string,
  plz: string,
  ort: string
): Promise<GeocodingErgebnis> {
  const vorschlaege: GeocodingVorschlag[] = [];

  // Bereinige Eingaben
  const strasseClean = strasse?.trim() || '';
  const plzClean = plz?.trim() || '';
  const ortClean = ort?.trim() || '';

  if (!plzClean && !ortClean) {
    return { erfolg: false, vorschlaege: [], eindeutig: false, fehler: 'PLZ oder Ort erforderlich' };
  }

  // Versuche Backend-Geocoding mit Vorschlägen
  if (useBackend('geocoding')) {
    try {
      const params = new URLSearchParams({
        strasse: strasseClean,
        plz: plzClean,
        ort: ortClean,
        limit: '5'
      });

      const response = await backendFetch<BackendSuggestionsResponse>(
        `/api/geo/google/suggestions?${params.toString()}`
      );

      if (response.success && response.suggestions.length > 0) {
        for (const suggestion of response.suggestions) {
          // Validiere Koordinaten (Deutschland)
          if (suggestion.lat < 47 || suggestion.lat > 56 || suggestion.lng < 5 || suggestion.lng > 16) {
            continue;
          }

          vorschlaege.push({
            displayName: suggestion.displayName,
            strasse: suggestion.components?.street,
            hausnummer: suggestion.components?.houseNumber,
            plz: suggestion.components?.postcode,
            ort: suggestion.components?.city,
            koordinaten: [suggestion.lng, suggestion.lat],
            confidence: suggestion.confidence,
            typ: suggestion.confidence === 'hoch' ? 'building' :
                 suggestion.confidence === 'mittel' ? 'street' : 'postcode',
          });
        }

        if (vorschlaege.length > 0) {
          const eindeutig = vorschlaege.length === 1 && vorschlaege[0].confidence === 'hoch';
          return {
            erfolg: true,
            vorschlaege,
            eindeutig,
            quelle: 'google',
          };
        }
      }
    } catch (error) {
      console.warn('Backend-Vorschläge Fehler, versuche Fallback:', error);
    }
  }

  // Fallback: PLZ-Lookup
  const { getKoordinatenFuerPLZ } = await import('../data/plzKoordinaten');
  const plzCoords = getKoordinatenFuerPLZ(plzClean);

  if (plzCoords) {
    vorschlaege.push({
      displayName: `${plzClean} ${ortClean || ''}`.trim(),
      plz: plzClean,
      ort: ortClean || undefined,
      koordinaten: [plzCoords.lng, plzCoords.lat],
      confidence: 'niedrig',
      typ: 'postcode',
    });

    return {
      erfolg: true,
      vorschlaege,
      eindeutig: false,
      quelle: 'plz',
    };
  }

  return {
    erfolg: false,
    vorschlaege: [],
    eindeutig: false,
    fehler: 'Adresse konnte nicht geocodiert werden',
  };
}

/**
 * Geocodiert eine Adresse (Straße, PLZ, Ort) zu Koordinaten
 * Verwendet Backend für Geocoding
 */
export async function geocodeAdresse(
  strasse: string,
  plz: string,
  ort: string
): Promise<[number, number] | null> {
  const result = await geocodeAdresseSchnell(strasse, plz, ort);

  if (result.erfolg && result.vorschlaege.length > 0) {
    return result.vorschlaege[0].koordinaten;
  }

  return null;
}

/**
 * Geocodiert nur eine PLZ zu Koordinaten (PLZ-Zentrum)
 * Verwendet lokalen PLZ-Lookup (kein API-Call nötig)
 */
export async function geocodePLZ(plz: string): Promise<[number, number] | null> {
  try {
    const { getKoordinatenFuerPLZ } = await import('../data/plzKoordinaten');
    const coords = getKoordinatenFuerPLZ(plz);

    if (coords) {
      return [coords.lng, coords.lat];
    }

    return null;
  } catch (error) {
    console.error('Fehler beim PLZ-Geocoding:', error);
    return null;
  }
}

/**
 * Hilfsfunktion: Adresse aus Projekt/Kunde extrahieren
 */
export function extrahiereAdresse(projekt: {
  lieferadresse?: { strasse?: string; plz?: string; ort?: string };
  kundenstrasse?: string;
  kundenPlzOrt?: string;
}): { strasse: string; plz: string; ort: string } | null {
  // Priorität 1: Lieferadresse
  if (projekt.lieferadresse?.strasse && projekt.lieferadresse?.plz && projekt.lieferadresse?.ort) {
    return {
      strasse: projekt.lieferadresse.strasse,
      plz: projekt.lieferadresse.plz,
      ort: projekt.lieferadresse.ort,
    };
  }

  // Priorität 2: Kundenstrasse + kundenPlzOrt
  if (projekt.kundenstrasse && projekt.kundenPlzOrt) {
    const plzMatch = projekt.kundenPlzOrt.match(/(\d{5})/);
    const plz = plzMatch ? plzMatch[1] : '';
    const ort = projekt.kundenPlzOrt.replace(/\d{5}\s*/, '').trim();

    if (plz && ort) {
      return {
        strasse: projekt.kundenstrasse,
        plz,
        ort,
      };
    }
  }

  return null;
}
