/**
 * Versand-Dialog
 * Dialog für Tracking-Nummer und Kundenbenachrichtigung
 */

import { useState } from 'react';
import { X, Truck, Mail, Loader2 } from 'lucide-react';
import { ShopBestellung, parseAdresse } from '../../services/shopBestellungService';

interface VersandDialogProps {
  bestellung: ShopBestellung;
  onConfirm: (trackingNummer: string, benachrichtigen: boolean) => Promise<void>;
  onCancel: () => void;
}

const VersandDialog = ({ bestellung, onConfirm, onCancel }: VersandDialogProps) => {
  const [trackingNummer, setTrackingNummer] = useState('');
  const [benachrichtigen, setBenachrichtigen] = useState(true);
  const [loading, setLoading] = useState(false);

  const lieferadresse = parseAdresse(bestellung.lieferadresse);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onConfirm(trackingNummer, benachrichtigen);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onCancel} />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl z-50">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Bestellung versenden
              </h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Bestellinfo */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Bestellung <span className="font-mono font-medium text-gray-900 dark:text-white">#{bestellung.bestellnummer}</span>
              </p>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {lieferadresse.firma || lieferadresse.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {lieferadresse.plz} {lieferadresse.ort}
              </p>
            </div>

            {/* Tracking-Nummer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tracking-Nummer (optional)
              </label>
              <input
                type="text"
                value={trackingNummer}
                onChange={(e) => setTrackingNummer(e.target.value)}
                placeholder="z.B. DHL 123456789"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Benachrichtigung Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={benachrichtigen}
                onChange={(e) => setBenachrichtigen(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-purple-500 border-gray-300 dark:border-gray-600 rounded focus:ring-purple-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  Kunde per E-Mail benachrichtigen
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Sendet eine Versandbenachrichtigung mit Tracking-Nummer an den Kunden
                </p>
              </div>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Truck className="w-4 h-4" />
              )}
              Als versendet markieren
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default VersandDialog;
