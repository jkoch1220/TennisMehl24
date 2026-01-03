import { useMemo } from 'react';
import { Calendar, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { OffeneRechnung } from '../../types/kreditor';
import { getRelevanteFaelligkeit } from '../../utils/ratenzahlungCalculations';

interface PrivatFaelligkeitsTimelineProps {
  rechnungen: OffeneRechnung[];
  tageAnzeigen?: number;
  onOpenDetail?: (rechnung: OffeneRechnung) => void;
}

const PrivatFaelligkeitsTimeline = ({ rechnungen, tageAnzeigen = 30, onOpenDetail }: PrivatFaelligkeitsTimelineProps) => {
  const timelineData = useMemo(() => {
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);

    // Nur offene Rechnungen
    const offeneRechnungen = rechnungen.filter(r =>
      r.status !== 'bezahlt' && r.status !== 'storniert'
    );

    // Nach Datum gruppieren
    const gruppiertNachDatum: Record<string, OffeneRechnung[]> = {};

    offeneRechnungen.forEach(rechnung => {
      const faelligkeit = getRelevanteFaelligkeit(rechnung);
      const datum = new Date(faelligkeit);
      datum.setHours(0, 0, 0, 0);

      const diffTage = Math.floor((datum.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));

      // Nur Rechnungen im Zeitraum anzeigen
      if (diffTage >= -14 && diffTage <= tageAnzeigen) {
        const key = datum.toISOString().split('T')[0];
        if (!gruppiertNachDatum[key]) {
          gruppiertNachDatum[key] = [];
        }
        gruppiertNachDatum[key].push(rechnung);
      }
    });

    // Sortieren nach Datum
    const sortiert = Object.entries(gruppiertNachDatum)
      .map(([datum, rechnungen]) => ({
        datum: new Date(datum),
        rechnungen,
        diffTage: Math.floor((new Date(datum).getTime() - heute.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => a.datum.getTime() - b.datum.getTime());

    return sortiert;
  }, [rechnungen, tageAnzeigen]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (date: Date) => {
    const optionen: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    };
    return date.toLocaleDateString('de-DE', optionen);
  };

  const getDatumLabel = (diffTage: number) => {
    if (diffTage < -1) return `${Math.abs(diffTage)} Tage überfällig`;
    if (diffTage === -1) return 'Gestern';
    if (diffTage === 0) return 'Heute';
    if (diffTage === 1) return 'Morgen';
    if (diffTage <= 7) return `In ${diffTage} Tagen`;
    return `In ${diffTage} Tagen`;
  };

  const getDatumFarbe = (diffTage: number) => {
    if (diffTage < 0) return 'border-red-500 bg-red-50 dark:bg-red-900/20';
    if (diffTage === 0) return 'border-orange-500 bg-orange-50 dark:bg-orange-900/20';
    if (diffTage <= 7) return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
    return 'border-purple-500 bg-purple-50 dark:bg-purple-900/20';
  };

  const getIcon = (diffTage: number) => {
    if (diffTage < 0) return <AlertTriangle className="w-5 h-5 text-red-500" />;
    if (diffTage === 0) return <Clock className="w-5 h-5 text-orange-500" />;
    if (diffTage <= 7) return <Calendar className="w-5 h-5 text-yellow-500" />;
    return <Calendar className="w-5 h-5 text-purple-500" />;
  };

  if (timelineData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Fälligkeits-Timeline</h2>
        </div>
        <div className="text-center py-8 text-gray-500 dark:text-slate-400">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p>Keine anstehenden Fälligkeiten</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="w-6 h-6 text-purple-600" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Fälligkeits-Timeline</h2>
        <span className="text-sm text-gray-500 dark:text-slate-400">
          (nächste {tageAnzeigen} Tage)
        </span>
      </div>

      <div className="relative">
        {/* Vertikale Linie */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-slate-600" />

        <div className="space-y-6">
          {timelineData.map(({ datum, rechnungen, diffTage }) => {
            const gesamtBetrag = rechnungen.reduce((sum, r) => {
              const bezahlt = r.zahlungen?.reduce((s, z) => s + (z.betrag || 0), 0) || 0;
              return sum + Math.max(0, r.summe - bezahlt);
            }, 0);

            return (
              <div key={datum.toISOString()} className="relative pl-14">
                {/* Punkt auf der Timeline */}
                <div className={`absolute left-4 w-5 h-5 rounded-full border-4 ${getDatumFarbe(diffTage)} -translate-x-1/2`}>
                  <div className="absolute -left-1 -top-1">
                    {getIcon(diffTage)}
                  </div>
                </div>

                {/* Datum-Header */}
                <div className={`rounded-lg border-l-4 p-4 ${getDatumFarbe(diffTage)}`}>
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="font-semibold text-gray-900 dark:text-slate-100">
                        {formatDate(datum)}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-slate-400 ml-2">
                        {getDatumLabel(diffTage)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-gray-900 dark:text-slate-100">
                        {formatCurrency(gesamtBetrag)}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-slate-400 ml-1">
                        ({rechnungen.length} {rechnungen.length === 1 ? 'Rechnung' : 'Rechnungen'})
                      </span>
                    </div>
                  </div>

                  {/* Rechnungen */}
                  <div className="space-y-2">
                    {rechnungen.map(rechnung => {
                      const bezahlt = rechnung.zahlungen?.reduce((s, z) => s + (z.betrag || 0), 0) || 0;
                      const offen = Math.max(0, rechnung.summe - bezahlt);

                      return (
                        <div
                          key={rechnung.id}
                          onClick={() => onOpenDetail?.(rechnung)}
                          className="bg-white dark:bg-slate-800 rounded-lg p-3 flex justify-between items-center hover:shadow-md transition-shadow cursor-pointer"
                        >
                          <div>
                            <div className="font-medium text-gray-900 dark:text-slate-100">
                              {rechnung.kreditorName}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-slate-400">
                              {rechnung.betreff || rechnung.rechnungsnummer || 'Kein Betreff'}
                            </div>
                            {rechnung.monatlicheRate && (
                              <span className="text-xs text-purple-600">
                                Rate: {formatCurrency(rechnung.monatlicheRate)}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-gray-900 dark:text-slate-100">
                              {formatCurrency(offen)}
                            </div>
                            {bezahlt > 0 && (
                              <div className="text-xs text-green-600">
                                Bezahlt: {formatCurrency(bezahlt)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PrivatFaelligkeitsTimeline;
