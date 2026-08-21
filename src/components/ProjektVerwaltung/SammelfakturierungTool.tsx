/**
 * Sammelfakturierung — die Rechnungen einer Lieferwoche auf einen Klick.
 *
 * Der Aufbau folgt derselben Ordnung wie das Massen-Angebots-Tool: erst prüfen,
 * dann sehen, was geht und was nicht, dann erzeugen. Versendet wird hier nicht —
 * das ist ein eigener, bewusster Schritt in der Debitorenverwaltung.
 *
 * Gestalterische Grundregel: DIE GESPERRTEN BLEIBEN SICHTBAR. Acht Lieferungen,
 * die wegen fehlender Wiegescheine nicht abgerechnet werden können, sind die
 * wichtigere Nachricht als die zwölf, die durchgehen. Eine Liste, die sie
 * ausblendet, sieht nach Feierabend aus und ist keiner.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Receipt,
  RefreshCw,
  Play,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  sammleFakturierbare,
  erzeugeRechnungen,
  fasseZusammen,
  sperrText,
  FakturaKandidat,
  FakturaErgebnis,
} from '../../services/sammelfakturierungService';

const eur = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

interface Props {
  saisonjahr: number;
}

const SammelfakturierungTool = ({ saisonjahr }: Props) => {
  const [kandidaten, setKandidaten] = useState<FakturaKandidat[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [laden, setLaden] = useState(false);
  const [ladeFortschritt, setLadeFortschritt] = useState<{ done: number; total: number } | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [lauf, setLauf] = useState<{ done: number; total: number; aktuell: string } | null>(null);
  const [ergebnis, setErgebnis] = useState<FakturaErgebnis | null>(null);
  const [bestaetigung, setBestaetigung] = useState(false);
  // Ref und nicht State: Die Schleife im Service liest das Signal aus einer
  // Closure, die beim Start festgelegt wurde. Ein State-Update erreichte sie
  // nicht — der Knopf sähe aus, als täte er etwas, und täte nichts.
  const abbruchRef = useRef(false);

  const laden_ = useCallback(async () => {
    setLaden(true);
    setErgebnis(null);
    setLadeFortschritt({ done: 0, total: 0 });
    try {
      const liste = await sammleFakturierbare(saisonjahr, (done, total) =>
        setLadeFortschritt({ done, total })
      );
      setKandidaten(liste);
      // Alles Erzeugbare ist vorausgewählt — der Normalfall ist „alle".
      setAuswahl(new Set(liste.filter((k) => k.sperren.length === 0).map((k) => k.projektId)));
      setGeladen(true);
    } catch (error) {
      console.error('Fakturierbare Vorgänge konnten nicht geladen werden:', error);
      toast.error('Die Liste konnte nicht geladen werden.');
    } finally {
      setLaden(false);
      setLadeFortschritt(null);
    }
  }, [saisonjahr]);

  // Saisonwechsel verwirft die Liste: Sie gehört zu einem Jahrgang, und eine
  // stehengebliebene Auswahl aus 2026 im Jahr 2027 zu erzeugen wäre ein Unfall.
  useEffect(() => {
    setKandidaten([]);
    setGeladen(false);
    setAuswahl(new Set());
    setErgebnis(null);
  }, [saisonjahr]);

  const zusammenfassung = useMemo(() => fasseZusammen(kandidaten), [kandidaten]);
  const erzeugbare = useMemo(() => kandidaten.filter((k) => k.sperren.length === 0), [kandidaten]);
  const gesperrte = useMemo(() => kandidaten.filter((k) => k.sperren.length > 0), [kandidaten]);

  const ausgewaehlte = useMemo(
    () => erzeugbare.filter((k) => auswahl.has(k.projektId)),
    [erzeugbare, auswahl]
  );
  const summeAuswahl = useMemo(
    () => ausgewaehlte.reduce((s, k) => s + k.betrag, 0),
    [ausgewaehlte]
  );

  const toggle = (projektId: string) => {
    setAuswahl((prev) => {
      const neu = new Set(prev);
      if (neu.has(projektId)) neu.delete(projektId);
      else neu.add(projektId);
      return neu;
    });
  };

  const starte = useCallback(async () => {
    setBestaetigung(false);
    abbruchRef.current = false;
    setLauf({ done: 0, total: ausgewaehlte.length, aktuell: '' });
    try {
      const res = await erzeugeRechnungen(ausgewaehlte, {
        onFortschritt: (done, total, aktuell) => setLauf({ done, total, aktuell }),
        abbruchSignal: () => abbruchRef.current,
      });
      setErgebnis(res);
      if (res.erzeugt.length > 0) {
        toast.success(
          `${res.erzeugt.length} ${res.erzeugt.length === 1 ? 'Rechnung' : 'Rechnungen'} erzeugt` +
            (res.fehler.length ? ` · ${res.fehler.length} fehlgeschlagen` : '')
        );
      } else if (res.fehler.length > 0) {
        toast.error('Keine Rechnung konnte erzeugt werden.');
      }
      // Frisch laden: Die erzeugten Vorgänge sind jetzt gesperrt und dürfen nicht
      // erneut in der Auswahl stehen.
      await laden_();
    } catch (error) {
      console.error('Sammelfakturierung fehlgeschlagen:', error);
      toast.error('Der Lauf ist abgebrochen.');
    } finally {
      setLauf(null);
    }
  }, [ausgewaehlte, laden_]);

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
            <Receipt className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
          </div>
          <div className="flex-1 min-w-[16rem]">
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
              Sammelfakturierung · Saison {saisonjahr}
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Erzeugt Rechnungen für gelieferte Aufträge. Positionen, Rabatt und Steueroption
              kommen aus der Auftragsbestätigung. <strong>Versendet wird nicht</strong> — das ist
              der nächste Schritt in der Debitorenverwaltung.
            </p>
          </div>
          <button
            onClick={laden_}
            disabled={laden}
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 inline-flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${laden ? 'animate-spin' : ''}`} />
            {geladen ? 'Neu prüfen' : 'Vorgänge prüfen'}
          </button>
        </div>

        {ladeFortschritt && ladeFortschritt.total > 0 && (
          <div className="mt-3">
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">
              Prüfe {ladeFortschritt.done} von {ladeFortschritt.total}…
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${(ladeFortschritt.done / ladeFortschritt.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {!geladen && !laden && (
        <div className="bg-white dark:bg-slate-800 border border-dashed border-gray-300 dark:border-slate-700 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Noch nichts geprüft. „Vorgänge prüfen" sieht alle gelieferten Aufträge der Saison durch
            und sagt, welche abgerechnet werden können — es wird dabei nichts geschrieben.
          </p>
        </div>
      )}

      {geladen && kandidaten.length === 0 && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Keine offenen Lieferungen in Saison {saisonjahr}. Alles abgerechnet.
          </p>
        </div>
      )}

      {geladen && kandidaten.length > 0 && (
        <>
          {/* Zusammenfassung */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-4 flex-wrap text-sm">
              <span className="text-gray-900 dark:text-slate-100">
                <strong className="text-xl tabular-nums">{zusammenfassung.erzeugbar}</strong>{' '}
                abrechenbar
              </span>
              <span className="text-gray-500 dark:text-slate-400">·</span>
              <span className="text-gray-700 dark:text-slate-300 tabular-nums">
                {eur(zusammenfassung.summe)}
              </span>
              {zusammenfassung.gesperrt > 0 && (
                <>
                  <span className="text-gray-500 dark:text-slate-400">·</span>
                  <span className="text-amber-700 dark:text-amber-300">
                    <strong className="tabular-nums">{zusammenfassung.gesperrt}</strong> brauchen
                    Handarbeit
                  </span>
                </>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setAuswahl(new Set(erzeugbare.map((k) => k.projektId)))}
                  className="text-xs text-gray-600 dark:text-slate-400 hover:underline"
                >
                  Alle auswählen
                </button>
                <button
                  onClick={() => setAuswahl(new Set())}
                  className="text-xs text-gray-600 dark:text-slate-400 hover:underline"
                >
                  Alle abwählen
                </button>
              </div>
            </div>
          </div>

          {/* Abrechenbar */}
          {erzeugbare.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-slate-100">
                Abrechenbar
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {erzeugbare.map((k) => (
                      <tr
                        key={k.projektId}
                        className="border-b border-gray-100 dark:border-slate-700/60 last:border-0"
                      >
                        <td className="px-4 py-2.5 w-8">
                          <input
                            type="checkbox"
                            checked={auswahl.has(k.projektId)}
                            onChange={() => toggle(k.projektId)}
                            className="rounded border-gray-300 dark:border-slate-600"
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="font-medium text-gray-900 dark:text-slate-100">
                            {k.kundenname}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-slate-400">
                            {k.projektName}
                            {k.kundennummer ? ` · ${k.kundennummer}` : ''}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                          {k.positionen} Pos.
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold text-gray-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                          {eur(k.betrag)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <a
                            href={`/projektabwicklung/${k.projektId}`}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                          >
                            Akte <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Gesperrt — bleibt stehen, siehe Kopfkommentar */}
          {gesperrte.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {gesperrte.length} {gesperrte.length === 1 ? 'Vorgang' : 'Vorgänge'} brauchen
                  Handarbeit
                </span>
                <span className="text-xs text-amber-800/80 dark:text-amber-300/80 ml-auto">
                  {Object.entries(zusammenfassung.proSperre)
                    .map(([grund, n]) => `${n}× ${sperrText(grund as never).split('—')[0].trim()}`)
                    .join(' · ')}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {gesperrte.map((k) => (
                      <tr
                        key={k.projektId}
                        className="border-b border-gray-100 dark:border-slate-700/60 last:border-0"
                      >
                        <td className="px-4 py-2.5 w-8">
                          <Ban className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="font-medium text-gray-700 dark:text-slate-300">
                            {k.kundenname}
                          </div>
                          <div className="text-xs text-amber-700 dark:text-amber-400">
                            {k.hinweis}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <a
                            href={`/projektabwicklung/${k.projektId}`}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                          >
                            Akte öffnen <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Aktion */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-3 flex-wrap">
            {lauf ? (
              <>
              <div className="flex-1 min-w-[14rem]">
                <div className="text-sm text-gray-700 dark:text-slate-300 mb-1">
                  Erzeuge {lauf.done} von {lauf.total}
                  {lauf.aktuell ? ` · ${lauf.aktuell}` : ''}
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${lauf.total ? (lauf.done / lauf.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  abbruchRef.current = true;
                  toast.info('Der Lauf hält nach der laufenden Rechnung an.');
                }}
                className="px-3 py-2 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-2"
              >
                <Ban className="w-4 h-4" /> Anhalten
              </button>
              </>
            ) : (
              <>
                <span className="text-sm text-gray-700 dark:text-slate-300">
                  <strong className="tabular-nums">{ausgewaehlte.length}</strong> ausgewählt ·{' '}
                  <span className="tabular-nums">{eur(summeAuswahl)}</span>
                </span>
                <button
                  onClick={() => setBestaetigung(true)}
                  disabled={ausgewaehlte.length === 0}
                  className="ml-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  {ausgewaehlte.length} {ausgewaehlte.length === 1 ? 'Rechnung' : 'Rechnungen'}{' '}
                  erzeugen
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Ergebnis */}
      {ergebnis && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold text-gray-900 dark:text-slate-100">
              {ergebnis.erzeugt.length} erzeugt
            </span>
            {ergebnis.abgebrochen && (
              <span className="text-xs text-amber-700 dark:text-amber-300">· Lauf abgebrochen</span>
            )}
          </div>

          {ergebnis.erzeugt.length > 0 && (
            <div className="text-sm text-gray-600 dark:text-slate-400 space-y-0.5 max-h-48 overflow-y-auto">
              {ergebnis.erzeugt.map((r) => (
                <div key={r.projektId} className="flex items-center gap-2">
                  <span className="font-mono text-xs">{r.rechnungsnummer}</span>
                  <span>{r.kundenname}</span>
                  <span className="ml-auto tabular-nums">{eur(r.betrag)}</span>
                </div>
              ))}
            </div>
          )}

          {ergebnis.fehler.length > 0 && (
            <div className="border-t border-gray-100 dark:border-slate-700 pt-3">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                  {ergebnis.fehler.length} fehlgeschlagen
                </span>
              </div>
              <div className="text-xs text-gray-600 dark:text-slate-400 space-y-0.5">
                {ergebnis.fehler.map((f) => (
                  <div key={f.projektId}>
                    <strong>{f.kundenname}</strong>: {f.grund}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-slate-400 border-t border-gray-100 dark:border-slate-700 pt-3">
            Die Rechnungen sind erzeugt, aber noch nicht versendet. Der Versand läuft über
            Debitoren-Verwaltung → Rechnungsversand.
          </p>
        </div>
      )}

      {/* Bestätigung */}
      {bestaetigung && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-5">
            <div className="flex items-center gap-3 mb-3">
              <Receipt className="w-6 h-6 text-emerald-600" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                Rechnungen erzeugen?
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-slate-300">
              Es entstehen <strong>{ausgewaehlte.length}</strong> Rechnungen über insgesamt{' '}
              <strong>{eur(summeAuswahl)}</strong>. Jede bekommt eine fortlaufende Nummer aus dem
              Rechnungskreis.
            </p>
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Rechnungsnummern lassen sich nicht zurückgeben. Eine falsche Rechnung muss
                storniert werden — rückgängig machen geht nicht.
              </span>
            </p>
            <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">
              Versendet wird nichts. Das bleibt ein eigener Schritt.
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setBestaetigung(false)}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Abbrechen
              </button>
              <button
                onClick={starte}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
              >
                {ausgewaehlte.length} erzeugen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SammelfakturierungTool;
