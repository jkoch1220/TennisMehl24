import { useState } from 'react';
import { Plus, X, Euro, Calendar } from 'lucide-react';
import { OffeneRechnung, Zahlung } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';
import { berechneNaechsteRate } from '../../utils/ratenzahlungCalculations';
import { ID } from 'appwrite';

interface ZahlungsSchnelleingabeProps {
  rechnung: OffeneRechnung;
  onUpdate: () => void;
}

const ZahlungsSchnelleingabe = ({ rechnung, onUpdate }: ZahlungsSchnelleingabeProps) => {
  const [showFormular, setShowFormular] = useState(false);
  const [betrag, setBetrag] = useState('');
  const [notiz, setNotiz] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heute = new Date().toISOString().split('T')[0];

  const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
  const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
  const heuteBezahlt = rechnung.zahlungen?.filter(
    (z) => z.datum && z.datum.split('T')[0] === heute
  ).reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const betragNum = parseFloat(betrag);
      if (isNaN(betragNum) || betragNum <= 0) {
        throw new Error('Bitte geben Sie einen gültigen Betrag größer als 0 ein');
      }

      if (betragNum > offenerBetrag) {
        throw new Error(`Der Betrag darf nicht höher sein als der offene Betrag (${formatCurrency(offenerBetrag)})`);
      }

      const neueZahlung: Zahlung = {
        id: ID.unique(),
        betrag: betragNum,
        datum: new Date().toISOString(),
        notiz: notiz.trim() || undefined,
        erstelltAm: new Date().toISOString(),
      };

      const aktuelleZahlungen = rechnung.zahlungen || [];
      const aktualisierteZahlungen = [...aktuelleZahlungen, neueZahlung];

      // Prüfe ob vollständig bezahlt
      const neuerGesamtbetrag = gesamtBezahlt + betragNum;
      const updateData: Partial<OffeneRechnung> = {
        zahlungen: aktualisierteZahlungen,
      };

      if (neuerGesamtbetrag >= rechnung.summe) {
        updateData.status = 'bezahlt';
        updateData.bezahltAm = new Date().toISOString();
        updateData.bezahlbetrag = neuerGesamtbetrag;
      }

      // Wenn Ratenzahlung aktiv, berechne nächste Rate neu
      if (rechnung.status === 'in_ratenzahlung' && rechnung.faelligErsteMonatsrateAm && rechnung.ratenzahlungInterval) {
        const tempRechnung: OffeneRechnung = {
          ...rechnung,
          zahlungen: aktualisierteZahlungen,
        };
        const naechsteRate = berechneNaechsteRate(tempRechnung);
        updateData.naechsteRateFaelligAm = naechsteRate;
      }

      await kreditorService.updateRechnung(rechnung.id, updateData);

      setBetrag('');
      setNotiz('');
      setShowFormular(false);
      
      // Aktualisiere die Daten
      await onUpdate();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern der Zahlung');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 border-2 border-gray-200">
      {/* Kopf mit Stand heute */}
      <div className="mb-4 pb-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Euro className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold text-gray-900">Zahlungsstand</h4>
          </div>
          {heuteBezahlt > 0 && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              Heute: {formatCurrency(heuteBezahlt)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4 mt-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">Rechnungssumme</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(rechnung.summe)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Bereits bezahlt</div>
            <div className="text-lg font-bold text-green-600">{formatCurrency(gesamtBezahlt)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Noch offen</div>
            <div className={`text-lg font-bold ${offenerBetrag > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(offenerBetrag)}
            </div>
          </div>
        </div>
      </div>

      {/* Schnelleingabe */}
      {!showFormular ? (
        <button
          onClick={() => setShowFormular(true)}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Zahlung hinzufügen
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Betrag (€) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={offenerBetrag}
                value={betrag}
                onChange={(e) => setBetrag(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder={formatCurrency(offenerBetrag)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notiz (optional)
              </label>
              <input
                type="text"
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="z.B. Rate Januar"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Speichere...' : 'Zahlung speichern'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowFormular(false);
                setBetrag('');
                setNotiz('');
                setError(null);
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </form>
      )}

      {/* Zahlungshistorie */}
      {rechnung.zahlungen && rechnung.zahlungen.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-xs font-medium text-gray-700 mb-2">Zahlungshistorie</div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {rechnung.zahlungen
              .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
              .map((zahlung) => {
                const istHeute = zahlung.datum.split('T')[0] === heute;
                return (
                  <div
                    key={zahlung.id}
                    className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                      istHeute ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className={`w-4 h-4 ${istHeute ? 'text-green-600' : 'text-gray-400'}`} />
                      <span className={istHeute ? 'font-medium text-green-900' : 'text-gray-700'}>
                        {new Date(zahlung.datum).toLocaleDateString('de-DE')}
                        {istHeute && ' (heute)'}
                      </span>
                      {zahlung.notiz && (
                        <span className="text-xs text-gray-500">- {zahlung.notiz}</span>
                      )}
                    </div>
                    <span className={`font-semibold ${istHeute ? 'text-green-700' : 'text-gray-900'}`}>
                      {formatCurrency(zahlung.betrag)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ZahlungsSchnelleingabe;
