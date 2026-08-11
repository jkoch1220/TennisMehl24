/**
 * WiegescheinPruefliste
 *
 * Sammelansicht aller Lieferungen, deren Wiegeschein noch niemand geprüft hat.
 *
 * Warum es diese Liste gibt: Der Wiegeschein trägt die Menge, nach der
 * abgerechnet wird. Die Prüfung nur am einzelnen Projekt anzubieten hiesse,
 * darauf zu hoffen, dass jemand zufällig hinsieht — hier ist der eine Ort, an
 * dem sichtbar wird, was noch offen ist. Am längsten Liegendes steht oben.
 *
 * Geprüft wird direkt in der Liste (dieselbe Karte wie im Lieferschein-Tab),
 * damit für eine Handvoll Lieferungen niemand durch die Projekte navigieren muss.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Scale } from 'lucide-react';
import { Projekt } from '../../types/projekt';
import { ladeOffeneWiegescheine } from '../../services/wiegescheinService';
import WiegescheinKarte from '../Projektabwicklung/WiegescheinKarte';

interface WiegescheinPrueflisteProps {
  /** Auf ein Saisonjahr eingrenzen (undefined = alle) */
  saisonjahr?: number;
  /** Sprung ins vollständige Projekt */
  onProjektClick?: (projekt: Projekt) => void;
}

const formatZeitpunkt = (iso?: string): string => {
  if (!iso) return '—';
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return '—';
  return datum.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Wie lange wartet die Prüfung schon? Macht Liegengebliebenes sofort sichtbar. */
const wartetSeit = (iso?: string): string => {
  if (!iso) return '';
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return '';
  const tage = Math.floor((Date.now() - start) / (24 * 60 * 60 * 1000));
  if (tage <= 0) return 'heute eingegangen';
  if (tage === 1) return 'wartet seit gestern';
  return `wartet seit ${tage} Tagen`;
};

const WiegescheinPruefliste = ({ saisonjahr, onProjektClick }: WiegescheinPrueflisteProps) => {
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState(0);

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      setProjekte(await ladeOffeneWiegescheine(saisonjahr));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Liste konnte nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }, [saisonjahr]);

  useEffect(() => {
    void laden();
  }, [laden]);

  /*
   * Nach einer Prüfung wird die Zeile NICHT sofort entfernt: Wer gerade eine
   * Menge bestätigt hat, soll das Ergebnis noch sehen und notfalls korrigieren
   * können. Der Zähler zeigt den Fortschritt, „Liste aktualisieren" räumt auf.
   */
  const handleGeprueft = () => setErledigt((n) => n + 1);

  const offen = projekte.length - erledigt;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="rounded-xl bg-amber-500 p-2.5">
          <Scale className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
            Wiegescheine prüfen
          </h2>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Vom Fahrer fotografiert, Menge noch nicht bestätigt
          </p>
        </div>
        <button
          onClick={() => void laden()}
          disabled={laedt}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {laedt ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Liste aktualisieren
        </button>
      </div>

      {laedt && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-800">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
          <p className="mt-3 text-gray-600 dark:text-slate-400">Lieferungen werden geladen …</p>
        </div>
      )}

      {!laedt && fehler && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/40">
          <p className="flex items-center gap-2 font-medium text-red-800 dark:text-red-300">
            <AlertCircle className="h-5 w-5" />
            {fehler}
          </p>
        </div>
      )}

      {!laedt && !fehler && projekte.length === 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-10 text-center dark:border-green-800 dark:bg-green-950/30">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <p className="mt-3 text-lg font-semibold text-gray-900 dark:text-slate-100">
            Keine offenen Wiegescheine
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Alle gelieferten Mengen sind geprüft.
          </p>
        </div>
      )}

      {!laedt && !fehler && projekte.length > 0 && (
        <>
          <p className="mb-4 text-sm text-gray-600 dark:text-slate-400">
            {offen > 0 ? (
              <>
                <span className="font-semibold text-gray-900 dark:text-slate-100">{offen}</span>{' '}
                {offen === 1 ? 'Lieferung wartet' : 'Lieferungen warten'} auf die Prüfung
                {erledigt > 0 && ` — ${erledigt} in dieser Sitzung erledigt`}
              </>
            ) : (
              <>Alle {erledigt} Lieferungen in dieser Sitzung geprüft. Liste aktualisieren räumt auf.</>
            )}
          </p>

          <div className="space-y-6">
            {projekte.map((projekt) => (
              <div
                key={projekt.$id || projekt.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-3 flex flex-wrap items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-slate-100">
                      {projekt.kundenname}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-slate-400">
                      {projekt.lieferscheinnummer
                        ? `Lieferschein ${projekt.lieferscheinnummer} · `
                        : ''}
                      geliefert {formatZeitpunkt(projekt.liefernachweisAm)}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                      {wartetSeit(projekt.wiegeschein?.erfasstAm || projekt.liefernachweisAm)}
                    </span>
                    {onProjektClick && (
                      <button
                        onClick={() => onProjektClick(projekt)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                        title="Projekt öffnen"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Projekt
                      </button>
                    )}
                  </div>
                </div>

                <WiegescheinKarte projekt={projekt} onAktualisiert={handleGeprueft} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default WiegescheinPruefliste;
