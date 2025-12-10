import { useState, useEffect } from 'react';
import { Calculator, Truck, Package, TrendingUp, Fuel, Clock, MapPin, Settings } from 'lucide-react';
import { Warenart, AufschlagTyp, Lieferart, EigenlieferungStammdaten, SpeditionskostenErgebnis } from '../types';
import { berechneSpeditionskosten } from '../utils/calculations';
import {
  getZoneFromPLZ,
} from '../constants/pricing';
import { holeDieselPreis, istDieselPreisAPIVerfuegbar } from '../utils/dieselPreisAPI';
import { formatZeit } from '../utils/routeCalculation';
import { NumberInput } from './NumberInput';

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
    abladungszeit: 30, // Minuten
    pausenzeit: 45, // Minuten pro 4 Stunden
    verschleisspauschaleProKm: 0.50, // €/km - Verschleißpauschale pro gefahrenen Kilometer
    lkwLadungInTonnen: 1.0, // Tonnen - LKW Ladung in Tonnen für Kostenberechnung
  });
  
  const [dieselPreisManuell, setDieselPreisManuell] = useState<boolean>(false);
  const [ergebnis, setErgebnis] = useState<SpeditionskostenErgebnis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [herstellkostenJeTonne, setHerstellkostenJeTonne] = useState<number | undefined>(undefined);

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

    // Polling für localStorage-Änderungen (für gleichen Tab)
    const interval = setInterval(loadHerstellkosten, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Lade Dieselpreis automatisch wenn Eigenlieferung gewählt
  useEffect(() => {
    if (lieferart === 'eigenlieferung' && zielPLZ && !dieselPreisManuell && istDieselPreisAPIVerfuegbar()) {
      holeDieselPreis(zielPLZ).then(preis => {
        setStammdaten(prev => ({ ...prev, dieselLiterKostenBrutto: preis }));
      });
    }
  }, [zielPLZ, lieferart, dieselPreisManuell]);

  // Berechne Speditionskosten
  useEffect(() => {
    if (!zielPLZ || zielPLZ.length < 5) {
      setErgebnis(null);
      return;
    }

    setIsLoading(true);
    berechneSpeditionskosten(
      warenart,
      paletten,
      gewicht,
      zielPLZ,
      aufschlagTyp,
      lieferart,
      lieferart === 'eigenlieferung' ? stammdaten : undefined,
      START_PLZ,
      herstellkostenJeTonne // Abwerkspreis aus Variable-Kosten-Rechner
    ).then(result => {
      setErgebnis(result);
      setIsLoading(false);
    }).catch(error => {
      console.error('Fehler bei Berechnung:', error);
      setIsLoading(false);
    });
  }, [warenart, paletten, gewicht, zielPLZ, aufschlagTyp, lieferart, stammdaten, herstellkostenJeTonne]);

  const zone = zielPLZ.length >= 2 ? getZoneFromPLZ(zielPLZ) : null;

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
            <div className="grid grid-cols-2 gap-4">
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
                onChange={(e) => {
                  const p = parseInt(e.target.value);
                  setPaletten(p);
                  setGewicht(p * 1000);
                }}
                className="w-full p-3 border-2 border-orange-200 rounded-lg text-lg focus:border-orange-400 focus:outline-none"
              >
                <option value={1}>1 Palette</option>
                <option value={2}>2 Paletten</option>
                <option value={3}>3 Paletten</option>
                <option value={4}>4 Paletten</option>
                <option value={5}>5 Paletten</option>
              </select>
              <p className="text-sm text-gray-600 mt-2">
                Gewicht: {gewicht} kg = {(gewicht / 1000).toFixed(2)} Tonnen
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
                onChange={(e) => setZielPLZ(e.target.value.replace(/\D/g, '').slice(0, 5))}
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
                onChange={(e) => setAufschlagTyp(e.target.value as AufschlagTyp)}
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
                        onClick={() => {
                          setDieselPreisManuell(!dieselPreisManuell);
                          if (!dieselPreisManuell && zielPLZ) {
                            holeDieselPreis(zielPLZ).then(preis => {
                              setStammdaten(prev => ({ ...prev, dieselLiterKostenBrutto: preis }));
                            });
                          }
                        }}
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
                    Abladungszeit (Minuten)
                  </label>
                  <NumberInput
                    value={stammdaten.abladungszeit}
                    onChange={(value) => setStammdaten(prev => ({ ...prev, abladungszeit: value }))}
                    className="w-full p-2 border-2 border-green-200 rounded-lg focus:border-green-400 focus:outline-none"
                    step={1}
                    min={0}
                  />
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
                        Abladung: {ergebnis.eigenlieferung.route.abladungszeit}min | 
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
                      {lieferart === 'spedition' ? `Zone ${zone}` : 'Eigenlieferung'}
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
    </div>
  );
};

export default SpeditionskostenRechner;

