// Opt-in-Vorschlagsliste des Massen-Angebots-Tools:
// zeigt alle Kunden, die im Vorjahr DIREKT bestellt haben (eigenes Projekt, kein
// Platzbauer, kein Bezug über Platzbauer, E-Mail vorhanden), aber noch nicht als
// „Massenangebots-tauglich" markiert sind — und markiert die ausgewählten Kunden
// auf Knopfdruck in Batches (bewusste Nutzer-Aktion, mit Fortschritt + Zusammenfassung).

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { massenAngebotService } from '../../services/massenAngebotService';
import { MarkierungsErgebnis, TauglichkeitsVorschlag } from '../../types/massenAngebot';
import BestaetigungsDialog from './MassenAngebotBestaetigungsDialog';

interface Props {
  saisonjahr: number;
  /** Wird nach erfolgreicher Markierung aufgerufen (z.B. Kandidaten neu berechnen). */
  onMarkiert?: () => void;
}

const MassenAngebotVorschlagsliste = ({ saisonjahr, onMarkiert }: Props) => {
  const [offen, setOffen] = useState(false);
  const [vorschlaege, setVorschlaege] = useState<TauglichkeitsVorschlag[] | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fortschritt, setFortschritt] = useState<{ schritt: string; prozent: number } | null>(null);
  const [fehlerMeldung, setFehlerMeldung] = useState<string | null>(null);

  const [bestaetigung, setBestaetigung] = useState(false);
  const [markierung, setMarkierung] = useState<{ done: number; total: number; aktuell: string } | null>(
    null
  );
  const [ergebnis, setErgebnis] = useState<MarkierungsErgebnis | null>(null);

  const ausgewaehlte = useMemo(
    () => (vorschlaege ?? []).filter((v) => v.ausgewaehlt),
    [vorschlaege]
  );

  const ladeVorschlaege = useCallback(async () => {
    setLaedt(true);
    setFehlerMeldung(null);
    setErgebnis(null);
    setFortschritt({ schritt: 'Starte Berechnung…', prozent: 0 });
    try {
      const liste = await massenAngebotService.sammleTauglichkeitsVorschlaege(
        saisonjahr,
        (schritt, prozent) => setFortschritt({ schritt, prozent })
      );
      setVorschlaege(liste);
    } catch (error) {
      console.error('Tauglichkeits-Vorschläge konnten nicht berechnet werden:', error);
      setFehlerMeldung(error instanceof Error ? error.message : 'Unbekannter Fehler');
    } finally {
      setLaedt(false);
      setFortschritt(null);
    }
  }, [saisonjahr]);

  const handleToggle = useCallback((kundeId: string) => {
    setVorschlaege((prev) =>
      prev ? prev.map((v) => (v.kundeId === kundeId ? { ...v, ausgewaehlt: !v.ausgewaehlt } : v)) : prev
    );
  }, []);

  const handleAlle = useCallback((ausgewaehlt: boolean) => {
    setVorschlaege((prev) => (prev ? prev.map((v) => ({ ...v, ausgewaehlt })) : prev));
  }, []);

  const bestaetigeMarkierung = useCallback(async () => {
    setBestaetigung(false);
    setErgebnis(null);
    const zuMarkieren = ausgewaehlte;
    setMarkierung({ done: 0, total: zuMarkieren.length, aktuell: '' });
    try {
      const res = await massenAngebotService.markiereAlsTauglich(zuMarkieren, (done, total, aktuell) =>
        setMarkierung({ done, total, aktuell })
      );
      setErgebnis(res);
      // Erfolgreich markierte Kunden aus der Liste nehmen (Fehlerfälle bleiben sichtbar).
      const fehlerIds = new Set(res.fehler.map((f) => f.kundeId));
      const markierteIds = new Set(
        zuMarkieren.filter((v) => !fehlerIds.has(v.kundeId)).map((v) => v.kundeId)
      );
      setVorschlaege((prev) => (prev ? prev.filter((v) => !markierteIds.has(v.kundeId)) : prev));
      if (res.erfolgreich > 0) onMarkiert?.();
    } catch (error) {
      console.error('Markierung fehlgeschlagen:', error);
      setFehlerMeldung(error instanceof Error ? error.message : 'Markierung fehlgeschlagen');
    } finally {
      setMarkierung(null);
    }
  }, [ausgewaehlte, onMarkiert]);

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
      {/* Kopfzeile (auf-/zuklappbar) */}
      <button
        onClick={() => setOffen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-2 text-left"
      >
        {offen ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
        <UserPlus className="w-5 h-5 text-emerald-600" />
        <span className="font-semibold text-gray-900 dark:text-slate-100">
          Vorschlagsliste: Vorjahres-Direktbesteller als „Massenangebots-tauglich" markieren
        </span>
        {vorschlaege && (
          <span className="ml-auto text-sm text-gray-500 dark:text-slate-400">
            {vorschlaege.length} Vorschläge
          </span>
        )}
      </button>

      {offen && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-slate-700 pt-3">
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Durch die Opt-in-Umstellung ist zunächst KEIN Kunde massenangebots-tauglich. Diese Liste
            zeigt alle aktiven Kunden mit eigenem Vorjahres-Projekt (Direktbesteller mit E-Mail, kein
            Platzbauer, kein Bezug über Platzbauer), die noch nicht markiert sind.
          </p>

          {fehlerMeldung && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {fehlerMeldung}
            </div>
          )}

          {/* Fortschritt Berechnung */}
          {laedt && fortschritt && (
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 mb-1">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                {fortschritt.schritt} {fortschritt.prozent} %
              </div>
              <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all"
                  style={{ width: `${fortschritt.prozent}%` }}
                />
              </div>
            </div>
          )}

          {!vorschlaege ? (
            <button
              onClick={ladeVorschlaege}
              disabled={laedt}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50 text-sm"
            >
              {laedt ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Vorschläge berechnen
            </button>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <span className="font-semibold text-gray-900 dark:text-slate-100">
                  {ausgewaehlte.length} von {vorschlaege.length} ausgewählt
                </span>
                <button
                  onClick={() => handleAlle(true)}
                  className="px-2.5 py-1 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-xs font-medium"
                >
                  Alle auswählen
                </button>
                <button
                  onClick={() => handleAlle(false)}
                  className="px-2.5 py-1 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-xs font-medium"
                >
                  Alle abwählen
                </button>
                <button
                  onClick={ladeVorschlaege}
                  disabled={laedt || !!markierung}
                  className="ml-auto px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 inline-flex items-center gap-2 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${laedt ? 'animate-spin' : ''}`} /> Neu berechnen
                </button>
              </div>

              {vorschlaege.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-slate-400 py-4 text-center">
                  Keine offenen Vorschläge — alle Vorjahres-Direktbesteller sind bereits markiert.
                </div>
              ) : (
                <div className="border border-gray-100 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-slate-900/60 sticky top-0 z-10">
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                          <th className="px-3 py-2 w-10"></th>
                          <th className="px-3 py-2">Kunde</th>
                          <th className="px-3 py-2">E-Mail</th>
                          <th className="px-3 py-2 text-right">Vorjahres-Projekte</th>
                          <th className="px-3 py-2">Bestellt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vorschlaege.map((vorschlag) => (
                          <tr
                            key={vorschlag.kundeId}
                            className="border-b border-gray-100 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="px-3 py-1.5">
                              <input
                                type="checkbox"
                                checked={vorschlag.ausgewaehlt}
                                onChange={() => handleToggle(vorschlag.kundeId)}
                                className="h-4 w-4 text-emerald-600 rounded border-gray-300 dark:border-slate-600"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <span className="font-medium text-gray-900 dark:text-slate-100">
                                {vorschlag.kundenname}
                              </span>
                              {vorschlag.kundennummer && (
                                <span className="ml-2 text-xs text-gray-400">{vorschlag.kundennummer}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600 dark:text-slate-400">
                              {vorschlag.email}
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-600 dark:text-slate-400">
                              {vorschlag.anzahlVorjahresProjekte}
                            </td>
                            <td className="px-3 py-1.5">
                              {vorschlag.hatBestellung ? (
                                <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded">
                                  ab AB
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">nur Angebot</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Fortschritt Markierung */}
              {markierung && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 mb-1">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    Markiere {markierung.done} von {markierung.total}… {markierung.aktuell}
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all"
                      style={{
                        width: `${markierung.total ? (markierung.done / markierung.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Abschluss-Zusammenfassung */}
              {ergebnis && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> {ergebnis.erfolgreich} Kunden als
                    „Massenangebots-tauglich" markiert
                    {ergebnis.fehler.length > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        · {ergebnis.fehler.length} Fehler
                      </span>
                    )}
                  </div>
                  {ergebnis.fehler.length > 0 && (
                    <div className="text-xs text-red-600 dark:text-red-400 max-h-20 overflow-y-auto">
                      {ergebnis.fehler.map((f) => (
                        <div key={f.kundeId}>
                          {f.kundenname}: {f.fehler}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {vorschlaege.length > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setBestaetigung(true)}
                    disabled={ausgewaehlte.length === 0 || !!markierung}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50 text-sm"
                  >
                    <UserPlus className="w-4 h-4" /> {ausgewaehlte.length} Kunden als tauglich markieren
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {bestaetigung && (
        <BestaetigungsDialog
          icon={<UserPlus className="w-6 h-6 text-emerald-600" />}
          titel="Kunden als massenangebots-tauglich markieren?"
          onAbbrechen={() => setBestaetigung(false)}
          onBestaetigen={bestaetigeMarkierung}
          bestaetigenLabel={`${ausgewaehlte.length} markieren`}
          bestaetigenClass="bg-emerald-600 hover:bg-emerald-700"
        >
          Bei <strong>{ausgewaehlte.length}</strong> Kunden wird das Kennzeichen
          „Massenangebots-tauglich" gesetzt (automatischesAngebot = true). Die Kunden erscheinen
          danach in der Angebots-Vorschau. Es werden KEINE Angebote erzeugt oder versendet.
        </BestaetigungsDialog>
      )}
    </div>
  );
};

export default MassenAngebotVorschlagsliste;
