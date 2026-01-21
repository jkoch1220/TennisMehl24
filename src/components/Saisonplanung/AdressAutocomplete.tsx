import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Search, MapPin, Loader2 } from 'lucide-react';

interface Adresse {
  strasse: string;
  plz: string;
  ort: string;
  bundesland?: string;
}

interface AdressAutocompleteProps extends Adresse {
  onAdresseChange: (adresse: Adresse) => void;
}

type Vorschlag = {
  label: string;
  placeId: string;
  strasse: string;
  plz: string;
  ort: string;
  bundesland?: string;
};

// Google Places API Key aus Umgebungsvariablen
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Google Maps Script laden
const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve();
      return;
    }

    // Prüfe ob Script bereits geladen wird
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Google Maps Script failed to load')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places&language=de&region=DE`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps Script failed to load'));
    document.head.appendChild(script);
  });
};

const AdressAutocomplete = ({
  strasse,
  plz,
  ort,
  bundesland,
  onAdresseChange,
}: AdressAutocompleteProps) => {
  const [werte, setWerte] = useState<Adresse>({
    strasse,
    plz,
    ort,
    bundesland,
  });
  const [query, setQuery] = useState('');
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [googleLoaded, setGoogleLoaded] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  // Google Maps laden
  useEffect(() => {
    if (!GOOGLE_API_KEY) {
      setError('Google API Key fehlt. Bitte VITE_GOOGLE_MAPS_API_KEY in .env setzen.');
      return;
    }

    loadGoogleMapsScript()
      .then(() => {
        setGoogleLoaded(true);
        autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
        // PlacesService braucht ein DOM-Element
        const dummyDiv = document.createElement('div');
        placesServiceRef.current = new google.maps.places.PlacesService(dummyDiv);
        // Session Token für Billing-Optimierung
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      })
      .catch((err) => {
        console.error('Google Maps laden fehlgeschlagen:', err);
        setError('Google Maps konnte nicht geladen werden.');
      });
  }, []);

  // Sync mit Props (bei Edit-Mode)
  useEffect(() => {
    setWerte({ strasse, plz, ort, bundesland });
  }, [strasse, plz, ort, bundesland]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setVorschlaege([]);
        setHighlight(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const update = (patch: Partial<Adresse>) => {
    const neu = { ...werte, ...patch };
    setWerte(neu);
    onAdresseChange(neu);
  };

  const clearAll = () => {
    const leer = { strasse: '', plz: '', ort: '', bundesland: '' };
    setWerte(leer);
    onAdresseChange(leer);
    setQuery('');
    setVorschlaege([]);
    setShowDropdown(false);
    setHighlight(null);
    setError(null);
    searchInputRef.current?.focus();
  };

  // Google Places Autocomplete Suche
  const searchPlaces = useCallback((input: string) => {
    if (!autocompleteServiceRef.current || !input || input.length < 2) {
      setVorschlaege([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    setError(null);

    const request: google.maps.places.AutocompletionRequest = {
      input,
      componentRestrictions: { country: 'de' },
      types: ['address'],
      sessionToken: sessionTokenRef.current!,
    };

    autocompleteServiceRef.current.getPlacePredictions(request, (predictions, status) => {
      setLoading(false);

      if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
        if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          setVorschlaege([]);
          setShowDropdown(false);
        } else {
          console.warn('Places API Fehler:', status);
        }
        return;
      }

      const mapped: Vorschlag[] = predictions.map((prediction) => ({
        label: prediction.description,
        placeId: prediction.place_id,
        strasse: '',
        plz: '',
        ort: '',
        bundesland: '',
      }));

      setVorschlaege(mapped);
      setShowDropdown(mapped.length > 0);
      setHighlight(mapped.length > 0 ? 0 : null);
    });
  }, []);

  // Debounced Suche
  useEffect(() => {
    if (!googleLoaded) return;

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    if (!query || query.length < 2) {
      setVorschlaege([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      searchPlaces(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, googleLoaded, searchPlaces]);

  // Place Details abrufen und Adresse extrahieren
  const getPlaceDetails = (placeId: string): Promise<Adresse> => {
    return new Promise((resolve, reject) => {
      if (!placesServiceRef.current) {
        reject(new Error('PlacesService nicht verfügbar'));
        return;
      }

      const request: google.maps.places.PlaceDetailsRequest = {
        placeId,
        fields: ['address_components', 'formatted_address'],
        sessionToken: sessionTokenRef.current!,
      };

      placesServiceRef.current.getDetails(request, (place, status) => {
        // Neues Session Token nach getDetails (für Billing-Optimierung)
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();

        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          reject(new Error(`Place Details Fehler: ${status}`));
          return;
        }

        const components = place.address_components || [];
        let streetNumber = '';
        let route = '';
        let postalCode = '';
        let locality = '';
        let adminArea1 = ''; // Bundesland

        for (const component of components) {
          const types = component.types;
          if (types.includes('street_number')) {
            streetNumber = component.long_name;
          } else if (types.includes('route')) {
            route = component.long_name;
          } else if (types.includes('postal_code')) {
            postalCode = component.long_name;
          } else if (types.includes('locality')) {
            locality = component.long_name;
          } else if (types.includes('sublocality_level_1') && !locality) {
            // Fallback für Ortsteile
            locality = component.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            adminArea1 = component.long_name;
          }
        }

        // Straße zusammensetzen (deutsche Schreibweise: Straße Hausnummer)
        const strasse = route ? (streetNumber ? `${route} ${streetNumber}` : route) : '';

        resolve({
          strasse,
          plz: postalCode,
          ort: locality,
          bundesland: adminArea1,
        });
      });
    });
  };

  const applyVorschlag = async (v: Vorschlag) => {
    setLoading(true);
    try {
      const adresse = await getPlaceDetails(v.placeId);
      update({
        strasse: adresse.strasse || werte.strasse,
        plz: adresse.plz || werte.plz,
        ort: adresse.ort || werte.ort,
        bundesland: adresse.bundesland || werte.bundesland,
      });
    } catch (err) {
      console.error('Fehler beim Laden der Adressdetails:', err);
      setError('Adressdetails konnten nicht geladen werden.');
    } finally {
      setLoading(false);
      setQuery('');
      setVorschlaege([]);
      setShowDropdown(false);
      setHighlight(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!vorschlaege.length || !showDropdown) {
      if (e.key === 'Escape') {
        setQuery('');
        setShowDropdown(false);
        setVorschlaege([]);
        setHighlight(null);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((prev) => {
        if (prev === null) return 0;
        return (prev + 1) % vorschlaege.length;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((prev) => {
        if (prev === null) return vorschlaege.length - 1;
        return (prev - 1 + vorschlaege.length) % vorschlaege.length;
      });
    } else if (e.key === 'Enter') {
      if (highlight !== null && vorschlaege[highlight]) {
        e.preventDefault();
        applyVorschlag(vorschlaege[highlight]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      setShowDropdown(false);
      setVorschlaege([]);
      setHighlight(null);
      searchInputRef.current?.blur();
    }
  };

  const hasContent = werte.strasse || werte.plz || werte.ort || werte.bundesland;

  // Fallback wenn kein API Key
  if (!GOOGLE_API_KEY) {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Google Places API nicht konfiguriert.</strong><br />
            Bitte <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> in der <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">.env</code> Datei setzen.
          </p>
        </div>
        {/* Manuelle Felder als Fallback */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1.5">Straße</label>
            <input
              type="text"
              value={werte.strasse}
              onChange={(e) => update({ strasse: e.target.value })}
              className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              placeholder="z.B. Musterweg 1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1.5">PLZ</label>
            <input
              type="text"
              value={werte.plz}
              onChange={(e) => update({ plz: e.target.value })}
              className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              placeholder="z.B. 80331"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1.5">Ort</label>
            <input
              type="text"
              value={werte.ort}
              onChange={(e) => update({ ort: e.target.value })}
              className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              placeholder="z.B. München"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1.5">Bundesland</label>
            <input
              type="text"
              value={werte.bundesland || ''}
              onChange={(e) => update({ bundesland: e.target.value })}
              className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              placeholder="z.B. Bayern"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header mit Clear-Button */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-400 flex items-center gap-2">
          Adresse
          <span className="text-xs font-normal text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
            Google Places
          </span>
        </h4>
        {hasContent && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 transition-colors font-medium"
          >
            <X className="w-3.5 h-3.5" />
            Alles löschen
          </button>
        )}
      </div>

      {/* Suchfeld */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1.5">
          <Search className="w-3.5 h-3.5 inline mr-1.5 text-gray-500 dark:text-slate-400" />
          Adresse suchen
        </label>
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (vorschlaege.length > 0) {
                setShowDropdown(true);
              }
            }}
            placeholder="z.B. Raiffeisenweg 1, Giebelstadt"
            disabled={!googleLoaded}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent pr-10 transition-all disabled:bg-gray-100 disabled:cursor-wait"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
            </div>
          )}
          {query && !loading && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setVorschlaege([]);
                setShowDropdown(false);
                searchInputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
            <span className="inline-block w-1 h-1 bg-red-600 rounded-full"></span>
            {error}
          </p>
        )}

        {/* Dropdown mit Vorschlägen */}
        {showDropdown && vorschlaege.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-30 mt-2 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl max-h-64 overflow-auto"
          >
            {vorschlaege.map((v, idx) => (
              <button
                type="button"
                key={v.placeId}
                onClick={() => applyVorschlag(v)}
                onMouseEnter={() => setHighlight(idx)}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-b border-gray-100 dark:border-slate-700 last:border-b-0 ${
                  highlight === idx ? 'bg-red-50 dark:bg-red-900/20' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="font-medium text-gray-900 dark:text-slate-100">{v.label}</div>
                </div>
              </button>
            ))}
            <div className="px-4 py-2 text-xs text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-900/50 flex items-center gap-1">
              <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" className="h-3 dark:invert" />
            </div>
          </div>
        )}
      </div>

      {/* Hinweis */}
      {!hasContent && !query && googleLoaded && (
        <div className="text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 flex items-start gap-2">
          <span className="text-blue-500 mt-0.5">ℹ️</span>
          <span>
            Geben Sie eine Adresse ein - Google findet Straßen, Orte und PLZ automatisch.
          </span>
        </div>
      )}

      {/* Manuelle Felder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1.5">Straße</label>
          <input
            type="text"
            value={werte.strasse}
            onChange={(e) => update({ strasse: e.target.value })}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
            placeholder="z.B. Musterweg 1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1.5">PLZ</label>
          <input
            type="text"
            value={werte.plz}
            onChange={(e) => update({ plz: e.target.value })}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
            placeholder="z.B. 80331"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1.5">Ort</label>
          <input
            type="text"
            value={werte.ort}
            onChange={(e) => update({ ort: e.target.value })}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
            placeholder="z.B. München"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1.5">Bundesland</label>
          <input
            type="text"
            value={werte.bundesland || ''}
            onChange={(e) => update({ bundesland: e.target.value })}
            className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
            placeholder="z.B. Bayern"
          />
        </div>
      </div>
    </div>
  );
};

export default AdressAutocomplete;
