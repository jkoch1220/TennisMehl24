import { useState, useEffect } from 'react';
import { X, AlertTriangle, Wrench, RefreshCw, CheckCircle2, Trash2 } from 'lucide-react';
import { OffeneRechnung } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';
import { aktivitaetService } from '../../services/aktivitaetService';

interface DatenReparaturProps {
  onClose: () => void;
  onUpdate: () => void;
}

interface RechnungMitAuswahl {
  rechnung: OffeneRechnung;
  ausgewaehlt: boolean;
  gesamtBezahlt: number;
}

const DatenReparatur = ({ onClose, onUpdate }: DatenReparaturProps) => {
  const [rechnungen, setRechnungen] = useState<RechnungMitAuswahl[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erfolg, setErfolg] = useState(false);
  const [gespeicherteAnzahl, setGespeicherteAnzahl] = useState(0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Lade alle Rechnungen die heute geändert wurden und status=offen haben aber noch Zahlungen
  useEffect(() => {
    loadProblematischeRechnungen();
  }, []);

  const loadProblematischeRechnungen = async () => {
    setLoading(true);
    try {
      const alle = await kreditorService.loadAlleRechnungen();

      // Filtere ALLE Rechnungen die:
      // 1. Status = offen (nicht bezahlt/storniert)
      // 2. Noch Zahlungen haben
      // 3. Zeigen 0€ oder weniger offen (Problem!)
      const problematische = alle.filter(r => {
        const istOffen = r.status === 'offen' || r.status === 'faellig' || r.status === 'gemahnt' || r.status === 'in_bearbeitung' || r.status === 'verzug';
        const hatZahlungen = r.zahlungen && r.zahlungen.length > 0;
        const gesamtBezahlt = r.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0;
        const zeigtNullOderWeniger = r.summe - gesamtBezahlt <= 0;

        return istOffen && hatZahlungen && zeigtNullOderWeniger;
      });

      // Sortiere nach Änderungsdatum (neueste zuerst)
      problematische.sort((a, b) =>
        new Date(b.geaendertAm).getTime() - new Date(a.geaendertAm).getTime()
      );

      setRechnungen(problematische.map(r => ({
        rechnung: r,
        ausgewaehlt: true, // Standardmäßig alle ausgewählt
        gesamtBezahlt: r.zahlungen?.reduce((sum, z) => sum + (z.betrag || 0), 0) || 0,
      })));
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAuswahl = (index: number) => {
    setRechnungen(prev => prev.map((item, i) =>
      i === index ? { ...item, ausgewaehlt: !item.ausgewaehlt } : item
    ));
  };

  const alleAuswaehlen = () => {
    setRechnungen(prev => prev.map(item => ({ ...item, ausgewaehlt: true })));
  };

  const keineAuswaehlen = () => {
    setRechnungen(prev => prev.map(item => ({ ...item, ausgewaehlt: false })));
  };

  const handleReparieren = async () => {
    const zuReparieren = rechnungen.filter(r => r.ausgewaehlt);
    if (zuReparieren.length === 0) return;

    setSaving(true);
    try {
      let erfolgreich = 0;

      for (const item of zuReparieren) {
        // Zahlungen löschen - dann ist die volle summe wieder offen
        await kreditorService.updateRechnung(item.rechnung.id, {
          zahlungen: [],
        });

        await aktivitaetService.addKommentar(
          item.rechnung.id,
          `🔧 DATEN-REPARATUR: Zahlungen wurden entfernt. Offener Betrag ist jetzt wieder ${formatCurrency(item.rechnung.summe)}.`
        );

        erfolgreich++;
      }

      setGespeicherteAnzahl(erfolgreich);
      setErfolg(true);
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Reparieren:', error);
      alert('Fehler beim Reparieren. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const ausgewaehlteAnzahl = rechnungen.filter(r => r.ausgewaehlt).length;
  const ausgewaehlteSumme = rechnungen
    .filter(r => r.ausgewaehlt)
    .reduce((sum, r) => sum + r.rechnung.summe, 0);

  if (erfolg) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-8 text-white text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-bold">Reparatur erfolgreich!</h2>
          </div>
          <div className="p-6 text-center">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 mb-6">
              <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-2">
                {gespeicherteAnzahl}
              </div>
              <div className="text-green-700 dark:text-green-300">
                Rechnung(en) wurden repariert
              </div>
            </div>
            <p className="text-gray-600 dark:text-slate-400 text-sm mb-6">
              Die Zahlungen wurden entfernt. Die vollen Beträge sind jetzt wieder als offen markiert.
            </p>
            <button
              onClick={onClose}
              className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold text-lg hover:from-green-600 hover:to-emerald-600 transition-all"
            >
              Fertig
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Wrench className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Daten-Reparatur</h2>
                <p className="text-white/80 text-sm">
                  Zahlungen entfernen, damit Beträge wieder offen sind
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="px-6 pt-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                  Problem erkannt
                </h4>
                <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">
                  Diese Rechnungen zeigen 0,00 € offen, obwohl sie noch offen sein sollten.
                  Die Zahlungen werden entfernt, sodass der volle Betrag (Spalte "Summe") wieder offen ist.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Auswahl-Buttons */}
        {rechnungen.length > 0 && (
          <div className="px-6 pt-4 flex gap-2">
            <button
              onClick={alleAuswaehlen}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            >
              Alle auswählen
            </button>
            <button
              onClick={keineAuswaehlen}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            >
              Keine auswählen
            </button>
          </div>
        )}

        {/* Liste */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-600 border-t-transparent" />
              <span className="ml-3 text-gray-600 dark:text-slate-400">Suche problematische Rechnungen...</span>
            </div>
          ) : rechnungen.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-slate-400 font-semibold">
                Keine problematischen Rechnungen gefunden!
              </p>
              <p className="text-gray-400 dark:text-slate-500 text-sm mt-2">
                Alle offenen Rechnungen haben korrekte Beträge.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rechnungen.map((item, index) => (
                <div
                  key={item.rechnung.id}
                  onClick={() => toggleAuswahl(index)}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                    item.ausgewaehlt
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Checkbox */}
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      item.ausgewaehlt
                        ? 'bg-orange-500 border-orange-500'
                        : 'border-gray-300 dark:border-slate-600'
                    }`}>
                      {item.ausgewaehlt && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-slate-100">
                        {item.rechnung.kreditorName}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-slate-400">
                        {item.rechnung.rechnungsnummer || item.rechnung.betreff || 'Keine Rechnungsnummer'}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                        Geändert: {formatDateTime(item.rechnung.geaendertAm)}
                      </div>
                    </div>

                    {/* Aktuell (Problem) */}
                    <div className="text-center bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2">
                      <div className="text-xs text-red-600 dark:text-red-400 mb-1">Zeigt aktuell</div>
                      <div className="font-bold text-red-700 dark:text-red-300">0,00 €</div>
                      <div className="text-xs text-red-500">
                        (Zahlungen: {formatCurrency(item.gesamtBezahlt)})
                      </div>
                    </div>

                    {/* Pfeil */}
                    <div className="text-2xl text-gray-400">→</div>

                    {/* Nach Reparatur */}
                    <div className="text-center bg-green-100 dark:bg-green-900/30 rounded-lg px-3 py-2">
                      <div className="text-xs text-green-600 dark:text-green-400 mb-1">Nach Reparatur</div>
                      <div className="font-bold text-green-700 dark:text-green-300">
                        {formatCurrency(item.rechnung.summe)}
                      </div>
                      <div className="text-xs text-green-500">
                        (Zahlungen entfernt)
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-slate-700 p-6 bg-gray-50 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-slate-400">
                {ausgewaehlteAnzahl} von {rechnungen.length} ausgewählt
              </div>
              {ausgewaehlteAnzahl > 0 && (
                <div className="text-lg font-bold text-gray-900 dark:text-slate-100">
                  Gesamt: {formatCurrency(ausgewaehlteSumme)}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={loadProblematischeRechnungen}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Aktualisieren
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleReparieren}
                disabled={ausgewaehlteAnzahl === 0 || saving}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Repariere...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Zahlungen entfernen ({ausgewaehlteAnzahl})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatenReparatur;
