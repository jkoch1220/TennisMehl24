import { useState } from 'react';
import { Calculator, Truck, Package, TrendingUp } from 'lucide-react';
import { Warenart, AufschlagTyp } from '../types';
import { berechneZiegelmehl } from '../utils/calculations';
import {
  HERSTELLUNGSKOSTEN,
  SACKWARE_KOSTEN,
  getZoneFromPLZ,
} from '../constants/pricing';

const ZiegelmehlRechner = () => {
  const [warenart, setWarenart] = useState<Warenart>('sackware');
  const [paletten, setPaletten] = useState<number>(1);
  const [gewicht, setGewicht] = useState<number>(1000);
  const [plz, setPlz] = useState<string>('');
  const [aufschlagTyp, setAufschlagTyp] = useState<AufschlagTyp>('endkunde');

  const ergebnis = berechneZiegelmehl(
    warenart,
    paletten,
    gewicht,
    plz,
    aufschlagTyp
  );
  const zone = plz.length >= 2 ? getZoneFromPLZ(plz) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-8">
            <Calculator className="w-10 h-10 text-red-600" />
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              Ziegelmehl Preisrechner
            </h1>
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
                Gewicht: {gewicht} kg = {ergebnis.tonnen.toFixed(2)} Tonnen
              </p>
            </div>

            {/* PLZ */}
            <div className="bg-blue-50 p-6 rounded-xl">
              <label className="flex items-center gap-2 text-lg font-semibold text-gray-700 mb-3">
                <Truck className="w-5 h-5 text-blue-600" />
                Postleitzahl
              </label>
              <input
                type="text"
                value={plz}
                onChange={(e) => setPlz(e.target.value)}
                placeholder="z.B. 10115"
                maxLength={5}
                className="w-full p-3 border-2 border-blue-200 rounded-lg text-lg focus:border-blue-400 focus:outline-none"
              />
              {zone && (
                <p className="text-sm text-gray-600 mt-2">Zone: {zone}</p>
              )}
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

          {/* Ergebnisse */}
          {zone && (
            <div className="space-y-6">
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
                      inkl. {warenart === 'sackware' ? 'Verpackung' : 'Kosten'}
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-xs text-gray-600 mb-1">
                      Transportkosten
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {ergebnis.transportkosten.toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-500">Zone {zone}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-xs text-gray-600 mb-1">Verkaufspreis</p>
                    <p className="text-2xl font-bold text-green-600">
                      {ergebnis.verkaufspreis.toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-500">
                      + {ergebnis.aufschlag.toFixed(2)} € W+G
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

              {/* Detailaufschlüsselung */}
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  Kostenaufschlüsselung
                </h3>

                {warenart === 'sackware' ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-2">
                        Sackware - Herstellung pro Palette:
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>
                          • Ziegelmehl: {SACKWARE_KOSTEN.ziegelmehl.toFixed(2)}{' '}
                          €
                        </li>
                        <li>
                          • Aufschlag ZM (20%):{' '}
                          {SACKWARE_KOSTEN.aufschlag_zm.toFixed(2)} €
                        </li>
                        <li>
                          • Absacken: {SACKWARE_KOSTEN.absacken.toFixed(2)} €
                        </li>
                        <li>
                          • Säcke: {SACKWARE_KOSTEN.sacke.toFixed(2)} €
                        </li>
                        <li>
                          • Schrumpfsack:{' '}
                          {SACKWARE_KOSTEN.schrumpfsack.toFixed(2)} €
                        </li>
                        <li className="font-semibold pt-1 border-t">
                          = Werkspreis:{' '}
                          {SACKWARE_KOSTEN.werkspreis_ohne_palette.toFixed(2)} €
                        </li>
                        <li>
                          • 10% Aufschlag:{' '}
                          {SACKWARE_KOSTEN.aufschlag_10_prozent.toFixed(2)} €
                        </li>
                        <li className="font-semibold">
                          = CVK ab Werk:{' '}
                          {SACKWARE_KOSTEN.cvk_ab_werk.toFixed(2)} €
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-2">
                        Gesamtkalkulation:
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Paletten: {paletten}</li>
                        <li>• Gewicht: {gewicht} kg</li>
                        <li>• Warenart: Sackware</li>
                        <li>
                          • Kundentyp:{' '}
                          {aufschlagTyp === 'endkunde' ? 'Endkunde' : 'Großkunde'}
                        </li>
                        <li>• Lieferzone: {zone}</li>
                        <li>• PLZ: {plz}</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-2">
                        Schüttware - Herstellung pro Tonne:
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>
                          • Fixkosten:{' '}
                          {HERSTELLUNGSKOSTEN.fixkosten_pro_tonne.toFixed(2)} €
                        </li>
                        <li>
                          • Veränderliche Kosten:{' '}
                          {HERSTELLUNGSKOSTEN.veraenderliche_kosten_pro_tonne.toFixed(
                            2
                          )}{' '}
                          €
                        </li>
                        <li className="font-semibold pt-1 border-t">
                          = Herstellkosten:{' '}
                          {HERSTELLUNGSKOSTEN.gesamt_pro_tonne.toFixed(2)} €/t
                        </li>
                        <li className="pt-2">• Menge: {ergebnis.tonnen.toFixed(2)} Tonnen</li>
                        <li className="font-semibold">
                          = Gesamt:{' '}
                          {ergebnis.herstellungskostenGesamt.toFixed(2)} €
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-2">
                        Gesamtkalkulation:
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Paletten: {paletten}</li>
                        <li>• Gewicht: {gewicht} kg</li>
                        <li>• Warenart: Schüttware</li>
                        <li>
                          • Kundentyp:{' '}
                          {aufschlagTyp === 'endkunde' ? 'Endkunde' : 'Großkunde'}
                        </li>
                        <li>• Lieferzone: {zone}</li>
                        <li>• PLZ: {plz}</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!zone && plz && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 text-center">
              <p className="text-gray-700">
                PLZ nicht gefunden. Bitte geben Sie eine gültige deutsche PLZ
                ein.
              </p>
            </div>
          )}

          {!plz && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 text-center">
              <p className="text-gray-700">
                Bitte geben Sie eine PLZ ein, um die Lieferkosten zu berechnen.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Alle Preise in Euro inkl. MwSt. • Herstellungskosten basierend auf
            Kalkulation 2025
          </p>
        </div>
      </div>
    </div>
  );
};

export default ZiegelmehlRechner;

