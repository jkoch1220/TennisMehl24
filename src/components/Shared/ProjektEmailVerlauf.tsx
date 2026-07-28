import { useCallback, useEffect, useState } from 'react';
import {
  Mail,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  TestTube2,
} from 'lucide-react';
import { ladeEmailProtokoll, istTestversand } from '../../services/emailSendService';
import { EmailProtokoll, ProtokollDokumentTyp } from '../../types/email';

const TYP_LABEL: Record<ProtokollDokumentTyp, string> = {
  angebot: 'Angebot',
  auftragsbestaetigung: 'Auftragsbestätigung',
  lieferschein: 'Lieferschein',
  rechnung: 'Rechnung',
  mahnwesen: 'Mahnwesen',
};

const formatiereZeitpunkt = (iso: string): string => {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return iso;
  return `${datum.toLocaleDateString('de-DE')}, ${datum.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })} Uhr`;
};

interface ProjektEmailVerlaufProps {
  projektId: string;
  /** Abschnitt initial aufgeklappt anzeigen (Standard: zugeklappt) */
  initialOffen?: boolean;
}

/**
 * Transparenter E-Mail-Verlauf eines Projekts: alle email_protokoll-Einträge
 * (Angebot, AB, Lieferschein, Rechnung, Mahnwesen) chronologisch mit Empfänger,
 * Zeitpunkt, Status und Testmodus-Kennzeichnung. Wiederverwendbar — eingebaut
 * u.a. in der Projektabwicklung unter den Dokument-Tabs.
 */
const ProjektEmailVerlauf = ({ projektId, initialOffen = false }: ProjektEmailVerlaufProps) => {
  const [offen, setOffen] = useState(initialOffen);
  const [eintraege, setEintraege] = useState<EmailProtokoll[]>([]);
  const [laedt, setLaedt] = useState(true);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const protokoll = await ladeEmailProtokoll(projektId);
      // Neueste zuerst (Service sortiert bereits absteigend nach gesendetAm)
      setEintraege(protokoll);
    } finally {
      setLaedt(false);
    }
  }, [projektId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const gesendete = eintraege.filter((e) => e.status === 'gesendet' && !istTestversand(e)).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 mt-6 overflow-hidden">
      {/* Kopfzeile (immer sichtbar, klappt den Verlauf auf/zu) */}
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900 dark:text-white">E-Mail-Verlauf</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {laedt
                ? 'Wird geladen…'
                : eintraege.length === 0
                ? 'Noch keine E-Mails zu diesem Projekt versendet.'
                : `${eintraege.length} E-Mail${eintraege.length === 1 ? '' : 's'} protokolliert · ${gesendete} erfolgreich an Kunden`}
            </div>
          </div>
        </div>
        {offen ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {offen && (
        <div className="border-t border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-end px-5 pt-3">
            <button
              type="button"
              onClick={() => void laden()}
              disabled={laedt}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${laedt ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>

          {laedt ? (
            <div className="flex items-center gap-2 px-5 py-6 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> E-Mail-Verlauf wird geladen…
            </div>
          ) : eintraege.length === 0 ? (
            <div className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">
              Für dieses Projekt wurden noch keine E-Mails versendet.
            </div>
          ) : (
            <div className="px-5 pb-4 pt-2 space-y-2 max-h-80 overflow-y-auto">
              {eintraege.map((eintrag, index) => {
                const test = istTestversand(eintrag);
                const erfolgreich = eintrag.status === 'gesendet';
                return (
                  <div
                    key={eintrag.$id || `${eintrag.gesendetAm}-${index}`}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/40"
                  >
                    {erfolgreich ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900 dark:text-white">
                          {TYP_LABEL[eintrag.dokumentTyp] || eintrag.dokumentTyp}
                          {eintrag.dokumentNummer ? ` ${eintrag.dokumentNummer}` : ''}
                        </span>
                        {test && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            <TestTube2 className="w-3 h-3" /> [TEST]
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                            erfolgreich
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}
                        >
                          {erfolgreich ? 'gesendet' : 'fehlgeschlagen'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                        an <span className="font-medium">{eintrag.empfaenger}</span> ·{' '}
                        {formatiereZeitpunkt(eintrag.gesendetAm)}
                      </div>
                      {!erfolgreich && eintrag.fehlerMeldung && (
                        <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                          {eintrag.fehlerMeldung}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjektEmailVerlauf;
