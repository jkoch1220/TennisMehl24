import { useEffect, useMemo, useRef, useState } from 'react';

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

// Komfortables Autocomplete mit Nominatim (OpenStreetMap)
// - Debounce, Ergebnisliste, Tastatursteuerung
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
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setWerte({ strasse, plz, ort, bundesland });
  }, [strasse, plz, ort, bundesland]);

  const update = (patch: Partial<Adresse>) => {
    const neu = { ...werte, ...patch };
    setWerte(neu);
    onAdresseChange(neu);
  };

  // Abgeleitete Suchzeichenfolge
  const searchTerm = useMemo(() => {
    const parts = [werte.strasse, werte.plz, werte.ort].filter(Boolean).join(' ');
    return query || parts;
  }, [werte.strasse, werte.plz, werte.ort, query]);

  // Nominatim-Suche mit Debounce
  useEffect(() => {
    if (!searchTerm || searchTerm.trim().length < 3) {
      setVorschlaege([]);
      setHighlight(null);
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
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&countrycodes=de&q=${encodeURIComponent(searchTerm)}`;
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
            const str = `${addr.road ?? ''} ${addr.house_number ?? ''}`.trim();
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
        setHighlight(mapped.length ? 0 : null);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn('Nominatim Lookup Fehler', err);
        setError('Adresse konnte nicht geladen werden. Bitte später erneut versuchen.');
        setVorschlaege([]);
        setHighlight(null);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [searchTerm]);

  const applyVorschlag = (v: Vorschlag) => {
    setQuery('');
    setVorschlaege([]);
    setHighlight(null);
    update({
      strasse: v.strasse || werte.strasse,
      plz: v.plz || werte.plz,
      ort: v.ort || werte.ort,
      bundesland: v.bundesland || werte.bundesland,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!vorschlaege.length) return;
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
      setVorschlaege([]);
      setHighlight(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Suchfeld */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">Adresse suchen</label>
        <input
          type="text"
          value={query || searchTerm}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="z.B. Musterweg 1, 80331 München"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 pr-10"
        />
        {loading && (
          <div className="absolute right-3 top-9 h-4 w-4 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
        )}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

        {vorschlaege.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {vorschlaege.map((v, idx) => (
              <button
                type="button"
                key={`${v.label}-${idx}`}
                onClick={() => applyVorschlag(v)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                  highlight === idx ? 'bg-gray-100' : ''
                }`}
              >
                <div className="font-medium text-gray-900">{v.label}</div>
                <div className="text-xs text-gray-500">
                  {v.strasse && <span>{v.strasse}</span>} {v.plz && <span>{v.plz} </span>}
                  {v.ort && <span>{v.ort}</span>} {v.bundesland && <span>· {v.bundesland}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
          <input
            type="text"
            value={werte.strasse}
            onChange={(e) => update({ strasse: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="z.B. Musterweg 1"
          />
        </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">PLZ</label>
        <input
          type="text"
          value={werte.plz}
          onChange={(e) => update({ plz: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
        <input
          type="text"
          value={werte.ort}
          onChange={(e) => update({ ort: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-1">Bundesland</label>
        <input
          type="text"
          value={werte.bundesland || ''}
          onChange={(e) => update({ bundesland: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="z.B. Bayern"
        />
      </div>
    </div>
    </div>
  );
};

export default AdressAutocomplete;
