import { useState } from 'react';
import { CreditCard, CheckCircle, Calendar, Euro, TrendingDown, AlertTriangle } from 'lucide-react';
import { OffeneRechnung } from '../../types/kreditor';
import { kreditorService } from '../../services/kreditorService';
import { aktivitaetService } from '../../services/aktivitaetService';
import { berechneNaechsteRate, istRateUeberfaellig } from '../../utils/ratenzahlungCalculations';
import { ID } from 'appwrite';

interface RatenzahlungsVereinbarungProps {
  rechnungen: OffeneRechnung[];
  onUpdate: () => void;
}

const RatenzahlungsVereinbarung = ({ rechnungen, onUpdate }: RatenzahlungsVereinbarungProps) => {
  const [processing, setProcessing] = useState<string | null>(null);

  // Filtere nur Rechnungen mit aktiver Ratenzahlung
  const ratenzahlungsRechnungen = rechnungen.filter(
    r => r.status === 'in_ratenzahlung' && r.monatlicheRate && r.monatlicheRate > 0
  );

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

  const handleRateBezahlt = async (rechnung: OffeneRechnung) => {
    if (!rechnung.monatlicheRate) return;

    if (!confirm(`Möchten Sie die Rate von ${formatCurrency(rechnung.monatlicheRate)} als bezahlt markieren?`)) {
      return;
    }

    setProcessing(rechnung.id);
    
    try {
      // Erstelle neue Zahlung für die Rate
      const neueZahlung = {
        id: ID.unique(),
        betrag: rechnung.monatlicheRate,
        datum: new Date().toISOString(),
        notiz: `Rate ${rechnung.ratenzahlungInterval || 'monatlich'}`,
        erstelltAm: new Date().toISOString(),
      };

      const aktuelleZahlungen = rechnung.zahlungen || [];
      const aktualisierteZahlungen = [...aktuelleZahlungen, neueZahlung];

      // Berechne neuen Gesamtbetrag
      const gesamtBezahlt = aktualisierteZahlungen.reduce((sum, z) => sum + z.betrag, 0);
      const restbetrag = Math.max(0, rechnung.summe - gesamtBezahlt);

      // Erstelle temporäres Rechnungsobjekt für Berechnung der nächsten Rate
      const tempRechnung: OffeneRechnung = {
        ...rechnung,
        zahlungen: aktualisierteZahlungen,
      };

      // Berechne nächste Rate
      const naechsteRate = berechneNaechsteRate(tempRechnung);

      const updateData: Partial<OffeneRechnung> = {
        zahlungen: aktualisierteZahlungen,
        rateFaelligAm: naechsteRate,
      };

      // Wenn vollständig bezahlt, Status ändern
      if (restbetrag === 0) {
        updateData.status = 'bezahlt';
        updateData.bezahltAm = new Date().toISOString();
        updateData.bezahlbetrag = gesamtBezahlt;
      }

      await kreditorService.updateRechnung(rechnung.id, updateData);

      // Aktivität loggen
      await aktivitaetService.logZahlung(
        rechnung.id, 
        rechnung.monatlicheRate, 
        `Rate ${rechnung.ratenzahlungInterval || 'monatlich'} bezahlt${naechsteRate ? `. Nächste Rate: ${formatDate(naechsteRate)}` : ''}`
      );

      onUpdate();
    } catch (error) {
      console.error('Fehler beim Verarbeiten der Rate:', error);
      alert('Fehler beim Verarbeiten der Rate');
    } finally {
      setProcessing(null);
    }
  };

  if (ratenzahlungsRechnungen.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="w-6 h-6 text-indigo-600" />
          <h3 className="text-xl font-bold text-gray-900">Ratenzahlungsvereinbarungen</h3>
        </div>
        <div className="text-center py-8 text-gray-500">
          <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p>Keine aktiven Ratenzahlungsvereinbarungen</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="w-6 h-6 text-indigo-600" />
        <h3 className="text-xl font-bold text-gray-900">Ratenzahlungsvereinbarungen</h3>
        <span className="ml-auto px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
          {ratenzahlungsRechnungen.length} aktive {ratenzahlungsRechnungen.length === 1 ? 'Vereinbarung' : 'Vereinbarungen'}
        </span>
      </div>

      <div className="space-y-3">
        {ratenzahlungsRechnungen.map((rechnung) => {
          const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + z.betrag, 0) || 0;
          const restbetrag = Math.max(0, rechnung.summe - gesamtBezahlt);
          const prozentBezahlt = rechnung.summe > 0 ? (gesamtBezahlt / rechnung.summe) * 100 : 0;
          const istUeberfaellig = istRateUeberfaellig(rechnung);

          return (
            <div
              key={rechnung.id}
              className={`border-2 rounded-lg p-4 transition-all ${
                istUeberfaellig 
                  ? 'border-red-500 bg-red-50 shadow-lg shadow-red-200 animate-pulse' 
                  : 'border-indigo-200 hover:border-indigo-400'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                {/* Kreditor */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900 truncate">{rechnung.kreditorName}</h4>
                    {istUeberfaellig && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white rounded-full text-xs font-bold animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                        ÜBERFÄLLIG
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {rechnung.betreff || rechnung.rechnungsnummer || 'Keine Beschreibung'}
                  </p>
                </div>

                {/* Ratenhöhe */}
                <div className="text-center px-4 border-l border-gray-200">
                  <div className="flex items-center gap-1 text-indigo-600 mb-1">
                    <Euro className="w-4 h-4" />
                    <span className="text-xs font-medium">Ratenhöhe</span>
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(rechnung.monatlicheRate || 0)}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">
                    {rechnung.ratenzahlungInterval || 'monatlich'}
                  </div>
                </div>

                {/* Ratenfälligkeit */}
                <div className="text-center px-4 border-l border-gray-200">
                  <div className={`flex items-center gap-1 mb-1 ${istUeberfaellig ? 'text-red-600' : 'text-orange-600'}`}>
                    {istUeberfaellig ? <AlertTriangle className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                    <span className="text-xs font-medium">Rate fällig</span>
                  </div>
                  <div className={`text-sm font-semibold ${istUeberfaellig ? 'text-red-700' : 'text-gray-900'}`}>
                    {rechnung.rateFaelligAm 
                      ? formatDate(rechnung.rateFaelligAm)
                      : '—'}
                  </div>
                  {istUeberfaellig && (
                    <div className="text-xs text-red-600 font-bold mt-1">
                      ÜBERFÄLLIG!
                    </div>
                  )}
                </div>

                {/* Restbetrag */}
                <div className="text-center px-4 border-l border-gray-200">
                  <div className="flex items-center gap-1 text-red-600 mb-1">
                    <TrendingDown className="w-4 h-4" />
                    <span className="text-xs font-medium">Restbetrag</span>
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(restbetrag)}
                  </div>
                  <div className="text-xs text-gray-500">
                    von {formatCurrency(rechnung.summe)}
                  </div>
                  {/* Fortschrittsbalken */}
                  <div className="w-24 bg-gray-200 rounded-full h-1.5 mt-1">
                    <div
                      className="bg-green-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(prozentBezahlt, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {/* Button */}
                <div className="pl-4 border-l border-gray-200">
                  <button
                    onClick={() => handleRateBezahlt(rechnung)}
                    disabled={processing === rechnung.id}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  >
                    {processing === rechnung.id ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Verarbeite...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Rate bezahlt
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RatenzahlungsVereinbarung;
