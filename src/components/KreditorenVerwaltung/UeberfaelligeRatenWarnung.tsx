import { X, AlertTriangle, CreditCard, CheckCircle } from 'lucide-react';
import { OffeneRechnung } from '../../types/kreditor';
import { istRateUeberfaellig } from '../../utils/ratenzahlungCalculations';

interface UeberfaelligeRatenWarnungProps {
  rechnungen: OffeneRechnung[];
  onClose: () => void;
  onRateBezahlen: (rechnung: OffeneRechnung) => void;
}

const UeberfaelligeRatenWarnung = ({ rechnungen, onClose, onRateBezahlen }: UeberfaelligeRatenWarnungProps) => {
  // Filtere überfällige Raten
  const ueberfaelligeRaten = rechnungen.filter(r => istRateUeberfaellig(r));

  if (ueberfaelligeRaten.length === 0) {
    return null;
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const gesamtUeberfaelligeBetrag = ueberfaelligeRaten.reduce((sum, r) => sum + (r.monatlicheRate || 0), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white dark:bg-slate-800/20 p-2 rounded-lg animate-pulse">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">⚠️ Überfällige Raten!</h2>
              <p className="text-white/90 text-sm">
                {ueberfaelligeRaten.length} {ueberfaelligeRaten.length === 1 ? 'Rate ist' : 'Raten sind'} überfällig
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white dark:bg-slate-800/10 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Gesamtsumme */}
        <div className="bg-red-50 dark:bg-red-900/30 border-b-2 border-red-200 dark:border-red-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-slate-400 font-medium">Gesamtbetrag überfälliger Raten:</span>
            <span className="text-2xl font-bold text-red-600">{formatCurrency(gesamtUeberfaelligeBetrag)}</span>
          </div>
        </div>

        {/* Content - Liste der überfälligen Raten */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {ueberfaelligeRaten.map((rechnung) => {
              const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + z.betrag, 0) || 0;
              const restbetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
              
              return (
                <div
                  key={rechnung.id}
                  className="border-2 border-red-300 dark:border-red-700 rounded-lg p-4 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 transition-all"
                >
                  <div className="flex items-center justify-between gap-4">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CreditCard className="w-5 h-5 text-red-600 flex-shrink-0" />
                        <h4 className="font-semibold text-gray-900 dark:text-slate-100 truncate">{rechnung.kreditorName}</h4>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-slate-400 truncate ml-7">
                        {rechnung.betreff || rechnung.rechnungsnummer || 'Keine Beschreibung'}
                      </p>
                      <div className="flex items-center gap-4 ml-7 mt-2 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-slate-400">Rate:</span>
                          <span className="font-semibold text-gray-900 dark:text-slate-100 ml-1">
                            {formatCurrency(rechnung.monatlicheRate || 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-slate-400">Fällig:</span>
                          <span className="font-semibold text-red-600 ml-1">
                            {rechnung.rateFaelligAm ? formatDate(rechnung.rateFaelligAm) : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-slate-400">Restbetrag:</span>
                          <span className="font-semibold text-gray-900 dark:text-slate-100 ml-1">
                            {formatCurrency(restbetrag)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Button */}
                    <button
                      onClick={() => {
                        onRateBezahlen(rechnung);
                        onClose();
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Jetzt bezahlen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-slate-700 px-6 py-4 bg-gray-50 dark:bg-slate-800">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Bitte bezahlen Sie die überfälligen Raten so schnell wie möglich.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 dark:text-slate-400 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Später erinnern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UeberfaelligeRatenWarnung;
