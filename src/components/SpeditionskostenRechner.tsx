import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Calculator, Truck, Package, TrendingUp, Fuel, Clock, MapPin, Settings, Users } from 'lucide-react';
import { Warenart, AufschlagTyp, Lieferart, EigenlieferungStammdaten, FremdlieferungStammdaten, SpeditionskostenErgebnis, Lieferant } from '../types';
import { berechneSpeditionskosten } from '../utils/calculations';
import {
  getZoneFromPLZ,
} from '../constants/pricing';
import { holeDieselPreis, istDieselPreisAPIVerfuegbar } from '../utils/dieselPreisAPI';
import { formatZeit } from '../utils/routeCalculation';
import { NumberInput } from './NumberInput';
import { lieferantService } from '../services/lieferantService';
import LieferantenVerwaltung from './SpeditionskostenRechner/LieferantenVerwaltung';

const START_PLZ = '97828'; // Standort des Unternehmens: Wertheimer Str. 30, 97828 Marktheidenfeld
const START_ADRESSE = 'Wertheimer Str. 30, 97828 Marktheidenfeld';

const SpeditionskostenRechner = () => {
  const [warenart, setWarenart] = useState<Warenart>('sackware');
  const [paletten, setPaletten] = useState<number>(1);
  const [gewicht, setGewicht] = useState<number>(1000);
  const [zielPLZ, setZielPLZ] = useState<string>('');
  const [aufschlagTyp, setAufschlagTyp] = useState<AufschlagTyp>('endkunde');
  const [lieferart, setLieferart] = useState<Lieferart>('spedition');
  
  // Eigenlieferung Stammdaten
  const [stammdaten, setStammdaten] = useState<EigenlieferungStammdaten>({
    dieselverbrauchDurchschnitt: 30.0, // Liter pro 100km
    durchschnittsgeschwindigkeit: 60.0, // km/h
    dieselLiterKostenBrutto: 1.50, // €/Liter
    beladungszeit: 30, // Minuten
    abladungszeit: 30, // Minuten pro Abladestelle
    anzahlAbladestellen: 1, // Anzahl der Abladestellen
    pausenzeit: 45, // Minuten pro 4 Stunden
    verschleisspauschaleProKm: 0.50, // €/km - Verschleißpauschale pro gefahrenen Kilometer
    lkwLadungInTonnen: 1.0, // Tonnen - LKW Ladung in Tonnen für Kostenberechnung
  });
  
  // Fremdlieferung Stammdaten
  const [fremdlieferungStammdaten, setFremdlieferungStammdaten] = useState<FremdlieferungStammdaten>({
    stundenlohn: 25.0, // €/Stunde
    durchschnittsgeschwindigkeit: 60.0, // km/h
    beladungszeit: 30, // Minuten
    abladungszeit: 30, // Minuten pro Abladestelle
    anzahlAbladestellen: 1, // Anzahl der Abladestellen
    pausenzeit: 45, // Minuten pro 4 Stunden
    lkwLadungInTonnen: 1.0, // Tonnen - LKW Ladung in Tonnen für Kostenberechnung
  });
  
  const [dieselPreisManuell, setDieselPreisManuell] = useState<boolean>(false);
  const [ergebnis, setErgebnis] = useState<SpeditionskostenErgebnis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [herstellkostenJeTonne, setHerstellkostenJeTonne] = useState<number | undefined>(undefined);
  
  // Lieferanten
  const [lieferanten, setLieferanten] = useState<Lieferant[]>([]);
  const [ausgewaehlterLieferantId, setAusgewaehlterLieferantId] = useState<string | null>(null);
  const [showLieferantenVerwaltung, setShowLieferantenVerwaltung] = useState(false);
  
  // Ref für Debouncing
  const berechnungsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dieselPreisTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Lade Abwerkspreis (Herstellkosten je Tonne) aus Variable-Kosten-Rechner
  useEffect(() => {
    const loadHerstellkosten = () => {
      const savedHerstellkosten = localStorage.getItem('herstellkostenJeTonne');
      if (savedHerstellkosten) {
        setHerstellkostenJeTonne(parseFloat(savedHerstellkosten));
      }
    };

    // Beim Mount laden
    loadHerstellkosten();

    // Event Listener für Änderungen im localStorage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'herstellkostenJeTonne' && e.newValue) {
        setHerstellkostenJeTonne(parseFloat(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Polling für localStorage-Änderungen (für gleichen Tab) - reduziert von 1s auf 3s
    const interval = setInterval(loadHerstellkosten, 3000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Lade Lieferanten beim Mount
  useEffect(() => {
    loadLieferanten();
  }, []);

  const loadLieferanten = async () => {
    try {
      const data = await lieferantService.loadAlleLieferanten();
      setLieferanten(data);
    } catch (error) {
      console.error('Fehler beim Laden der Lieferanten:', error);
    }
  };

  // Aktualisiere Fremdlieferung-Stammdaten wenn Lieferant ausgewählt wird
  useEffect(() => {
    if (ausgewaehlterLieferantId && lieferart === 'fremdlieferung') {
      const lieferant = lieferanten.find(l => l.id === ausgewaehlterLieferantId);
      if (lieferant) {
        setFremdlieferungStammdaten(prev => ({
          ...prev,
          stundenlohn: lieferant.stundenlohn,
          lkwLadungInTonnen: lieferant.lieferVolumen,
        }));
      }
    }
  }, [ausgewaehlterLieferantId, lieferart, lieferanten]);

  // Lade Dieselpreis automatisch wenn Eigenlieferung gewählt (mit Debouncing)
  useEffect(() => {
    if (dieselPreisTimeoutRef.current) {
      clearTimeout(dieselPreisTimeoutRef.current);
    }
    
    if (lieferart === 'eigenlieferung' && zielPLZ && zielPLZ.length >= 5 && !dieselPreisManuell && istDieselPreisAPIVerfuegbar()) {
      dieselPreisTimeoutRef.current = setTimeout(() => {
        holeDieselPreis(zielPLZ).then(preis => {
          setStammdaten(prev => ({ ...prev, dieselLiterKostenBrutto: preis }));
        }).catch(error => {
          console.error('Fehler beim Laden des Dieselpreises:', error);
        });
      }, 500); // 500ms Debounce
    }
    
    return () => {
      if (dieselPreisTimeoutRef.current) {
        clearTimeout(dieselPreisTimeoutRef.current);
      }
    };
  }, [zielPLZ, lieferart, dieselPreisManuell]);

  // Memoize relevante Stammdaten-Werte für Dependencies
  const eigenlieferungStammdatenKey = useMemo(() => 
    lieferart === 'eigenlieferung' 
      ? JSON.stringify(stammdaten)
      : null,
    [lieferart, stammdaten.dieselverbrauchDurchschnitt, stammdaten.durchschnittsgeschwindigkeit, 
     stammdaten.dieselLiterKostenBrutto, stammdaten.beladungszeit, stammdaten.abladungszeit, 
     stammdaten.anzahlAbladestellen, stammdaten.verschleisspauschaleProKm, stammdaten.lkwLadungInTonnen]
  );
  
  const fremdlieferungStammdatenKey = useMemo(() => 
    lieferart === 'fremdlieferung' 
      ? JSON.stringify(fremdlieferungStammdaten)
      : null,
    [lieferart, fremdlieferungStammdaten.stundenlohn, fremdlieferungStammdaten.durchschnittsgeschwindigkeit,
     fremdlieferungStammdaten.beladungszeit, fremdlieferungStammdaten.abladungszeit,
     fremdlieferungStammdaten.anzahlAbladestellen, fremdlieferungStammdaten.lkwLadungInTonnen]
  );

  // Berechne Speditionskosten mit Debouncing
  useEffect(() => {
    // Clear previous timeout
    if (berechnungsTimeoutRef.current) {
      clearTimeout(berechnungsTimeoutRef.current);
    }

    if (!zielPLZ || zielPLZ.length < 5) {
      setErgebnis(null);
      return;
    }

    // Debounce Berechnung um 300ms
    setIsLoading(true);
    berechnungsTimeoutRef.current = setTimeout(() => {
      const eigenlieferungData = lieferart === 'eigenlieferung' ? stammdaten : undefined;
      const fremdlieferungData = lieferart === 'fremdlieferung' ? fremdlieferungStammdaten : undefined;
      
      berechneSpeditionskosten(
        warenart,
        paletten,
        gewicht,
        zielPLZ,
        aufschlagTyp,
        lieferart,
        eigenlieferungData,
        fremdlieferungData,
        START_PLZ,
        herstellkostenJeTonne
      ).then(result => {
        setErgebnis(result);
        setIsLoading(false);
      }).catch(error => {
        console.error('Fehler bei Berechnung:', error);
        setIsLoading(false);
      });
    }, 300);

    return () => {
      if (berechnungsTimeoutRef.current) {
        clearTimeout(berechnungsTimeoutRef.current);
      }
    };
  }, [warenart, paletten, gewicht, zielPLZ, aufschlagTyp, lieferart, eigenlieferungStammdatenKey, fremdlieferungStammdatenKey, herstellkostenJeTonne]);

  // Memoize Zone-Berechnung
  const zone = useMemo(() => 
    zielPLZ.length >= 2 ? getZoneFromPLZ(zielPLZ) : null,
    [zielPLZ]
  );
  
  // Memoize berechnete Werte für Anzeige
  const tonnen = useMemo(() => gewicht / 1000, [gewicht]);
  const gesamtAbladungszeitEigenlieferung = useMemo(
    () => stammdaten.abladungszeit * stammdaten.anzahlAbladestellen,
    [stammdaten.abladungszeit, stammdaten.anzahlAbladestellen]
  );
  const gesamtAbladungszeitFremdlieferung = useMemo(
    () => fremdlieferungStammdaten.abladungszeit * fremdlieferungStammdaten.anzahlAbladestellen,
    [fremdlieferungStammdaten.abladungszeit, fremdlieferungStammdaten.anzahlAbladestellen]
  );
  
  // Memoize Handler-Funktionen
  const handlePalettenChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = parseInt(e.target.value);
    setPaletten(p);
    setGewicht(p * 1000);
  }, []);
  
  const handleZielPLZChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setZielPLZ(e.target.value.replace(/\D/g, '').slice(0, 5));
  }, []);
  
  const handleAufschlagTypChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setAufschlagTyp(e.target.value as AufschlagTyp);
  }, []);
  
  const handleDieselPreisToggle = useCallback(() => {
    setDieselPreisManuell(prev => {
      const newValue = !prev;
      if (!newValue && zielPLZ && zielPLZ.length >= 5) {
        holeDieselPreis(zielPLZ).then(preis => {
          setStammdaten(prevStammdaten => ({ ...prevStammdaten, dieselLiterKostenBrutto: preis }));
        });
      }
      return newValue;
    });
  }, [zielPLZ]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-8">
            <Calculator className="w-10 h-10 text-red-600" />
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              Speditionskosten-Rechner
            </h1>
          </div>

          {/* Lieferart Auswahl */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border-2 border-blue-200">
            <label className="block text-lg font-semibold text-gray-700 mb-3">
              Lieferart wählen
            </label>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setLieferart('spedition')}
                className={`p-4 rounded-lg font-semibold transition-all ${
                  lieferart === 'spedition'
                    ? 'bg-blue-500 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-blue-100'
                }`}
              >
                <Truck className="w-6 h-6 mx-auto mb-2" />
                Spedition
              </button>
              <button
                onClick={() => setLieferart('eigenlieferung')}
                className={`p-4 rounded-lg font-semibold transition-all ${
                  lieferart === 'eigenlieferung'
                    ? 'bg-blue-500 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-blue-100'
                }`}
              >
                <Truck className="w-6 h-6 mx-auto mb-2" />
                Eigenlieferung
              </button>
              <button
                onClick={() => setLieferart('fremdlieferung')}
                className={`p-4 rounded-lg font-semibold transition-all ${
                  lieferart === 'fremdlieferung'
                    ? 'bg-blue-500 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-blue-100'
                }`}
              >
                <Truck className="w-6 h-6 mx-auto mb-2" />
                Fremdlieferung
              </button>
            </div>
          </div>

          {/* Warenart Auswahl */}
          <div className="mb-6 p-4 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl border-2 border-yellow-200">
            <label className="block text-lg font-semibold text-gray-700 mb-3">
              Warenart wählen
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setWarenart('sackware')}
                className={`p-4 rounded-lg font-semibold transition-all ${
                  warenart === 'sackware'
                    ? 'bg-yellow-500 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-yellow-100'
                }`}
              >
                <Package className="w-6 h-6 mx-auto mb-2" />
                Sackware
              </button>
              <button
                onClick={() => setWarenart('schuettware')}
                className={`p-4 rounded-lg font-semibold transition-all ${
                  warenart === 'schuettware'
                    ? 'bg-yellow-500 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-yellow-100'
                }`}
              >
                <TrendingUp className="w-6 h-6 mx-auto mb-2" />
                Schüttware
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {/* Paletten/Menge */}
            <div className="bg-orange-50 p-6 rounded-xl">
              <label className="flex items-center gap-2 text-lg font-semibold text-gray-700 mb-3">
                <Package className="w-5 h-5 text-orange-600" />
                Anzahl Paletten
              </label>
              <select
                value={paletten}
                onChange={handlePalettenChange}
                className="w-full p-3 border-2 border-orange-200 rounded-lg text-lg focus:border-orange-400 focus:outline-none"
              >
                <option value={1}>1 Palette</option>
                <option value={2}>2 Paletten</option>
                <option value={3}>3 Paletten</option>
                <option value={4}>4 Paletten</option>
                <option value={5}>5 Paletten</option>
              </select>
              <p className="text-sm text-gray-600 mt-2">
                Gewicht: {gewicht} kg = {tonnen.toFixed(2)} Tonnen
              </p>
            </div>

            {/* Ziel-PLZ */}
            <div className="bg-blue-50 p-6 rounded-xl">
              <label className="flex items-center gap-2 text-lg font-semibold text-gray-700 mb-3">
                <MapPin className="w-5 h-5 text-blue-600" />
                Ziel-Postleitzahl
              </label>
              <input
                type="text"
                value={zielPLZ}
                onChange={handleZielPLZChange}
                placeholder="z.B. 10115"
                maxLength={5}
                className="w-full p-3 border-2 border-blue-200 rounded-lg text-lg focus:border-blue-400 focus:outline-none"
              />
              {zone && (
                <p className="text-sm text-gray-600 mt-2">Zone: {zone}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Start: {START_ADRESSE}
              </p>
            </div>

            {/* Kundentyp */}
            <div className="bg-purple-50 p-6 rounded-xl">
              <label className="block text-lg font-semibold text-gray-700 mb-3">
                Kundentyp
              </label>
              <select
                value={aufschlagTyp}
                onChange={handleAufschlagTypChange}
                className="w-full p-3 border-2 border-purple-200 rounded-lg text-lg focus:border-purple-400 focus:outline-none"
              >
                <option value="endkunde">Endkunde (25% W+G)</option>
                <option value="grosskunde">Großkunde (12% W+G)</option>
              </select>
              <p className="text-sm text-gray-600 mt-2">
                Aufschlag: {aufschlagTyp === 'endkunde' ? '25%' : '12%'}
              </p>
            </div>
          </div>

          {/* Fremdlieferung Stammdaten */}
          {lieferart === 'fremdlieferung' && (
            <div className="mb-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Settings className="w-6 h-6" />
                  Stammdaten Fremdlieferung
                </h2>
                <button
                  onClick={() => setShowLieferantenVerwaltung(!showLieferantenVerwaltung)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                >
                  <Users className="w-4 h-4" />
                  {showLieferantenVerwaltung ? 'Verwaltung ausblenden' : 'Lieferanten verwalten'}
                </button>
              </div>

              {/* Lieferantenauswahl */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Lieferant auswählen
                </label>
                <div className="flex gap-2">
                  <select
                    value={ausgewaehlterLieferantId || ''}
                    onChange={(e) => {
                      setAusgewaehlterLieferantId(e.target.value || null);
                    }}
                    className="flex-1 p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                  >
                    <option value="">-- Bitte wählen --</option>
                    {lieferanten.map((lieferant) => (
                      <option key={lieferant.id} value={lieferant.id}>
                        {lieferant.name} ({lieferant.firma}) - {lieferant.stundenlohn.toFixed(2)} €/h
                      </option>
                    ))}
                  </select>
                </div>
                {ausgewaehlterLieferantId && (
                  <div className="mt-2 p-3 bg-white rounded-lg border border-purple-200">
                    <p className="text-sm text-gray-600">
                      <strong>Ausgewählt:</strong> {lieferanten.find(l => l.id === ausgewaehlterLieferantId)?.name} 
                      {' - '}
                      {lieferanten.find(l => l.id === ausgewaehlterLieferantId)?.firma}
                      {' - '}
                      LKW: {lieferanten.find(l => l.id === ausgewaehlterLieferantId)?.lkw}
                      {' - '}
                      Volumen: {lieferanten.find(l => l.id === ausgewaehlterLieferantId)?.lieferVolumen.toFixed(1)} t
                    </p>
                  </div>
                )}
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Stundenlohn (€/h)
                  </label>
                  <NumberInput
                    value={fremdlieferungStammdaten.stundenlohn}
                    onChange={(value) => setFremdlieferungStammdaten(prev => ({ ...prev, stundenlohn: value }))}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step={0.5}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Stundenlohn für Fremdlieferung
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Durchschnittsgeschwindigkeit (km/h)
                  </label>
                  <NumberInput
                    value={fremdlieferungStammdaten.durchschnittsgeschwindigkeit}
                    onChange={(value) => setFremdlieferungStammdaten(prev => ({ ...prev, durchschnittsgeschwindigkeit: value }))}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step={1}
                    min={0}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Beladungszeit (Minuten)
                  </label>
                  <NumberInput
                    value={fremdlieferungStammdaten.beladungszeit}
                    onChange={(value) => setFremdlieferungStammdaten(prev => ({ ...prev, beladungszeit: value }))}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step={1}
                    min={0}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Abladungszeit pro Abladestelle (Minuten)
                  </label>
                  <NumberInput
                    value={fremdlieferungStammdaten.abladungszeit}
                    onChange={(value) => setFremdlieferungStammdaten(prev => ({ ...prev, abladungszeit: value }))}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step={1}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Abladungszeit pro einzelne Abladestelle
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Anzahl Abladestellen
                  </label>
                  <NumberInput
                    value={fremdlieferungStammdaten.anzahlAbladestellen}
                    onChange={(value) => setFremdlieferungStammdaten(prev => ({ ...prev, anzahlAbladestellen: Math.max(1, Math.round(value)) }))}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step={1}
                    min={1}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Gesamtabladungszeit = {fremdlieferungStammdaten.abladungszeit} min × {fremdlieferungStammdaten.anzahlAbladestellen} = {gesamtAbladungszeitFremdlieferung} min
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    LKW Ladung in Tonnen
                  </label>
                  <NumberInput
                    value={fremdlieferungStammdaten.lkwLadungInTonnen}
                    onChange={(value) => setFremdlieferungStammdaten(prev => ({ ...prev, lkwLadungInTonnen: value }))}
                    className="w-full p-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none"
                    step={0.1}
                    min={0.1}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    LKW Ladung in Tonnen für Kostenberechnung pro Lieferung
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Eigenlieferung Stammdaten */}
          {lieferart === 'eigenlieferung' && (
            <div className="mb-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Settings className="w-6 h-6" />
                Stammdaten Eigenlieferung
              </h2>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Dieselverbrauch Durchschnitt (L/100km)
                  </label>
                  <NumberInput
                    value={stammdaten.dieselverbrauchDurchschnitt}
                    onChange={(value) => setStammdaten(prev => ({ ...prev, dieselverbrauchDurchschnitt: value }))}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={0.1}
                    min={0}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Durchschnittsgeschwindigkeit (km/h)
                  </label>
                  <NumberInput
                    value={stammdaten.durchschnittsgeschwindigkeit}
                    onChange={(value) => setStammdaten(prev => ({ ...prev, durchschnittsgeschwindigkeit: value }))}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={1}
                    min={0}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Diesel Liter Kosten Brutto (€/L)
                  </label>
                  <div className="flex gap-2">
                    <NumberInput
                      value={stammdaten.dieselLiterKostenBrutto}
                      onChange={(value) => setStammdaten(prev => ({ ...prev, dieselLiterKostenBrutto: value }))}
                      className="flex-1 p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                      step={0.01}
                      min={0}
                      readOnly={!dieselPreisManuell}
                    />
                    {istDieselPreisAPIVerfuegbar() && (
                      <button
                        onClick={handleDieselPreisToggle}
                        className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
                      >
                        {dieselPreisManuell ? 'Manuell' : 'API'}
                      </button>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Beladungszeit (Minuten)
                  </label>
                  <NumberInput
                    value={stammdaten.beladungszeit}
                    onChange={(value) => setStammdaten(prev => ({ ...prev, beladungszeit: value }))}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={1}
                    min={0}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Abladungszeit pro Abladestelle (Minuten)
                  </label>
                  <NumberInput
                    value={stammdaten.abladungszeit}
                    onChange={(value) => setStammdaten(prev => ({ ...prev, abladungszeit: value }))}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={1}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Abladungszeit pro einzelne Abladestelle
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Anzahl Abladestellen
                  </label>
                  <NumberInput
                    value={stammdaten.anzahlAbladestellen}
                    onChange={(value) => setStammdaten(prev => ({ ...prev, anzahlAbladestellen: Math.max(1, Math.round(value)) }))}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={1}
                    min={1}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Gesamtabladungszeit = {stammdaten.abladungszeit} min × {stammdaten.anzahlAbladestellen} = {gesamtAbladungszeitEigenlieferung} min
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Verschleißpauschale pro km (€/km)
                  </label>
                  <NumberInput
                    value={stammdaten.verschleisspauschaleProKm}
                    onChange={(value) => setStammdaten(prev => ({ ...prev, verschleisspauschaleProKm: value }))}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Verschleißkosten pro gefahrenen Kilometer
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    LKW Ladung in Tonnen
                  </label>
                  <NumberInput
                    value={stammdaten.lkwLadungInTonnen}
                    onChange={(value) => setStammdaten(prev => ({ ...prev, lkwLadungInTonnen: value }))}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={0.1}
                    min={0.1}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    LKW Ladung in Tonnen für Kostenberechnung pro Lieferung
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Ergebnisse */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Berechne Route...</p>
            </div>
          )}

          {ergebnis && !isLoading && (
            <div className="space-y-6">
              {/* Fremdlieferung Route Details */}
              {lieferart === 'fremdlieferung' && ergebnis.fremdlieferung && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200">
                  <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Truck className="w-6 h-6" />
                    Routenberechnung Fremdlieferung
                  </h2>
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        Distanz
                      </p>
                      <p className="text-2xl font-bold text-purple-600">
                        {ergebnis.fremdlieferung.route.distanz.toFixed(1)} km
                      </p>
                      {ergebnis.fremdlieferung.route.hinwegDistanz !== undefined && ergebnis.fremdlieferung.route.rueckwegDistanz !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">
                          Hinweg: {ergebnis.fremdlieferung.route.hinwegDistanz.toFixed(1)} km | 
                          Rückweg: {ergebnis.fremdlieferung.route.rueckwegDistanz.toFixed(1)} km
                        </p>
                      )}
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Fahrtzeit
                      </p>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatZeit(ergebnis.fremdlieferung.route.fahrzeit)}
                      </p>
                      {ergebnis.fremdlieferung.route.hinwegFahrzeit !== undefined && ergebnis.fremdlieferung.route.rueckwegFahrzeit !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">
                          Hinweg: {formatZeit(ergebnis.fremdlieferung.route.hinwegFahrzeit)} | 
                          Rückweg: {formatZeit(ergebnis.fremdlieferung.route.rueckwegFahrzeit)}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Gesamt: {formatZeit(ergebnis.fremdlieferung.route.gesamtzeit)} | 
                        Beladung: {ergebnis.fremdlieferung.route.beladungszeit}min | 
                        Abladung: {ergebnis.fremdlieferung.route.abladungszeit}min ({ergebnis.fremdlieferung.stammdaten.abladungszeit}min × {ergebnis.fremdlieferung.stammdaten.anzahlAbladestellen} Stellen) | 
                        Pause: {ergebnis.fremdlieferung.route.pausenzeit}min
                      </p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-xs text-gray-600 mb-1">
                        Stundenlohn
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {ergebnis.fremdlieferung.stammdaten.stundenlohn.toFixed(2)} €/h
                      </p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-xs text-gray-600 mb-1">
                        Lohnkosten
                      </p>
                      <p className="text-2xl font-bold text-red-600">
                        {ergebnis.fremdlieferung.route.lohnkosten.toFixed(2)} €
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {ergebnis.fremdlieferung.route.gesamtzeit.toFixed(0)} min = {(ergebnis.fremdlieferung.route.gesamtzeit / 60).toFixed(2)} h
                      </p>
                    </div>
                  </div>
                  
                  {/* Kosten pro Lieferung - Unten rechts */}
                  <div className="mt-4 bg-gradient-to-r from-purple-600 to-pink-600 p-6 rounded-lg text-white">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm opacity-90 mb-1">
                          Gesamtkosten für die Lieferung (Fremdlieferung)
                        </p>
                        <p className="text-3xl font-bold">
                          {ergebnis.transportkosten.toFixed(2)} €
                        </p>
                        <p className="text-xs opacity-75 mt-1">
                          Lohnkosten: {ergebnis.fremdlieferung.route.lohnkosten.toFixed(2)} €
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">
                          {ergebnis.transportkostenProTonne.toFixed(2)} €/t
                        </p>
                        <p className="text-sm opacity-90">
                          Transportkosten pro Tonne
                        </p>
                        <p className="text-xs opacity-75 mt-1">
                          bei {ergebnis.fremdlieferung.stammdaten.lkwLadungInTonnen.toFixed(1)} t LKW-Ladung
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Eigenlieferung Route Details */}
              {lieferart === 'eigenlieferung' && ergebnis.eigenlieferung && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200">
                  <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Truck className="w-6 h-6" />
                    Routenberechnung Eigenlieferung
                  </h2>
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        Distanz
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {ergebnis.eigenlieferung.route.distanz.toFixed(1)} km
                      </p>
                      {ergebnis.eigenlieferung.route.hinwegDistanz !== undefined && ergebnis.eigenlieferung.route.rueckwegDistanz !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">
                          Hinweg: {ergebnis.eigenlieferung.route.hinwegDistanz.toFixed(1)} km | 
                          Rückweg: {ergebnis.eigenlieferung.route.rueckwegDistanz.toFixed(1)} km
                        </p>
                      )}
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Fahrtzeit
                      </p>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatZeit(ergebnis.eigenlieferung.route.fahrzeit)}
                      </p>
                      {ergebnis.eigenlieferung.route.hinwegFahrzeit !== undefined && ergebnis.eigenlieferung.route.rueckwegFahrzeit !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">
                          Hinweg: {formatZeit(ergebnis.eigenlieferung.route.hinwegFahrzeit)} | 
                          Rückweg: {formatZeit(ergebnis.eigenlieferung.route.rueckwegFahrzeit)}
                      </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Gesamt: {formatZeit(ergebnis.eigenlieferung.route.gesamtzeit)} | 
                        Beladung: {ergebnis.eigenlieferung.route.beladungszeit}min | 
                        Abladung: {ergebnis.eigenlieferung.route.abladungszeit}min ({ergebnis.eigenlieferung.stammdaten.abladungszeit}min × {ergebnis.eigenlieferung.stammdaten.anzahlAbladestellen} Stellen) | 
                        Pause: {ergebnis.eigenlieferung.route.pausenzeit}min
                      </p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                        <Fuel className="w-4 h-4" />
                        Dieselverbrauch
                      </p>
                      <p className="text-2xl font-bold text-orange-600">
                        {ergebnis.eigenlieferung.route.dieselverbrauch.toFixed(2)} L
                      </p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-xs text-gray-600 mb-1">
                        Dieselkosten
                      </p>
                      <p className="text-2xl font-bold text-red-600">
                        {ergebnis.eigenlieferung.route.dieselkosten.toFixed(2)} €
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {ergebnis.eigenlieferung.stammdaten.dieselLiterKostenBrutto.toFixed(2)} €/L
                      </p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-xs text-gray-600 mb-1">
                        Verschleißkosten
                      </p>
                      <p className="text-2xl font-bold text-orange-600">
                        {ergebnis.eigenlieferung.route.verschleisskosten.toFixed(2)} €
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {ergebnis.eigenlieferung.stammdaten.verschleisspauschaleProKm.toFixed(3)} €/km
                      </p>
                    </div>
                  </div>
                  
                  {/* Kosten pro Lieferung - Unten rechts */}
                  <div className="mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 p-6 rounded-lg text-white">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm opacity-90 mb-1">
                          Gesamtkosten für die Lieferung (Eigenlieferung)
                        </p>
                        <p className="text-3xl font-bold">
                          {ergebnis.transportkosten.toFixed(2)} €
                        </p>
                        <p className="text-xs opacity-75 mt-1">
                          Diesel: {ergebnis.eigenlieferung.route.dieselkosten.toFixed(2)} € + 
                          Verschleiß: {ergebnis.eigenlieferung.route.verschleisskosten.toFixed(2)} €
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">
                          {ergebnis.transportkostenProTonne.toFixed(2)} €/t
                        </p>
                        <p className="text-sm opacity-90">
                          Transportkosten pro Tonne
                        </p>
                        <p className="text-xs opacity-75 mt-1">
                          bei {ergebnis.eigenlieferung.stammdaten.lkwLadungInTonnen.toFixed(1)} t LKW-Ladung
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Hauptergebnisse */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">
                  Preisübersicht
                </h2>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-xs text-gray-600 mb-1">
                      Herstellungskosten
                    </p>
                    <p className="text-2xl font-bold text-orange-600">
                      {ergebnis.herstellungskostenGesamt.toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-500">
                      {ergebnis.herstellungskostenProTonne.toFixed(2)} €/t
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-xs text-gray-600 mb-1">
                      Werkspreis ab Werk
                    </p>
                    <p className="text-2xl font-bold text-blue-600">
                      {ergebnis.werkspreis.toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-500">
                      {aufschlagTyp === 'endkunde' ? 'inkl. 25% W+G (Endkunde)' : 'inkl. 12% W+G (Großkunde)'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Basis: {(ergebnis.werkspreis - ergebnis.aufschlag).toFixed(2)} € + {ergebnis.aufschlag.toFixed(2)} € Aufschlag
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-xs text-gray-600 mb-1">
                      Transportkosten
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {ergebnis.transportkosten.toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-500">
                      {lieferart === 'spedition' ? `Zone ${zone}` : lieferart === 'eigenlieferung' ? 'Eigenlieferung' : 'Fremdlieferung'}
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-xs text-gray-600 mb-1">Verkaufspreis</p>
                    <p className="text-2xl font-bold text-green-600">
                      {ergebnis.verkaufspreis.toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-500">
                      = Werkspreis (Aufschlag bereits enthalten)
                    </p>
                  </div>
                </div>

                {/* Gesamtpreis hervorgehoben */}
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 rounded-lg text-white">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm opacity-90 mb-1">
                        Gesamtpreis inkl. Lieferung
                      </p>
                      <p className="text-4xl font-bold">
                        {ergebnis.gesamtpreisMitLieferung.toFixed(2)} €
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {ergebnis.preisProTonne.toFixed(2)} €/t
                      </p>
                      <p className="text-sm opacity-90">
                        {ergebnis.preisProKg.toFixed(2)} €/kg
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!ergebnis && !isLoading && zielPLZ && zielPLZ.length >= 5 && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 text-center">
              <p className="text-gray-700">
                PLZ nicht gefunden. Bitte geben Sie eine gültige deutsche PLZ ein.
              </p>
            </div>
          )}

          {!zielPLZ && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 text-center">
              <p className="text-gray-700">
                Bitte geben Sie eine Ziel-PLZ ein, um die Lieferkosten zu berechnen.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Alle Preise in Euro inkl. MwSt. • Herstellungskosten basierend auf
            Kalkulation 2026
          </p>
        </div>
      </div>

      {/* Lieferantenverwaltung */}
      {showLieferantenVerwaltung && (
        <div className="mt-8">
          <LieferantenVerwaltung onLieferantSaved={loadLieferanten} />
        </div>
      )}
    </div>
  );
};

export default SpeditionskostenRechner;

