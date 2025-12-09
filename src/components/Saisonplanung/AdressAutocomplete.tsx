import { useEffect, useRef, useState } from 'react';
import { X, Search, MapPin } from 'lucide-react';

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
  strasse: string;
  plz: string;
  ort: string;
  bundesland?: string;
};

// EXTREM komfortables Autocomplete mit Nominatim (OpenStreetMap)
// - Unabhängiges Suchfeld (kein Auto-Fill)
// - Clear-Button für sofortiges Löschen
// - Debounce, Ergebnisliste, Tastatursteuerung
// - Smooth UX
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
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    // Fokus auf Suchfeld für sofortiges Weitertippen
    searchInputRef.current?.focus();
  };

  // Nominatim-Suche mit Debounce
  useEffect(() => {
    if (!query || query.trim().length < 3) {
      setVorschlaege([]);
      setHighlight(null);
      setShowDropdown(false);
      return;
    }

    // Debounce
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&countrycodes=de&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept-Language': 'de',
          },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: any[] = await res.json();
        const mapped = data
          .map((item) => {
            const addr = item.address || {};
            
            // Straße und Hausnummer zusammensetzen
            let str = '';
            if (addr.road) {
              str = addr.road;
              // Hausnummer nur anhängen wenn sie noch nicht in der Straße enthalten ist
              if (addr.house_number && !addr.road.includes(addr.house_number)) {
                str = `${addr.road} ${addr.house_number}`;
              }
            } else if (addr.house_number) {
              str = addr.house_number;
            }
            str = str.trim();
            
            const ortsteil = addr.city || addr.town || addr.village || addr.hamlet || '';
            const bundeslandName = addr.state;
            const plzCode = addr.postcode || '';
            if (!str && !ortsteil && !plzCode) return null;
            return {
              label: `${str ? str + ', ' : ''}${plzCode} ${ortsteil}${bundeslandName ? ` (${bundeslandName})` : ''}`,
              strasse: str,
              plz: plzCode,
              ort: ortsteil,
              bundesland: bundeslandName,
            } as Vorschlag;
          })
          .filter(Boolean) as Vorschlag[];
        setVorschlaege(mapped);
        setShowDropdown(mapped.length > 0);
        setHighlight(mapped.length > 0 ? 0 : null);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn('Nominatim Lookup Fehler', err);
        setError('Adresse konnte nicht geladen werden.');
        setVorschlaege([]);
        setShowDropdown(false);
        setHighlight(null);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [query]);

  const applyVorschlag = (v: Vorschlag) => {
    update({
      strasse: v.strasse || werte.strasse,
      plz: v.plz || werte.plz,
      ort: v.ort || werte.ort,
      bundesland: v.bundesland || werte.bundesland,
    });
    setQuery('');
    setVorschlaege([]);
    setShowDropdown(false);
    setHighlight(null);
    setError(null);
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

  return (
    <div className="space-y-4">
      {/* Header mit Clear-Button */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Adresse</h4>
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

      {/* Suchfeld - UNABHÄNGIG */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          <Search className="w-3.5 h-3.5 inline mr-1.5 text-gray-500" />
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
            placeholder="z.B. Musterweg 1, 80331 München"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent pr-10 transition-all"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
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
            className="absolute z-30 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-auto"
          >
            {vorschlaege.map((v, idx) => (
              <button
                type="button"
                key={`${v.label}-${idx}`}
                onClick={() => applyVorschlag(v)}
                onMouseEnter={() => setHighlight(idx)}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-red-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                  highlight === idx ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-gray-900">{v.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {v.strasse && <span>{v.strasse}</span>}
                      {v.plz && v.strasse && <span> • </span>}
                      {v.plz && <span>{v.plz}</span>}
                      {v.ort && <span> {v.ort}</span>}
                      {v.bundesland && <span> • {v.bundesland}</span>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hinweis */}
      {!hasContent && !query && (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <span className="text-blue-500 mt-0.5">ℹ️</span>
          <span>
            Suchen Sie nach einer Adresse oder füllen Sie die Felder unten manuell aus.
          </span>
        </div>
      )}

      {/* Manuelle Felder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Straße</label>
          <input
            type="text"
            value={werte.strasse}
            onChange={(e) => update({ strasse: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
            placeholder="z.B. Musterweg 1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">PLZ</label>
          <input
            type="text"
            value={werte.plz}
            onChange={(e) => update({ plz: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
            placeholder="z.B. 80331"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Ort</label>
          <input
            type="text"
            value={werte.ort}
            onChange={(e) => update({ ort: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
            placeholder="z.B. München"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Bundesland</label>
          <input
            type="text"
            value={werte.bundesland || ''}
            onChange={(e) => update({ bundesland: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
            placeholder="z.B. Bayern"
          />
        </div>
      </div>
    </div>
  );
};

export default AdressAutocomplete;
