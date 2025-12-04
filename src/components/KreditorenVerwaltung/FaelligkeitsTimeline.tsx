import { useMemo } from 'react';
import { Calendar, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { OffeneRechnung } from '../../types/kreditor';
import { getRelevanteFaelligkeit } from '../../utils/ratenzahlungCalculations';

interface FaelligkeitsTimelineProps {
  rechnungen: OffeneRechnung[];
  tageAnzeigen?: number; // Anzahl der Tage die angezeigt werden sollen (Standard: 60)
  onOpenDetail?: (rechnung: OffeneRechnung) => void;
}

const FaelligkeitsTimeline = ({ rechnungen, tageAnzeigen = 60, onOpenDetail }: FaelligkeitsTimelineProps) => {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  // Filtere nur offene, fällige, gemahnte, in Ratenzahlung, im Verzug oder Inkasso befindliche Rechnungen
  const relevanteRechnungen = useMemo(() => {
    return rechnungen.filter(
      (r) => {
        const relevanteFaelligkeit = getRelevanteFaelligkeit(r);
        return (
          ['offen', 'faellig', 'gemahnt', 'in_bearbeitung', 'in_ratenzahlung', 'verzug', 'inkasso'].includes(r.status) &&
          new Date(relevanteFaelligkeit) <= new Date(heute.getTime() + tageAnzeigen * 24 * 60 * 60 * 1000)
        );
      }
    );
  }, [rechnungen, tageAnzeigen]);

  // Gruppiere Rechnungen nach Tagen
  const rechnungenNachTagen = useMemo(() => {
    const gruppiert: Record<number, OffeneRechnung[]> = {};

    relevanteRechnungen.forEach((rechnung) => {
      const relevanteFaelligkeit = getRelevanteFaelligkeit(rechnung);
      const faelligDatum = new Date(relevanteFaelligkeit);
      faelligDatum.setHours(0, 0, 0, 0);
      const tageBisFaellig = Math.floor((faelligDatum.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));

      if (!gruppiert[tageBisFaellig]) {
        gruppiert[tageBisFaellig] = [];
      }
      gruppiert[tageBisFaellig].push(rechnung);
    });

    return gruppiert;
  }, [relevanteRechnungen, heute]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getTageLabel = (tage: number) => {
    // Bei kleinen Unterschieden durch Zeitzonen/Rundung: Heute anzeigen
    if (tage === 0 || tage === -1) {
      return 'Heute';
    } else if (tage < 0) {
      return `${Math.abs(tage)} Tag${Math.abs(tage) === 1 ? '' : 'e'} überfällig`;
    } else if (tage === 1) {
      return 'Morgen';
    } else {
      return `in ${tage} Tagen`;
    }
  };

  // const getTageColor = (tage: number) => {
  //   if (tage < 0) return 'bg-red-500';
  //   if (tage === 0) return 'bg-orange-500';
  //   if (tage <= 7) return 'bg-yellow-500';
  //   if (tage <= 30) return 'bg-blue-500';
  //   return 'bg-green-500';
  // };

  const getStatusIcon = (tage: number) => {
    if (tage < 0) return <AlertCircle className="w-5 h-5 text-red-600" />;
    if (tage === 0) return <Clock className="w-5 h-5 text-orange-600" />;
    return <Calendar className="w-5 h-5 text-blue-600" />;
  };

  const sortierteTage = Object.keys(rechnungenNachTagen)
    .map(Number)
    .sort((a, b) => a - b);

  if (sortierteTage.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <p className="text-gray-600">Keine fälligen Rechnungen in den nächsten {tageAnzeigen} Tagen</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="w-6 h-6 text-red-600" />
        <h3 className="text-xl font-bold text-gray-900">Fälligkeits-Timeline</h3>
        <span className="text-sm text-gray-500">(nächste {tageAnzeigen} Tage)</span>
      </div>

      <div className="space-y-4">
        {sortierteTage.map((tage) => {
          const rechnungenFuerTag = rechnungenNachTagen[tage];
          const gesamtBetrag = rechnungenFuerTag.reduce((sum, r) => {
            const gesamtBezahlt = r.zahlungen?.reduce((s, z) => s + (z.betrag || 0), 0) || 0;
            const offenerBetrag = Math.max(0, r.summe - gesamtBezahlt);
            return sum + offenerBetrag;
          }, 0);
          const istUeberfaellig = tage < 0;
          const istHeute = tage === 0;

          return (
            <div
              key={tage}
              className={`border-l-4 rounded-r-lg p-4 ${
                istUeberfaellig
                  ? 'bg-red-50 border-red-500'
                  : istHeute
                  ? 'bg-orange-50 border-orange-500'
                  : 'bg-blue-50 border-blue-500'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(tage)}
                  <div>
                    <div className="font-semibold text-gray-900">{getTageLabel(tage)}</div>
                    <div className="text-sm text-gray-600">
                      {formatDate(getRelevanteFaelligkeit(rechnungenFuerTag[0]))}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{formatCurrency(gesamtBetrag)}</div>
                  <div className="text-sm text-gray-600">{rechnungenFuerTag.length} Rechnung(en)</div>
                </div>
              </div>

              <div className="space-y-2 mt-3">
                {rechnungenFuerTag.map((rechnung) => {
                  const gesamtBezahlt = rechnung.zahlungen?.reduce((sum, z) => sum + z.betrag, 0) || 0;
                  const offenerBetrag = rechnung.summe - gesamtBezahlt;
                  const heuteBezahlt = rechnung.zahlungen?.filter(
                    (z) => z.datum.split('T')[0] === new Date().toISOString().split('T')[0]
                  ).reduce((sum, z) => sum + z.betrag, 0) || 0;

                  return (
                    <div
                      key={rechnung.id}
                      onClick={() => onOpenDetail?.(rechnung)}
                      className="bg-white rounded-lg p-3 flex justify-between items-center hover:shadow-md transition-all cursor-pointer hover:scale-[1.01]"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{rechnung.kreditorName}</div>
                        <div className="text-sm text-gray-600">
                          {rechnung.betreff || rechnung.rechnungsnummer || 'Kein Betreff'}
                        </div>
                        <div className="flex gap-3 mt-1">
                          {rechnung.monatlicheRate && (
                            <div className="text-xs text-blue-600">
                              Rate: {formatCurrency(rechnung.monatlicheRate)}/Monat
                            </div>
                          )}
                          {heuteBezahlt > 0 && (
                            <div className="text-xs text-green-600 font-medium">
                              Heute: {formatCurrency(heuteBezahlt)}
                            </div>
                          )}
                          {gesamtBezahlt > 0 && (
                            <div className="text-xs text-gray-500">
                              Bezahlt: {formatCurrency(gesamtBezahlt)} / {formatCurrency(rechnung.summe)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="font-semibold text-gray-900">{formatCurrency(offenerBetrag)}</div>
                        {gesamtBezahlt > 0 && (
                          <div className="text-xs text-gray-500">
                            von {formatCurrency(rechnung.summe)}
                          </div>
                        )}
                        <div className="text-xs mt-1">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              rechnung.status === 'verzug'
                                ? 'bg-red-100 text-red-800'
                                : rechnung.status === 'faellig'
                                ? 'bg-orange-100 text-orange-800'
                                : rechnung.status === 'gemahnt'
                                ? 'bg-yellow-100 text-yellow-800'
                                : rechnung.status === 'in_ratenzahlung'
                                ? 'bg-indigo-100 text-indigo-800'
                                : rechnung.status === 'bezahlt'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {rechnung.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legende */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-gray-600">Überfällig</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 rounded"></div>
            <span className="text-gray-600">Heute fällig</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded"></div>
            <span className="text-gray-600">Diese Woche</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-gray-600">Dieser Monat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-gray-600">Später</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaelligkeitsTimeline;
