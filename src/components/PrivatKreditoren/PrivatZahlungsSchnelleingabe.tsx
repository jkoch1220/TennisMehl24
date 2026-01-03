import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { OffeneRechnung, Zahlung } from '../../types/kreditor';
import { usePrivatKreditor } from '../../contexts/PrivatKreditorContext';
import { ID } from 'appwrite';

interface PrivatZahlungsSchnelleingabeProps {
  rechnung: OffeneRechnung;
  onUpdate: () => void;
}

const PrivatZahlungsSchnelleingabe = ({ rechnung, onUpdate }: PrivatZahlungsSchnelleingabeProps) => {
  const { kreditorService, aktivitaetService } = usePrivatKreditor();

  const [betrag, setBetrag] = useState<number>(rechnung.monatlicheRate || 0);
  const [datum, setDatum] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notiz, setNotiz] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
  const offenerBetrag = Math.max(0, rechnung.summe - gesamtBezahlt);

  const handleZahlung = async () => {
    if (betrag <= 0) {
      alert('Bitte geben Sie einen gültigen Betrag ein');
      return;
    }

    setLoading(true);
    try {
      const neueZahlung: Zahlung = {
        id: ID.unique(),
        betrag,
        datum: new Date(datum).toISOString(),
        notiz: notiz || undefined,
        erstelltAm: new Date().toISOString(),
      };

      const aktuelleZahlungen = rechnung.zahlungen || [];
      const neueZahlungen = [...aktuelleZahlungen, neueZahlung];
      const neuerGesamtBezahlt = neueZahlungen.reduce((sum, z) => sum + (z.betrag || 0), 0);

      let neuerStatus = rechnung.status;
      if (neuerGesamtBezahlt >= rechnung.summe) {
        neuerStatus = 'bezahlt';
      }

      await kreditorService.updateRechnung(rechnung.id, {
        zahlungen: neueZahlungen,
        status: neuerStatus,
      });

      await aktivitaetService.logZahlung(rechnung.id, betrag, notiz || undefined);

      setBetrag(0);
      setNotiz('');
      onUpdate();
    } catch (error) {
      console.error('Fehler bei Zahlung:', error);
      alert('Fehler beim Speichern der Zahlung');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="w-5 h-5 text-purple-600" />
        <h4 className="font-semibold text-gray-900 dark:text-slate-100">Schnelle Zahlung</h4>
        <span className="text-sm text-gray-500 dark:text-slate-400">
          (Offen: {formatCurrency(offenerBetrag)})
        </span>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-400 mb-1">
            Betrag
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={betrag || ''}
              onChange={(e) => setBetrag(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-8"
              placeholder="0,00"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">€</span>
          </div>
        </div>

        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-400 mb-1">
            Datum
          </label>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-400 mb-1">
            Notiz (optional)
          </label>
          <input
            type="text"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="z.B. Überweisung"
          />
        </div>

        <div className="flex gap-2">
          {rechnung.monatlicheRate && rechnung.monatlicheRate > 0 && (
            <button
              type="button"
              onClick={() => setBetrag(rechnung.monatlicheRate!)}
              className="px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
            >
              Rate ({formatCurrency(rechnung.monatlicheRate)})
            </button>
          )}
          <button
            type="button"
            onClick={() => setBetrag(offenerBetrag)}
            className="px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
          >
            Voll ({formatCurrency(offenerBetrag)})
          </button>
          <button
            type="button"
            onClick={handleZahlung}
            disabled={loading || betrag <= 0}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            Zahlen
          </button>
        </div>
      </div>

      {/* Bisherige Zahlungen */}
      {rechnung.zahlungen && rechnung.zahlungen.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
          <h5 className="text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">Bisherige Zahlungen:</h5>
          <div className="flex flex-wrap gap-2">
            {rechnung.zahlungen.map((z, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs"
                title={z.notiz || ''}
              >
                {formatCurrency(z.betrag)} am {new Date(z.datum).toLocaleDateString('de-DE')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivatZahlungsSchnelleingabe;
