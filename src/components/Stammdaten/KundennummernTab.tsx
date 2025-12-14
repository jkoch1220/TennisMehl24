import { useState, useEffect } from 'react';
import { Hash, Play, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { saisonplanungService } from '../../services/saisonplanungService';
import { kundennummerService } from '../../services/kundennummerService';
import type { SaisonKunde } from '../../types/saisonplanung';

const KundennummernTab = () => {
  const [loading, setLoading] = useState(false);
  const [kunden, setKunden] = useState<SaisonKunde[]>([]);
  const [naechsteNummer, setNaechsteNummer] = useState(231);
  const [fortschritt, setFortschritt] = useState({ aktuell: 0, gesamt: 0 });
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [fehler, setFehler] = useState<string>('');

  useEffect(() => {
    loadKunden();
  }, []);

  const loadKunden = async () => {
    setLoading(true);
    try {
      const alleKunden = await saisonplanungService.loadAlleKunden();
      setKunden(alleKunden);

      // Verwende den zentralen Service zum Ermitteln der nächsten Nummer
      const hoechsteNummer = await kundennummerService.getHoechsteKundennummer();
      setNaechsteNummer(hoechsteNummer + 1);
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error);
      setFehler('Fehler beim Laden der Kundendaten');
    } finally {
      setLoading(false);
    }
  };

  const generiereKundennummern = async () => {
    setStatus('running');
    setFehler('');
    
    const kundenOhneNummer = kunden.filter(k => !k.kundennummer);
    setFortschritt({ aktuell: 0, gesamt: kundenOhneNummer.length });

    let erfolge = 0;

    try {
      // Generiere alle benötigten Kundennummern auf einmal
      const nummern = await kundennummerService.generiereKundennummern(kundenOhneNummer.length);
      
      for (let i = 0; i < kundenOhneNummer.length; i++) {
        const kunde = kundenOhneNummer[i];
        
        try {
          await saisonplanungService.updateKunde(kunde.id, {
            kundennummer: nummern[i],
          });
          
          erfolge++;
          setFortschritt({ aktuell: i + 1, gesamt: kundenOhneNummer.length });
        } catch (error) {
          console.error(`Fehler bei Kunde ${kunde.name}:`, error);
        }
      }

      if (erfolge === kundenOhneNummer.length) {
        setStatus('completed');
      } else {
        setStatus('error');
        setFehler(`${erfolge} von ${kundenOhneNummer.length} Kunden erfolgreich aktualisiert`);
      }

      // Lade Kunden neu
      await loadKunden();
    } catch (error) {
      console.error('Fehler bei der Generierung:', error);
      setStatus('error');
      setFehler('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
    }
  };

  const kundenOhneNummer = kunden.filter(k => !k.kundennummer);
  const kundenMitNummer = kunden.filter(k => k.kundennummer);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg">
            <Hash className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Kundennummern Generierung</h2>
            <p className="text-gray-600">Automatische Vergabe von Kundennummern für die Kundenliste</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600">Kunden gesamt</p>
            <p className="text-3xl font-bold text-gray-900">{kunden.length}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600">Mit Kundennummer</p>
            <p className="text-3xl font-bold text-green-600">{kundenMitNummer.length}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600">Ohne Kundennummer</p>
            <p className="text-3xl font-bold text-orange-600">{kundenOhneNummer.length}</p>
          </div>
        </div>
      </div>

      {/* Aktion */}
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Kundennummern generieren</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Startnummer für neue Kunden
            </label>
            <input
              type="number"
              value={naechsteNummer}
              onChange={(e) => setNaechsteNummer(parseInt(e.target.value) || 231)}
              disabled={status === 'running'}
              className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Die erste Kundennummer beginnt bei 231. Die Nummern werden fortlaufend vergeben.
            </p>
          </div>

          {kundenOhneNummer.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>{kundenOhneNummer.length}</strong> Kunden haben noch keine Kundennummer.
                {' '}Die Nummern werden von <strong>{naechsteNummer}</strong> bis{' '}
                <strong>{naechsteNummer + kundenOhneNummer.length - 1}</strong> vergeben.
              </p>
            </div>
          )}

          {status === 'running' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">Generierung läuft...</p>
                  <p className="text-sm text-blue-700">
                    {fortschritt.aktuell} von {fortschritt.gesamt} Kunden bearbeitet
                  </p>
                  <div className="mt-2 bg-blue-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-300"
                      style={{
                        width: `${(fortschritt.aktuell / fortschritt.gesamt) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {status === 'completed' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm text-green-900">
                  Kundennummern erfolgreich generiert! Alle Kunden haben jetzt eine Kundennummer.
                </p>
              </div>
            </div>
          )}

          {status === 'error' && fehler && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm text-red-900">{fehler}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={generiereKundennummern}
              disabled={status === 'running' || kundenOhneNummer.length === 0 || loading}
              className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                status === 'running' || kundenOhneNummer.length === 0 || loading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
              }`}
            >
              <Play className="w-5 h-5" />
              {status === 'running' ? 'Läuft...' : 'Kundennummern generieren'}
            </button>

            <button
              onClick={loadKunden}
              disabled={status === 'running' || loading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>
        </div>
      </div>

      {/* Kundenliste */}
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 p-4 bg-gray-50">
          <h3 className="text-lg font-bold text-gray-900">Kundenübersicht</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Kundennummer
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Typ
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Ort
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Lade Kunden...
                  </td>
                </tr>
              ) : kunden.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Keine Kunden gefunden
                  </td>
                </tr>
              ) : (
                kunden
                  .sort((a, b) => {
                    // Sortiere nach Kundennummer (numerisch)
                    const numA = parseInt(a.kundennummer || '999999');
                    const numB = parseInt(b.kundennummer || '999999');
                    return numA - numB;
                  })
                  .map((kunde) => (
                    <tr key={kunde.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {kunde.kundennummer ? (
                          <span className="font-mono font-semibold text-gray-900">
                            {kunde.kundennummer}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{kunde.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            kunde.typ === 'verein'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {kunde.typ === 'verein' ? 'Verein' : 'Platzbauer'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {kunde.adresse.plz} {kunde.adresse.ort}
                      </td>
                      <td className="px-4 py-3">
                        {kunde.kundennummer ? (
                          <span className="flex items-center gap-1 text-green-600 text-sm">
                            <CheckCircle2 className="w-4 h-4" />
                            Vergeben
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-orange-600 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            Ausstehend
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info-Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-3">Über Kundennummern</h4>
        <div className="space-y-2 text-sm text-gray-700">
          <p>
            <strong>Automatische Vergabe:</strong> Kundennummern werden automatisch und fortlaufend
            vergeben, beginnend mit der Nummer 231.
          </p>
          <p>
            <strong>Verwendung:</strong> Die Kundennummern werden in der Kundenliste und
            in allen Dokumenten zur eindeutigen Identifikation verwendet.
          </p>
          <p>
            <strong>Eindeutigkeit:</strong> Jeder Kunde erhält eine einzigartige Nummer,
            die nicht geändert wird.
          </p>
          <p className="text-blue-700 font-medium mt-4">
            💡 Tipp: Führen Sie die Generierung nur einmal durch. Bereits vergebene Kundennummern
            werden nicht überschrieben.
          </p>
        </div>
      </div>
    </div>
  );
};

export default KundennummernTab;

