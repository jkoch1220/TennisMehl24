import { useMemo } from 'react';
import { AlertTriangle, Mail, FileText, ExternalLink, ChevronRight } from 'lucide-react';
import { DebitorView, MAHNSTUFEN_CONFIG, MAHN_EMPFEHLUNG_LABEL } from '../../types/debitor';
import { berechneMahnEmpfehlung } from '../../services/debitorService';

interface MahnungenTabProps {
  debitoren: DebitorView[];
  onOpenDetail: (debitor: DebitorView) => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('de-DE') : '–';

/**
 * Mahnwesen-Workflow-Übersicht: gruppiert offene Debitoren nach Mahnstufe und
 * markiert, für welche eine Mahnung fällig ist. Stufen ohne Einträge werden
 * trotzdem als (kompakte) Kopfzeile angezeigt — gibt einen klaren Überblick
 * über die Eskalationspipeline.
 */
const MahnungenTab = ({ debitoren, onOpenDetail }: MahnungenTabProps) => {
  // Bezahlte Debitoren immer rausfiltern — Mahnwesen ist nur für offene Forderungen relevant.
  const offene = useMemo(() => debitoren.filter((d) => d.status !== 'bezahlt'), [debitoren]);

  // Empfehlung pro Debitor einmal berechnen
  const mitEmpfehlung = useMemo(
    () => offene.map((d) => ({ debitor: d, empfehlung: berechneMahnEmpfehlung(d) })),
    [offene]
  );

  const mahnungFaellig = useMemo(
    () => mitEmpfehlung.filter((e) => e.empfehlung !== 'keine'),
    [mitEmpfehlung]
  );

  // Gruppierung nach Mahnstufe (0-4). Innerhalb der Gruppe nach tageUeberfaellig DESC.
  const gruppen = useMemo(() => {
    const map = new Map<number, DebitorView[]>();
    for (let stufe = 0; stufe <= 4; stufe++) {
      map.set(stufe, []);
    }
    for (const debitor of offene) {
      const liste = map.get(debitor.mahnstufe);
      if (liste) liste.push(debitor);
    }
    for (const liste of map.values()) {
      liste.sort((a, b) => b.tageUeberfaellig - a.tageUeberfaellig);
    }
    return map;
  }, [offene]);

  // Stufentitel (Mahnstufe 0 = "Mahnung fällig" + alle anderen Offenen ohne fällige Aktion)
  const stufenTitel: Record<number, string> = {
    0: 'Keine Mahnstufe — Zahlungserinnerung prüfen',
    1: 'Mahnstufe 1: Zahlungserinnerung versendet',
    2: 'Mahnstufe 2: 1. Mahnung versendet',
    3: 'Mahnstufe 3: 2. Mahnung / Letzte Mahnung',
    4: 'Mahnstufe 4: Inkasso / Rechtsweg',
  };

  if (offene.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 text-center">
        <p className="text-gray-500 dark:text-slate-400">
          Keine offenen Forderungen. Alle Rechnungen sind bezahlt 🎉
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner: Mahnung fällig */}
      {mahnungFaellig.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-orange-900 dark:text-orange-200">
                {mahnungFaellig.length} Mahnschritt{mahnungFaellig.length === 1 ? '' : 'e'} fällig
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Gesamtbetrag offen:{' '}
                {formatCurrency(mahnungFaellig.reduce((s, e) => s + e.debitor.offenerBetrag, 0))}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            {mahnungFaellig.map(({ debitor, empfehlung }) => (
              <button
                key={debitor.projektId}
                onClick={() => onOpenDetail(debitor)}
                className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white dark:bg-slate-800 rounded-lg border border-orange-200 dark:border-orange-800 hover:border-orange-400 dark:hover:border-orange-600 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-slate-100 truncate">
                      {debitor.kundenname}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {debitor.rechnungsnummer}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
                      {MAHN_EMPFEHLUNG_LABEL[empfehlung]}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      • {debitor.tageUeberfaellig} Tage überfällig
                    </span>
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="font-semibold text-gray-900 dark:text-slate-100">
                    {formatCurrency(debitor.offenerBetrag)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gruppen nach Mahnstufe */}
      {[0, 1, 2, 3, 4].map((stufe) => {
        const liste = gruppen.get(stufe) || [];
        if (liste.length === 0) return null;

        const config = MAHNSTUFEN_CONFIG[stufe as 0 | 1 | 2 | 3 | 4];
        const gesamtBetrag = liste.reduce((s, d) => s + d.offenerBetrag, 0);

        return (
          <div
            key={stufe}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color} whitespace-nowrap`}
                >
                  {config.label}
                </span>
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 truncate">
                  {stufenTitel[stufe]}
                </h3>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  {liste.length} Debitor{liste.length === 1 ? '' : 'en'}
                </div>
                <div className="text-base font-semibold text-gray-900 dark:text-slate-100">
                  {formatCurrency(gesamtBetrag)}
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {liste.map((debitor) => {
                const empfehlung = berechneMahnEmpfehlung(debitor);
                return (
                  <button
                    key={debitor.projektId}
                    onClick={() => onOpenDetail(debitor)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-slate-100 truncate">
                          {debitor.kundenname}
                        </span>
                        {empfehlung !== 'keine' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                            <AlertTriangle className="w-3 h-3" />
                            {MAHN_EMPFEHLUNG_LABEL[empfehlung]}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {debitor.rechnungsnummer}
                        </span>
                        <span>•</span>
                        <span>{debitor.tageUeberfaellig} Tage überfällig</span>
                        {debitor.letzteMahnungAm && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              Letzte Mahnung: {formatDate(debitor.letzteMahnungAm)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="font-semibold text-gray-900 dark:text-slate-100">
                        {formatCurrency(debitor.offenerBetrag)}
                      </div>
                      {debitor.bezahlterBetrag > 0 && (
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          von {formatCurrency(debitor.rechnungsbetrag)}
                        </div>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MahnungenTab;
