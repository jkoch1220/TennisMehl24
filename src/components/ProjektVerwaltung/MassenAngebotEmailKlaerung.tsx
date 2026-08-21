// Klärt vor dem Massenangebots-Lauf, an wen die Angebote gehen.
//
// Der Lauf schickt jedem Opt-in-Kunden genau eine Mail. Fehlt die Adresse, fällt
// der Kunde still heraus — er bekommt kein Angebot, und niemand merkt es bis zur
// nächsten Saison. Sind mehrere hinterlegt, entscheidet heute die Reihenfolge im
// Code, welche gewinnt. Beides wird hier vor dem Lauf ausgeräumt.
//
// Bewusst kein Automatismus: Ob `knut.christiansen@dhl.com` oder
// `tc-verein@web.de` der Vorstand ist, kann keine Regel entscheiden.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Mail, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, X, Plus } from 'lucide-react';
import { massenAngebotService } from '../../services/massenAngebotService';
import { EmailKlaerungsFall, EmailKandidat } from '../../types/massenAngebot';

const QUELLE_LABEL: Record<EmailKandidat['quelle'], string> = {
  kunde: 'Kundenstamm',
  rechnung: 'Rechnung',
  ansprechpartner: 'Ansprechpartner',
  projekt: 'Projekt',
};

const QUELLE_STIL: Record<EmailKandidat['quelle'], string> = {
  kunde: 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300',
  rechnung: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  ansprechpartner: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  projekt: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
};

const FallZeile = ({
  fall,
  gespeichert,
  onSpeichern,
}: {
  fall: EmailKlaerungsFall;
  gespeichert?: string[];
  onSpeichern: (kundeId: string, emails: string[]) => Promise<void>;
}) => {
  const [auswahl, setAuswahl] = useState<string[]>(gespeichert ?? fall.bisher);
  const [eigene, setEigene] = useState('');
  const [speichert, setSpeichert] = useState(false);

  const umschalten = (email: string) =>
    setAuswahl((prev) =>
      prev.some((e) => e.toLowerCase() === email.toLowerCase())
        ? prev.filter((e) => e.toLowerCase() !== email.toLowerCase())
        : [...prev, email]
    );

  const eigeneUebernehmen = () => {
    const wert = eigene.trim();
    if (!wert) return;
    if (!auswahl.some((e) => e.toLowerCase() === wert.toLowerCase())) {
      setAuswahl((prev) => [...prev, wert]);
    }
    setEigene('');
  };

  const speichern = async () => {
    setSpeichert(true);
    try {
      await onSpeichern(fall.kundeId, auswahl);
    } finally {
      setSpeichert(false);
    }
  };

  const erledigt = gespeichert !== undefined;
  const unveraendert =
    auswahl.length === fall.bisher.length &&
    auswahl.every((e) => fall.bisher.some((b) => b.toLowerCase() === e.toLowerCase()));

  return (
    <div
      className={`border rounded-lg p-3 ${
        erledigt
          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
          : fall.art === 'fehlt'
          ? 'border-red-200 dark:border-red-900 bg-white dark:bg-slate-800'
          : 'border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 dark:text-slate-100">{fall.kundenname}</span>
            {fall.kundennummer && (
              <span className="text-xs text-gray-400">{fall.kundennummer}</span>
            )}
            {erledigt ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" /> gespeichert
              </span>
            ) : fall.art === 'fehlt' ? (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                keine Adresse
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                {fall.kandidaten.length} zur Auswahl
              </span>
            )}
          </div>
          {fall.art === 'fehlt' && fall.kandidaten.length === 0 && (
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Im System ist nichts auffindbar — Adresse recherchieren und unten eintragen.
            </p>
          )}
        </div>

        <button
          onClick={speichern}
          disabled={speichert || (unveraendert && !erledigt && auswahl.length === 0)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
        >
          {speichert ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          {auswahl.length === 0 ? 'Leer speichern' : `${auswahl.length} übernehmen`}
        </button>
      </div>

      {fall.kandidaten.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1">
          {fall.kandidaten.map((k) => {
            const gewaehlt = auswahl.some((e) => e.toLowerCase() === k.email.toLowerCase());
            return (
              <label
                key={k.email}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={gewaehlt}
                  onChange={() => umschalten(k.email)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-emerald-600"
                />
                <span className="text-sm text-gray-900 dark:text-slate-100 break-all">{k.email}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${QUELLE_STIL[k.quelle]}`}>
                  {QUELLE_LABEL[k.quelle]}
                </span>
                {k.hinweis && (
                  <span className="text-xs text-gray-400 truncate">{k.hinweis}</span>
                )}
              </label>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input
          type="email"
          value={eigene}
          onChange={(e) => setEigene(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              eigeneUebernehmen();
            }
          }}
          placeholder="Weitere Adresse eintragen…"
          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100"
        />
        <button
          onClick={eigeneUebernehmen}
          disabled={!eigene.trim()}
          className="px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 disabled:opacity-40 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Hinzufügen
        </button>
      </div>

      {auswahl.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {auswahl.map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
            >
              {e}
              <button onClick={() => umschalten(e)} aria-label={`${e} entfernen`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const MassenAngebotEmailKlaerung = ({
  kundeIds,
  onFertig,
}: {
  kundeIds: string[];
  onFertig: () => void;
}) => {
  const [faelle, setFaelle] = useState<EmailKlaerungsFall[] | null>(null);
  const [laden, setLaden] = useState(false);
  const [fortschritt, setFortschritt] = useState<{ schritt: string; prozent: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState<Record<string, string[]>>({});
  const [suche, setSuche] = useState('');
  const [nurOffene, setNurOffene] = useState(true);

  const laden_ = useCallback(async () => {
    setLaden(true);
    setFehler(null);
    setFortschritt({ schritt: 'Starte…', prozent: 0 });
    try {
      const liste = await massenAngebotService.sammleEmailKlaerungsfaelle(kundeIds, (schritt, prozent) =>
        setFortschritt({ schritt, prozent })
      );
      setFaelle(liste);
      setGespeichert({});
    } catch (error) {
      console.error('E-Mail-Klärung konnte nicht geladen werden:', error);
      setFehler(error instanceof Error ? error.message : 'Unbekannter Fehler');
    } finally {
      setLaden(false);
      setFortschritt(null);
    }
  }, [kundeIds]);

  useEffect(() => {
    void laden_();
  }, [laden_]);

  const speichern = useCallback(async (kundeId: string, emails: string[]) => {
    await massenAngebotService.setzeAngebotsEmails(kundeId, emails);
    setGespeichert((prev) => ({ ...prev, [kundeId]: emails }));
  }, []);

  const gefiltert = useMemo(() => {
    if (!faelle) return [];
    const text = suche.trim().toLowerCase();
    return faelle.filter((f) => {
      if (nurOffene && gespeichert[f.kundeId] !== undefined) return false;
      if (!text) return true;
      return (
        f.kundenname.toLowerCase().includes(text) ||
        (f.kundennummer ?? '').toLowerCase().includes(text) ||
        f.kandidaten.some((k) => k.email.toLowerCase().includes(text))
      );
    });
  }, [faelle, suche, nurOffene, gespeichert]);

  const offenFehlt = faelle?.filter((f) => f.art === 'fehlt' && gespeichert[f.kundeId] === undefined).length ?? 0;
  const offenMehrdeutig = faelle?.filter((f) => f.art === 'mehrdeutig' && gespeichert[f.kundeId] === undefined).length ?? 0;
  const erledigt = Object.keys(gespeichert).length;

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-dark-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h3 className="font-semibold text-gray-900 dark:text-dark-text">Empfänger klären</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={laden_}
            disabled={laden}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 flex items-center gap-1.5 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${laden ? 'animate-spin' : ''}`} /> Neu prüfen
          </button>
          <button
            onClick={onFertig}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200"
          >
            Schließen
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-slate-400">
        Geprüft werden die {kundeIds.length} Kunden dieses Laufs. Wer hier steht, bekommt ohne
        Klärung entweder keine Mail oder eine an die falsche Adresse.
      </p>

      {laden && fortschritt && (
        <div className="text-sm text-gray-600 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {fortschritt.schritt}
          </div>
          <div className="mt-1.5 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${fortschritt.prozent}%` }}
            />
          </div>
        </div>
      )}

      {fehler && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{fehler}</span>
        </div>
      )}

      {faelle && !laden && (
        <>
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-300">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {offenFehlt} ohne Adresse
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {offenMehrdeutig} mehrdeutig
            </span>
            {erledigt > 0 && (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {erledigt} geklärt
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-gray-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={nurOffene}
                  onChange={(e) => setNurOffene(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-slate-600"
                />
                nur offene
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={suche}
                  onChange={(e) => setSuche(e.target.value)}
                  placeholder="Verein / Adresse…"
                  className="w-52 pl-7 pr-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {faelle.length === 0 ? (
            <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Bei allen {kundeIds.length} Kunden ist der Empfänger eindeutig. Nichts zu tun.
            </div>
          ) : gefiltert.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-slate-400 py-4 text-center">
              {nurOffene ? 'Alle Fälle geklärt.' : 'Kein Treffer.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto">
              {gefiltert.map((fall) => (
                <FallZeile
                  key={fall.kundeId}
                  fall={fall}
                  gespeichert={gespeichert[fall.kundeId]}
                  onSpeichern={speichern}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MassenAngebotEmailKlaerung;
